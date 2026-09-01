import { state } from './state.js';
import { arrowCountDisplay, controls, damageFlash, fuelCountDisplay, healthCountDisplay, playerHeight } from './core.js';
import { velocity } from './movement.js';

    // --- PLAYER LEVELING, HEALTH, FUEL & ARROWS SETTINGS ---

    const levelCountDisplay = document.getElementById('level-count');
    const xpCountDisplay = document.getElementById('xp-count');
    const xpNextDisplay = document.getElementById('xp-next');

    export function updateLevelHUD() {
      levelCountDisplay.textContent = state.playerLevel;
      xpCountDisplay.textContent = state.playerXP;
      xpNextDisplay.textContent = state.xpToNextLevel;
    }

    export function addXP(amount) {
      state.playerXP += amount;
      while (state.playerXP >= state.xpToNextLevel) {
        state.playerXP -= state.xpToNextLevel;
        state.playerLevel++;
        state.xpToNextLevel = Math.floor(state.xpToNextLevel * 1.5);
        alert(`🎉 Level Up! You reached Level ${state.playerLevel}!`);
      }
      updateLevelHUD();
    }

    export const maxPlayerHealth = 100;
    export const maxPlayerFuel = 200;
    // --- HEALTH, FUEL & ARROW HUD LOGIC ---
    export function updateHealthHUD() {
      healthCountDisplay.textContent = Math.max(0, Math.round(state.playerHealth));
    }

    export function updateFuelHUD() {
      fuelCountDisplay.textContent = Math.max(0, Math.round(state.playerFuel));
    }

    export function updateArrowHUD() {
      arrowCountDisplay.textContent = state.playerArrows;
    }

    function triggerDamageFlash() {
      damageFlash.style.opacity = '1';
      setTimeout(() => { damageFlash.style.opacity = '0'; }, 180);
    }

    export function takeDamage(amount) {
      if (state.cheatGodMode) return;
      state.playerHealth -= amount;
      updateHealthHUD();
      triggerDamageFlash();

      if (state.playerHealth <= 0) {
        alert("You died! Respawning...");
        respawnPlayer();
      }
    }

    export function respawnPlayer() {
      state.playerHealth = maxPlayerHealth;
      updateHealthHUD();
      controls.getObject().position.set(0, playerHeight + 3, 0);
      velocity.set(0, 0, 0);
    }

    export function healPlayer(amount) {
      if (state.playerHealth >= maxPlayerHealth) return false;
      state.playerHealth = Math.min(maxPlayerHealth, state.playerHealth + amount);
      updateHealthHUD();
      return true;
    }

    export function refuelPlayer(amount) {
      if (state.playerFuel >= maxPlayerFuel) {
        alert("Fuel tank is already full!");
        return false;
      }
      state.playerFuel = Math.min(maxPlayerFuel, state.playerFuel + amount);
      updateFuelHUD();
      alert(`Refueled! Current Fuel: ${Math.round(state.playerFuel)} / ${maxPlayerFuel}`);
      return true;
    }

