import * as THREE from 'three';
import { state } from './state.js';
import { closeChest, closeInventory, closeShop, handleInteraction, placeBaseAtCrosshair, restoreSavedBases, toggleInventory, unbuildBaseAtCrosshair } from './base-building.js';
import { camera, controls, fileNameDisplay, playerHeight, scene } from './core.js';
import { enemies } from './enemies.js';
import { enemyHelicopters } from './helicopters.js';
import { HOTBAR_SLOTS, TOTAL_SLOTS, addItemToInventory, dropSelectedItem, inventory, updateInventoryUI } from './inventory.js';
import { loadModelFromURL } from './map-loading.js';
import { baseURL } from './models.js';
import { performJump, velocity } from './movement.js';
import { closeMultiplayerMenuBtn, connectPeerBtn, connections, hostingStateText, hostingToggle, menuPeerCount, menuPeerId, multiplayerMenu, myPeerIdEl, peerStatusMessage, remotePeerInput, remotePlayers } from './multiplayer.js';
import { addXP, maxPlayerFuel, maxPlayerHealth, updateFuelHUD, updateHealthHUD } from './player.js';
import { cancelMining, itemCatalog, startMining, updateCoinHUD, useSelectedItem } from './resources.js';
import { AUTOSAVE_INTERVAL_MS, applySaveDataObject, buildSaveDataObject, closeWorldsMenu, getActiveWorld, newWorldNameInput, openWorldsMenu, persistWorlds, renderWorldsList, showToast, worldsModal } from './world-save.js';

    // --- F7 Secret Terminal state & DOM refs ---
    export const cheatSpeedLevels = [1, 2, 3];

    const cheatMenu = document.getElementById('cheat-menu');
    const terminalOutput = document.getElementById('terminal-output');
    const terminalForm = document.getElementById('terminal-form');
    const terminalInput = document.getElementById('terminal-input');

    function updatePeerCount() {
      const count = Object.keys(connections).length;
      if (menuPeerCount) menuPeerCount.textContent = count;
      if (peerStatusMessage) peerStatusMessage.textContent = count > 0 ? `${count} player${count === 1 ? '' : 's'} connected.` : 'No other players connected.';
    }

    export function createRemotePlayerMesh(peerId) {
      if (remotePlayers[peerId]) return remotePlayers[peerId];

      const group = new THREE.Group();
      group.userData.peerId = peerId;

      if (state.playerModelTemplate) {
        const model = state.playerModelTemplate.clone(true);
        model.traverse((child) => {
          if (child.isMesh && child.material) {
            child.material = Array.isArray(child.material)
              ? child.material.map(m => m.clone())
              : child.material.clone();
          }
        });
        group.add(model);
      } else {
        const bodyGeo = new THREE.CapsuleGeometry(0.35, 0.8, 4, 8);
        const bodyMat = new THREE.MeshStandardMaterial({ color: 0x00e5ff });
        const body = new THREE.Mesh(bodyGeo, bodyMat);
        body.position.y = 0.75;
        group.add(body);
      }

      scene.add(group);
      remotePlayers[peerId] = group;
      return group;
    }

    function removeRemotePlayer(peerId) {
      const player = remotePlayers[peerId];
      if (!player) return;
      scene.remove(player);
      player.traverse((child) => {
        if (child.geometry) child.geometry.dispose();
        if (child.material) {
          const mats = Array.isArray(child.material) ? child.material : [child.material];
          mats.forEach((mat) => mat && mat.dispose && mat.dispose());
        }
      });
      delete remotePlayers[peerId];
    }

    function setupDataConnection(conn) {
      connections[conn.peer] = conn;

      conn.on('open', () => {
        updatePeerCount();
        createRemotePlayerMesh(conn.peer);
        // Send our current transform immediately after connecting.
        if (controls && controls.getObject) {
          const pos = controls.getObject().position;
          conn.send({ type: 'transform', x: pos.x, y: pos.y, z: pos.z, rotY: camera.rotation.y });
        }
      });

      conn.on('data', (data) => {
        if (!data || data.type !== 'transform') return;
        const player = remotePlayers[conn.peer] || createRemotePlayerMesh(conn.peer);
        player.position.set(data.x || 0, data.y || 0, data.z || 0);
        player.rotation.y = Number.isFinite(data.rotY) ? data.rotY : 0;
      });

      conn.on('close', () => {
        removeRemotePlayer(conn.peer);
        delete connections[conn.peer];
        updatePeerCount();
      });

      conn.on('error', (err) => {
        console.warn('Peer connection error:', err);
      });
    }

    export function broadcastTransform() {
      if (!state.hostingEnabled || !state.peerReady || !state.peer) return;
      const pos = controls.getObject().position;
      const payload = { type: 'transform', x: pos.x, y: pos.y, z: pos.z, rotY: camera.rotation.y };
      Object.values(connections).forEach((conn) => {
        if (conn && conn.open) {
          try { conn.send(payload); } catch (err) { console.warn('Could not send transform:', err); }
        }
      });
    }

    function clearAllConnections() {
      Object.keys(connections).forEach((peerId) => {
        const conn = connections[peerId];
        try { if (conn) conn.close(); } catch (_) {}
        removeRemotePlayer(peerId);
        delete connections[peerId];
      });
      updatePeerCount();
    }

    function setHostingEnabled(enabled) {
      state.hostingEnabled = !!enabled;
      if (hostingToggle) hostingToggle.classList.toggle('on', state.hostingEnabled);
      if (hostingStateText) hostingStateText.textContent = state.hostingEnabled ? 'ON' : 'OFF';

      if (!state.hostingEnabled) {
        clearAllConnections();
        state.peerReady = false;
        if (state.peer) {
          try { state.peer.destroy(); } catch (_) {}
          state.peer = null;
        }
        if (myPeerIdEl) myPeerIdEl.textContent = 'Hosting OFF';
        if (menuPeerId) menuPeerId.textContent = 'Hosting OFF';
        if (peerStatusMessage) peerStatusMessage.textContent = 'Hosting is OFF. Turn it ON to create a Peer ID.';
        return;
      }

      if (peerStatusMessage) peerStatusMessage.textContent = 'Starting multiplayer host...';
      initWebRTC();
    }

    function openMultiplayerMenu() {
      if (!multiplayerMenu) return;
      multiplayerMenu.classList.add('open');
      multiplayerMenu.setAttribute('aria-hidden', 'false');
      state.multiplayerMenuWasLocked = controls.isLocked;
      if (state.multiplayerMenuWasLocked) controls.unlock();
      if (myPeerIdEl && menuPeerId) menuPeerId.textContent = myPeerIdEl.textContent;
    }

    function closeMultiplayerMenu() {
      if (!multiplayerMenu) return;
      multiplayerMenu.classList.remove('open');
      multiplayerMenu.setAttribute('aria-hidden', 'true');
      if (state.multiplayerMenuWasLocked && !state.isShopOpen && !state.isInventoryOpen && !state.isChestOpen) controls.lock();
      state.multiplayerMenuWasLocked = false;
    }

    function generateShortPeerCode() {
      // Six lowercase hexadecimal characters, e.g. d33ba4.
      if (window.crypto && crypto.getRandomValues) {
        const bytes = new Uint8Array(3);
        crypto.getRandomValues(bytes);
        return Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
      }
      return Math.floor(Math.random() * 0x1000000).toString(16).padStart(6, '0');
    }

    function initWebRTC(attempt = 0) {
      if (!state.hostingEnabled || state.peer) return;
      if (typeof Peer === 'undefined') {
        state.peerReady = false;
        if (myPeerIdEl) myPeerIdEl.textContent = 'PeerJS unavailable';
        if (menuPeerId) menuPeerId.textContent = 'PeerJS unavailable';
        return;
      }

      const shortCode = generateShortPeerCode();
      if (peerStatusMessage) peerStatusMessage.textContent = `Starting multiplayer host (${shortCode})...`;
      state.peer = new Peer(shortCode);

      state.peer.on('open', (id) => {
        state.peerReady = true;
        if (myPeerIdEl) myPeerIdEl.textContent = id;
        if (menuPeerId) menuPeerId.textContent = id;
        if (peerStatusMessage) peerStatusMessage.textContent = 'Hosting is ON. Share this 6-character code to let another player join.';
      });

      state.peer.on('connection', (conn) => setupDataConnection(conn));

      state.peer.on('error', (err) => {
        console.warn('PeerJS error:', err);
        const errType = err && err.type;
        // Short codes can collide. Retry with a fresh six-character code.
        if ((errType === 'unavailable-id' || errType === 'server-error') && attempt < 5 && state.hostingEnabled) {
          try { state.peer.destroy(); } catch (_) {}
          state.peer = null;
          state.peerReady = false;
          if (peerStatusMessage) peerStatusMessage.textContent = 'That code was unavailable. Generating a new code...';
          setTimeout(() => initWebRTC(attempt + 1), 250);
          return;
        }
        state.peerReady = false;
        if (myPeerIdEl) myPeerIdEl.textContent = 'Connection error';
        if (menuPeerId) menuPeerId.textContent = 'Connection error';
        if (peerStatusMessage) peerStatusMessage.textContent = 'PeerJS connection error.';
      });

      state.peer.on('disconnected', () => {
        state.peerReady = false;
        if (myPeerIdEl) myPeerIdEl.textContent = 'Reconnecting...';
        try { state.peer.reconnect(); } catch (_) {}
      });
    }

    if (connectPeerBtn) {
      connectPeerBtn.addEventListener('click', () => {
        const targetId = remotePeerInput.value.trim();
        if (!targetId) {
          if (peerStatusMessage) peerStatusMessage.textContent = 'Enter another player\'s Peer ID first.';
          return;
        }
        if (!state.hostingEnabled || !state.peer || !state.peerReady) {
          if (peerStatusMessage) peerStatusMessage.textContent = 'Turn Hosting ON and wait for your Peer ID before joining.';
          return;
        }
        if (connections[targetId]) {
          if (peerStatusMessage) peerStatusMessage.textContent = 'You are already connected to that Peer ID.';
          return;
        }

        const conn = state.peer.connect(targetId, { reliable: true });
        setupDataConnection(conn);
        if (peerStatusMessage) peerStatusMessage.textContent = 'Connecting to that Peer ID...';
      });
    }

    if (hostingToggle) {
      hostingToggle.classList.add('on');
      hostingToggle.addEventListener('click', () => setHostingEnabled(!state.hostingEnabled));
    }
    if (closeMultiplayerMenuBtn) closeMultiplayerMenuBtn.addEventListener('click', closeMultiplayerMenu);

    // Start with hosting enabled for backward compatibility.
    initWebRTC();

    // --- F7 Secret Terminal ---
    function terminalPrint(text = '', type = 'info') {
      if (!terminalOutput) return;
      const line = document.createElement('div');
      line.className = `terminal-line ${type}`;
      line.textContent = text;
      terminalOutput.appendChild(line);
      terminalOutput.scrollTop = terminalOutput.scrollHeight;
    }

    function terminalBanner() {
      terminalPrint('VAV GAME TERMINAL v1.0', 'success');
      terminalPrint('Type \"help\" for commands. Use ↑/↓ for command history.', 'dim');
      terminalPrint('');
    }

    function updateCheatMenuUI() {
      // The terminal reflects these states through the status command.
    }

    function openCheatMenu() {
      if (!cheatMenu) return;
      state.isCheatMenuOpen = true;
      cheatMenu.classList.add('open');
      cheatMenu.setAttribute('aria-hidden', 'false');
      state.cheatMenuWasLocked = controls.isLocked;
      if (state.cheatMenuWasLocked) controls.unlock();
      if (terminalOutput && terminalOutput.childElementCount === 0) terminalBanner();
      setTimeout(() => terminalInput?.focus(), 0);
    }

    function closeCheatMenu() {
      if (!cheatMenu) return;
      state.isCheatMenuOpen = false;
      cheatMenu.classList.remove('open');
      cheatMenu.setAttribute('aria-hidden', 'true');
      if (state.cheatMenuWasLocked && !state.isShopOpen && !state.isInventoryOpen && !state.isChestOpen) controls.lock();
      state.cheatMenuWasLocked = false;
    }

    function toggleCheatMenu() {
      if (state.isCheatMenuOpen) closeCheatMenu();
      else openCheatMenu();
    }

    function terminalHelp() {
      terminalPrint('Available commands:', 'success');
      terminalPrint('  help                         Show this help');
      terminalPrint('  clear                        Clear terminal');
      terminalPrint('  status                       Show player status');
      terminalPrint('  god [on|off|toggle]          Toggle god mode');
      terminalPrint('  fly [on|off|toggle]          Toggle fly mode');
      terminalPrint('  heal                         Restore health');
      terminalPrint('  refuel                       Fill fuel');
      terminalPrint('  coins [amount]               Add coins (default 100)');
      terminalPrint('  xp [amount]                  Add XP (default 500)');
      terminalPrint('  speed [1|2|3]                Set movement multiplier');
      terminalPrint('  tp spawn                     Teleport to spawn');
      terminalPrint('  tp <x> <y> <z>              Teleport to coordinates');
      terminalPrint('  tp mesh <name>              Teleport to a mesh/object by name');
      terminalPrint('  tp <mesh-name>              Shortcut for tp mesh <name>');
      terminalPrint('  meshes                      List named meshes/objects');
      terminalPrint('  killall                      Remove enemies');
      terminalPrint('  give <item> [quantity]       Give an item');
      terminalPrint('  history                      Show recent commands');
      terminalPrint('  exit                         Close terminal');
      terminalPrint('');
      terminalPrint('Item names can be IDs like: bow, arrows, helicopter, car, plane, jet, fuel_tank, iron_sword, stone_sword, diamonds, potion, fossil, vavite, iron_ore', 'dim');
    }

    function terminalStatus() {
      terminalPrint(`Level ${state.playerLevel} | XP ${state.playerXP}/${state.xpToNextLevel} | Coins ${state.playerCoins} | Health ${state.playerHealth}/${maxPlayerHealth} | Fuel ${state.playerFuel}/${maxPlayerFuel} | Arrows ${state.playerArrows}`, 'info');
      terminalPrint(`God ${state.cheatGodMode ? 'ON' : 'OFF'} | Fly ${state.cheatFlyMode ? 'ON' : 'OFF'} | Speed x${cheatSpeedLevels[state.cheatSpeedIndex]}`, 'info');
    }

    function terminalSetToggle(current, arg, setter, label) {
      const mode = (arg || 'toggle').toLowerCase();
      const next = mode === 'on' ? true : mode === 'off' ? false : !current;
      setter(next);
      terminalPrint(`${label}: ${next ? 'ON' : 'OFF'}`, 'success');
    }

    function cheatToggleGod(force) {
      state.cheatGodMode = typeof force === 'boolean' ? force : !state.cheatGodMode;
      showToast(state.cheatGodMode ? '🛡️ God Mode enabled' : '🛡️ God Mode disabled');
    }

    function cheatToggleFly(force) {
      state.cheatFlyMode = typeof force === 'boolean' ? force : !state.cheatFlyMode;
      if (state.cheatFlyMode) velocity.y = 0;
      showToast(state.cheatFlyMode ? '🕊️ Fly Mode enabled — Space up, Shift down' : '🕊️ Fly Mode disabled');
    }

    function cheatCycleSpeed(target) {
      if (Number.isFinite(target)) {
        const n = Math.max(1, Math.min(3, Math.floor(target)));
        state.cheatSpeedIndex = n - 1;
      } else {
        state.cheatSpeedIndex = (state.cheatSpeedIndex + 1) % cheatSpeedLevels.length;
      }
      showToast(`🏃 Speed set to x${cheatSpeedLevels[state.cheatSpeedIndex]}`);
    }

    function cheatFullHeal() {
      state.playerHealth = maxPlayerHealth;
      updateHealthHUD();
      showToast('❤️ Health fully restored');
    }

    function cheatFullRefuel() {
      state.playerFuel = maxPlayerFuel;
      updateFuelHUD();
      showToast('⛽ Fuel tank filled');
    }

    function cheatAddCoins(amount) {
      state.playerCoins += amount;
      updateCoinHUD();
      showToast(`🪙 +${amount} Coins`);
    }

    function cheatAddXP(amount) {
      addXP(amount);
      showToast(`⭐ +${amount} XP`);
    }

    function cheatTeleportSpawn() {
      controls.getObject().position.set(0, playerHeight + 3, 0);
      velocity.set(0, 0, 0);
      showToast('📍 Teleported to spawn');
    }

    function findSceneObjectByName(query) {
      const needle = String(query || '').trim().toLowerCase();
      if (!needle) return null;

      let exact = null;
      let partial = null;
      scene.traverse((obj) => {
        if (!obj.name) return;
        const name = obj.name.toLowerCase();
        if (!exact && name === needle) exact = obj;
        if (!partial && name.includes(needle)) partial = obj;
      });
      return exact || partial;
    }

    function teleportToObject(query) {
      const target = findSceneObjectByName(query);
      if (!target) {
        terminalPrint(`No mesh/object named "${query}" was found.`, 'error');
        terminalPrint('Use "meshes" to list named scene objects.', 'dim');
        return false;
      }

      const targetPos = new THREE.Vector3();
      target.getWorldPosition(targetPos);
      controls.getObject().position.set(targetPos.x, targetPos.y + playerHeight + 1, targetPos.z);
      velocity.set(0, 0, 0);
      showToast(`📍 Teleported to ${target.name}`);
      terminalPrint(`Teleported to ${target.name} @ ${targetPos.x.toFixed(2)}, ${targetPos.y.toFixed(2)}, ${targetPos.z.toFixed(2)}.`, 'success');
      return true;
    }

    function terminalListMeshes() {
      const names = [];
      const seen = new Set();
      scene.traverse((obj) => {
        if (!obj.name || seen.has(obj.name)) return;
        seen.add(obj.name);
        names.push(`${obj.isMesh ? '[mesh]' : '[object]'} ${obj.name}`);
      });
      names.sort((a, b) => a.localeCompare(b));
      terminalPrint(`Named scene objects: ${names.length}`, 'success');
      if (!names.length) {
        terminalPrint('No named objects found.', 'dim');
        return;
      }
      names.slice(0, 200).forEach(name => terminalPrint(`  ${name}`));
      if (names.length > 200) terminalPrint(`  ...and ${names.length - 200} more.`, 'dim');
    }

    function cheatClearEnemies() {
      const count = enemies.length;
      for (let i = enemies.length - 1; i >= 0; i--) scene.remove(enemies[i].mesh);
      enemies.length = 0;
      for (let i = enemyHelicopters.length - 1; i >= 0; i--) scene.remove(enemyHelicopters[i].mesh);
      enemyHelicopters.length = 0;
      showToast(count > 0 ? `💀 Cleared ${count} enemies` : '💀 No enemies nearby');
      return count;
    }

    function cheatGiveItem(key, quantity = 5) {
      const template = itemCatalog[key];
      if (!template) return false;
      const amount = Math.max(1, Math.floor(quantity) || 1);
      const added = addItemToInventory(template, amount);
      if (added) showToast(`${template.icon} +${amount} ${template.name}`);
      return !!added;
    }

    function terminalRunCommand(rawCommand) {
      const raw = rawCommand.trim();
      if (!raw) return;
      state.terminalHistory.push(raw);
      if (state.terminalHistory.length > 50) state.terminalHistory.shift();
      state.terminalHistoryIndex = state.terminalHistory.length;
      terminalPrint(`vav@game:~$ ${raw}`, 'command');

      const parts = raw.match(/(?:[^\s"']+|"[^"]*"|'[^']*')+/g)?.map(p => p.replace(/^['"]|['"]$/g, '')) || [];
      const cmd = (parts.shift() || '').toLowerCase();
      const args = parts;

      switch (cmd) {
        case 'help': case '?': terminalHelp(); break;
        case 'clear': if (terminalOutput) terminalOutput.innerHTML = ''; break;
        case 'status': terminalStatus(); break;
        case 'god': {
          const mode = (args[0] || 'toggle').toLowerCase();
          cheatToggleGod(mode === 'on' ? true : mode === 'off' ? false : undefined);
          terminalPrint(`God mode ${state.cheatGodMode ? 'enabled' : 'disabled'}.`, 'success');
          break;
        }
        case 'fly': {
          const mode = (args[0] || 'toggle').toLowerCase();
          cheatToggleFly(mode === 'on' ? true : mode === 'off' ? false : undefined);
          terminalPrint(`Fly mode ${state.cheatFlyMode ? 'enabled' : 'disabled'}.`, 'success');
          break;
        }
        case 'heal': cheatFullHeal(); terminalPrint('Health restored to maximum.', 'success'); break;
        case 'refuel': cheatFullRefuel(); terminalPrint('Fuel restored to maximum.', 'success'); break;
        case 'coins': {
          const amount = Number(args[0] ?? 100);
          if (!Number.isFinite(amount)) { terminalPrint('Usage: coins [amount]', 'error'); break; }
          cheatAddCoins(Math.floor(amount));
          terminalPrint(`Added ${Math.floor(amount)} coins.`, 'success');
          break;
        }
        case 'xp': {
          const amount = Number(args[0] ?? 500);
          if (!Number.isFinite(amount)) { terminalPrint('Usage: xp [amount]', 'error'); break; }
          cheatAddXP(Math.max(0, Math.floor(amount)));
          terminalPrint(`Added ${Math.max(0, Math.floor(amount))} XP.`, 'success');
          break;
        }
        case 'speed': {
          const n = Number(args[0]);
          if (![1,2,3].includes(n)) { terminalPrint('Usage: speed 1|2|3', 'error'); break; }
          cheatCycleSpeed(n);
          terminalPrint(`Speed set to x${n}.`, 'success');
          break;
        }
        case 'tp': case 'teleport': {
          if (!args.length || ['spawn','start'].includes((args[0] || '').toLowerCase())) {
            cheatTeleportSpawn();
            terminalPrint('Teleported to spawn.', 'success');
            break;
          }

          const numericCoords = args.length >= 3 ? args.slice(0, 3).map(Number) : [];
          if (numericCoords.length === 3 && numericCoords.every(Number.isFinite)) {
            const [x, y, z] = numericCoords;
            controls.getObject().position.set(x, y, z);
            velocity.set(0, 0, 0);
            showToast(`📍 Teleported to ${x}, ${y}, ${z}`);
            terminalPrint(`Teleported to coordinates ${x}, ${y}, ${z}.`, 'success');
            break;
          }

          if ((args[0] || '').toLowerCase() === 'mesh') {
            const query = args.slice(1).join(' ').trim();
            if (!query) {
              terminalPrint('Usage: tp mesh <name>', 'error');
              break;
            }
            teleportToObject(query);
            break;
          }

          const query = args.join(' ').trim();
          teleportToObject(query);
          break;
        }
        case 'meshes': case 'objects':
          terminalListMeshes();
          break;
        case 'killall': case 'clearenemies': { const n = cheatClearEnemies(); terminalPrint(`Removed ${n} ground enemies.`, 'success'); break; }
        case 'give': {
          const key = (args[0] || '').toLowerCase();
          const quantity = Number(args[1] ?? 5);
          if (!itemCatalog[key]) { terminalPrint(`Unknown item: ${key || '(none)'}`, 'error'); break; }
          const amount = Number.isFinite(quantity) ? Math.max(1, Math.floor(quantity)) : 5;
          const gave = cheatGiveItem(key, amount);
          terminalPrint(gave ? `Gave ${amount} ${itemCatalog[key].name}.` : 'Inventory is full.', gave ? 'success' : 'error');
          break;
        }
        case 'history':
          if (!state.terminalHistory.length) terminalPrint('No command history.');
          else state.terminalHistory.forEach((h, i) => terminalPrint(`${String(i + 1).padStart(2, ' ')}  ${h}`));
          break;
        case 'exit': case 'quit': case 'close': closeCheatMenu(); break;
        default: terminalPrint(`command not found: ${cmd}`, 'error'); terminalPrint('Type "help" to see available commands.', 'dim');
      }
    }

    if (terminalForm) {
      terminalForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const value = terminalInput?.value || '';
        if (terminalInput) terminalInput.value = '';
        terminalRunCommand(value);
      });
    }

    if (terminalInput) {
      terminalInput.addEventListener('keydown', (e) => {
        if (e.key === 'ArrowUp') {
          e.preventDefault();
          if (!state.terminalHistory.length) return;
          state.terminalHistoryIndex = Math.max(0, state.terminalHistoryIndex - 1);
          terminalInput.value = state.terminalHistory[state.terminalHistoryIndex] || '';
        } else if (e.key === 'ArrowDown') {
          e.preventDefault();
          if (!state.terminalHistory.length) return;
          state.terminalHistoryIndex = Math.min(state.terminalHistory.length, state.terminalHistoryIndex + 1);
          terminalInput.value = state.terminalHistory[state.terminalHistoryIndex] || '';
        }
      });
    }

    function createNewWorld() {
      const name = (newWorldNameInput.value || '').trim() || `World ${state.worlds.length + 1}`;
      const world = {
        id: 'world_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7),
        name: name,
        map: state.currentLoadedFileName,
        mapSource: fileNameDisplay.textContent.startsWith('Local File:') ? 'local' : 'remote',
        createdAt: Date.now(),
        updatedAt: Date.now(),
        data: {
          level: 1, xp: 0, xpToNextLevel: 100, coins: 10, health: 100, fuel: 200, arrows: 20,
          inventory: new Array(TOTAL_SLOTS).fill(null), position: null, bases: []
        }
      };
      state.worlds.push(world);
      persistWorlds();
      newWorldNameInput.value = '';
      renderWorldsList();
      playWorld(world.id);
    }

    export function playWorld(id) {
      const world = state.worlds.find(w => w.id === id);
      if (!world) return;

      state.activeWorldId = id;
      world.updatedAt = Date.now();
      persistWorlds();

      const startFresh = () => {
        applySaveDataObject(world.data);
        if (world.map === state.currentLoadedFileName && Array.isArray(world.data.bases) && world.data.bases.length) {
          restoreSavedBases(world.data.bases);
        }
        closeWorldsMenu();
        controls.lock();
        showToast(`🌍 Playing "${world.name}"`);
      };

      // Remote maps (served from vavstorage.github.io) can be auto-loaded by name.
      // Locally-uploaded maps can't be re-fetched automatically since only the
      // browser session that uploaded them has the file bytes.
      if (world.mapSource === 'remote' && world.map && world.map !== state.currentLoadedFileName) {
        loadModelFromURL(baseURL + world.map, world.map, (success) => {
          if (!success) showToast(`⚠️ Could not auto-load map "${world.map}" — using current map instead.`);
          startFresh();
        });
      } else {
        if (world.mapSource === 'local' && world.map !== state.currentLoadedFileName) {
          showToast(`ℹ️ "${world.name}" used local map "${world.map}" — re-attach it via Override Map for a full match.`);
        }
        startFresh();
      }
    }

    export function renameWorld(id) {
      const world = state.worlds.find(w => w.id === id);
      if (!world) return;
      const newName = prompt('Rename world:', world.name);
      if (newName && newName.trim()) {
        world.name = newName.trim();
        persistWorlds();
        renderWorldsList();
      }
    }

    export function deleteWorld(id) {
      const world = state.worlds.find(w => w.id === id);
      if (!world) return;
      if (!confirm(`Delete "${world.name}"? This can't be undone.`)) return;
      state.worlds = state.worlds.filter(w => w.id !== id);
      persistWorlds();
      if (state.activeWorldId === id) state.activeWorldId = null;
      renderWorldsList();
    }

    // Quick Save writes straight into whichever world is currently active. If no
    // world has been chosen yet (e.g. the player just clicked "Click to Play"),
    // it opens the world list so they can create/select one first.
    function quickSaveActiveWorld() {
      const world = getActiveWorld();
      if (!world) {
        openWorldsMenu();
        showToast('🌍 Create or select a world to save into first.');
        return;
      }
      world.data = buildSaveDataObject();
      world.map = state.currentLoadedFileName;
      world.updatedAt = Date.now();
      persistWorlds();
      showToast(`💾 Saved "${world.name}"`);
    }

    document.getElementById('worldsBtn').addEventListener('click', openWorldsMenu);
    document.getElementById('close-state.worlds-menu').addEventListener('click', closeWorldsMenu);
    document.getElementById('createWorldBtn').addEventListener('click', createNewWorld);
    newWorldNameInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); createNewWorld(); }
    });
    document.getElementById('saveBtn').addEventListener('click', quickSaveActiveWorld);

    // Autosave the active world periodically while playing, and once more on the
    // way out, so progress survives an accidental tab close.
    setInterval(() => {
      if (!controls.isLocked || !state.activeWorldId) return;
      const world = getActiveWorld();
      if (!world) return;
      world.data = buildSaveDataObject();
      world.map = state.currentLoadedFileName;
      world.updatedAt = Date.now();
      persistWorlds();
      showToast(`💾 Autosaved "${world.name}"`);
    }, AUTOSAVE_INTERVAL_MS);

    window.addEventListener('beforeunload', () => {
      const world = getActiveWorld();
      if (!world) return;
      world.data = buildSaveDataObject();
      world.map = state.currentLoadedFileName;
      world.updatedAt = Date.now();
      persistWorlds();
    });

    // Keyboard Controls
    const onKeyDown = (e) => {
      if (e.code === 'F7') {
        e.preventDefault();
        toggleCheatMenu();
        return;
      }

      if (e.code === 'F10') {
        e.preventDefault();
        if (multiplayerMenu && multiplayerMenu.classList.contains('open')) closeMultiplayerMenu();
        else openMultiplayerMenu();
        return;
      }

      if (e.code === 'Tab') {
        e.preventDefault();
        toggleInventory();
        return;
      }

      if (e.code === 'Escape') {
        if (state.isCheatMenuOpen) {
          closeCheatMenu();
          return;
        }
        if (multiplayerMenu && multiplayerMenu.classList.contains('open')) {
          closeMultiplayerMenu();
          return;
        }
        if (worldsModal && worldsModal.classList.contains('open')) {
          closeWorldsMenu();
          return;
        }
        if (state.isShopOpen) closeShop();
        if (state.isInventoryOpen) closeInventory();
        if (state.isChestOpen) closeChest();
        return;
      }

      if (state.isShopOpen || state.isInventoryOpen || state.isChestOpen || state.isCheatMenuOpen) return;

      switch (e.code) {
        case 'KeyW': case 'ArrowUp': state.moveForward = true; break;
        case 'KeyA': case 'ArrowLeft': state.moveLeft = true; break;
        case 'KeyS': case 'ArrowDown': state.moveBackward = true; break;
        case 'KeyD': case 'ArrowRight': state.moveRight = true; break;
        case 'ShiftLeft': case 'ShiftRight': state.isShiftPressed = true; break;
        case 'Space':
          state.isSpacePressed = true;
          const activeItem = inventory[state.selectedSlot];
          if (!activeItem || !activeItem.name.includes('Helicopter')) performJump();
          break;
        case 'KeyE':
          state.isEKeyDown = true;
          if (state.hoveredObject && state.hoveredObject.userData.isMineable) {
            if (state.miningTarget !== state.hoveredObject) startMining(state.hoveredObject);
          } else {
            handleInteraction();
          }
          break;
        case 'KeyI': toggleInventory(); break;
        case 'KeyF': useSelectedItem(); break;
        case 'KeyQ': if (controls.isLocked) dropSelectedItem(); break;
        case 'KeyB': if (controls.isLocked) placeBaseAtCrosshair(); break;
        case 'KeyG': if (controls.isLocked) unbuildBaseAtCrosshair(); break;
        case 'Digit1': state.selectedSlot = 0; updateInventoryUI(); break;
        case 'Digit2': state.selectedSlot = 1; updateInventoryUI(); break;
        case 'Digit3': state.selectedSlot = 2; updateInventoryUI(); break;
        case 'Digit4': state.selectedSlot = 3; updateInventoryUI(); break;
        case 'Digit5': state.selectedSlot = 4; updateInventoryUI(); break;
        case 'Digit6': state.selectedSlot = 5; updateInventoryUI(); break;
        case 'Digit7': state.selectedSlot = 6; updateInventoryUI(); break;
        case 'Digit8': state.selectedSlot = 7; updateInventoryUI(); break;
        case 'Digit9': state.selectedSlot = 8; updateInventoryUI(); break;
      }
    };

    const onKeyUp = (e) => {
      switch (e.code) {
        case 'KeyW': case 'ArrowUp': state.moveForward = false; break;
        case 'KeyA': case 'ArrowLeft': state.moveLeft = false; break;
        case 'KeyS': case 'ArrowDown': state.moveBackward = false; break;
        case 'KeyD': case 'ArrowRight': state.moveRight = false; break;
        case 'ShiftLeft': case 'ShiftRight': state.isShiftPressed = false; break;
        case 'Space': state.isSpacePressed = false; break;
        case 'KeyE': state.isEKeyDown = false; cancelMining(); break;
      }
    };

    window.addEventListener('wheel', (e) => {
      if (!controls.isLocked || state.isShopOpen || state.isInventoryOpen || state.isChestOpen) return;
      if (e.deltaY > 0) state.selectedSlot = (state.selectedSlot + 1) % HOTBAR_SLOTS;
      else if (e.deltaY < 0) state.selectedSlot = (state.selectedSlot - 1 + HOTBAR_SLOTS) % HOTBAR_SLOTS;
      updateInventoryUI();
    });

    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('keyup', onKeyUp);

