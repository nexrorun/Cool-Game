/**
 * @fileoverview Centralized game configuration and constants
 * This module contains all game balance values, weapon definitions,
 * character stats, and other configurable parameters.
 *
 * @module game/config
 */

// ============================================================================
// RARITY SYSTEM
// ============================================================================

/**
 * Item rarity tiers with their properties
 * @typedef {Object} RarityTier
 * @property {string} name - Display name
 * @property {number} color - Hex color code
 * @property {number} mult - Damage/stat multiplier
 * @property {number} chance - Drop chance (0-1)
 */

/** @type {Object<string, RarityTier>} */
export const RARITIES = Object.freeze({
    COMMON:     { name: "Common",     color: 0xaaaaaa, mult: 1.0, chance: 0.50 },
    UNCOMMON:   { name: "Uncommon",   color: 0x00ff00, mult: 1.2, chance: 0.30 },
    RARE:       { name: "Rare",       color: 0x0088ff, mult: 1.5, chance: 0.15 },
    ULTRA_RARE: { name: "Ultra Rare", color: 0xaa00ff, mult: 2.0, chance: 0.04 },
    LEGENDARY:  { name: "Legendary",  color: 0xffd700, mult: 3.0, chance: 0.01 }
});

// ============================================================================
// WEAPON DEFINITIONS
// ============================================================================

/** Weapons that create area-of-effect auras */
export const AURA_WEAPONS = Object.freeze(['ICE_AURA', 'SPIKE_RING', 'POISON_MIST']);

/**
 * Weapon definition
 * @typedef {Object} WeaponDef
 * @property {string} name - Display name
 * @property {string} desc - Description text
 * @property {string} type - Always 'weapon'
 */

/** @type {Object<string, WeaponDef>} */
export const WEAPONS = Object.freeze({
    // Standard weapons
    LIGHTNING:    { name: "Lightning Rod",   desc: "Auto-zaps nearby enemies", type: 'weapon' },
    GHOST:        { name: "Being Ghosted",   desc: "Spawns friendly ghost bombers", type: 'weapon' },
    FIREBALL:     { name: "Fireball",        desc: "Shoots explosive fireballs", type: 'weapon' },
    SWORD:        { name: "Spinning Blade",  desc: "Orbiting blade damages enemies", type: 'weapon' },
    MISSILE:      { name: "Slutty Missiles", desc: "Launches up, then aggressively seeks enemies", type: 'weapon' },

    // Area weapons
    SPIKE_RING:   { name: "Spike Ring",      desc: "Pulsing ring of spikes around you", type: 'weapon' },
    POISON_MIST:  { name: "Poison Mist",     desc: "Slowly damages nearby enemies", type: 'weapon' },
    ICE_AURA:     { name: "Ice Aura",        desc: "Chills and slows enemies close to you", type: 'weapon' },

    // Utility weapons
    MINI_TURRET:  { name: "Mini Turret",     desc: "Little bot that auto-shoots nearby foes", type: 'weapon' },
    NOVA_BLAST:   { name: "Nova Blast",      desc: "Occasional radial explosion from your position", type: 'weapon' },
    BANANERANG:   { name: "Bananerang",      desc: "Thrown banana that returns to you", type: 'weapon' },
    SUMMON_GHOST: { name: "Spooky Bois",     desc: "Summons friendly ghosts to attack enemies", type: 'weapon' },

    // Character-specific intrinsic weapons (upgradeable)
    KNIGHT_SWORD: { name: "Knight Sword",    desc: "Standard slash. Upgrades size & damage.", type: 'weapon' },
    BONE:         { name: "Bone Throw",      desc: "Ricocheting bone. Upgrades bounces & damage.", type: 'weapon' },
    CHAD_AURA:    { name: "Chad Aura",       desc: "Damage field. Upgrades radius & DPS.", type: 'weapon' },
    GIGA_SWORD:   { name: "Giga Sword",      desc: "Massive slash. Upgrades area & power.", type: 'weapon' }
});

// ============================================================================
// RUNE DEFINITIONS
// ============================================================================

/**
 * Rune definition
 * @typedef {Object} RuneDef
 * @property {string} name - Display name
 * @property {string} desc - Description text
 * @property {string} type - Always 'rune'
 * @property {string} stat - The stat this rune affects
 * @property {number} [mult] - Multiplicative bonus
 * @property {number} [add] - Additive bonus
 */

/** @type {Object<string, RuneDef>} */
export const RUNES = Object.freeze({
    // Core stat runes
    LANKY_HANDS: { name: "Lanky Hands", desc: "Increase pickup range",    type: 'rune', stat: 'pickupRange', mult: 1.4 },
    SPEED_BOOST: { name: "Speed Rune",  desc: "Move faster",              type: 'rune', stat: 'moveSpeed',   mult: 1.15 },
    MAX_HEALTH:  { name: "Health Rune", desc: "+20 max health",           type: 'rune', stat: 'maxHealth',   add: 20 },
    FIRE_RATE:   { name: "Haste Rune",  desc: "Attack faster",            type: 'rune', stat: 'fireRate',    mult: 1.15 },
    DAMAGE:      { name: "Power Rune",  desc: "More damage",              type: 'rune', stat: 'damage',      mult: 1.3 },

    // Utility runes
    ARMOR_PLATE: { name: "Armor Plate", desc: "Take less damage from hits",    type: 'rune', stat: 'armor',      add: 0.06 },
    REGEN_BONE:  { name: "Regen Bone",  desc: "Slowly regenerate health",      type: 'rune', stat: 'regen',      add: 1.1 },
    LAVA_BOOTS:  { name: "Lava Boots",  desc: "Reduce damage from lava",       type: 'rune', stat: 'lavaResist', add: 0.2 },
    WISDOM:      { name: "Wisdom Rune", desc: "Gain more XP from pickups",     type: 'rune', stat: 'xpGain',     mult: 1.2 },
    BIG_AURA:    { name: "Big Aura",    desc: "Increase area effects",         type: 'rune', stat: 'areaMult',   mult: 1.2 }
});

// ============================================================================
// UPGRADE DEFINITIONS
// ============================================================================

/**
 * Upgrade definition
 * @typedef {Object} UpgradeDef
 * @property {string} name - Display name
 * @property {string} baseDesc - Description with {VAL} placeholder
 * @property {string} type - Always 'upgrade'
 * @property {string} stat - The stat this upgrade affects
 * @property {number} add - Additive bonus per level
 * @property {boolean} [percent] - Whether to display as percentage
 */

/** @type {Object<string, UpgradeDef>} */
export const UPGRADES = Object.freeze({
    EXTRA_PROJECTILE: { name: "Multishot",       baseDesc: "+{VAL} projectile per attack", type: 'upgrade', stat: 'extraProjectiles', add: 1 },
    LUCK:             { name: "Bling Bling Chain", baseDesc: "+{VAL}% rarity chance",      type: 'upgrade', stat: 'luck',             add: 0.2, percent: true },
    VAMPIRISM:        { name: "Vampirism",       baseDesc: "Heal {VAL} HP per kill",       type: 'upgrade', stat: 'vampirism',        add: 1 },
    PIERCING:         { name: "Piercing Shots",  baseDesc: "Projectiles pierce {VAL}",     type: 'upgrade', stat: 'piercing',         add: 1 },
    CRITICAL:         { name: "Critical Strike", baseDesc: "+{VAL}% crit chance",          type: 'upgrade', stat: 'critChance',       add: 0.25, percent: true }
});

// ============================================================================
// CHARACTER DEFINITIONS
// ============================================================================

/**
 * Character definition
 * @typedef {Object} CharacterDef
 * @property {string} name - Display name
 * @property {number} maxHealth - Starting and max health
 * @property {number} moveSpeed - Movement speed multiplier
 * @property {number} baseDamage - Base damage multiplier
 * @property {number} fireRate - Attack speed multiplier
 * @property {string[]} startingWeapons - Array of weapon keys
 * @property {string} description - Character description
 * @property {boolean} [meleeOnly] - Whether character is melee-only
 * @property {boolean} [boneRicochet] - Calcium's ricochet ability
 * @property {number} [auraRadius] - GigaChad's aura radius
 * @property {number} [auraDps] - GigaChad's aura damage per second
 * @property {number} [flexCooldown] - GigaChad's flex ability cooldown
 */

/** @type {Object<string, CharacterDef>} */
export const CHARACTERS = Object.freeze({
    FOX: {
        name: 'Fox',
        maxHealth: 80,
        moveSpeed: 1.4,
        baseDamage: 0.7,
        fireRate: 1.1,
        startingWeapons: ['FIREBALL'],
        description: 'Fast, fragile caster with explosive fireballs.'
    },
    MMOOVT: {
        name: 'Mr. Mc. Oofy Otterson Vangough III',
        maxHealth: 190,
        moveSpeed: 0.9,
        baseDamage: 1.0,
        fireRate: 0.7,
        startingWeapons: ['KNIGHT_SWORD'],
        meleeOnly: true,
        description: 'Tanky knight with manual sword slashes.'
    },
    CALCIUM: {
        name: 'Calcium',
        maxHealth: 110,
        moveSpeed: 1.3,
        baseDamage: 0.9,
        fireRate: 0.9,
        startingWeapons: ['BONE'],
        boneRicochet: true,
        description: 'Speed-building skater skeleton with ricocheting bones.'
    },
    GIGACHAD: {
        name: 'GigaChad',
        maxHealth: 300,
        moveSpeed: 0.75,
        baseDamage: 0.8,
        fireRate: 0.6,
        startingWeapons: ['CHAD_AURA'],
        auraRadius: 3.5,
        auraDps: 3.5,
        flexCooldown: 15,
        description: 'Mega tank with damage aura and flex-based damage ignores.'
    },
    BLITZ: {
        name: 'Blitz',
        maxHealth: 140,
        moveSpeed: 1.0,
        baseDamage: 0.9,
        fireRate: 1.15,
        startingWeapons: ['LIGHTNING'],
        description: 'Balanced storm bot with innate lightning attacks.'
    },
    MONKE: {
        name: 'Monke',
        maxHealth: 130,
        moveSpeed: 1.25,
        baseDamage: 1.2,
        fireRate: 1.0,
        startingWeapons: ['BANANERANG'],
        description: 'Returns to monke. Throws bananas and has high agility.'
    },
    SIR_CHAD: {
        name: 'Sir Chadsirwellsirchadsirchadwellwell',
        maxHealth: 800,
        moveSpeed: 0.85,
        baseDamage: 1.5,
        fireRate: 0.65,
        startingWeapons: ['GIGA_SWORD'],
        meleeOnly: true,
        description: 'God Tank. Massive health and heavy damage.'
    },
    BOBERTO: {
        name: 'Boberto',
        maxHealth: 90,
        moveSpeed: 1.0,
        baseDamage: 1.0,
        fireRate: 1.0,
        startingWeapons: ['SUMMON_GHOST'],
        description: 'Summons friendly ghosts. Cannot attack directly.'
    }
});

// ============================================================================
// GAME BALANCE CONSTANTS
// ============================================================================

/** Physics and movement */
export const PHYSICS = Object.freeze({
    GRAVITY: -40,
    PLAYER_RADIUS: 1.0,
    JUMP_FORCE: 15,
    BASE_MOVE_SPEED_MULT: 1.5
});

/** Camera settings */
export const CAMERA = Object.freeze({
    DISTANCE: 11.5,
    HEIGHT: 6,
    FOV: 60,
    NEAR: 0.1,
    FAR: 200
});

/** Rendering settings */
export const RENDERING = Object.freeze({
    PIXEL_RATIO: 0.55,
    FOG_DENSITY: 0.012,
    BG_COLOR: 0xc6f2ff,
    TONE_MAPPING_EXPOSURE_PIXEL: 1.8,
    TONE_MAPPING_EXPOSURE_NORMAL: 1.0
});

/** Game progression */
export const PROGRESSION = Object.freeze({
    BASE_XP_TO_LEVEL: 14,
    DEFAULT_TIME_LIMIT: 600,
    MAX_WEAPONS: 3,
    MAX_RUNES: 4,
    PARTICLE_POOL_SIZE: 600
});

/** Enemy spawn rates by difficulty tier */
export const SPAWN_CONFIG = Object.freeze({
    BASE_SPAWN_INTERVAL: 2.0,
    MIN_SPAWN_INTERVAL: 0.3,
    SPAWN_DISTANCE_MIN: 15,
    SPAWN_DISTANCE_MAX: 30
});

// ============================================================================
// AUDIO CONFIGURATION
// ============================================================================

/** Background music playlist */
export const BGM_TRACKS = Object.freeze([
    './She Went Uber On My Thump.mp3',
    './Unthumpable!.mp3',
    './Thumpin\' Around.mp3',
    './Thump Thump, IDK WHAT THE MEANS BRO {insert crying emoji}.mp3',
    './Wednesday morning Thump it\'s 9am.mp3'
]);

/** Sound effect paths */
export const SFX = Object.freeze({
    BONK: './bonk.mp3',
    BOOM: './boom.mp3'
});

// ============================================================================
// TNS (STORY MODE) CONFIGURATION
// ============================================================================

/** Characters available by story tier */
export const TNS_TIER_CHARACTERS = Object.freeze({
    1: ['MMOOVT', 'FOX', 'CALCIUM'],
    2: ['MMOOVT', 'FOX', 'CALCIUM', 'GIGACHAD', 'BLITZ', 'MONKE'],
    3: ['MMOOVT', 'FOX', 'CALCIUM', 'GIGACHAD', 'BLITZ', 'MONKE', 'SIR_CHAD', 'BOBERTO']
});

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Get a random rarity based on luck stat
 * @param {number} luck - Luck modifier (0-1 scale)
 * @returns {string} Rarity key
 */
export function getRandomRarity(luck = 0) {
    const roll = Math.random() - luck;
    let cumulative = 0;

    for (const [key, rarity] of Object.entries(RARITIES)) {
        cumulative += rarity.chance;
        if (roll <= cumulative) {
            return key;
        }
    }
    return 'COMMON';
}

/**
 * Check if a weapon is an aura type
 * @param {string} weaponKey - Weapon key to check
 * @returns {boolean}
 */
export function isAuraWeapon(weaponKey) {
    return AURA_WEAPONS.includes(weaponKey);
}

/**
 * Get character config with defaults
 * @param {string} key - Character key
 * @returns {CharacterDef|null}
 */
export function getCharacter(key) {
    return CHARACTERS[key] || null;
}

/**
 * Get allowed characters for TNS tier
 * @param {number} tier - Story tier (1-4)
 * @returns {string[]}
 */
export function getTNSCharacters(tier) {
    if (tier >= 3) return TNS_TIER_CHARACTERS[3];
    if (tier >= 2) return TNS_TIER_CHARACTERS[2];
    return TNS_TIER_CHARACTERS[1];
}
