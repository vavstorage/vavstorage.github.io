import * as THREE from 'three';
import { state } from './state.js';
import { scene } from './core.js';
import { direction } from './movement.js';

    // --- PROCEDURAL HELICOPTER CREATOR ---
    export function createHelicopterMesh() {
      const heliGroup = new THREE.Group();

      const bodyGeo = new THREE.BoxGeometry(1.2, 1.0, 2.4);
      const bodyMat = new THREE.MeshStandardMaterial({ color: 0x223344, metalness: 0.7, roughness: 0.3 });
      const body = new THREE.Mesh(bodyGeo, bodyMat);
      body.position.y = 0.5;
      heliGroup.add(body);

      const glassGeo = new THREE.BoxGeometry(1.0, 0.65, 0.8);
      const glassMat = new THREE.MeshStandardMaterial({ color: 0x00e5ff, transparent: true, opacity: 0.65, metalness: 0.9 });
      const glass = new THREE.Mesh(glassGeo, glassMat);
      glass.position.set(0, 0.65, -0.9);
      heliGroup.add(glass);

      const tailGeo = new THREE.BoxGeometry(0.3, 0.3, 2.2);
      const tailMat = new THREE.MeshStandardMaterial({ color: 0x111c24 });
      const tail = new THREE.Mesh(tailGeo, tailMat);
      tail.position.set(0, 0.6, 2.0);
      heliGroup.add(tail);

      const mainRotorGroup = new THREE.Group();
      mainRotorGroup.name = 'mainRotor';
      mainRotorGroup.position.set(0, 1.25, 0);

      const hubGeo = new THREE.CylinderGeometry(0.15, 0.15, 0.25, 8);
      const hubMat = new THREE.MeshStandardMaterial({ color: 0x111111 });
      const hub = new THREE.Mesh(hubGeo, hubMat);
      mainRotorGroup.add(hub);

      const bladeGeo = new THREE.BoxGeometry(4.2, 0.04, 0.22);
      const bladeMat = new THREE.MeshStandardMaterial({ color: 0x111111, metalness: 0.8 });
      const blade1 = new THREE.Mesh(bladeGeo, bladeMat);
      const blade2 = new THREE.Mesh(bladeGeo, bladeMat);
      blade2.rotation.y = Math.PI / 2;
      mainRotorGroup.add(blade1, blade2);

      heliGroup.add(mainRotorGroup);

      const tailRotorGroup = new THREE.Group();
      tailRotorGroup.name = 'tailRotor';
      tailRotorGroup.position.set(0.2, 0.75, 3.0);
      const tailBladeGeo = new THREE.BoxGeometry(0.04, 0.8, 0.1);
      const tailBlade = new THREE.Mesh(tailBladeGeo, bladeMat);
      tailRotorGroup.add(tailBlade);
      heliGroup.add(tailRotorGroup);

      const skidMat = new THREE.MeshStandardMaterial({ color: 0x555555, metalness: 0.8 });
      const skid1 = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 2.2), skidMat);
      skid1.position.set(-0.6, -0.15, 0);
      const skid2 = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 2.2), skidMat);
      skid2.position.set(0.6, -0.15, 0);
      heliGroup.add(skid1, skid2);

      const leg1 = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.35, 0.08), skidMat);
      leg1.position.set(-0.6, 0.1, 0.5);
      const leg2 = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.35, 0.08), skidMat);
      leg2.position.set(0.6, 0.1, 0.5);
      const leg3 = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.35, 0.08), skidMat);
      leg3.position.set(-0.6, 0.1, -0.5);
      const leg4 = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.35, 0.08), skidMat);
      leg4.position.set(0.6, 0.1, -0.5);
      heliGroup.add(leg1, leg2, leg3, leg4);

      return { mesh: heliGroup, mainRotor: mainRotorGroup, tailRotor: tailRotorGroup };
    }

    export function createAirplaneMesh(isJet) {
      const planeGroup = new THREE.Group();

      const fuselageColor = isJet ? 0x2b2f36 : 0xe8e8e8;
      const accentColor = isJet ? 0xff3b3b : 0xcc2222;

      const bodyGeo = new THREE.CylinderGeometry(0.28, 0.22, 2.6, 10);
      const bodyMat = new THREE.MeshStandardMaterial({ color: fuselageColor, metalness: 0.7, roughness: 0.25 });
      const body = new THREE.Mesh(bodyGeo, bodyMat);
      body.rotation.x = Math.PI / 2;
      body.position.y = 0.5;
      planeGroup.add(body);

      const noseGeo = new THREE.ConeGeometry(0.28, 0.6, 10);
      const nose = new THREE.Mesh(noseGeo, bodyMat);
      nose.rotation.x = -Math.PI / 2;
      nose.position.set(0, 0.5, -1.6);
      planeGroup.add(nose);

      const glassGeo = new THREE.SphereGeometry(0.22, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2);
      const glassMat = new THREE.MeshStandardMaterial({ color: 0x00e5ff, transparent: true, opacity: 0.65, metalness: 0.9 });
      const glass = new THREE.Mesh(glassGeo, glassMat);
      glass.position.set(0, 0.75, -0.5);
      planeGroup.add(glass);

      const wingGeo = new THREE.BoxGeometry(isJet ? 3.6 : 4.2, 0.08, isJet ? 0.7 : 0.85);
      const wingMat = new THREE.MeshStandardMaterial({ color: accentColor, metalness: 0.6, roughness: 0.3 });
      const wing = new THREE.Mesh(wingGeo, wingMat);
      wing.position.set(0, 0.45, 0.1);
      if (isJet) wing.rotation.y = Math.PI / 10;
      planeGroup.add(wing);

      const tailWingGeo = new THREE.BoxGeometry(1.3, 0.06, 0.4);
      const tailWing = new THREE.Mesh(tailWingGeo, wingMat);
      tailWing.position.set(0, 0.5, 1.55);
      planeGroup.add(tailWing);

      const finGeo = new THREE.BoxGeometry(0.06, 0.55, 0.55);
      const fin = new THREE.Mesh(finGeo, wingMat);
      fin.position.set(0, 0.85, 1.55);
      planeGroup.add(fin);

      let propeller = null;
      if (!isJet) {
        const propGroup = new THREE.Group();
        propGroup.name = 'propeller';
        propGroup.position.set(0, 0.5, -1.9);

        const hubGeo = new THREE.CylinderGeometry(0.08, 0.08, 0.15, 8);
        const hubMat = new THREE.MeshStandardMaterial({ color: 0x111111 });
        const hub = new THREE.Mesh(hubGeo, hubMat);
        hub.rotation.x = Math.PI / 2;
        propGroup.add(hub);

        const bladeGeo = new THREE.BoxGeometry(0.1, 1.1, 0.03);
        const bladeMat = new THREE.MeshStandardMaterial({ color: 0x1a1a1a });
        const blade1 = new THREE.Mesh(bladeGeo, bladeMat);
        const blade2 = new THREE.Mesh(bladeGeo, bladeMat);
        blade2.rotation.z = Math.PI / 2;
        propGroup.add(blade1, blade2);

        planeGroup.add(propGroup);
        propeller = propGroup;
      } else {
        const flameGeo = new THREE.ConeGeometry(0.16, 0.5, 8);
        const flameMat = new THREE.MeshStandardMaterial({ color: 0xff7700, emissive: 0xff4400, emissiveIntensity: 0.8 });
        const flame = new THREE.Mesh(flameGeo, flameMat);
        flame.rotation.x = Math.PI / 2;
        flame.position.set(0, 0.5, 1.95);
        flame.name = 'jetFlame';
        planeGroup.add(flame);
      }

      const gearMat = new THREE.MeshStandardMaterial({ color: 0x555555, metalness: 0.8 });
      const gear1 = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.3, 8), gearMat);
      gear1.position.set(-0.5, 0.05, 0.2);
      const gear2 = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.3, 8), gearMat);
      gear2.position.set(0.5, 0.05, 0.2);
      planeGroup.add(gear1, gear2);

      return { mesh: planeGroup, propeller: propeller };
    }

    // --- AI SKY PATROL HELICOPTERS SYSTEM ---
    export const enemyHelicopters = [];
    export const heliProjectiles = [];
    const maxHelicoptersInSky = 2;
    const heliSpawnIntervalMs = 12000;
    export const HELI_PATROL_RADIUS = 10.0;

    function getSpawnerPosition() {
      if (state.spawnerMeshes.length > 0) {
        const randomSpawner = state.spawnerMeshes[Math.floor(Math.random() * state.spawnerMeshes.length)];
        const box = new THREE.Box3().setFromObject(randomSpawner);
        const center = new THREE.Vector3();
        box.getCenter(center);
        return center;
      }
      return new THREE.Vector3(0, 0, 0);
    }

    export function getRandomPointInRadius(centerPos, radius) {
      const angle = Math.random() * Math.PI * 2;
      const distance = Math.random() * radius;
      return new THREE.Vector3(
        centerPos.x + Math.cos(angle) * distance,
        centerPos.y,
        centerPos.z + Math.sin(angle) * distance
      );
    }

    // Helicopters ramp up from weaker (0.4x) at level 5 to full strength (1.0x) at level 10+
    function getHeliDifficultyScale() {
      if (state.playerLevel >= 10) return 1.0;
      if (state.playerLevel <= 5) return 0.4;
      return 0.4 + (state.playerLevel - 5) * (0.6 / 5);
    }

    function spawnEnemyHelicopter() {
      if (state.playerLevel < 5) return;
      if (enemyHelicopters.length >= maxHelicoptersInSky) return;

      const spawnerPos = getSpawnerPosition();
      const spawnPoint = getRandomPointInRadius(spawnerPos, HELI_PATROL_RADIUS);
      const spawnAltitude = Math.max(spawnerPos.y + 14.0, 14.0) + Math.random() * 6.0;

      const heliObj = createHelicopterMesh();
      heliObj.mesh.position.set(spawnPoint.x, spawnAltitude, spawnPoint.z);
      scene.add(heliObj.mesh);

      const firstPatrolPoint = getRandomPointInRadius(spawnerPos, HELI_PATROL_RADIUS);

      const scale = getHeliDifficultyScale();
      const scaledHealth = Math.round(75 * scale);
      const scaledDamage = Math.max(1, Math.round(12 * scale));
      const scaledCooldown = Math.round(1500 / scale);

      enemyHelicopters.push({
        mesh: heliObj.mesh,
        mainRotor: heliObj.mainRotor,
        tailRotor: heliObj.tailRotor,
        health: scaledHealth,
        maxHealth: scaledHealth,
        damage: scaledDamage,
        speed: 6.5,
        spawnerCenter: spawnerPos.clone(),
        targetWaypoint: new THREE.Vector3(firstPatrolPoint.x, spawnAltitude, firstPatrolPoint.z),
        lastShootTime: 0,
        shootCooldown: scaledCooldown,
        altitude: spawnAltitude
      });
    }

    setInterval(spawnEnemyHelicopter, heliSpawnIntervalMs);

    export function heliShootLaser(heli, targetPos) {
      const laserGeo = new THREE.SphereGeometry(0.15, 8, 8);
      const laserMat = new THREE.MeshBasicMaterial({ color: 0xff2200 });
      const laserMesh = new THREE.Mesh(laserGeo, laserMat);

      const startPos = heli.mesh.position.clone().add(new THREE.Vector3(0, -0.6, 0));
      laserMesh.position.copy(startPos);

      const aimSpread = new THREE.Vector3((Math.random() - 0.5) * 1.5, -0.3, (Math.random() - 0.5) * 1.5);
      const aimTarget = targetPos.clone().add(aimSpread);
      const fireDir = aimTarget.sub(startPos).normalize();

      scene.add(laserMesh);
      heliProjectiles.push({
        mesh: laserMesh,
        direction: fireDir,
        speed: 24,
        life: 2.5,
        damage: heli.damage || 12
      });
    }

