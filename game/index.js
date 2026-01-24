/**
 * @fileoverview Game module exports
 * Central entry point for all game-related modules
 *
 * @module game
 */

// Core game
export { Game } from './game.js';

// Configuration
export {
    RARITIES,
    WEAPONS,
    RUNES,
    UPGRADES,
    CHARACTERS,
    AURA_WEAPONS,
    PHYSICS,
    CAMERA,
    RENDERING,
    PROGRESSION,
    SPAWN_CONFIG,
    BGM_TRACKS,
    SFX,
    TNS_TIER_CHARACTERS,
    getRandomRarity,
    isAuraWeapon,
    getCharacter,
    getTNSCharacters
} from './config.js';

// Event system
export {
    GameEventEmitter,
    GameEvents,
    gameEvents
} from './EventEmitter.js';

// State management
export {
    getUnlocks,
    isCharacterUnlocked,
    unlockCharacter,
    unlockAllCharacters,
    getRunHistory,
    addRunToHistory,
    getBestRun,
    isMultiplayerUnlocked,
    unlockMultiplayer,
    getTNSTier,
    setTNSTier,
    getHighestTier,
    updateHighestTier,
    hasFoundSecretNote,
    markSecretNoteFound,
    getTotalKills,
    addTotalKills,
    getSettings,
    updateSettings,
    getSetting,
    clearAllData,
    STORAGE_KEYS
} from './StateManager.js';
