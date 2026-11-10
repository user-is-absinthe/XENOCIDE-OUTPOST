const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
let source = fs.readFileSync('game.js', 'utf8');
source = source.replace("let stored=!!S.recruits.length", "let stored=!!S.recruits.length");
source = source.replace("render();requestAnimationFrame(animate);", "render=()=>{};globalThis.api={stepCheckpoint,changeSpeed,pickSquad,autoSquad,squad,selected:()=>selected,fresh,migrate,recruit,start,tick,finish,extract,clearSector,advanceSector,resumeRaid,raidHtml,chooseRoute,createEncounter,get:()=>S,set:s=>{S=s},setOverlay:x=>{overlay=x},pause:x=>{paused=x}};");
const element = {innerHTML:'', hidden:false, textContent:'', classList:{toggle(){}}};
const context = {console, document:{querySelector:()=>element,querySelectorAll:()=>[]}, localStorage:{getItem:()=>JSON.stringify({v:2,res:{credits:0},buildings:{barracks:1},recruits:[],items:[],raid:null,deepest:0,run:0}),setItem(){}},setInterval:()=>1,clearInterval(){},requestAnimationFrame(){},Math,Set};
context.window=context;for(const file of ['progression.js','automation.js','interface.js','preparation.js'])vm.runInNewContext(fs.readFileSync(file,'utf8'),context);vm.runInNewContext(source,context);
const a=context.api;
let old=a.fresh();old.v=1;old.res={credits:7,scrap:9,data:3};old.raid={loot:6,data:2};let migrated=a.migrate(old);
assert.equal(migrated.res.credits,19);assert.equal(migrated.raid.loot,8);assert.equal(migrated.v,2);
let s=a.fresh();s.res.credits=0;s.recruits=[];a.set(s);for(let i=0;i<4;i++)a.recruit(true);
assert.equal(s.res.credits,0);assert.equal(s.recruits.length,4);assert(s.recruits.every(x=>x.class==='vagrant' && x.hp<=70 && x.atk<=7));
a.start();assert.equal(s.raid.depth,1);s.raid.seed=1;for(let i=0;i<10 && s.raid && s.raid.loot===0;i++)a.tick();assert(s.raid && s.raid.loot>0, 'free squad can collect loot');s.raid.loot=20;s.raid.crew.forEach(x=>x.hp=0);a.finish(false);
assert.equal(s.res.credits,7);assert.equal(s.recruits.length,0);assert.equal(s.raid,null);a.finish(false);assert.equal(s.res.credits,7);
a.recruit(true);a.start();s.raid.depth=5;a.setOverlay('');a.extract();assert(s.raid, 'cannot extract during combat');a.setOverlay('room');s.raid.depth=4;a.extract();assert(s.raid, 'cannot extract outside the fifth sector');s.raid.depth=5;s.raid.cleared=true;a.extract();assert.equal(s.raid,null, 'can extract after clearing sector five');
console.log('Economy: migration, free recruits, recovery and one-time rewards passed');

let wins=0;
for(let seed=1;seed<=10;seed++){
 let profile=a.fresh();profile.recruits=['heavy','medic','assault','engineer'].map((c,i)=>({id:i+1,name:c,class:c,hp:95,atk:12,armor:3}));a.set(profile);a.start();profile.raid.seed=seed;
 for(let step=0;profile.raid&&step<500;step++){
  a.tick();let r=profile.raid;if(!r)break;
  if(r.cleared&&r.depth===5){a.extract();wins++;break}
 }
 assert.equal(profile.raid,null,'raid must terminate');
}
assert(wins>=5,'balanced team should reach first extraction');console.log('Ten seeded raids: '+wins+' successful extractions');

// Real transition flow: no clicks through ordinary sectors, pause and saved countdown.
let profile=a.fresh();profile.recruits=[{id:1,name:'Test',class:'assault',hp:90,atk:12,armor:2}];a.set(profile);a.start();
let raid=profile.raid;raid.foes=[{type:0,hp:0,maxHp:30}];raid.seed=1;a.clearSector();
assert(raid.cleared);assert.equal(raid.sectorEvent.kind,'cache');const credited=raid.loot, seedAfter=raid.seed;
a.clearSector();assert.equal(raid.loot,credited);assert.equal(raid.seed,seedAfter);
assert(!a.raidHtml().includes('data-action="nextroom"'),'ordinary sectors require no confirmation');
a.pause(true);a.tick();assert.equal(raid.transitionTicks,3);a.pause(false);a.tick();assert.equal(raid.transitionTicks,2);
a.set(JSON.parse(JSON.stringify(profile)));a.resumeRaid();a.tick();assert.equal(a.get().raid.depth,1);a.tick();assert.equal(a.get().raid.depth,2);assert.equal(a.get().raid.loot,credited);
// Checkpoint remains blocked indefinitely and cannot pay twice across a reload.
raid=a.get().raid;raid.depth=5;raid.foes=[{type:5,hp:0,maxHp:180}];a.clearSector();const checkpointLoot=raid.loot;
for(let i=0;i<20;i++)a.tick();assert.equal(raid.depth,5);assert(a.raidHtml().includes('data-action="extract"'));
a.set(JSON.parse(JSON.stringify(a.get())));a.resumeRaid();a.clearSector();assert.equal(a.get().raid.loot,checkpointLoot);a.advanceSector();assert.equal(a.get().raid.depth,6);
// Every event is reproducible; both no-find and supply results occur.
const counts={cache:0,medical:0,none:0};
for(let i=0;i<1000;i++){
 const base=a.fresh();base.raid={depth:1,seed:(i*2654435761)>>>0,crew:[{hp:20,maxHp:90},{hp:0,maxHp:90}],foes:[{hp:0}],loot:0,log:[]};
 let expected;
 for(let attempt=0;attempt<2;attempt++){a.set(JSON.parse(JSON.stringify(base)));a.clearSector();const r=a.get().raid;const value=JSON.stringify({event:r.sectorEvent,loot:r.loot,crew:r.crew,seed:r.seed});if(attempt)assert.equal(value,expected);else expected=value;assert.equal(r.crew[1].hp,0)}
 counts[a.get().raid.sectorEvent?.kind||'none']++;
}
assert(counts.cache>200&&counts.cache<300);assert(counts.medical>100&&counts.medical<200);assert(counts.none>500);
console.log('Transitions, pause/resume, checkpoint, single award and deterministic events passed:',counts);

// Route changes are only allowed at a cleared evacuation point.
let routed=a.fresh();routed.recruits=[{id:11,name:'Route',class:'heavy',hp:120,atk:12,armor:3}];a.set(routed);a.start();routed.raid.loot=100;
a.chooseRoute('risk');assert.equal(routed.raid.depth,1);assert.equal(routed.raid.route,undefined);
routed.raid.depth=5;routed.raid.cleared=true;a.setOverlay('room');a.chooseRoute('invalid');assert.equal(routed.raid.depth,5);
a.chooseRoute('risk');assert.equal(routed.raid.depth,6);assert.equal(routed.raid.route,'risk');assert.equal(routed.raid.loot,100);
a.chooseRoute('safe');assert.equal(routed.raid.depth,6);assert.equal(routed.raid.route,'risk');
a.set(JSON.parse(JSON.stringify(routed)));a.resumeRaid();assert.equal(a.get().raid.route,'risk');
let elites=0,ordinary=0;
for(let seed=1;seed<=100;seed++){
 const safe=a.createEncounter({depth:6,route:'safe',seed:seed*9321}),risk=a.createEncounter({depth:6,route:'risk',seed:seed*9321});
 assert.equal(JSON.stringify(risk),JSON.stringify(a.createEncounter({depth:6,route:'risk',seed:seed*9321})));
 for(let i=0;i<safe.length;i++){assert.equal(safe[i].type,risk[i].type);assert(risk[i].hp>=safe[i].hp);assert(risk[i].attackFactor>safe[i].attackFactor);assert(risk[i].rewardFactor>safe[i].rewardFactor);if(risk[i].elite)elites++;else ordinary++}
}
assert(elites>0&&ordinary>0);assert(a.createEncounter({depth:10,route:'risk',seed:3}).every(e=>e.type===5&&!e.elite));
// Actual combat uses the enemy reward modifier without changing existing cargo.
let rewardProfile=a.fresh();rewardProfile.recruits=[{id:1,name:'Reward',class:'assault',hp:95,atk:20,armor:3}];a.set(rewardProfile);a.start();
rewardProfile.raid.loot=10;rewardProfile.raid.foes=[{type:0,hp:1,maxHp:1,rewardFactor:3,attackFactor:1.44,elite:true},{type:1,hp:999,maxHp:999,attackFactor:1}];a.tick();assert.equal(rewardProfile.raid.loot,40);
console.log('Routes: guarded choice, preserved cargo, persistence, deterministic elites and combat rewards passed');

// Preparation, target orders and consumable accounting.
const prep=context.Preparation, foes=[{type:0,hp:45},{type:1,hp:7},{type:5,hp:80}];
assert.equal(prep.target(foes,'front'),foes[0]);assert.equal(prep.target(foes,'weak'),foes[1]);assert.equal(prep.target(foes,'threat'),foes[2]);assert.equal(prep.target([{hp:0}],'weak'),null);
let prepared=a.fresh();prepared.res.credits=0;prepared.prep={order:'weak',kits:3};prepared.recruits=[{id:1,name:'Kit',class:'assault',hp:100,atk:20,armor:3}];a.set(prepared);a.start();assert.equal(prepared.raid,null);assert.equal(prepared.res.credits,0);
prepared.res.credits=36;a.start();assert.equal(prepared.res.credits,0);assert.equal(prepared.raid.order,'weak');assert.equal(prepared.raid.kits,3);a.start();assert.equal(prepared.res.credits,0,'resume cannot charge again');
prepared.raid.crew[0].hp=20;const healed=prep.useKit(prepared.raid);assert.equal(healed.healed,30);assert.equal(prepared.raid.kits,2);assert.equal(prepared.raid.crew[0].hp,50);
let restored=a.migrate(JSON.parse(JSON.stringify(prepared)));a.set(restored);a.resumeRaid();assert.equal(restored.raid.kits,2);assert.equal(restored.raid.order,'weak');assert.equal(prep.useKit(restored.raid),null);
a.finish(true);assert.equal(restored.lastRefund,24);let bank=restored.res.credits;a.finish(true);assert.equal(restored.res.credits,bank);
let loss=a.fresh();loss.prep={order:'threat',kits:2};loss.recruits=[{id:1,name:'Lost',class:'assault',hp:90,atk:12,armor:3}];a.set(loss);a.start();let afterPurchase=loss.res.credits;loss.raid.crew[0].hp=0;assert.equal(prep.useKit(loss.raid),null);assert.equal(loss.raid.kits,2);a.finish(false);assert.equal(loss.res.credits,afterPurchase);assert.equal(loss.lastRefund,0);
assert.throws(()=>prep.restoreRaid({kits:3,kitsBought:1}));
// Order affects the real battle: a wounded enemy behind the first one is eliminated.
let ordered=a.fresh();ordered.prep={order:'weak',kits:0};ordered.recruits=[{id:1,name:'Order',class:'assault',hp:100,atk:20,armor:3}];a.set(ordered);a.start();ordered.raid.foes=[{type:0,hp:100,maxHp:100},{type:1,hp:1,maxHp:50}];a.tick();assert.equal(ordered.raid.foes[0].hp,100);assert.equal(ordered.raid.foes[1].hp,0);
console.log('Preparation: target orders, affordability, one-time purchase, auto-heal, persistence and refunds passed');

const automation=context.Automation, progression=context.Progression, ui=context.GameUI;
function checkpoint(count,speed=1){return {crew:Array.from({length:4},(_,i)=>({hp:i<count?100:0})),depth:5,cleared:true,speed}}
for(const speed of [1,2,4])for(const count of [1,2,3,4]){
 const r=checkpoint(count,speed),delay=speed===1?15000:5000;
 assert.equal(automation.step(r,delay-1),null);
 assert.equal(automation.step(r,1),count===4?'risk':count===3?'safe':null);
}
let countdown=checkpoint(4);automation.step(countdown,3000);automation.changeSpeed(countdown,4);assert.equal(countdown.autoRemainingMs,4000);
countdown=JSON.parse(JSON.stringify(countdown));assert.equal(automation.step(countdown,3999),null);assert.equal(automation.step(countdown,1),'risk');
countdown=checkpoint(4);countdown.autoCancelled=true;assert.equal(automation.step(countdown,99999),null);
countdown=checkpoint(4);countdown.cleared=false;assert.equal(automation.step(countdown,99999),null);
let automated=a.fresh();automated.recruits=Array.from({length:4},(_,i)=>({id:i,name:'Auto',class:'heavy',hp:100,atk:12,armor:3}));a.set(automated);a.autoSquad();a.changeSpeed(2);a.start();assert.equal(automated.raid.speed,2);
automated.raid.depth=5;automated.raid.cleared=true;a.setOverlay('room');automation.ensure(automated.raid);
a.pause(true);a.stepCheckpoint(5000);assert.equal(automated.raid.autoRemainingMs,5000);a.pause(false);
context.document.hidden=true;a.stepCheckpoint(5000);assert.equal(automated.raid.depth,5);context.document.hidden=false;
a.stepCheckpoint(4999);assert.equal(automated.raid.depth,5);a.stepCheckpoint(1);assert.equal(automated.raid.depth,6);assert.equal(automated.raid.route,'risk');a.stepCheckpoint(10000);assert.equal(automated.raid.depth,6);
a.finish(true);a.start();assert.equal(automated.raid.speed,2);assert.equal(a.migrate(JSON.parse(JSON.stringify(automated))).settings.speed,2);
assert.equal(progression.medbay(1).capacity,3);assert.equal(progression.medbay(3).capacity,5);assert.equal(progression.medbay(5).tier,3);assert.equal(progression.medbay(50).capacity,12);
assert.equal(prep.normalize({kits:99,kitTier:3},3).kitTier,2);assert.equal(prep.normalize({kits:99},3).kits,5);
for(const [level,tier,heal,price] of [[1,1,30,12],[3,2,55,22],[5,3,90,36]]){
 const p=a.fresh();p.buildings.medbay=level;p.res.credits=1000;p.prep={kits:2,kitTier:tier};p.recruits=[{id:1,name:'Medic test',class:'heavy',hp:200,atk:12,armor:3}];a.set(p);a.start();assert.equal(p.res.credits,1000-price*2);
 p.raid.crew[0].hp=10;assert.equal(prep.useKit(p.raid).healed,heal);const saved=a.migrate(JSON.parse(JSON.stringify(p)));a.set(saved);saved.buildings.medbay=10;a.finish(true);assert.equal(saved.lastRefund,price);
}
assert.throws(()=>prep.restoreRaid({kitTier:4}));assert.throws(()=>prep.restoreRaid({kitTier:2,kitPrice:1}));
assert(progression.barracks(5).hp>progression.barracks(1).hp);assert(progression.armory(5).pierce>0);assert(progression.command(5).recovery>.35);assert(progression.command(5).reward>1);
for(const [value,expected] of [[999,'999'],[1000,'1К'],[1250,'1,25К'],[1000000,'1М'],[1250000,'1,25М']])assert.equal(ui.money(value),expected);
assert.equal(ui.money(1234567,true).replace(/\s/g,''),'1234567');assert(ui.healthRow('<script>',0,100).includes('&lt;script&gt;'));
let roster=a.fresh();roster.recruits=['vagrant','assault','heavy','medic','engineer'].map((c,i)=>({id:i,name:c,class:c,hp:100,atk:10,armor:2}));a.set(roster);a.autoSquad();assert.equal(a.selected().length,4);assert(!a.selected().includes(0));a.pickSquad(0);assert.equal(a.selected().length,4);a.start();const picks=JSON.stringify(a.selected());a.pickSquad(0);assert.equal(JSON.stringify(a.selected()),picks);
console.log('Automation, saved speed, pause/visibility guards, kit tiers/refunds, progression, formatting and squad limits passed');


