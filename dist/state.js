/* Схема профиля, миграция версий, сохранение/загрузка, экспорт/импорт JSON,
   операции с ростером (наём, лечение, выбор отряда). Без DOM: только localStorage.
   Проверяется в Node-тестах без document (п. 1.2 плана). */
window.State = (() => {
  const KEY = 'xenocide.outpost.v1';
  const int = n => (Number.isFinite(n) && n > 0 ? Math.floor(n) : 0);

  const emptyGear = () => ({ weapon: null, armor: null, gadget: null });

  /* Стартовый инвентарь базы — те же 12 названий, что и раньше, теперь как
     записи-предметы с уникальным id (один предмет — один владелец). */
  const STARTING_GEAR = ['pulse_rifle', 'field_medkit', 'frag_grenade', 'armor_plate', 'carbine_mk2', 'power_cell', 'osa_turret', 'plasma_cutter', 'bio_scanner', 'incendiary', 'scope_stabilizer', 'safety_beacon'];
  const defDurability = key => Balance.gear.defs[key].durability;
  const startingItems = () => STARTING_GEAR.map((key, n) => ({ id: 'it' + (n + 1), key, durability: defDurability(key) }));

  function keyByName(name) {
    for (const [key, def] of Object.entries(Balance.gear.defs)) if (def.name === name) return key;
    return null;
  }
  function nextItemId(items) {
    let n = 0;
    for (const it of items || []) { const m = /^it(\d+)$/.exec(it && it.id || ''); if (m) n = Math.max(n, +m[1]); }
    return 'it' + (n + 1);
  }
  /* Приводит инвентарь к записям-предметам; строки старых сейвов — по имени. */
  function normalizeItems(list) {
    const out = [], seen = new Set();
    const gen = () => { let n = 0; for (const it of out) { const m = /^it(\d+)$/.exec(it.id); if (m) n = Math.max(n, +m[1]); } return 'it' + (n + 1); };
    for (const raw of Array.isArray(list) ? list : []) {
      let key = null, durability = null, id = null;
      if (raw && typeof raw === 'object') {
        key = raw.key && Balance.gear.defs[raw.key] ? raw.key : keyByName(raw.name);
        if (Number.isFinite(raw.durability)) durability = Math.floor(raw.durability);
        if (typeof raw.id === 'string' && raw.id && !seen.has(raw.id)) id = raw.id;
      } else if (typeof raw === 'string') key = keyByName(raw);
      if (!key) continue;
      if (!id) id = gen();
      seen.add(id);
      const def = Balance.gear.defs[key];
      out.push({ id, key, durability: durability == null ? def.durability : Math.max(0, Math.min(def.durability, durability)) });
    }
    return out;
  }

  const stats = () => ({
    byDepth: {},
    total: { runs: 0, evac: 0, deaths: 0, loot: 0, kills: 0 }
  });

  function normalizeStats(value) {
    const t = value && typeof value.total === 'object' ? value.total : {};
    const out = { byDepth: {}, total: { runs: int(t.runs), evac: int(t.evac), deaths: int(t.deaths), loot: int(t.loot), kills: int(t.kills) } };
    if (value && value.byDepth && typeof value.byDepth === 'object') {
      for (const [key, row] of Object.entries(value.byDepth)) {
        const r = row || {};
        out.byDepth[key] = { runs: int(r.runs), evac: int(r.evac), deaths: int(r.deaths), loot: int(r.loot) };
      }
    }
    return out;
  }

  const fresh = () => ({
    v: Balance.profileVersion,
    res: { credits: 145 },
    buildings: { barracks: 1, armory: 1, medbay: 1, command: 1 },
    settings: { speed: 1 },
    prep: { order: 'front', kits: 0 },
    recruits: [],
    items: startingItems(),
    raid: null,
    deepest: 0,
    run: 0,
    stats: stats(),
    seenStory: [],
    contracts: []
  });

  function migrate(s) {
    if (!s || ![1, 2, 3].includes(s.v) || !s.res || !s.buildings || !Array.isArray(s.recruits) || !Array.isArray(s.items)) throw Error('save');
    if (s.v === 1) { // v1 → v2: три ресурса сливаются в кредиты
      const amount = x => (Number.isFinite(x) && x >= 0 ? Math.floor(x) : 0);
      s.res = { credits: amount(s.res.credits) + amount(s.res.scrap) + amount(s.res.data) };
      if (s.raid) { s.raid.loot = amount(s.raid.loot) + amount(s.raid.data); delete s.raid.data; }
      if (s.lastLoot != null) s.lastLoot = amount(s.lastLoot) + amount(s.lastData);
      delete s.lastData;
      s.v = 2;
    }
    if (!Number.isFinite(s.res.credits) || s.res.credits < 0) throw Error('save');
    s.settings = { speed: Automation.validSpeed(s.settings?.speed ?? s.raid?.speed) };
    s.prep = Preparation.normalize(s.prep, s.buildings.medbay);
    if (s.v === 2) { // v2 → v3: hp/maxHp, статистика, слоты снаряжения, задел сюжета
      for (const r of s.recruits) {
        if (!r || !Number.isFinite(r.hp) || r.hp <= 0) throw Error('save');
        r.maxHp = Number.isFinite(r.maxHp) && r.maxHp >= r.hp ? Math.floor(r.maxHp) : Math.floor(r.hp);
        r.hp = Math.min(Math.floor(r.hp), r.maxHp);
        r.gear = r.gear && typeof r.gear === 'object' ? r.gear : emptyGear();
      }
      if (s.raid) {
        s.raid.loot = int(s.raid.loot) || 0;
        if (!Number.isFinite(s.raid.lootCache)) s.raid.lootCache = 0;
        if (!Number.isFinite(s.raid.lootBattle)) s.raid.lootBattle = s.raid.loot - s.raid.lootCache;
        for (const c of s.raid.crew || []) {
          if (!c) continue;
          c.maxHp = Number.isFinite(c.maxHp) && c.maxHp > 0 ? c.maxHp : (Number.isFinite(c.hp) ? c.hp : 1);
          c.deployHp = Number.isFinite(c.deployHp) ? c.deployHp : c.hp;
          if (c.gear == null) c.gear = emptyGear();
        }
      }
      s.stats = normalizeStats(s.stats);
      s.seenStory = Array.isArray(s.seenStory) ? s.seenStory : [];
      s.v = 3;
    }
    if (s.v === 3) {
      s.recruits.forEach(r => {
        if (!r || !Number.isFinite(r.hp) || r.hp <= 0) throw Error('save');
        if (!Number.isFinite(r.maxHp) || r.maxHp < 1) r.maxHp = Math.floor(r.hp);
        r.hp = Math.min(Math.floor(r.hp), Math.floor(r.maxHp));
        if (!r.gear || typeof r.gear !== 'object') r.gear = emptyGear();
        if (!Number.isFinite(r.xp) || r.xp < 0) r.xp = 0;
        if (!Array.isArray(r.perks)) r.perks = [];
        r.perks = r.perks.filter(k => Balance.perks.list[k]).slice(0, Balance.perks.max);
      });
      s.items = normalizeItems(s.items);
      s.stats = normalizeStats(s.stats);
      if (!Array.isArray(s.seenStory)) s.seenStory = [];
      if (!Array.isArray(s.contracts)) s.contracts = [];
      if (s.raid) {
        s.raid.loot = int(s.raid.loot) || 0;
        if (!Number.isFinite(s.raid.lootCache)) s.raid.lootCache = 0;
        if (!Number.isFinite(s.raid.lootBattle)) s.raid.lootBattle = s.raid.loot - s.raid.lootCache;
        for (const c of s.raid.crew || []) {
          if (!c) continue;
          if (!Number.isFinite(c.maxHp) || c.maxHp <= 0) c.maxHp = Math.max(1, Number.isFinite(c.hp) ? c.hp : 1);
          if (!Number.isFinite(c.deployHp)) c.deployHp = c.hp;
          if (c.gear == null) c.gear = emptyGear();
        }
      }
    }
    Preparation.restoreRaid(s.raid);
    if (s.raid) { s.raid.speed = s.settings.speed; Automation.ensure(s.raid); }
    return s;
  }

  /* Возвращает {profile, initial, error}: error — сообщение вместо тихого fresh(). */
  function load() {
    let saved = null;
    try { saved = localStorage.getItem(KEY); } catch { saved = null; }
    if (!saved) return { profile: fresh(), initial: true, error: false };
    try { return { profile: migrate(JSON.parse(saved)), initial: false, error: false }; }
    catch { return { profile: fresh(), initial: true, error: true }; }
  }

  function save(profile) {
    try { localStorage.setItem(KEY, JSON.stringify(profile)); return 'ok'; }
    catch { return 'storage'; }
  }

  const exportJson = profile => JSON.stringify(profile, null, 2);
  function importJson(text) { return migrate(JSON.parse(text)); }

  const roll = (min, max) => min + Math.floor(Math.random() * (max - min + 1));

  /* Новый боец в ростер. Деньги списывает вызывающая сторона (input/game). */
  function recruit(profile, free = false, requested = null) {
    const paid = Balance.hiring.paid, vagrant = Balance.hiring.vagrant, cfg = free ? vagrant : paid;
    const classes = ['assault', 'heavy', 'medic', 'engineer'];
    const type = free ? 'vagrant' : (requested && classes.includes(requested) ? requested : classes[Math.floor(Math.random() * classes.length)]);
    const training = Progression.barracks(profile.buildings.barracks);
    const name = Balance.hiring.names[Math.floor(Math.random() * Balance.hiring.names.length)];
    const member = {
      id: Date.now() + Math.random(),
      name: name + '-' + roll(Balance.hiring.codeMin, Balance.hiring.codeMin + Balance.hiring.codeSpan - 1),
      class: type,
      hp: roll(cfg.hpMin, cfg.hpMax) + (free ? 0 : training.hp),
      atk: roll(cfg.atkMin, cfg.atkMax) + (free ? 0 : training.attack),
      armor: free ? 0 : roll(0, cfg.armorMax) + training.armor,
      training: free ? 0 : training.rank,
      gear: emptyGear(),
      xp: 0,
      perks: []
    };
    member.maxHp = member.hp;
    profile.recruits.push(member);
    return member;
  }

  /* Выбор в отряд: чистые функции, состояние возвращает новым массивом. */
  function pick(selected, recruits, index) {
    if (!recruits[index]) return selected;
    if (selected.includes(index)) return selected.filter(i => i !== index);
    if (selected.length >= Balance.squad.size) return selected;
    return selected.concat([index]);
  }

  function autoPick(recruits) {
    const selected = [];
    for (const role of ['heavy', 'medic', 'assault', 'engineer']) {
      const i = recruits.findIndex((c, n) => c && c.class === role && !selected.includes(n));
      if (i >= 0) selected.push(i);
    }
    for (let i = 0; i < recruits.length && selected.length < Balance.squad.size; i++)
      if (!selected.includes(i)) selected.push(i);
    return selected;
  }

  /* Платное лечение: ceil((maxHp − hp) / 2) со скидкой 5% за уровень медблока. */
  function healCost(maxHp, hp, medbayLevel) {
    const max = Math.max(1, Math.floor(maxHp) || 1), current = Math.max(0, Math.floor(hp) || 0);
    if (current >= max) return 0;
    const base = Math.ceil((max - current) / Balance.heal.divisor);
    const discount = Math.min(Balance.heal.maxDiscount, Balance.heal.discountPerLevel * Math.max(1, medbayLevel || 1));
    return Math.max(Balance.heal.min, Math.ceil(base * (1 - discount)));
  }

  function healRecruit(profile, index, medbayLevel) {
    const member = profile.recruits[index];
    if (!member) return { ok: false, reason: 'missing' };
    const max = member.maxHp || member.hp;
    if (member.hp >= max) return { ok: false, reason: 'full' };
    const cost = healCost(max, member.hp, medbayLevel);
    if (profile.res.credits < cost) return { ok: false, reason: 'funds', cost };
    profile.res.credits -= cost;
    member.hp = max;
    return { ok: true, cost };
  }

  /* --- Пакет 0.5.0: предметы, экипировка, износ, опыт и перки --- */
  const itemDef = item => (item && Balance.gear.defs[item.key]) || null;
  const itemName = item => { const def = itemDef(item); return def ? def.name : (item && item.name) || 'Предмет'; };
  const itemUsable = item => { const def = itemDef(item); return !!def && item.durability > 0; };
  const findItem = (profile, id) => (profile.items || []).find(it => it && it.id === id) || null;

  /* Кто владеет предметом (для правила «один предмет — один владелец»). */
  function gearOwner(profile, id) {
    for (let i = 0; i < profile.recruits.length; i++) {
      const g = profile.recruits[i].gear || {};
      if (g.weapon === id) return { index: i, recruit: profile.recruits[i], slot: 'weapon' };
      if (g.armor === id) return { index: i, recruit: profile.recruits[i], slot: 'armor' };
      if (g.gadget === id) return { index: i, recruit: profile.recruits[i], slot: 'gadget' };
    }
    return null;
  }

  /* Выдача/снятие: слот задаёт тип предмета; при передаче снимается у прежнего владельца. */
  function equip(profile, index, slot, itemId) {
    const member = profile.recruits[index];
    if (!member || !['weapon', 'armor', 'gadget'].includes(slot)) return false;
    member.gear = member.gear && typeof member.gear === 'object' ? member.gear : emptyGear();
    if (itemId == null || itemId === '') { member.gear[slot] = null; return true; }
    const item = findItem(profile, itemId);
    const def = itemDef(item);
    if (!def || def.type !== slot) return false;
    if (def.classReq && def.classReq !== member.class) return false;
    profile.recruits.forEach(r => {
      if (r === member || !r.gear) return;
      for (const key of ['weapon', 'armor', 'gadget']) if (r.gear[key] === itemId) r.gear[key] = null;
    });
    member.gear[slot] = itemId;
    return true;
  }

  const repairCost = item => { const def = itemDef(item); return def ? Math.max(0, def.durability - item.durability) * Balance.gear.repairPerPoint : 0; };
  function repairItem(profile, itemId) {
    const item = findItem(profile, itemId), def = itemDef(item);
    if (!def) return { ok: false, reason: 'missing' };
    const cost = repairCost(item);
    if (cost <= 0) return { ok: false, reason: 'full' };
    if (profile.res.credits < cost) return { ok: false, reason: 'funds', cost };
    profile.res.credits -= cost;
    item.durability = def.durability;
    return { ok: true, cost };
  }

  function addItem(profile, key) {
    if (!profile.items) profile.items = [];
    const keys = Object.keys(Balance.gear.defs);
    const chosen = key && Balance.gear.defs[key] ? key : keys[Math.floor(Math.random() * keys.length)];
    const item = { id: nextItemId(profile.items), key: chosen, durability: Balance.gear.defs[chosen].durability };
    profile.items.push(item);
    return item;
  }

  /* Опыт: пороги, уровни, наградные хиты за уровень (+3 maxHp, +1 урон). */
  function grantXp(member, amount) {
    const xp = Math.max(0, Math.floor(amount) || 0);
    if (!member) return { xp: 0, level: 1, levels: 0 };
    if (!Number.isFinite(member.xp) || member.xp < 0) member.xp = 0;
    const before = Progression.xpLevel(member.xp);
    if (xp > 0) {
      member.xp += xp;
      const after = Progression.xpLevel(member.xp);
      const gained = Math.max(0, after - before);
      if (gained) { member.maxHp += Balance.xp.hpPerLevel * gained; member.atk += Balance.xp.atkPerLevel * gained; }
      return { xp, level: after, levels: gained };
    }
    return { xp: 0, level: before, levels: 0 };
  }

  const perksEarned = level => Balance.perks.atLevels.reduce((n, need) => n + (level >= need ? 1 : 0), 0);
  function pendingPerks(member) { return Math.max(0, perksEarned(Progression.xpLevel(member.xp)) - (member.perks || []).length); }

  function applyPerk(member, key) {
    const perk = Balance.perks.list[key];
    if (!member || !perk) return false;
    member.perks = Array.isArray(member.perks) ? member.perks : [];
    if (member.perks.includes(key) || member.perks.length >= Balance.perks.max) return false;
    if (pendingPerks(member) <= 0) return false;
    member.perks.push(key);
    if (perk.hp) member.maxHp += perk.hp;
    if (perk.atk) member.atk += perk.atk;
    if (perk.armor) member.armor += perk.armor;
    return true;
  }

  return { KEY, fresh, migrate, load, save, exportJson, importJson, recruit, pick, autoPick, healCost, healRecruit, normalizeStats, emptyGear,
    normalizeItems, itemDef, itemName, itemUsable, findItem, gearOwner, equip, repairCost, repairItem, addItem, grantXp, perksEarned, pendingPerks, applyPerk };
})();