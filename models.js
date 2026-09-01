import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { state } from './state.js';
import { scene } from './core.js';
import { remotePlayers } from './multiplayer.js';
import { createFallbackShop2Stand, createFallbackShopStand, removeFallbackShop, removeFallbackShop2 } from './resources.js';
import { createRemotePlayerMesh } from './terminal.js';

    // --- ENEMY GLB TEMPLATE ---
    export const baseURL = 'https://vavstorage.github.io/';
    export const loader = new GLTFLoader();

    loader.load(
      baseURL + 'enemy.glb',
      (gltf) => {
        const container = new THREE.Group();
        const model = gltf.scene;
        model.rotation.x = Math.PI; 

        let box = new THREE.Box3().setFromObject(model);
        let size = box.getSize(new THREE.Vector3());
        if (size.y > 0) {
          const scale = 1.5 / size.y;
          model.scale.set(scale, scale, scale);
        }

        box.setFromObject(model);
        model.position.y = -box.min.y;

        container.add(model);
        state.enemyModelTemplate = container;
      },
      undefined,
      (err) => console.warn('Could not load enemy.glb', err)
    );

    // --- PLAYER GLB TEMPLATE (used for remote multiplayer players) ---

    loader.load(
      baseURL + 'player.glb',
      (gltf) => {
        const container = new THREE.Group();
        const model = gltf.scene;

        let box = new THREE.Box3().setFromObject(model);
        let size = box.getSize(new THREE.Vector3());
        if (size.y > 0) {
          const scale = 1.5 / size.y;
          model.scale.set(scale, scale, scale);
        }

        box.setFromObject(model);
        model.position.y = -box.min.y;

        container.add(model);
        state.playerModelTemplate = container;

        // Upgrade any remote players already created with the placeholder capsule.
        Object.keys(remotePlayers).forEach((peerId) => {
          const group = remotePlayers[peerId];
          const pos = group.position.clone();
          const rotY = group.rotation.y;
          scene.remove(group);
          delete remotePlayers[peerId];
          const upgraded = createRemotePlayerMesh(peerId);
          upgraded.position.copy(pos);
          upgraded.rotation.y = rotY;
        });
      },
      undefined,
      (err) => console.warn('Could not load player.glb', err)
    );

    // --- BASE GLB TEMPLATE (placeable structure) ---

    loader.load(
      baseURL + 'base.glb',
      (gltf) => {
        const model = gltf.scene;
        const box = new THREE.Box3().setFromObject(model);
        state.baseModelGroundOffset = -box.min.y;
        state.baseModelTemplate = model;
      },
      undefined,
      (err) => console.warn('Could not load base.glb', err)
    );

    // --- SHOP GLB TEMPLATES (used for the fallback stands when the loaded map
    // has no "shop"/"shop2"-named mesh of its own) ---

    loader.load(
      baseURL + 'shop.glb',
      (gltf) => {
        const model = gltf.scene;
        const box = new THREE.Box3().setFromObject(model);
        state.shopModelGroundOffset = -box.min.y;
        state.shopModelTemplate = model;

        // A placeholder stand may already be standing in for this model if the
        // map finished loading before shop.glb did - swap it for the real mesh.
        if (state.fallbackShop) {
          const pos = state.fallbackShop.position.clone();
          removeFallbackShop();
          state.fallbackShop = createFallbackShopStand(pos);
        }
      },
      undefined,
      (err) => console.warn('Could not load shop.glb', err)
    );

    loader.load(
      baseURL + 'shop2.glb',
      (gltf) => {
        const model = gltf.scene;
        const box = new THREE.Box3().setFromObject(model);
        state.shop2ModelGroundOffset = -box.min.y;
        state.shop2ModelTemplate = model;

        if (state.fallbackShop2) {
          const pos = state.fallbackShop2.position.clone();
          removeFallbackShop2();
          state.fallbackShop2 = createFallbackShop2Stand(pos);
        }
      },
      undefined,
      (err) => console.warn('Could not load shop2.glb', err)
    );

