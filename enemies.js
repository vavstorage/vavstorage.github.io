import * as THREE from 'three';
import { state } from './state.js';
import { scene } from './core.js';
import { enemyHelicopters } from './helicopters.js';

    // --- ENEMY & SPAWNER SYSTEM ---
    export const enemies = [];
    const maxEnemiesOnIsland = 2;
    const enemySpawnIntervalMs = 10000;

    export function clearEnemies() {
      for (let i = enemies.length - 1; i >= 0; i--) scene.remove(enemies[i].mesh);
      enemies.length = 0;
      for (let i = enemyHelicopters.length - 1; i >= 0; i--) scene.remove(enemyHelicopters[i].mesh);
      enemyHelicopters.length = 0;
    }

    export function detectSpawnersInModel(gltfScene) {
      state.spawnerMeshes = [];
      gltfScene.traverse((child) => {
        if (child.name && child.name.toLowerCase().includes('spawner')) {
          if (child.isMesh) {
            if (!state.spawnerMeshes.includes(child)) state.spawnerMeshes.push(child);
          } else {
            child.traverse((sub) => {
              if (sub.isMesh && !state.spawnerMeshes.includes(sub)) {
                state.spawnerMeshes.push(sub);
              }
            });
          }
        }
      });
    }

    function spawnEnemy() {
      const hasSpawners = state.spawnerMeshes.length > 0;
      if ((!hasSpawners && !state.currentLoadedFileName.toLowerCase().includes('island')) || enemies.length >= maxEnemiesOnIsland) return;

      let spawnX = 0, spawnZ = 0, spawnY = 0.8;
      let targetSpawner = null;

      if (hasSpawners) {
        targetSpawner = state.spawnerMeshes[Math.floor(Math.random() * state.spawnerMeshes.length)];
        const box = new THREE.Box3().setFromObject(targetSpawner);
        
        const minX = Math.min(box.min.x, box.max.x);
        const maxX = Math.max(box.min.x, box.max.x);
        const minZ = Math.min(box.min.z, box.max.z);
        const maxZ = Math.max(box.min.z, box.max.z);

        spawnX = THREE.MathUtils.lerp(minX, maxX, Math.random());
        spawnZ = THREE.MathUtils.lerp(minZ, maxZ, Math.random());

        const ray = new THREE.Raycaster(new THREE.Vector3(spawnX, box.max.y + 5, spawnZ), new THREE.Vector3(0, -1, 0));
        const hits = ray.intersectObject(targetSpawner, true);
        if (hits.length > 0) {
          spawnY = hits[0].point.y + 0.05;
          spawnX = hits[0].point.x;
          spawnZ = hits[0].point.z;
        } else {
          spawnY = box.max.y + 0.05;
        }
      } else {
        const radius = 16;
        const angle = Math.random() * Math.PI * 2;
        const dist = 6.0 + Math.random() * radius;
        spawnX = Math.cos(angle) * dist;
        spawnZ = Math.sin(angle) * dist;

        if (state.loadedModel) {
          const floorRay = new THREE.Raycaster(new THREE.Vector3(spawnX, 50, spawnZ), new THREE.Vector3(0, -1, 0));
          const hits = floorRay.intersectObject(state.loadedModel, true);
          if (hits.length > 0) spawnY = hits[0].point.y + 0.05;
        }
      }

      let enemyGroup;
      if (state.enemyModelTemplate) {
        enemyGroup = state.enemyModelTemplate.clone(true);
        enemyGroup.traverse((child) => {
          if (child.isMesh && child.material) {
            child.material = Array.isArray(child.material)
              ? child.material.map(m => m.clone())
              : child.material.clone();
          }
        });
        enemyGroup.position.set(spawnX, spawnY, spawnZ);
      } else {
        enemyGroup = new THREE.Group();
        const bodyMesh = new THREE.Mesh(
          new THREE.CapsuleGeometry(0.35, 0.8, 4, 8),
          new THREE.MeshStandardMaterial({ color: 0xd93838, roughness: 0.4 })
        );
        bodyMesh.position.y = 0.75;
        enemyGroup.add(bodyMesh);

        const eyeMat = new THREE.MeshBasicMaterial({ color: 0xffff00 });
        const leftEye = new THREE.Mesh(new THREE.SphereGeometry(0.08, 8, 8), eyeMat);
        leftEye.position.set(-0.15, 1.0, -0.3);
        const rightEye = new THREE.Mesh(new THREE.SphereGeometry(0.08, 8, 8), eyeMat);
        rightEye.position.set(0.15, 1.0, -0.3);
        enemyGroup.add(leftEye, rightEye);

        enemyGroup.position.set(spawnX, spawnY, spawnZ);
      }

      scene.add(enemyGroup);
      enemies.push({
        mesh: enemyGroup,
        health: 30,
        maxHealth: 30,
        speed: 2.5,
        lastAttackTime: 0,
        animOffset: Math.random() * 10,
        baseY: spawnY,
        spawnerMesh: targetSpawner
      });
    }

    setInterval(spawnEnemy, enemySpawnIntervalMs);

    // --- INVENTORY & ITEMS DATA ---
