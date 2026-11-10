/* Чистая симуляция рейда без DOM (п. 1.3 плана).
   - весь RNG рейда — только здесь, в фиксированном порядке (LCG по seed);
   - step/turn возвращает массив событий, состояние меняет только движок;
   - журнал боя — производная: события прогоняются через один форматтер. */
window.Battle = (() => {
  const enemies = ['Личинка', 'Ползун', 'Плевальщик', 'Панцирник', 'Узел гнезда', 'Матка'];
  const E = Balance.encounter, C = Balance.combat, R = Balance.rewards, L = Balance.loot, RAID = Balance.raid;

  const roll = r => { r.seed = (1664525 * r.seed + 1013904223) >>> 0; return r.seed / 4294967296; };
  const routeInfo = r => Object.prototype.hasOwnProperty.call(Balance.routes, r.route) ? Balance.routes[r.route] : Balance.routes.normal;
  const foeName = e => (e.elite ? 'Элитный · ' : '') + (enemies[e.type] || 'Неизвестный');

  /* --- Пакет 0.6.0: модификаторы комнат, механики врагов и боссов --- */
  const M = Balance.modifiers, ROOM = Balance.roomEvents;
  const modOf = r => (r && r.modifier && M && M.list[r.modifier]) ? M.list[r.modifier] : null;
  const healMul = r => { const m = modOf(r); return m && m.healMul != null ? m.healMul : 1; };
  const enemyMul = r => { const m = modOf(r); return m && m.enemyMul != null ? m.enemyMul : 1; };
  const rewardMul = r => { const m = modOf(r); return m && m.rewardMul != null ? m.rewardMul : 1; };

  /* Враги-подкрепления (Личинки Матки/Узла) — детальны без RNG: не сдвигают поток seed. */
  function freshFoe(r, type) {
    const route = routeInfo(r);
    const hp = Math.round((type === E.bossType ? E.bossHp : E.hpFlat + type * E.hpPerType) * (1 + r.depth * E.depthScale) * route.hp);
    return { type, elite: false, hp, maxHp: hp, attackFactor: route.attack, rewardFactor: route.reward };
  }
  const liveLarvae = r => (r.foes || []).filter(e => e.hp > 0 && e.type === 0).length;

  /* Одиночный элитный враг (событие «Запечатанный контейнер»). */
  function eliteFoe(r) {
    const route = routeInfo(r);
    const type = Math.floor(roll(r) * E.typeCount);
    const hp = Math.round((E.hpFlat + type * E.hpPerType) * (1 + r.depth * E.depthScale) * route.hp * E.eliteHp);
    return { type, elite: true, hp, maxHp: hp, attackFactor: route.attack * E.eliteAttack, rewardFactor: route.reward * E.eliteReward };
  }

  /* Модификатор комнаты (детерминирован seed): с 3-го сектора, не шлюз, шанс 20%. */
  function rollModifier(r) {
    r.modifier = null;
    if (!M || !Number.isFinite(r.depth) || r.depth < M.startDepth || r.depth % RAID.checkpointEvery === 0) return null;
    if (roll(r) < M.chance) { const keys = Object.keys(M.list); r.modifier = keys[Math.floor(roll(r) * keys.length)]; }
    return r.modifier;
  }

  function createEncounter(r) {
    const route = routeInfo(r);
    return Array.from({ length: r.depth % RAID.checkpointEvery === 0 ? 1 : Math.min(E.maxCount, E.minCount + Math.floor(r.depth / E.countPerDepth)) }, () => {
      const type = r.depth % RAID.checkpointEvery === 0 ? E.bossType : Math.floor(roll(r) * E.typeCount);
      const elite = type !== E.bossType && r.depth >= E.eliteMinDepth && roll(r) < route.elite;
      const hp = Math.round((type === E.bossType ? E.bossHp : E.hpFlat + type * E.hpPerType) * (1 + r.depth * E.depthScale) * route.hp * (elite ? E.eliteHp : 1));
      return { type, elite, hp, maxHp: hp, attackFactor: route.attack * (elite ? E.eliteAttack : 1), rewardFactor: route.reward * (elite ? E.eliteReward : 1) };
    });
  }

  /* Лечение в рейде — только до maxHp бойца. */
  function healCrew(r, amount) {
    const scaled = Math.max(0, Math.round(amount * healMul(r)));
    let restored = 0;
    r.crew.filter(c => c.hp > 0).forEach(c => {
      const gain = Math.max(0, Math.min(scaled, (c.maxHp || c.hp) - c.hp));
      c.hp += gain; restored += gain;
    });
    return restored;
  }

  /* Снимок статов бойца при высадке: база (с уровнем и постоянными перками) + экипировка. */
  function crewSnapshot(S, member) {
    const perks = Array.isArray(member.perks) ? member.perks : [];
    let atk = member.atk, armor = member.armor;
    let kitBonus = 0, findBonus = 0, pierce = 0, bossBonus = 0, medicBonus = 0, saveBeacon = false, veteran = false;
    for (const slot of ['weapon', 'armor', 'gadget']) {
      const id = member.gear && member.gear[slot];
      if (id == null) continue;
      const item = State.findItem(S, id);
      if (!State.itemUsable(item)) continue; // сломанный предмет не действует
      const def = Balance.gear.defs[item.key];
      if (def.classReq && def.classReq !== member.class) continue;
      atk += def.atk || 0; armor += def.armor || 0;
      kitBonus += def.kit || 0; findBonus += def.find || 0;
      pierce += def.pierce || 0; bossBonus += def.boss || 0;
      if (def.beacon) saveBeacon = true;
    }
    for (const key of perks) {
      const p = Balance.perks.list[key];
      if (!p) continue;
      if (p.find) findBonus += p.find;
      if (p.heal) medicBonus += p.heal;
      if (p.veteran) veteran = true;
    }
    return { atk, armor: Math.max(0, armor), kitBonus, findBonus, pierce, bossBonus, medicBonus, saveBeacon, veteran };
  }

  /* Есть ли у бойца рабочая граната. */
  function hasGrenade(S, c) {
    const id = c.gear && c.gear.gadget;
    if (id == null) return false;
    const item = State.findItem(S, id);
    return !!State.itemUsable(item) && !!Balance.gear.defs[item.key].grenade;
  }

  /* Расход предмета (граната, маяк): убирается из инвентаря и из слотов бойца. */
  function consumeItem(S, c, slot) {
    const id = c.gear && c.gear[slot];
    if (id == null) return;
    S.items = (S.items || []).filter(it => it.id !== id);
    c.gear[slot] = null;
    const roster = (S.recruits || []).find(x => x.id === c.id);
    if (roster && roster.gear && roster.gear[slot] === id) roster.gear[slot] = null;
  }

  /* Единственный форматтер журнала. '' — событие не попадает в журнал. */
  function formatEvent(e) {
    switch (e.t) {
      case 'kit': return 'Автоаптечка: ' + (e.target && e.target.name || '') + ' +' + e.amount + ' HP. Осталось: ' + e.left;
      case 'spawn': return e.source === 'boss' ? 'Призыв: ' + e.names.join(', ') : 'Контакт: ' + e.names.join(', ');
      case 'heal':
        if (e.source === 'medical') return 'Найдены медприпасы: ' + (e.amount ? 'Восстановлено ' + e.amount + ' HP. Павшие не возвращаются в строй.' : 'Здоровье отряда уже восстановлено.');
        if (e.source === 'medpost') return 'Эвакуационный медпост: +' + e.amount + ' HP. Ожидаем приказа.';
        if (e.source === 'cover') return e.text || '';
        return (e.by && e.by.name || '') + ': лечение +' + e.amount;
      case 'hit':
        if (e.side === 'crew') return (e.by ? foeName(e.by) + ' → ' : '') + e.target.name + ': −' + e.dmg;
        return ''; // выстрелы бойцов видны на арене; в журнале — исходы
      case 'kill':
        if (e.side === 'foe') return foeName(e.target) + ' уничтожен. +₡ ' + e.reward;
        return e.target.name + ' погиб';
      case 'loot':
        if (e.source === 'cache') return 'Обнаружен тайник: Отряд забрал ' + e.amount + ' кредитов в груз.';
        if (e.source === 'extract') return 'Бонус эвакуации: +₡ ' + e.amount;
        return ''; // награда за бой уже указана в строке убийства
      case 'sectorClear': return e.checkpoint ? '' : 'Сектор зачищен. Отряд движется к следующему шлюзу.';
      case 'bossPhase': return e.text || 'Фаза босса изменена.';
      case 'grenade': return 'Граната: −' + e.amount + ' HP всем противникам.';
      case 'radiation': return 'Радиация: −' + e.amount + ' HP всем живым бойцам.';
      case 'save': return e.text || ((e.target && e.target.name || 'Боец') + ': страховой маяк компенсировал смертельный удар, боец держится на 1 HP.');
      case 'gear': return 'Найден предмет: ' + e.name + '.';
      case 'retreat': return e.text || 'Отступление.';
      case 'cover': return e.text || 'Прикрытие отхода.';
      case 'wipe': return 'Отряд уничтожен. Экспедиция провалена.';
      default: return '';
    }
  }

  function pushLog(r, events) {
    if (!Array.isArray(r.log)) r.log = [];
    for (const e of events) { const line = formatEvent(e); if (line) r.log.push(line); }
    if (r.log.length > RAID.logLimit) r.log = r.log.slice(-RAID.logLimit);
  }

  /* Случайный предмет по RNG рейда — попадает в инвентарь базы. */
  function dropGear(S, r, list) {
    const keys = Object.keys(Balance.gear.defs);
    const item = State.addItem(S, keys[Math.floor(roll(r) * keys.length)]);
    const name = State.itemName(item);
    list.push({ t: 'gear', name, item });
    return name;
  }

  /* Зачистка сектора: находка по сохранённому RNG, дроп предметов, медпост на шлюзе. */
  function clearSector(S, events) {
    const own = !events;
    const list = events || [];
    const r = S.raid;
    if (!r || r.cleared || !r.foes || r.foes.some(e => e.hp > 0) || !r.crew.some(c => c.hp > 0)) return list;
    r.room = 1; r.cleared = true; r.transitionTicks = RAID.transitionTicks; r.sectorEvent = null;
    const chance = roll(r);
    const find = Math.max(0, r.findBonus || 0);            // «Сканер биомассы» и перк «Искатель»
    const cacheChance = Math.min(0.95, Progression.command(S.buildings.command).cache + find);
    if (chance < cacheChance) {
      const amount = L.cacheFlat + r.depth * L.cachePerDepth;
      r.loot += amount; r.lootCache = (r.lootCache || 0) + amount;
      list.push({ t: 'loot', amount, source: 'cache' });
      let text = 'Отряд забрал ' + amount + ' кредитов в груз.';
      if (r.pendingFindBonus) { // победа над элитой из «Запечатанного контейнера»: +50% к находке
        const bonus = Math.round(amount * ROOM.containerBonus);
        r.loot += bonus; r.lootCache = (r.lootCache || 0) + bonus;
        list.push({ t: 'loot', amount: bonus, source: 'container' });
        text += ' Контейнер: +' + bonus + ' кредитов.';
      }
      if (roll(r) < L.cacheItemChance) text += ' В тайнике найден предмет: ' + dropGear(S, r, list) + '.';
      r.sectorEvent = { kind: 'cache', title: 'Обнаружен тайник', text };
    } else if (chance < cacheChance + L.medicalChance + find) {
      const hp = healCrew(r, Progression.medbay(S.buildings.medbay).rest);
      r.sectorEvent = { kind: 'medical', title: 'Найдены медприпасы', text: hp ? 'Восстановлено ' + hp + ' HP. Павшие не возвращаются в строй.' : 'Здоровье отряда уже восстановлено.' };
      list.push({ t: 'heal', source: 'medical', amount: hp });
    }
    const checkpoint = r.depth % RAID.checkpointEvery === 0;
    if (checkpoint) { // с босса — гарантированный предмет
      const name = dropGear(S, r, list);
      if (r.sectorEvent) r.sectorEvent.text += ' Трофей с босса: ' + name + '.';
      else r.sectorEvent = { kind: 'gear', title: 'Трофей с босса', text: 'С босса снят предмет: ' + name + '.' };
    }
    list.push({ t: 'sectorClear', depth: r.depth, checkpoint });
    if (checkpoint) list.push({ t: 'heal', source: 'medpost', amount: healCrew(r, Progression.medbay(S.buildings.medbay).rest) });
    r.pendingFindBonus = false;
    // Событие с выбором (п. 3.5): не более одного за сектор, только обычные сектора.
    if (!checkpoint && !r.roomEventSeen) {
      r.roomEventSeen = true;
      if (roll(r) < ROOM.chance) {
        const kinds = ((r.depth + 1) % RAID.checkpointEvery === 0) ? ['container', 'radio'] : ['container', 'radio', 'tunnel'];
        r.roomEvent = { kind: kinds[Math.floor(roll(r) * kinds.length)] };
      }
    }
    S.deepest = Math.max(S.deepest, r.depth);
    if (own) pushLog(r, list);
    return list;
  }

  /* Один боевой ход. Возвращает {events, status: 'fight'|'cleared'|'defeat'|...}. */
  function turn(S) {
    const r = S.raid, events = [];
    if (!r) return { events, status: 'none' };
    if (r.cleared) return { events, status: 'cleared' };
    let alive = r.crew.filter(c => c.hp > 0);
    if (!alive.length) { events.push({ t: 'wipe' }); pushLog(r, events); return { events, status: 'defeat' }; }
    r.turn = (r.turn || 0) + 1;
    const kit = Preparation.useKit(r);
    if (kit) events.push({ t: 'kit', target: kit.unit || { name: kit.name }, amount: kit.healed, left: r.kits });
    if (!r.foes) { r.foes = createEncounter(r); events.push({ t: 'spawn', names: r.foes.map(foeName), source: 'encounter', foes: r.foes }); }
    const phased = []; // Матки, перешедшие в фазу на 50% HP в этот ход
    // Ход отряда: сохранённый порядок обращений к RNG.
    for (const c of alive) {
      const targets = r.foes.filter(e => e.hp > 0);
      if (!targets.length) break;
      c.maxHp = c.maxHp || c.hp;
      if (c.class === 'medic' && r.turn % C.medicEvery === 0 && alive.some(p => p.hp / (p.maxHp || p.hp) < C.medicThreshold)) {
        const patient = alive.reduce((a, b) => a.hp / (a.maxHp || a.hp) < b.hp / (b.maxHp || b.hp) ? a : b);
        const heal = Math.min(Math.round((Progression.medbay(S.buildings.medbay).heal + (c.medicBonus || 0)) * healMul(r)), (patient.maxHp || patient.hp) - patient.hp);
        patient.hp += heal;
        events.push({ t: 'heal', by: c, target: patient, amount: heal, source: 'medic' });
        continue;
      }
      const e = Preparation.target(targets, r.order);
      const armory = Progression.armory(S.buildings.armory);
      const veteran = c.veteran ? Math.floor(r.depth / RAID.checkpointEvery) : 0; // перк «Ветеран»
      const bossBonus = e.type === E.bossType ? (c.bossBonus || 0) : 0;           // «Зажигательный заряд»
      const pierce = armory.pierce + (c.pierce || 0);                             // арсенал + «Стабилизатор прицела»
      let damage = Math.max(C.minDamage, Math.round(c.atk * (C.rollFlat + roll(r) * C.rollSpan) + armory.attack + veteran + bossBonus) - (e.type === 3 ? Math.max(0, C.armorPierce - pierce) : 0));
      if (c.class === 'assault' && r.turn % C.assaultEvery === 0) damage *= C.assaultMul;
      if (c.class === 'engineer') damage += C.engineerFlat;
      e.hp = Math.max(0, e.hp - damage);
      events.push({ t: 'hit', by: c, target: e, side: 'foe', dmg: damage });
      if (e.type === E.bossType && !e.phased && e.hp > 0 && e.hp <= e.maxHp * C.bossPhaseRatio) { e.phased = true; phased.push(e); }
      if (e.hp === 0) {
        const reward = Math.round((e.type === E.bossType ? R.bossFlat : R.killFlat + r.depth * R.killPerDepth) * Progression.command(S.buildings.command).reward * (e.rewardFactor || 1) * rewardMul(r));
        r.loot = (r.loot || 0) + reward; r.lootBattle = (r.lootBattle || 0) + reward;
        r.kills = (r.kills || 0) + 1;
        if (S.stats && S.stats.total) S.stats.total.kills++;
        events.push({ t: 'kill', by: c, target: e, side: 'foe', reward });
        events.push({ t: 'loot', amount: reward, source: 'kill' });
      }
    }
    // Ход противников.
    // «Узел гнезда»: каждые 3 хода спавнит Личинку (не более 3 живых одновременно).
    if (r.turn % C.nestEvery === 0) {
      for (const e of r.foes.filter(e => e.hp > 0 && e.type === C.nestType)) {
        if (liveLarvae(r) >= C.nestMaxLarvae) break;
        const larva = freshFoe(r, 0);
        r.foes.push(larva);
        events.push({ t: 'spawn', source: 'nest', names: [foeName(larva)], foes: [larva] });
      }
    }
    for (const e of r.foes.filter(e => e.hp > 0)) {
      alive = r.crew.filter(c => c.hp > 0);
      if (!alive.length) break;
      // «Плевальщик»: каждый 3-й ход бьёт самого раненого бойца, минуя «тяжёлого».
      const target = (e.type === C.spitterType && r.turn % C.spitterEvery === 0)
        ? alive.reduce((a, b) => a.hp / (a.maxHp || a.hp) < b.hp / (b.maxHp || b.hp) ? a : b)
        : alive.find(c => c.class === 'heavy') || alive[Math.floor(roll(r) * alive.length)];
      const damage = Math.max(C.minDamage, Math.round((e.type === E.bossType ? C.bossAttack : C.enemyAttackFlat + e.type) * (1 + r.depth * C.enemyDepthScale) * (e.attackFactor || 1) * enemyMul(r)) - target.armor - (target.class === 'heavy' ? C.heavyGuard : 0));
      target.hp = Math.max(0, target.hp - damage);
      events.push({ t: 'hit', by: e, target, side: 'crew', dmg: damage });
      if (target.hp === 0) {
        if (target.saveBeacon) { // «Страховой маяк»: один раз за рейд держит бойца на 1 HP
          target.saveBeacon = false;
          target.hp = 1;
          consumeItem(S, target, 'gadget');
          events.push({ t: 'save', target });
        } else events.push({ t: 'kill', by: e, target, side: 'crew' });
      }
    }
    // «Матка» на 50% HP призывает Личинок (событие фазы босса).
    for (const boss of phased) {
      const names = [];
      for (let i = 0; i < C.bossLarvae; i++) { const larva = freshFoe(r, 0); r.foes.push(larva); names.push(foeName(larva)); }
      events.push({ t: 'bossPhase', text: 'Матка в агонии: на помощь выходят ' + names.join(', ') + '.', names });
    }
    // «Радиация»: в конце хода все живые бойцы теряют 2 HP (не ниже 1).
    const rad = modOf(r) && modOf(r).damage;
    if (rad) {
      const living = r.crew.filter(c => c.hp > 0);
      if (living.length) { for (const c of living) c.hp = Math.max(1, c.hp - rad); events.push({ t: 'radiation', amount: rad }); }
    }
    let status = 'fight';
    if (!r.crew.some(c => c.hp > 0)) { events.push({ t: 'wipe' }); status = 'defeat'; }
    else if (r.foes.every(e => e.hp <= 0)) { clearSector(S, events); status = 'cleared'; }
    pushLog(r, events);
    return { events, status };
  }

  /* Такт рейда: переходы, контрольная точка, бой. ui — намерения интерфейса. */
  function tick(S, ui) {
    if (!S.raid || ui.paused || ui.overlay || ui.tab !== 'raid' || ui.screen !== 'game') return { events: [], status: 'idle' };
    const r = S.raid;
    if (r.cleared) {
      if (r.roomEvent) return { events: [], status: 'event' };
      if (r.depth % RAID.checkpointEvery === 0) return { events: [], status: 'checkpoint' };
      r.transitionTicks = (r.transitionTicks ?? RAID.transitionTicks) - 1;
      if (r.transitionTicks <= 0) { advance(S); return { events: [], status: 'advance' }; }
      return { events: [], status: 'transition' };
    }
    return turn(S);
  }

  function advance(S) {
    const r = S.raid;
    if (!r || !r.cleared || !r.crew.some(c => c.hp > 0)) return false;
    Automation.reset(r);
    delete r.foes;
    r.cleared = false; r.depth++; r.room = 0; r.kills = 0; r.transitionTicks = 0; r.sectorEvent = null; r.grenadeUsed = false;
    r.roomEvent = null; r.roomEventSeen = false; r.pendingFindBonus = false;
    rollModifier(r); // новый сектор — новый модификатор (детерминирован seed)
    return true;
  }

  /* Высадка: снимок hp/maxHp со среза ростера, закупка аптечек. */
  function deploy(S, indices) {
    if (S.raid) return { ok: false, reason: 'active' };
    let crew = (Array.isArray(indices) ? indices : []).map(i => S.recruits[i]).filter(Boolean);
    if (!crew.length) crew = S.recruits.slice(0, Balance.squad.size);
    if (!crew.length) return { ok: false, reason: 'empty' };
    const prep = Preparation.normalize(S.prep, S.buildings.medbay);
    const kit = Preparation.tiers[prep.kitTier];
    const cost = Preparation.cost(prep, S.buildings.medbay);
    if (S.res.credits < cost) return { ok: false, reason: 'funds', cost, missing: cost - S.res.credits };
    S.res.credits -= cost;
    S.settings = S.settings || { speed: 1 };
    const snapshots = crew.map(x => ({ member: x, snap: crewSnapshot(S, x) }));
    S.raid = {
      order: prep.order, kits: prep.kits, kitsBought: prep.kits, kitTier: prep.kitTier,
      kitPrice: kit.price, kitHeal: kit.heal, kitCapacity: Progression.medbay(S.buildings.medbay).capacity,
      depth: 1, room: 0,
      crew: snapshots.map(({ member: x, snap }) => ({ ...x, hp: Math.max(0, Math.min(x.hp, x.maxHp || x.hp)), maxHp: x.maxHp || x.hp, deployHp: x.hp, gear: x.gear ? { ...x.gear } : State.emptyGear(), ...snap })),
      findBonus: snapshots.reduce((sum, s) => sum + s.snap.findBonus, 0),
      kitBonus: snapshots.reduce((sum, s) => sum + s.snap.kitBonus, 0),
      grenadeUsed: false, covered: false,
      modifier: null, roomEvent: null, roomEventSeen: false, pendingFindBonus: false,
      loot: 0, lootBattle: 0, lootCache: 0,
      speed: Automation.validSpeed(S.settings.speed),
      seed: Date.now() >>> 0,
      log: ['Высадка подтверждена. Автопилот отряда активен.'],
      kills: 0, turn: 0
    };
    rollModifier(S.raid); // высадка в сектор 1 (модификаторов не будет — глубина < 3)
    return { ok: true, crew: crew.map(x => S.recruits.indexOf(x)) };
  }

  const bucketKey = depth => {
    const d = Math.max(1, Math.floor(Number(depth) || 1));
    if (d <= Balance.stats.firstBucketEnd) return '1-' + Balance.stats.firstBucketEnd;
    const size = Balance.stats.bucketSize;
    const start = size * Math.floor((d - size) / size) + size;
    return start + '-' + (start + size - 1);
  };

  function statsBucket(S, key) {
    if (!S.stats || !S.stats.byDepth || !S.stats.total) S.stats = State.normalizeStats(null);
    if (!S.stats.byDepth[key]) S.stats.byDepth[key] = { runs: 0, evac: 0, deaths: 0, loot: 0 };
    return S.stats.byDepth[key];
  }

  /* Конец рейда (эвакуация/поражение/отступление/прикрытие): перенос ранений,
     износ снаряжения, опыт, лечение на базе, статистика. */
  function finish(S, ok, opts) {
    opts = opts || {};
    const r = S.raid;
    if (!r) return null;
    const outcome = opts.outcome || (ok ? 'evac' : 'defeat');
    const success = outcome === 'evac' || outcome === 'cover';
    const command = Progression.command(S.buildings.command);
    const extract = success ? R.extractFlat + Math.floor(r.depth / R.extractDivisor) : 0;
    const cache = Math.max(0, r.lootCache || 0);
    const battle = Math.max(0, (r.loot || 0) - cache);
    const cargo = success ? (r.loot || 0) + extract
      : outcome === 'retreat' ? Math.floor((r.loot || 0) * (Number.isFinite(opts.cargoFactor) ? opts.cargoFactor : C.retreatCargo))
      : Math.floor((r.loot || 0) * command.recovery);
    const kitsLeft = r.kits || 0, kitPrice = r.kitPrice || Preparation.price;
    const refund = success ? kitsLeft * kitPrice : 0;
    S.lastLoot = cargo; S.lastRefund = refund;
    S.res.credits += cargo + refund;
    const deployed = new Set((r.crew || []).map(x => x.id));
    const survivors = new Set((r.crew || []).filter(x => x.hp > 0).map(x => x.id));
    if (success) S.deepest = Math.max(S.deepest, r.depth);
    S.run++;
    // Износ экипировки, ушедшей в рейд: −1 прочность за рейд (минимум 0).
    for (const c of r.crew || []) for (const slot of ['weapon', 'armor', 'gadget']) {
      const id = c.gear && c.gear[slot];
      if (id == null) continue;
      const item = State.findItem(S, id);
      if (item) item.durability = Math.max(0, State.itemDurability(item) - Balance.gear.wearPerRaid);
    }
    S.recruits = S.recruits.filter(x => !deployed.has(x.id) || survivors.has(x.id));
    const byId = new Map((r.crew || []).map(c => [c.id, c]));
    S.recruits.forEach(x => { const c = byId.get(x.id); if (c && survivors.has(x.id)) x.hp = Math.max(1, Math.min(x.maxHp || c.maxHp, c.hp)); });
    // Опыт выжившим: 10 × глубина + 25 × пройденных боссов (сектора кратные 5).
    const xpGain = Balance.xp.perDepth * r.depth + Balance.xp.perBoss * Math.floor(r.depth / RAID.checkpointEvery);
    const xpBy = {};
    for (const x of S.recruits) if (deployed.has(x.id) && survivors.has(x.id)) xpBy[x.id] = State.grantXp(x, xpGain);
    // Медленное (бесплатное) лечение всех бойцов на базе.
    const rest = Progression.medbay(S.buildings.medbay).rest;
    let slowHealed = 0;
    S.recruits.forEach(x => { const max = x.maxHp || x.hp; const gain = Math.max(0, Math.min(rest, max - x.hp)); x.hp += gain; slowHealed += gain; });
    const changes = (r.crew || []).map(c => {
      const roster = S.recruits.find(x => x.id === c.id);
      const gained = xpBy[c.id];
      return {
        id: c.id, name: c.name,
        before: Number.isFinite(c.deployHp) ? c.deployHp : c.hp,
        after: c.hp, status: c.hp > 0 ? 'alive' : 'dead', cause: c.cause || null,
        xp: gained ? xpGain : 0,
        level: roster ? Progression.xpLevel(roster.xp) : null,
        levelUp: gained ? gained.levels : 0
      };
    });
    const dead = changes.filter(c => c.status === 'dead');
    // Агрегаты для графиков (п. 1.7).
    const bucket = statsBucket(S, bucketKey(r.depth));
    bucket.runs++; bucket.loot += cargo; bucket.deaths += dead.length; if (success) bucket.evac++;
    const total = S.stats.total;
    total.runs++; total.loot += cargo; total.deaths += dead.length; if (success) total.evac++;
    S.lastResult = {
      ok: success, outcome, run: S.run, depth: r.depth, changes, slowHealed, cover: opts.cover || null,
      loot: { battle, cache, extract, refund, cargo },
      losses: { kits: success ? 0 : kitsLeft, kitPrice: success ? 0 : kitPrice, cargo: success ? 0 : Math.max(0, (r.loot || 0) - cargo), dead: dead.map(c => c.name) }
    };
    S.raid = null;
    return S.lastResult;
  }

  /* Отступление: выжившие возвращаются с ранениями, груз — частично, аптечки не возвращаются. */
  function retreat(S) {
    if (!S.raid) return false;
    finish(S, false, { outcome: 'retreat' });
    return true;
  }

  /* Прикрытие отхода: самый раненый погибает, остальные завершают рейд с полным грузом. */
  function cover(S, index) {
    const r = S.raid;
    if (!r || r.covered) return false;
    const alive = (r.crew || []).filter(c => c.hp > 0);
    if (alive.length < C.coverMinAlive) return false;
    const chosen = index != null && r.crew[index] && r.crew[index].hp > 0 ? r.crew[index]
      : alive.reduce((a, b) => a.hp / (a.maxHp || a.hp) < b.hp / (b.maxHp || b.hp) ? a : b);
    chosen.hp = 0; chosen.cause = 'cover';
    r.covered = true;
    finish(S, true, { outcome: 'cover', cover: chosen.name });
    return true;
  }

  /* Разрешение события с выбором в комнате (п. 3.5). choice — код варианта. */
  function roomChoice(S, choice) {
    const r = S.raid, events = [];
    if (!r || !r.roomEvent || r.cleared !== true) return { ok: false, events, status: 'idle' };
    const kind = r.roomEvent.kind;
    r.roomEvent = null;
    let status = 'cleared';
    if (kind === 'container') {
      if (choice === 'open') {
        if (roll(r) < ROOM.containerEliteChance) {
          r.foes = [eliteFoe(r)];
          r.cleared = false;
          r.pendingFindBonus = true;
          events.push({ t: 'spawn', source: 'container', names: [foeName(r.foes[0])], foes: r.foes });
          status = 'fight';
        }
      }
    } else if (kind === 'radio') {
      if (choice === 'call' && (r.kits || 0) < (r.kitCapacity || 3)) {
        r.kits = (r.kits || 0) + 1; r.kitsBought = (r.kitsBought || 0) + 1;
      }
    } else if (kind === 'tunnel' && choice === 'go') {
      // Пропуск следующего сектора: глубина +1 сразу, без наград за пропущенный сектор.
      r.depth += 1; r.cleared = true; r.modifier = null; r.kills = 0;
      r.transitionTicks = RAID.transitionTicks; r.sectorEvent = null;
      delete r.foes;
      status = 'transition';
    }
    if (events.length) pushLog(r, events);
    return { ok: true, events, status };
  }

  /* Граната: один раз за бой, 15 урона всем живым врагам, расходуется. */
  function grenade(S) {
    const r = S.raid, events = [];
    if (!r || r.cleared || r.grenadeUsed) return { ok: false, events, status: 'idle' };
    const owner = (r.crew || []).find(c => c.hp > 0 && hasGrenade(S, c));
    if (!owner) return { ok: false, events, status: 'idle' };
    const amount = Balance.gear.defs.frag_grenade.grenade;
    events.push({ t: 'grenade', amount, by: owner });
    for (const e of (r.foes || []).filter(f => f.hp > 0)) {
      e.hp = Math.max(0, e.hp - amount);
      events.push({ t: 'hit', by: owner, target: e, side: 'foe', dmg: amount, grenade: true });
      if (e.hp === 0) {
        const reward = Math.round((e.type === E.bossType ? R.bossFlat : R.killFlat + r.depth * R.killPerDepth) * Progression.command(S.buildings.command).reward * (e.rewardFactor || 1));
        r.loot = (r.loot || 0) + reward; r.lootBattle = (r.lootBattle || 0) + reward;
        r.kills = (r.kills || 0) + 1;
        if (S.stats && S.stats.total) S.stats.total.kills++;
        events.push({ t: 'kill', by: owner, target: e, side: 'foe', reward });
        events.push({ t: 'loot', amount: reward, source: 'kill' });
      }
    }
    consumeItem(S, owner, 'gadget');
    r.grenadeUsed = true;
    let status = 'fight';
    if (r.foes && r.foes.length && r.foes.every(f => f.hp <= 0)) { clearSector(S, events); status = 'cleared'; }
    pushLog(r, events);
    return { ok: true, events, status };
  }

  const canGrenade = S => { const r = S.raid; return !!(r && !r.cleared && !r.grenadeUsed && (r.foes || []).some(e => e.hp > 0) && (r.crew || []).some(c => c.hp > 0 && hasGrenade(S, c))); };
  const canCover = S => { const r = S.raid; return !!(r && !r.covered && (r.crew || []).filter(c => c.hp > 0).length >= C.coverMinAlive); };

  /* Эвакуация разрешена только на очищенном шлюзе пятого сектора. */
  function canExtract(S, ui) {
    const r = S.raid;
    return Boolean(r && r.cleared && ui.overlay === 'room' && r.depth % RAID.checkpointEvery === 0 && r.crew.some(x => x.hp > 0));
  }

  function extract(S, ui) {
    if (!canExtract(S, ui)) return false;
    finish(S, true);
    return true;
  }

  function chooseRoute(S, key) {
    const r = S.raid;
    if (!r || !r.cleared || r.depth % RAID.checkpointEvery !== 0 || !r.crew.some(c => c.hp > 0) || !['safe', 'risk'].includes(key)) return false;
    r.route = key;
    if (!Array.isArray(r.log)) r.log = [];
    r.log.push('Маршрут до следующего шлюза: ' + routeInfo(r).name);
    advance(S);
    return true;
  }

  /* Отсчёт авто-выбора у шлюза: активное время, только на экране рейда. */
  function stepCheckpoint(S, ui, ms) {
    const r = S.raid;
    // Экран шлюза (overlay 'room') не блокирует отсчёт — он и есть контекст
    // автовыбора; блокируют пауза, скрытая вкладка и открытый диалог.
    if (!r || ui.screen !== 'game' || ui.tab !== 'raid' || ui.paused || ui.hidden || (ui.overlay && ui.overlay !== 'room') || !r.cleared || r.depth % RAID.checkpointEvery !== 0)
      return { choice: null, changed: false, seconds: 0 };
    Automation.ensure(r);
    const before = Math.ceil((r.autoRemainingMs || 0) / 1000);
    const choice = Automation.step(r, ms);
    const after = Math.ceil(r.autoRemainingMs / 1000);
    return { choice, changed: before !== after, seconds: after };
  }

  return {
    enemies, roll, routeInfo, foeName, createEncounter, healCrew, formatEvent, pushLog,
    clearSector, turn, tick, advance, deploy, finish, canExtract, extract, chooseRoute,
    stepCheckpoint, bucketKey, statsBucket, crewSnapshot, grenade, retreat, cover, canGrenade, canCover, dropGear, roomChoice, rollModifier
  };
})();