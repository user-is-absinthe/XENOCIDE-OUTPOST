/* Saved active-time countdown. No wall-clock/offline progression or simulation RNG. */
window.Automation = (() => {
  const validSpeed=n=>[1,2,4].includes(n)?n:1;
  const duration=speed=>validSpeed(speed)===1?15000:5000;
  const choice=r=>{const n=r.crew.filter(c=>c.hp>0).length;return n===4?'risk':n===3?'safe':null};
  function ensure(r){
    if(!r?.cleared||r.depth%5!==0)return;
    const route=choice(r);
    if(r.autoRoute!==route||!Number.isFinite(r.autoRemainingMs)){
      r.autoRoute=route;r.autoRemainingMs=route?duration(r.speed):0;
    }
    r.autoDurationMs=duration(r.speed);
    r.autoRemainingMs=Math.max(0,Math.min(r.autoDurationMs,r.autoRemainingMs));
    r.autoCancelled=r.autoCancelled===true;
  }
  function reset(r){delete r.autoRoute;delete r.autoRemainingMs;delete r.autoDurationMs;delete r.autoCancelled}
  function changeSpeed(r,speed){
    const oldDuration=duration(r.speed);r.speed=validSpeed(speed);
    if(Number.isFinite(r.autoRemainingMs)){r.autoRemainingMs=duration(r.speed)*r.autoRemainingMs/oldDuration;r.autoDurationMs=duration(r.speed)}
  }
  function step(r,dt){
    if(!r?.cleared||r.depth%5!==0)return null;
    ensure(r);
    if(r.autoCancelled||!r.autoRoute)return null;
    if(Number.isFinite(dt)&&dt>0)r.autoRemainingMs=Math.max(0,r.autoRemainingMs-dt);
    return r.autoRemainingMs===0?r.autoRoute:null;
  }
  return {validSpeed,duration,choice,ensure,reset,changeSpeed,step};
})();
