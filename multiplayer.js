import { state } from './state.js';

    // --- WebRTC MULTIPLAYER (PeerJS) ---
    export const connections = {};
    export const remotePlayers = {};

    export const myPeerIdEl = document.getElementById('my-state.peer-id');
    export const remotePeerInput = document.getElementById('remote-state.peer-id');
    export const connectPeerBtn = document.getElementById('connectPeerBtn');
    export const multiplayerMenu = document.getElementById('multiplayer-menu');
    export const hostingToggle = document.getElementById('hosting-toggle');
    export const hostingStateText = document.getElementById('hosting-state-text');
    export const menuPeerId = document.getElementById('menu-state.peer-id');
    export const menuPeerCount = document.getElementById('menu-state.peer-count');
    export const closeMultiplayerMenuBtn = document.getElementById('close-multiplayer-menu');
    export const peerStatusMessage = document.getElementById('state.peer-status-message');

