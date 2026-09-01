import * as THREE from 'three';
import { state } from './state.js';
import { camera, chestModal, controls, invHudBtn, inventoryModal, playerHeight, scene, shop2Modal, shopModal } from './core.js';
import { addItemToInventory, countItemByName, interactableObjects, inventory, pickupItem, placedBases, removeItemByName, updateInventoryUI } from './inventory.js';
import { raycasterInteract } from './movement.js';
import { addArrows, cancelMining, chestGridEl, chestPlayerGridEl, interactionPrompt, itemCatalog, refuelAtStation, updateCoinHUD } from './resources.js';

    // --- BASE PLACEMENT (base.glb, placeable anywhere) - doubles as a storage chest ---
    const BASE_STORAGE_SLOTS = 20;

    function spawnBaseAt(position, rotationY = 0) {
      if (!state.baseModelTemplate) return null;

      const base = state.baseModelTemplate.clone(true);
      base.position.copy(position);
      base.position.y += state.baseModelGroundOffset; // sit flush on the surface regardless of the model's pivot
      base.rotation.y = rotationY;

      // Give this base its own storage array and mark every node in its
      // hierarchy as an interactable chest, pointing back to the root object
      // so it can be found again regardless of which mesh the raycast hits.
      base.userData.chestStorage = new Array(BASE_STORAGE_SLOTS).fill(null);
      base.traverse((child) => {
        child.userData.isBaseChest = true;
        child.userData.name = 'Base Storage';
        child.userData.chestOwner = base;
      });

      scene.add(base);
      placedBases.push(base);
      interactableObjects.push(base);
      return base;
    }

    export function placeBaseAtCrosshair() {
      if (!state.baseModelTemplate) {
        alert('Base model is still loading, try again in a moment.');
        return;
      }

      if (countItemByName('Base Kit') < 1) {
        alert('You need a Base Kit to place a base! Buy one from the shop.');
        return;
      }

      const camPos = new THREE.Vector3();
      camera.getWorldPosition(camPos);
      const camDir = new THREE.Vector3();
      camera.getWorldDirection(camDir);

      let placePos = null;

      // Aim the crosshair ray at the loaded map to find exactly where to drop the base.
      if (state.loadedModel) {
        raycasterInteract.setFromCamera(new THREE.Vector2(0, 0), camera);
        const hits = raycasterInteract.intersectObject(state.loadedModel, true);
        if (hits.length > 0 && hits[0].distance < 80) {
          placePos = hits[0].point.clone();
        }
      }

      // No surface hit within range (open sky, no map, or too far away) - fall back
      // to a fixed spot in front of the player at their current ground level.
      if (!placePos) {
        placePos = camPos.clone().add(camDir.clone().multiplyScalar(6));
        placePos.y = controls.getObject().position.y - playerHeight;
      }

      // Face the base away from the player, keeping it upright.
      const rotationY = Math.atan2(camDir.x, camDir.z);

      spawnBaseAt(placePos, rotationY);
      removeItemByName('Base Kit', 1);
    }

    // --- BASE REMOVAL (unbuild a placed base back into a Base Kit) ---
    // Look at a placed base and press G. The base's storage must be empty first,
    // so nothing stored inside it is ever lost when it's picked back up.
    export function unbuildBaseAtCrosshair() {
      if (!state.hoveredObject || !state.hoveredObject.userData.isBaseChest) return;

      const base = state.hoveredObject.userData.chestOwner;
      if (!base) return;

      const storage = base.userData.chestStorage || [];
      if (storage.some(slot => slot)) {
        alert("Empty the base's storage before unbuilding it!");
        return;
      }

      if (!addItemToInventory(itemCatalog.base_kit)) return;

      scene.remove(base);
      const placedIdx = placedBases.indexOf(base);
      if (placedIdx > -1) placedBases.splice(placedIdx, 1);
      const interactIdx = interactableObjects.indexOf(base);
      if (interactIdx > -1) interactableObjects.splice(interactIdx, 1);

      state.hoveredObject = null;
      interactionPrompt.style.display = 'none';
    }

    // Restores bases from a save file once base.glb has finished loading, retrying
    // briefly if the model isn't ready yet (e.g. a save is loaded right after page load).
    export function restoreSavedBases(baseList, triesLeft = 10) {
      if (!Array.isArray(baseList) || baseList.length === 0) return;

      if (!state.baseModelTemplate) {
        if (triesLeft > 0) setTimeout(() => restoreSavedBases(baseList, triesLeft - 1), 300);
        return;
      }

      baseList.forEach((b) => {
        if (typeof b.x === 'number' && typeof b.y === 'number' && typeof b.z === 'number') {
          const restoredBase = spawnBaseAt(new THREE.Vector3(b.x, b.y, b.z), b.rotationY || 0);
          if (restoredBase && Array.isArray(b.storage)) {
            restoredBase.userData.chestStorage = deserializeItemList(b.storage, BASE_STORAGE_SLOTS);
          }
        }
      });
    }

    // Rehydrates a saved list of {name, quantity} entries into full item objects
    // (icon/geometry/material looked up from itemCatalog) - used to restore a
    // base's chest storage from a save file.
    function deserializeItemList(list, size) {
      const result = new Array(size).fill(null);
      if (!Array.isArray(list)) return result;
      list.forEach((entry, idx) => {
        if (idx >= size || !entry) return;
        const itemName = (typeof entry === 'string') ? entry : entry.name;
        const quantity = (typeof entry === 'object' && entry.quantity) ? entry.quantity : 1;
        const catKey = Object.keys(itemCatalog).find(k => itemCatalog[k].name === itemName);
        if (catKey) {
          const tmpl = itemCatalog[catKey];
          result[idx] = { name: tmpl.name, icon: tmpl.icon, geometry: tmpl.geometry, material: tmpl.material, quantity: quantity };
        }
      });
      return result;
    }

    function openShop() {
      state.isShopOpen = true;
      if (controls.isLocked) controls.unlock();
      shopModal.style.display = 'flex';
      interactionPrompt.style.display = 'none';
      cancelMining();
    }

    function openShop2() {
      state.isShopOpen = true;
      if (controls.isLocked) controls.unlock();
      shop2Modal.style.display = 'flex';
      interactionPrompt.style.display = 'none';
      cancelMining();
    }

    export function closeShop() {
      shopModal.style.display = 'none';
      shop2Modal.style.display = 'none';
      state.isShopOpen = false;
      controls.lock();
    }

    function openInventory() {
      state.isInventoryOpen = true;
      state.selectedSwapSourceIndex = null;
      if (controls.isLocked) controls.unlock();
      inventoryModal.style.display = 'flex';
      interactionPrompt.style.display = 'none';
      cancelMining();
      updateInventoryUI();
    }

    export function closeInventory() {
      inventoryModal.style.display = 'none';
      state.isInventoryOpen = false;
      state.selectedSwapSourceIndex = null;
      controls.lock();
    }

    export function toggleInventory() {
      if (state.isInventoryOpen) closeInventory();
      else openInventory();
    }

    // --- BASE STORAGE CHEST UI ---

    function openChest(baseObj) {
      if (!baseObj || !baseObj.userData.chestStorage) return;
      state.activeChestBase = baseObj;
      state.activeChestStorage = baseObj.userData.chestStorage;
      state.chestSwapSource = null;
      state.isChestOpen = true;
      if (controls.isLocked) controls.unlock();
      chestModal.style.display = 'flex';
      interactionPrompt.style.display = 'none';
      cancelMining();
      renderChestModal();
    }

    export function closeChest() {
      chestModal.style.display = 'none';
      state.isChestOpen = false;
      state.activeChestBase = null;
      state.activeChestStorage = null;
      state.chestSwapSource = null;
      controls.lock();
    }

    function getChestContainerArray(container) {
      return container === 'chest' ? activeChestStorage : inventory;
    }

    function handleChestSlotClick(container, index) {
      const arr = getChestContainerArray(container);
      if (!arr) return;

      if (!state.chestSwapSource) {
        if (arr[index] !== null) state.chestSwapSource = { container, index };
      } else if (state.chestSwapSource.container === container && state.chestSwapSource.index === index) {
        state.chestSwapSource = null;
      } else {
        const srcArr = getChestContainerArray(state.chestSwapSource.container);
        const temp = srcArr[state.chestSwapSource.index];
        srcArr[state.chestSwapSource.index] = arr[index];
        arr[index] = temp;
        state.chestSwapSource = null;
      }

      renderChestModal();
      updateInventoryUI();
    }

    function buildChestSlotEl(item, index, container) {
      const slotEl = document.createElement('div');
      const isSelected = state.chestSwapSource && state.chestSwapSource.container === container && state.chestSwapSource.index === index;
      slotEl.className = 'inv-slot' + (isSelected ? ' source-selected' : '');
      slotEl.innerHTML = `
        <span class="inv-slot-num">${index + 1}</span>
        <span style="font-size: 20px;">${item ? (item.icon || '📦') : ''}</span>
        <span class="slot-name" style="font-size: 8px;">${item ? item.name + ((item.quantity || 1) > 1 ? ' x' + item.quantity : '') : ''}</span>
      `;
      slotEl.addEventListener('click', () => handleChestSlotClick(container, index));
      return slotEl;
    }

    function renderChestModal() {
      if (!state.activeChestStorage) return;

      chestGridEl.innerHTML = '';
      state.activeChestStorage.forEach((item, i) => {
        chestGridEl.appendChild(buildChestSlotEl(item, i, 'chest'));
      });

      chestPlayerGridEl.innerHTML = '';
      inventory.forEach((item, i) => {
        chestPlayerGridEl.appendChild(buildChestSlotEl(item, i, 'player'));
      });
    }

    document.getElementById('closeShopBtn').addEventListener('click', closeShop);
    document.getElementById('closeShop2Btn').addEventListener('click', closeShop);
    document.getElementById('closeInvBtn').addEventListener('click', closeInventory);
    document.getElementById('closeChestBtn').addEventListener('click', closeChest);
    invHudBtn.addEventListener('click', toggleInventory);

    document.querySelectorAll('.buy-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const itemKey = e.target.getAttribute('data-item');
        const price = parseInt(e.target.getAttribute('data-price'), 10);
        const vaviteCost = parseInt(e.target.getAttribute('data-vavite'), 10) || 0;

        if (state.playerCoins < price) {
          alert("Not enough coins!");
          return;
        }

        if (vaviteCost > 0 && countItemByName('Vavite') < vaviteCost) {
          alert(`You need ${vaviteCost} 🔮 Vavite for this! You have ${countItemByName('Vavite')}.`);
          return;
        }

        if (itemKey === 'arrows') {
          state.playerCoins -= price;
          updateCoinHUD();
          addArrows(15);
          return;
        }

        const template = itemCatalog[itemKey];
        if (template && addItemToInventory(template)) {
          state.playerCoins -= price;
          updateCoinHUD();
          if (vaviteCost > 0) removeItemByName('Vavite', vaviteCost);
        }
      });
    });

    export function handleInteraction() {
      if (state.hoveredObject && controls.isLocked) {
        if (state.hoveredObject.userData.isShop2) openShop2();
        else if (state.hoveredObject.userData.isShop) openShop();
        else if (state.hoveredObject.userData.isGasStation) refuelAtStation();
        else if (state.hoveredObject.userData.isBaseChest) openChest(state.hoveredObject.userData.chestOwner);
        else if (state.hoveredObject.userData.isItem) pickupItem(state.hoveredObject);
      }
    }

