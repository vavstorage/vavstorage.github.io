import * as THREE from 'three';
import { state } from './state.js';

    // 3. Physics & Movement Setup

    export const velocity = new THREE.Vector3();
    export const direction = new THREE.Vector3();
    export const flightDir = new THREE.Vector3();

    export const moveSpeed = 5.0;          
    export const gravity = 25.0;            
    export const fallMultiplier = 1.4;      
    const jumpStrength = 8.5;        
    export const terminalVelocity = -35.0;  
    export const groundDamping = 10.0;      
    export const airDamping = 2.0;          

    // Plane/jet flight model: airspeed builds up and bleeds off gradually (momentum),
    // forward thrust follows where you're actually looking (pitch + yaw), and dropping
    // below stall speed means losing lift instead of hovering in place like the helicopter.
    export const planeAccel = 5.5;
    export const planeDrag = 0.6;
    export const planeStallSpeedFactor = 0.35;
    export const planeTurnRate = 1.4;

    export const raycasterDown = new THREE.Raycaster();
    export const raycasterUp = new THREE.Raycaster();
    export const raycasterHorizontal = new THREE.Raycaster();
    export const raycasterInteract = new THREE.Raycaster();
    export const raycasterShelter = new THREE.Raycaster();

    export function performJump() {
      if (state.canJump) {
        velocity.y = jumpStrength;
        state.canJump = false;
        state.isGrounded = false;
      }
    }

