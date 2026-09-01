import * as THREE from 'three';
import { scene } from './core.js';

    // 4. Lighting
    scene.add(new THREE.AmbientLight(0xffffff, 1.2));
    const sun = new THREE.DirectionalLight(0xffffff, 1.5);
    sun.position.set(20, 40, 20);
    scene.add(sun);

