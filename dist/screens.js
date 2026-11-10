/* HTML-экраны игры (п. 1.2 плана): меню, база, отряд, рейд, итоги,
   статистика, диалоги. Чистые шаблоны без прямых обращений к document
   (кроме drawStats — рисование графиков по готовому контейнеру). */
window.Screens = (() => {
  const h = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const cash = (v, exact) => GameUI.money(v, exact);
  const classes = { assault: 'Штурмовик', heavy: 'Тяжёлый', medic: 'Медик', engineer: 'Инженер', vagrant: 'Бродяга' };
  const classHelp = { assault: 'Усиленная очередь каждый третий ход', heavy: 'Принимает удары и снижает входящий урон', medic: 'Лечит раненых каждый третий ход', engineer: 'Дополнительный урон от огневой поддержки', vagrant: 'Бесплатный боец без брони' };
  const buildingNames = { barracks: 'Казармы', armory: 'Арсенал', medbay: 'Медблок', command: 'Командный центр' };

  const hpTier = (hp, max) => { const pct = Math.max(0, Math.min(100, (hp / Math.max(1, max)) * 100)); return pct > 60 ? 'high' : pct >= 30 ? 'mid' : 'low'; };

  const SLOT_NAMES = { weapon: 'Оружие', armor: 'Броня', gadget: 'Гаджет' };

  /* События с выбором в комнате (п. 3.5): единый источник вариантов для экрана и авто-выбора. */
  const ROOM_EVENTS = {
    container: { title: 'ЗАПЕЧАТАННЫЙ КОНТЕЙНЕР', body: 'В переборке застрял армейский контейнер с целыми пломбами. За ним может ждать снаряжение — или то, что его охраняет.', options: [['open', 'Вскрыть контейнер'], ['pass', 'Пройти мимо']] },
    radio: { title: 'РАДИОСТАНЦИЯ', body: 'Уцелевший ретранслятор ещё ловит позывные КОРПУСА ВНЕШНЕЙ ОБОРОНЫ. Можно запросить поддержку или не выдавать позицию.', options: [['call', 'Вызвать поддержку (+аптечка)'], ['silent', 'Сохранять молчание']] },
    tunnel: { title: 'ОБХОДНОЙ ТОННЕЛЬ', body: 'В стене открыт технический тоннель: можно проскочить следующий сектор, но без добычи и без зачистки.', options: [['go', 'Пройти тоннелем (пропустить сектор)'], ['main', 'Держаться основного пути']] }
  };
  const roomOptions = kind => (ROOM_EVENTS[kind] ? ROOM_EVENTS[kind].options.map(o => o[0]) : []);

  /* Отсчёт авто-выбора диалогового окна (п. 3.5): 15 с на ×1, 5 с на ×2/×4. */
  const overlaySeconds = (s, r) => {
    const ms = Number.isFinite(r && r.overlayRemainingMs) ? r.overlayRemainingMs : Automation.duration(Automation.validSpeed(s.settings && s.settings.speed));
    return Math.max(0, Math.ceil(ms / 1000));
  };
  const overlayMessage = (r, seconds) => (r && r.story ? 'Продолжение через ' : 'Автовыбор через ') + seconds + ' с';

  /* Строка-описание предмета для выпадающего списка снаряжения. */
  function itemLabel(item) {
    const def = State.itemDef(item);
    if (!def) return State.itemName(item);
    const bits = [];
    if (def.atk) bits.push((def.atk > 0 ? '+' : '') + def.atk + ' урон');
    if (def.armor) bits.push((def.armor > 0 ? '+' : '') + def.armor + ' броня');
    if (def.kit) bits.push('+' + def.kit + ' к аптечкам');
    if (def.find) bits.push('+' + Math.round(def.find * 100) + '% находок');
    if (def.boss) bits.push('+' + def.boss + ' по боссам');
    if (def.pierce) bits.push('+' + def.pierce + ' пробития');
    if (def.grenade) bits.push('граната ' + def.grenade);
    if (def.beacon) bits.push('спасает от смерти');
    if (def.classReq) bits.push('только ' + (classes[def.classReq] || def.classReq));
    return def.name + (bits.length ? ' · ' + bits.join(', ') : '');
  }

  /* Полоса опыта и звание (ранг = уровень − 1). */
  function xpTrack(member) {
    const p = Progression.xpProgress(member.xp);
    const label = p.need ? p.into + ' / ' + p.need + ' XP' : 'максимум';
    return `<div class="xp-line"><span class="xp-rank">Ур. ${p.level} · ${Progression.ranks[p.level - 1]}</span><div class="xp-track" role="img" aria-label="Опыт ${label}"><span style="width:${Math.round(p.ratio * 100)}%"></span></div><span class="xp-value">${label}</span></div>`;
  }

  /* Блок «Снаряжение»: три слота-списка и починка изношенного.
     Одинаковые предметы (один ключ и одинаковая целая прочность) «стакаются»
     в одну строку с числом штук: «… · 10/10 (×5)». */
  function gearBlock(s, member, index, deployed) {
    const items = s.items || [];
    const otherOwner = id => { const o = State.gearOwner(s, id); return o && o.recruit !== member ? o.recruit.name : null; };
    const slots = ['weapon', 'armor', 'gadget'].map(slot => {
      const equipped = member.gear && member.gear[slot];
      const groups = [], byKey = new Map();
      for (const it of items) {
        const def = State.itemDef(it);
        if (!def || def.type !== slot) continue;
        if (def.classReq && def.classReq !== member.class) continue;
        const dur = State.itemDurability(it);
        const groupKey = it.key + '@' + dur;
        let group = byKey.get(groupKey);
        if (!group) { group = { def, dur, items: [] }; byKey.set(groupKey, group); groups.push(group); }
        group.items.push(it);
      }
      const opts = groups.map(group => {
        const selected = group.items.some(it => it.id === equipped);
        const rep = selected ? group.items.find(it => it.id === equipped) : group.items[0];
        const owner = otherOwner(rep.id);
        const count = group.items.length > 1 ? ' (×' + group.items.length + ')' : '';
        const label = itemLabel(rep) + ' · ' + group.dur + '/' + group.def.durability + (group.dur === 0 ? ' · сломан' : '') + count + (owner ? ' (у ' + owner + ')' : '');
        return `<option value="${rep.id}" ${selected ? 'selected' : ''}>${h(label)}</option>`;
      }).join('');
      const cur = equipped ? State.findItem(s, equipped) : null;
      const cost = cur ? State.repairCost(cur) : 0;
      return `<div class="gear-slot"><span class="gear-slot-name">${SLOT_NAMES[slot]}</span><select id="gear-${index}-${slot}" data-gear="${slot}" data-index="${index}" ${deployed ? 'disabled' : ''} aria-label="${SLOT_NAMES[slot]}"><option value="">— пусто —</option>${opts}</select>${cost > 0 ? `<button type="button" class="gear-repair" id="repair-${index}-${slot}" data-action="repair" data-item="${equipped}" ${deployed || s.res.credits < cost ? 'disabled' : ''}>Починить · ₡ ${cash(cost)}</button>` : ''}</div>`;
    }).join('');
    return `<div class="gear-block"><span class="gear-title">Снаряжение</span>${slots}</div>`;
  }

  /* Выбор перка на уровнях 2 и 4 (в карточке и в итогах). */
  function perkPicker(member, index) {
    if (!member || State.pendingPerks(member) <= 0) return '';
    const options = Object.entries(Balance.perks.list).filter(([k]) => !(member.perks || []).includes(k))
      .map(([k, p]) => `<button type="button" class="perk-option" data-action="perk" data-index="${index}" data-perk="${k}"><strong>${h(p.name)}</strong><span>${h(p.text)}</span></button>`).join('');
    return `<div class="perk-picker"><span class="perk-title">Новый уровень · выберите перк (${(member.perks || []).length}/${Balance.perks.max})</span><div class="perk-options">${options}</div></div>`;
  }

  /* Действия рейда: граната, отступление, прикрытие отхода. */
  function raidActionsHtml(s, ui) {
    const r = s.raid;
    if (!r) return '';
    const alive = r.crew.some(c => c.hp > 0);
    return `<div class="raid-actions"><button data-action="grenade" ${Battle.canGrenade(s) ? '' : 'disabled'} title="15 урона всем живым врагам, один раз за бой">Граната</button><button data-action="retreat" ${alive ? '' : 'disabled'}>Отступить</button>${Battle.canCover(s) ? '<button class="danger" data-action="cover" title="Самый раненый остаётся прикрывать отход">Прикрыть отход</button>' : ''}</div>`;
  }

  /* Плашка модификатора сектора в HUD рейда (п. 3.4). */
  function modifierHtml(r) {
    const m = r && r.modifier && Balance.modifiers.list[r.modifier];
    if (!m) return '';
    return `<span class="modifier-badge" title="${h(m.text)}">МОДИФИКАТОР: ${h(m.name)}</span>`;
  }

  /* Панель контрактов на базе (п. 3.1). */
  function contractsHtml(s) {
    const list = Array.isArray(s.contracts) ? s.contracts : [];
    const cards = list.map(c => `<article class="contract"><div class="row"><h4>${h(Contracts.describe(c))}</h4><span class="tag">${h(Contracts.rewardText(c))}</span></div><div class="contract-progress" role="img" aria-label="Прогресс ${Contracts.progressText(c)}"><span style="width:${Math.round(Contracts.ratio(c) * 100)}%"></span></div><span class="muted">${Contracts.progressText(c)}</span></article>`).join('');
    return `<section class="panel contracts-panel"><div class="section-heading"><div><small>КОНТРАКТЫ КОРПУСА</small><h3>Задания внешней обороны</h3></div><span class="muted">До ${Balance.contracts.max} активных</span></div><div class="contracts">${cards || '<p class="muted">Контракты появятся после возвращения на базу.</p>'}</div><p class="muted">Прогресс обновляется по событиям боя и итогам рейда. Выполненные контракты заменяются новыми, награда уходит на базу.</p></section>`;
  }

  /* Диалог события с выбором в комнате (п. 3.5). */
  function roomEventHtml(s, ui) {
    const r = s.raid;
    if (!r || !r.roomEvent) return '';
    const spec = ROOM_EVENTS[r.roomEvent.kind];
    if (!spec) return '';
    const buttons = spec.options.map(([code, label]) => `<button data-action="room-${code}">${h(label)}</button>`).join('');
    const countdown = `<p class="muted overlay-countdown" id="overlay-countdown" role="status">${overlayMessage(r, overlaySeconds(s, r))}</p>`;
    return `<div class="overlay dialog-overlay"><div class="dialog" role="dialog" aria-modal="true" aria-labelledby="dialog-title"><small>СЕКТОР ${r.depth} · РЕШЕНИЕ КОМАНДИРА</small><h2 id="dialog-title">${spec.title}</h2><p>${spec.body}</p>${countdown}<div class="actions">${buttons}</div></div></div>`;
  }

  /* Диалог сюжетной вставки по вехе глубины (п. 3.2). */
  function storyHtml(s) {
    const r = s.raid, entry = r && r.story;
    if (!entry) return '';
    const countdown = `<p class="muted overlay-countdown" id="overlay-countdown" role="status">${overlayMessage(r, overlaySeconds(s, r))}</p>`;
    return `<div class="overlay dialog-overlay"><div class="dialog story-dialog" role="dialog" aria-modal="true" aria-labelledby="dialog-title"><small>ЗАПИСЬ ПОСТА «КОВЧЕГ»</small><h2 id="dialog-title">${h(entry.title)}</h2><p>${h(entry.text)}</p>${countdown}<div class="actions"><button class="primary" data-action="story-continue">Продолжить →</button></div></div></div>`;
  }

  function menu(s, ui) {
    return `<div class="menu-stage"><canvas id="menu-demo" width="800" height="350" aria-hidden="true"></canvas><div class="menu-dim" aria-hidden="true"></div>
 <div class="title-screen"><div class="title-mark">XENOCIDE<br><strong>OUTPOST</strong></div><p>ПОСТ «КОВЧЕГ» · ВНЕШНИЙ ПЕРИМЕТР</p>
 ${ui.loadError ? `<p class="warn" role="alert">${h(ui.loadError)}</p>` : ''}
 <div class="actions">${s.raid ? '<button class="primary" data-action="resume">Продолжить экспедицию</button>' : ''}<button data-action="open-base">${s.raid ? 'Открыть базу' : 'Перейти на базу →'}</button><button data-action="stats">Статистика</button><button data-action="menusettings">Сохранения</button></div>
 <small>${s.raid ? 'РЕЙД СОХРАНЁН · СЕКТОР ' + s.raid.depth : 'СФОРМИРУЙТЕ ОТРЯД И ОТПРАВЬТЕ ЕГО ЗА РЕСУРСАМИ'} · ВЕРСИЯ ${Balance.version}</small></div></div>`;
  }

  function base(s, ui) {
    const cost = Balance.buildings.cost;
    return `<div class="page-heading"><div><small>ОПЕРАЦИОННЫЙ ЦЕНТР</small><h2>Пост «Ковчег»</h2></div><button class="primary" data-${s.raid ? 'action="resume"' : 'tab="squad"'}>${s.raid ? 'Вернуться к экспедиции' : 'Подготовить отряд →'}</button></div>` + BaseScene.html(s.buildings) + `<div class="base-metrics"><div><span>Бойцов на базе</span><strong>${s.recruits.length}</strong></div><div><span>Максимальная глубина</span><strong>${s.deepest}</strong></div><div><span>Завершено рейдов</span><strong>${s.run}</strong></div></div>${contractsHtml(s)}<section class="panel"><div class="section-heading"><div><small>РАЗВИТИЕ БАЗЫ</small><h3>Здания и улучшения</h3><button class="bulk-upgrade" data-action="buy-all" ${Object.keys(buildingNames).some(key => s.res.credits >= cost * s.buildings[key]) ? '' : 'disabled'}>Купить на всё</button></div><span class="muted">Общая покупка сначала улучшает здания с самым низким уровнем.</span></div><div class="buildings">${Object.entries(buildingNames).map(([key, name]) => { const level = s.buildings[key], price = cost * level; return `<article class="building" id="building-${key}" tabindex="-1"><div class="row"><h3>${name}</h3><span class="tag">Ур. ${level} → ${level + 1}</span></div><p class="upgrade-current"><b>Сейчас</b><br>${Progression.describe(key, level)}</p><div class="upgrade-benefit"><b>Следующий уровень</b><br>${Progression.describe(key, level + 1)}</div><button class="wide" data-up="${key}" ${s.res.credits < price ? 'disabled' : ''}>Улучшить · ₡ ${cash(price)}</button><button class="wide bulk-upgrade" data-action="buy-max-${key}" ${s.res.credits < price ? 'disabled' : ''}>Прокачать на всю сумму</button><span class="cost-hint">${s.res.credits < price ? 'Не хватает ₡ ' + cash(price - s.res.credits) : 'Кредитов достаточно'}</span></article>`; }).join('')}</div></section>`;
  }

  function squad(s, ui) {
    const deployed = !!s.raid, selected = ui.selected || [];
    const crew = deployed ? s.raid.crew : selected.map(i => s.recruits[i]);
    const cost = s.raid ? (s.raid.kitsBought || 0) * (s.raid.kitPrice || 12) : Preparation.cost(s.prep, s.buildings.medbay);
    const cards = s.recruits.map((r, i) => {
      const max = r.maxHp || r.hp, sel = selected.includes(i);
      const pickDisabled = deployed || (!sel && selected.length >= Balance.squad.size);
      const price = State.healCost(max, r.hp, s.buildings.medbay);
      const healDisabled = r.hp >= max || s.res.credits < price;
      const label = r.hp >= max ? 'Здоров' : 'Лечить · ₡ ' + cash(price);
      return `<div class="crew-card ${sel ? 'selected' : ''}">
 <button type="button" class="crew-select" data-pick="${i}" aria-pressed="${sel}" ${pickDisabled ? 'disabled' : ''}>
  <span class="crew-card-head"><span class="class-icon ${r.class}">${classes[r.class].slice(0, 1)}</span><span><strong>${h(r.name)}</strong><span class="muted">${classes[r.class]} · ${Progression.ranks[Progression.xpLevel(r.xp) - 1]}</span></span><span class="pick-mark">${sel ? '✓' : '+'}</span></span>
  <span class="crew-stats"><span><b>${Math.ceil(r.hp)} / ${max}</b> HP</span><span><b>${r.atk}</b> урон</span><span><b>${r.armor}</b> броня</span></span>
  <span class="role-description">${classHelp[r.class] || ''}</span>
 </button>
 <div class="crew-card-meta">${xpTrack(r)}${gearBlock(s, r, i, deployed)}${deployed ? '' : perkPicker(r, i)}</div>
 <div class="crew-card-foot"><div class="hp-track ${hpTier(r.hp, max)}" role="img" aria-label="Здоровье ${Math.ceil(r.hp)} из ${max}"><span style="width:${Math.max(0, Math.min(100, r.hp / max * 100))}%"></span></div><button type="button" class="crew-heal" data-action="heal" data-index="${i}" ${healDisabled ? 'disabled' : ''}>${label}</button></div>
</div>`;
    }).join('');
    return `<div class="page-heading"><div><small>ПОДГОТОВКА ОПЕРАЦИИ</small><h2>Отряд и снабжение</h2></div><span class="tag">${crew.length} / ${Balance.squad.size} бойца</span></div>
 <div class="squad-slots">${Array.from({ length: Balance.squad.size }, (_, i) => crew[i] ? `<div class="squad-slot filled"><span class="slot-number">0${i + 1}</span><strong>${h(crew[i].name)}</strong><span>${classes[crew[i].class]}</span></div>` : `<div class="squad-slot"><span class="slot-number">0${i + 1}</span><strong>Свободное место</strong><span>Выберите бойца ниже</span></div>`).join('')}</div>
 <div class="squad-layout"><div><section class="panel"><div class="section-heading"><h3>Доступные бойцы <span class="muted">${s.recruits.length}</span></h3><div class="actions"><button data-action="auto-squad" ${deployed || !s.recruits.length ? 'disabled' : ''}>Подобрать отряд</button><button data-action="clear-squad" ${deployed || !selected.length ? 'disabled' : ''}>Снять выбор</button></div></div>
 <p class="muted">${deployed ? 'Состав текущей экспедиции зафиксирован. Выжившие вернутся после эвакуации.' : 'Выберите до четырёх бойцов. Автоподбор сначала берёт тяжёлого, медика, штурмовика и инженера.'} Раненых можно лечить на базе в карточке бойца.</p>
 <div class="crew">${cards || '<div class="empty-state"><h3>Казармы пусты</h3><p>Наймите специалистов или бесплатных бродяг ниже.</p></div>'}</div></section>
 <section class="panel recruit-panel"><small>ПОПОЛНЕНИЕ</small><h3>Нанять бойца</h3><div class="hire-grid">${Object.entries(classes).map(([key, name]) => `<button data-action="${key === 'vagrant' ? 'vagrant' : 'hire-' + key}" ${key !== 'vagrant' && s.res.credits < Balance.hiring.cost ? 'disabled' : ''}><strong>${name}</strong><span>${key === 'vagrant' ? 'Бесплатно' : '₡ ' + cash(Balance.hiring.cost)}</span></button>`).join('')}</div><p class="muted">${s.res.credits < Balance.hiring.cost ? 'На специалистов не хватает кредитов. Бродяги доступны бесплатно.' : 'Новый боец появится в списке выше. После найма добавьте его в отряд.'}</p></section></div>
 <aside class="squad-aside">${preparation(s, ui)}<section class="panel deployment-panel"><small>ГОТОВНОСТЬ К ВЫЛЕТУ</small><h3>${deployed ? 'Отряд в экспедиции' : crew.length ? 'Состав готов' : 'Выберите бойцов'}</h3><div class="row"><span>Снабжение при высадке</span><strong>₡ ${cash(cost)}</strong></div><div class="row"><span>На счёте базы</span><strong>₡ ${cash(s.res.credits, ui.screen === 'result' && ui.overlay === 'win')}</strong></div>${!deployed && cost > s.res.credits ? `<p class="warn">Не хватает ₡ ${cash(cost - s.res.credits)}. Уменьшите запас аптечек.</p>` : ''}<button class="primary wide" data-action="${deployed ? 'resume' : 'start'}" ${!deployed && (!crew.length || cost > s.res.credits) ? 'disabled' : ''}>${deployed ? 'Вернуться к экспедиции' : 'Высадить отряд →'}</button><p class="muted">Эвакуация доступна после каждого пятого сектора.</p></section></aside></div>`;
  }

  function raid(s, ui) {
    if (!s.raid) return `<div class="panel"><small>ПЛАНИРОВАНИЕ ВЫЛАЗКИ</small><h2>Комплекс «Гелиос»</h2><p>Отряд автоматически движется от сектора к сектору. После каждого пятого сектора можно эвакуироваться.</p><p>Состав: ${(ui.selected || []).map(i => h(s.recruits[i]?.name)).join(', ') || 'не выбран'}.</p><button class="primary" data-tab="squad">Выбрать отряд и припасы →</button></div>`;
    const r = s.raid, checkpoint = r.cleared && r.depth % Balance.raid.checkpointEvery === 0;
    return `<div class="grid battle-layout"><div class="panel"><div class="battlehud" id="raid-hud">${hudHtml(s, ui)}</div>
 <div class="route-track" id="route-track">${routeTrackHtml(r)}</div>
 <div id="raid-actions">${raidActionsHtml(s, ui)}</div>
 <canvas id="arena" width="800" height="350"></canvas>
 <div class="sector-status" role="status" id="sector-status">${statusHtml(s, ui)}</div>
 <div id="raid-event-wrap">${eventHtml(s)}</div>
 <div class="actions"><button data-action="pause" aria-pressed="${ui.paused}">${ui.paused ? 'Продолжить' : 'Пауза'}</button><button data-action="speed">Скорость ×${r.speed}</button></div><h3 class="log-title">Последние события</h3><div class="log" id="raid-log">${logHtml(s)}</div></div>
 <div class="panel"><small>БИОМЕТРИЯ И ГРУЗ</small><h3>${Battle.routeInfo(r).name}</h3><p class="muted">Маршрут действует до следующего шлюза. Элитные враги: +50% HP, +20% урона, двойная награда.</p><h3>Приказы и запас</h3><p>${Preparation.orders[Preparation.normalize({ order: r.order }).order].name}</p><p id="raid-kits">${kitsHtml(r)}</p><h3>Данные отряда</h3><div id="raid-crew">${r.crew.map(c => GameUI.healthRow(c.name, c.hp, c.maxHp || c.hp)).join('')}</div><h3>Противники</h3><div id="raid-foes">${(r.foes || []).filter(e => e.hp > 0).map(e => GameUI.healthRow(Battle.foeName(e), e.hp, e.maxHp, true)).join('') || '<p>Контакт отсутствует.</p>'}</div><p id="raid-loot">Добыча: ${cash(r.loot)} кредитов</p><p class="muted">После зачистки: ${Math.round(Progression.command(s.buildings.command).cache * 100)}% — тайник, ${Math.round(Balance.loot.medicalChance * 100)}% — медприпасы. Находки забираются автоматически. При поражении сохраняется ${Math.round(Progression.command(s.buildings.command).recovery * 100)}% груза.</p></div></div>
 ${checkpoint && ui.overlay !== 'story' && ui.overlay !== 'event' ? `<div class="overlay"><div class="dialog" role="dialog" aria-modal="true" aria-labelledby="dialog-title"><small>СЕКТОР ${r.depth} · БОСС УНИЧТОЖЕН</small><h2 id="dialog-title">ЭВАКУАЦИОННЫЙ ШЛЮЗ</h2><p>Груз: ₡ ${cash(r.loot)}. Живы ${r.crew.filter(c => c.hp > 0).length} бойцов.</p><p>Выбор на следующие пять секторов:</p><p><b>Сервисный обход:</b> −15% HP и урона врагов, −15% наград за бой. Шанс элиты — 6%.</p><p class="warn"><b>Заражённое хранилище:</b> +20% HP и урона врагов, +50% наград за бой. Шанс элиты — 24%.</p><p>Медпост помог выжившим. Уже собранный груз не меняется.</p>${r.sectorEvent ? `<p>${h(r.sectorEvent.title)}: ${h(GameUI.logLine(r.sectorEvent.text))}</p>` : ''}${automation(s, ui)}<div class="actions"><button class="primary" data-action="extract">Эвакуироваться с грузом</button><button data-action="route-safe">Сервисный обход → ${r.depth + 5}</button><button data-action="route-risk">Заражённое хранилище → ${r.depth + 5}</button></div></div></div>` : ''}${roomEventHtml(s, ui)}${storyHtml(s)}`;
  }

  function hudHtml(s, ui) {
    const r = s.raid;
    return `<span>${'СЕКТОР ' + r.depth + ' · ' + (ui.paused ? 'ПАУЗА' : r.cleared ? 'ЗАЧИЩЕН' : 'КОНТАКТ')}</span><span>ОТРЯД ${r.crew.filter(c => c.hp > 0).length}/${r.crew.length} · ГРУЗ ₡ ${cash(r.loot)}</span>${modifierHtml(r)}`;
  }
  function routeTrackHtml(r) {
    return Array.from({ length: 5 }, (_, i) => { const n = Math.floor((r.depth - 1) / 5) * 5 + i + 1; return `<span class="${n < r.depth || n === r.depth && r.cleared ? 'done' : n === r.depth ? 'current' : ''}">${n}${n % 5 === 0 ? ' ⚑' : ''}</span>`; }).join('');
  }
  function statusHtml(s, ui) {
    const r = s.raid;
    if (r.cleared) {
      if (r.depth % Balance.raid.checkpointEvery === 0) return 'Эвакуационный шлюз открыт. Решение за командиром.';
      if (ui.paused) return 'Переход приостановлен.';
      return `Переход в сектор ${r.depth + 1} · ${Math.max(1, r.transitionTicks || 3)}…`;
    }
    return `До следующего шлюза: сектор ${Math.ceil(r.depth / 5) * 5}.`;
  }
  function eventHtml(s) {
    const ev = s.raid && s.raid.sectorEvent;
    if (!ev) return '';
    return `<div class="raid-event ${ev.kind}"><strong>${h(ev.title)}</strong><span>${h(GameUI.logLine(ev.text))}</span></div>`;
  }
  function logHtml(s) {
    const r = s.raid;
    return (r.log || []).slice(-Balance.raid.logVisible).reverse().map(x => `<div>${h(GameUI.logLine(x))}</div>`).join('');
  }
  function kitsHtml(r) {
    return `Автоаптечки ${Preparation.tiers[r.kitTier || 1].name}: ${r.kits || 0} / ${r.kitsBought || 0} · +${r.kitHeal || 30} HP`;
  }

  function preparation(s, ui) {
    const active = s.raid, medical = Progression.medbay(s.buildings.medbay);
    const p = active ? { order: active.order || 'front', kits: active.kitsBought || 0, kitTier: active.kitTier || 1 } : Preparation.normalize(s.prep, s.buildings.medbay);
    const kit = Preparation.tiers[p.kitTier], capacity = active ? (active.kitCapacity || 3) : medical.capacity;
    return `<section class="panel preparation"><small>ПРИКАЗЫ И СНАБЖЕНИЕ</small><h2>Подготовка экспедиции</h2><div class="prep-grid"><label>Приоритет целей<select id="prep-order" ${active ? 'disabled' : ''}>${Object.entries(Preparation.orders).map(([key, o]) => `<option value="${key}" ${p.order === key ? 'selected' : ''}>${o.name}</option>`).join('')}</select><span class="muted">${Preparation.orders[p.order].text}</span></label><label>Уровень аптечек<select id="prep-tier" ${active ? 'disabled' : ''}>${Object.entries(Preparation.tiers).map(([id, k]) => `<option value="${id}" ${p.kitTier === +id ? 'selected' : ''} ${+id > medical.tier ? 'disabled' : ''}>${k.name} · ${k.heal} HP · ₡ ${cash(k.price)}${+id > medical.tier ? ' · медблок ур. ' + (+id === 2 ? 3 : 5) : ''}</option>`).join('')}</select></label><label>Запас · до ${capacity} шт.<select id="prep-kits" ${active ? 'disabled' : ''}>${Array.from({ length: capacity + 1 }, (_, n) => `<option value="${n}" ${p.kits === n ? 'selected' : ''}>${n} шт. · ₡ ${cash(n * kit.price)}</option>`).join('')}</select><span class="muted">При HP ≤35%: +${kit.heal} HP одному выжившему, максимум одна аптечка за ход.</span></label></div><p>Стоимость при высадке: <b>₡ ${cash(p.kits * kit.price)}</b>. Неиспользованные возвращаются по цене покупки только при эвакуации.</p><p class="muted">Медблок: +1 место за уровень (до 12). Аптечки II — уровень 3, III — уровень 5. Скидка на платное лечение — 5% за уровень медблока.</p>${active ? '<p class="warn">Припасы текущего рейда уже закуплены. Новые уровни применятся при следующей высадке.</p>' : ''}${ui.deploymentError ? `<p class="warn" role="alert">${h(ui.deploymentError)}</p>` : ''}</section>`;
  }

  function autoMessage(s, ui) {
    const r = s.raid;
    if (!r.autoRoute) return 'Осталось 1–2 бойца: выберите маршрут или эвакуацию вручную.';
    if (r.autoCancelled) return 'Автовыбор отменён. Решение за командиром.';
    const route = r.autoRoute === 'risk' ? 'заражённое хранилище' : 'сервисный обход';
    return (ui.paused ? 'Пауза · ' : 'Автовыбор через ') + Math.ceil(r.autoRemainingMs / 1000) + ' с · ' + route;
  }
  function automation(s, ui) {
    const r = s.raid;
    return `<section class="auto-choice"><p id="auto-countdown" role="status">${autoMessage(s, ui)}</p><div class="actions"><button data-action="pause" aria-pressed="${ui.paused}">${ui.paused ? 'Продолжить таймер' : 'Пауза'}</button><button data-action="speed">Скорость ×${r.speed}</button>${r.autoRoute && !r.autoCancelled ? '<button data-action="cancel-auto">Решить вручную</button>' : ''}</div><small>4 живых — сложный путь, 3 — простой, 1–2 — только вручную. При ×1: 15 с, при ×2/×4: 5 с.</small></section>`;
  }

  function save(s, ui) {
    return `<div class="page-heading"><div><small>ПРОГРЕСС И ПЕРЕНОС</small><h2>Сохранения и настройки</h2></div></div><section class="panel speed-settings"><div><h3>Скорость игры</h3><p class="muted">Сохраняется между рейдами и после перезапуска. Автовыбор маршрута: ×1 — 15 секунд, ×2 и ×4 — 5 секунд.</p></div><button data-action="speed">Скорость ×${Automation.validSpeed(s.settings?.speed)}</button></section><div class="grid"><section class="panel"><h3>Перенести игру на другой компьютер</h3><p>Экспортируйте JSON и сохраните его отдельно от папки игры. Файл включает текущую экспедицию.</p><div class="actions"><button class="primary" data-action="export">Экспортировать сохранение</button><button data-action="import">Загрузить JSON</button><input id="import" type="file" accept="application/json,.json" hidden></div><p class="muted">Загрузка файла заменит текущий прогресс. Сначала экспортируйте его, если хотите сохранить.</p></section><section class="panel danger-panel"><h3>Начать заново</h3><p>Удаляет прогресс базы и текущий рейд. Потребуется подтверждение.</p><button class="danger" data-action="new">Новая игра</button>${s.raid ? `<button class="danger wide" data-action="newrun">Прервать экспедицию</button>` : ''}</section></div><p class="muted">Прогресс сохраняется автоматически в этом браузере. При переносе папки используйте экспорт JSON.</p>`;
  }

  function contractsBlock(res) {
    const list = res && res.contracts;
    if (!Array.isArray(list) || !list.length) return '';
    return `<div class="result-contracts"><h3>Выполненные контракты</h3>${list.map(c => `<div class="change-row"><span>${h(c.text)}</span><strong>${h(c.reward)}</strong></div>`).join('')}</div>`;
  }

  function result(s, ui) {
    const res = s.lastResult;
    const win = res ? res.ok : ui.overlay === 'win';
    const outcome = res ? (res.outcome || (win ? 'evac' : 'defeat')) : (win ? 'evac' : 'defeat');
    const titles = { evac: 'ЭВАКУАЦИЯ УСПЕШНА', cover: 'ПРИКРЫТИЕ ОТХОДА', retreat: 'ОТСТУПЛЕНИЕ', defeat: 'ОТРЯД ПОТЕРЯН' };
    const intros = {
      evac: 'Груз доставлен на базу. Можно готовить следующий отряд.',
      cover: 'Отряд прорвался с полным грузом. Один боец остался прикрывать отход.',
      retreat: 'Командир приказал отступать. Часть груза потеряна, выжившие вернулись ранеными.',
      defeat: 'Павшие исключены из списка. Бесплатные бродяги помогут восстановиться.'
    };
    const title = titles[outcome] || titles[win ? 'evac' : 'defeat'];
    const intro = intros[outcome] || intros[win ? 'evac' : 'defeat'];
    let body;
    if (!res) { // совместимость со старыми отчётами
      body = `<div class="result-rewards"><div><span>Добыча</span><strong>₡ ${cash(s.lastLoot || 0, win)}</strong></div><div><span>Возврат припасов</span><strong>₡ ${cash(s.lastRefund || 0, win)}</strong></div></div>`;
    } else {
      const changes = res.changes.map(c => {
        const xp = c.xp ? ` <em class="xp-gain">+${c.xp} XP${c.levelUp ? ' · ур. ' + c.level : ''}</em>` : '';
        if (c.status === 'dead') return `<div class="change-row dead"><span>${h(c.name)}</span><strong>${c.cause === 'cover' ? 'погиб — прикрывал отход' : 'погиб'}</strong></div>`;
        const delta = Math.ceil(c.after) - Math.ceil(c.before);
        const hp = delta === 0 ? 'без изменений' : `${delta > 0 ? '+' : '−'}${Math.abs(delta)} HP (${Math.ceil(c.before)} → ${Math.ceil(c.after)})`;
        return `<div class="change-row"><span>${h(c.name)}${xp}</span><strong>${hp}</strong></div>`;
      }).join('');
      const loot = res.loot;
      const losses = [];
      if (!win && res.losses.kits) losses.push(`<div class="change-row dead"><span>Аптечки не вернулись</span><strong>₡ ${cash(res.losses.kits * res.losses.kitPrice, true)}</strong></div>`);
      if (!win && res.losses.cargo) losses.push(`<div class="change-row dead"><span>Груз потерян</span><strong>₡ ${cash(res.losses.cargo, true)}</strong></div>`);
      if (res.slowHealed) losses.push(`<div class="change-row"><span>Медблок · медленное лечение</span><strong>+${res.slowHealed} HP</strong></div>`);
      const pendingIdx = s.recruits.findIndex(x => State.pendingPerks(x) > 0);
      const perks = pendingIdx >= 0 ? perkPicker(s.recruits[pendingIdx], pendingIdx) : '';
      body = `<div class="result-changes"><h3>Изменения в отряде</h3>${changes}</div>
 <div class="result-rewards"><div><span>За бои</span><strong>₡ ${cash(loot.battle, true)}</strong></div><div><span>Тайники</span><strong>₡ ${cash(loot.cache, true)}</strong></div>${res.ok ? `<div><span>Бонус эвакуации</span><strong>₡ ${cash(loot.extract, true)}</strong></div>` : ''}<div><span>Возврат припасов</span><strong>₡ ${cash(loot.refund, true)}</strong></div><div class="total"><span>Итого на базу</span><strong>₡ ${cash((s.lastLoot || 0) + (s.lastRefund || 0), true)}</strong></div></div>
 ${losses.length ? `<div class="result-losses"><h3>Потери и восстановление</h3>${losses.join('')}${res.losses.dead.length ? `<p class="muted">Не вернулись: ${res.losses.dead.map(h).join(', ')}.</p>` : ''}</div>` : ''}${perks}${contractsBlock(res)}`;
    }
    return `<div class="overlay result-screen"><div class="dialog" role="dialog" aria-modal="true" aria-labelledby="dialog-title"><small>ОТЧЁТ · ОПЕРАЦИЯ ${s.run}</small><h2 id="dialog-title">${title}</h2><p>${intro}</p>${body}<button class="primary wide" data-action="dismiss">Вернуться на базу →</button></div></div>`;
  }

  function stats(s, ui) {
    const chart = (id, title, hint, label) => `<div class="chart-block"><h3>${title}</h3><p class="muted">${hint}</p><canvas id="${id}" width="840" height="240" role="img" aria-label="${label}"></canvas></div>`;
    return `<div class="page-heading"><div><small>АНАЛИТИКА ЭКСПЕДИЦИЙ</small><h2>Статистика</h2></div><button data-action="menu">← В меню</button></div><section class="panel stats-panel">
 ${chart('chart-deaths', 'Смертность по глубине', 'Сколько бойцов погибло по диапазонам секторов.', 'График смертности по глубине')}
 ${chart('chart-loot', 'Средняя добыча по глубине', 'Сколько кредитов в среднем приносит рейд из каждого диапазона.', 'График средней добычи по глубине')}
 ${chart('chart-outcomes', 'Эвакуации и поражения по глубине', 'Соотношение успешных и неудачных завершений рейдов.', 'График исходов по глубине')}
 <p class="muted">Данные накапливаются с версии ${Balance.version}. Баланс по графикам не корректируется — это только визуализация.</p></section>`;
  }

  /* --- Рисование графиков (Canvas, без библиотек) --- */
  function drawBars(canvas, labels, series) {
    if (!canvas || !canvas.getContext) return;
    const g = canvas.getContext('2d'), W = canvas.width, H = canvas.height;
    const padL = 52, padR = 14, padT = 14, padB = 34;
    g.clearRect(0, 0, W, H);
    g.fillStyle = '#0c1519'; g.fillRect(0, 0, W, H);
    if (!labels.length) { g.fillStyle = '#6f857f'; g.font = '14px Segoe UI, sans-serif'; g.fillText('Нет данных — сыграйте несколько рейдов.', 24, H / 2); return; }
    let max = 1;
    series.forEach(s => s.values.forEach(v => { if (v > max) max = v; }));
    max = Math.ceil(max * 1.15) || 1;
    g.strokeStyle = '#1e2f34'; g.fillStyle = '#6f857f'; g.font = '11px monospace';
    for (let i = 0; i <= 4; i++) {
      const y = padT + (H - padT - padB) * (1 - i / 4);
      g.beginPath(); g.moveTo(padL, y); g.lineTo(W - padR, y); g.stroke();
      g.fillText(String(Math.round(max * i / 4)), 8, y + 4);
    }
    const plotW = W - padL - padR, plotH = H - padT - padB, groups = labels.length;
    const slot = plotW / groups, bars = series.length, gap = 6;
    const barW = Math.max(6, Math.min(46, (slot - gap * 2) / bars));
    labels.forEach((label, i) => {
      const cx = padL + slot * i + slot / 2;
      series.forEach((s, j) => {
        const v = Math.max(0, s.values[i] || 0), hgt = v / max * plotH;
        const x = cx - (bars * barW + (bars - 1) * 4) / 2 + j * (barW + 4);
        g.fillStyle = s.color; g.fillRect(x, padT + plotH - hgt, barW, hgt);
        if (v > 0 && bars === 1) { g.fillStyle = '#c5d2cb'; g.font = '11px monospace'; g.textAlign = 'center'; g.fillText(String(Math.round(v)), cx, padT + plotH - hgt - 5); g.textAlign = 'left'; }
      });
      g.fillStyle = '#8fa5a0'; g.font = '11px monospace'; g.textAlign = 'center';
      g.fillText(label, cx, H - 14); g.textAlign = 'left';
    });
    let lx = padL;
    g.font = '11px Segoe UI, sans-serif';
    series.forEach(s => { g.fillStyle = s.color; g.fillRect(lx, 4, 10, 10); g.fillStyle = '#a4b8b7'; g.fillText(s.name, lx + 14, 13); lx += 24 + g.measureText(s.name).width; });
  }

  function drawStats(root, s) {
    if (!root || !root.querySelector) return;
    const stats = s.stats && s.stats.byDepth ? s.stats : { byDepth: {}, total: { runs: 0, evac: 0, deaths: 0, loot: 0, kills: 0 } };
    const keys = Object.keys(stats.byDepth).sort((a, b) => parseInt(a, 10) - parseInt(b, 10));
    drawBars(root.querySelector('#chart-deaths'), keys, [{ name: 'погибло', color: '#c76b5e', values: keys.map(k => stats.byDepth[k].deaths) }]);
    drawBars(root.querySelector('#chart-loot'), keys, [{ name: 'средняя добыча', color: '#e0b06b', values: keys.map(k => { const row = stats.byDepth[k]; return row.runs ? Math.round(row.loot / row.runs) : 0; }) }]);
    drawBars(root.querySelector('#chart-outcomes'), keys, [
      { name: 'эвакуации', color: '#72cbb5', values: keys.map(k => stats.byDepth[k].evac) },
      { name: 'поражения', color: '#c76b5e', values: keys.map(k => Math.max(0, stats.byDepth[k].runs - stats.byDepth[k].evac)) }
    ]);
  }

  function dialog(ui) {
    const d = ui.dialog;
    if (!d) return '';
    return `<div class="overlay dialog-overlay"><div class="dialog" role="dialog" aria-modal="true" aria-labelledby="dialog-title"><small>${h(d.eyebrow || 'ПОДТВЕРЖДЕНИЕ')}</small><h2 id="dialog-title">${h(d.title)}</h2><p>${h(d.body)}</p>${d.hint ? `<p class="muted">${h(d.hint)}</p>` : ''}<div class="actions">${d.kind === 'alert' ? '' : `<button data-action="dialog-cancel">${h(d.cancel || 'Отмена')}</button>`}<button class="${d.danger && d.kind !== 'alert' ? 'primary danger' : 'primary'}" data-action="dialog-confirm">${h(d.confirm || 'Понятно')}</button></div></div></div>`;
  }

  return {
    h, cash, classes, classHelp, buildingNames, hpTier, SLOT_NAMES, itemLabel, xpTrack, gearBlock, perkPicker, raidActionsHtml,
    modifierHtml, contractsHtml, roomEventHtml, storyHtml, contractsBlock,
    ROOM_EVENTS, roomOptions, overlayMessage, overlaySeconds,
    menu, base, squad, raid, save, result, stats, dialog,
    hudHtml, routeTrackHtml, statusHtml, eventHtml, logHtml, kitsHtml,
    preparation, autoMessage, automation, drawStats, drawBars
  };
})();