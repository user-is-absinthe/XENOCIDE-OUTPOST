/* Пакет 0.4.0: тесты чистых модулей (balance/state/battle) в Node без document.
   DOM-зависимые экраны проверяются в interface.cjs. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

let storage = {};
const localStorage = {
  getItem: k => (k in storage ? storage[k] : null),
  setItem: (k, v) => { storage[k] = String(v); },
  removeItem: k => { delete storage[k]; }
};
const context = { console, localStorage };
context.window = context;
vm.createContext(context);
for (const file of ['balance.js', 'progression.js', 'automation.js', 'interface.js', 'preparation.js', 'state.js', 'battle.js'])
  vm.runInNewContext(fs.readFileSync(file, 'utf8'), context);
const { Balance, State, Battle, Preparation, Automation, Progression, GameUI } = context;

const ui = (over = {}) => Object.assign({ screen: 'game', tab: 'raid', paused: false, overlay: '', hidden: false }, over);
const clone = x => JSON.parse(JSON.stringify(x));
// Объекты из vm-контекста — другой realm: сравниваем через JSON.
const norm = x => JSON.parse(JSON.stringify(x));

/* --- 1.8: схема профиля и миграция v1 → v2 → v3 --- */
let old = State.fresh(); old.v = 1; old.res = { credits: 7, scrap: 9, data: 3 }; old.raid = { loot: 6, data: 2 };
let migrated = State.migrate(old);
assert.equal(migrated.res.credits, 19);
assert.equal(migrated.raid.loot, 8);
assert.equal(migrated.v, 3, 'v1 мигрирует сразу до v3');
assert.deepEqual(norm(migrated.stats.total), { runs: 0, evac: 0, deaths: 0, loot: 0, kills: 0 });
assert.equal(migrated.seenStory.length, 0);

// v2 → v3: hp/maxHp и слоты снаряжения у существующих рекрутов
let v2 = State.fresh(); v2.v = 2; delete v2.stats; delete v2.seenStory;
v2.recruits = [{ id: 1, name: 'Ветеран-77', class: 'heavy', hp: 64, atk: 12, armor: 3, training: 2, gear: null }];
v2.raid = { depth: 3, seed: 5, crew: [{ id: 1, name: 'Ветеран-77', class: 'heavy', hp: 40, maxHp: 64, atk: 12, armor: 3 }], loot: 12, log: [], kits: 0, kitsBought: 0, kitTier: 1, kitPrice: 12, kitHeal: 30, kitCapacity: 3, speed: 1, cleared: false };
let up = State.migrate(v2);
assert.equal(up.v, 3);
assert.equal(up.recruits[0].maxHp, 64, 'v2: hp становится и maxHp');
assert.deepEqual(norm(up.recruits[0].gear), { weapon: null, armor: null, gadget: null });
assert.equal(up.raid.crew[0].deployHp, 40, 'deployHp зарезервирован для v3');
assert.equal(up.raid.lootBattle, 12);
assert.deepEqual(norm(up.stats.byDepth), {});

const fresh = State.fresh();
assert.equal(fresh.v, Balance.profileVersion);
assert.equal(fresh.recruits.length, 0);
assert(fresh.items.length >= 10);
assert.equal(fresh.recruits.length, 0);

// Ошибка чтения — честный флаг, а не тихий fresh
storage[State.KEY] = '{битые данные';
let bad = State.load();
assert.equal(bad.error, true);
assert.equal(bad.profile.v, 3);
assert.equal(bad.initial, true);
delete storage[State.KEY];
let empty = State.load();
assert.equal(empty.error, false);
assert.equal(empty.initial, true);

// Экспорт/импорт JSON
const text = State.exportJson(fresh);
assert.deepEqual(State.importJson(text).v, 3);
assert.throws(() => State.importJson('нет JSON'));
assert.throws(() => State.migrate({ v: 2, res: { credits: -5 }, buildings: {}, recruits: [], items: [] }));
assert.equal(State.save(fresh), 'ok');
localStorage.setItem = () => { throw Error('quota'); };
assert.equal(State.save(fresh), 'storage');
localStorage.setItem = (k, v) => { storage[k] = String(v); };

/* --- Найм: диапазоны, maxHp, слоты --- */
for (let i = 0; i < 50; i++) {
  const vagrant = State.recruit(fresh, true);
  assert(vagrant.hp >= 55 && vagrant.hp <= 70, 'бродяга hp 55–70');
  assert(vagrant.atk >= 5 && vagrant.atk <= 7, 'бродяга урон 5–7');
  assert.equal(vagrant.armor, 0);
  assert.equal(vagrant.class, 'vagrant');
  assert.equal(vagrant.maxHp, vagrant.hp);
  assert.deepEqual(norm(vagrant.gear), { weapon: null, armor: null, gadget: null });
  const paid = State.recruit(fresh, false, 'medic');
  const training = Progression.barracks(fresh.buildings.barracks);
  assert(paid.hp >= 75 + training.hp && paid.hp <= 110 + training.hp, 'специалист hp 75–110 + казармы');
  assert(paid.atk >= 9 + training.attack && paid.atk <= 16 + training.attack, 'специалист урон 9–16 + казармы');
  assert(paid.armor >= training.armor && paid.armor <= 5 + training.armor);
  assert.equal(paid.class, 'medic');
  assert.equal(paid.maxHp, paid.hp);
}
fresh.recruits = [];

/* --- Выбор отряда --- */
let picks = State.autoPick(
  ['vagrant', 'heavy', 'medic', 'assault', 'engineer'].map((c, i) => ({ id: i, class: c }))
);
assert.equal(picks.length, 4);
assert(!picks.includes(0), 'автоподбор не берёт бродягу при наличии ролей');
const four = [0, 1, 2, 3];
assert.deepEqual(State.pick(four, [{}, {}, {}, {}, {}], 4), four, 'пятый не добавляется');
assert.deepEqual(State.pick(four, [{}, {}, {}, {}, {}], 1), [0, 2, 3], 'повторный клик снимает');
assert.deepEqual(State.pick([], [{}, {}], 5), [], 'нет бойца — нет выбора');

/* --- Платное лечение --- */
assert.equal(State.healCost(100, 60, 1), 19, 'ceil(40/2)=20 −5% → 19');
assert.equal(State.healCost(100, 60, 5), 15, 'скидка 25% на уровне 5');
assert.equal(State.healCost(100, 100, 5), 0, 'при полном здоровье 0');
assert.equal(State.healCost(100, 99, 10), 1, 'минимум 1 кредит');
const healProfile = State.fresh();
const wounded = State.recruit(healProfile, false);
wounded.hp = Math.max(1, wounded.maxHp - 40);
const price = State.healCost(wounded.maxHp, wounded.hp, healProfile.buildings.medbay);
healProfile.res.credits = price - 1;
assert.equal(State.healRecruit(healProfile, 0, healProfile.buildings.medbay).reason, 'funds', 'не хватает денег');
assert(wounded.hp < wounded.maxHp);
healProfile.res.credits = price;
assert.equal(State.healRecruit(healProfile, 0, healProfile.buildings.medbay).ok, true);
assert.equal(wounded.hp, wounded.maxHp);
assert.equal(healProfile.res.credits, 0);
assert.equal(State.healRecruit(healProfile, 0, healProfile.buildings.medbay).reason, 'full');

/* --- Высадка: снимок ранений, отказы, аптечки --- */
let s = State.fresh(); s.res.credits = 0; s.recruits = [];
for (let i = 0; i < 4; i++) State.recruit(s, true);
const dep = Battle.deploy(s, [0, 1, 2, 3]);
assert.equal(dep.ok, true);
assert.equal(s.res.credits, 0, 'аптечек нет — высадка бесплатна');
assert.equal(s.raid.crew.length, 4);
assert.equal(s.raid.crew[0].hp, s.raid.crew[0].maxHp);
assert.equal(s.raid.crew[0].deployHp, s.recruits[0].hp);
assert.equal(Battle.deploy(s, [0]).reason, 'active', 'повторная высадка невозможна');

let broke = State.fresh(); broke.res.credits = 0; broke.prep = { order: 'front', kits: 3 };
State.recruit(broke, false);
assert.equal(Battle.deploy(broke, [0]).reason, 'funds');
assert.equal(broke.raid, null, 'при нехватке средств рейд не начинается');
assert.equal(broke.res.credits, 0, 'кредиты не списаны');
assert.equal(Battle.deploy(State.fresh(), []).reason, 'empty');

// Раненый уходит с текущим hp, лечение в рейде — только до maxHp
let woundedS = State.fresh(); woundedS.res.credits = 0;
const w1 = State.recruit(woundedS, false); w1.hp = 40;
Battle.deploy(woundedS, [0]);
assert.equal(woundedS.raid.crew[0].hp, 40, 'в рейд уходит текущее hp');
assert.equal(woundedS.raid.crew[0].maxHp, w1.maxHp, 'потолок maxHp сохраняется');
assert.equal(Battle.healCrew(woundedS.raid, 1000), w1.maxHp - 40, 'лечение не превышает maxHp');
woundedS.raid.crew[0].hp = woundedS.raid.crew[0].maxHp;
assert.equal(Battle.healCrew(woundedS.raid, 30), 0, 'полное здоровье не лечится');

/* --- Боевой такт: события, детерминизм, RNG только в battle --- */
function battleProfile(seed, hp = 95) {
  const p = State.fresh(); p.res.credits = 0;
  p.recruits = ['heavy', 'medic', 'assault', 'engineer'].map((c, i) => ({ id: i + 1, name: 'Боец-' + i, class: c, hp, maxHp: hp, atk: 12, armor: 3, training: 1, gear: { weapon: null, armor: null, gadget: null } }));
  Battle.deploy(p, [0, 1, 2, 3]);
  p.raid.seed = seed;
  return p;
}
let p1 = battleProfile(7), p2 = battleProfile(7);
// Слабый урон — чтобы гарантированно получить бой, а не мгновенную зачистку
p1.raid.crew.forEach(c => { c.atk = 1; });
p2.raid.crew.forEach(c => { c.atk = 1; });
const turnA = Battle.turn(p1), turnB = Battle.turn(p2);
assert.equal(turnA.status, 'fight');
assert.equal(JSON.stringify(p1.raid), JSON.stringify(p2.raid), 'одинаковый seed → одинаковое состояние');
assert.deepEqual(turnA.events.map(e => e.t), turnB.events.map(e => e.t));
assert.equal(turnA.events[0].t, 'spawn', 'первое событие контакта');
assert(turnA.events[0].foes.length > 0 && turnA.events[0].names.length > 0);
assert(turnA.events.some(e => e.t === 'hit' && e.side === 'foe' && e.by && e.target));
assert(turnA.events.some(e => e.t === 'hit' && e.side === 'crew' && e.target.hp !== undefined));
assert(p1.raid.log.length > 0, 'журнал — производная событий');

// Форматтер журнала
assert.equal(Battle.formatEvent({ t: 'kill', side: 'foe', target: { type: 1, elite: false }, reward: 40 }), 'Ползун уничтожен. +₡ 40');
assert.equal(Battle.formatEvent({ t: 'kill', side: 'crew', target: { name: 'Ким-9' } }), 'Ким-9 погиб');
assert.equal(Battle.formatEvent({ t: 'spawn', names: ['Личинка', 'Ползун'] }), 'Контакт: Личинка, Ползун');
assert.equal(Battle.formatEvent({ t: 'kit', target: { name: 'Вега-2' }, amount: 30, left: 1 }), 'Автоаптечка: Вега-2 +30 HP. Осталось: 1');
assert.equal(Battle.formatEvent({ t: 'loot', amount: 21, source: 'cache' }), 'Обнаружен тайник: Отряд забрал 21 кредитов в груз.');
assert.equal(Battle.formatEvent({ t: 'heal', source: 'medpost', amount: 15 }), 'Эвакуационный медпост: +15 HP. Ожидаем приказа.');
assert.equal(Battle.formatEvent({ t: 'sectorClear', checkpoint: false }), 'Сектор зачищен. Отряд движется к следующему шлюзу.');
assert.equal(Battle.formatEvent({ t: 'sectorClear', checkpoint: true }), '', 'на шлюзе строку даёт медпост');
assert.equal(Battle.formatEvent({ t: 'hit', side: 'foe', by: { name: 'Ким-1' }, target: { type: 0, elite: false }, dmg: 9 }), '');
assert.equal(Battle.formatEvent({ t: 'hit', side: 'crew', by: { type: 1, elite: false }, target: { name: 'Орлов-5' }, dmg: 4 }), 'Ползун → Орлов-5: −4');
assert.equal(Battle.formatEvent({ t: 'wipe' }), 'Отряд уничтожен. Экспедиция провалена.');
assert.equal(Battle.formatEvent({ t: 'grenade', amount: 15 }), 'Граната: −15 HP всем противникам.');
assert.equal(Battle.formatEvent({ t: 'retreat' }), 'Отступление.');
assert.equal(Battle.formatEvent({ t: 'cover' }), 'Прикрытие отхода.');
assert.equal(Battle.formatEvent({ t: 'bossPhase', text: 'Матка зовёт личинок' }), 'Матка зовёт личинок');
assert.equal(Battle.formatEvent({ t: 'loot', amount: 30, source: 'kill' }), '', 'награда за бой уже в строке убийства');

// Награда за убийство и статистика киллов
let rewardProfile = State.fresh(); rewardProfile.res.credits = 0;
rewardProfile.recruits = [{ id: 1, name: 'Reward', class: 'assault', hp: 95, maxHp: 95, atk: 20, armor: 3, training: 0, gear: { weapon: null, armor: null, gadget: null } }];
Battle.deploy(rewardProfile, [0]);
rewardProfile.raid.loot = 10; rewardProfile.raid.seed = 1;
rewardProfile.raid.foes = [{ type: 0, hp: 1, maxHp: 1, rewardFactor: 3, attackFactor: 1.44, elite: true }, { type: 1, hp: 999, maxHp: 999, attackFactor: 1 }];
const rewardTurn = Battle.turn(rewardProfile);
assert.equal(rewardProfile.raid.loot, 40, '10 + (8+2) × rewardFactor 3');
assert.equal(rewardProfile.raid.lootBattle, 30);
assert.equal(rewardProfile.stats.total.kills, 1, 'событие kill обновляет статистику');
assert(rewardTurn.events.some(e => e.t === 'kill' && e.reward === 30));
assert(rewardTurn.events.some(e => e.t === 'loot' && e.source === 'kill' && e.amount === 30));

/* --- Гибель и поражение --- */
let wipe = battleProfile(3);
wipe.raid.crew.forEach(c => { c.hp = 0; });
const wipeTurn = Battle.turn(wipe);
assert.equal(wipeTurn.status, 'defeat');
assert.equal(wipeTurn.events[wipeTurn.events.length - 1].t, 'wipe');
const wipeResult = Battle.finish(wipe, false);
assert.equal(wipe.recruits.length, 0, 'погибшие удалены навсегда');
assert.equal(wipe.raid, null);
assert.equal(wipeResult.ok, false);

/* --- Конец рейда: перенос ранений, медленное лечение, статистика --- */
let healS = State.fresh(); healS.res.credits = 0;
const rA = State.recruit(healS, false), rB = State.recruit(healS, false), rC = State.recruit(healS, false);
rB.hp = Math.max(1, rB.maxHp - 30); // уже ранен до высадки
Battle.deploy(healS, [0, 1, 2]);
healS.raid.seed = 11;
healS.raid.depth = 5;
// разыгрываем бой, затем фиксируем ранения вручную для точной проверки переноса
Battle.turn(healS);
const rosterBefore = clone(healS.recruits);
const rest = Progression.medbay(healS.buildings.medbay).rest;
healS.raid.crew[0].hp = Math.max(1, healS.raid.crew[0].hp - 25);
healS.raid.crew[1].hp = 0;              // погиб в рейде
healS.raid.crew[2].deployHp = rC.hp;    // без изменений
healS.raid.crew[2].hp = rC.hp;
const endHp0 = healS.raid.crew[0].hp, endHp2 = healS.raid.crew[2].hp;
healS.raid.loot = 50; healS.raid.lootCache = 0; healS.raid.lootBattle = 50;
const result = Battle.finish(healS, true);
assert.equal(healS.recruits.length, 2, 'погибший исключён из ростера');
assert.equal(healS.recruits.find(x => x.id === rA.id).hp, Math.min(rA.maxHp, endHp0 + rest), 'ранения перенесены + медленное лечение');
assert.equal(healS.recruits.find(x => x.id === rC.id).hp, Math.min(rC.maxHp, endHp2 + rest));
assert(!healS.recruits.some(x => x.id === rB.id));
assert.equal(result.changes.length, 3, 'список изменений по каждому бойцу');
const chA = result.changes.find(c => c.id === rA.id), chB = result.changes.find(c => c.id === rB.id), chC = result.changes.find(c => c.id === rC.id);
assert.equal(chA.status, 'alive');
assert(chA.after <= chA.before, 'урон отражён в изменениях');
assert.equal(chB.status, 'dead');
assert.equal(chC.status, 'alive');
assert.equal(chC.before, chC.after, 'без изменений');
assert('xp' in chA, 'поле опыта зарезервировано под пакет 0.5.0');
// разбивка добычи
assert.equal(result.loot.battle, 50);
assert.equal(result.loot.cache, 0);
assert.equal(result.loot.extract, 12 + Math.floor(5 / 2), 'бонус эвакуации 12 + floor(depth/2)');
assert.equal(result.loot.cargo, 50 + 14);
assert.equal(result.loot.refund, 0);
assert.equal(healS.lastLoot, 64);
assert.equal(healS.res.credits, 64);
assert.equal(healS.deepest, 5);
assert.equal(healS.run, 1);
// статистика для графиков
assert.equal(healS.stats.byDepth['5-9'].runs, 1);
assert.equal(healS.stats.byDepth['5-9'].evac, 1);
assert.equal(healS.stats.byDepth['5-9'].deaths, 1);
assert.equal(healS.stats.byDepth['5-9'].loot, 64);
assert.equal(healS.stats.total.runs, 1);
assert.equal(healS.stats.total.evac, 1);
assert.equal(healS.stats.total.deaths, 1);
assert.equal(Battle.bucketKey(1), '1-4');
assert.equal(Battle.bucketKey(4), '1-4');
assert.equal(Battle.bucketKey(5), '5-9');
assert.equal(Battle.bucketKey(9), '5-9');
assert.equal(Battle.bucketKey(10), '10-14');
assert.equal(Battle.bucketKey(37), '35-39');

// Медленное лечение не поднимает бойцов, уже собранных на базе, выше maxHp
const baseB = healS.recruits.find(x => x.id === rC.id);
assert(baseB.hp <= baseB.maxHp);

/* --- Эвакуация: только очищенный шлюз пятого сектора --- */
let ex = State.fresh(); ex.res.credits = 40; ex.prep = { order: 'front', kits: 1 };
State.recruit(ex, false);
assert.equal(Battle.deploy(ex, [0]).ok, true);
assert.equal(ex.res.credits, 40 - 12, 'аптечка оплачена при высадке');
assert.equal(Battle.canExtract(ex, ui()), false, 'нельзя эвакуироваться в бою');
ex.raid.cleared = true;
assert.equal(Battle.canExtract(ex, ui()), false, 'нужен пятый сектор');
ex.raid.depth = 5;
assert.equal(Battle.canExtract(ex, ui()), false, 'нужен overlay шлюза');
assert.equal(Battle.canExtract(ex, ui({ overlay: 'room' })), true);
assert.equal(Battle.extract(ex, ui({ overlay: 'room' })), true);
assert.equal(ex.raid, null);
assert.equal(ex.lastRefund, 12, 'неиспользованные аптечки возвращаются');
assert.equal(ex.stats.byDepth['5-9'].evac, 1);

// Поражение: возврат процента груза, аптечки не возвращаются
let lose = State.fresh(); lose.res.credits = 100; lose.prep = { order: 'front', kits: 2 };
for (let i = 0; i < 4; i++) State.recruit(lose, false);
assert.equal(Battle.deploy(lose, [0, 1, 2, 3]).ok, true);
const afterPurchase = lose.res.credits;
lose.raid.loot = 100; lose.raid.lootBattle = 100; lose.raid.depth = 5;
lose.raid.crew.forEach(c => { c.hp = 0; });
Battle.finish(lose, false);
const recovery = Progression.command(1).recovery;
assert.equal(lose.lastLoot, Math.floor(100 * recovery), 'при поражении возвращается доля груза');
assert.equal(lose.lastRefund, 0, 'аптечки при поражении не возвращаются');
assert.equal(lose.res.credits, afterPurchase + Math.floor(100 * recovery));
assert.equal(lose.stats.byDepth['5-9'].evac, 0, 'поражение не считается эвакуацией');
assert.equal(lose.lastResult.losses.kits, 2);
assert.equal(lose.lastResult.loot.battle, 100);
assert.equal(Battle.finish(lose, false), null, 'повторный finish без рейда безопасен');

/* --- Переходы, пауза, контрольная точка --- */
let trans = State.fresh(); trans.res.credits = 0;
trans.recruits = [{ id: 1, name: 'Тест', class: 'assault', hp: 90, maxHp: 90, atk: 12, armor: 2, training: 0, gear: { weapon: null, armor: null, gadget: null } }];
Battle.deploy(trans, [0]);
trans.raid.foes = [{ type: 0, hp: 0, maxHp: 30 }];
trans.raid.seed = 1;
trans.raid.depth = 5; // очищаем сразу пятый сектор — шлюз
const clearEvents = Battle.clearSector(trans);
assert(trans.raid.cleared);
assert.equal(trans.raid.sectorEvent.kind, 'cache');
assert(clearEvents.some(e => e.t === 'loot' && e.source === 'cache'));
const credited = trans.raid.loot, seedAfter = trans.raid.seed;
assert.equal(Battle.clearSector(trans).length, 0, 'повторная зачистка ничего не даёт');
assert.equal(trans.raid.loot, credited);
assert.equal(trans.raid.seed, seedAfter, 'RNG не расходуется повторно');
assert.equal(Battle.tick(trans, ui()).status, 'checkpoint', 'пятый сектор ждёт решения');
trans.raid.depth = 1;
assert.equal(Battle.tick(trans, ui({ paused: true })).status, 'idle', 'пауза останавливает такт');
assert.equal(trans.raid.transitionTicks, 3);
assert.equal(Battle.tick(trans, ui()).status, 'transition');
assert.equal(trans.raid.transitionTicks, 2);
assert.equal(Battle.tick(trans, ui({ overlay: 'room' })).status, 'idle', 'модальный экран блокирует такт');
assert.equal(Battle.tick(trans, ui({ screen: 'menu' })).status, 'idle', 'за пределами рейда такт не идёт');
assert.equal(Battle.tick(trans, ui()).status, 'transition');
assert.equal(Battle.tick(trans, ui()).status, 'advance', 'третий такт завершает переход');
assert.equal(trans.raid.depth, 2);
assert.equal(trans.raid.cleared, false);
assert.equal(trans.raid.sectorEvent, null, 'старое событие сектора очищено');
assert.equal(trans.raid.route, undefined, 'маршрут по умолчанию — основной коридор');

/* --- Маршруты у шлюза --- */
let routed = State.fresh(); routed.res.credits = 0;
routed.recruits = [{ id: 11, name: 'Route', class: 'heavy', hp: 120, maxHp: 120, atk: 12, armor: 3, training: 0, gear: { weapon: null, armor: null, gadget: null } }];
Battle.deploy(routed, [0]);
routed.raid.loot = 100;
assert.equal(Battle.chooseRoute(routed, 'risk'), false, 'в бою маршрут не меняется');
routed.raid.depth = 5; routed.raid.cleared = true;
assert.equal(Battle.chooseRoute(routed, 'invalid'), false);
assert.equal(routed.raid.depth, 5);
assert.equal(Battle.chooseRoute(routed, 'risk'), true);
assert.equal(routed.raid.depth, 6);
assert.equal(routed.raid.route, 'risk');
assert.equal(routed.raid.loot, 100, 'груз не меняется при выборе маршрута');
assert.equal(Battle.chooseRoute(routed, 'safe'), false, 'выбор уже сделан');
const persisted = State.migrate(clone(routed));
assert.equal(persisted.raid.route, 'risk', 'маршрут переживает JSON-восстановление');

let elites = 0, ordinary = 0;
for (let seed = 1; seed <= 100; seed++) {
  const safe = Battle.createEncounter({ depth: 6, route: 'safe', seed: seed * 9321 });
  const risk = Battle.createEncounter({ depth: 6, route: 'risk', seed: seed * 9321 });
  assert.equal(JSON.stringify(risk), JSON.stringify(Battle.createEncounter({ depth: 6, route: 'risk', seed: seed * 9321 })), 'детерминизм по seed');
  for (let i = 0; i < safe.length; i++) {
    assert.equal(safe[i].type, risk[i].type);
    assert(risk[i].hp >= safe[i].hp);
    assert(risk[i].attackFactor > safe[i].attackFactor);
    assert(risk[i].rewardFactor > safe[i].rewardFactor);
    if (risk[i].elite) elites++; else ordinary++;
  }
}
assert(elites > 0 && ordinary > 0, 'элита и рядовые враги генерируются');
assert(Battle.createEncounter({ depth: 10, route: 'risk', seed: 3 }).every(e => e.type === 5 && !e.elite), 'шлюз — всегда один босс');

/* --- Находки сектора: детерминизм и распределение на 1000 seed --- */
const counts = { cache: 0, medical: 0, none: 0 };
for (let i = 0; i < 1000; i++) {
  const base = State.fresh();
  base.raid = { depth: 1, seed: (i * 2654435761) >>> 0, crew: [{ hp: 20, maxHp: 90, deployHp: 90 }, { hp: 0, maxHp: 90, deployHp: 90 }], foes: [{ hp: 0 }], loot: 0, log: [], kits: 0, kitsBought: 0, kitTier: 1, kitPrice: 12, kitHeal: 30, kitCapacity: 3, cleared: false, speed: 1 };
  let expected;
  for (let attempt = 0; attempt < 2; attempt++) {
    const p = clone(base);
    Battle.clearSector(p);
    const value = JSON.stringify({ event: p.raid.sectorEvent, loot: p.raid.loot, crew: p.raid.crew, seed: p.raid.seed });
    if (attempt) assert.equal(value, expected, 'событие сектора воспроизводимо по seed');
    else expected = value;
    assert.equal(p.raid.crew[1].hp, 0, 'медицинская находка не воскрешает павших');
  }
  const p = clone(base);
  Battle.clearSector(p);
  counts[p.raid.sectorEvent?.kind || 'none']++;
}
assert(counts.cache > 200 && counts.cache < 300, 'тайник ~25%: ' + counts.cache);
assert(counts.medical > 100 && counts.medical < 200, 'медицина ~15%: ' + counts.medical);
assert(counts.none > 500, 'пустые проходы ~60%: ' + counts.none);
console.log('Секторные события на 1000 seed:', counts);

/* --- Аптечки и приказы (прежние проверки) --- */
const foes = [{ type: 0, hp: 45 }, { type: 1, hp: 7 }, { type: 5, hp: 80 }];
assert.equal(Preparation.target(foes, 'front'), foes[0]);
assert.equal(Preparation.target(foes, 'weak'), foes[1]);
assert.equal(Preparation.target(foes, 'threat'), foes[2]);
assert.equal(Preparation.target([{ hp: 0 }], 'weak'), null);
assert.throws(() => Preparation.restoreRaid({ kits: 3, kitsBought: 1 }));
assert.throws(() => Preparation.restoreRaid({ kitTier: 4 }));
assert.throws(() => Preparation.restoreRaid({ kitTier: 2, kitPrice: 1 }));

let prepS = State.fresh(); prepS.res.credits = 0; prepS.prep = { order: 'weak', kits: 3 };
State.recruit(prepS, false);
assert.equal(Battle.deploy(prepS, [0]).reason, 'funds', 'нельзя высадиться без денег на выбранные аптечки');
prepS.res.credits = 36;
assert.equal(Battle.deploy(prepS, [0]).ok, true);
assert.equal(prepS.res.credits, 0);
assert.equal(prepS.raid.order, 'weak');
assert.equal(prepS.raid.kits, 3);
prepS.raid.crew[0].hp = 20;
const kit = Preparation.useKit(prepS.raid);
assert.equal(kit.healed, 30);
assert.equal(kit.unit, prepS.raid.crew[0], 'событие аптечки получает ссылку на бойца');
assert.equal(prepS.raid.kits, 2);
assert.equal(prepS.raid.crew[0].hp, 50);
const restoredKit = State.migrate(clone(prepS));
assert.equal(Preparation.useKit(restoredKit.raid), null, 'выше порога аптечка не тратится');
Battle.finish(restoredKit, true);
assert.equal(restoredKit.lastRefund, 24, 'остаток возвращается по цене закупки');

// Приказ влияет на реальный бой
let ordered = State.fresh(); ordered.res.credits = 0; ordered.prep = { order: 'weak', kits: 0 };
State.recruit(ordered, false);
Battle.deploy(ordered, [0]);
ordered.raid.foes = [{ type: 0, hp: 100, maxHp: 100 }, { type: 1, hp: 1, maxHp: 50 }];
Battle.turn(ordered);
assert.equal(ordered.raid.foes[0].hp, 100, 'раненый противник добивается первым');
assert.equal(ordered.raid.foes[1].hp, 0);

/* --- Такт отряда: аптечка и медик как события --- */
let medicS = State.fresh(); medicS.res.credits = 20; medicS.prep = { order: 'front', kits: 1 };
medicS.recruits = [{ id: 1, name: 'Медик-1', class: 'medic', hp: 90, maxHp: 90, atk: 8, armor: 2, training: 0, gear: { weapon: null, armor: null, gadget: null } }];
assert.equal(Battle.deploy(medicS, [0]).ok, true);
assert.equal(medicS.res.credits, 8, 'аптечка оплачена');
medicS.raid.turn = 2; // следующий ход станет третьим
medicS.raid.crew[0].hp = 25; // 25/90 ≤ 35% → аптечка
medicS.raid.foes = [{ type: 0, hp: 60, maxHp: 60, attackFactor: 1, rewardFactor: 1 }];
const kitTurn = Battle.turn(medicS);
assert.equal(kitTurn.events[0].t, 'kit', 'аптечка срабатывает первой');
assert.equal(kitTurn.events[0].amount, 30);
assert.equal(medicS.raid.kits, 0);
const healEvent = kitTurn.events.find(e => e.t === 'heal' && e.source === 'medic');
assert(healEvent, 'медик лечит на своём ходу');
assert(healEvent.amount > 0);
assert(medicS.raid.crew[0].hp <= medicS.raid.crew[0].maxHp, 'лечение не превышает maxHp');

/* --- Автоматика шлюза, скорость, прогрессия, форматирование --- */
function checkpoint(count, speed) { return { crew: Array.from({ length: 4 }, (_, i) => ({ hp: i < count ? 100 : 0 })), depth: 5, cleared: true, speed }; }
for (const speed of [1, 2, 4]) for (const count of [1, 2, 3, 4]) {
  const r = checkpoint(count, speed), delay = speed === 1 ? 15000 : 5000;
  assert.equal(Automation.step(r, delay - 1), null, 'граница таймера ' + speed + '/' + count);
  assert.equal(Automation.step(r, 1), count === 4 ? 'risk' : count === 3 ? 'safe' : null);
}
let countdown = checkpoint(4, 1);
Automation.step(countdown, 3000);
Automation.changeSpeed(countdown, 4);
assert.equal(countdown.autoRemainingMs, 4000, 'смена скорости пересчитывает остаток');
countdown = checkpoint(4, 1); countdown.autoCancelled = true;
assert.equal(Automation.step(countdown, 99999), null, 'отмена авто-выбора');
countdown = checkpoint(4, 1); countdown.cleared = false;
assert.equal(Automation.step(countdown, 99999), null, 'вне шлюза отсчёта нет');

// Штатная обёртка: пауза, скрытая вкладка, overlay
let gate = battleProfile(21); gate.raid.depth = 5; gate.raid.cleared = true; gate.raid.transitionTicks = 3; gate.raid.speed = 2;
Automation.ensure(gate.raid);
assert.equal(gate.raid.autoRemainingMs, 5000, 'при ×2 отсчёт 5 секунд');
const full = ui({ paused: true });
assert.equal(Battle.stepCheckpoint(gate, full, 5000).choice, null, 'на паузе отсчёт не идёт');
assert.equal(gate.raid.autoRemainingMs, 5000);
assert.equal(Battle.stepCheckpoint(gate, ui({ hidden: true }), 5000).choice, null, 'скрытая вкладка не тикает');
assert.equal(gate.raid.autoRemainingMs, 5000);
const half = Battle.stepCheckpoint(gate, ui(), 4999);
assert.equal(half.choice, null);
assert.equal(half.changed, true, 'секунда изменилась — интерфейс нужно обновить');
const done = Battle.stepCheckpoint(gate, ui(), 1);
assert.equal(done.choice, 'risk', 'четыре живых — сложный маршрут');
assert.equal(Battle.chooseRoute(gate, done.choice), true);
assert.equal(gate.raid.depth, 6);

// Экран шлюза (overlay 'room') не блокирует отсчёт — иначе автовыбор молчит (фикс 0.4.0)
let gateRoom = battleProfile(22); gateRoom.raid.depth = 5; gateRoom.raid.cleared = true; gateRoom.raid.speed = 1;
Automation.ensure(gateRoom.raid);
assert.equal(Battle.stepCheckpoint(gateRoom, ui({ overlay: 'room' }), 15000).choice, 'risk', 'overlay шлюза не блокирует автовыбор');
let gateDialog = battleProfile(23); gateDialog.raid.depth = 5; gateDialog.raid.cleared = true;
Automation.ensure(gateDialog.raid);
assert.equal(Battle.stepCheckpoint(gateDialog, ui({ overlay: 'dialog' }), 15000).choice, null, 'открытый диалог блокирует отсчёт');

// Скорость сохраняется через деплой и JSON
let speedy = State.fresh(); speedy.res.credits = 0; speedy.settings = { speed: 2 };
State.recruit(speedy, false);
Battle.deploy(speedy, [0]);
assert.equal(speedy.raid.speed, 2);
assert.equal(State.migrate(clone(speedy)).settings.speed, 2);

assert.equal(Progression.medbay(1).capacity, 3);
assert.equal(Progression.medbay(3).capacity, 5);
assert.equal(Progression.medbay(5).tier, 3);
assert.equal(Progression.medbay(50).capacity, 12);
assert.equal(Preparation.normalize({ kits: 99, kitTier: 3 }, 3).kitTier, 2);
assert.equal(Preparation.normalize({ kits: 99 }, 3).kits, 5);
for (const [level, tier, heal, price] of [[1, 1, 30, 12], [3, 2, 55, 22], [5, 3, 90, 36]]) {
  const p = State.fresh(); p.buildings.medbay = level; p.res.credits = 1000; p.prep = { kits: 2, kitTier: tier };
  const unit = State.recruit(p, false); unit.hp = 200; unit.maxHp = 200;
  Battle.deploy(p, [0]);
  assert.equal(p.res.credits, 1000 - price * 2, 'уровень аптечек фиксируется при высадке');
  p.raid.crew[0].hp = 10;
  assert.equal(Preparation.useKit(p.raid).healed, heal);
  const saved = State.migrate(clone(p));
  saved.buildings.medbay = 10;
  Battle.finish(saved, true);
  assert.equal(saved.lastRefund, price, 'возврат по цене закупки, а не по новому уровню');
}
assert(Progression.barracks(5).hp > Progression.barracks(1).hp);
assert(Progression.armory(5).pierce > 0);
assert(Progression.command(5).recovery > 0.35);
assert(Progression.command(5).reward > 1);

for (const [value, expected] of [[999, '999'], [1000, '1К'], [1250, '1,25К'], [1000000, '1М'], [1250000, '1,25М']])
  assert.equal(GameUI.money(value), expected);
assert.equal(GameUI.money(1234567, true).replace(/\s/g, ''), '1234567');
assert(GameUI.healthRow('<script>', 0, 100).includes('&lt;script&gt;'));
assert(GameUI.healthRow('Тест', 50, 100).includes('mid'), 'жёлтая полоса 30–60%');
assert(GameUI.healthRow('Тест', 20, 100).includes('low'), 'красная полоса <30%');
assert(GameUI.healthRow('Тест', 90, 100).includes('high'), 'зелёная полоса >60%');

// Конфиг констант: баланс не трогали, но числа в одном месте
assert.equal(Balance.buildings.cost, 85);
assert.equal(Balance.hiring.cost, 20);
assert.equal(Balance.version, '0.4.1');
assert.equal(Balance.profileVersion, 3);
assert.equal(Balance.rewards.extractFlat, 12);
assert.equal(Balance.routes.risk.reward, 1.5);

/* --- Детерминированные бои на десяти seed --- */
let wins = 0;
for (let seed = 1; seed <= 10; seed++) {
  const profile = State.fresh(); profile.res.credits = 0;
  profile.recruits = ['heavy', 'medic', 'assault', 'engineer'].map((c, i) => ({ id: i + 1, name: c, class: c, hp: 95, maxHp: 95, atk: 12, armor: 3, training: 1, gear: { weapon: null, armor: null, gadget: null } }));
  Battle.deploy(profile, [0, 1, 2, 3]);
  profile.raid.seed = seed;
  for (let step = 0; profile.raid && step < 500; step++) {
    const res = Battle.tick(profile, ui());
    const r = profile.raid;
    if (!r) break;
    if (res.status === 'defeat') { Battle.finish(profile, false); break; }
    if (r.cleared && r.depth % Balance.raid.checkpointEvery === 0 && Battle.canExtract(profile, ui({ overlay: 'room' }))) {
      Battle.extract(profile, ui({ overlay: 'room' })); wins++; break;
    }
  }
  assert.equal(profile.raid, null, 'рейд завершается');
}
assert(wins >= 5, 'сбалансированный отряд доходит до эвакуации: ' + wins + '/10');

console.log('Economy: миграция v3, лечение, события боя, перенос ранений, статистика, эвакуация и детерминизм passed');