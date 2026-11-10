(() => {
  'use strict';
  // Загрузка профиля: ошибка чтения — честное сообщение, а не тихий fresh (п. 1.8).
  const loaded = State.load();
  let S = loaded.profile, initial = loaded.initial;
  let tab = 'base', screen = 'menu', selected = [], timer = null, paused = false, overlay = '', dialog = null, deploymentError = '';
  const loadError = loaded.error ? 'Сохранение нечитаемо, начата новая игра.' : '';
  let visualTime = 0, lastFrame = 0, menuTime = 0;
  let reduced = false;
  try { reduced = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { reduced = false; }
  if (reduced && typeof Arena.setReduced === 'function') Arena.setReduced(true);

  const el = s => document.querySelector(s);
  const cash = (v, exact) => GameUI.money(v, exact);
  const h = Screens.h;

  /* Намерения интерфейса для чистого движка боя. */
  function uiState() {
    return {
      screen, tab, paused, dialog, selected,
      overlay: overlay || (dialog ? 'dialog' : ''),
      deploymentError, loadError, raid: !!S.raid,
      hidden: typeof document !== 'undefined' ? !!document.hidden : false
    };
  }

  function save() {
    const status = State.save(S);
    const notice = document.querySelector('#notice');
    if (notice) notice.textContent = status === 'ok' ? (loadError ? 'СОХРАНЕНИЕ НЕЧИТАЕМО · НАЧАТА НОВАЯ ИГРА' : 'АВТОСОХРАНЕНИЕ АКТИВНО') : 'ХРАНИЛИЩЕ НЕДОСТУПНО · ЭКСПОРТИРУЙТЕ JSON';
  }

  function render() {
    Input.stopUpgradeHold(false);
    const focus = GameUI.capture();
    const nav = document.querySelector('nav'), app = el('#app');
    if (!app) return;
    nav.hidden = screen !== 'game';
    el('#resources').innerHTML = `<span class="wallet-label">КРЕДИТЫ БАЗЫ</span><strong>₡ ${cash(S.res.credits, screen === 'result' && overlay === 'win')}</strong>`;
    const ui = uiState();
    let html;
    if (screen === 'menu') html = Screens.menu(S, ui);
    else if (screen === 'result') html = Screens.result(S, ui);
    else if (screen === 'stats') html = Screens.stats(S, ui);
    else {
      document.querySelectorAll('nav [data-tab]').forEach(b => { b.classList.toggle('active', b.dataset.tab === tab); b.setAttribute('aria-current', b.dataset.tab === tab ? 'page' : 'false'); });
      const raidTab = document.querySelector('nav [data-tab="raid"]');
      if (raidTab) raidTab.textContent = S.raid ? 'Экспедиция · ' + S.raid.depth : 'Экспедиция';
      html = (S.raid && tab !== 'raid' ? '<div class="raid-reminder"><span>Экспедиция приостановлена, пока открыт этот экран.</span><button data-action="resume">Вернуться к отряду →</button></div>' : '') +
        (tab === 'base' ? Screens.base(S, ui) : tab === 'squad' ? Screens.squad(S, ui) : tab === 'raid' ? Screens.raid(S, ui) : Screens.save(S, ui));
    }
    app.innerHTML = html + Screens.dialog(ui);
    Input.bind();
    GameUI.restore(focus);
    if (screen === 'stats') Screens.drawStats(app, S);
    // Арену рисует только animate() — одна отрисовка на кадр (п. 1.2).
  }

  /* Точечное обновление экрана рейда: без пересборки каркаса, фокус не теряется. */
  function refreshRaid() {
    if (!(screen === 'game' && tab === 'raid' && S.raid)) { render(); return; }
    const ui = uiState(), app = el('#app');
    const set = (sel, html) => { const node = app.querySelector(sel); if (!node) return false; node.innerHTML = html; return true; };
    const r = S.raid;
    const ok = set('#raid-hud', Screens.hudHtml(S, ui)) &&
      set('#route-track', Screens.routeTrackHtml(r)) &&
      set('#sector-status', Screens.statusHtml(S, ui)) &&
      set('#raid-event-wrap', Screens.eventHtml(S)) &&
      set('#raid-log', Screens.logHtml(S)) &&
      set('#raid-crew', r.crew.map(c => GameUI.healthRow(c.name, c.hp, c.maxHp || c.hp)).join('')) &&
      set('#raid-foes', (r.foes || []).filter(e => e.hp > 0).map(e => GameUI.healthRow(Battle.foeName(e), e.hp, e.maxHp, true)).join('') || '<p>Контакт отсутствует.</p>') &&
      set('#raid-kits', Screens.kitsHtml(r)) &&
      set('#raid-loot', 'Добыча: ' + cash(r.loot) + ' кредитов');
    const wallet = el('#resources strong');
    if (wallet) wallet.textContent = '₡ ' + cash(S.res.credits);
    const raidTab = document.querySelector('nav [data-tab="raid"]');
    if (raidTab) raidTab.textContent = S.raid ? 'Экспедиция · ' + S.raid.depth : 'Экспедиция';
    if (!ok) render();
  }

  function restartTimer() { clearInterval(timer); timer = S.raid ? setInterval(tick, Balance.raid.tickMs / S.raid.speed) : null; }

  function changeSpeed(value) {
    S.settings = { speed: Automation.validSpeed(value) };
    if (S.raid) { Automation.changeSpeed(S.raid, S.settings.speed); restartTimer(); }
    save(); render();
  }
  function cycleSpeed() { const speed = Automation.validSpeed(S.settings?.speed); changeSpeed(speed === 1 ? 2 : speed === 2 ? 4 : 1); }

  function stepCheckpoint(ms) {
    const res = Battle.stepCheckpoint(S, uiState(), ms);
    if (res.choice) { chooseRoute(res.choice); return; }
    if (res.changed) {
      save();
      const label = el('#auto-countdown');
      if (label) label.textContent = Screens.autoMessage(S, uiState());
    }
  }

  function chooseRoute(key) {
    if (!Battle.chooseRoute(S, key)) return false;
    Arena.reset();
    overlay = '';
    save(); render();
    return true;
  }

  function showResult(ok) {
    clearInterval(timer); timer = null;
    Arena.reset();
    selected = []; paused = true; overlay = ok ? 'win' : 'dead'; dialog = null; screen = 'result';
    save(); render();
  }

  function tick() {
    const res = Battle.tick(S, uiState());
    if (res.status === 'idle') return;
    if (res.status === 'checkpoint') { Automation.ensure(S.raid); save(); render(); return; }
    if (res.status === 'advance') { Arena.reset(); save(); render(); return; }
    if (res.status === 'transition') { save(); refreshRaid(); return; }
    // Всё, кроме финала рейда, играется очередью (эффекты видны на арене);
    // defeat сразу уводит экран в итоги — там очередь всё равно сбрасывается.
    if (res.events.length) Arena.emit(res.events, Balance.raid.fxSpan, res.status === 'defeat');
    if (res.status === 'defeat') { Battle.finish(S, false); showResult(false); return; }
    if (res.status === 'cleared') {
      const r = S.raid;
      if (r.depth % Balance.raid.checkpointEvery === 0) { overlay = 'room'; Automation.ensure(r); save(); render(); }
      else { save(); refreshRaid(); }
      return;
    }
    save(); refreshRaid();
  }

  function start() {
    if (S.raid) { resumeRaid(); return; }
    const res = Battle.deploy(S, selected);
    if (!res.ok) {
      deploymentError = res.reason === 'funds'
        ? 'Не хватает кредитов на аптечки. Уменьшите запас или выберите 0 — высадка без припасов бесплатна.'
        : '';
      screen = 'game'; tab = 'squad';
      render(); return;
    }
    deploymentError = ''; selected = res.crew;
    paused = false; overlay = ''; dialog = null;
    tab = 'raid'; screen = 'game';
    Arena.reset();
    save(); render(); restartTimer();
  }

  function resumeRaid() {
    if (!S.raid) return;
    screen = 'game'; tab = 'raid'; paused = false; dialog = null;
    S.settings = S.settings || { speed: Automation.validSpeed(S.raid.speed) };
    S.raid.speed = S.settings.speed;
    overlay = S.raid.cleared && S.raid.depth % Balance.raid.checkpointEvery === 0 ? 'room' : '';
    Automation.ensure(S.raid);
    Arena.reset();
    restartTimer(); render();
  }

  function pick(index) {
    if (S.raid) return;
    selected = State.pick(selected, S.recruits, index);
    render();
  }
  function autoSquad() { if (S.raid) return; selected = State.autoPick(S.recruits); render(); }

  function hire(free, requested) {
    if (!free && S.res.credits < Balance.hiring.cost) return;
    if (!free) S.res.credits -= Balance.hiring.cost;
    State.recruit(S, free, requested);
    deploymentError = '';
    save(); render();
  }

  function heal(index) {
    const res = State.healRecruit(S, index, S.buildings.medbay);
    if (res.ok) { save(); render(); }
  }

  function setPrep(key, value) {
    if (S.raid) return;
    S.prep = Preparation.normalize({ ...S.prep, [key]: value }, S.buildings.medbay);
    deploymentError = '';
    save(); render();
  }

  function setTab(next) { tab = next; render(); }

  async function importFile(file) {
    if (!file) return;
    try {
      S = State.importJson(await file.text());
      selected = []; deploymentError = '';
      clearInterval(timer); timer = null; paused = false; overlay = ''; dialog = null;
      screen = 'menu'; tab = 'base';
      Arena.reset();
      save(); render();
    } catch {
      dialog = { kind: 'alert', eyebrow: 'ИМПОРТ', title: 'Сохранение не загружено', body: 'Файл повреждён или версия сохранения не поддерживается.', confirm: 'Понятно' };
      render();
    }
  }

  function runNewGame() {
    const speed = Automation.validSpeed(S.settings?.speed);
    clearInterval(timer); timer = null;
    S = State.fresh(); S.settings.speed = speed;
    selected = []; paused = false; overlay = ''; dialog = null; deploymentError = '';
    screen = 'menu'; tab = 'base';
    Arena.reset();
    save(); render();
  }

  function runAbort() {
    dialog = null;
    if (S.raid) { clearInterval(timer); timer = null; Battle.finish(S, false); if (S.lastResult) S.lastResult.aborted = true; showResult(false); }
    else render();
  }

  /* Покупка улучшений (вызывается из Input, включая режим удержания). */
  function purchaseUpgrade(key, refresh = true) {
    if (screen !== 'game' || tab !== 'base' || document.hidden) return false;
    const cost = Balance.buildings.cost * S.buildings[key];
    if (!Number.isFinite(cost) || cost <= 0 || S.res.credits < cost) return false;
    S.res.credits -= cost; S.buildings[key]++;
    save();
    if (refresh) render();
    return true;
  }

  function buyUpgrades(key) {
    if (screen !== 'game' || tab !== 'base' || document.hidden) return;
    const keys = Object.keys(Screens.buildingNames).filter(name => (key === undefined || key === name) && Number.isSafeInteger(S.buildings[name]) && S.buildings[name] > 0);
    if (!keys.length) return;
    const unit = Balance.buildings.cost;
    const budget = S.res.credits;
    const lowest = Math.min(...keys.map(name => S.buildings[name]));
    const costToLevel = (name, target) => {
      const current = S.buildings[name], count = Math.max(0, target - current);
      return unit * count * (2 * current + count - 1) / 2;
    };
    let low = 0, high = Math.ceil(Math.sqrt(budget / (unit / 2)));
    while (low < high) {
      const steps = low + Math.ceil((high - low) / 2);
      const total = keys.reduce((sum, name) => sum + costToLevel(name, lowest + steps), 0);
      if (total <= budget) low = steps; else high = steps - 1;
    }
    const target = lowest + low;
    for (const name of keys) {
      S.res.credits -= costToLevel(name, target);
      S.buildings[name] = Math.max(S.buildings[name], target);
    }
    for (const name of keys) {
      if (S.buildings[name] === target && S.res.credits >= unit * target) {
        S.res.credits -= unit * target;
        S.buildings[name]++;
      }
    }
    if (S.res.credits !== budget) { save(); render(); }
  }

  function openDialog(spec) { dialog = spec; render(); }

  /* Диспетчер действий UI. */
  function action(a, btn) {
    if (a.startsWith('buy-max-')) { buyUpgrades(a.slice(8)); return; }
    switch (a) {
      case 'buy-all': buyUpgrades(); break;
      case 'auto-squad': autoSquad(); break;
      case 'clear-squad': if (!S.raid) { selected = []; render(); } break;
      case 'menu': dialog = null; screen = 'menu'; render(); break;
      case 'open-base': screen = 'game'; tab = 'base'; render(); break;
      case 'stats': screen = 'stats'; render(); break;
      case 'menusettings': screen = 'game'; tab = 'save'; render(); break;
      case 'import': { const input = el('#import'); if (input) input.click(); break; }
      case 'hire': hire(false); break;
      case 'vagrant': hire(true); break;
      case 'start': start(); break;
      case 'resume': resumeRaid(); break;
      case 'heal': heal(Number(btn && btn.dataset.index)); break;
      case 'route-safe': chooseRoute('safe'); break;
      case 'route-risk': chooseRoute('risk'); break;
      case 'extract': if (Battle.extract(S, uiState())) showResult(true); break;
      case 'dismiss': screen = 'game'; overlay = ''; paused = false; dialog = null; tab = 'base'; render(); break;
      case 'pause': paused = !paused; render(); break;
      case 'speed': cycleSpeed(); break;
      case 'speed-1': changeSpeed(1); break;
      case 'speed-2': changeSpeed(2); break;
      case 'speed-4': changeSpeed(4); break;
      case 'cancel-auto': if (S.raid) { S.raid.autoCancelled = true; save(); render(); } break;
      case 'export': {
        const url = URL.createObjectURL(new Blob([State.exportJson(S)], { type: 'application/json' }));
        const link = document.createElement('a'); link.href = url; link.download = 'outpost-save.json'; link.click();
        URL.revokeObjectURL(url);
        break;
      }
      case 'new':
        openDialog({ kind: 'confirm', eyebrow: 'СБРОС ПРОГРЕССА', title: 'Начать новую игру?', body: 'Текущее сохранение будет заменено: база, бойцы и рейд обнулятся.', confirm: 'Начать заново', danger: true, command: 'new' });
        break;
      case 'newrun':
        openDialog({ kind: 'confirm', eyebrow: 'ЭКСПЕДИЦИЯ', title: 'Прервать текущую экспедицию?', body: 'Отряд вернётся с ранениями, собранный груз пойдёт в частичном объёме, погибшие останутся исключёнными.', confirm: 'Прервать рейд', danger: true, command: 'newrun' });
        break;
      case 'dialog-cancel': dialog = null; render(); break;
      case 'dialog-confirm': {
        const command = dialog && dialog.command;
        dialog = null;
        if (command === 'new') runNewGame();
        else if (command === 'newrun') runAbort();
        else render();
        break;
      }
      case 'hire-assault': hire(false, 'assault'); break;
      case 'hire-heavy': hire(false, 'heavy'); break;
      case 'hire-medic': hire(false, 'medic'); break;
      case 'hire-engineer': hire(false, 'engineer'); break;
    }
  }

  let visualActive = false;
  function animate(now) {
    if (!lastFrame) lastFrame = now;
    const elapsed = Math.max(0, Math.min(250, now - lastFrame)), dt = Math.min(0.05, elapsed / 1000);
    lastFrame = now;
    stepCheckpoint(elapsed);
    if (screen === 'menu') {
      const canvas = el('#menu-demo');
      if (canvas) { if (!reduced) menuTime += dt; Arena.demo(canvas, menuTime, reduced); }
    }
    if (screen === 'game' && tab === 'raid' && S.raid) {
      const active = !paused && !overlay && !S.raid.cleared;
      if (active && !reduced) visualTime += dt * (S.raid.speed || 1);
      Arena.render(el('#arena'), S.raid, visualTime, active && !reduced);
    }
    requestAnimationFrame(animate);
  }

  window.Game = {
    action, setTab, pick, autoSquad, heal, setPrep, importFile, render,
    profile: () => S, uiState, purchaseUpgrade, buyUpgrades, start, resumeRaid, save,
    tick, stepCheckpoint, chooseRoute, showResult, hire, restartTimer
  };

  if (initial) { State.recruit(S, false); State.recruit(S, false); save(); }
  render();requestAnimationFrame(animate);
})();