import * as THREE from 'three';
import { state } from './state.js';
import { inventory } from './inventory.js';


    // 1. Scene, Camera & Renderer
    export const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x87ceeb);
    scene.fog = new THREE.Fog(0x87ceeb, 0, 100);

    export const playerHeight = 0.6;   
    export const playerRadius = 0.25;  
    export const maxStepHeight = 0.2;  
    export const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.05, 1000);
    camera.position.set(0, playerHeight + 2, 0); 
    camera.rotation.order = 'YXZ'; 

    export const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    document.body.appendChild(renderer.domElement);

    // 2. Controls & UI Elements
    const blocker = document.getElementById('blocker');
    const startBtn = document.getElementById('startBtn');
    export const shopModal = document.getElementById('shop-modal');
    export const shop2Modal = document.getElementById('shop2-modal');
    export const inventoryModal = document.getElementById('inventory-modal');
    export const chestModal = document.getElementById('chest-modal');
    export const invHudBtn = document.getElementById('inv-hud-btn');
    export const loadingStatus = document.getElementById('loading-status');
    export const damageFlash = document.getElementById('damage-flash');
    export const healthCountDisplay = document.getElementById('health-count');
    export const fuelCountDisplay = document.getElementById('fuel-count');
    export const airspeedHud = document.getElementById('airspeed-hud');
    export const airspeedCountDisplay = document.getElementById('airspeed-count');
    export const arrowCountDisplay = document.getElementById('arrow-count');
    export const fileInput = document.getElementById('fileInput');
    export const fileNameDisplay = document.getElementById('file-name');

    export const controls = new PointerLockControls(camera, document.body);


    startBtn.addEventListener('click', () => {
      controls.lock();
    });

    controls.addEventListener('lock', () => {
      blocker.style.display = 'none';
      shopModal.style.display = 'none';
      shop2Modal.style.display = 'none';
      inventoryModal.style.display = 'none';
      chestModal.style.display = 'none';
      state.isShopOpen = false;
      state.isInventoryOpen = false;
      state.isChestOpen = false;
    });

    controls.addEventListener('unlock', () => {
      if (!state.isShopOpen && !state.isInventoryOpen && !state.isChestOpen) {
        blocker.style.display = 'flex';
      }
    });

    scene.add(controls.getObject());


