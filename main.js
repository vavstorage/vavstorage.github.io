import * as THREE from 'three';
import { state } from './state.js';
import { airspeedCountDisplay, airspeedHud, camera, controls, maxStepHeight, playerHeight, playerRadius, renderer, scene } from './core.js';
import { enemies } from './enemies.js';
import { HELI_PATROL_RADIUS, enemyHelicopters, getRandomPointInRadius, heliProjectiles, heliShootLaser } from './helicopters.js';
import { interactableObjects, inventory, itemsInWorld, placedBases } from './inventory.js';
import { checkPortalCollisions } from './map-loading.js';
import { airDamping, direction, fallMultiplier, flightDir, gravity, groundDamping, moveSpeed, planeAccel, planeDrag, planeStallSpeedFactor, planeTurnRate, raycasterDown, raycasterHorizontal, raycasterInteract, raycasterShelter, raycasterUp, terminalVelocity, velocity } from './movement.js';
import { addXP, respawnPlayer, takeDamage, updateFuelHUD } from './player.js';
import { DIAMOND_MINE_DURATION_MS, MINE_DURATION_MS, cancelMining, interactionPrompt, mineDeposit, miningProgressBar, promptActionText, promptItemName, spawnCoinAt } from './resources.js';
import { broadcastTransform, cheatSpeedLevels } from './terminal.js';
import { playerProjectiles, swingSpeed, viewmodelBasePos, viewmodelBaseRot, viewmodelGroup } from './weapons.js';
import { showToast } from './world-save.js';
import './core.js';
import './player.js';
import './multiplayer.js';
import './terminal.js';
import './models.js';
import './weapons.js';
import './resources.js';
import './movement.js';
import './helicopters.js';
import './enemies.js';
import './inventory.js';
import './base-building.js';
import './world-save.js';
import './lighting.js';
import './map-loading.js';

    // 6. Main Game Loop

   // Looks straight down from the player's feet and checks whether the surface
   // directly underneath belongs to a mesh named (or nested under a mesh named)
   // "airstrip" or "road" - that's the only ground a plane/jet is allowed to lift off from.
   function isOnTakeoffSurface(targets) {
     if (!targets || targets.length === 0) return false;
     raycasterDown.set(controls.getObject().position, new THREE.Vector3(0, -1, 0));
     const hits = raycasterDown.intersectObjects(targets, true);
     if (hits.length === 0) return false;
     const hit = hits[0];
     if (hit.distance > playerHeight + maxStepHeight) return false; // not actually standing on it

     const nameMatches = (n) => !!n && (n.toLowerCase().includes('airstrip') || n.toLowerCase().includes('road'));
     if (nameMatches(hit.object.name)) return true;
     let found = false;
     hit.object.traverseAncestors((ancestor) => {
       if (nameMatches(ancestor.name)) found = true;
     });
     return found;
   }

   function checkWallCollision(startPos, moveVector, targets) {
  const dist = moveVector.length();
  if (dist < 0.0001 || targets.length === 0) return false;
  
  const moveDir = moveVector.clone().normalize();
  const heights = [
    startPos.y - playerHeight + maxStepHeight + 0.1,
    startPos.y,
    startPos.y + playerHeight - 0.2
  ];

  // Check direct movement direction and side angles to account for player radius
  const angles = [0, Math.PI / 4, -Math.PI / 4];

  for (const height of heights) {
    const origin = startPos.clone();
    origin.y = height;

    for (const angle of angles) {
      const rayDir = moveDir.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), angle);
      raycasterHorizontal.set(origin, rayDir);
      const hits = raycasterHorizontal.intersectObjects(targets, true);
      
      if (hits.length > 0 && hits[0].distance < playerRadius + dist) {
        return true;
      }
    }
  }
  return false;
}

    // Returns true if a placed base sits between fromPos and toPos, so it blocks
    // sight and gunfire the same way it blocks movement - this is what makes a
    // base usable as real shelter, not just a storage box.
    function isPathBlockedByBase(fromPos, toPos) {
      if (placedBases.length === 0) return false;
      const dir = toPos.clone().sub(fromPos);
      const dist = dir.length();
      if (dist < 0.001) return false;
      dir.normalize();
      raycasterShelter.set(fromPos, dir);
      raycasterShelter.far = dist;
      const hits = raycasterShelter.intersectObjects(placedBases, true);
      return hits.length > 0 && hits[0].distance < dist;
    }

    function animate() {
      requestAnimationFrame(animate);
      const time = performance.now();

      if (controls.isLocked && time - state.lastBroadcast >= 50) {
        broadcastTransform();
        state.lastBroadcast = time;
      }

      if (controls.isLocked && !state.isShopOpen && !state.isInventoryOpen && !state.isChestOpen) {
        const delta = Math.min((time - state.prevTime) / 1000, 0.1);

        const currentItem = inventory[state.selectedSlot];
        const isDrivingCar = currentItem && currentItem.name.includes('Car');
        const isFlyingHelicopter = currentItem && currentItem.name.includes('Helicopter');
        const isFlyingPlane = currentItem && currentItem.name.includes('Plane');
        const isFlyingJet = currentItem && currentItem.name.includes('Jet');
        const isFlyingAircraft = isFlyingHelicopter || isFlyingPlane || isFlyingJet;
        const isMoving = (state.moveForward || state.moveBackward || state.moveLeft || state.moveRight);

        if (state.isSwinging) {
          state.swingProgress += delta * swingSpeed;
          const swingAngle = Math.sin(state.swingProgress) * 0.35;
          viewmodelGroup.position.z = viewmodelBasePos.z + Math.sin(state.swingProgress) * 0.08;
          viewmodelGroup.rotation.x = viewmodelBaseRot.x - swingAngle;

          if (state.swingProgress >= Math.PI) {
            state.isSwinging = false;
            state.swingProgress = 0;
            viewmodelGroup.position.copy(viewmodelBasePos);
            viewmodelGroup.rotation.copy(viewmodelBaseRot);
          }
        }

        for (let i = 0; i < itemsInWorld.length; i++) {
          const item = itemsInWorld[i];
          if (item.userData.hasGravity) {
            if (item.userData.velocityY === undefined) item.userData.velocityY = 0;

            item.userData.velocityY -= 18.0 * delta;
            item.position.y += item.userData.velocityY * delta;

            let groundY = 0.2;
            if (state.loadedModel) {
              const ray = new THREE.Raycaster(
                new THREE.Vector3(item.position.x, item.position.y + 1.0, item.position.z),
                new THREE.Vector3(0, -1, 0)
              );
              const hits = ray.intersectObject(state.loadedModel, true);
              if (hits.length > 0) groundY = hits[0].point.y + 0.2;
            }

            if (item.position.y <= groundY) {
              item.position.y = groundY;
              item.userData.velocityY = 0;
              item.userData.hasGravity = false;
            }
          }

          if (item.userData.isCoin) {
            item.rotation.z += delta * 3.0;
          } else {
            item.rotation.y += delta * 1.5;
          }
        }

        let currentMoveSpeed = moveSpeed;
        let isStalling = false;

        if (isFlyingHelicopter) {
          if (state.playerFuel > 0) {
            currentMoveSpeed = moveSpeed * 2.5;

            if (state.isSpacePressed) {
              velocity.y = Math.min(velocity.y + 35.0 * delta, 12.0);
              state.playerFuel = Math.max(0, state.playerFuel - 3.0 * delta);
              updateFuelHUD();
            } else {
              if (velocity.y < -3.0) velocity.y = -3.0;
            }

            if (isMoving) {
              state.playerFuel = Math.max(0, state.playerFuel - 1.5 * delta);
              updateFuelHUD();
            }
          } else {
            currentMoveSpeed = moveSpeed;
          }
        } else if (isFlyingPlane || isFlyingJet) {
          const maxAirSpeed = moveSpeed * (isFlyingJet ? 6.0 : 4.5);
          const boostSpeed = moveSpeed * (isFlyingJet ? 8.0 : 6.0);
          const stallSpeed = maxAirSpeed * planeStallSpeedFactor;

          if (state.playerFuel > 0) {
            // Throttle: W builds airspeed toward top speed (Space = afterburner/full power),
            // S cuts power back toward stall speed, and with no input airspeed bleeds off
            // like real drag - none of this snaps instantly, it eases in like momentum should.
            let targetSpeed = state.planeSpeed;
            if (state.isSpacePressed) targetSpeed = boostSpeed;
            else if (state.moveForward) targetSpeed = maxAirSpeed;
            else if (state.moveBackward) targetSpeed = stallSpeed * 0.5;

            const accelRate = state.isSpacePressed ? planeAccel * 1.4 : planeAccel;
            state.planeSpeed += (targetSpeed - state.planeSpeed) * Math.min(1, accelRate * delta);
            if (!state.moveForward && !state.moveBackward && !state.isSpacePressed) {
              state.planeSpeed -= state.planeSpeed * planeDrag * delta;
            }
            state.planeSpeed = Math.max(state.planeSpeed, 0);

            isStalling = state.planeSpeed < stallSpeed;

            // Rudder turn: A/D yaw the aircraft directly and bank into the turn, instead of
            // strafing sideways the way the helicopter and car do.
            if (state.moveLeft) controls.getObject().rotation.y += planeTurnRate * delta;
            if (state.moveRight) controls.getObject().rotation.y -= planeTurnRate * delta;
            const targetBank = state.moveLeft ? 0.6 : state.moveRight ? -0.6 : 0;
            state.planeBankVisual += (targetBank - state.planeBankVisual) * Math.min(1, 6 * delta);

            // Thrust follows exactly where you're looking (yaw + pitch): look up to climb,
            // look down to dive - real flight, not a Space-to-hover quadcopter.
            camera.getWorldDirection(flightDir);
            const climbSpeed = flightDir.y * state.planeSpeed;
            velocity.y = climbSpeed;

            // Wheels-down aircraft can only leave the ground from an airstrip or road -
            // everywhere else they're pinned to the surface (still free to taxi around).
            if (state.isGrounded && velocity.y > 0) {
              const surfaceTargets = state.loadedModel ? [state.loadedModel, ...placedBases] : [...placedBases];
              if (surfaceTargets.length > 0 && !isOnTakeoffSurface(surfaceTargets)) {
                velocity.y = 0;
                if (time - state.lastNoRunwayWarning > 2000) {
                  showToast('Need an airstrip or road to take off');
                  state.lastNoRunwayWarning = time;
                }
              }
            }

            if (isStalling) {
              // Not enough airspeed to generate lift - the nose drops and gravity wins.
              const stallFactor = 1 - (state.planeSpeed / stallSpeed);
              velocity.y -= gravity * stallFactor * delta * 4;
            }

            const horizontalSpeed = Math.sqrt(Math.max(state.planeSpeed * state.planeSpeed - climbSpeed * climbSpeed, 0));
            velocity.z = -horizontalSpeed;
            velocity.x = 0;
            currentMoveSpeed = 0; // forward motion is fully driven by state.planeSpeed/heading above, not by WASD strafing

            const throttleFraction = state.planeSpeed / maxAirSpeed;
            state.playerFuel = Math.max(0, state.playerFuel - (isFlyingJet ? 2.2 : 1.3) * throttleFraction * delta - (state.isSpacePressed ? (isFlyingJet ? 2.2 : 1.3) * delta : 0));
            updateFuelHUD();
          } else {
            currentMoveSpeed = moveSpeed;
            state.planeSpeed = Math.max(0, state.planeSpeed - state.planeSpeed * 2.0 * delta);
            // Dead stick, no lift left - the aircraft actually falls instead of hovering.
            velocity.y -= gravity * delta;
          }
        } else if (isDrivingCar) {
          if (state.playerFuel > 0) {
            currentMoveSpeed = moveSpeed * 3.0;
            if (isMoving) {
              state.playerFuel = Math.max(0, state.playerFuel - 2.0 * delta); 
              updateFuelHUD();
            }
          } else {
            currentMoveSpeed = moveSpeed; 
          }
        }

        if (!isFlyingPlane && !isFlyingJet) {
          // Not flying a plane right now - let any leftover airspeed/bank wind back down
          // so re-equipping later starts from a stop instead of resuming mid-flight speed.
          state.planeSpeed = Math.max(0, state.planeSpeed - state.planeSpeed * 3.0 * delta);
          state.planeBankVisual += (0 - state.planeBankVisual) * Math.min(1, 6 * delta);
        }

        if (state.heldMesh && isFlyingHelicopter) {
          state.heldMesh.traverse((child) => {
            if (child.name === 'mainRotor') child.rotation.y += delta * 30.0;
            if (child.name === 'tailRotor') child.rotation.x += delta * 35.0;
          });
        }

        if (state.heldMesh && isFlyingPlane) {
          state.heldMesh.traverse((child) => {
            if (child.name === 'propeller') child.rotation.z += delta * 45.0;
          });
        }

        if (state.heldMesh && isFlyingJet) {
          state.heldMesh.traverse((child) => {
            if (child.name === 'jetFlame') {
              const flicker = 0.85 + Math.random() * 0.3;
              child.scale.set(flicker, flicker, 1.2 + Math.random() * 0.6);
            }
          });
        }

        if (state.heldMesh && (isFlyingPlane || isFlyingJet)) {
          state.heldMesh.rotation.z = state.planeBankVisual;
        }

        if (airspeedHud) {
          if (isFlyingPlane || isFlyingJet) {
            airspeedHud.style.display = 'block';
            airspeedCountDisplay.textContent = Math.round(state.planeSpeed * 10);
            airspeedHud.classList.toggle('stalling', isStalling);
          } else {
            airspeedHud.style.display = 'none';
            airspeedHud.classList.remove('stalling');
          }
        }

        const damping = (isFlyingPlane || isFlyingJet) ? 0 : (state.isGrounded ? groundDamping : airDamping);
        velocity.x -= velocity.x * damping * delta;
        velocity.z -= velocity.z * damping * delta;

        if (state.cheatFlyMode && !isFlyingAircraft) {
          const cheatFlySpeed = 12.0;
          if (state.isSpacePressed) velocity.y = cheatFlySpeed;
          else if (state.isShiftPressed) velocity.y = -cheatFlySpeed;
          else velocity.y = 0;
        } else if (!isFlyingAircraft) {
          if (velocity.y < 0) velocity.y -= gravity * fallMultiplier * delta;
          else velocity.y -= gravity * delta;
        }

        velocity.y = Math.max(velocity.y, terminalVelocity);

        direction.z = Number(state.moveForward) - Number(state.moveBackward);
        direction.x = Number(state.moveRight) - Number(state.moveLeft);
        direction.normalize();

        const accel = (state.isGrounded ? currentMoveSpeed : currentMoveSpeed * 0.3) * cheatSpeedLevels[state.cheatSpeedIndex];
        if (state.moveForward || state.moveBackward) velocity.z -= direction.z * accel * delta * 10;
        if (state.moveLeft || state.moveRight) velocity.x -= direction.x * accel * delta * 10;

        
        // --- UPDATED SOLID COLLISION CODE ---
const targets = state.loadedModel ? [state.loadedModel, ...placedBases] : [...placedBases];
const oldPos = controls.getObject().position.clone();

if (targets.length > 0) {
  const currentPos = oldPos.clone();
  
  // Resolve X-axis movement
  controls.moveRight(-velocity.x * delta);
  const posAfterX = controls.getObject().position.clone();
  const moveXVec = new THREE.Vector3(posAfterX.x - currentPos.x, 0, posAfterX.z - currentPos.z);
  
  if (checkWallCollision(currentPos, moveXVec, targets)) {
    controls.getObject().position.x = currentPos.x;
    controls.getObject().position.z = currentPos.z;
    velocity.x = 0;
  }

  // Resolve Z-axis movement
  const posBeforeZ = controls.getObject().position.clone();
  controls.moveForward(-velocity.z * delta);
  const posAfterZ = controls.getObject().position.clone();
  const moveZVec = new THREE.Vector3(posAfterZ.x - posBeforeZ.x, 0, posAfterZ.z - posBeforeZ.z);

  if (checkWallCollision(posBeforeZ, moveZVec, targets)) {
    controls.getObject().position.x = posBeforeZ.x;
    controls.getObject().position.z = posBeforeZ.z;
    velocity.z = 0;
  }
} else {
  controls.moveRight(-velocity.x * delta);
  controls.moveForward(-velocity.z * delta);
}

        // Ceiling collision: stop upward movement if a mesh is close overhead
        if (targets.length > 0 && velocity.y > 0) {
          const moveUp = velocity.y * delta;
          raycasterUp.set(controls.getObject().position, new THREE.Vector3(0, 1, 0));
          const ceilingHits = raycasterUp.intersectObjects(targets, true);
          if (ceilingHits.length > 0 && ceilingHits[0].distance < moveUp + 0.1) {
            velocity.y = 0;
          }
        }

        controls.getObject().position.y += velocity.y * delta;
        state.isGrounded = false;

       if (targets.length > 0) {
          raycasterDown.set(controls.getObject().position, new THREE.Vector3(0, -1, 0));
          const surfaceHits = raycasterDown.intersectObjects(targets, true);

          // Solid ground/floor collision so the player lands on and can't fall through meshes
          const allowLanding = true; 

          if (allowLanding && surfaceHits.length > 0) {
            const hit = surfaceHits[0];
            if (hit.distance <= playerHeight + maxStepHeight && velocity.y <= 0) {
              let isBounceMesh = false;
              hit.object.traverseAncestors((ancestor) => {
                if (ancestor.name && ancestor.name.toLowerCase().includes('bounce')) {
                  isBounceMesh = true;
                }
              });
              if (hit.object.name && hit.object.name.toLowerCase().includes('bounce')) {
                isBounceMesh = true;
              }

              if (isBounceMesh) {
                velocity.y = Math.sqrt(2 * gravity * 10);
                state.canJump = false;
                state.isGrounded = false;
              } else {
                controls.getObject().position.y = THREE.MathUtils.lerp(controls.getObject().position.y, hit.point.y + playerHeight, 0.5);
                velocity.y = 0;
                state.canJump = true;
                state.isGrounded = true;
              }
            }
          }
        } else {
          if (controls.getObject().position.y <= playerHeight) {
            controls.getObject().position.y = playerHeight;
            velocity.y = 0;
            state.canJump = true;
            state.isGrounded = true;
          }
        }

        if (controls.getObject().position.y < -30) respawnPlayer();

        const isMovingGrounded = isMoving && state.isGrounded;

        if (isMovingGrounded) {
          state.walkAnimTimer += delta * 14;
        }

        // --- ARROW PROJECTILES PHYSICS & COLLISION ---
        for (let i = playerProjectiles.length - 1; i >= 0; i--) {
          const proj = playerProjectiles[i];

          if (proj.stuck) {
            proj.life -= delta;
            if (proj.life <= 0) {
              scene.remove(proj.mesh);
              playerProjectiles.splice(i, 1);
            }
            continue;
          }

          proj.life -= delta;
          if (proj.life <= 0) {
            scene.remove(proj.mesh);
            playerProjectiles.splice(i, 1);
            continue;
          }

          proj.velocity.y -= 12.0 * delta;

          const oldArrowPos = proj.mesh.position.clone();
          const moveStep = proj.velocity.clone().multiplyScalar(delta);
          proj.mesh.position.add(moveStep);

          const travelTarget = proj.mesh.position.clone().add(proj.velocity);
          proj.mesh.lookAt(travelTarget);

          let hitSomething = false;

          for (let e = enemies.length - 1; e >= 0; e--) {
            const enemy = enemies[e];
            const dist = proj.mesh.position.distanceTo(enemy.mesh.position.clone().add(new THREE.Vector3(0, 0.75, 0)));

            if (dist < 1.0) {
              enemy.health -= 35;
              hitSomething = true;

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

              if (enemy.health <= 0) {
                spawnCoinAt(enemy.mesh.position.clone().add(new THREE.Vector3(0, 0.3, 0)));
                addXP(25);
                scene.remove(enemy.mesh);
                enemies.splice(e, 1);
              }
              break;
            }
          }

          if (!hitSomething) {
            for (let h = enemyHelicopters.length - 1; h >= 0; h--) {
              const heli = enemyHelicopters[h];
              const dist = proj.mesh.position.distanceTo(heli.mesh.position);

              if (dist < 2.2) {
                heli.health -= 45;
                hitSomething = true;

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
                  enemyHelicopters.splice(h, 1);
                }
                break;
              }
            }
          }

          if (!hitSomething && state.loadedModel) {
            const stepLen = moveStep.length();
            const ray = new THREE.Raycaster(oldArrowPos, moveStep.clone().normalize(), 0, stepLen + 0.1);
            const hits = ray.intersectObject(state.loadedModel, true);

            if (hits.length > 0) {
              proj.stuck = true;
              proj.life = 6.0;
              proj.mesh.position.copy(hits[0].point);
              hitSomething = true;
            }
          }

          if (hitSomething && !proj.stuck) {
            scene.remove(proj.mesh);
            playerProjectiles.splice(i, 1);
          }
        }

        // --- ENEMY HELICOPTER SKY PATROL & AI LOGIC ---
        const playerPos = controls.getObject().position;

        enemyHelicopters.forEach((heli) => {
          heli.mainRotor.rotation.y += delta * 25.0;
          heli.tailRotor.rotation.x += delta * 30.0;

          const distToPlayer = heli.mesh.position.distanceTo(playerPos);
          let targetDest = heli.targetWaypoint;

          if (distToPlayer < 35.0) {
            targetDest = new THREE.Vector3(playerPos.x, heli.altitude, playerPos.z);

            if (time - heli.lastShootTime > heli.shootCooldown) {
              heli.lastShootTime = time;
              // A placed base blocks the helicopter's shot the same way it blocks the player's view.
              if (!isPathBlockedByBase(heli.mesh.position, playerPos)) {
                heliShootLaser(heli, playerPos);
              }
            }
          } else {
            if (heli.mesh.position.distanceTo(heli.targetWaypoint) < 3.0) {
              const nextPoint = getRandomPointInRadius(heli.spawnerCenter, HELI_PATROL_RADIUS);
              heli.targetWaypoint.set(nextPoint.x, heli.altitude, nextPoint.z);
            }
          }

          const moveDir = targetDest.clone().sub(heli.mesh.position);
          moveDir.y = 0; 

          if (moveDir.length() > 0.5) {
            moveDir.normalize();
            heli.mesh.position.addScaledVector(moveDir, heli.speed * delta);

            const lookTarget = heli.mesh.position.clone().add(moveDir);
            heli.mesh.lookAt(lookTarget);
            heli.mesh.rotation.x = 0.12; 
          } else {
            heli.mesh.rotation.x = THREE.MathUtils.lerp(heli.mesh.rotation.x, 0, 0.05);
          }
        });

        for (let i = heliProjectiles.length - 1; i >= 0; i--) {
          const proj = heliProjectiles[i];
          proj.life -= delta;

          const prevProjPos = proj.mesh.position.clone();
          const projStep = proj.speed * delta;
          proj.mesh.position.addScaledVector(proj.direction, projStep);

          // Stop a laser in flight if a base is now in its way (e.g. the player just ducked behind one).
          if (placedBases.length > 0) {
            raycasterShelter.set(prevProjPos, proj.direction);
            raycasterShelter.far = projStep + 0.1;
            if (raycasterShelter.intersectObjects(placedBases, true).length > 0) {
              scene.remove(proj.mesh);
              heliProjectiles.splice(i, 1);
              continue;
            }
          }

          const projDist = proj.mesh.position.distanceTo(playerPos);
          if (projDist < 0.9) {
            takeDamage(proj.damage);
            scene.remove(proj.mesh);
            heliProjectiles.splice(i, 1);
            continue;
          }

          if (proj.life <= 0) {
            scene.remove(proj.mesh);
            heliProjectiles.splice(i, 1);
          }
        }

        for (let i = 0; i < enemies.length; i++) {
          const enemy = enemies[i];
          const distToPlayer = enemy.mesh.position.distanceTo(playerPos);

          if (distToPlayer < 20.0) {
            // A placed base blocks ground enemies too - hide inside or behind one
            // and they can neither reach nor attack the player.
            const sheltered = isPathBlockedByBase(enemy.mesh.position, playerPos);

            if (!sheltered) {
              const moveDir = playerPos.clone().sub(enemy.mesh.position);
              moveDir.y = 0;
              if (moveDir.length() > 0.8) {
                moveDir.normalize();
                const nextEnemyPos = enemy.mesh.position.clone().addScaledVector(moveDir, enemy.speed * delta);
                if (!isPathBlockedByBase(enemy.mesh.position, nextEnemyPos)) {
                  enemy.mesh.position.copy(nextEnemyPos);
                }
                enemy.mesh.lookAt(playerPos.x, enemy.mesh.position.y, playerPos.z);
              }

              if (distToPlayer < 1.5 && time - enemy.lastAttackTime > 1200) {
                enemy.lastAttackTime = time;
                takeDamage(15);
              }
            }
          }
        }

        raycasterInteract.setFromCamera(new THREE.Vector2(0, 0), camera);
        const intersects = raycasterInteract.intersectObjects(interactableObjects, true);

        if (intersects.length > 0 && intersects[0].distance < 3.5) {
          let topObj = intersects[0].object;
          while (topObj.parent && topObj.parent !== scene && !topObj.userData.isShop && !topObj.userData.isShop2 && !topObj.userData.isGasStation && !topObj.userData.isItem && !topObj.userData.isMineable && !topObj.userData.isBaseChest) {
            topObj = topObj.parent;
          }

          if (topObj.userData.isShop || topObj.userData.isShop2 || topObj.userData.isGasStation || topObj.userData.isItem || topObj.userData.isMineable || topObj.userData.isBaseChest) {
            state.hoveredObject = topObj;
            promptItemName.textContent = topObj.userData.name || 'Item';
            if (promptActionText) {
              if (topObj.userData.isMineable) {
                promptActionText.innerHTML = 'Hold <b>E</b> to mine';
              } else if (topObj.userData.isBaseChest) {
                promptActionText.innerHTML = 'Press <b>E</b> to open &bull; <b>G</b> to unbuild';
              } else {
                promptActionText.innerHTML = 'Press <b>E</b> to interact with';
              }
            }
            interactionPrompt.style.display = 'block';
          } else {
            state.hoveredObject = null;
            interactionPrompt.style.display = 'none';
          }
        } else {
          state.hoveredObject = null;
          interactionPrompt.style.display = 'none';
        }

        // Drive the mining progress bar while E is held on a fossil
        if (state.miningTarget) {
          if (!state.isEKeyDown || state.hoveredObject !== state.miningTarget) {
            cancelMining();
          } else {
            const heldItem = inventory[state.selectedSlot];
            const activeMineDuration = (heldItem && heldItem.name.includes('Diamond')) ? DIAMOND_MINE_DURATION_MS : MINE_DURATION_MS;
            const progress = Math.min((time - state.miningStartTime) / activeMineDuration, 1);
            if (miningProgressBar) miningProgressBar.style.width = (progress * 100) + '%';
            if (progress >= 1) mineDeposit(state.miningTarget);
          }
        }

        checkPortalCollisions();
      }

      state.prevTime = time;
      renderer.render(scene, camera);
    }

    window.addEventListener('resize', () => {
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(window.innerWidth, window.innerHeight);
    });

    animate();