/* Smoke UI со стабами DOM: шаблоны0.4.0 (лечение, графики, итоги, диалоги),
   удержание «Улучшить» и массовые покупки. Не является визуальной проверкой. */
const fs = require('node:fs'), vm = require('node:vm'), assert = require('node:assert/strict');

function make2d() {
  const store = {};
  return new Proxy(store, {
    get: (t, p) => {
      if (p === 'measureText') return () => ({ width: 42 });
      if (p === 'createLinearGradient' || p === 'createRadialGradient') return () => ({ addColorStop() {} });
      if (p in t) return t[p];
      return () => {};
    },
    set: (t, p, v) => { t[p] = v; return true; }
  });
}
const canvasStub = () => ({ width: 840, height: 240, getContext: () => make2d() });
const nodes = Object.fromEntries(['#app', '#resources', '#notice', 'nav'].map(k => [k, { innerHTML: '', textContent: '', hidden: false }]));
const regions = Object.fromEntries(['#raid-hud', '#route-track', '#sector-status', '#raid-event-wrap', '#raid-log', '#raid-crew', '#raid-foes', '#raid-kits', '#raid-loot', '#resources strong', '#building-barracks .tag'].map(k => [k, { innerHTML: '', textContent: '' }]));
const charts = Object.fromEntries(['#chart-deaths', '#chart-loot', '#chart-outcomes', '#arena'].map(k => [k, canvasStub()]));
const node = q => nodes[q] || regions[q] || charts[q] || null;
nodes['#app'].querySelector = q => node(q);

const context = {
  console, Math, Set,
  document: {
    querySelector: q => node(q),
    querySelectorAll: () => [],
    getElementById: id => nodes['#' + id] || null,
    addEventListener() {}, hidden: false, activeElement: null,
    createElement: () => ({ style: {}, click() {}, setAttribute() {} })
  },
  localStorage: {
    getItem: () => JSON.stringify({ v: 2, res: { credits: 1234567 }, buildings: { barracks: 5, armory: 5, medbay: 5, command: 5 }, recruits: [], items: [], raid: null, deepest: 0, run: 0 }),
    setItem() {}
  },
  setInterval: () => 1, clearInterval() {}, requestAnimationFrame() {},
  addEventListener() {}, matchMedia: () => ({ matches: false })
};
context.window = context;
for (const file of ['balance.js', 'progression.js', 'automation.js', 'interface.js', 'preparation.js', 'state.js', 'battle.js', 'screens.js', 'base-scene.js', 'arena.js', 'input.js'])
  vm.runInNewContext(fs.readFileSync(file, 'utf8'), context);

const smokeSource = fs.readFileSync('game.js', 'utf8').replace('render();requestAnimationFrame(animate);', `globalThis.smoke={
 render,
 open:t=>{screen='game';tab=t;render()},
 menu:()=>{screen='menu';render()},
 stats:()=>{screen='stats';render()},
 refresh:()=>refreshRaid(),
 raid:()=>{S.raid={crew:[{id:1,name:'Тест',class:'heavy',hp:100,maxHp:100,deployHp:100,armor:2,atk:10,gear:{weapon:null,armor:null,gadget:null}}],depth:5,cleared:true,loot:12345,speed:1,log:['Контакт: Личинка'],kits:0,kitsBought:0,kitTier:1,kitHeal:30,kitPrice:12,foes:[{type:0,elite:false,hp:0,maxHp:30}]};screen='game';tab='raid';overlay='room';paused=false;render()},
 raidActive:()=>{S.raid={crew:[{id:1,name:'Тест',class:'heavy',hp:100,maxHp:100,deployHp:100,armor:2,atk:10,gear:{weapon:null,armor:null,gadget:null}}],depth:2,cleared:false,loot:100,speed:1,log:[],kits:0,kitsBought:0,kitTier:1,kitHeal:30,kitPrice:12,foes:[{type:0,elite:false,hp:40,maxHp:60,attackFactor:1,rewardFactor:1}]};S.raid.seed=9;screen='game';tab='raid';overlay='';paused=false;render()},
 result:(withResult=true)=>{screen='result';overlay='win';S.lastLoot=12345;S.lastRefund=60;S.run=3;S.lastResult=null;
  if(withResult)S.lastResult={ok:true,run:3,depth:10,slowHealed:9,aborted:false,changes:[
    {id:1,name:'Ким-42',before:82,after:45,status:'alive',xp:null},
    {id:2,name:'Орлов-31',before:90,after:0,status:'dead',xp:null},
    {id:3,name:'Вега-77',before:70,after:70,status:'alive',xp:null}],
   loot:{battle:9000,cache:2000,extract:740,refund:60,cargo:11740},
   losses:{kits:0,kitPrice:12,cargo:0,dead:['Орлов-31']}};
  render()},
 profile:()=>S,
 uiState:()=>uiState(),
 dialog:d=>{dialog=d;render()}
};`);
vm.runInNewContext(smokeSource, context);
const Game = context.Game, State = context.State;
const plain = s => s.replace(/ /g, ' ');

/* --- Меню: кошелёк, кнопки, затемнённая живая сцена --- */
context.smoke.render();
assert(nodes['#resources'].innerHTML.includes('1,23М'), 'суммы в меню сокращаются');
const menuHtml = nodes['#app'].innerHTML;
assert(menuHtml.includes('Перейти на базу'));
assert(menuHtml.includes('data-action="stats"'), 'кнопка «Статистика» в меню');
assert(menuHtml.includes('id="menu-demo"'), 'живая сцена в меню');
assert(menuHtml.includes('menu-dim'), 'затемнение поверх сцены');
assert(menuHtml.includes('pointer-events:none') === false, 'стили — в CSS, не инлайном');
assert(menuHtml.includes('ВЕРСИЯ 0.4.1'), 'версия пакета в меню');

/* --- База, отряд, настройки, рейд --- */
for (const tab of ['base', 'squad', 'save', 'raid']) {
  context.smoke.open(tab);
  assert(nodes['#app'].innerHTML.length > 100, tab + ' отрисован');
}
context.smoke.open('save');
assert(nodes['#app'].innerHTML.includes('data-action="new"'), 'новая игра в настройках');

/* --- Карточка лечения --- */
const S = context.smoke.profile();
S.res.credits = 1000;
assert.equal(S.recruits.length, 0);
State.recruit(S, false);
const rec = S.recruits[0];
rec.hp = Math.max(1, rec.maxHp - 40);
context.smoke.open('squad');
let html = nodes['#app'].innerHTML;
assert(html.includes('data-action="heal"'), 'кнопка лечения в карточке');
assert(html.includes('Лечить · ₡'), 'цена лечения показана');
assert(html.includes(rec.hp + ' / ' + rec.maxHp), 'полоса hp / maxHp');
assert(/class="hp-track (high|mid|low)"/.test(html), 'цветовая категория полосы');
assert(html.includes('crew-card-foot'), 'подвал карточки с лечением');
assert(html.includes('crew-select'), 'внутри карточки — кнопка выбора');
const cost = State.healCost(rec.maxHp, rec.hp, S.buildings.medbay);
const creditsBefore = S.res.credits;
Game.action('heal', { dataset: { index: '0' } });
assert.equal(rec.hp, rec.maxHp, 'лечение восстанавливает до maxHp');
assert.equal(S.res.credits, creditsBefore - cost, 'лечение списывает кредиты');
html = nodes['#app'].innerHTML;
assert(html.includes('Здоров'), 'при полном здоровье — «Здоров»');
assert(/data-action="heal" data-index="0" disabled/.test(html), 'кнопка отключена при полном HP');

/* --- Экран рейда: динамические регионы и каркас --- */
context.smoke.raid();
html = nodes['#app'].innerHTML;
assert(html.includes('только вручную'), 'подсказка автовыбора у шлюза');
assert(html.includes('12,34К'), 'груз с сокращением в HUD');
assert(html.includes('data-action="extract"'), 'кнопка эвакуации на шлюзе');
assert(html.includes('id="raid-hud"') && html.includes('id="raid-log"') && html.includes('id="raid-crew"'), 'регионы рейда размечены');
assert(html.includes('id="raid-loot"') && html.includes('id="raid-kits"'), 'груз и запас аптечек в разметке');

// Раненый боец в рейде не выбирается заново, но виден в HUD
const selectedBefore = JSON.stringify(context.smoke.uiState().selected);
Game.pick(0);
assert.equal(JSON.stringify(context.smoke.uiState().selected), selectedBefore, 'выбор зафиксирован во время рейда');

/* --- Точечное обновление рейда без пересборки каркаса --- */
context.smoke.raidActive();
const appBefore = nodes['#app'].innerHTML;
context.smoke.profile().raid.loot = 777;
context.smoke.refresh();
assert(node('#raid-loot').innerHTML.includes('777'), 'регион груза обновлён точечно');
assert(node('#raid-hud').innerHTML.includes('СЕКТОР 2'), 'HUD обновлён точечно');
assert.equal(nodes['#app'].innerHTML, appBefore, 'каркас экрана рейда не пересобирался');

/* --- Итоги рейда: изменения по бойцам и разбивка добычи --- */
context.smoke.result();
assert(!nodes['#resources'].innerHTML.includes('1,23М'), 'в итогах — точная сумма');
let out = nodes['#app'].innerHTML;
assert(out.includes('ЭВАКУАЦИЯ УСПЕШНА'));
assert(out.includes('−37 HP (82 → 45)'), 'изменение HP бойца');
assert(out.includes('Орлов-31') && out.includes('погиб'), 'погибшие в списке изменений');
assert(out.includes('без изменений'), 'неизменные бойцы в списке');
assert(out.includes('За бои') && out.includes('Тайники'), 'разбивка добычи');
assert(out.includes('Бонус эвакуации') && out.includes('Возврат припасов'));
assert(out.includes('Итого на базу'), 'итоговая строка');
assert(out.includes('Медблок · медленное лечение'), 'медленное лечение в отчёте');
assert(out.includes('Не вернулись: Орлов-31'), 'потери названы');
assert(out.includes('data-action="dismiss"'), 'кнопка возврата на базу');
// Совместимость: отчёт без lastResult показывает старые поля
context.smoke.result(false);
out = nodes['#app'].innerHTML;
assert(out.includes('Добыча') && plain(out).includes('12 345'), 'старый формат отчёта не ломается');

/* --- Графики --- */
context.smoke.stats();
out = nodes['#app'].innerHTML;
assert(out.includes('id="chart-deaths"'), 'график смертности');
assert(out.includes('id="chart-loot"'), 'график добычи');
assert(out.includes('id="chart-outcomes"'), 'график исходов');
assert(out.includes('Смертность по глубине'));
assert(out.includes('data-action="menu"'), 'возврат в меню');
assert(typeof context.Screens.drawStats === 'function');
// Данные для графиков накапливаются в профиле
const stats = context.Screens && context.smoke.profile().stats;
assert(stats && stats.byDepth && stats.total, 'stats в профиле v3');
assert.equal(typeof stats.total.kills, 'number');

/* --- Внутренние диалоги вместо confirm/alert --- */
context.smoke.open('save');
Game.action('new');
out = nodes['#app'].innerHTML;
assert(out.includes('role="dialog"') && out.includes('aria-modal="true"'), 'подтверждение — модальный диалог');
assert(out.includes('Начать новую игру?'));
assert(out.includes('data-action="dialog-cancel"') && out.includes('data-action="dialog-confirm"'));
Game.action('dialog-cancel');
assert(!nodes['#app'].innerHTML.includes('Начать новую игру?'), 'отмена закрывает диалог');

context.smoke.raid();
context.smoke.open('save');
assert(nodes['#app'].innerHTML.includes('data-action="newrun"'), 'прерывание рейда доступно из сохранений');
Game.action('newrun');
out = nodes['#app'].innerHTML;
assert(out.includes('Прервать текущую экспедицию?'), 'диалог вместо confirm()');
Game.action('dialog-confirm');
assert.equal(context.smoke.profile().raid, null, 'рейд прерван через диалог');
assert(nodes['#app'].innerHTML.includes('ОТРЯД ПОТЕРЯН'), 'прерывание показывает отчёт');

/* --- Удержание «Улучшить» (прежняя проверка жеста) --- */
const button = { dataset: { up: 'barracks' } };
context.document.querySelectorAll = q => q === '[data-up]' ? [button] : [];
context.AbortController = AbortController;
const pointerEvents = {};
context.addEventListener = (name, handler) => { pointerEvents[name] = handler; };
let pending;
context.setTimeout = fn => { pending = fn; return 1; };
context.clearTimeout = () => { pending = null; };
const advanceHold = () => { const run = pending; pending = null; run(); };
const pointer = { isPrimary: true, button: 0, pointerId: 1 };
context.smoke.open('base');
button.onpointerdown(pointer);
advanceHold();
assert.match(button.textContent, /510/);
advanceHold();
assert.match(button.textContent, /595/);
pointerEvents.pointerup(pointer);
button.onclick({ detail: 1 });
assert.equal(pending, null);
assert.match(nodes['#app'].innerHTML, /Ур\. 7 → 8/);
button.onpointerdown(pointer);
pointerEvents.pointerup(pointer);
button.onclick({ detail: 1 });
assert.match(nodes['#app'].innerHTML, /Ур\. 8 → 9/);
console.log('Upgrade hold: two purchases, release without extra purchase, then single click passed');

/* --- Массовые покупки --- */
const bulkContextSource = smokeSource.replace('globalThis.smoke={', 'globalThis.smoke={profile:()=>S,');
const buyAll = { dataset: { action: 'buy-all' } };
const buyMedbay = { dataset: { action: 'buy-max-medbay' } };
context.document.querySelectorAll = q => q === '[data-action]' ? [buyAll, buyMedbay] : [];
vm.runInNewContext(bulkContextSource, context);
const profile = context.smoke.profile();
profile.buildings = { barracks: 3, armory: 1, medbay: 1, command: 2 };
profile.res.credits = 500;
context.smoke.open('base');
buyAll.onclick();
assert.deepEqual(profile.buildings, { barracks: 3, armory: 3, medbay: 2, command: 2 });
assert.equal(profile.res.credits, 160);
buyAll.onclick();
assert.equal(profile.res.credits, 160, 'повторная покупка без средств не тратит деньги');
profile.res.credits = 600;
buyMedbay.onclick();
assert.deepEqual(profile.buildings, { barracks: 3, armory: 3, medbay: 4, command: 2 });
assert.equal(profile.res.credits, 175);
console.log('Bulk upgrades: catch-up, insufficient funds and single building purchase passed');

/* --- Ошибка импорта JSON: alert заменён диалогом (асинхронный файл) --- */
(async () => {
  const current = context.Game; // после перезапуска source в массовых покупках
  await current.importFile({ text: async () => { throw Error('bad json'); } });
  out = nodes['#app'].innerHTML;
  assert(out.includes('Сохранение не загружено'), 'ошибка импорта — внутренний диалог');
  assert(out.includes('Файл повреждён'), 'текст ошибки импорта');
  current.action('dialog-confirm');
  assert(!nodes['#app'].innerHTML.includes('Сохранение не загружено'));
  console.log('UI templates: menu scene, healing card, raid regions, results, charts, dialogs, hold and bulk passed (DOM stubs, no visual verification)');
})();