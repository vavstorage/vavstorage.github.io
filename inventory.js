import * as THREE from 'three';
import { state } from './state.js';
import { camera, scene } from './core.js';
import { addXP } from './player.js';
import { hotbarGridEl, innerGridEl, interactionPrompt, spawnWorldItem, updateCoinHUD } from './resources.js';
import { updateHeldWeaponModel } from './weapons.js';

    
    export const HOTBAR_SLOTS = 9;
    const INNER_SLOTS = 27;
    export const TOTAL_SLOTS = HOTBAR_SLOTS + INNER_SLOTS;
    export const inventory = new Array(TOTAL_SLOTS).fill(null);

    export const itemsInWorld = [];
    export const interactableObjects = [];
    export const placedBases = [];

    // --- INVENTORY UI & SWAP SYSTEM ---
    function findFirstEmptySlot() {
      for (let i = 0; i < TOTAL_SLOTS; i++) {
        if (inventory[i] === null) return i;
      }
      return -1;
    }

    function handleSlotClickInModal(slotIndex) {
      if (state.selectedSwapSourceIndex === null) {
        if (inventory[slotIndex] !== null) {
          state.selectedSwapSourceIndex = slotIndex;
        }
      } else if (state.selectedSwapSourceIndex === slotIndex) {
        state.selectedSwapSourceIndex = null;
      } else {
        const temp = inventory[state.selectedSwapSourceIndex];
        inventory[state.selectedSwapSourceIndex] = inventory[slotIndex];
        inventory[slotIndex] = temp;
        state.selectedSwapSourceIndex = null;
      }
      updateInventoryUI();
    }

    function renderModalInventoryGrids() {
      innerGridEl.innerHTML = '';
      hotbarGridEl.innerHTML = '';

      for (let i = HOTBAR_SLOTS; i < TOTAL_SLOTS; i++) {
        const item = inventory[i];
        const slotEl = document.createElement('div');
        slotEl.className = 'inv-slot' + (state.selectedSwapSourceIndex === i ? ' source-selected' : '');
        slotEl.innerHTML = `
          <span class="inv-slot-num">${i + 1}</span>
          <span style="font-size: 20px;">${item ? (item.icon || '📦') : ''}</span>
          <span class="slot-name" style="font-size: 8px;">${item ? item.name + ((item.quantity || 1) > 1 ? ' x' + item.quantity : '') : ''}</span>
        `;
        slotEl.addEventListener('click', () => handleSlotClickInModal(i));
        innerGridEl.appendChild(slotEl);
      }

      for (let i = 0; i < HOTBAR_SLOTS; i++) {
        const item = inventory[i];
        const slotEl = document.createElement('div');
        slotEl.className = 'inv-slot' + (state.selectedSwapSourceIndex === i ? ' source-selected' : '');
        slotEl.innerHTML = `
          <span class="inv-slot-num">${i + 1}</span>
          <span style="font-size: 20px;">${item ? (item.icon || '📦') : ''}</span>
          <span class="slot-name" style="font-size: 8px;">${item ? item.name + ((item.quantity || 1) > 1 ? ' x' + item.quantity : '') : ''}</span>
        `;
        slotEl.addEventListener('click', () => handleSlotClickInModal(i));
        hotbarGridEl.appendChild(slotEl);
      }
    }

    export function updateInventoryUI() {
      const slots = document.querySelectorAll('#inventory-bar .slot');
      slots.forEach((slotEl, idx) => {
        slotEl.classList.toggle('active', idx === state.selectedSlot);
        const item = inventory[idx];
        const iconEl = slotEl.querySelector('.slot-icon');
        const nameEl = slotEl.querySelector('.slot-name');

        if (item) {
          iconEl.textContent = item.icon || '📦';
          nameEl.textContent = item.name + ((item.quantity || 1) > 1 ? ` x${item.quantity}` : '');
        } else {
          iconEl.textContent = '';
          nameEl.textContent = 'Empty';
        }
      });

      renderModalInventoryGrids();
      updateHeldWeaponModel();
    }

    document.querySelectorAll('#inventory-bar .slot').forEach((slotEl, idx) => {
      slotEl.addEventListener('click', () => {
        state.selectedSlot = idx;
        updateInventoryUI();
      });
    });

    export function pickupItem(itemMesh) {
      if (itemMesh.userData.isCoin) {
        state.playerCoins += 10;
        updateCoinHUD();
        addXP(10);
      } else {
        const added = addItemToInventory({
          name: itemMesh.userData.name,
          icon: itemMesh.userData.icon,
          geometry: itemMesh.geometry,
          material: itemMesh.material
        });
        if (!added) return; // stays in the world if inventory is full
      }

      scene.remove(itemMesh);
      const idx = itemsInWorld.indexOf(itemMesh);
      if (idx > -1) itemsInWorld.splice(idx, 1);
      const intIdx = interactableObjects.indexOf(itemMesh);
      if (intIdx > -1) interactableObjects.splice(intIdx, 1);

      state.hoveredObject = null;
      interactionPrompt.style.display = 'none';
    }

    export function addItemToInventory(itemData, quantity = 1) {
      // Stack onto an existing slot of the same item instead of always using a new one
      const existingIndex = inventory.findIndex(slot => slot && slot.name === itemData.name);
      if (existingIndex !== -1) {
        inventory[existingIndex].quantity = (inventory[existingIndex].quantity || 1) + quantity;
        updateInventoryUI();
        return true;
      }

      const emptyIndex = findFirstEmptySlot();
      if (emptyIndex === -1) {
        alert("Inventory Full! Drop or move an item first.");
        return false;
      }
      inventory[emptyIndex] = {
        name: itemData.name,
        icon: itemData.icon,
        geometry: itemData.geometry,
        material: itemData.material,
        quantity: quantity
      };
      updateInventoryUI();
      return true;
    }

    // Total number of fossils currently held (across any stacked slot)
    export function countFossils() {
      return inventory.reduce((total, slot) => {
        if (slot && slot.name && slot.name.toLowerCase().includes('fossil')) {
          return total + (slot.quantity || 1);
        }
        return total;
      }, 0);
    }

    // Removes up to `amount` fossils from inventory, clearing/decrementing slots as needed.
    // Returns true if the full amount was removed.
    export function removeFossils(amount) {
      let remaining = amount;
      for (let i = 0; i < TOTAL_SLOTS && remaining > 0; i++) {
        const slot = inventory[i];
        if (slot && slot.name && slot.name.toLowerCase().includes('fossil')) {
          const have = slot.quantity || 1;
          if (have <= remaining) {
            remaining -= have;
            inventory[i] = null;
          } else {
            slot.quantity = have - remaining;
            remaining = 0;
          }
        }
      }
      updateInventoryUI();
      return remaining === 0;
    }

    // Generic versions of the two helpers above, matched by exact item name
    // (used for Vavite, and anything else with a single fixed catalog name).
    export function countItemByName(name) {
      return inventory.reduce((total, slot) => {
        if (slot && slot.name === name) {
          return total + (slot.quantity || 1);
        }
        return total;
      }, 0);
    }

    export function removeItemByName(name, amount) {
      let remaining = amount;
      for (let i = 0; i < TOTAL_SLOTS && remaining > 0; i++) {
        const slot = inventory[i];
        if (slot && slot.name === name) {
          const have = slot.quantity || 1;
          if (have <= remaining) {
            remaining -= have;
            inventory[i] = null;
          } else {
            slot.quantity = have - remaining;
            remaining = 0;
          }
        }
      }
      updateInventoryUI();
      return remaining === 0;
    }

    export function dropSelectedItem() {
      const itemData = inventory[state.selectedSlot];
      if (!itemData) return;

      const dropPos = new THREE.Vector3();
      camera.getWorldPosition(dropPos);
      const dir = new THREE.Vector3();
      camera.getWorldDirection(dir);

      dropPos.add(dir.multiplyScalar(1.5));
      dropPos.y = Math.max(dropPos.y, 0.5);

      const droppedItem = spawnWorldItem(itemData.name, itemData.icon, itemData.geometry, itemData.material, dropPos);
      droppedItem.userData.velocityY = 2.0;

      // Drop one unit from the stack; only clear the slot once it's empty
      if ((itemData.quantity || 1) > 1) {
        itemData.quantity -= 1;
      } else {
        inventory[state.selectedSlot] = null;
      }
      updateInventoryUI();
    }

