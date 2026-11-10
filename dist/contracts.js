/* Контракты (п. 3.1 плана): генерация, прогресс по событиям боя и finish(),
   награда кредитами или предметом. Чистый модуль, состояние — в профиле (S.contracts). */
window.Contracts = (() => {
  const CFG = Balance.contracts;
  // Типы врагов без босса: индексы совпадают с Battle.enemies 0..4.
  const FOE_NAMES = ['Личинка', 'Ползун', 'Плевальщик', 'Панцирник', 'Узел гнезда'];
  const kinds = ['kill', 'depth', 'loot', 'evac'];
  let seq = 0;

  const int = n => Math.max(0, Math.floor(Number(n) || 0));
  const span = (roll, rng) => rng.min + Math.floor(roll() * (rng.max - rng.min + 1));
  const nextId = roll => 'c' + Date.now().toString(36) + '-' + (seq++).toString(36) + Math.floor(roll() * 1296).toString(36);

  function generate(roll) {
    roll = typeof roll === 'function' ? roll : Math.random;
    const kind = kinds[Math.floor(roll() * kinds.length)];
    const c = { id: nextId(roll), kind, progress: 0, target: 0, foeType: null, reward: null };
    if (kind === 'kill') { c.target = span(roll, CFG.kill); c.foeType = Math.floor(roll() * FOE_NAMES.length); }
    else if (kind === 'depth') c.target = span(roll, CFG.depth);
    else if (kind === 'loot') c.target = span(roll, CFG.loot);
    else c.target = span(roll, CFG.evac);
    c.reward = roll() >= CFG.itemChance
      ? { kind: 'credits', amount: span(roll, { min: CFG.creditMin, max: CFG.creditMax }) }
      : { kind: 'item' };
    return c;
  }

  function ensure(S, roll) {
    if (!S) return [];
    if (!Array.isArray(S.contracts)) S.contracts = [];
    while (S.contracts.length < CFG.max) S.contracts.push(generate(roll));
    return S.contracts;
  }

  /* Прогресс по событиям боя (п. 1.3): убийства нужного типа. */
  function onEvent(S, e) {
    if (!S || !Array.isArray(S.contracts) || !e || e.t !== 'kill' || e.side !== 'foe' || !e.target) return;
    for (const c of S.contracts) {
      if (c.kind === 'kill' && c.progress < c.target && e.target.type === c.foeType) c.progress++;
    }
  }

  /* Прогресс по завершению рейда: глубина/груз за один рейд, число эвакуаций.
     Возвращает выполненные контракты (уже убранные из списка). Награду выдаёт claim(). */
  function onFinish(S, result) {
    if (!S) return [];
    if (!Array.isArray(S.contracts)) S.contracts = [];
    const res = result || {};
    const depth = int(res.depth);
    const cargo = res.loot ? int(res.loot.cargo) : 0;
    const success = !!res.ok;
    for (const c of S.contracts) {
      if (c.kind === 'depth') c.progress = Math.max(c.progress, depth);
      else if (c.kind === 'loot') c.progress = Math.max(c.progress, cargo);
      else if (c.kind === 'evac' && success) c.progress++;
    }
    const done = S.contracts.filter(c => c.progress >= c.target);
    S.contracts = S.contracts.filter(c => c.progress < c.target);
    return done;
  }

  /* Выдача награды за выполненные контракты и добор новых. */
  function claim(S, completed, roll) {
    const list = Array.isArray(completed) ? completed : [];
    if (!S) return list;
    for (const c of list) {
      if (c.reward && c.reward.kind === 'item') { if (typeof State !== 'undefined' && State.addItem) State.addItem(S, null); }
      else S.res.credits += (c.reward && c.reward.amount) || 0;
    }
    ensure(S, roll);
    return list;
  }

  const describe = c => {
    if (!c) return '';
    if (c.kind === 'kill') return 'Уничтожить ' + c.target + ' × ' + (FOE_NAMES[c.foeType] || 'враг');
    if (c.kind === 'depth') return 'Дойти до глубины ' + c.target + ' за один рейд';
    if (c.kind === 'loot') return 'Собрать ' + c.target + ' кредитов за один рейд';
    return 'Эвакуироваться ' + c.target + ' раз';
  };
  const rewardText = c => (c && c.reward && c.reward.kind === 'item') ? 'Предмет' : '₡ ' + ((c && c.reward && c.reward.amount) || 0);
  const progressText = c => Math.min(c.progress, c.target) + ' / ' + c.target;
  const ratio = c => c.target > 0 ? Math.max(0, Math.min(1, c.progress / c.target)) : 0;

  return { CFG, FOE_NAMES, kinds, generate, ensure, onEvent, onFinish, claim, describe, rewardText, progressText, ratio };
})();
