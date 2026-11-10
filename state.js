/* Схема профиля, миграция версий, сохранение/загрузка, экспорт/импорт JSON,
   операции с ростером (наём, лечение, выбор отряда). Без DOM: только localStorage.
   Проверяется в Node-тестах без document (п. 1.2 плана). */
window.State = (() => {
  const KEY = 'xenocide.outpost.v1';
  const int = n => (Number.isFinite(n) && n > 0 ? Math.floor(n) : 0);

  const emptyGear = () => ({ weapon: null, armor: null, gadget: null });

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
    items: ['Импульсная винтовка', 'Полевой медкомплект', 'Осколочная граната', 'Бронепластина', 'Карабин МК-2', 'Энергетический аккумулятор', 'Автотурель «Оса»', 'Экспериментальный плазморез', 'Сканер биомассы', 'Зажигательный заряд', 'Стабилизатор прицела', 'Страховой маяк'],
    raid: null,
    deepest: 0,
    run: 0,
    stats: stats(),
    seenStory: []
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
      });
      s.stats = normalizeStats(s.stats);
      if (!Array.isArray(s.seenStory)) s.seenStory = [];
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
      gear: emptyGear()
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

  return { KEY, fresh, migrate, load, save, exportJson, importJson, recruit, pick, autoPick, healCost, healRecruit, normalizeStats, emptyGear };
})();