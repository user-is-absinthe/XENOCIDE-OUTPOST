/* Отдельная визуализация: не меняет состояние боя и не использует его RNG.
   Боевые эффекты (вспышки, числа урона, смерти) — только от событий движка;
   фоновая «жизнь» (покачивание) идёт по visualTime. При prefers-reduced-motion
   арена остаётся статичным кадром. */
window.Arena = (() => {
  let reduced = false;
  let queue = [], queueSpan = 600;   // события с таймингами
  let flashes = [], floaters = [];   // активные эффекты
  const deaths = new Map(), spawns = new Map(); // юнит → время события
  let lastT = null;

  function setReduced(v) { reduced = !!v; }
  function reset() { queue = []; flashes = []; floaters = []; deaths.clear(); spawns.clear(); lastT = null; }

  function emit(events, span = 600, immediate = false) {
    if (reduced || !Array.isArray(events) || !events.length) return;
    if (immediate) { const t = lastT == null ? 0 : lastT; for (const e of events) applyEvent(e, t); return; }
    for (const evt of events) queue.push({ evt, at: null });
    queueSpan = (span || 600) / 1000; // тайминги в секундах (visualTime), span приходит в мс
  }

  const alpha = (f, t) => Math.max(0, Math.min(1, 1 - (t - f.born) / Math.max(1, f.until - f.born)));

  function applyEvent(e, t) {
    switch (e.t) {
      case 'hit':
        if (e.side === 'foe') {
          flashes.push({ kind: 'muzzle', side: 'crew', unit: e.by, born: t, until: t + 0.2 });
          flashes.push({ kind: 'red', side: 'foe', unit: e.target, born: t, until: t + 0.35 });
          floaters.push({ text: '−' + e.dmg, color: '#ff9a86', side: 'foe', unit: e.target, born: t, until: t + 0.9 });
        } else {
          flashes.push({ kind: 'foeMuzzle', side: 'foe', unit: e.by, born: t, until: t + 0.2 });
          flashes.push({ kind: 'red', side: 'crew', unit: e.target, born: t, until: t + 0.35 });
          floaters.push({ text: '−' + e.dmg, color: '#ff9a86', side: 'crew', unit: e.target, born: t, until: t + 0.9 });
        }
        break;
      case 'kill':
        deaths.set(e.target, t);
        flashes.push({ kind: 'red', side: e.side === 'foe' ? 'foe' : 'crew', unit: e.target, born: t, until: t + 0.45 });
        break;
      case 'heal':
        if (e.target) {
          flashes.push({ kind: 'green', side: 'crew', unit: e.target, born: t, until: t + 0.4 });
          floaters.push({ text: '+' + e.amount, color: '#79e0a8', side: 'crew', unit: e.target, born: t, until: t + 0.9 });
        } else flashes.push({ kind: 'crewAll', born: t, until: t + 0.45 });
        break;
      case 'kit':
        if (e.target) {
          flashes.push({ kind: 'green', side: 'crew', unit: e.target, born: t, until: t + 0.4 });
          floaters.push({ text: '+' + e.amount, color: '#79e0a8', side: 'crew', unit: e.target, born: t, until: t + 0.9 });
        }
        break;
      case 'loot': floaters.push({ text: '+₡ ' + e.amount, color: '#e6c46a', side: 'crew', unit: null, born: t, until: t + 1 }); break;
      case 'spawn': if (Array.isArray(e.foes)) e.foes.forEach(f => spawns.set(f, t)); break;
      case 'sectorClear': flashes.push({ kind: 'screen', born: t, until: t + 0.3 }); break;
      case 'grenade': flashes.push({ kind: 'foeAll', born: t, until: t + 0.4 }); break;
      default: break;
    }
  }

  function processQueue(t) {
    const pending = queue.filter(q => q.at === null);
    if (pending.length) { const step = queueSpan / Math.max(1, pending.length); pending.forEach((q, i) => { q.at = t + step * (i + 1); }); }
    while (queue.length && queue[0].at <= t) applyEvent(queue.shift().evt, t);
    flashes = flashes.filter(f => f.until > t);
    floaters = floaters.filter(f => f.until > t);
    for (const [unit, born] of deaths) if (t - born > 1.2 && unit.hp > 0) deaths.delete(unit);
    for (const [unit, born] of spawns) if (t - born > 1) spawns.delete(unit);
  }

  function posOf(r, side, unit) {
    if (side === 'crew') {
      const i = (r.crew || []).indexOf(unit);
      if (i < 0) return null;
      return { x: 130 + (i % 2) * 45, y: 211 + i * 25 };
    }
    const i = (r.foes || []).indexOf(unit);
    if (i < 0) return null;
    return { x: 608 + (i % 2) * 47, y: 208 + i * 24 };
  }

  function poly(g, points, color) {
    g.fillStyle = color; g.beginPath(); g.moveTo(points[0][0], points[0][1]);
    for (const p of points.slice(1)) g.lineTo(p[0], p[1]);
    g.closePath(); g.fill();
  }
  function shadow(g, x, y, w) {
    g.fillStyle = '#03080899'; g.beginPath(); g.ellipse(x, y, w, 5, 0, 0, Math.PI * 2); g.fill();
  }

  function paintFlash(g, r, f, t) {
    const a = alpha(f, t);
    if (a <= 0) return;
    if (f.kind === 'screen') { // зачистка сектора: мягкая радиальная подсветка, не белый экран
      g.globalAlpha = a * 0.32;
      const grad = g.createRadialGradient(400, 235, 30, 400, 235, 400);
      grad.addColorStop(0, '#eafff6'); grad.addColorStop(1, 'rgba(234,255,246,0)');
      g.fillStyle = grad; g.fillRect(0, 0, 800, 350); g.globalAlpha = 1; return;
    }
    if (f.kind === 'foeAll') {
      (r.foes || []).filter(e => e.hp > 0).forEach(e => { const p = posOf(r, 'foe', e); if (p) paintBurst(g, p.x, p.y - 28, a, '#ffb36b'); });
      return;
    }
    if (f.kind === 'crewAll') {
      (r.crew || []).filter(c => c.hp > 0).forEach(c => { const p = posOf(r, 'crew', c); if (p) paintBurst(g, p.x, p.y - 36, a, '#5fe0a0'); });
      return;
    }
    const pos = posOf(r, f.side, f.unit);
    if (!pos) return;
    if (f.kind === 'red') { g.globalAlpha = a * 0.6; g.fillStyle = '#ff4b3a'; g.beginPath(); g.ellipse(pos.x, pos.y - 34, 24, 32, 0, 0, Math.PI * 2); g.fill(); g.globalAlpha = 1; return; }
    if (f.kind === 'green') { paintBurst(g, pos.x, pos.y - 40, a, '#5fe0a0'); return; }
    if (f.kind === 'muzzle') { g.globalAlpha = a; poly(g, [[pos.x + 44, pos.y - 41], [pos.x + 58, pos.y - 48], [pos.x + 55, pos.y - 40], [pos.x + 66, pos.y - 36], [pos.x + 45, pos.y - 33]], '#ffe7a1'); g.globalAlpha = 1; return; }
    if (f.kind === 'foeMuzzle') { g.globalAlpha = a; poly(g, [[pos.x - 30, pos.y - 30], [pos.x - 46, pos.y - 38], [pos.x - 42, pos.y - 28], [pos.x - 54, pos.y - 24], [pos.x - 32, pos.y - 22]], '#d7f58a'); g.globalAlpha = 1; }
  }
  function paintBurst(g, x, y, a, color) {
    g.globalAlpha = a * 0.7; g.fillStyle = color;
    g.beginPath(); g.ellipse(x, y, 20, 26, 0, 0, Math.PI * 2); g.fill();
    g.globalAlpha = 1;
  }
  function paintFloater(g, r, f, t, n) {
    const pos = f.unit != null ? posOf(r, f.side, f.unit) : { x: 300, y: 175 };
    if (!pos) return;
    const k = (t - f.born) / Math.max(1, f.until - f.born);
    const ox = n ? (n % 2 ? 12 : -12) : 0, oy = n * 13; // сдвиг, чтобы числа не сливались
    g.globalAlpha = k < 0.55 ? 1 : Math.max(0, 1 - (k - 0.55) / 0.45);
    g.fillStyle = f.color; g.font = 'bold 13px monospace'; g.textAlign = 'center';
    g.fillText(f.text, pos.x + ox, pos.y - 74 - k * 26 - oy);
    g.textAlign = 'left'; g.globalAlpha = 1;
  }
  /* Числа сдвигаются по цели: одинаковые цели рисуются веером, а не друг на друге. */
  function paintFloaters(g, r, list, t) {
    const seen = new Map();
    for (const f of list) {
      const idx = f.unit == null ? 'x' : (f.side === 'crew' ? (r.crew || []).indexOf(f.unit) : (r.foes || []).indexOf(f.unit));
      const key = (f.side || '') + ':' + idx;
      const n = seen.get(key) || 0; seen.set(key, n + 1);
      paintFloater(g, r, f, t, n);
    }
  }

  /* --- Тело бойца (профиль): шлем, броня, винтовка. --- */
  function body(g, x, y, unit, phase, active, bob) {
    const col = unit.class === 'medic' ? '#669e8b' : unit.class === 'heavy' ? '#7b8272' : '#71878a';
    g.save(); g.translate(x, y + bob);
    g.fillStyle = '#080d10'; g.fillRect(-18, -4, 42, 5);
    poly(g, [[-15, -26], [-5, -25], [-6, -5], [-12, -2], [-18, -5]], '#202c2e');
    poly(g, [[2, -27], [12, -25], [14, -7], [8, -2], [1, -5]], '#263335');
    g.fillStyle = '#101b1f'; g.fillRect(-19, -6, 15, 6); g.fillRect(1, -6, 16, 6);
    g.fillStyle = '#75857b'; g.fillRect(-15, -20, 8, 6); g.fillRect(3, -20, 8, 6);
    poly(g, [[-16, -51], [-8, -59], [9, -58], [17, -48], [13, -27], [2, -22], [-13, -27]], '#182729');
    poly(g, [[-13, -48], [-6, -55], [9, -54], [14, -48], [11, -32], [0, -28], [-12, -32]], col);
    g.fillStyle = '#a6b4a2'; g.fillRect(-10, -49, 16, 3); g.fillStyle = '#344b49'; g.fillRect(-7, -40, 15, 6);
    g.fillStyle = '#283c3d'; g.fillRect(-20, -48, 7, 19); g.fillStyle = '#9ba693'; g.fillRect(-18, -47, 3, 12);
    poly(g, [[-11, -65], [-5, -73], [7, -73], [14, -67], [14, -58], [-7, -57], [-12, -61]], '#1c3033');
    poly(g, [[-8, -66], [-3, -70], [8, -70], [12, -65], [9, -58], [-8, -59]], '#86988e');
    g.fillStyle = '#172b2e'; g.fillRect(5, -66, 10, 6); g.fillStyle = '#80d8cc'; g.fillRect(7, -65, 7, 2);
    poly(g, [[-12, -48], [-17, -45], [-12, -35], [0, -35], [0, -41], [-7, -42]], '#445954');
    poly(g, [[8, -46], [15, -44], [18, -39], [31, -39], [31, -34], [13, -34], [7, -39]], '#596c63');
    g.fillStyle = '#111d20'; g.fillRect(18, -44, 30, 7); g.fillRect(28, -37, 5, 7);
    g.fillStyle = '#98aaa1'; g.fillRect(20, -43, 18, 2); g.fillStyle = '#4b6661'; g.fillRect(40, -43, 8, 4);
    if (unit.class === 'medic') { g.fillStyle = '#e4d8c2'; g.fillRect(-11, -46, 7, 7); g.fillStyle = '#bb5550'; g.fillRect(-8, -45, 2, 5); g.fillRect(-10, -43, 5, 2); }
    g.restore();
  }

  function marine(g, x, y, unit, phase, active, fall) {
    const dead = unit.hp <= 0;
    if (dead && (fall === undefined || fall >= 1)) {
      // Лежащий силуэт: винтовка отдельно на полу.
      shadow(g, x, y + 2, 23); g.save(); g.translate(x, y);
      g.fillStyle = '#182729'; g.fillRect(-25, -10, 38, 8);
      poly(g, [[-19, -13], [4, -15], [12, -10], [7, -4], [-16, -4]], '#4a5c56');
      g.fillStyle = '#839489'; g.fillRect(-12, -12, 13, 3);
      g.fillStyle = '#252f30'; g.fillRect(-31, -7, 12, 4); g.fillRect(7, -7, 15, 4);
      g.fillStyle = '#a3afa0'; g.beginPath(); g.ellipse(17, -10, 7, 5, 0, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#1a2628'; g.fillRect(-12, 4, 29, 3); g.fillStyle = '#7d8c83'; g.fillRect(-8, 4, 13, 1);
      g.restore(); g.fillStyle = '#9a7770'; g.font = '10px Segoe UI'; g.textAlign = 'center'; g.fillText(unit.name + ' · погиб', x, y + 17); g.textAlign = 'left';
      g.fillStyle = '#162323'; g.fillRect(x - 20, y - 86, 40, 4);
      return;
    }
    if (dead && fall <= 0) { shadow(g, x, y + 2, 23); body(g, x, y, unit, phase, false, 0); }
    else if (dead) { // падение: тело поворачивается к полу
      shadow(g, x, y + 2, 23); g.save(); g.translate(x, y); g.rotate(Math.min(1, fall) * 1.45); g.translate(-x, -y); body(g, x, y, unit, phase, false, 0); g.restore();
    } else { shadow(g, x, y + 2, 23); body(g, x, y, unit, phase, active, Math.sin(phase * 3) * 1.2); }
    g.fillStyle = '#162323'; g.fillRect(x - 20, y - 86, 40, 4);
    g.fillStyle = '#72dccc'; g.fillRect(x - 20, y - 86, 40 * Math.max(0, Math.min(1, unit.hp / (unit.maxHp || 110))), 4);
    g.fillStyle = '#c5d2cb'; g.font = '10px Segoe UI'; g.textAlign = 'center'; g.fillText(unit.name, x, y + 17); g.textAlign = 'left';
  }

  function alien(g, x, y, i, phase, active) {
    const bob = active ? Math.sin(phase * 3 + i) * 1.6 : 0;
    const colors = ['#728f55', '#ad7257', '#8d9e66', '#8b6e65', '#94a14f'];
    shadow(g, x, y + 2, 26); g.save(); g.translate(x, y + bob); g.scale(-1, 1);
    g.strokeStyle = '#273829'; g.lineWidth = 5; g.lineCap = 'round';
    for (let j = 0; j < 3; j++) { g.beginPath(); g.moveTo(-10 + j * 11, -23); g.lineTo(-15 + j * 11, -8); g.lineTo(-21 + j * 12, -2); g.stroke(); }
    poly(g, [[-26, -30], [-14, -45], [10, -48], [25, -37], [28, -23], [16, -13], [-13, -14]], '#22312a');
    poly(g, [[-22, -31], [-12, -42], [10, -44], [22, -35], [21, -23], [10, -17], [-12, -19]], colors[i % colors.length]);
    g.strokeStyle = '#374a34'; g.lineWidth = 2;
    for (let j = 0; j < 3; j++) { g.beginPath(); g.moveTo(-12 + j * 9, -41); g.lineTo(-8 + j * 9, -30); g.lineTo(-12 + j * 9, -20); g.stroke(); }
    poly(g, [[15, -39], [28, -35], [35, -27], [28, -21], [17, -23]], '#435a3e');
    g.fillStyle = '#d3e596'; g.fillRect(27, -31, 3, 3); g.fillStyle = '#e16e4f'; g.fillRect(32, -25, 6, 2);
    poly(g, [[-24, -31], [-34, -38], [-30, -28], [-24, -24]], '#516a42');
    g.fillStyle = '#b3c39a'; g.fillRect(-11, -39, 9, 2); g.fillRect(3, -40, 7, 2);
    g.restore();
  }

  /* Фоновая сцена: стены, пол, актёры. Без боевых эффектов. */
  function scene(g, r, t, active) {
    const theme = r.depth % 4;
    const walls = ['#263c40', '#34313b', '#44362e', '#283e32'], lights = ['#78cfbd', '#d09b69', '#e79c65', '#a7c86b'];
    g.clearRect(0, 0, 800, 350); g.fillStyle = '#0a1116'; g.fillRect(0, 0, 800, 350);
    let wall = g.createLinearGradient(0, 0, 0, 170); wall.addColorStop(0, '#101a20'); wall.addColorStop(1, walls[theme]);
    g.fillStyle = wall; g.fillRect(0, 0, 800, 164);
    for (let i = 0; i < 8; i++) { let x = i * 110; g.fillStyle = '#17262b'; g.fillRect(x + 8, 0, 10, 164); g.fillStyle = '#44585a'; g.fillRect(x + 10, 4, 2, 130); g.fillStyle = '#101d20'; g.fillRect(x + 30, 44, 60, 80); g.fillStyle = '#34494a'; g.fillRect(x + 33, 48, 54, 3); g.fillStyle = lights[theme]; g.fillRect(x + 40, 59, 37, 3); g.fillStyle = '#203332'; g.fillRect(x + 38, 68, 40, 40); g.fillStyle = '#68877a'; g.fillRect(x + 43, 74, 28, 2); }
    g.fillStyle = '#10191d'; g.fillRect(0, 151, 800, 13); g.fillStyle = lights[theme]; g.fillRect(0, 158, 800, 2);
    poly(g, [[0, 164], [800, 164], [800, 350], [0, 350]], '#26363a');
    for (let j = 0; j < 4; j++) { let y = 166 + j * j * 12; poly(g, [[0, y], [800, y], [800, y + 2], [0, y + 2]], '#53605c55'); }
    for (let i = 0; i <= 12; i++) { let top = i * 67; g.strokeStyle = '#0d1c1d88'; g.lineWidth = 2; g.beginPath(); g.moveTo(top, 164); g.lineTo(400 + (top - 400) * 1.5, 350); g.stroke(); }
    for (let i = 0; i < 8; i++) { g.fillStyle = '#9ca59640'; g.fillRect(i * 108 + 24, 190 + (i % 2) * 62, 13, 2); }
    g.fillStyle = '#0c1519cc'; g.fillRect(0, 0, 800, 28); g.fillStyle = lights[theme]; g.font = '11px monospace';
    g.fillText('HELIOS / СЕКТОР ' + r.depth + ' / ШЛЮЗ ' + (r.room || 0), 16, 18);
    const cast = [];
    // При замороженном кадре анимации падения завершаются сразу — иначе
    // тела застывали бы в полуповороте на всё время паузы/перехода.
    const frozen = !active;
    r.crew.forEach((u, i) => {
      const fall = deaths.has(u) ? (frozen ? 1 : Math.min(1, (t - deaths.get(u)) / 0.45)) : undefined;
      cast.push({ y: 211 + i * 25, draw: () => marine(g, 130 + (i % 2) * 45, 211 + i * 25, u, t + i, active, fall) });
    });
    for (let i = 0; i < (r.foes || []).length; i++) {
      const foe = r.foes[i];
      const dead = foe.hp <= 0;
      const dT = deaths.get(foe);
      if (dead && (frozen || dT === undefined || t - dT >= 0.5)) continue;
      const fall = dead ? Math.min(1, (t - dT) / 0.5) : 0;
      const sT = spawns.get(foe);
      const fade = sT === undefined ? 1 : Math.max(0, Math.min(1, (t - sT) / 0.35));
      const x = 608 + (i % 2) * 47, y = 208 + i * 24;
      cast.push({
        y, draw: () => {
          g.globalAlpha = fade;
          if (foe.elite && !dead) { g.strokeStyle = '#d8a1ec'; g.lineWidth = 2; g.beginPath(); g.ellipse(x, y + 3, 32, 7, 0, 0, Math.PI * 2); g.stroke(); }
          if (dead) { g.save(); g.translate(x, y); g.rotate(fall * 1.5); g.translate(-x, -y); alien(g, x, y, foe.type, t, false); g.restore(); }
          else { g.save(); if (foe.elite) { g.translate(x, y); g.scale(1.15, 1.15); g.translate(-x, -y); } alien(g, x, y, foe.type, t, active); g.restore(); }
          g.globalAlpha = 1;
          if (foe.elite && !dead) { g.fillStyle = '#e4b3f1'; g.font = '10px monospace'; g.fillText('ЭЛИТА', x - 20, y - 72); }
          if (!dead) { g.fillStyle = foe.elite ? '#d8a1ec' : '#d68c64'; g.fillRect(x - 20, y - 60, 40 * foe.hp / (foe.maxHp || foe.hp), 3); }
        }
      });
    }
    cast.sort((a, b) => a.y - b.y).forEach(v => v.draw());
  }

  function render(c, r, t, active) {
    if (!c || !r) return;
    const g = c.getContext('2d');
    if (lastT === null || t < lastT) { flashes = []; floaters = []; queue = queue.filter(q => q.at === null); deaths.clear(); spawns.clear(); }
    lastT = t;
    scene(g, r, t, active);
    if (!active) {
      // Кадр заморозился (пауза, переход, экран шлюза): визуальное время стоит,
      // и незавершённые вспышки/числа зависли бы в статике — убираем их.
      // Очередь сохраняется: она в визуальных секундах и доиграет после возобновления.
      flashes = []; floaters = [];
      return;
    }
    if (!reduced) {
      processQueue(t);
      for (const f of flashes) paintFlash(g, r, f, t);
      paintFloaters(g, r, floaters, t);
    }
  }

  /* --- Демо-сцена главного меню: синтетический бой без RNG и состояния игры.
     Тайминги детерминированы от времени цикла; при reduced — статичный кадр. --- */
  const demoRaid = { depth: 7, room: 2, crew: [], foes: [] };
  function demoFrame(tt) {
    if (!demoRaid.crew.length) {
      const names = ['Ким-14', 'Орлов-22', 'Вега-31', 'Сато-47'], kinds = ['heavy', 'medic', 'assault', 'engineer'];
      demoRaid.crew = names.map((name, i) => ({ id: 900 + i, name, class: kinds[i], hp: 100, maxHp: 100, armor: 2, atk: 12 }));
      demoRaid.foes = [{ type: 1, elite: false, hp: 60, maxHp: 60 }, { type: 3, elite: false, hp: 80, maxHp: 80 }];
    }
    demoRaid.foes[0].hp = tt >= 7 ? 0 : Math.min(60, 60 - (tt > 1.5 ? 10 : 0) - (tt > 3 ? 10 : 0) - (tt > 5 ? 30 : 0));
    demoRaid.foes[0].maxHp = 60;
    demoRaid.foes[1].hp = 80 - (tt > 3.5 ? 12 : 0) - (tt > 10 ? 12 : 0);
    demoRaid.crew[0].hp = 100 - (tt > 5 ? 12 : 0);
    demoRaid.crew[1].hp = 100 - (tt > 9 ? 9 : 0);
    return demoRaid;
  }
  function demo(c, t, quiet) {
    if (!c || !c.getContext) return;
    const cycle = 12, tt = quiet ? 0 : (t % cycle);
    const r = demoFrame(tt);
    const g = c.getContext('2d');
    if (tt < 7) deaths.delete(r.foes[0]); else deaths.set(r.foes[0], t - (tt - 7));
    scene(g, r, quiet ? 0 : t, !quiet);
    if (quiet) return;
    const flashes = [], floaters = [];
    const at = (from, dur) => tt >= from && tt < from + dur;
    // Тайминги эффекта — от позиции в окне: born пересчитывается каждый кадр,
    // чтобы вспышка/число анимировались, а не застывали (статичный born=t).
    const span = (from, dur) => ({ born: t - (tt - from), until: t - (tt - from) + dur });
    if (at(1.5, 0.3)) { const w = span(1.5, 0.3), wf = span(1.5, 0.9); flashes.push({ kind: 'muzzle', side: 'crew', unit: r.crew[0], ...w }); flashes.push({ kind: 'red', side: 'foe', unit: r.foes[0], ...w }); floaters.push({ text: '−10', color: '#ff9a86', side: 'foe', unit: r.foes[0], ...wf }); }
    if (at(3.5, 0.3)) { const w = span(3.5, 0.3), wf = span(3.5, 0.9); flashes.push({ kind: 'muzzle', side: 'crew', unit: r.crew[2], ...w }); flashes.push({ kind: 'red', side: 'foe', unit: r.foes[1], ...w }); floaters.push({ text: '−12', color: '#ff9a86', side: 'foe', unit: r.foes[1], ...wf }); }
    if (at(5, 0.3)) { const w = span(5, 0.3), wf = span(5, 0.9); flashes.push({ kind: 'foeMuzzle', side: 'foe', unit: r.foes[1], ...w }); flashes.push({ kind: 'red', side: 'crew', unit: r.crew[1], ...w }); floaters.push({ text: '−6', color: '#ff9a86', side: 'crew', unit: r.crew[1], ...wf }); }
    if (at(7, 0.45)) flashes.push({ kind: 'red', side: 'foe', unit: r.foes[0], ...span(7, 0.45) });
    if (at(9, 0.4)) { const w = span(9, 0.4), wf = span(9, 0.9); flashes.push({ kind: 'green', side: 'crew', unit: r.crew[1], ...w }); floaters.push({ text: '+12', color: '#79e0a8', side: 'crew', unit: r.crew[1], ...wf }); }
    if (at(10.5, 0.3)) { const w = span(10.5, 0.3), wf = span(10.5, 0.9); flashes.push({ kind: 'muzzle', side: 'crew', unit: r.crew[3], ...w }); flashes.push({ kind: 'red', side: 'foe', unit: r.foes[1], ...w }); floaters.push({ text: '−9', color: '#ff9a86', side: 'foe', unit: r.foes[1], ...wf }); }
    for (const f of flashes) paintFlash(g, r, f, t);
    paintFloaters(g, r, floaters, t);
  }

  return { render, demo, emit, reset, setReduced };
})();