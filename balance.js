/* Единый конфиг числовых констант (п. 1.2 плана).
   Баланс не пересматривается: значения только вынесены в одно место,
   чтобы вернуться к тюнингу позже по запросу. Чистый модуль, без DOM. */
window.Balance = (() => {
  const b = {
    version: '0.6.1',
    profileVersion: 3,
    buildings: { cost: 85 },
    hiring: {
      cost: 20,
      starters: 2, // бесплатные бойцы при новой игре
      paid: { hpMin: 75, hpMax: 110, atkMin: 9, atkMax: 16, armorMax: 5 },
      vagrant: { hpMin: 55, hpMax: 70, atkMin: 5, atkMax: 7, armorMax: 0 },
      names: ['Ким', 'Орлов', 'Вега', 'Сато', 'Ильин', 'Морено'],
      codeMin: 10, codeSpan: 89 // суффикс имени: 10..98
    },
    heal: { divisor: 2, discountPerLevel: 0.05, maxDiscount: 0.5, min: 1 },
    squad: { size: 4 },
    encounter: {
      bossType: 5, typeCount: 5, bossHp: 100,
      hpFlat: 25, hpPerType: 5, depthScale: 0.16,
      minCount: 2, countPerDepth: 4, maxCount: 5,
      eliteMinDepth: 3, eliteHp: 1.5, eliteAttack: 1.2, eliteReward: 2
    },
    combat: {
      minDamage: 1,
      rollFlat: 0.85, rollSpan: 0.3, // урон бойца: atk * (0.85 + roll * 0.3)
      armorPierce: 4,                // игнор брони Панцирника от арсенала
      assaultEvery: 3, assaultMul: 2,
      engineerFlat: 4,
      heavyGuard: 3,                 // тяжёлый снижает входящий урон
      enemyDepthScale: 0.09,
      enemyAttackFlat: 4,            // урон врага: 4 + тип
      bossAttack: 11,
      medicEvery: 3, medicThreshold: 0.75,
      /* Пакет 0.5.0: решения в бою */
      grenadeDamage: 15,   // урок всем живым врагам (у осколочной гранаты своё значение)
      retreatCargo: 0.5,   // доля груза, уходящая на базу при отступлении
      coverMinAlive: 2,    // прикрытие отхода доступно при 2+ живых
      /* Пакет 0.6.0: механики врагов и боссов */
      nestType: 4, nestEvery: 3, nestMaxLarvae: 3,  // «Узел гнезда» спавнит Личинку каждые 3 хода (не более 3 живых)
      spitterType: 2, spitterEvery: 3,              // «Плевальщик» каждый 3-й ход бьёт самого раненого, минуя «тяжёлого»
      bossPhaseRatio: 0.5, bossLarvae: 2            // «Матка» на 50% HP призывает 2 Личинки
    },
    rewards: {
      bossFlat: 45, killFlat: 8, killPerDepth: 2,
      extractFlat: 12, extractDivisor: 2 // бонус эвакуации: 12 + floor(глубина / 2)
    },
    loot: { cacheFlat: 12, cachePerDepth: 3, medicalChance: 0.15, cacheItemChance: 0.25 },
    routes: {
      normal: { name: 'Основной коридор', hp: 1, attack: 1, reward: 1, elite: 0.12 },
      safe: { name: 'Сервисный обход', hp: 0.85, attack: 0.85, reward: 0.85, elite: 0.06 },
      risk: { name: 'Заражённое хранилище', hp: 1.2, attack: 1.2, reward: 1.5, elite: 0.24 }
    },
    raid: {
      tickMs: 700, checkpointEvery: 5, transitionTicks: 3,
      logLimit: 40, logVisible: 7,
      fxSpan: 700 // визуальное окно событий арены (мс visualTime)
    },
    stats: { firstBucketEnd: 4, bucketSize: 5 },
    menu: { demoLoop: 12 }, // секунд цикла демо-сцены в меню
    /* --- Пакет 0.5.0 «Бойцы и снаряжение» --- */
    xp: {
      thresholds: [0, 100, 250, 500, 900], // пороги уровней 1..5
      perDepth: 10, perBoss: 25,           // награда: 10×глубина + 25×пройденных боссов
      hpPerLevel: 3, atkPerLevel: 1        // +3 maxHp и +1 урон за уровень
    },
    perks: {
      max: 2, atLevels: [2, 4], // выбор перка на уровнях 2 и 4
      list: {
        tough: { name: 'Крепкий', text: '+15 к вместимости здоровья', hp: 15 },
        marksman: { name: 'Меткий', text: '+2 к урону', atk: 2 },
        medic: { name: 'Полевой медик', text: '+8 к лечению отряда', heal: 8 },
        armored: { name: 'Бронированный', text: '+2 к броне', armor: 2 },
        seeker: { name: 'Искатель', text: '+5% к шансу находок', find: 0.05 },
        veteran: { name: 'Ветеран', text: '+1 урона за каждые 5 секторов рейда', veteran: 1 }
      }
    },
    /* Определения предметов. Числа черновые, баланс не пересматривается. */
    gear: {
      wearPerRaid: 1, repairPerPoint: 5,
      defs: {
        pulse_rifle: { name: 'Импульсная винтовка', type: 'weapon', atk: 3, durability: 10 },
        carbine_mk2: { name: 'Карабин МК-2', type: 'weapon', atk: 2, durability: 12 },
        plasma_cutter: { name: 'Экспериментальный плазморез', type: 'weapon', atk: 5, armor: -1, durability: 8 },
        armor_plate: { name: 'Бронепластина', type: 'armor', armor: 2, durability: 10 },
        field_medkit: { name: 'Полевой медкомплект', type: 'gadget', kit: 5, durability: 10 },
        frag_grenade: { name: 'Осколочная граната', type: 'gadget', grenade: 15, durability: 1 },
        power_cell: { name: 'Энергетический аккумулятор', type: 'gadget', atk: 4, classReq: 'engineer', durability: 10 },
        osa_turret: { name: 'Автотурель «Оса»', type: 'gadget', atk: 3, durability: 10 },
        bio_scanner: { name: 'Сканер биомассы', type: 'gadget', find: 0.05, durability: 10 },
        incendiary: { name: 'Зажигательный заряд', type: 'gadget', boss: 2, durability: 6 },
        scope_stabilizer: { name: 'Стабилизатор прицела', type: 'gadget', pierce: 1, durability: 10 },
        safety_beacon: { name: 'Страховой маяк', type: 'gadget', beacon: 1, durability: 1 }
      }
    },
    /* --- Пакет 0.6.0 «Контент» --- */
    contracts: {
      max: 3,                       // до трёх активных контрактов
      creditMin: 50, creditMax: 150, // награда кредитами
      itemChance: 0.35,             // шанс, что награда — предмет
      kill: { min: 4, max: 10 },    // уничтожить N врагов типа T
      depth: { min: 6, max: 20 },   // дойти до глубины N за один рейд
      loot: { min: 40, max: 140 },  // собрать N кредитов за один рейд
      evac: { min: 1, max: 3 }      // эвакуироваться N раз
    },
    modifiers: {
      startDepth: 3, chance: 0.2,   // сектора с 3-го (не шлюз) с шансом 20% получают модификатор
      list: {
        radiation: { name: 'Радиация', text: 'В конце каждого хода живые бойцы теряют 2 HP (не ниже 1).', damage: 2 },
        spores: { name: 'Споры', text: 'Всё лечение в секторе снижено на 50%.', healMul: 0.5 },
        harsh: { name: 'Агрессивная среда', text: 'Враги наносят +15% урона, награды за бой +15%.', enemyMul: 1.15, rewardMul: 1.15 }
      }
    },
    roomEvents: {
      chance: 0.2,               // после зачистки обычного сектора (не шлюз)
      containerEliteChance: 0.4, // «Запечатанный контейнер»: 40% — бой с элитой
      containerBonus: 0.5        // при победе +50% к находке сектора
    }
    /* Задел пакетов 0.7.0+: sound: {...}, hints: {...} */
  };
  return b;
})();
