/* Preparation and automatic battle orders, independent of DOM and visual RNG. */
window.Preparation = (() => {
  const price=12, limit=3;
  const tiers={1:{name:'I · Полевая',heal:30,price:12},2:{name:'II · Усиленная',heal:55,price:22},3:{name:'III · Регенеративная',heal:90,price:36}};
  const orders={
    front:{name:'Сосредоточенный огонь',text:'Все атакуют первого живого противника.'},
    weak:{name:'Добивать раненых',text:'Первой атакуется цель с наименьшим текущим HP.'},
    threat:{name:'Подавлять угрозы',text:'Первой атакуется цель с наибольшим уроном до учёта брони.'}
  };
  function normalize(value,medicalLevel=1){
    const p=value||{};
    const medical=Progression.medbay(medicalLevel);
    return {order:Object.prototype.hasOwnProperty.call(orders,p.order)?p.order:'front',kits:Number.isInteger(p.kits)?Math.max(0,Math.min(medical.capacity,p.kits)):0,kitTier:Number.isInteger(p.kitTier)?Math.max(1,Math.min(medical.tier,p.kitTier)):1};
  }
  function cost(p,medicalLevel=1){const settings=normalize(p,medicalLevel);return settings.kits*tiers[settings.kitTier].price}
  function target(enemies,order){
    const alive=enemies.filter(e=>e.hp>0);
    if(!alive.length)return null;
    if(order==='weak')return alive.reduce((a,b)=>b.hp<a.hp?b:a);
    const danger=e=>(e.type===5?11:4+e.type)*(e.attackFactor||1);
    if(order==='threat')return alive.reduce((a,b)=>danger(b)>danger(a)?b:a);
    return alive[0];
  }
  function useKit(r){
    if(!(r.kits>0))return null;
    const candidates=r.crew.filter(c=>c.hp>0&&c.maxHp>0&&c.hp/c.maxHp<=.35);
    if(!candidates.length)return null;
    const unit=candidates.reduce((a,b)=>b.hp/b.maxHp<a.hp/a.maxHp?b:a);
    const healed=Math.min((r.kitHeal||30)+(r.kitBonus||0),unit.maxHp-unit.hp);
    r.kits--;unit.hp+=healed;
    return {name:unit.name,healed,unit};
  }
  function restoreRaid(r){
    if(!r)return;
    r.order=normalize({order:r.order}).order;
    r.kits=r.kits??0;r.kitsBought=r.kitsBought??r.kits;
    r.kitTier=r.kitTier??1;r.kitCapacity=r.kitCapacity??3;
    if(![1,2,3].includes(r.kitTier)||!Number.isInteger(r.kitCapacity)||r.kitCapacity<3||r.kitCapacity>12)throw Error('Некорректный тип аптечек');
    const kit=tiers[r.kitTier];
    if(r.kitPrice!=null&&r.kitPrice!==kit.price||r.kitHeal!=null&&r.kitHeal!==kit.heal)throw Error('Некорректные характеристики аптечек');
    r.kitPrice=kit.price;r.kitHeal=kit.heal;
    r.kitBonus=Number.isFinite(r.kitBonus)&&r.kitBonus>=0?Math.floor(r.kitBonus):0;
    r.findBonus=Number.isFinite(r.findBonus)&&r.findBonus>=0?r.findBonus:0;
    r.grenadeUsed=!!r.grenadeUsed;
    r.covered=!!r.covered;
    if(!Number.isInteger(r.kits)||!Number.isInteger(r.kitsBought)||r.kits<0||r.kits>r.kitsBought||r.kitsBought>r.kitCapacity||r.kitsBought<0)throw Error('Некорректный запас аптечек');
  }
  return {price,limit,tiers,orders,normalize,cost,target,useKit,restoreRaid};
})();
