import * as THREE from 'three';
import { state } from './state.js';
import { controls, fileInput, fileNameDisplay, loadingStatus, playerHeight, playerRadius, scene } from './core.js';
import { clearEnemies, detectSpawnersInModel } from './enemies.js';
import { baseURL, loader } from './models.js';
import { createFallbackShop2Stand, createFallbackShopStand, setupFossilsFromGLTF, setupGasStationsFromGLTF, setupIronOreFromGLTF, setupShopFromGLTF, setupVaviteFromGLTF } from './resources.js';
import { loadWorldsFromStorage, migrateLegacySaveIfNeeded } from './world-save.js';

    // 5. GLB MAP LOADING & PORTALS

    function extractTargetFileName(objectName) {
      let name = objectName.toLowerCase().trim().replace(/^portal[_-]?/i, '').replace(/[_-]?portal$/i, '').trim();
      if (name && !name.endsWith('.glb') && !name.endsWith('.gltf')) name += '.glb';
      if (!name || name === '.glb') return (state.currentLoadedFileName === 'model.glb') ? 'island.glb' : 'model.glb';
      return name;
    }

    function detectPortalsInModel(gltfScene) {
      state.portalObjects = [];
      gltfScene.traverse((child) => {
        if (child.name && child.name.toLowerCase().includes('portal')) {
          child.userData.targetFile = extractTargetFileName(child.name);
          state.portalObjects.push(child);
        }
      });
    }

    export function checkPortalCollisions() {
      if (state.isTeleporting || state.portalObjects.length === 0) return;

      const playerPos = controls.getObject().position;
      const playerBox = new THREE.Box3(
        new THREE.Vector3(playerPos.x - playerRadius, playerPos.y - playerHeight, playerPos.z - playerRadius),
        new THREE.Vector3(playerPos.x + playerRadius, playerPos.y + playerHeight, playerPos.z + playerRadius)
      );
      const portalBox = new THREE.Box3();

      for (const portal of state.portalObjects) {
        portalBox.setFromObject(portal);
        if (portalBox.intersectsBox(playerBox)) {
          triggerPortalTeleport(portal.userData.targetFile || 'island.glb');
          break;
        }
      }
    }

    function triggerPortalTeleport(targetFileName) {
      state.isTeleporting = true;
      loadModelFromURL(baseURL + targetFileName, targetFileName, (success) => {
        if (!success) loadModelFromURL(targetFileName, targetFileName);
        setTimeout(() => { state.isTeleporting = false; }, 2000);
      });
    }

    export function loadModelFromURL(url, displayName, onComplete) {
      loadingStatus.textContent = `⏳ Loading ${displayName}...`;
      loadingStatus.style.color = '#ffd700';

      loader.load(
        url,
        (gltf) => {
          if (state.loadedModel) scene.remove(state.loadedModel);
          state.loadedModel = gltf.scene;
          scene.add(state.loadedModel);

          state.currentLoadedFileName = displayName;
          clearEnemies();

          detectSpawnersInModel(state.loadedModel);
          setupShopFromGLTF(state.loadedModel);
          setupGasStationsFromGLTF(state.loadedModel);
          setupFossilsFromGLTF(state.loadedModel);
          setupVaviteFromGLTF(state.loadedModel);
          setupIronOreFromGLTF(state.loadedModel);
          detectPortalsInModel(state.loadedModel);

          const box = new THREE.Box3().setFromObject(state.loadedModel);
          const center = box.getCenter(new THREE.Vector3());
          const spawnY = Math.max(box.min.y + playerHeight + 0.5, playerHeight + 0.5);

          if (state.portalObjects.length > 0) {
            const portalCenter = new THREE.Box3().setFromObject(state.portalObjects[0]).getCenter(new THREE.Vector3());
            controls.getObject().position.set(portalCenter.x + 2, spawnY, portalCenter.z + 2);
          } else {
            controls.getObject().position.set(center.x, spawnY, center.z);
          }

          loadingStatus.textContent = `✅ Loaded: ${displayName}`;
          loadingStatus.style.color = '#28a745';
          if (fileNameDisplay) fileNameDisplay.textContent = `Current Map: ${displayName}`;
          if (onComplete) onComplete(true);
        },
        (xhr) => {
          if (xhr.lengthComputable) {
            loadingStatus.textContent = `⏳ Loading ${displayName} (${Math.round((xhr.loaded / xhr.total) * 100)}%)...`;
          }
        },
        (error) => {
          console.error('Error loading model:', error);
          loadingStatus.textContent = `⚠️ Failed to load: ${displayName}`;
          loadingStatus.style.color = '#ff4d4d';
          if (!state.fallbackShop) state.fallbackShop = createFallbackShopStand(new THREE.Vector3(3, 0, -3));
          if (!state.fallbackShop2) state.fallbackShop2 = createFallbackShop2Stand(new THREE.Vector3(-3, 0, -3));
          if (onComplete) onComplete(false);
        }
      );
    }

    loadModelFromURL(baseURL + 'model.glb', 'model.glb');

    // Load the state.worlds list now that state.currentLoadedFileName exists (used as a
    // fallback map name when migrating an old single-slot save).
    loadWorldsFromStorage();
    migrateLegacySaveIfNeeded();

    fileInput.addEventListener('change', (event) => {
      const file = event.target.files[0];
      if (!file) return;

      fileNameDisplay.textContent = `Local File: ${file.name}`;
      loadModelFromURL(URL.createObjectURL(file), file.name);
    });

