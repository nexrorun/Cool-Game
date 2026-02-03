/**
 * @fileoverview Game state management and persistence
 * Handles localStorage operations, unlock tracking, and run history
 *
 * @module game/StateManager
 */

// ============================================================================
// STORAGE KEYS
// ============================================================================

const STORAGE_KEYS = Object.freeze({
    UNLOCKS: 'uberthump_unlocks',
    RUN_HISTORY: 'uberthump_run_history',
    SETTINGS: 'uberthump_settings',
    MULTIPLAYER_UNLOCKED: 'uberthump_multiplayer_unlocked',
    TNS_TIER: 'uberthump_tns_tier',
    HIGHEST_TIER: 'uberthump_highest_tier',
    SECRET_NOTE_FOUND: 'uberthump_secret_note_found',
    TOTAL_KILLS: 'uberthump_total_kills'
});

// ============================================================================
// LOCAL STORAGE HELPERS
// ============================================================================

/**
 * Safely get item from localStorage
 * @param {string} key - Storage key
 * @param {*} defaultValue - Default if not found
 * @returns {*}
 */
function safeGet(key, defaultValue = null) {
    try {
        const item = localStorage.getItem(key);
        if (item === null) return defaultValue;
        return JSON.parse(item);
    } catch (e) {
        console.warn(`Failed to read localStorage key "${key}":`, e);
        return defaultValue;
    }
}

/**
 * Safely set item in localStorage
 * @param {string} key - Storage key
 * @param {*} value - Value to store
 * @returns {boolean} Success
 */
function safeSet(key, value) {
    try {
        localStorage.setItem(key, JSON.stringify(value));
        return true;
    } catch (e) {
        console.warn(`Failed to write localStorage key "${key}":`, e);
        return false;
    }
}

/**
 * Safely get raw string from localStorage
 * @param {string} key - Storage key
 * @param {string} defaultValue - Default if not found
 * @returns {string}
 */
function safeGetRaw(key, defaultValue = '') {
    try {
        return localStorage.getItem(key) || defaultValue;
    } catch (e) {
        return defaultValue;
    }
}

/**
 * Safely set raw string in localStorage
 * @param {string} key - Storage key
 * @param {string} value - Value to store
 */
function safeSetRaw(key, value) {
    try {
        localStorage.setItem(key, value);
    } catch (e) {
        console.warn(`Failed to write localStorage key "${key}":`, e);
    }
}

// ============================================================================
// CHARACTER UNLOCKS
// ============================================================================

/** Default character unlock states */
const DEFAULT_UNLOCKS = Object.freeze({
    FOX: true,
    MMOOVT: true,
    CALCIUM: false,
    GIGACHAD: false,
    BLITZ: false,
    MONKE: false,
    SIR_CHAD: false,
    BOBERTO: false  // Hardest to unlock - requires completing Story Mode (TNS Tier 4)
});

/**
 * Get all character unlock states
 * @returns {Object<string, boolean>}
 */
export function getUnlocks() {
    const stored = safeGet(STORAGE_KEYS.UNLOCKS, {});
    return { ...DEFAULT_UNLOCKS, ...stored };
}

/**
 * Check if a specific character is unlocked
 * @param {string} characterKey - Character to check
 * @returns {boolean}
 */
export function isCharacterUnlocked(characterKey) {
    const unlocks = getUnlocks();
    return unlocks[characterKey] === true;
}

/**
 * Unlock a character
 * @param {string} characterKey - Character to unlock
 * @returns {boolean} True if newly unlocked
 */
export function unlockCharacter(characterKey) {
    const unlocks = getUnlocks();
    if (unlocks[characterKey]) {
        return false; // Already unlocked
    }
    unlocks[characterKey] = true;
    safeSet(STORAGE_KEYS.UNLOCKS, unlocks);
    return true;
}

/**
 * Unlock all characters (dev/cheat)
 */
export function unlockAllCharacters() {
    const unlocks = {};
    for (const key of Object.keys(DEFAULT_UNLOCKS)) {
        unlocks[key] = true;
    }
    safeSet(STORAGE_KEYS.UNLOCKS, unlocks);
}

// ============================================================================
// RUN HISTORY
// ============================================================================

/**
 * Run history entry
 * @typedef {Object} RunEntry
 * @property {string} character - Character used
 * @property {string} mode - Game mode
 * @property {number} score - Final score
 * @property {number} kills - Total kills
 * @property {number} time - Survival time in seconds
 * @property {number} level - Final level
 * @property {number} tier - Tier reached
 * @property {number} timestamp - Unix timestamp
 */

/**
 * Get run history
 * @param {number} limit - Max entries to return
 * @returns {RunEntry[]}
 */
export function getRunHistory(limit = 10) {
    const history = safeGet(STORAGE_KEYS.RUN_HISTORY, []);
    return history.slice(0, limit);
}

/**
 * Add a run to history
 * @param {RunEntry} run - Run data
 */
export function addRunToHistory(run) {
    const history = safeGet(STORAGE_KEYS.RUN_HISTORY, []);
    history.unshift({
        ...run,
        timestamp: Date.now()
    });
    // Keep last 50 runs
    safeSet(STORAGE_KEYS.RUN_HISTORY, history.slice(0, 50));
}

/**
 * Get best run by score
 * @returns {RunEntry|null}
 */
export function getBestRun() {
    const history = getRunHistory(50);
    if (history.length === 0) return null;
    return history.reduce((best, run) =>
        (run.score > best.score) ? run : best
    );
}

// ============================================================================
// GAME PROGRESS
// ============================================================================

/**
 * Check if multiplayer is unlocked
 * @returns {boolean}
 */
export function isMultiplayerUnlocked() {
    return !!safeGetRaw(STORAGE_KEYS.MULTIPLAYER_UNLOCKED);
}

/**
 * Unlock multiplayer mode
 */
export function unlockMultiplayer() {
    safeSetRaw(STORAGE_KEYS.MULTIPLAYER_UNLOCKED, 'true');
}

/**
 * Get current TNS (story) tier
 * @returns {number}
 */
export function getTNSTier() {
    return parseInt(safeGetRaw(STORAGE_KEYS.TNS_TIER, '1')) || 1;
}

/**
 * Set TNS tier
 * @param {number} tier - New tier (1-4)
 */
export function setTNSTier(tier) {
    safeSetRaw(STORAGE_KEYS.TNS_TIER, String(Math.max(1, Math.min(4, tier))));
}

/**
 * Get highest tier reached in any mode
 * @returns {number}
 */
export function getHighestTier() {
    return parseInt(safeGetRaw(STORAGE_KEYS.HIGHEST_TIER, '0')) || 0;
}

/**
 * Update highest tier if new tier is higher
 * @param {number} tier - Tier reached
 */
export function updateHighestTier(tier) {
    const current = getHighestTier();
    if (tier > current) {
        safeSetRaw(STORAGE_KEYS.HIGHEST_TIER, String(tier));
    }
}

/**
 * Check if secret note has been found
 * @returns {boolean}
 */
export function hasFoundSecretNote() {
    return !!safeGetRaw(STORAGE_KEYS.SECRET_NOTE_FOUND);
}

/**
 * Mark secret note as found
 */
export function markSecretNoteFound() {
    safeSetRaw(STORAGE_KEYS.SECRET_NOTE_FOUND, 'true');
}

// ============================================================================
// STATISTICS
// ============================================================================

/**
 * Get total kills across all runs
 * @returns {number}
 */
export function getTotalKills() {
    return parseInt(safeGetRaw(STORAGE_KEYS.TOTAL_KILLS, '0')) || 0;
}

/**
 * Add kills to total
 * @param {number} kills - Kills to add
 */
export function addTotalKills(kills) {
    const total = getTotalKills() + kills;
    safeSetRaw(STORAGE_KEYS.TOTAL_KILLS, String(total));
}

// ============================================================================
// SETTINGS
// ============================================================================

/** Default settings */
const DEFAULT_SETTINGS = Object.freeze({
    pixelMode: true,
    musicVolume: 0.7,
    sfxVolume: 1.0,
    screenShake: true,
    showDamageNumbers: true
});

/**
 * Get all settings
 * @returns {Object}
 */
export function getSettings() {
    const stored = safeGet(STORAGE_KEYS.SETTINGS, {});
    return { ...DEFAULT_SETTINGS, ...stored };
}

/**
 * Update settings
 * @param {Object} updates - Settings to update
 */
export function updateSettings(updates) {
    const current = getSettings();
    safeSet(STORAGE_KEYS.SETTINGS, { ...current, ...updates });
}

/**
 * Get a specific setting
 * @param {string} key - Setting key
 * @returns {*}
 */
export function getSetting(key) {
    const settings = getSettings();
    return settings[key];
}

// ============================================================================
// CLEANUP
// ============================================================================

/**
 * Clear all game data (reset)
 */
export function clearAllData() {
    try {
        for (const key of Object.values(STORAGE_KEYS)) {
            localStorage.removeItem(key);
        }
    } catch (e) {
        console.warn('Failed to clear game data:', e);
    }
}

// ============================================================================
// EXPORT KEYS FOR EXTERNAL USE
// ============================================================================

export { STORAGE_KEYS };
