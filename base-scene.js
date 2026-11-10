/* Static, local SVG: redraw only when the base UI changes, no combat RNG. */
window.BaseScene = (() => {
  const buildings = [
    ['barracks', 'Казармы', '#99ad8c', '01'],
    ['armory', 'Арсенал', '#e0b06b', '02'],
    ['medbay', 'Медблок', '#72cbb5', '03'],
    ['command', 'Командный центр', '#83bbd9', '04'],
  ];
  const rect = (x,y,w,h,fill,extra='') => '<rect x="'+x+'" y="'+y+'" width="'+w+'" height="'+h+'" fill="'+fill+'" '+extra+'/>';
  function building(key,name,color,number,index,rawLevel) {
    const level=Math.max(1,Math.floor(Number(rawLevel)||1)), tier=Math.min(5,level);
    const x=55+index*257, y=235, height=48+tier*9, top=y-height;
    let out='<a href="#building-'+key+'" aria-label="'+name+', уровень '+level+'. Перейти к улучшению." class="base-building">';
    out+='<title>'+name+' · уровень '+level+'</title><g transform="translate('+x+' 0)">';
    out+='<ellipse cx="108" cy="244" rx="112" ry="12" fill="#071014" opacity=".7"/>';
    // Three surfaces make each prefab read from slightly above.
    out+='<path d="M0 '+top+' L17 '+(top-14)+' H189 L172 '+top+' Z" fill="#5a6e71"/>';
    out+='<path d="M172 '+top+' L189 '+(top-14)+' V221 L172 235 Z" fill="#20363d"/>';
    out+=rect(0,top,172,height,'#354a50','stroke="#78928c" stroke-opacity=".4"');
    out+=rect(0,top+4,172,3,color)+rect(0,229,172,6,'#1a2c31');
    for(let j=0;j<5;j++)out+=rect(9+j*33,top+16,2,height-25,'#24383d');
    out+=rect(65,201,37,34,'#102328')+rect(69,205,29,30,'#243c40');
    out+=rect(83,205,2,30,'#0b1c22')+rect(90,219,3,3,color);
    for(let j=0;j<tier+1;j++)out+=rect(12+j*25,top+22,16,8,j<tier?color:'#233b42');
    out+='<text x="138" y="225" fill="#a4b8b7" font-size="17" font-family="monospace">'+number+'</text>';
    // Level two: dedicated utility module; level three: a second roof module.
    if(tier>=2){
      out+=rect(17,top-32,50,18,'#3d555c')+rect(22,top-30,40,3,color);
      out+='<path d="M17 '+(top-32)+' l7 -6 h50 l-7 6" fill="#718482"/>';
      for(let j=0;j<4;j++)out+=rect(23+j*10,top-23,5,5,'#172a30');
    }
    if(tier>=3){
      out+=rect(111,top-24,44,24,'#435e64')+rect(115,top-20,35,8,color);
      out+=rect(116,top-9,3,4,'#153038')+rect(124,top-9,20,2,'#9bb3ae');
    }
    // Unique equipment is visible even on the first level.
    if(key==='barracks'){
      out+=rect(-18,204,30,25,'#526151')+rect(-14,207,22,3,'#84967a');
      if(tier>=3)out+=rect(-25,190,24,13,'#3a4e44')+rect(-22,192,18,2,color);
      if(tier>=4)out+='<path d="M35 '+(top-37)+' v-28 h28 l-8 8 8 8 H35" stroke="#7c9990" fill="'+color+'"/>';
    }else if(key==='armory'){
      out+=rect(140,240,35,12,'#5f5940')+rect(145,242,25,2,color);
      out+=rect(149,248,3,4,'#222d29')+rect(166,248,3,4,'#222d29');
      if(tier>=4)out+=rect(85,top-13,12,13,'#263b42')+rect(78,top-23,25,11,'#879487')+rect(99,top-21,29,4,color);
    }else if(key==='medbay'){
      out+=rect(134,top+18,24,24,'#183c38')+rect(144,top+22,5,16,color)+rect(138,top+28,17,5,color);
      if(tier>=4)out+=rect(-19,190,19,40,'#405b59')+rect(-16,195,13,16,'#69b49c')+rect(-15,216,11,9,'#27443e');
    }else{
      out+='<path d="M91 '+(top-4)+' v-35 m-14 2 h28 m-24 -7 h20" stroke="'+color+'" stroke-width="3" fill="none"/>';
      if(tier>=4)out+='<path d="M141 '+(top-24)+' v-20 m-13 -15 q0 25 27 19 Z" fill="#9bb4b0" stroke="#415e66"/>';
    }
    if(tier>=5){
      out+=rect(200,157,4,82,'#587377')+rect(190,155,24,6,color);
      out+='<path d="M192 161 L165 240 H230 L212 161" fill="'+color+'" opacity=".07"/>';
      out+=rect(198,147,8,4,'#e4ae73');
    }
    out+='<rect class="building-focus" x="-30" y="80" width="256" height="183" rx="4" fill="none" stroke="'+color+'" opacity="0"/>';
    out+='<text x="85" y="279" text-anchor="middle" fill="#d3e4df" font-family="Segoe UI, sans-serif" font-size="15">'+name+'</text>';
    out+='<text x="85" y="299" text-anchor="middle" fill="'+color+'" font-family="monospace" font-size="12">УРОВЕНЬ '+level+'</text>';
    out+='</g></a>';return out;
  }
  function html(levels){
    const upgrades=buildings.reduce((n,[key])=>n+Math.max(0,(Number(levels[key])||1)-1),0);
    let scene='<svg viewBox="0 0 1080 320" xmlns="http://www.w3.org/2000/svg" role="group" aria-labelledby="outpost-title"><title id="outpost-title">Панорама поста Ковчег. Здания растут вместе с уровнем улучшений.</title>';
    scene+='<defs><linearGradient id="base-sky" x2="0" y2="1"><stop stop-color="#101e2a"/><stop offset="1" stop-color="#294346"/></linearGradient></defs>';
    scene+=rect(0,0,1080,320,'#12252a')+rect(0,0,1080,185,'url(#base-sky)');
    scene+='<circle cx="906" cy="46" r="25" fill="#afc1ab" opacity=".2"/>';
    scene+='<path d="M0 132 l70 -19 35 14 64 -29 51 31 61 -12 65 14 71 -32 80 24 75 -8 67 20 61 -28 94 18 67 -28 56 20 61 -5 42 25 V180 H0Z" fill="#172c35"/>';
    for(let i=0;i<17;i++)scene+=rect(i*69,154,3,33,'#416065');
    scene+=rect(0,164,1080,2,'#3e5a60')+rect(0,184,1080,70,'#23393d');
    scene+='<path d="M0 251 H1080 M0 256 H1080" stroke="#688077" stroke-width="2" opacity=".45"/>';
    for(let i=0;i<26;i++)scene+=rect(i*43+10,250,15,3,'#c9b47a','opacity=".4"');
    scene+=buildings.map(([key,name,color,num],i)=>building(key,name,color,num,i,levels[key])).join('');
    scene+='</svg>';
    return '<section class="base-panorama" aria-label="Внешний вид базы"><div class="base-panorama-caption"><span>КОВЧЕГ / ВНЕШНИЙ ПЕРИМЕТР</span><span>УЛУЧШЕНИЙ: '+upgrades+'</span></div>'+scene+'<p>Выберите здание, чтобы перейти к его улучшению. Новые секции и оборудование появляются до уровня 5.</p></section>';
  }
  return {html};
})();
