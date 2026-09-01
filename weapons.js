import * as THREE from 'three';
import { state } from './state.js';
import { camera, controls, scene } from './core.js';
import { enemies } from './enemies.js';
import { createAirplaneMesh, createHelicopterMesh, enemyHelicopters } from './helicopters.js';
import { inventory } from './inventory.js';
import { velocity } from './movement.js';
import { addXP, updateArrowHUD } from './player.js';
import { spawnCoinAt, useSelectedItem } from './resources.js';

    // --- VIEWMODEL SYSTEM ---
    export const viewmodelGroup = new THREE.Group();
    camera.add(viewmodelGroup);

    export const viewmodelBasePos = new THREE.Vector3(0.28, -0.22, -0.45);
    export const viewmodelBaseRot = new THREE.Euler(-0.15, 0.25, -0.1);

    viewmodelGroup.position.copy(viewmodelBasePos);
    viewmodelGroup.rotation.copy(viewmodelBaseRot);

    export const swingSpeed = 12.0;

    // --- ARROW MESH CREATOR & PROJECTILES SYSTEM ---
    export const playerProjectiles = [];

    function createArrowMesh() {
      const arrowGroup = new THREE.Group();

      // Shaft along Z
      const shaftGeo = new THREE.CylinderGeometry(0.012, 0.012, 0.65, 8);
      const shaftMat = new THREE.MeshStandardMaterial({ color: 0x5c4033, roughness: 0.7 });
      const shaft = new THREE.Mesh(shaftGeo, shaftMat);
      shaft.rotation.x = Math.PI / 2;
      arrowGroup.add(shaft);

      // Tip (Arrowhead facing forward +Z)
      const tipGeo = new THREE.ConeGeometry(0.035, 0.12, 6);
      const tipMat = new THREE.MeshStandardMaterial({ color: 0x808080, metalness: 0.8, roughness: 0.3 });
      const tip = new THREE.Mesh(tipGeo, tipMat);
      tip.rotation.x = Math.PI / 2;
      tip.position.z = 0.38;
      arrowGroup.add(tip);

      // Fletching (Feathers at rear -Z)
      const featherGeo = new THREE.BoxGeometry(0.004, 0.08, 0.12);
      const featherMat = new THREE.MeshStandardMaterial({ color: 0xdddddd });
      
      const feather1 = new THREE.Mesh(featherGeo, featherMat);
      feather1.position.z = -0.28;
      arrowGroup.add(feather1);

      const feather2 = new THREE.Mesh(featherGeo, featherMat);
      feather2.rotation.z = Math.PI / 2;
      feather2.position.z = -0.28;
      arrowGroup.add(feather2);

      return arrowGroup;
    }

    function fireArrow() {
      if (state.playerArrows <= 0) {
        alert("Out of arrows! Buy more in the shop or use an Arrow Bundle.");
        return;
      }

      state.playerArrows--;
      updateArrowHUD();
      updateHeldWeaponModel();

      const arrowMesh = createArrowMesh();
      const camPos = camera.position.clone();
      const camDir = new THREE.Vector3();
      camera.getWorldDirection(camDir);

      arrowMesh.position.copy(camPos).add(camDir.clone().multiplyScalar(0.6));
      
      const speed = 42.0;
      const velocity = camDir.clone().multiplyScalar(speed);

      arrowMesh.lookAt(arrowMesh.position.clone().add(velocity));

      scene.add(arrowMesh);
      playerProjectiles.push({
        mesh: arrowMesh,
        velocity: velocity,
        life: 5.0,
        stuck: false
      });
    }

    function triggerAttack() {
      const item = inventory[state.selectedSlot];

      if (item && item.name.includes('Bow')) {
        if (!state.isSwinging) {
          state.isSwinging = true;
          state.swingProgress = 0;
          fireArrow();
        }
        return;
      }

      if (!state.isSwinging) {
        state.isSwinging = true;
        state.swingProgress = 0;

        // Hit Ground Enemies
        for (let i = enemies.length - 1; i >= 0; i--) {
          const enemy = enemies[i];
          const dist = camera.position.distanceTo(enemy.mesh.position);

          if (dist < 3.5) {
            const dirToEnemy = enemy.mesh.position.clone().sub(camera.position).normalize();
            const camDir = new THREE.Vector3();
            camera.getWorldDirection(camDir);

            if (camDir.dot(dirToEnemy) > 0.4) {
              let damage = 10;
              if (item) {
                if (item.name.includes('Iron')) damage = 25;
                else if (item.name.includes('Stone')) damage = 18;
                else if (item.name.includes('Diamond')) damage = 35;
                else if (item.name.includes('Car')) damage = 30;
              }

              enemy.health -= damage;

              enemy.mesh.traverse((child) => {
                if (child.isMesh && child.material) {
                  const mats = Array.isArray(child.material) ? child.material : [child.material];
                  mats.forEach((mat) => {
                    if (mat && mat.color) {
                      const orig = mat.color.getHex();
                      mat.color.setHex(0xffffff);
                      setTimeout(() => { if (mat && mat.color) mat.color.setHex(orig); }, 120);
                    }
                  });
                }
              });

              const knockback = dirToEnemy.clone().multiplyScalar(1.2);
              enemy.mesh.position.add(knockback);

              if (enemy.health <= 0) {
                spawnCoinAt(enemy.mesh.position.clone().add(new THREE.Vector3(0, 0.3, 0)));
                addXP(25);
                scene.remove(enemy.mesh);
                enemies.splice(i, 1);
              }
            }
          }
        }

        // Hit Enemy Helicopters
        for (let i = enemyHelicopters.length - 1; i >= 0; i--) {
          const heli = enemyHelicopters[i];
          const dist = camera.position.distanceTo(heli.mesh.position);

          if (dist < 10.0) {
            const dirToHeli = heli.mesh.position.clone().sub(camera.position).normalize();
            const camDir = new THREE.Vector3();
            camera.getWorldDirection(camDir);

            if (camDir.dot(dirToHeli) > 0.35) {
              let damage = 20;
              if (item) {
                if (item.name.includes('Iron')) damage = 35;
                else if (item.name.includes('Stone')) damage = 25;
                else if (item.name.includes('Diamond')) damage = 50;
              }

              heli.health -= damage;

              heli.mesh.traverse((child) => {
                if (child.isMesh && child.material) {
                  const mats = Array.isArray(child.material) ? child.material : [child.material];
                  mats.forEach((mat) => {
                    if (mat && mat.color) {
                      const orig = mat.color.getHex();
                      mat.color.setHex(0xff0000);
                      setTimeout(() => { if (mat && mat.color) mat.color.setHex(orig); }, 120);
                    }
                  });
                }
              });

              if (heli.health <= 0) {
                spawnCoinAt(heli.mesh.position.clone());
                spawnCoinAt(heli.mesh.position.clone().add(new THREE.Vector3(0.5, 0, 0)));
                addXP(50);
                scene.remove(heli.mesh);
                enemyHelicopters.splice(i, 1);
              }
            }
          }
        }
      }
    }

    export function updateHeldWeaponModel() {
      while (viewmodelGroup.children.length > 0) {
        viewmodelGroup.remove(viewmodelGroup.children[0]);
      }
      state.heldMesh = null;

      const currentItem = inventory[state.selectedSlot];
      if (!currentItem) return;

      if (currentItem.name.includes('Bow')) {
        const bowGroup = new THREE.Group();

        const arcGeo = new THREE.TorusGeometry(0.35, 0.02, 8, 16, Math.PI);
        const arcMat = new THREE.MeshStandardMaterial({ color: 0x8b4513, roughness: 0.7 });
        const arcMesh = new THREE.Mesh(arcGeo, arcMat);
        arcMesh.rotation.y = Math.PI / 2;
        bowGroup.add(arcMesh);

        const stringGeo = new THREE.BufferGeometry().setFromPoints([
          new THREE.Vector3(0, 0.35, 0),
          new THREE.Vector3(0, -0.35, 0)
        ]);
        const stringMat = new THREE.LineBasicMaterial({ color: 0xeeeeee });
        const stringMesh = new THREE.Line(stringGeo, stringMat);
        bowGroup.add(stringMesh);

        if (state.playerArrows > 0) {
          const previewArrow = createArrowMesh();
          previewArrow.scale.set(0.7, 0.7, 0.7);
          previewArrow.rotation.y = Math.PI;
          previewArrow.position.set(0, 0, -0.05);
          bowGroup.add(previewArrow);
        }

        bowGroup.rotation.y = Math.PI / 5;
        viewmodelGroup.add(bowGroup);
        state.heldMesh = bowGroup;
        return;
      }

      if (currentItem.name.includes('Helicopter')) {
        const heliData = createHelicopterMesh();
        const heliMesh = heliData.mesh;
        heliMesh.scale.set(0.25, 0.25, 0.25);
        heliMesh.position.set(0.2, -0.25, -0.45);
        heliMesh.rotation.y = -Math.PI / 4;
        viewmodelGroup.add(heliMesh);
        state.heldMesh = heliMesh;
        return;
      }

      if (currentItem.name.includes('Plane') || currentItem.name.includes('Jet')) {
        const planeData = createAirplaneMesh(currentItem.name.includes('Jet'));
        const planeMesh = planeData.mesh;
        planeMesh.scale.set(0.22, 0.22, 0.22);
        planeMesh.position.set(0.2, -0.25, -0.45);
        planeMesh.rotation.y = -Math.PI / 4;
        viewmodelGroup.add(planeMesh);
        state.heldMesh = planeMesh;
        return;
      }

      const mesh = new THREE.Mesh(currentItem.geometry.clone(), currentItem.material.clone());
      mesh.scale.set(0.7, 0.7, 0.7);

      if (currentItem.name.includes('Sword')) {
        mesh.rotation.x = Math.PI / 6;
        mesh.rotation.z = -Math.PI / 12;
      }

      viewmodelGroup.add(mesh);
      state.heldMesh = mesh;
    }

    window.addEventListener('mousedown', (e) => {
      if (controls.isLocked && !state.isShopOpen && !state.isInventoryOpen && !state.isChestOpen) {
        if (e.button === 0) triggerAttack();
        if (e.button === 2) useSelectedItem();
      }
    });
    window.addEventListener('contextmenu', e => e.preventDefault());

