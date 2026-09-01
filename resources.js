import * as THREE from 'three';
import { state } from './state.js';
import { scene } from './core.js';
import { addItemToInventory, countFossils, interactableObjects, inventory, itemsInWorld, removeFossils, updateInventoryUI } from './inventory.js';
import { healPlayer, maxPlayerFuel, refuelPlayer, updateArrowHUD } from './player.js';
import { updateHeldWeaponModel } from './weapons.js';

    // --- GAS STATION COST ---
    const GAS_STATION_COIN_COST = 10;
    const GAS_STATION_FOSSIL_COST = 2;

    export function refuelAtStation() {
      if (state.playerFuel >= maxPlayerFuel) {
        alert("Fuel tank is already full!");
        return;
      }

      const fossilsHeld = countFossils();
      if (state.playerCoins < GAS_STATION_COIN_COST || fossilsHeld < GAS_STATION_FOSSIL_COST) {
        alert(
          `Refueling costs ${GAS_STATION_COIN_COST} 🪙 and ${GAS_STATION_FOSSIL_COST} 🦴 Fossils.\n` +
          `You have ${state.playerCoins} 🪙 and ${fossilsHeld} 🦴 Fossil${fossilsHeld === 1 ? '' : 's'}.`
        );
        return;
      }

      state.playerCoins -= GAS_STATION_COIN_COST;
      updateCoinHUD();
      removeFossils(GAS_STATION_FOSSIL_COST);
      refuelPlayer(200);
    }

    export function addArrows(amount) {
      state.playerArrows += amount;
      updateArrowHUD();
      updateHeldWeaponModel();
      alert(`Added ${amount} Arrows! Total: ${state.playerArrows}`);
    }

    export function useSelectedItem() {
      const item = inventory[state.selectedSlot];
      if (!item) return;

      // Consume one unit from the stack; only clear the slot once it's empty
      const consumeOne = () => {
        if ((item.quantity || 1) > 1) {
          item.quantity -= 1;
        } else {
          inventory[state.selectedSlot] = null;
        }
        updateInventoryUI();
      };

      if (item.name.includes('Potion')) {
        if (healPlayer(35)) {
          consumeOne();
        } else {
          alert("Health is already full!");
        }
      } else if (item.name.includes('Fuel Tank')) {
        if (refuelPlayer(100)) {
          consumeOne();
        }
      } else if (item.name.includes('Arrow Bundle')) {
        addArrows(15);
        consumeOne();
      }
    }

    // --- Fossil mining state ---
    export const MINE_DURATION_MS = 2000;
    export const DIAMOND_MINE_DURATION_MS = 1000;

    const coinCountDisplay = document.getElementById('coin-count');
    export const interactionPrompt = document.getElementById('interaction-prompt');
    export const promptItemName = document.getElementById('prompt-item-name');
    export const promptActionText = document.getElementById('prompt-action-text');
    const miningProgressTrack = document.getElementById('mining-progress-track');
    export const miningProgressBar = document.getElementById('mining-progress-bar');
    export const innerGridEl = document.getElementById('inner-grid');
    export const hotbarGridEl = document.getElementById('hotbar-grid');
    export const chestGridEl = document.getElementById('chest-grid');
    export const chestPlayerGridEl = document.getElementById('chest-player-grid');

    export function updateCoinHUD() {
      coinCountDisplay.textContent = state.playerCoins;
    }

    export const itemCatalog = {
      bow: {
        name: 'Hunting Bow',
        icon: '🏹',
        geometry: new THREE.TorusGeometry(0.35, 0.02, 8, 16, Math.PI),
        material: new THREE.MeshStandardMaterial({ color: 0x8b4513, roughness: 0.7 })
      },
      arrows: {
        name: 'Arrow Bundle',
        icon: '📦',
        geometry: new THREE.CylinderGeometry(0.08, 0.08, 0.4, 8),
        material: new THREE.MeshStandardMaterial({ color: 0x5c4033, roughness: 0.6 })
      },
      helicopter: {
        name: 'Personal Helicopter',
        icon: '🚁',
        geometry: new THREE.BoxGeometry(0.4, 0.3, 0.6),
        material: new THREE.MeshStandardMaterial({ color: 0x007bff, metalness: 0.8, roughness: 0.2 })
      },
      car: {
        name: 'Sports Car',
        icon: '🏎️',
        geometry: new THREE.BoxGeometry(0.35, 0.2, 0.65),
        material: new THREE.MeshStandardMaterial({ color: 0xef233c, metalness: 0.8, roughness: 0.2 })
      },
      plane: {
        name: 'Propeller Plane',
        icon: '✈️',
        geometry: new THREE.ConeGeometry(0.18, 0.7, 8),
        material: new THREE.MeshStandardMaterial({ color: 0xe8e8e8, metalness: 0.6, roughness: 0.3 })
      },
      jet: {
        name: 'Jet Fighter',
        icon: '🛩️',
        geometry: new THREE.ConeGeometry(0.15, 0.75, 6),
        material: new THREE.MeshStandardMaterial({ color: 0x2b2f36, metalness: 0.85, roughness: 0.15 })
      },
      fuel_tank: {
        name: 'Fuel Tank',
        icon: '⛽',
        geometry: new THREE.CylinderGeometry(0.2, 0.2, 0.5, 12),
        material: new THREE.MeshStandardMaterial({ color: 0xdd2222, roughness: 0.3 })
      },
      iron_sword: {
        name: 'Iron Sword',
        icon: '⚔️',
        geometry: new THREE.BoxGeometry(0.08, 0.7, 0.03),
        material: new THREE.MeshStandardMaterial({ color: 0xd0d7de, metalness: 0.9, roughness: 0.2 })
      },
      stone_sword: {
        name: 'Stone Sword',
        icon: '🗡️',
        geometry: new THREE.BoxGeometry(0.1, 0.65, 0.04),
        material: new THREE.MeshStandardMaterial({ color: 0x707070, roughness: 0.8, metalness: 0.1 })
      },
      diamonds: {
        name: 'Diamonds',
        icon: '💎',
        geometry: new THREE.OctahedronGeometry(0.25),
        material: new THREE.MeshStandardMaterial({ color: 0x00ffff, roughness: 0.1, metalness: 0.1 })
      },
      potion: {
        name: 'Health Potion',
        icon: '🧪',
        geometry: new THREE.SphereGeometry(0.2, 16, 16),
        material: new THREE.MeshStandardMaterial({ color: 0xff0055, roughness: 0.2 })
      },
      fossil: {
        name: 'Fossil',
        icon: '🦴',
        geometry: new THREE.DodecahedronGeometry(0.22),
        material: new THREE.MeshStandardMaterial({ color: 0xc2a878, roughness: 0.9, metalness: 0.05 })
      },
      vavite: {
        name: 'Vavite',
        icon: '🔮',
        geometry: new THREE.IcosahedronGeometry(0.24),
        material: new THREE.MeshStandardMaterial({ color: 0x8a2be2, roughness: 0.25, metalness: 0.6, emissive: 0x4b0082, emissiveIntensity: 0.5 })
      },
      iron_ore: {
        name: 'Iron Ore',
        icon: '🪨',
        geometry: new THREE.DodecahedronGeometry(0.24),
        material: new THREE.MeshStandardMaterial({ color: 0x8a6d5b, roughness: 0.85, metalness: 0.35 })
      },
      base_kit: {
        name: 'Base Kit',
        icon: '🏠',
        geometry: new THREE.BoxGeometry(0.3, 0.3, 0.3),
        material: new THREE.MeshStandardMaterial({ color: 0xa0522d, roughness: 0.8 })
      }
    };

    export function spawnWorldItem(name, icon, geometry, material, position, isCoinStack = false) {
      const mesh = new THREE.Mesh(geometry, material);
      mesh.position.copy(position);
      mesh.userData = {
        isItem: true,
        isCoin: isCoinStack,
        name: name,
        icon: icon,
        geometry: geometry,
        material: material,
        baseY: position.y,
        velocityY: 0,
        hasGravity: true,
        bobOffset: Math.random() * Math.PI * 2
      };
      scene.add(mesh);
      itemsInWorld.push(mesh);
      interactableObjects.push(mesh);
      return mesh;
    }

    export function spawnCoinAt(position) {
      const coinGeom = new THREE.CylinderGeometry(0.22, 0.22, 0.06, 16);
      const coinMat = new THREE.MeshStandardMaterial({ color: 0xffd700, metalness: 0.9, roughness: 0.2 });
      const coinMesh = spawnWorldItem('Coins (+10)', '🪙', coinGeom, coinMat, position, true);
      coinMesh.rotation.x = Math.PI / 2;
      coinMesh.userData.velocityY = 3.5 + Math.random() * 2.0;
      return coinMesh;
    }

    function spawnRandomCoin() {
      const activeCoins = itemsInWorld.filter(item => item.userData && item.userData.isCoin).length;
      if (activeCoins >= 3) return;

      const radius = 12;
      const angle = Math.random() * Math.PI * 2;
      const dist = 2.0 + Math.random() * radius;
      const x = Math.cos(angle) * dist;
      const z = Math.sin(angle) * dist;
      let spawnY = 3.5;

      if (state.loadedModel) {
        const floorRay = new THREE.Raycaster(new THREE.Vector3(x, 50, z), new THREE.Vector3(0, -1, 0));
        const hits = floorRay.intersectObject(state.loadedModel, true);
        if (hits.length > 0) spawnY = hits[0].point.y + 3.5;
      }

      spawnCoinAt(new THREE.Vector3(x, spawnY, z));
    }

    spawnCoinAt(new THREE.Vector3(0, 2.5, -3.5));
    setInterval(spawnRandomCoin, 15000);

    // Simple placeholder counter+sign, shown only until the matching shop.glb /
    // shop2.glb has finished downloading (or if it fails to load at all).
    function buildPlaceholderShopStand(signColor) {
      const group = new THREE.Group();
      const counter = new THREE.Mesh(
        new THREE.BoxGeometry(2, 0.8, 1),
        new THREE.MeshStandardMaterial({ color: 0x8b5a2b, roughness: 0.8 })
      );
      counter.position.y = 0.4;
      group.add(counter);

      const sign = new THREE.Mesh(
        new THREE.BoxGeometry(1.6, 0.5, 0.1),
        new THREE.MeshStandardMaterial({ color: signColor, metalness: 0.5 })
      );
      sign.position.set(0, 1.5, 0);
      group.add(sign);

      return group;
    }

    export function createFallbackShopStand(position) {
      const shopGroup = state.shopModelTemplate ? state.shopModelTemplate.clone(true) : buildPlaceholderShopStand(0xffd700);
      shopGroup.position.copy(position);
      if (state.shopModelTemplate) shopGroup.position.y += state.shopModelGroundOffset; // sit flush on the surface regardless of the model's pivot

      shopGroup.traverse((child) => {
        child.userData.isShop = true;
        child.userData.name = 'Item Shop';
      });

      scene.add(shopGroup);
      interactableObjects.push(shopGroup);
      return shopGroup;
    }

    export function removeFallbackShop() {
      if (state.fallbackShop) {
        scene.remove(state.fallbackShop);
        state.fallbackShop.traverse((child) => {
          const idx = interactableObjects.indexOf(child);
          if (idx > -1) interactableObjects.splice(idx, 1);
        });
        const idx = interactableObjects.indexOf(state.fallbackShop);
        if (idx > -1) interactableObjects.splice(idx, 1);
        state.fallbackShop = null;
      }
    }

    // Shop2 sells vehicles (planes/jets) and base kits - separate mesh (shop2.glb)
    // so it reads as a distinct stand from the main item shop.
    export function createFallbackShop2Stand(position) {
      const shopGroup = state.shop2ModelTemplate ? state.shop2ModelTemplate.clone(true) : buildPlaceholderShopStand(0x00e5ff);
      shopGroup.position.copy(position);
      if (state.shop2ModelTemplate) shopGroup.position.y += state.shop2ModelGroundOffset;

      shopGroup.traverse((child) => {
        child.userData.isShop2 = true;
        child.userData.name = 'Vehicle & Base Depot';
      });

      scene.add(shopGroup);
      interactableObjects.push(shopGroup);
      return shopGroup;
    }

    export function removeFallbackShop2() {
      if (state.fallbackShop2) {
        scene.remove(state.fallbackShop2);
        state.fallbackShop2.traverse((child) => {
          const idx = interactableObjects.indexOf(child);
          if (idx > -1) interactableObjects.splice(idx, 1);
        });
        const idx = interactableObjects.indexOf(state.fallbackShop2);
        if (idx > -1) interactableObjects.splice(idx, 1);
        state.fallbackShop2 = null;
      }
    }


    // A glowing crystal deposit used when the loaded map has no "vavite"-named
    // object of its own, so mining vavite always works out of the box.
    function createFallbackVaviteDeposit(position) {
      const template = itemCatalog.vavite;
      const depositGroup = new THREE.Group();

      const crystal = new THREE.Mesh(template.geometry, template.material);
      crystal.scale.set(2.4, 2.4, 2.4);
      crystal.position.y = 0.55;
      depositGroup.add(crystal);

      const glow = new THREE.PointLight(0x8a2be2, 1.2, 4);
      glow.position.y = 0.55;
      depositGroup.add(glow);

      depositGroup.position.copy(position);
      depositGroup.traverse((child) => {
        child.userData.isVavite = true;
        child.userData.isMineable = true;
        child.userData.mineralKey = 'vavite';
        child.userData.name = 'Vavite Deposit';
      });

      scene.add(depositGroup);
      interactableObjects.push(depositGroup);
      return depositGroup;
    }

    function removeFallbackVavite() {
      if (state.fallbackVavite) {
        scene.remove(state.fallbackVavite);
        state.fallbackVavite.traverse((child) => {
          const idx = interactableObjects.indexOf(child);
          if (idx > -1) interactableObjects.splice(idx, 1);
        });
        const idx = interactableObjects.indexOf(state.fallbackVavite);
        if (idx > -1) interactableObjects.splice(idx, 1);
        state.fallbackVavite = null;
      }
    }

    // A rocky ore deposit used when the loaded map has no "iron"-named object
    // of its own, so mining iron ore always works out of the box.
    function createFallbackIronOreDeposit(position) {
      const template = itemCatalog.iron_ore;
      const depositGroup = new THREE.Group();

      const rock = new THREE.Mesh(template.geometry, template.material);
      rock.scale.set(2.6, 2.2, 2.6);
      rock.position.y = 0.5;
      rock.rotation.set(0.4, 0.6, 0.1);
      depositGroup.add(rock);

      depositGroup.position.copy(position);
      depositGroup.traverse((child) => {
        child.userData.isIronOre = true;
        child.userData.isMineable = true;
        child.userData.mineralKey = 'iron_ore';
        child.userData.name = 'Iron Ore Deposit';
      });

      scene.add(depositGroup);
      interactableObjects.push(depositGroup);
      return depositGroup;
    }

    function removeFallbackIronOre() {
      if (state.fallbackIronOre) {
        scene.remove(state.fallbackIronOre);
        state.fallbackIronOre.traverse((child) => {
          const idx = interactableObjects.indexOf(child);
          if (idx > -1) interactableObjects.splice(idx, 1);
        });
        const idx = interactableObjects.indexOf(state.fallbackIronOre);
        if (idx > -1) interactableObjects.splice(idx, 1);
        state.fallbackIronOre = null;
      }
    }

    export function setupShopFromGLTF(gltfScene) {
      for (let i = interactableObjects.length - 1; i >= 0; i--) {
        if (interactableObjects[i].userData && (interactableObjects[i].userData.isGLBShop || interactableObjects[i].userData.isGLBShop2)) {
          interactableObjects.splice(i, 1);
        }
      }

      removeFallbackShop();
      removeFallbackShop2();

      let foundShop = false;
      let foundShop2 = false;
      // Checked first/specifically so a mesh literally named "shop2" (or a close
      // variant) becomes the vehicle/base depot instead of falling into the
      // generic "shop" bucket below - substring-matching "shop" would otherwise
      // catch "shop2" too since it contains the word "shop".
      const shop2Keywords = ['shop2', 'shop_2', 'shop-2', 'shop 2'];
      const shopKeywords = ['shop', 'store', 'vendor', 'merchant', 'counter', 'stand', 'market', 'kiosk', 'stall', 'npc', 'seller'];

      gltfScene.traverse((child) => {
        if (!child.name) return;
        const lowerName = child.name.toLowerCase();

        if (shop2Keywords.some(keyword => lowerName.includes(keyword))) {
          foundShop2 = true;
          const displayName = child.name.replace(/_/g, ' ') || 'Vehicle & Base Depot';
          child.traverse((subChild) => {
            subChild.userData.isShop2 = true;
            subChild.userData.isGLBShop2 = true;
            subChild.userData.name = displayName;
            if (!interactableObjects.includes(subChild)) interactableObjects.push(subChild);
          });
          return;
        }

        const isShopNode = shopKeywords.some(keyword => lowerName.includes(keyword));
        if (isShopNode) {
          foundShop = true;
          const displayName = child.name.replace(/_/g, ' ') || 'Item Shop';
          child.traverse((subChild) => {
            subChild.userData.isShop = true;
            subChild.userData.isGLBShop = true;
            subChild.userData.name = displayName;
            if (!interactableObjects.includes(subChild)) interactableObjects.push(subChild);
          });
        }
      });

      if (!foundShop) {
        state.fallbackShop = createFallbackShopStand(new THREE.Vector3(3, 0, -3));
      }
      if (!foundShop2) {
        state.fallbackShop2 = createFallbackShop2Stand(new THREE.Vector3(-3, 0, -3));
      }
    }

    // --- GAS STATION DETECTION ---
    export function setupGasStationsFromGLTF(gltfScene) {
      for (let i = interactableObjects.length - 1; i >= 0; i--) {
        if (interactableObjects[i].userData && interactableObjects[i].userData.isGasStation) {
          interactableObjects.splice(i, 1);
        }
      }

      gltfScene.traverse((child) => {
        if (child.name && child.name.toLowerCase().includes('gas')) {
          const displayName = 'Gas Station (10 🪙 + 2 🦴)';
          child.traverse((subChild) => {
            subChild.userData.isGasStation = true;
            subChild.userData.name = displayName;
            if (!interactableObjects.includes(subChild)) interactableObjects.push(subChild);
          });
          child.userData.isGasStation = true;
          child.userData.name = displayName;
          if (!interactableObjects.includes(child)) interactableObjects.push(child);
        }
      });
    }

    // --- FOSSIL DETECTION (mine & pick up) ---
    export function setupFossilsFromGLTF(gltfScene) {
      for (let i = interactableObjects.length - 1; i >= 0; i--) {
        if (interactableObjects[i].userData && interactableObjects[i].userData.isFossil) {
          interactableObjects.splice(i, 1);
        }
      }

      gltfScene.traverse((child) => {
        if (child.name && child.name.toLowerCase().includes('fossil')) {
          const displayName = child.name.replace(/_/g, ' ') || 'Fossil';
          child.traverse((subChild) => {
            subChild.userData.isFossil = true;
            subChild.userData.isMineable = true;
            subChild.userData.mineralKey = 'fossil';
            subChild.userData.name = displayName;
            subChild.userData.fossilRoot = child;
            if (!interactableObjects.includes(subChild)) interactableObjects.push(subChild);
          });
          child.userData.isFossil = true;
          child.userData.isMineable = true;
          child.userData.mineralKey = 'fossil';
          child.userData.name = displayName;
          child.userData.fossilRoot = child;
          if (!interactableObjects.includes(child)) interactableObjects.push(child);
        }
      });
    }

    // --- VAVITE DETECTION (mine & pick up) ---
    export function setupVaviteFromGLTF(gltfScene) {
      for (let i = interactableObjects.length - 1; i >= 0; i--) {
        if (interactableObjects[i].userData && interactableObjects[i].userData.isVavite) {
          interactableObjects.splice(i, 1);
        }
      }

      removeFallbackVavite();

      let foundVavite = false;
      gltfScene.traverse((child) => {
        if (child.name && child.name.toLowerCase().includes('vavite')) {
          foundVavite = true;
          const displayName = child.name.replace(/_/g, ' ') || 'Vavite';
          child.traverse((subChild) => {
            subChild.userData.isVavite = true;
            subChild.userData.isMineable = true;
            subChild.userData.mineralKey = 'vavite';
            subChild.userData.name = displayName;
            if (!interactableObjects.includes(subChild)) interactableObjects.push(subChild);
          });
          child.userData.isVavite = true;
          child.userData.isMineable = true;
          child.userData.mineralKey = 'vavite';
          child.userData.name = displayName;
          if (!interactableObjects.includes(child)) interactableObjects.push(child);
        }
      });

      // No vavite object in the map itself - drop in a fallback deposit so
      // mining vavite always works, regardless of the loaded model.
      if (!foundVavite) {
        state.fallbackVavite = createFallbackVaviteDeposit(new THREE.Vector3(-3, 0, -3));
      }
    }

    // --- IRON ORE DETECTION (mine & pick up) ---
    export function setupIronOreFromGLTF(gltfScene) {
      for (let i = interactableObjects.length - 1; i >= 0; i--) {
        if (interactableObjects[i].userData && interactableObjects[i].userData.isIronOre) {
          interactableObjects.splice(i, 1);
        }
      }

      removeFallbackIronOre();

      let foundIronOre = false;
      gltfScene.traverse((child) => {
        if (child.name && child.name.toLowerCase().includes('iron')) {
          foundIronOre = true;
          const displayName = child.name.replace(/_/g, ' ') || 'Iron Ore';
          child.traverse((subChild) => {
            subChild.userData.isIronOre = true;
            subChild.userData.isMineable = true;
            subChild.userData.mineralKey = 'iron_ore';
            subChild.userData.name = displayName;
            if (!interactableObjects.includes(subChild)) interactableObjects.push(subChild);
          });
          child.userData.isIronOre = true;
          child.userData.isMineable = true;
          child.userData.mineralKey = 'iron_ore';
          child.userData.name = displayName;
          if (!interactableObjects.includes(child)) interactableObjects.push(child);
        }
      });

      // No iron-named object in the map itself - drop in a fallback deposit so
      // mining iron ore always works, regardless of the loaded model.
      if (!foundIronOre) {
        state.fallbackIronOre = createFallbackIronOreDeposit(new THREE.Vector3(3, 0, 3));
      }
    }

    // --- MINING (fossils, vavite, ...) ---
    export function startMining(depositMesh) {
      state.miningTarget = depositMesh;
      state.miningStartTime = performance.now();
      if (miningProgressBar) miningProgressBar.style.width = '0%';
      if (miningProgressTrack) miningProgressTrack.style.display = 'block';
    }

    export function cancelMining() {
      state.miningTarget = null;
      if (miningProgressBar) miningProgressBar.style.width = '0%';
      if (miningProgressTrack) miningProgressTrack.style.display = 'none';
    }

    export function mineDeposit(depositMesh) {
      const mineralKey = (depositMesh.userData && depositMesh.userData.mineralKey) || 'fossil';
      const template = itemCatalog[mineralKey];
      if (!template) {
        cancelMining();
        return;
      }

      // Always use the generic item name/icon (not the GLTF node's own name) so that
      // everything mined stacks together into one inventory slot instead of scattering
      // across separate slots.
      const added = addItemToInventory({
        name: template.name,
        icon: template.icon,
        geometry: template.geometry,
        material: template.material
      });

      if (!added) {
        cancelMining(); // Inventory full - deposit stays put, try again after freeing a slot
        return;
      }

      // Deposits are never removed, so they can be mined again and again.
      // If the player is still holding E while looking at it, loop straight into
      // another mining cycle instead of requiring a fresh key press each time.
      if (state.isEKeyDown && state.hoveredObject === depositMesh) {
        startMining(depositMesh);
      } else {
        cancelMining();
      }
    }

