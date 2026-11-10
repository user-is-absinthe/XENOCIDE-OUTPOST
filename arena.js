/* Отдельная визуализация: не использует RNG и не изменяет состояние боя. */
window.Arena = (() => {
  function poly(g, points, color) {
    g.fillStyle = color; g.beginPath(); g.moveTo(points[0][0], points[0][1]);
    for (const p of points.slice(1)) g.lineTo(p[0], p[1]);
    g.closePath(); g.fill();
  }
  function shadow(g, x, y, w) {
    g.fillStyle = '#03080899'; g.beginPath(); g.ellipse(x, y, w, 5, 0, 0, Math.PI * 2); g.fill();
  }
  function marine(g, x, y, unit, phase, active) {
    const dead = unit.hp <= 0, bob = dead ? 0 : Math.sin(phase * 3) * 1.2;
    shadow(g, x, y + 2, 23); g.save(); g.translate(x, y + bob);
    if (dead) {
      // A distinct prone silhouette with the rifle lying separately on the floor.
      g.fillStyle='#182729';g.fillRect(-25,-10,38,8);
      poly(g,[[-19,-13],[4,-15],[12,-10],[7,-4],[-16,-4]],'#4a5c56');
      g.fillStyle='#839489';g.fillRect(-12,-12,13,3);
      g.fillStyle='#252f30';g.fillRect(-31,-7,12,4);g.fillRect(7,-7,15,4);
      g.fillStyle='#a3afa0';g.beginPath();g.ellipse(17,-10,7,5,0,0,Math.PI*2);g.fill();
      g.fillStyle='#1a2628';g.fillRect(-12,4,29,3);g.fillStyle='#7d8c83';g.fillRect(-8,4,13,1);
      g.restore();g.fillStyle='#9a7770';g.font='10px Segoe UI';g.textAlign='center';g.fillText(unit.name+' · погиб',x,y+17);g.textAlign='left';return;
    }
    const plate = unit.class === 'medic' ? '#669e8b' : unit.class === 'heavy' ? '#7b8272' : '#71878a';
    // Boots, knees and layered armor.
    poly(g,[[-15,-26],[-5,-25],[-6,-5],[-12,-2],[-18,-5]],'#202c2e');
    poly(g,[[2,-27],[12,-25],[14,-7],[8,-2],[1,-5]],'#263335');
    g.fillStyle='#101b1f'; g.fillRect(-19,-6,15,6); g.fillRect(1,-6,16,6);
    g.fillStyle='#75857b'; g.fillRect(-15,-20,8,6); g.fillRect(3,-20,8,6);
    poly(g,[[-16,-51],[-8,-59],[9,-58],[17,-48],[13,-27],[2,-22],[-13,-27]],'#182729');
    poly(g,[[-13,-48],[-6,-55],[9,-54],[14,-48],[11,-32],[0,-28],[-12,-32]],plate);
    g.fillStyle='#a6b4a2'; g.fillRect(-10,-49,16,3); g.fillStyle='#344b49'; g.fillRect(-7,-40,15,6);
    g.fillStyle='#283c3d'; g.fillRect(-20,-48,7,19); g.fillStyle='#9ba693'; g.fillRect(-18,-47,3,12);
    // Helmet is drawn in profile, with the visor facing the enemy.
    poly(g,[[-11,-65],[-5,-73],[7,-73],[14,-67],[14,-58],[-7,-57],[-12,-61]],'#1c3033');
    poly(g,[[-8,-66],[-3,-70],[8,-70],[12,-65],[9,-58],[-8,-59]],'#86988e');
    g.fillStyle='#172b2e';g.fillRect(5,-66,10,6);g.fillStyle='#80d8cc';g.fillRect(7,-65,7,2);
    // Arms, weapon and small muzzle flash.
    poly(g,[[-12,-48],[-17,-45],[-12,-35],[0,-35],[0,-41],[-7,-42]],'#445954');
    poly(g,[[8,-46],[15,-44],[18,-39],[31,-39],[31,-34],[13,-34],[7,-39]],'#596c63');
    g.fillStyle='#111d20';g.fillRect(18,-44,30,7);g.fillRect(28,-37,5,7);
    g.fillStyle='#98aaa1';g.fillRect(20,-43,18,2);g.fillStyle='#4b6661';g.fillRect(40,-43,8,4);
    if(active && Math.sin(phase*9)>0.91){poly(g,[[48,-43],[57,-47],[54,-41],[60,-39],[48,-37]],'#ffe7a1');}
    if(unit.class==='medic'){g.fillStyle='#e4d8c2';g.fillRect(-11,-46,7,7);g.fillStyle='#bb5550';g.fillRect(-8,-45,2,5);g.fillRect(-10,-43,5,2)}
    g.restore();
    g.fillStyle='#162323';g.fillRect(x-20,y-86,40,4);g.fillStyle='#72dccc';g.fillRect(x-20,y-86,40*Math.max(0,Math.min(1,unit.hp/(unit.maxHp||110))),4);
    g.fillStyle='#c5d2cb';g.font='10px Segoe UI';g.textAlign='center';g.fillText(unit.name,x,y+17);g.textAlign='left';
  }
  function alien(g,x,y,i,phase,active) {
    const cycle=((phase*0.52+i*0.23)%1), strike=active&&cycle<0.28?Math.sin(cycle/0.28*Math.PI):0;
    const bob=active?Math.sin(phase*3+i)*1.6-strike*5:0, colors=['#728f55','#ad7257','#8d9e66','#8b6e65','#94a14f'];
    shadow(g,x,y+2,26);g.save();g.translate(x-strike*17,y+bob);g.scale(-1,1);
    g.strokeStyle='#273829';g.lineWidth=5;g.lineCap='round';
    for(let j=0;j<3;j++){g.beginPath();g.moveTo(-10+j*11,-23);g.lineTo(-15+j*11,-8);g.lineTo(-21+j*12,-2);g.stroke()}
    poly(g,[[-26,-30],[-14,-45],[10,-48],[25,-37],[28,-23],[16,-13],[-13,-14]],'#22312a');
    poly(g,[[-22,-31],[-12,-42],[10,-44],[22,-35],[21,-23],[10,-17],[-12,-19]],colors[i%colors.length]);
    g.strokeStyle='#374a34';g.lineWidth=2;
    for(let j=0;j<3;j++){g.beginPath();g.moveTo(-12+j*9,-41);g.lineTo(-8+j*9,-30);g.lineTo(-12+j*9,-20);g.stroke()}
    poly(g,[[15,-39],[28,-35],[35,-27],[28,-21],[17,-23]],'#435a3e');
    g.fillStyle='#d3e596';g.fillRect(27,-31,3,3);g.fillStyle='#e16e4f';g.fillRect(32,-25,6,2);
    poly(g,[[-24,-31],[-34,-38],[-30,-28],[-24,-24]],'#516a42');
    g.fillStyle='#b3c39a';g.fillRect(-11,-39,9,2);g.fillRect(3,-40,7,2);
    g.restore();
    if(active&&cycle>=0.13&&cycle<0.42){const q=(cycle-0.13)/0.29, sx=x-31-210*q, sy=y-29-20*Math.sin(q*Math.PI);g.fillStyle='#c7ed6d';g.beginPath();g.ellipse(sx,sy,5,3,0,0,Math.PI*2);g.fill();g.fillStyle='#83bc4788';g.fillRect(sx+5,sy-1,10,2)}
  }
  function render(c,r,t,active) {
    if(!c || !r) return;
    const g=c.getContext('2d'), theme=r.depth%4;
    const walls=['#263c40','#34313b','#44362e','#283e32'], lights=['#78cfbd','#d09b69','#e79c65','#a7c86b'];
    g.clearRect(0,0,800,350);g.fillStyle='#0a1116';g.fillRect(0,0,800,350);
    let wall=g.createLinearGradient(0,0,0,170);wall.addColorStop(0,'#101a20');wall.addColorStop(1,walls[theme]);g.fillStyle=wall;g.fillRect(0,0,800,164);
    for(let i=0;i<8;i++){let x=i*110;g.fillStyle='#17262b';g.fillRect(x+8,0,10,164);g.fillStyle='#44585a';g.fillRect(x+10,4,2,130);g.fillStyle='#101d20';g.fillRect(x+30,44,60,80);g.fillStyle='#34494a';g.fillRect(x+33,48,54,3);g.fillStyle=lights[theme];g.fillRect(x+40,59,37,3);g.fillStyle='#203332';g.fillRect(x+38,68,40,40);g.fillStyle='#68877a';g.fillRect(x+43,74,28,2)}
    g.fillStyle='#10191d';g.fillRect(0,151,800,13);g.fillStyle=lights[theme];g.fillRect(0,158,800,2);
    // Perspective floor planes and converging seams give the shallow overhead view.
    poly(g,[[0,164],[800,164],[800,350],[0,350]],'#26363a');
    for(let j=0;j<4;j++){let y=166+j*j*12;poly(g,[[0,y],[800,y],[800,y+2],[0,y+2]],'#53605c55')}
    for(let i=0;i<=12;i++){let top=i*67;g.strokeStyle='#0d1c1d88';g.lineWidth=2;g.beginPath();g.moveTo(top,164);g.lineTo(400+(top-400)*1.5,350);g.stroke()}
    for(let i=0;i<8;i++){g.fillStyle='#9ca59640';g.fillRect(i*108+24,190+(i%2)*62,13,2)}
    g.fillStyle='#0c1519cc';g.fillRect(0,0,800,28);g.fillStyle=lights[theme];g.font='11px monospace';g.fillText('HELIOS / СЕКТОР '+r.depth+' / ШЛЮЗ '+(r.room||0),16,18);
    let cast=[];r.crew.forEach((u,i)=>cast.push({y:211+i*25,draw:()=>marine(g,130+(i%2)*45,211+i*25,u,t+i,active)}));
    for(let i=0;i<(r.foes||[]).length;i++){
      const foe=r.foes[i];if(foe.hp<=0)continue;
      const x=608+(i%2)*47,y=208+i*24;
      cast.push({y,draw:()=>{
        if(foe.elite){g.strokeStyle='#d8a1ec';g.lineWidth=2;g.beginPath();g.ellipse(x,y+3,32,7,0,0,Math.PI*2);g.stroke();g.save();g.translate(x,y);g.scale(1.15,1.15);g.translate(-x,-y)}
        alien(g,x,y,foe.type,t,active);
        if(foe.elite){g.restore();g.fillStyle='#e4b3f1';g.font='10px monospace';g.fillText('ЭЛИТА',x-20,y-72)}
        g.fillStyle=foe.elite?'#d8a1ec':'#d68c64';g.fillRect(x-20,y-60,40*foe.hp/foe.maxHp,3);
      }});
    }
    cast.sort((a,b)=>a.y-b.y).forEach(v=>v.draw());
    if(active)r.crew.forEach((unit,i)=>{if(unit.hp<=0)return;let phase=t+i, q=((phase*9-Math.asin(.91))/(Math.PI*2))%1;if(q<0)q+=1;if(q>.14)return;let startX=130+(i%2)*45+48,startY=211+i*25-41;g.globalAlpha=1-q/.14;g.strokeStyle='#ffe4a0';g.lineWidth=2;g.beginPath();g.moveTo(startX+q*1200,startY);g.lineTo(startX+q*1200+16,startY);g.stroke();g.globalAlpha=1});
  }
  return {render};
})();

