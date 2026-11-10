window.Progression = (() => {
  const level=n=>Math.max(1,Math.floor(Number(n)||1));
  const ranks=['Рекрут','Обученный','Ветеран','Элита','Спецгруппа'];
  function barracks(n){const l=level(n);return {hp:(l-1)*8,attack:l-1,armor:Math.min(8,Math.floor((l-1)/2)),rank:Math.min(4,Math.floor((l-1)/2))}}
  function armory(n){const l=level(n);return {attack:(l-1)*2,pierce:Math.min(4,Math.floor((l-1)/2))}}
  function medbay(n){const l=level(n);return {capacity:Math.min(12,l+2),tier:l>=5?3:l>=3?2:1,heal:14+l*2,rest:12+l*3}}
  function command(n){const l=level(n);return {reward:1+(l-1)*.1,recovery:Math.min(.7,.35+(l-1)*.05),cache:Math.min(.4,.25+(l-1)*.02)}}
  const percent=n=>Math.round(n*100)+'%';
  function describe(key,n){
    if(key==='barracks'){const b=barracks(n);return ranks[b.rank]+': новые платные бойцы +'+b.hp+' HP, +'+b.attack+' урона, +'+b.armor+' брони'}
    if(key==='armory'){const b=armory(n);return '+'+b.attack+' урона всем бойцам; игнорируется '+b.pierce+' ед. брони врага'}
    if(key==='medbay'){const b=medbay(n);return 'До '+b.capacity+' аптечек, уровень I'+(b.tier>=2?'–'+(b.tier===2?'II':'III'):'')+'. Медик: '+b.heal+' HP; медпост: '+b.rest+' HP'}
    const b=command(n);return 'Награды за бой +'+Math.round((b.reward-1)*100)+'%; при поражении '+percent(b.recovery)+' груза; тайник '+percent(b.cache);
  }
  return {barracks,armory,medbay,command,describe,ranks};
})();
