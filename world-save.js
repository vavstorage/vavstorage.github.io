import { state } from './state.js';
import { closeChest } from './base-building.js';
import { controls, scene } from './core.js';
import { TOTAL_SLOTS, interactableObjects, inventory, placedBases, updateInventoryUI } from './inventory.js';
import { updateArrowHUD, updateFuelHUD, updateHealthHUD, updateLevelHUD } from './player.js';
import { itemCatalog, updateCoinHUD } from './resources.js';
import { deleteWorld, playWorld, renameWorld } from './terminal.js';

    // --- MINECRAFT-STYLE WORLD SAVE SYSTEM ---
    // Instead of one overwrite-only save slot, progress lives in a list of named
    // "state.worlds" (like Minecraft's Select World screen). Each world remembers its
    // own map, stats, inventory, position, and bases. Worlds are stored in
    // localStorage under WORLDS_KEY; the old single-slot save is auto-imported
    // once as "Imported World" so nobody loses existing progress.
    const WORLDS_KEY = '3d_fps_worlds_v1';
    const LEGACY_SAVE_KEY = '3d_fps_game_save';
    export const AUTOSAVE_INTERVAL_MS = 90000;

    export const worldsModal = document.getElementById('state.worlds-modal');
    const worldsListEl = document.getElementById('state.worlds-list');
    export const newWorldNameInput = document.getElementById('newWorldName');
    const saveToastEl = document.getElementById('save-toast');

    export function showToast(msg) {
      if (!saveToastEl) return;
      saveToastEl.textContent = msg;
      saveToastEl.classList.add('show');
      clearTimeout(state.toastTimer);
      state.toastTimer = setTimeout(() => saveToastEl.classList.remove('show'), 2600);
    }

    function escapeHtml(str) {
      const div = document.createElement('div');
      div.textContent = String(str);
      return div.innerHTML;
    }

    function formatRelativeTime(ts) {
      if (!ts) return 'never played';
      const mins = Math.floor((Date.now() - ts) / 60000);
      if (mins < 1) return 'just now';
      if (mins < 60) return `${mins}m ago`;
      const hrs = Math.floor(mins / 60);
      if (hrs < 24) return `${hrs}h ago`;
      return `${Math.floor(hrs / 24)}d ago`;
    }

    export function loadWorldsFromStorage() {
      try {
        const raw = localStorage.getItem(WORLDS_KEY);
        state.worlds = raw ? JSON.parse(raw) : [];
        if (!Array.isArray(state.worlds)) state.worlds = [];
      } catch (e) {
        console.error('Could not read state.worlds list:', e);
        state.worlds = [];
      }
    }

    export function persistWorlds() {
      try {
        localStorage.setItem(WORLDS_KEY, JSON.stringify(state.worlds));
      } catch (e) {
        console.error('Could not save state.worlds list:', e);
        showToast('⚠️ Could not save — storage may be full.');
      }
    }

    // One-time migration: fold the old single-slot save into the new state.worlds list
    // the first time this loads, so existing progress isn't lost.
    export function migrateLegacySaveIfNeeded() {
      if (state.worlds.length > 0) return;
      const raw = localStorage.getItem(LEGACY_SAVE_KEY);
      if (!raw) return;
      try {
        const legacy = JSON.parse(raw);
        state.worlds.push({
          id: 'world_' + Date.now(),
          name: 'Imported World',
          map: legacy.map || state.currentLoadedFileName,
          mapSource: 'remote',
          createdAt: Date.now(),
          updatedAt: Date.now(),
          data: {
            level: legacy.level, xp: legacy.xp, xpToNextLevel: legacy.xpToNextLevel,
            coins: legacy.coins, health: legacy.health, fuel: legacy.fuel, arrows: legacy.arrows,
            inventory: legacy.inventory, position: legacy.position, bases: legacy.bases
          }
        });
        persistWorlds();
      } catch (e) {
        console.error('Legacy save migration failed:', e);
      }
    }

    export function getActiveWorld() {
      return state.worlds.find(w => w.id === state.activeWorldId) || null;
    }

    export function buildSaveDataObject() {
      return {
        level: state.playerLevel,
        xp: state.playerXP,
        xpToNextLevel: state.xpToNextLevel,
        coins: state.playerCoins,
        health: state.playerHealth,
        fuel: state.playerFuel,
        arrows: state.playerArrows,
        inventory: inventory.map(item => item ? { name: item.name, quantity: item.quantity || 1 } : null),
        position: {
          x: controls.getObject().position.x,
          y: controls.getObject().position.y,
          z: controls.getObject().position.z
        },
        bases: placedBases.map(base => ({
          x: base.position.x,
          y: base.position.y - state.baseModelGroundOffset,
          z: base.position.z,
          rotationY: base.rotation.y,
          storage: (base.userData.chestStorage || []).map(item => item ? { name: item.name, quantity: item.quantity || 1 } : null)
        }))
      };
    }

    // Applies a world's saved stats/inventory/position. Deliberately leaves bases
    // alone (cleared here, restored by the caller) since restoring them is only
    // safe once we know the matching map is actually loaded.
    export function applySaveDataObject(data) {
      if (!data) return;
      state.playerLevel = data.level || 1;
      state.playerXP = data.xp || 0;
      state.xpToNextLevel = data.xpToNextLevel || 100;
      state.playerCoins = (data.coins !== undefined) ? data.coins : 10;
      state.playerHealth = (data.health !== undefined) ? data.health : 100;
      state.playerFuel = (data.fuel !== undefined) ? data.fuel : 200;
      state.playerArrows = (data.arrows !== undefined) ? data.arrows : 20;

      updateLevelHUD();
      updateCoinHUD();
      updateHealthHUD();
      updateFuelHUD();
      updateArrowHUD();

      inventory.fill(null);
      if (Array.isArray(data.inventory)) {
        data.inventory.forEach((entry, idx) => {
          if (idx >= TOTAL_SLOTS || !entry) return;
          // Support both the old plain-name string format and the { name, quantity } format.
          const itemName = (typeof entry === 'string') ? entry : entry.name;
          const quantity = (typeof entry === 'object' && entry.quantity) ? entry.quantity : 1;
          const catKey = Object.keys(itemCatalog).find(k => itemCatalog[k].name === itemName);
          if (catKey) {
            const tmpl = itemCatalog[catKey];
            inventory[idx] = { name: tmpl.name, icon: tmpl.icon, geometry: tmpl.geometry, material: tmpl.material, quantity: quantity };
          }
        });
      }
      updateInventoryUI();

      if (data.position) {
        controls.getObject().position.set(data.position.x, data.position.y, data.position.z);
      }

      if (state.isChestOpen) closeChest();
      placedBases.forEach((base) => {
        scene.remove(base);
        const idx = interactableObjects.indexOf(base);
        if (idx > -1) interactableObjects.splice(idx, 1);
      });
      placedBases.length = 0;
    }

    export function renderWorldsList() {
      if (!worldsListEl) return;
      const sorted = [...worlds].sort((a, b) => b.updatedAt - a.updatedAt);

      if (sorted.length === 0) {
        worldsListEl.innerHTML = '<div class="state.worlds-empty">No state.worlds yet — create one above to get started!</div>';
        return;
      }

      worldsListEl.innerHTML = sorted.map(w => `
        <div class="world-entry" data-id="${w.id}">
          <div class="world-entry-icon">🗺️</div>
          <div class="world-entry-info">
            <div class="world-entry-name">${escapeHtml(w.name)}${w.id === state.activeWorldId ? ' <span class="world-active-tag">● Active</span>' : ''}</div>
            <div class="world-entry-meta">Map: ${escapeHtml(w.map || 'unknown')} · Lvl ${(w.data && w.data.level) || 1} · ${formatRelativeTime(w.updatedAt)}</div>
          </div>
          <div class="world-entry-actions">
            <button class="world-action-btn world-play-btn" data-id="${w.id}" title="Play">▶️</button>
            <button class="world-action-btn world-rename-btn" data-id="${w.id}" title="Rename">✏️</button>
            <button class="world-action-btn world-delete-btn" data-id="${w.id}" title="Delete">🗑️</button>
          </div>
        </div>
      `).join('');

      worldsListEl.querySelectorAll('.world-play-btn').forEach(btn => btn.addEventListener('click', () => playWorld(btn.dataset.id)));
      worldsListEl.querySelectorAll('.world-rename-btn').forEach(btn => btn.addEventListener('click', () => renameWorld(btn.dataset.id)));
      worldsListEl.querySelectorAll('.world-delete-btn').forEach(btn => btn.addEventListener('click', () => deleteWorld(btn.dataset.id)));
    }

    export function openWorldsMenu() {
      renderWorldsList();
      worldsModal.classList.add('open');
    }

    export function closeWorldsMenu() {
      worldsModal.classList.remove('open');
    }

