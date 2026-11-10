(()=>{'use strict';
const KEY='xenocide.outpost.v1', classes={assault:'Штурмовик',heavy:'Тяжёлый',medic:'Медик',engineer:'Инженер',vagrant:'Бродяга'}, enemies=['Личинка','Ползун','Плевальщик','Панцирник','Узел гнезда','Матка'];
const fresh=()=>({v:2,res:{credits:145},buildings:{barracks:1,armory:1,medbay:1,command:1},settings:{speed:1},prep:{order:'front',kits:0},recruits:[],items:['Импульсная винтовка','Полевой медкомплект','Осколочная граната','Бронепластина','Карабин МК-2','Энергетический аккумулятор','Автотурель «Оса»','Экспериментальный плазморез','Сканер биомассы','Зажигательный заряд','Стабилизатор прицела','Страховой маяк'],raid:null,deepest:0,run:0});
function migrate(s){if(!s||![1,2].includes(s.v)||!s.res||!s.buildings||!Array.isArray(s.recruits)||!Array.isArray(s.items))throw Error('save');if(s.v===1){const amount=x=>Number.isFinite(x)&&x>=0?Math.floor(x):0;s.res={credits:amount(s.res.credits)+amount(s.res.scrap)+amount(s.res.data)};if(s.raid){s.raid.loot=amount(s.raid.loot)+amount(s.raid.data);delete s.raid.data}if(s.lastLoot!=null)s.lastLoot=amount(s.lastLoot)+amount(s.lastData);delete s.lastData;s.v=2}if(!Number.isFinite(s.res.credits)||s.res.credits<0)throw Error('save');s.settings={speed:Automation.validSpeed(s.settings?.speed??s.raid?.speed)};s.prep=Preparation.normalize(s.prep,s.buildings.medbay);Preparation.restoreRaid(s.raid);if(s.raid){s.raid.speed=s.settings.speed;Automation.ensure(s.raid)}return s}
let S,initial=false;try{let saved=localStorage.getItem(KEY);initial=!saved;S=saved?migrate(JSON.parse(saved)):fresh()}catch{S=fresh();initial=true}let tab='base',screen='menu',selected=[],timer=null,paused=false,overlay='',deploymentError='';
function save(){try{localStorage.setItem(KEY,JSON.stringify(S));document.querySelector('#notice').textContent='АВТОСОХРАНЕНИЕ АКТИВНО'}catch{document.querySelector('#notice').textContent='ХРАНИЛИЩЕ НЕДОСТУПНО · ЭКСПОРТИРУЙТЕ JSON'}}function el(s){return document.querySelector(s)}function h(s){return String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
function recruit(free=false,requested=null){let c=free?'vagrant':requested||['assault','heavy','medic','engineer'][Math.floor(Math.random()*4)],n=['Ким','Орлов','Вега','Сато','Ильин','Морено'][Math.floor(Math.random()*6)],training=Progression.barracks(S.buildings.barracks);S.recruits.push({id:Date.now()+Math.random(),name:n+'-'+(10+Math.floor(Math.random()*89)),class:c,hp:free?55+Math.floor(Math.random()*16):75+Math.floor(Math.random()*36)+training.hp,atk:free?5+Math.floor(Math.random()*3):9+Math.floor(Math.random()*8)+training.attack,armor:free?0:Math.floor(Math.random()*6)+training.armor,training:free?0:training.rank,gear:null});save();render()}
function render(){
 stopUpgradeHold(false);
 const focus=GameUI.capture(),nav=document.querySelector('nav'),app=el('#app');nav.hidden=screen!=='game';
 el('#resources').innerHTML=`<span class="wallet-label">КРЕДИТЫ БАЗЫ</span><strong>₡ ${cash(S.res.credits,screen==='result'&&overlay==='win')}</strong>`;
 if(screen==='menu'){
 app.innerHTML=`<div class="title-screen"><div class="title-mark">XENOCIDE<br><strong>OUTPOST</strong></div><p>ПОСТ «КОВЧЕГ» · ВНЕШНИЙ ПЕРИМЕТР</p><div class="actions">${S.raid?'<button class="primary" data-action="resume">Продолжить экспедицию</button>':''}<button data-action="open-base">${S.raid?'Открыть базу':'Перейти на базу →'}</button><button data-action="menusettings">Сохранения</button></div><small>${S.raid?'РЕЙД СОХРАНЁН · СЕКТОР '+S.raid.depth:'СФОРМИРУЙТЕ ОТРЯД И ОТПРАВЬТЕ ЕГО ЗА РЕСУРСАМИ'}</small></div>`;
 }else if(screen==='result'){
 app.innerHTML=`<div class="overlay result-screen"><div class="dialog" role="dialog" aria-modal="true" aria-labelledby="dialog-title"><small>ОТЧЁТ · ОПЕРАЦИЯ ${S.run}</small><h2 id="dialog-title">${overlay==='win'?'ЭВАКУАЦИЯ УСПЕШНА':'ОТРЯД ПОТЕРЯН'}</h2><p>${overlay==='win'?'Груз доставлен на базу. Можно готовить следующий отряд.':'Павшие исключены из списка. Бесплатные бродяги помогут восстановиться.'}</p><div class="result-rewards"><div><span>Добыча</span><strong>₡ ${cash(S.lastLoot||0,overlay==='win')}</strong></div><div><span>Возврат припасов</span><strong>₡ ${cash(S.lastRefund||0,overlay==='win')}</strong></div></div><button class="primary wide" data-action="dismiss">Вернуться на базу →</button></div></div>`;
 }else{
 document.querySelectorAll('nav [data-tab]').forEach(b=>{b.classList.toggle('active',b.dataset.tab===tab);b.setAttribute('aria-current',b.dataset.tab===tab?'page':'false')});
 const raidTab=document.querySelector('nav [data-tab="raid"]');if(raidTab)raidTab.textContent=S.raid?'Экспедиция · '+S.raid.depth:'Экспедиция';
 app.innerHTML=(S.raid&&tab!=='raid'?'<div class="raid-reminder"><span>Экспедиция приостановлена, пока открыт этот экран.</span><button data-action="resume">Вернуться к отряду →</button></div>':'')+(tab==='base'?base():tab==='squad'?squad():tab==='raid'?raidHtml():saveHtml());
 }
 bind();GameUI.restore(focus);if(screen==='game'&&tab==='raid'&&S.raid)Arena.render(el('#arena'),S.raid,visualTime,!paused&&!overlay&&!S.raid.cleared);
}
const buildingNames={barracks:'Казармы',armory:'Арсенал',medbay:'Медблок',command:'Командный центр'};
function base(){
 return `<div class="page-heading"><div><small>ОПЕРАЦИОННЫЙ ЦЕНТР</small><h2>Пост «Ковчег»</h2></div><button class="primary" data-${S.raid?'action="resume"':'tab="squad"'}>${S.raid?'Вернуться к экспедиции':'Подготовить отряд →'}</button></div>`+BaseScene.html(S.buildings)+`<div class="base-metrics"><div><span>Бойцов на базе</span><strong>${S.recruits.length}</strong></div><div><span>Максимальная глубина</span><strong>${S.deepest}</strong></div><div><span>Завершено рейдов</span><strong>${S.run}</strong></div></div><section class="panel"><div class="section-heading"><div><small>РАЗВИТИЕ БАЗЫ</small><h3>Здания и улучшения</h3><button class="bulk-upgrade" data-action="buy-all" ${Object.keys(buildingNames).some(key=>S.res.credits>=85*S.buildings[key])?'':'disabled'}>Купить на всё</button></div><span class="muted">Общая покупка сначала улучшает здания с самым низким уровнем.</span></div><div class="buildings">${Object.entries(buildingNames).map(([key,name])=>{const level=S.buildings[key],price=85*level;return `<article class="building" id="building-${key}" tabindex="-1"><div class="row"><h3>${name}</h3><span class="tag">Ур. ${level} → ${level+1}</span></div><p class="upgrade-current"><b>Сейчас</b><br>${Progression.describe(key,level)}</p><div class="upgrade-benefit"><b>Следующий уровень</b><br>${Progression.describe(key,level+1)}</div><button class="wide" data-up="${key}" ${S.res.credits<price?'disabled':''}>Улучшить · ₡ ${cash(price)}</button><button class="wide bulk-upgrade" data-action="buy-max-${key}" ${S.res.credits<price?'disabled':''}>Прокачать на всю сумму</button><span class="cost-hint">${S.res.credits<price?'Не хватает ₡ '+cash(price-S.res.credits):'Кредитов достаточно'}</span></article>`}).join('')}</div></section>`;
}
const classHelp={assault:'Усиленная очередь каждый третий ход',heavy:'Принимает удары и снижает входящий урон',medic:'Лечит раненых каждый третий ход',engineer:'Дополнительный урон от огневой поддержки',vagrant:'Бесплатный боец без брони'};
function pickSquad(index){if(S.raid||!S.recruits[index])return;if(selected.includes(index))selected=selected.filter(i=>i!==index);else if(selected.length<4)selected.push(index);render()}
function autoSquad(){if(S.raid)return;selected=[];for(const role of ['heavy','medic','assault','engineer']){const i=S.recruits.findIndex((c,n)=>c.class===role&&!selected.includes(n));if(i>=0)selected.push(i)}for(let i=0;i<S.recruits.length&&selected.length<4;i++)if(!selected.includes(i))selected.push(i);render()}
function squad(){
 selected=selected.filter(i=>S.recruits[i]);const deployed=!!S.raid,crew=deployed?S.raid.crew:selected.map(i=>S.recruits[i]),cost=S.raid?(S.raid.kitsBought||0)*(S.raid.kitPrice||12):Preparation.cost(S.prep,S.buildings.medbay);
 return `<div class="page-heading"><div><small>ПОДГОТОВКА ОПЕРАЦИИ</small><h2>Отряд и снабжение</h2></div><span class="tag">${crew.length} / 4 бойца</span></div>
 <div class="squad-slots">${Array.from({length:4},(_,i)=>crew[i]?`<div class="squad-slot filled"><span class="slot-number">0${i+1}</span><strong>${h(crew[i].name)}</strong><span>${classes[crew[i].class]}</span></div>`:`<div class="squad-slot"><span class="slot-number">0${i+1}</span><strong>Свободное место</strong><span>Выберите бойца ниже</span></div>`).join('')}</div>
 <div class="squad-layout"><div><section class="panel"><div class="section-heading"><h3>Доступные бойцы <span class="muted">${S.recruits.length}</span></h3><div class="actions"><button data-action="auto-squad" ${deployed||!S.recruits.length?'disabled':''}>Подобрать отряд</button><button data-action="clear-squad" ${deployed||!selected.length?'disabled':''}>Снять выбор</button></div></div>
 <p class="muted">${deployed?'Состав текущей экспедиции зафиксирован. Выжившие вернутся после эвакуации.':'Выберите до четырёх бойцов. Автоподбор сначала берёт тяжёлого, медика, штурмовика и инженера.'}</p>
 <div class="crew">${S.recruits.map((r,i)=>`<button type="button" class="crew-card ${selected.includes(i)?'selected':''}" data-pick="${i}" aria-pressed="${selected.includes(i)}" ${deployed||selected.length>=4&&!selected.includes(i)?'disabled':''}><span class="crew-card-head"><span class="class-icon ${r.class}">${classes[r.class].slice(0,1)}</span><span><strong>${h(r.name)}</strong><span class="muted">${classes[r.class]} · ${r.class==='vagrant'?'Без подготовки':Progression.ranks[r.training||0]}</span></span><span class="pick-mark">${selected.includes(i)?'✓':'+'}</span></span><span class="crew-stats"><span><b>${Math.ceil(r.hp)}</b> HP</span><span><b>${r.atk}</b> урон</span><span><b>${r.armor}</b> броня</span></span><span class="role-description">${classHelp[r.class]||''}</span></button>`).join('')||'<div class="empty-state"><h3>Казармы пусты</h3><p>Наймите специалистов или бесплатных бродяг ниже.</p></div>'}</div></section>
 <section class="panel recruit-panel"><small>ПОПОЛНЕНИЕ</small><h3>Нанять бойца</h3><div class="hire-grid">${Object.entries(classes).map(([key,name])=>`<button data-action="${key==='vagrant'?'vagrant':'hire-'+key}" ${key!=='vagrant'&&S.res.credits<20?'disabled':''}><strong>${name}</strong><span>${key==='vagrant'?'Бесплатно':'₡ 20'}</span></button>`).join('')}</div><p class="muted">${S.res.credits<20?'На специалистов не хватает кредитов. Бродяги доступны бесплатно.':'Новый боец появится в списке выше. После найма добавьте его в отряд.'}</p></section></div>
 <aside class="squad-aside">${preparationHtml()}<section class="panel deployment-panel"><small>ГОТОВНОСТЬ К ВЫЛЕТУ</small><h3>${deployed?'Отряд в экспедиции':crew.length?'Состав готов':'Выберите бойцов'}</h3><div class="row"><span>Снабжение при высадке</span><strong>₡ ${cash(cost)}</strong></div><div class="row"><span>На счёте базы</span><strong>₡ ${cash(S.res.credits,screen==='result'&&overlay==='win')}</strong></div>${!deployed&&cost>S.res.credits?`<p class="warn">Не хватает ₡ ${cash(cost-S.res.credits)}. Уменьшите запас аптечек.</p>`:''}<button class="primary wide" data-action="${deployed?'resume':'start'}" ${!deployed&&(!crew.length||cost>S.res.credits)?'disabled':''}>${deployed?'Вернуться к экспедиции':'Высадить отряд →'}</button><p class="muted">Эвакуация доступна после каждого пятого сектора.</p></section></aside></div>`;
}
function raidHtml(){
 if(!S.raid)return `<div class="panel"><small>ПЛАНИРОВАНИЕ ВЫЛАЗКИ</small><h2>Комплекс «Гелиос»</h2><p>Отряд автоматически движется от сектора к сектору. После каждого пятого сектора можно эвакуироваться.</p><p>Состав: ${selected.map(i=>h(S.recruits[i]?.name)).join(', ')||'не выбран'}.</p><button class="primary" data-tab="squad">Выбрать отряд и припасы →</button></div>`;
 const r=S.raid,checkpoint=r.cleared&&r.depth%5===0,event=r.sectorEvent;
 return `<div class="grid battle-layout"><div class="panel"><div class="battlehud"><span>СЕКТОР ${r.depth} · ${paused?'ПАУЗА':r.cleared?'ЗАЧИЩЕН':'КОНТАКТ'}</span><span>ОТРЯД ${r.crew.filter(c=>c.hp>0).length}/${r.crew.length} · ГРУЗ ₡ ${cash(r.loot)}</span></div>
 <div class="route-track">${Array.from({length:5},(_,i)=>{const n=Math.floor((r.depth-1)/5)*5+i+1;return `<span class="${n<r.depth||n===r.depth&&r.cleared?'done':n===r.depth?'current':''}">${n}${n%5===0?' ⚑':''}</span>`}).join('')}</div>
 <canvas id="arena" width="800" height="350"></canvas>
 <div class="sector-status" role="status">${r.cleared?(checkpoint?'Эвакуационный шлюз открыт. Решение за командиром.':paused?'Переход приостановлен.':`Переход в сектор ${r.depth+1} · ${Math.max(1,r.transitionTicks||3)}…`):`До следующего шлюза: сектор ${Math.ceil(r.depth/5)*5}.`}</div>
 ${event?`<div class="raid-event ${event.kind}"><strong>${h(event.title)}</strong><span>${h(GameUI.logLine(event.text))}</span></div>`:''}
 <div class="actions"><button data-action="pause" aria-pressed="${paused}">${paused?'Продолжить':'Пауза'}</button><button data-action="speed">Скорость ×${r.speed}</button></div><h3 class="log-title">Последние события</h3><div class="log">${r.log.slice(-7).reverse().map(x=>`<div>${h(GameUI.logLine(x))}</div>`).join('')}</div></div>
 <div class="panel"><small>БИОМЕТРИЯ И ГРУЗ</small><h3>${routeInfo(r).name}</h3><p class="muted">Маршрут действует до следующего шлюза. Элитные враги: +50% HP, +20% урона, двойная награда.</p><h3>Приказы и запас</h3><p>${Preparation.orders[Preparation.normalize({order:r.order}).order].name}</p><p>Автоаптечки ${Preparation.tiers[r.kitTier||1].name}: ${r.kits||0} / ${r.kitsBought||0} · +${r.kitHeal||30} HP</p><h3>Данные отряда</h3>${r.crew.map(c=>GameUI.healthRow(c.name,c.hp,c.maxHp||c.hp)).join('')}<h3>Противники</h3>${(r.foes||[]).filter(e=>e.hp>0).map(e=>GameUI.healthRow(foeName(e),e.hp,e.maxHp,true)).join('')||'<p>Контакт отсутствует.</p>'}<p>Добыча: ${cash(r.loot)} кредитов</p><p class="muted">После зачистки: ${Math.round(Progression.command(S.buildings.command).cache*100)}% — тайник, 15% — медприпасы. Находки забираются автоматически. При поражении сохраняется ${Math.round(Progression.command(S.buildings.command).recovery*100)}% груза.</p></div></div>
 ${checkpoint?`<div class="overlay"><div class="dialog" role="dialog" aria-modal="true" aria-labelledby="dialog-title"><small>СЕКТОР ${r.depth} · БОСС УНИЧТОЖЕН</small><h2 id="dialog-title">ЭВАКУАЦИОННЫЙ ШЛЮЗ</h2><p>Груз: ₡ ${cash(r.loot)}. Живы ${r.crew.filter(c=>c.hp>0).length} бойцов.</p><p>Выбор на следующие пять секторов:</p><p><b>Сервисный обход:</b> −15% HP и урона врагов, −15% наград за бой. Шанс элиты — 6%.</p><p class="warn"><b>Заражённое хранилище:</b> +20% HP и урона врагов, +50% наград за бой. Шанс элиты — 24%.</p><p>Медпост помог выжившим. Уже собранный груз не меняется.</p>${event?`<p>${h(event.title)}: ${h(GameUI.logLine(event.text))}</p>`:''}${automationHtml(r)}<div class="actions"><button class="primary" data-action="extract">Эвакуироваться с грузом</button><button data-action="route-safe">Сервисный обход → ${r.depth+5}</button><button data-action="route-risk">Заражённое хранилище → ${r.depth+5}</button></div></div></div>`:''}`;
}
function preparationHtml(){const active=S.raid,medical=Progression.medbay(S.buildings.medbay),p=active?{order:active.order||'front',kits:active.kitsBought||0,kitTier:active.kitTier||1}:Preparation.normalize(S.prep,S.buildings.medbay),kit=Preparation.tiers[p.kitTier],capacity=active?(active.kitCapacity||3):medical.capacity;return `<section class="panel preparation"><small>ПРИКАЗЫ И СНАБЖЕНИЕ</small><h2>Подготовка экспедиции</h2><div class="prep-grid"><label>Приоритет целей<select id="prep-order" ${active?'disabled':''}>${Object.entries(Preparation.orders).map(([key,o])=>`<option value="${key}" ${p.order===key?'selected':''}>${o.name}</option>`).join('')}</select><span class="muted">${Preparation.orders[p.order].text}</span></label><label>Уровень аптечек<select id="prep-tier" ${active?'disabled':''}>${Object.entries(Preparation.tiers).map(([id,k])=>`<option value="${id}" ${p.kitTier===+id?'selected':''} ${+id>medical.tier?'disabled':''}>${k.name} · ${k.heal} HP · ₡ ${cash(k.price)}${+id>medical.tier?' · медблок ур. '+(+id===2?3:5):''}</option>`).join('')}</select></label><label>Запас · до ${capacity} шт.<select id="prep-kits" ${active?'disabled':''}>${Array.from({length:capacity+1},(_,n)=>`<option value="${n}" ${p.kits===n?'selected':''}>${n} шт. · ₡ ${cash(n*kit.price)}</option>`).join('')}</select><span class="muted">При HP ≤35%: +${kit.heal} HP одному выжившему, максимум одна аптечка за ход.</span></label></div><p>Стоимость при высадке: <b>₡ ${cash(p.kits*kit.price)}</b>. Неиспользованные возвращаются по цене покупки только при эвакуации.</p><p class="muted">Медблок: +1 место за уровень (до 12). Аптечки II — уровень 3, III — уровень 5.</p>${active?'<p class="warn">Припасы текущего рейда уже закуплены. Новые уровни применятся при следующей высадке.</p>':''}${deploymentError?`<p class="warn" role="alert">${h(deploymentError)}</p>`:''}</section>`}
function bindPreparation(){for(const [id,key] of [['prep-order','order'],['prep-kits','kits'],['prep-tier','kitTier']]){const field=el('#'+id);if(field)field.onchange=()=>{if(S.raid)return;S.prep=Preparation.normalize({...S.prep,[key]:key==='order'?field.value:Number(field.value)},S.buildings.medbay);deploymentError='';save();render()}}}
function saveHtml(){return `<div class="page-heading"><div><small>ПРОГРЕСС И ПЕРЕНОС</small><h2>Сохранения и настройки</h2></div></div><section class="panel speed-settings"><div><h3>Скорость игры</h3><p class="muted">Сохраняется между рейдами и после перезапуска. Автовыбор маршрута: ×1 — 15 секунд, ×2 и ×4 — 5 секунд.</p></div><button data-action="speed">Скорость ×${Automation.validSpeed(S.settings?.speed)}</button></section><div class="grid"><section class="panel"><h3>Перенести игру на другой компьютер</h3><p>Экспортируйте JSON и сохраните его отдельно от папки игры. Файл включает текущую экспедицию.</p><div class="actions"><button class="primary" data-action="export">Экспортировать сохранение</button><button data-action="import">Загрузить JSON</button><input id="import" type="file" accept="application/json,.json" hidden></div><p class="muted">Загрузка файла заменит текущий прогресс. Сначала экспортируйте его, если хотите сохранить.</p></section><section class="panel danger-panel"><h3>Начать заново</h3><p>Удаляет прогресс базы и текущий рейд. Потребуется подтверждение.</p><button class="danger" data-action="new">Новая игра</button></section></div><p class="muted">Прогресс сохраняется автоматически в этом браузере. При переносе папки используйте экспорт JSON.</p>`}
function start(){if(S.raid){resumeRaid();return}let crew=selected.map(i=>S.recruits[i]).filter(Boolean);if(!crew.length)crew=S.recruits.slice(0,4);if(!crew.length){tab='squad';screen='game';render();return}const prep=Preparation.normalize(S.prep,S.buildings.medbay),kit=Preparation.tiers[prep.kitTier],cost=Preparation.cost(prep,S.buildings.medbay);if(S.res.credits<cost){deploymentError='Не хватает кредитов на аптечки. Уменьшите запас или выберите 0 — высадка без припасов бесплатна.';tab='squad';screen='game';render();return}S.res.credits-=cost;deploymentError='';selected=crew.map(x=>S.recruits.indexOf(x));paused=false;overlay='';S.settings=S.settings||{speed:1};S.raid={order:prep.order,kits:prep.kits,kitsBought:prep.kits,kitTier:prep.kitTier,kitPrice:kit.price,kitHeal:kit.heal,kitCapacity:Progression.medbay(S.buildings.medbay).capacity,depth:1,room:0,crew:crew.map(x=>({...x,maxHp:x.hp})),loot:0,speed:Automation.validSpeed(S.settings.speed),seed:Date.now()>>>0,log:['Высадка подтверждена. Автопилот отряда активен.'],kills:0};tab='raid';screen='game';save();render();restartTimer()}
function restartTimer(){clearInterval(timer);timer=S.raid?setInterval(tick,700/S.raid.speed):null}
function changeSpeed(value){S.settings={speed:Automation.validSpeed(value)};if(S.raid){Automation.changeSpeed(S.raid,S.settings.speed);restartTimer()}save();render()}
function cycleSpeed(){const speed=Automation.validSpeed(S.settings?.speed);changeSpeed(speed===1?2:speed===2?4:1)}
function cash(value,exact=false){return GameUI.money(value,exact)}
function autoMessage(r){Automation.ensure(r);if(!r.autoRoute)return 'Осталось 1–2 бойца: выберите маршрут или эвакуацию вручную.';if(r.autoCancelled)return 'Автовыбор отменён. Решение за командиром.';const route=r.autoRoute==='risk'?'заражённое хранилище':'сервисный обход';return (paused?'Пауза · ':'Автовыбор через ')+Math.ceil(r.autoRemainingMs/1000)+' с · '+route}
function automationHtml(r){return `<section class="auto-choice"><p id="auto-countdown" role="status">${autoMessage(r)}</p><div class="actions"><button data-action="pause" aria-pressed="${paused}">${paused?'Продолжить таймер':'Пауза'}</button><button data-action="speed">Скорость ×${r.speed}</button>${r.autoRoute&&!r.autoCancelled?'<button data-action="cancel-auto">Решить вручную</button>':''}</div><small>4 живых — сложный путь, 3 — простой, 1–2 — только вручную. При ×1: 15 с, при ×2/×4: 5 с.</small></section>`}
function stepCheckpoint(ms){const r=S.raid;if(!r||screen!=='game'||tab!=='raid'||paused||document.hidden||!r.cleared||r.depth%5!==0)return;Automation.ensure(r);const before=Math.ceil(r.autoRemainingMs/1000),choice=Automation.step(r,ms);if(choice){chooseRoute(choice);return}if(Math.ceil(r.autoRemainingMs/1000)!==before){save();const label=el('#auto-countdown');if(label)label.textContent=autoMessage(r)}}
const routes={normal:{name:'Основной коридор',hp:1,attack:1,reward:1,elite:.12},safe:{name:'Сервисный обход',hp:.85,attack:.85,reward:.85,elite:.06},risk:{name:'Заражённое хранилище',hp:1.2,attack:1.2,reward:1.5,elite:.24}};
function routeInfo(r){return Object.prototype.hasOwnProperty.call(routes,r.route)?routes[r.route]:routes.normal}
function foeName(e){return (e.elite?'Элитный · ':'')+enemies[e.type]}
function createEncounter(r){const route=routeInfo(r);return Array.from({length:r.depth%5===0?1:Math.min(5,2+Math.floor(r.depth/4))},()=>{const type=r.depth%5===0?5:Math.floor(raidRoll(r)*5),elite=type!==5&&r.depth>=3&&raidRoll(r)<route.elite,hp=Math.round((type===5?100:25+type*5)*(1+r.depth*.16)*route.hp*(elite?1.5:1));return {type,elite,hp,maxHp:hp,attackFactor:route.attack*(elite?1.2:1),rewardFactor:route.reward*(elite?2:1)}})}
function chooseRoute(key){const r=S.raid;if(!r||!r.cleared||r.depth%5!==0||!r.crew.some(c=>c.hp>0)||!['safe','risk'].includes(key))return;r.route=key;r.log.push('Маршрут до следующего шлюза: '+routeInfo(r).name);advanceSector()}
function tick(){
 if(!S.raid||paused||tab!=='raid'||screen!=='game'||overlay)return;let r=S.raid;if(r.cleared){if(r.depth%5===0){overlay='room';Automation.ensure(r);render();return}r.transitionTicks=(r.transitionTicks??3)-1;if(r.transitionTicks<=0)advanceSector();else{save();render()}return}
 const roll=()=>raidRoll(r);
 let alive=r.crew.filter(c=>c.hp>0);if(!alive.length){finish(false);return}
 r.turn=(r.turn||0)+1;const kit=Preparation.useKit(r);if(kit)r.log.push('Автоаптечка: '+kit.name+' +'+kit.healed+' HP. Осталось: '+r.kits);
 if(!r.foes){r.foes=createEncounter(r);r.log.push('Контакт: '+r.foes.map(foeName).join(', '))}
 for(const c of alive){let targets=r.foes.filter(e=>e.hp>0);if(!targets.length)break;c.maxHp=c.maxHp||c.hp;
 if(c.class==='medic'&&r.turn%3===0&&alive.some(p=>p.hp/(p.maxHp||p.hp)<.75)){let patient=alive.reduce((a,b)=>a.hp/(a.maxHp||a.hp)<b.hp/(b.maxHp||b.hp)?a:b);let heal=Math.min(Progression.medbay(S.buildings.medbay).heal,(patient.maxHp||patient.hp)-patient.hp);patient.hp+=heal;r.log.push(c.name+': лечение +'+heal);continue}
 let e=Preparation.target(targets,r.order),damage=Math.max(1,Math.round(c.atk*(.85+roll()*.3)+Progression.armory(S.buildings.armory).attack)-(e.type===3?Math.max(0,4-Progression.armory(S.buildings.armory).pierce):0));if(c.class==='assault'&&r.turn%3===0)damage*=2;if(c.class==='engineer')damage+=4;e.hp=Math.max(0,e.hp-damage);
 if(e.hp===0){let reward=Math.round((e.type===5?45:8+r.depth*2)*Progression.command(S.buildings.command).reward*(e.rewardFactor||1));r.loot+=reward;r.log.push(foeName(e)+' уничтожен. +₡ '+reward)}
 }
 for(const e of r.foes.filter(e=>e.hp>0)){alive=r.crew.filter(c=>c.hp>0);if(!alive.length)break;let target=alive.find(c=>c.class==='heavy')||alive[Math.floor(roll()*alive.length)],damage=Math.max(1,Math.round((e.type===5?11:4+e.type)* (1+r.depth*.09)*(e.attackFactor||1))-target.armor-(target.class==='heavy'?3:0));target.hp=Math.max(0,target.hp-damage);r.log.push(foeName(e)+' → '+target.name+': −'+damage)}
 if(!r.crew.some(c=>c.hp>0)){finish(false);return}
 if(r.foes.every(e=>e.hp<=0))clearSector();
 r.log=r.log.slice(-40);save();render();
}
function raidRoll(r){r.seed=(1664525*r.seed+1013904223)>>>0;return r.seed/4294967296}
function healCrew(r,amount){let restored=0;r.crew.filter(c=>c.hp>0).forEach(c=>{const gain=Math.max(0,Math.min(amount,(c.maxHp||c.hp)-c.hp));c.hp+=gain;restored+=gain});return restored}
function clearSector(){
 const r=S.raid;if(!r||r.cleared||!r.foes||r.foes.some(e=>e.hp>0)||!r.crew.some(c=>c.hp>0))return;
 r.room=1;r.cleared=true;r.transitionTicks=3;r.sectorEvent=null;
 const chance=raidRoll(r);
 if(chance<Progression.command(S.buildings.command).cache){const amount=12+r.depth*3;r.loot+=amount;r.sectorEvent={kind:'cache',title:'Обнаружен тайник',text:'Отряд забрал '+amount+' кредитов в груз.'}}
 else if(chance<Progression.command(S.buildings.command).cache+.15){const hp=healCrew(r,Progression.medbay(S.buildings.medbay).rest);r.sectorEvent={kind:'medical',title:'Найдены медприпасы',text:hp?'Восстановлено '+hp+' HP. Павшие не возвращаются в строй.':'Здоровье отряда уже восстановлено.'}}
 if(r.sectorEvent)r.log.push(r.sectorEvent.title+': '+r.sectorEvent.text);
 if(r.depth%5===0){const hp=healCrew(r,Progression.medbay(S.buildings.medbay).rest);overlay='room';Automation.ensure(r);r.log.push('Эвакуационный медпост: +'+hp+' HP. Ожидаем приказа.')}else{overlay='';r.log.push('Сектор зачищен. Отряд движется к следующему шлюзу.')}
 S.deepest=Math.max(S.deepest,r.depth);
}
function advanceSector(){const r=S.raid;if(!r||!r.cleared||!r.crew.some(c=>c.hp>0))return;Automation.reset(r);delete r.foes;r.cleared=false;r.depth++;r.room=0;r.kills=0;r.transitionTicks=0;overlay='';save();render()}
function resumeRaid(){if(!S.raid)return;screen='game';tab='raid';paused=false;S.settings=S.settings||{speed:Automation.validSpeed(S.raid.speed)};S.raid.speed=S.settings.speed;overlay=S.raid.cleared&&S.raid.depth%5===0?'room':'';Automation.ensure(S.raid);restartTimer();render()}
function extract(){if(!S.raid||!S.raid.cleared||overlay!=='room'||S.raid.depth%5!==0||!S.raid.crew.some(x=>x.hp>0))return;finish(true)}
function finish(ok){clearInterval(timer);timer=null;let r=S.raid;if(!r)return;S.lastLoot=ok?r.loot+12+Math.floor(r.depth/2):Math.floor(r.loot*Progression.command(S.buildings.command).recovery);S.lastRefund=ok?(r.kits||0)*(r.kitPrice||Preparation.price):0;S.res.credits+=S.lastLoot+S.lastRefund;let deployed=new Set(r.crew.map(x=>x.id)),survivors=new Set(r.crew.filter(x=>x.hp>0).map(x=>x.id));if(ok)S.deepest=Math.max(S.deepest,r.depth);S.run++;S.recruits=S.recruits.filter(x=>!deployed.has(x.id)||survivors.has(x.id));if(ok)S.recruits.forEach(x=>{if(survivors.has(x.id))x.hp=Math.max(45,x.hp-8)});selected=[];S.raid=null;overlay=ok?'win':'dead';screen='result';paused=true;save();render()}
function draw(){let c=el('#arena');if(!c||!S.raid)return;let x=c.getContext('2d'),r=S.raid;x.fillStyle='#0a1114';x.fillRect(0,0,800,350);for(let i=0;i<12;i++){x.fillStyle=i%2?'#18262a':'#1d2c30';x.fillRect(i*70,280,68,70);x.fillStyle='#33494d';x.fillRect(i*70,276,68,4)}x.fillStyle='#a3bbb4';x.fillRect(25,60,750,2);x.fillStyle='#23383c';for(let i=0;i<8;i++)x.fillRect(i*112+20,30,3,245);r.crew.forEach((b,i)=>{let px=90+i*63,py=240;x.fillStyle=b.hp>0?(b.class==='medic'?'#64c9b1':'#8fa5aa'):'#572d31';x.fillRect(px,py-34,19,29);x.fillRect(px+6,py-44,8,10);x.fillStyle='#61ddce';x.fillRect(px,py-50,Math.max(0,b.hp/100*25),3);if(b.hp>0){x.fillStyle='#efb154';x.fillRect(px+19,py-26,28,2)}});for(let i=0;i<Math.min(4,1+Math.floor(r.depth/2));i++){let px=570+i*45,py=170+(i%2)*44;x.fillStyle=['#92ad54','#c17863','#bd9260','#718457'][i];x.beginPath();x.moveTo(px,py-20);x.lineTo(px+23,py-8);x.lineTo(px+17,py+13);x.lineTo(px-8,py+15);x.lineTo(px-13,py-3);x.fill()}x.fillStyle='#6ee4d0';x.font='12px monospace';x.fillText('HELIOS / ГЕЛИОС · ЗАРАЖЁННЫЙ СЕКТОР',18,20)}
function bind(){bindPreparation();document.querySelectorAll('[data-tab]').forEach(b=>b.onclick=()=>{tab=b.dataset.tab;render()});document.querySelectorAll('[data-pick]').forEach(b=>b.onclick=()=>pickSquad(+b.dataset.pick));document.querySelectorAll('[data-up]').forEach(bindUpgrade);document.querySelectorAll('[data-action]').forEach(b=>b.onclick=()=>{let a=b.dataset.action;if(a==='buy-all')buyUpgrades();if(a.startsWith('buy-max-'))buyUpgrades(a.slice(8));if(a==='auto-squad')autoSquad();if(a==='clear-squad'&&!S.raid){selected=[];render()}if(a==='menu'){screen='menu';render()}if(a==='open-base'){screen='game';tab='base';render()}if(a==='import')el('#import').click();if(a==='hire'&&S.res.credits>=20){S.res.credits-=20;recruit()}if(a.startsWith('hire-')&&S.res.credits>=20){S.res.credits-=20;recruit(false,a.slice(5))}if(a==='vagrant')recruit(true);if(a==='start')start();if(a==='newrun'){if(S.raid&&!confirm('Прервать текущую экспедицию?'))return;if(S.raid){S.raid=null;clearInterval(timer);timer=null}screen='game';paused=false;overlay='';tab='base';save();render()}if(a==='resume')resumeRaid();if(a==='menusettings'){screen='game';tab='save';render()}if(a==='route-safe')chooseRoute('safe');if(a==='route-risk')chooseRoute('risk');if(a==='dismiss'){screen='game';overlay='';paused=false;tab='base';render()}if(a==='pause'){paused=!paused;render()}if(a==='speed')cycleSpeed();if(a==='cancel-auto'&&S.raid){S.raid.autoCancelled=true;save();render()}if(a==='extract')extract();if(a==='export'){let u=URL.createObjectURL(new Blob([JSON.stringify(S,null,2)],{type:'application/json'})),l=document.createElement('a');l.href=u;l.download='outpost-save.json';l.click();URL.revokeObjectURL(u)}if(a==='new'&&confirm('Начать новую игру? Текущее сохранение будет заменено.')){const speed=Automation.validSpeed(S.settings?.speed);S=fresh();S.settings.speed=speed;clearInterval(timer);timer=null;selected=[];paused=false;overlay='';screen='menu';save();render()}});let input=el('#import');if(input)input.onchange=async()=>{try{let v=JSON.parse(await input.files[0].text());S=migrate(v);selected=[];deploymentError='';clearInterval(timer);timer=null;paused=false;overlay='';screen='menu';tab='base';save();render()}catch{alert('Файл повреждён или версия сохранения не поддерживается.')}}}
function draw(){let c=el('#arena');if(!c||!S.raid)return;let g=c.getContext('2d'),r=S.raid,room=(r.room||0)+r.depth,types=['#1a2b30','#20252e','#30291f','#1b2b27'],accent=['#62cbb8','#e6a548','#d96b55','#a6d34e'][room%4];g.fillStyle=types[room%4];g.fillRect(0,0,800,350);let grad=g.createLinearGradient(0,0,0,280);grad.addColorStop(0,'#090e14');grad.addColorStop(1,types[room%4]);g.fillStyle=grad;g.fillRect(0,0,800,280);g.fillStyle='#26383b';g.fillRect(0,45,800,8);g.fillRect(0,265,800,13);for(let i=0;i<7;i++){let x=i*128+12;g.fillStyle='#111b20';g.fillRect(x,53,8,212);g.fillStyle=accent;g.fillRect(x+3,61,2,42);g.fillStyle='#34474a';g.fillRect(x-15,120,42,4)}g.fillStyle='#152126';g.fillRect(0,278,800,72);for(let i=0;i<13;i++){g.fillStyle=i%2?'#273639':'#1d2a2e';g.fillRect(i*64,282,62,68);g.fillStyle='#334347';g.fillRect(i*64,279,62,3)}if(room%3===2){g.fillStyle='#437e4b55';for(let i=0;i<5;i++){g.beginPath();g.ellipse(650+i*24,260,36,6,0,0,7);g.fill()}}g.fillStyle=accent;g.font='12px monospace';g.fillText(`HELIOS // СЕКТОР ${r.depth} · ОТСЕК ${r.room||0}`,18,25);
// Боец в боковой проекции: шлем, бронежилет, рюкзак и винтовка, нарисованные пиксельными слоями.
function marine(px,py,b,i){let alive=b.hp>0,col=b.class==='medic'?'#64c9b1':b.class==='heavy'?'#a0a79a':'#8498a1';if(!alive)col='#542f33';g.fillStyle='#080d10';g.fillRect(px+5,py+1,25,4);g.fillStyle=col;g.fillRect(px+9,py-38,17,23);g.fillRect(px+8,py-24,7,15);g.fillRect(px+20,py-24,7,15);g.fillStyle='#303b40';g.fillRect(px+6,py-40,20,5);g.fillRect(px+7,py-48,17,10);g.fillStyle='#b3c3bc';g.fillRect(px+18,py-45,6,2);g.fillStyle='#384b50';g.fillRect(px+3,py-36,7,15);g.fillRect(px+23,py-36,6,14);g.fillStyle='#202c30';g.fillRect(px+10,py-12,6,12);g.fillRect(px+20,py-12,6,12);g.fillStyle='#11191c';g.fillRect(px+8,py-2,10,3);g.fillRect(px+18,py-2,10,3);g.fillStyle='#bf995c';g.fillRect(px+26,py-32,20,3);g.fillRect(px+42,py-35,5,8);g.fillStyle='#d6ddcf';g.fillRect(px+32,py-38,4,5);g.fillStyle='#59d9ca';g.fillRect(px+8,py-55,Math.max(0,b.hp/110*22),3);g.fillStyle='#a9b7b2';g.font='9px monospace';g.fillText(b.name,px-2,py+13)}r.crew.forEach((b,i)=>marine(35+i*65,260,b,i));
// Ксеноморфные силуэты с читаемыми панцирями, челюстями и конечностями.
function alien(px,py,i){let col=['#91a84c','#ca725a','#b69a55','#779369','#758d55'][i%5];g.save();g.translate(px,py);g.fillStyle='#11130f';g.fillRect(-11,2,31,4);g.fillStyle=col;if(i%5===1){g.beginPath();g.ellipse(0,-16,16,24,-.25,0,7);g.fill();g.fillRect(-19,-8,11,6);g.fillRect(10,-4,14,5);g.fillStyle='#d85c3f';g.fillRect(7,-27,4,3);g.fillRect(10,3,5,10)}else{g.fillRect(-8,-29,23,23);g.fillRect(-4,-12,11,13);g.fillRect(8,-35,12,7);g.fillRect(17,-31,9,4);g.fillRect(-13,-28,6,18);g.fillRect(12,-11,5,14);g.fillStyle='#d15f4c';g.fillRect(20,-31,3,2);g.fillRect(22,-25,8,2);g.fillStyle='#a7ce58';g.fillRect(-5,-33,2,6);g.fillRect(1,-35,2,6)}g.fillStyle='#252e24';g.fillRect(-8,-7,6,14);g.restore()}for(let i=0;i<Math.min(5,1+Math.floor(r.depth/2));i++)alien(570+i*42,244+(i%2)*14,i);g.fillStyle='#e7ad55';g.fillRect(505,220,3,2);g.fillRect(533,201,3,2);}
let upgradeHold=null,repeatedUpgrade=null;
function buyUpgrades(key){
 if(screen!=='game'||tab!=='base'||document.hidden)return;
 const keys=Object.keys(buildingNames).filter(name=>(key===undefined||key===name)&&Number.isSafeInteger(S.buildings[name])&&S.buildings[name]>0);
 if(!keys.length)return;
 const budget=S.res.credits;
 const lowest=Math.min(...keys.map(name=>S.buildings[name]));
 const costToLevel=(name,target)=>{
  const current=S.buildings[name],count=Math.max(0,target-current);
  return 85*count*(2*current+count-1)/2;
 };
 // Find the highest level we can bring every selected building up to.
 let low=0,high=Math.ceil(Math.sqrt(budget/42.5));
 while(low<high){
  const steps=low+Math.ceil((high-low)/2);
  const total=keys.reduce((sum,name)=>sum+costToLevel(name,lowest+steps),0);
  if(total<=budget)low=steps;
  else high=steps-1;
 }
 const target=lowest+low;
 for(const name of keys){
  S.res.credits-=costToLevel(name,target);
  S.buildings[name]=Math.max(S.buildings[name],target);
 }
 // Spend the remainder on as many tied lowest buildings as it can buy.
 for(const name of keys){
  if(S.buildings[name]===target&&S.res.credits>=85*target){
   S.res.credits-=85*target;
   S.buildings[name]++;
  }
 }
 if(S.res.credits!==budget){save();render()}
}
function purchaseUpgrade(key,refresh=true){
 if(screen!=='game'||tab!=='base'||document.hidden)return false;
 const cost=85*S.buildings[key];
 if(!Number.isFinite(cost)||cost<=0||S.res.credits<cost)return false;
 S.res.credits-=cost;S.buildings[key]++;save();
 if(refresh)render();
 return true;
}
function stopUpgradeHold(refresh=true){
 if(!upgradeHold)return;
 const hold=upgradeHold;
 upgradeHold=null;
 clearTimeout(hold.timer);
 hold.listeners.abort();
 if(refresh&&hold.purchased&&screen==='game'&&tab==='base')render();
}
function bindUpgrade(button){
 const key=button.dataset.up;
 button.onclick=e=>{
  if(e.detail>0&&repeatedUpgrade===key){repeatedUpgrade=null;return}
  purchaseUpgrade(key);
 };
 button.onpointerdown=e=>{
  if(!e.isPrimary||e.button!==0||button.disabled)return;
  stopUpgradeHold();repeatedUpgrade=null;
  const listeners=new AbortController(),opts={capture:true,signal:listeners.signal};
  const hold={listeners,timer:null,purchased:false};upgradeHold=hold;
  const release=event=>{if(event.pointerId===e.pointerId)stopUpgradeHold()};
  window.addEventListener('pointerup',release,opts);
  window.addEventListener('pointercancel',release,opts);
  window.addEventListener('pointermove',event=>{
   if(event.pointerId===e.pointerId&&document.elementFromPoint(event.clientX,event.clientY)?.closest('[data-up]')?.dataset.up!==key)stopUpgradeHold();
  },opts);
  window.addEventListener('blur',stopUpgradeHold,opts);
  document.addEventListener('visibilitychange',stopUpgradeHold,opts);
  function repeat(){
   if(upgradeHold!==hold)return;
   if(!purchaseUpgrade(key,false)){stopUpgradeHold();return}
   hold.purchased=true;
   repeatedUpgrade=key;
   const level=S.buildings[key],nextCost=85*level;
   // Keep the pressed button in the DOM until the gesture ends.
   button.textContent='Улучшить · ₡ '+cash(nextCost);
   el('#resources strong').textContent='₡ '+cash(S.res.credits);
   el('#building-'+key+' .tag').textContent='Ур. '+level+' → '+(level+1);
   if(S.res.credits<nextCost){stopUpgradeHold();return}
   hold.timer=setTimeout(repeat,150);
  }
  hold.timer=setTimeout(repeat,350);
 };
}
let visualTime=0,lastFrame=0;
function animate(now){if(!lastFrame)lastFrame=now;const elapsed=Math.max(0,Math.min(250,now-lastFrame)),dt=Math.min(.05,elapsed/1000);lastFrame=now;stepCheckpoint(elapsed);if(screen==='game'&&tab==='raid'&&S.raid){const active=!paused&&!overlay&&!S.raid.cleared;if(active)visualTime+=dt*(S.raid.speed||1);Arena.render(el('#arena'),S.raid,visualTime,active)}requestAnimationFrame(animate)}
document.querySelectorAll('nav button').forEach(b=>b.onclick=()=>{tab=b.dataset.tab;render()});if(initial){recruit();recruit()}render();requestAnimationFrame(animate);
})();



















