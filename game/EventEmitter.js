/**
 * @fileoverview Simple event emitter for decoupled game systems
 * Provides pub/sub functionality for game events like damage, kills, pickups, etc.
 *
 * @module game/EventEmitter
 */

/**
 * Lightweight event emitter for game systems
 * @class
 * @example
 * const events = new GameEventEmitter();
 * events.on('enemyKilled', (data) => console.log('Kill!', data));
 * events.emit('enemyKilled', { enemy: 'skeleton', xp: 10 });
 */
export class GameEventEmitter {
    constructor() {
        /** @type {Map<string, Set<Function>>} */
        this._listeners = new Map();

        /** @type {Map<string, Set<Function>>} */
        this._onceListeners = new Map();
    }

    /**
     * Subscribe to an event
     * @param {string} event - Event name
     * @param {Function} callback - Handler function
     * @returns {Function} Unsubscribe function
     */
    on(event, callback) {
        if (!this._listeners.has(event)) {
            this._listeners.set(event, new Set());
        }
        this._listeners.get(event).add(callback);

        // Return unsubscribe function
        return () => this.off(event, callback);
    }

    /**
     * Subscribe to an event once (auto-removes after first call)
     * @param {string} event - Event name
     * @param {Function} callback - Handler function
     */
    once(event, callback) {
        if (!this._onceListeners.has(event)) {
            this._onceListeners.set(event, new Set());
        }
        this._onceListeners.get(event).add(callback);
    }

    /**
     * Unsubscribe from an event
     * @param {string} event - Event name
     * @param {Function} callback - Handler to remove
     */
    off(event, callback) {
        if (this._listeners.has(event)) {
            this._listeners.get(event).delete(callback);
        }
        if (this._onceListeners.has(event)) {
            this._onceListeners.get(event).delete(callback);
        }
    }

    /**
     * Emit an event with data
     * @param {string} event - Event name
     * @param {*} data - Event data
     */
    emit(event, data) {
        // Regular listeners
        if (this._listeners.has(event)) {
            for (const callback of this._listeners.get(event)) {
                try {
                    callback(data);
                } catch (err) {
                    console.error(`Error in event listener for "${event}":`, err);
                }
            }
        }

        // Once listeners (remove after calling)
        if (this._onceListeners.has(event)) {
            const onceCallbacks = this._onceListeners.get(event);
            this._onceListeners.delete(event);
            for (const callback of onceCallbacks) {
                try {
                    callback(data);
                } catch (err) {
                    console.error(`Error in once listener for "${event}":`, err);
                }
            }
        }
    }

    /**
     * Remove all listeners for an event (or all events if no event specified)
     * @param {string} [event] - Event name, or omit to clear all
     */
    removeAllListeners(event) {
        if (event) {
            this._listeners.delete(event);
            this._onceListeners.delete(event);
        } else {
            this._listeners.clear();
            this._onceListeners.clear();
        }
    }

    /**
     * Get listener count for an event
     * @param {string} event - Event name
     * @returns {number}
     */
    listenerCount(event) {
        let count = 0;
        if (this._listeners.has(event)) {
            count += this._listeners.get(event).size;
        }
        if (this._onceListeners.has(event)) {
            count += this._onceListeners.get(event).size;
        }
        return count;
    }
}

// ============================================================================
// PREDEFINED GAME EVENTS
// ============================================================================

/**
 * Standard game event names
 * @readonly
 * @enum {string}
 */
export const GameEvents = Object.freeze({
    // Player events
    PLAYER_DAMAGED: 'player:damaged',
    PLAYER_HEALED: 'player:healed',
    PLAYER_DIED: 'player:died',
    PLAYER_LEVEL_UP: 'player:levelUp',
    PLAYER_XP_GAINED: 'player:xpGained',

    // Combat events
    ENEMY_SPAWNED: 'enemy:spawned',
    ENEMY_DAMAGED: 'enemy:damaged',
    ENEMY_KILLED: 'enemy:killed',
    BOSS_SPAWNED: 'boss:spawned',
    BOSS_KILLED: 'boss:killed',

    // Pickup events
    COIN_COLLECTED: 'pickup:coin',
    XP_COLLECTED: 'pickup:xp',
    CHEST_OPENED: 'pickup:chest',
    WEAPON_ACQUIRED: 'pickup:weapon',
    RUNE_ACQUIRED: 'pickup:rune',

    // Game state events
    GAME_STARTED: 'game:started',
    GAME_PAUSED: 'game:paused',
    GAME_RESUMED: 'game:resumed',
    GAME_OVER: 'game:over',
    TIER_COMPLETE: 'game:tierComplete',

    // Multiplayer events
    PLAYER_JOINED: 'mp:playerJoined',
    PLAYER_LEFT: 'mp:playerLeft',
    SYNC_STATE: 'mp:syncState',

    // UI events
    UPGRADE_SELECTED: 'ui:upgradeSelected',
    TOAST_SHOW: 'ui:toast',
    SCREEN_SHAKE: 'ui:screenShake'
});

// ============================================================================
// GLOBAL GAME EVENT BUS (Singleton)
// ============================================================================

/** Global event bus instance for cross-system communication */
export const gameEvents = new GameEventEmitter();
