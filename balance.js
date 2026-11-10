/* Единый конфиг числовых констант (п. 1.2 плана).
   Баланс не пересматривается: значения только вынесены в одно место,
   чтобы вернуться к тюнингу позже по запросу. Чистый модуль, без DOM. */
window.Balance = (() => {
  const b = {
    version: '0.4.1',
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
      medicEvery: 3, medicThreshold: 0.75
    },
    rewards: {
      bossFlat: 45, killFlat: 8, killPerDepth: 2,
      extractFlat: 12, extractDivisor: 2 // бонус эвакуации: 12 + floor(глубина / 2)
    },
    loot: { cacheFlat: 12, cachePerDepth: 3, medicalChance: 0.15 },
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
    menu: { demoLoop: 12 } // секунд цикла демо-сцены в меню
    /* Задел пакетов 0.5.0+ (черновые числа, баланс позже):
       xp: { thresholds: [0, 100, 250, 500, 900], perDepth: 10, perBoss: 25, maxLevel: 5 },
       perks: {...}, gear: {...}, contracts: {...}, events: {...}, modifiers: {...} */
  };
  return b;
})();
