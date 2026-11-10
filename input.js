/* Привязка обработчиков, удержание «Улучшить», горячие клавиши (п. 1.2 плана).
   Вся логика действий — в Game; здесь только DOM-связывание и жесты. */
window.Input = (() => {
  let upgradeHold = null, repeatedUpgrade = null, keysBound = false;

  function bindPreparation() {
    for (const [id, key] of [['prep-order', 'order'], ['prep-kits', 'kits'], ['prep-tier', 'kitTier']]) {
      const field = document.querySelector('#' + id);
      if (field) field.onchange = () => Game.setPrep(key, key === 'order' ? field.value : Number(field.value));
    }
  }

  function refreshHold(button, key) {
    const s = Game.profile(), level = s.buildings[key], nextCost = Balance.buildings.cost * level;
    button.textContent = 'Улучшить · ₡ ' + GameUI.money(nextCost);
    const wallet = document.querySelector('#resources strong');
    if (wallet) wallet.textContent = '₡ ' + GameUI.money(s.res.credits);
    const tag = document.querySelector('#building-' + key + ' .tag');
    if (tag) tag.textContent = 'Ур. ' + level + ' → ' + (level + 1);
  }

  function stopUpgradeHold(refresh = true) {
    if (!upgradeHold) return;
    const hold = upgradeHold;
    upgradeHold = null;
    clearTimeout(hold.timer);
    hold.listeners.abort();
    if (refresh && hold.purchased) Game.render();
  }

  function bindUpgrade(button) {
    const key = button.dataset.up;
    button.onclick = e => {
      if (e.detail > 0 && repeatedUpgrade === key) { repeatedUpgrade = null; return; }
      Game.purchaseUpgrade(key);
    };
    button.onpointerdown = e => {
      if (!e.isPrimary || e.button !== 0 || button.disabled) return;
      stopUpgradeHold(); repeatedUpgrade = null;
      const listeners = new AbortController(), opts = { capture: true, signal: listeners.signal };
      const hold = { listeners, timer: null, purchased: false };
      upgradeHold = hold;
      const release = event => { if (event.pointerId === e.pointerId) stopUpgradeHold(); };
      window.addEventListener('pointerup', release, opts);
      window.addEventListener('pointercancel', release, opts);
      window.addEventListener('pointermove', event => {
        if (event.pointerId === e.pointerId && document.elementFromPoint(event.clientX, event.clientY)?.closest('[data-up]')?.dataset.up !== key) stopUpgradeHold();
      }, opts);
      window.addEventListener('blur', stopUpgradeHold, opts);
      document.addEventListener('visibilitychange', stopUpgradeHold, opts);
      function repeat() {
        if (upgradeHold !== hold) return;
        if (!Game.purchaseUpgrade(key, false)) { stopUpgradeHold(); return; }
        hold.purchased = true;
        repeatedUpgrade = key;
        // Кнопка остаётся в DOM до конца жеста: обновляем текст и ресурсы точечно.
        refreshHold(button, key);
        const s = Game.profile(), nextCost = Balance.buildings.cost * s.buildings[key];
        if (s.res.credits < nextCost) { stopUpgradeHold(); return; }
        hold.timer = setTimeout(repeat, 150);
      }
      hold.timer = setTimeout(repeat, 350);
    };
  }

  function bind() {
    bindPreparation();
    document.querySelectorAll('[data-tab]').forEach(b => b.onclick = () => Game.setTab(b.dataset.tab));
    document.querySelectorAll('[data-pick]').forEach(b => b.onclick = () => Game.pick(+b.dataset.pick));
    document.querySelectorAll('[data-up]').forEach(b => bindUpgrade(b));
    document.querySelectorAll('[data-gear]').forEach(sel => sel.onchange = () => Game.equip(+sel.dataset.index, sel.dataset.slot, sel.value || null));
    document.querySelectorAll('[data-action]').forEach(b => b.onclick = () => Game.action(b.dataset.action, b));
    const input = document.querySelector('#import');
    if (input) input.onchange = () => Game.importFile(input.files && input.files[0]);
    bindKeys();
  }

  /* Горячие клавиши: Esc — меню, Space/P — пауза, 1/2/4 — скорость. */
  function bindKeys() {
    if (keysBound || typeof window === 'undefined' || typeof window.addEventListener !== 'function') return;
    keysBound = true;
    window.addEventListener('keydown', e => {
      const ui = Game.uiState();
      if (ui.dialog) {
        if (e.key === 'Enter') { e.preventDefault(); Game.action('dialog-confirm'); }
        else if (e.key === 'Escape') { e.preventDefault(); Game.action('dialog-cancel'); }
        return;
      }
      const tag = (document.activeElement && document.activeElement.tagName) || '';
      if (tag === 'SELECT' || tag === 'INPUT' || tag === 'TEXTAREA') return;
      if (e.key === 'Escape') {
        if (ui.screen === 'stats' || ui.screen === 'game') { e.preventDefault(); Game.action('menu'); }
        return;
      }
      if (ui.screen !== 'game' || ui.tab !== 'raid' || !ui.raid) return;
      const isPauseKey = e.key === 'p' || e.key === 'P' || e.key === 'з' || e.key === 'З';
      if (e.key === ' ' || e.code === 'Space' || isPauseKey) {
        if (tag === 'BUTTON' && !isPauseKey) return;
        e.preventDefault(); Game.action('pause'); return;
      }
      if (e.key === '1') Game.action('speed-1');
      if (e.key === '2') Game.action('speed-2');
      if (e.key === '4') Game.action('speed-4');
    });
  }

  return { bind, stopUpgradeHold, bindKeys };
})();