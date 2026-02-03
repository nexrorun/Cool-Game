/**
 * @fileoverview Main Game class for UberThump
 * This is the core game engine handling rendering, physics, combat, and game state.
 *
 * @module game/game
 */

import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { ParticleSystem, XPOrb, randomRange, SeededRandom } from './utils.js';

// Fallback color texture generator
function createColorTexture(color, width = 64, height = 64) {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, width, height);
    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.colorSpace = THREE.SRGBColorSpace;
    return texture;
}

// Load texture with fallback color - returns fallback immediately, swaps in real texture on success
function loadTextureWithFallback(url, fallbackColor, repeatX = 1, repeatY = 1) {
    // Start with fallback texture
    const fallback = createColorTexture(fallbackColor);
    fallback.repeat.set(repeatX, repeatY);
    fallback.fallbackColor = fallbackColor;

    const texLoader = new THREE.TextureLoader();
    texLoader.load(
        encodeURI(url),
        // onLoad - texture loaded successfully, copy image to fallback
        (loadedTex) => {
            console.log(`Texture loaded: ${url}`);
            fallback.image = loadedTex.image;
            fallback.needsUpdate = true;
        },
        // onProgress
        undefined,
        // onError - keep fallback
        (err) => {
            console.warn(`Failed to load texture ${url}, using fallback color ${fallbackColor}`);
        }
    );

    return fallback;
}

const RARITIES = {

    COMMON: { name: "Common", color: 0xaaaaaa, mult: 1.0, chance: 0.50 },
    UNCOMMON: { name: "Uncommon", color: 0x00ff00, mult: 1.2, chance: 0.30 },
    RARE: { name: "Rare", color: 0x0088ff, mult: 1.5, chance: 0.15 },
    ULTRA_RARE: { name: "Ultra Rare", color: 0xaa00ff, mult: 2.0, chance: 0.04 },
    LEGENDARY: { name: "Legendary", color: 0xffd700, mult: 3.0, chance: 0.01 }
};

const AURA_WEAPONS = ['ICE_AURA', 'SPIKE_RING', 'POISON_MIST'];

const WEAPONS = {
    LIGHTNING:   { name: "Lightning Rod", desc: "Auto-zaps nearby enemies", type: 'weapon' },
    GHOST:       { name: "Being Ghosted", desc: "Spawns friendly ghost bombers", type: 'weapon' },
    FIREBALL:    { name: "Fireball", desc: "Shoots explosive fireballs", type: 'weapon' },
    SWORD:       { name: "Spinning Blade", desc: "Orbiting blade damages enemies", type: 'weapon' },
    MISSILE:     { name: "Slutty Missiles", desc: "Launches up, then aggressively seeks enemies", type: 'weapon' },

    // New extra weapons
    SPIKE_RING:  { name: "Spike Ring", desc: "Pulsing ring of spikes around you", type: 'weapon' },
    POISON_MIST: { name: "Poison Mist", desc: "Slowly damages nearby enemies", type: 'weapon' },
    ICE_AURA:    { name: "Ice Aura", desc: "Chills and slows enemies close to you", type: 'weapon' },
    MINI_TURRET: { name: "Mini Turret", desc: "Little bot that auto-shoots nearby foes", type: 'weapon' },
    NOVA_BLAST:  { name: "Nova Blast", desc: "Occasional radial explosion from your position", type: 'weapon' },
    BANANERANG:  { name: "Bananerang", desc: "Thrown banana that returns to you", type: 'weapon' },
    SUMMON_GHOST: { name: "Spooky Bois", desc: "Summons friendly ghosts to attack enemies", type: 'weapon' },
    
    // Intrinsic Weapons (Made upgradeable)
    KNIGHT_SWORD: { name: "Knight Sword", desc: "Standard slash. Upgrades size & damage.", type: 'weapon' },
    BONE: { name: "Bone Throw", desc: "Ricocheting bone. Upgrades bounces & damage.", type: 'weapon' },
    CHAD_AURA: { name: "Chad Aura", desc: "Damage field. Upgrades radius & DPS.", type: 'weapon' },
    GIGA_SWORD: { name: "Giga Sword", desc: "Massive slash. Upgrades area & power.", type: 'weapon' }
};

const RUNES = {
    LANKY_HANDS: { name: "Lanky Hands", desc: "Increase pickup range", type: 'rune', stat: 'pickupRange', mult: 1.4 },
    SPEED_BOOST: { name: "Speed Rune", desc: "Move faster", type: 'rune', stat: 'moveSpeed', mult: 1.15 },
    MAX_HEALTH:  { name: "Health Rune", desc: "+20 max health", type: 'rune', stat: 'maxHealth', add: 20 },
    FIRE_RATE:   { name: "Haste Rune", desc: "Attack faster", type: 'rune', stat: 'fireRate', mult: 1.15 },
    DAMAGE:      { name: "Power Rune", desc: "More damage", type: 'rune', stat: 'damage', mult: 1.3 },

    // New extra runes (small buffs)
    ARMOR_PLATE: { name: "Armor Plate", desc: "Take less damage from hits", type: 'rune', stat: 'armor', add: 0.06 },
    REGEN_BONE:  { name: "Regen Bone", desc: "Slowly regenerate health over time", type: 'rune', stat: 'regen', add: 1.1 },
    LAVA_BOOTS:  { name: "Lava Boots", desc: "Reduce damage taken from lava", type: 'rune', stat: 'lavaResist', add: 0.2 },
    WISDOM:      { name: "Wisdom Rune", desc: "Gain more XP from pickups", type: 'rune', stat: 'xpGain', mult: 1.2 },
    BIG_AURA:    { name: "Big Aura", desc: "Increase area effects like aura and spikes", type: 'rune', stat: 'areaMult', mult: 1.2 }
};

const UPGRADES = {
    EXTRA_PROJECTILE: { name: "Multishot", baseDesc: "+{VAL} projectile per attack", type: 'upgrade', stat: 'extraProjectiles', add: 1 },
    LUCK: { name: "Bling Bling Chain", baseDesc: "+{VAL}% rarity chance", type: 'upgrade', stat: 'luck', add: 0.2, percent: true },
    VAMPIRISM: { name: "Vampirism", baseDesc: "Heal {VAL} HP per kill", type: 'upgrade', stat: 'vampirism', add: 1 },
    PIERCING: { name: "Piercing Shots", baseDesc: "Projectiles pierce {VAL} enemies", type: 'upgrade', stat: 'piercing', add: 1 },
    CRITICAL: { name: "Critical Strike", baseDesc: "+{VAL}% crit chance", type: 'upgrade', stat: 'critChance', add: 0.25, percent: true }
};

const CHARACTERS = {
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
        // Slightly smaller, much lower-DPS aura so he no longer one-shots waves
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
        startingWeapons: ['GIGA_SWORD'], // Uses manual sword
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
};


window.CHARACTERS = CHARACTERS;

export class Game {
    constructor(characterKey = 'MMOOVT', pixelateEnabled = true, useCharacterTheme = false, gameMode = 'ARCADE', room = null, lobbySettings = null, seed = null) {
        this.container = document.getElementById('game-container');
        this.debugMode = false; // Dev setting for logs
        this.room = room; // WebsimSocket instance
        this.lobbySettings = lobbySettings || {}; // New settings object
        this.customWorldData = lobbySettings ? lobbySettings.customWorldData : null;
        this.rng = seed ? new SeededRandom(seed) : null;
        
        // Multiplayer State
        this.remotePlayers = {}; // Map of id -> { mesh, data, targetPos }
        this.lastSyncTime = 0;

        // Safety stubs: ensure terrain helpers exist even if createWorld hasn't run yet.
        // Some init paths may call updatePlayer or other code before createWorld defines the real functions.
        // These lightweight fallbacks prevent "is not a function" errors and will be replaced by createWorld().
        this.getTerrainHeight = (x, z) => {
            // default flat ground at y=0 until real terrain is generated
            return 0;
        };
        this.isOnPlatformOrRamp = (x, z) => {
            // default: treat center area as safe; otherwise consider lava by default
            // keep conservative: return true for origin +/- 20 units so scatterProps and tree placement can run safely
            const dx = x || 0;
            const dz = z || 0;
            return (Math.abs(dx) <= 20 && Math.abs(dz) <= 20);
        };

        // Lightweight isLava fallback so code paths that query lava before the world is built won't throw.
        // It conservatively treats anything not on a platform/ramp as lava disabled during init.
        this.isLava = (x, z) => {
            try {
                // If the real implementation exists, prefer it.
                if (typeof this.isLava === 'function' && this.isLava !== arguments.callee) {
                    // won't call to avoid recursion; fallthrough to safe check below
                }
            } catch(e) {}
            // Until createWorld defines the full logic, assume non-platform locations are non-lava to avoid early kills.
            // This is safer during initialization; real behavior is set in createWorld().
            return !this.isOnPlatformOrRamp(x, z) ? false : false;
        };
        this.gameMode = gameMode;
        // Multiplayer mode: no pause and no minimap / objectives
        this.allowPause = this.gameMode !== 'MULTI';
        this.useCharacterTheme = useCharacterTheme;
        this.healthBar = document.getElementById('health-bar');
        this.healthText = document.getElementById('health-text');
        this.levelDisplay = document.getElementById('level-display');
        this.xpBar = document.getElementById('xp-bar');
        this.timerEl = document.getElementById('timer');
        this.killCounter = document.getElementById('kill-counter');
        this.upgradeMenu = document.getElementById('upgrade-menu');
        this.upgradeOptions = document.getElementById('upgrade-options');
        this.gameOverScreen = document.getElementById('game-over-screen');
        this.gameOverStats = document.getElementById('game-over-stats');
        this.toastEl = document.getElementById('loot-toast');
        // Use the actual title element ID from index.html
        this.gameOverTitle = document.getElementById('go-title');
        this.weaponListEl = document.getElementById('weapon-list');
        this.buffListEl = document.getElementById('buff-list');
        this.minimapCanvas = document.getElementById('minimap');
        this.minimapCtx = this.minimapCanvas ? this.minimapCanvas.getContext('2d') : null;
        this.bigMapOverlay = document.getElementById('big-map-overlay');
        this.bigMapCanvas = document.getElementById('big-map-canvas');
        this.bigMapCtx = this.bigMapCanvas ? this.bigMapCanvas.getContext('2d') : null;
        
        // Pixelation toggle
        // Gameplay rule: Awakening ALWAYS forces pixelation; for other modes respect the incoming preference.
        this.pixelateEnabled = (gameMode === 'AWAKENING') ? true : !!pixelateEnabled;
        
        // Character selection
        this.characterKey = CHARACTERS[characterKey] ? characterKey : 'MMOOVT';
        this.characterConfig = CHARACTERS[this.characterKey];

        this.width = window.innerWidth;
        this.height = window.innerHeight;
        
        // Scene
        this.scene = new THREE.Scene();
        // Fog heightened significantly as requested
        this.scene.background = new THREE.Color(0xc6f2ff);
        this.scene.fog = new THREE.FogExp2(0xc6f2ff, 0.012);

        // Camera
        this.camera = new THREE.PerspectiveCamera(60, this.width / this.height, 0.1, 200);
        // Slightly zoomed out so you see more chaos around you
        this.cameraDistance = 11.5;
        this.cameraHeight = 6;

        // Renderer with better quality
        this.renderer = new THREE.WebGLRenderer({ antialias: false });
        this.renderer.setSize(this.width, this.height);
        // Disable shadow maps to avoid the heavy dark "shade circle" around the player
        this.renderer.shadowMap.enabled = false;
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
        // Pixel mode tends to look darker – bump exposure when pixelation is enabled
        this.renderer.toneMappingExposure = this.pixelateEnabled ? 1.8 : 1.0;
        this.container.appendChild(this.renderer.domElement);
        
        // Pixelation effect: render to a low-res target, then blow it up with nearest filtering
        // Lower pixelRatio = chunkier pixels
        // Increased to 0.55 per user request to ease pixelation
        this.pixelRatio = 0.55;
        this.renderTarget = new THREE.WebGLRenderTarget(
            Math.floor(this.width * this.pixelRatio),
            Math.floor(this.height * this.pixelRatio)
        );
        this.renderTarget.texture.minFilter = THREE.NearestFilter;
        this.renderTarget.texture.magFilter = THREE.NearestFilter;
        this.renderTarget.texture.generateMipmaps = false;

        // Fullscreen quad to display the pixelated texture with a retro color-quantizing shader
        this.fsScene = new THREE.Scene();
        this.fsCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
        const fsGeo = new THREE.PlaneGeometry(2, 2);
        const fsMat = new THREE.ShaderMaterial({
            uniforms: {
                tDiffuse: { value: this.renderTarget.texture }
            },
            vertexShader: `
                varying vec2 vUv;
                void main() {
                    vUv = uv;
                    gl_Position = vec4(position, 1.0);
                }
            `,
            fragmentShader: `
                varying vec2 vUv;
                uniform sampler2D tDiffuse;

                vec3 posterize(vec3 color, float steps) {
                    return floor(color * steps) / steps;
                }

                vec3 quantizePalette(vec3 c) {
                    c = posterize(c, 5.0);
                    vec3 boosted = vec3(
                        c.r > 0.5 ? 1.0 : c.r,
                        c.g > 0.5 ? 1.0 : c.g,
                        c.b > 0.5 ? 1.0 : c.b
                    );
                    return mix(c, boosted, 0.4);
                }

                void main() {
                    vec4 col = texture2D(tDiffuse, vUv);
                    vec3 quant = quantizePalette(col.rgb);

                    // Reduced contrast/brightness boost (was 1.4)
                    quant *= 1.05;
                    quant = clamp(quant, 0.0, 1.0);

                    gl_FragColor = vec4(quant, col.a);
                }
            `
        });
        this.fsQuad = new THREE.Mesh(fsGeo, fsMat);
        this.fsScene.add(this.fsQuad);

        // Better lighting setup
        const ambientLight = new THREE.AmbientLight(0xffffff, 1.1);
        this.scene.add(ambientLight);

        const dirLight = new THREE.DirectionalLight(0xfff4e6, 1.8);
        dirLight.position.set(15, 25, 10);
        // Turn off directional light shadows to remove the big dark green circle artifact
        dirLight.castShadow = false;
        dirLight.shadow.mapSize.width = 2048;
        dirLight.shadow.mapSize.height = 2048;
        dirLight.shadow.camera.near = 0.5;
        dirLight.shadow.camera.far = 60;
        dirLight.shadow.camera.left = -40;
        dirLight.shadow.camera.right = 40;
        dirLight.shadow.camera.top = 40;
        dirLight.shadow.camera.bottom = -40;
        dirLight.shadow.bias = -0.0001;
        this.scene.add(dirLight);
        
        // Add fill light for better character visibility
        const fillLight = new THREE.DirectionalLight(0xbde0fe, 0.9);
        fillLight.position.set(-10, 10, -10);
        this.scene.add(fillLight);
        
        // Hemisphere light for natural outdoor look
        const hemiLight = new THREE.HemisphereLight(0xbfe9ff, 0x4caf50, 1.0);
        this.scene.add(hemiLight);

        // Physics
        this.world = new CANNON.World();
        this.world.gravity.set(0, -40, 0);

        // Input
        this.keys = { w: false, a: false, s: false, d: false, space: false, q: false };
        this.canJump = true;
        this.moveVector = new THREE.Vector2(0, 0);
        this.mouseMovement = { x: 0, y: 0 };
        this.cameraRotation = 0;
        // Respect the gameMode passed into the constructor (do not override here)
        this.evolutionStats = { health: 0, speed: 0, offense: 0 };
        this.hasEvolved = false;
        this.graves = [];
        this.tnsTier = 1;
        
        // TNS Save Handling
        if (this.gameMode === 'TNS' && this.lobbySettings.tnsData) {
            this.tnsTier = this.lobbySettings.tnsData.tier || 1;
            this.tier = this.tnsTier; // Ensure global scaling matches story tier
            // Character already set via constructor arg from main.js
        }

        // Player physical radius (used for grounding and collider size)
        this.playerRadius = 1.0;

        // Apply Lobby Settings
        this.timeLimit = this.lobbySettings.timeLimit || 600; // Default 10m
        this.spawnRateMultiplier = this.lobbySettings.spawnMult || 1.0;
        this.lootMultiplier = this.lobbySettings.lootMult || 1.0;
        this.infiniteSlots = !!this.lobbySettings.infiniteSlots;
        
        // Pantheon State
        this.placedObjects = []; // {type, x, y, z, rotation, data}
        this.activeTool = null; // Current selected spawn tool
        this.isFlying = false;
        this.lastSpaceTime = 0;
        
        // Ensure intrinsic weapons are in inventory logic even if not added yet
        // (Handled in constructor later)

        // Game State
        this.isPlaying = false;
        this.isPaused = false;
        this.screenShake = 0;
        this.damageNumbers = [];
        this.gameTime = 0;
        this.kills = 0;
        this.level = 1;
        this.xp = 0;
        // Easier early levelling
        this.xpToLevel = 14;
        this.playerHealth = this.characterConfig ? this.characterConfig.maxHealth : 100;
        this.maxHealth = this.characterConfig ? this.characterConfig.maxHealth : 100;
        this.coins = 0;
        // Snapshot used to compute chest price scaling — only updated when a chest is opened.
        // This prevents kills (which change coins) from immediately increasing chest prices.
        this.chestBaselineCoins = this.coins;
        this.buffs = [];
        this.chests = [];
        this.shrines = [];
        this.turrets = [];
        this.skeletonKills = 0;
        this.enemyBullets = [];
        this.auraVisuals = {}; 
        // Track all decorative props (trees, rocks, ruins, shrine groups, chest meshes, etc.)
        this.props = [];
        // Secret lore note (3D pickup) for meta-story
        this.secretNote = null;
        this.runFoundSecretNote = false;
        
        // Textures - with color fallbacks if loading fails
        // Grass = green, Side = brown, Rock = grey
        this.grassTex = loadTextureWithFallback('./a-texture-for-grass.jpg', '#228B22', 4, 4);
        this.sideTex = loadTextureWithFallback('./side.jpg', '#8B4513', 2, 1);
        this.rockTex = loadTextureWithFallback('./texture-for-grey-rock.jpg', '#808080', 6, 6);
        
        // Stats - Speed boosted by 1.5x as requested
        const baseFireRate = this.characterConfig ? this.characterConfig.fireRate : 0.8;
        const baseDamage = this.characterConfig ? this.characterConfig.baseDamage : 0.7;
        // Base move speed boost for overall snappier gameplay
        let baseMoveSpeed = (this.characterConfig ? this.characterConfig.moveSpeed : 1) * 1.5;
        // Give GigaChad a modest unique swagger boost so he isn't painfully slow,
        // but keep him noticeably slower than agile characters.
        if (this.characterKey === 'GIGACHAD') {
            baseMoveSpeed *= 1.18; // ~18% bump to make swagger useful without turning him fast
        }

        this.stats = {
            projectileSpeed: 1,
            fireRate: baseFireRate,
            damage: baseDamage,
            moveSpeed: baseMoveSpeed,
            pickupRange: 8,
            attackRange: 15,
            extraProjectiles: 0,
            luck: 0,
            vampirism: 0,
            piercing: 0,
            critChance: 0,

            // New buffable stats
            armor: 0,        // percentage reduction, 0–1
            regen: 0,        // HP per second
            lavaResist: 0,   // percentage reduction, 0–1
            xpGain: 1,       // multiplier
            areaMult: 1      // area / radius multiplier
        };
        
        // Weapon/Rune system
        this.weapons = ['DEFAULT']; // base default
        if (this.characterConfig && Array.isArray(this.characterConfig.startingWeapons)) {
            this.weapons.push(...this.characterConfig.startingWeapons);
        }
        // Track aura ownership for unlocks
        // this.updateAuraOwnership(); // Deprecated check
        // Tighter build choices
        this.maxWeapons = 3;
        this.maxRunes = 4;
        
        // TNS: Expanded Inventory
        if (this.gameMode === 'TNS') {
            this.maxWeapons = 6;
            this.maxRunes = 13;
        }

        this.runes = [];
        this.weaponLevels = { DEFAULT: 1 };
        this.runeLevels = {};
        
        // Weapon timers
        this.weaponTimers = {};
        this.ghosts = [];
        this.orbitingBlades = [];
        
        // Entities
        this.enemies = [];
        this.projectiles = [];
        this.xpOrbs = [];
        
        // Systems
        this.particleSystem = new ParticleSystem(this.scene);
        
        // Timers
        this.autoAttackTimer = 0;
        this.spawnTimer = 0;
        
        // Weapon helpers
        this.turrets = [];

        // Unlock tracking
        this.skeletonKills = 0;
        this.minibossKilledAsMMOOVT = false;

        // Audio
        this.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        this.analyser = this.audioCtx.createAnalyser();
        this.analyser.fftSize = 256;
        this.audioDataArray = new Uint8Array(this.analyser.frequencyBinCount);
        
        this.sounds = {};
        this.loadSound('./bonk.mp3', 'bonk');
        this.loadSound('./boom.mp3', 'boom');
        
        // Music Playlist
        this.bgmTracks = [
            './She Went Uber On My Thump.mp3',
            './Unthumpable!.mp3',
            './Thumpin\' Around.mp3',
            './Thump Thump, IDK WHAT THE MEANS BRO {insert crying emoji}.mp3',
            './Wednesday morning Thump it\'s 9am.mp3'
        ];
        this.currentBgmNode = null;
        this.currentBgmGain = null;
        this.currentTrackIndex = -1;
        this.isOvertimeMusic = false;
        
        this.terrainHeightCache = {};
        this.ramps = [];
        this.slashes = [];

        // Gameplay helpers
        this.safeRadius = 36;       // central arena radius that is not lava
        this.lavaDamageTimer = 0;   // accumulates time spent in lava
        this.lavaHeight = 0;        // overtime lava level above base ground
        this.lavaGroundY = -2;     // base lava surface Y (restores lava plane)
        this.overtimeActive = false;
        this.overtimeStartTime = 0;
        this.tier = 1;              // Endless tier level
        this._tierTransitioning = false; // guard to prevent multiple concurrent tier transitions
        this.spawnRateMultiplier = 1.0; 
        this.ghostSpawnRate = 1.0;  // Preserved between tiers

        // Simple world collision for player vs props
        this.obstacles = [];

        // Boss / victory
        this.bossPortal = null;
        this.bossEnemy = null;
        this.minibossesDefeated = 0;
        this.bossPortalActivated = false;
        this.bossArena = null;
        this.victoryTriggered = false; // Prevent win spam

        // Fog of War
        this.fogResolution = 512;
        this.fogCanvas = document.createElement('canvas');
        this.fogCanvas.width = this.fogResolution;
        this.fogCanvas.height = this.fogResolution;
        this.fogCtx = this.fogCanvas.getContext('2d');
        // Initialize fog (black)
        this.fogCtx.fillStyle = 'black';
        this.fogCtx.fillRect(0, 0, this.fogResolution, this.fogResolution);
        
        // Spawn timestamps for boss events (using time remaining logic)
        // Game starts at 600s remaining.
        // Spawn 1: 4 mins passed (6 mins remaining = 360s gameTime)
        // Spawn 2: 7 mins passed (3 mins remaining = 180s left -> 420s gameTime)
        // Wait, user said: "6 minute mark at 10 minute countdown" -> 4 mins passed -> 240s gameTime
        // User said: "second spawns at the 4 minute" (mark?) -> if 4 min mark, that's 6 mins passed -> 360s gameTime
        // Let's use:
        this.bossEvents = [
            { time: 240, spawned: false }, // 6 min mark (4 mins in)
            { time: 360, spawned: false }  // 4 min mark (6 mins in)
        ];

        // Ghost overtime spawn control
        this.ghostSpawnTimer = 0;

        // Overtime Bob spawn control (Arcade only)
        // First Bob: 2.5 minutes (150s), then every 120s, each spawn decreases interval by 30s down to 30s minimum.
        this.bobSpawnTimer = 0;
        this.bobNextSpawnTime = 150; // 2.5 minutes
        this.bobSpawnInterval = 120; // initial interval between Bobs (seconds)
        this.bobMinInterval = 30;    // minimum interval cap (seconds)
        this.bobSpawnCount = 0;      // how many overtime bobs have spawned so far

        // Intro / portal sequence
        this.inIntro = false;
        this.introTime = 0;
        this.introDuration = 2.8;
        this.portalGroup = null;
        this.portalRing = null;
        this.portalCore = null;
        this.introStartPos = new THREE.Vector3();
        this.introEndPos = new THREE.Vector3();

        // Simple animation state
        this.playerWalkTime = 0;
        this.toastTimeout = null;

        // Character-specific state
        this.knightSlashCooldown = 0;
        this.calciumSpeedCharge = 0;
        this.calciumDustTimer = 0;
        this.lastFlexTime = -999;

        // Initial HUD
        if (this.healthBar) {
            this.healthBar.style.width = '100%';
        }
    }
    
    initPantheonUI() {
        const ui = document.getElementById('pantheon-ui');
        if (!ui) return;
        ui.style.display = 'block';
        
        const menu = document.getElementById('pantheon-menu');
        const close = document.getElementById('pan-close');
        const tabs = document.querySelectorAll('.pan-tab');
        const contents = document.querySelectorAll('.pan-content');
        
        // Toggle menu with P
        window.addEventListener('keydown', (e) => {
            if (e.key.toLowerCase() === 'p') {
                if (menu.style.display === 'none') {
                    menu.style.display = 'flex';
                    this.isPaused = true;
                    if (document.exitPointerLock) document.exitPointerLock();
                } else {
                    menu.style.display = 'none';
                    this.isPaused = false;
                    // re-lock? maybe on click
                }
            }
        });
        
        close.onclick = () => {
            menu.style.display = 'none';
            this.isPaused = false;
        };
        
        // Tabs
        tabs.forEach(t => {
            t.onclick = () => {
                tabs.forEach(x => x.classList.remove('active'));
                t.classList.add('active');
                contents.forEach(c => c.style.display = 'none');
                document.getElementById('pan-content-' + t.dataset.tab).style.display = t.dataset.tab === 'enemies' || t.dataset.tab === 'structures' ? 'grid' : 'flex';
            };
        });
        
        // Populate Tools
        const enemiesDiv = document.getElementById('pan-content-enemies');
        const structDiv = document.getElementById('pan-content-structures');
        
        const addTool = (container, name, type, id) => {
            const btn = document.createElement('button');
            btn.className = 'pan-btn';
            btn.textContent = name;
            btn.onclick = () => {
                this.activeTool = { type, id, name };
                document.getElementById('pan-selected-tool').textContent = name;
                menu.style.display = 'none';
                this.isPaused = false;
                this.showToast(`Equipped: ${name}`);
            };
            container.appendChild(btn);
        };
        
        // Enemies
        addTool(enemiesDiv, 'Skeleton', 'enemy', 'skeleton');
        addTool(enemiesDiv, 'Ogre', 'enemy', 'ogre');
        addTool(enemiesDiv, 'Piglin', 'enemy', 'piglin');
        addTool(enemiesDiv, 'Zombie', 'enemy', 'zombie');
        addTool(enemiesDiv, 'Spider', 'enemy', 'spider');
        addTool(enemiesDiv, 'Ghost (Weak)', 'ghost', 'ghost_default');
        addTool(enemiesDiv, 'Ghost (Deadly)', 'ghost', 'ghost_deadly');
        addTool(enemiesDiv, 'John Pork (Mini)', 'miniboss', 'JOHN_PORK');
        addTool(enemiesDiv, 'Karen (Mini)', 'miniboss', 'KAREN');
        addTool(enemiesDiv, 'Bruh-nubis (Mini)', 'miniboss', 'BRUH_NUBIS');
        addTool(enemiesDiv, 'Babybark', 'boss', 'Babybark');
        addTool(enemiesDiv, 'Smolbark', 'boss', 'Smolbark');
        addTool(enemiesDiv, 'Chadbark', 'boss', 'Chadbark');
        addTool(enemiesDiv, 'Barkvader', 'boss', 'Barkvader');
        addTool(enemiesDiv, 'Gatekeeper', 'boss', 'Gatekeeper');
        addTool(enemiesDiv, 'Bob (Normal)', 'bob', 'BOB');
        addTool(enemiesDiv, 'Bob (Deadly)', 'bob', 'DEADLY_BOB');
        addTool(enemiesDiv, 'Bob (Overtime)', 'bob', 'OVERTIME_BOB');
        
        // Structures
        addTool(structDiv, 'Tree', 'prop', 'tree');
        addTool(structDiv, 'Rock', 'prop', 'rock');
        addTool(structDiv, 'Pillar', 'prop', 'pillar');
        addTool(structDiv, 'Ruins', 'prop', 'ruins');
        addTool(structDiv, 'Chest', 'chest', 'chest');
        addTool(structDiv, 'Shrine', 'shrine', 'shrine');
        addTool(structDiv, 'Boss Portal', 'portal', 'portal');
        addTool(structDiv, 'Platform (Small)', 'platform', 'small');
        addTool(structDiv, 'Platform (Med)', 'platform', 'medium');
        addTool(structDiv, 'Platform (Large)', 'platform', 'large');
        addTool(structDiv, 'Wall (Block)', 'wall', 'wall'); // New
        addTool(structDiv, 'Ramp (Short)', 'ramp', 'short');
        addTool(structDiv, 'Ramp (Long)', 'ramp', 'long');
        addTool(structDiv, 'Ramp (Steep)', 'ramp', 'steep');
        
        // World
        document.getElementById('pan-export-btn').onclick = () => this.exportWorld();
        document.getElementById('pan-clear-btn').onclick = () => {
            if(confirm("Clear everything?")) {
                this.clearWorld();
                this.createWorld(); // reset to base
                this.placedObjects = [];
            }
        };
        
        // NEW: Player Tab & Time Scale
        document.getElementById('pan-timescale').oninput = (e) => {
            this.timeScale = parseFloat(e.target.value);
            document.getElementById('pan-timescale-val').innerText = this.timeScale.toFixed(1) + 'x';
        };
        
        const refreshPlayerTab = () => {
            const list = document.getElementById('pan-player-list');
            if(!list) return;
            list.innerHTML = '';
            
            // Weapons
            this.weapons.forEach(w => {
                const lvl = this.weaponLevels[w] || 1;
                const d = document.createElement('div');
                d.style.marginBottom = '4px';
                d.innerHTML = `
                    <span style="color:#00ffff">${w} Lv${lvl}</span>
                    <button class="pan-mini-btn" data-act="upg_w" data-key="${w}">+</button>
                    <button class="pan-mini-btn" data-act="rem_w" data-key="${w}">x</button>
                `;
                list.appendChild(d);
            });
            // Pantheon Mode Switch
            const modeDiv = document.createElement('div');
            modeDiv.style.marginBottom = '10px';
            modeDiv.style.paddingBottom = '10px';
            modeDiv.style.borderBottom = '1px solid #333';
            modeDiv.innerHTML = `
                <div style="font-size:0.8rem;color:#aaa;margin-bottom:5px;">GAME MODE</div>
                <div style="display:flex;gap:10px;">
                    <button class="pan-btn" id="pan-mode-creative" style="flex:1;${this.pantheonState==='CREATIVE'?'border-color:#00ffff;color:#00ffff':''}">CREATIVE</button>
                    <button class="pan-btn" id="pan-mode-survive" style="flex:1;${this.pantheonState==='SURVIVAL'?'border-color:#ff4444;color:#ff4444':''}">SURVIVE</button>
                </div>
            `;
            list.appendChild(modeDiv);
            
            // Mode listeners
            setTimeout(() => {
                const btnC = document.getElementById('pan-mode-creative');
                const btnS = document.getElementById('pan-mode-survive');
                if(btnC) btnC.onclick = () => { 
                    this.pantheonState = 'CREATIVE'; 
                    this.showToast("Creative Mode: Invincible + Flight + Bonk Music"); 
                    this.startBGM(); 
                    refreshPlayerTab(); 
                };
                if(btnS) btnS.onclick = () => { 
                    this.pantheonState = 'SURVIVAL'; 
                    this.isFlying = false; // Disable flight
                    this.showToast("Survive Mode: Mortal + Normal Music"); 
                    this.startBGM(); 
                    refreshPlayerTab(); 
                };
            }, 0);

            // Add Weapon Dropdown
            const wSel = document.createElement('select');
            wSel.style.maxWidth = '120px';
            wSel.innerHTML = `<option value="">Add Weapon...</option>`;
            Object.keys(WEAPONS).forEach(k => {
                if(!this.weapons.includes(k)) wSel.innerHTML += `<option value="${k}">${WEAPONS[k].name}</option>`;
            });
            wSel.onchange = (e) => {
                if(e.target.value) {
                    this.weapons.push(e.target.value);
                    this.weaponLevels[e.target.value] = 1;
                    refreshPlayerTab();
                    this.updateLoadoutUI();
                }
            };
            list.appendChild(wSel);
            
            // Buffs
            this.runes.forEach(r => {
                const lvl = this.runeLevels[r] || 1;
                const d = document.createElement('div');
                d.style.marginBottom = '4px';
                d.style.marginTop = '4px';
                d.innerHTML = `
                    <span style="color:#00ff88">${r} Lv${lvl}</span>
                    <button class="pan-mini-btn" data-act="upg_r" data-key="${r}">+</button>
                    <button class="pan-mini-btn" data-act="rem_r" data-key="${r}">x</button>
                `;
                list.appendChild(d);
            });
            
            // Character Skin
            const cSel = document.createElement('select');
            cSel.style.marginTop = '10px';
            cSel.innerHTML = '';
            Object.keys(CHARACTERS).forEach(k => {
                cSel.innerHTML += `<option value="${k}" ${this.characterKey===k?'selected':''}>${CHARACTERS[k].name}</option>`;
            });
            cSel.onchange = (e) => {
                if(e.target.value && e.target.value !== this.characterKey) {
                    this.evolveCharacter(e.target.value);
                }
            };
            list.appendChild(cSel);
            
            // Button Listeners
            list.querySelectorAll('.pan-mini-btn').forEach(b => {
                b.onclick = (e) => {
                    const k = b.dataset.key;
                    if(b.dataset.act === 'upg_w') this.weaponLevels[k]++;
                    if(b.dataset.act === 'rem_w') {
                        this.weapons = this.weapons.filter(x => x !== k);
                        delete this.weaponLevels[k];
                    }
                    if(b.dataset.act === 'upg_r') {
                        this.runeLevels[k]++;
                        this.applyRune(k);
                    }
                    if(b.dataset.act === 'rem_r') {
                        this.runes = this.runes.filter(x => x !== k);
                        delete this.runeLevels[k];
                        // Cannot easily un-apply stats without recalc, so stats remain buffed.
                    }
                    refreshPlayerTab();
                    this.updateLoadoutUI();
                };
            });
        };
        
        document.querySelector('.pan-tab[data-tab="player"]').onclick = () => {
            tabs.forEach(x => x.classList.remove('active'));
            document.querySelector('.pan-tab[data-tab="player"]').classList.add('active');
            contents.forEach(c => c.style.display = 'none');
            document.getElementById('pan-content-player').style.display = 'flex';
            refreshPlayerTab();
        };
    }

    // Helper to add Shrine (moved from scatterProps to be reusable)
    createShrineAt(x, z) {
        const terrainY = this.getTerrainHeight(x, z);
        const shrine = new THREE.Group();
        
        const base = new THREE.Mesh(new THREE.CylinderGeometry(2, 2.5, 0.8, 8), new THREE.MeshStandardMaterial({ color: 0x606060 }));
        base.position.y = terrainY + 0.4; shrine.add(base);
        const pillar = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 3.5, 8), new THREE.MeshStandardMaterial({ color: 0x808080 }));
        pillar.position.y = terrainY + 2.3; shrine.add(pillar);
        const crystal = new THREE.Mesh(new THREE.OctahedronGeometry(0.6, 0), new THREE.MeshStandardMaterial({ color: 0x00ffff, emissive: 0x00ffff }));
        crystal.position.y = terrainY + 4.5; shrine.add(crystal);
        const barrier = new THREE.Mesh(new THREE.SphereGeometry(3, 16, 16), new THREE.MeshBasicMaterial({ color: 0x00ffff, transparent: true, opacity: 0.15, wireframe: true }));
        barrier.position.y = terrainY + 2.0; shrine.add(barrier);
        
        shrine.position.set(x, 0, z);
        this.scene.add(shrine);
        if(!this.props) this.props = [];
        this.props.push(shrine);
        
        this.shrines.push({
            group: shrine,
            position: new THREE.Vector3(x, terrainY, z),
            crystal, barrier, used: false, activationTime: 0, requiredTime: 5.5
        });
    }

    setSeed(seed) {
        this.rng = seed ? new SeededRandom(seed) : null;
    }

    randomValue(min, max) {
        if (this.rng) {
            if (max === undefined) return this.rng.next();
            return this.rng.range(min, max);
        }
        if (max === undefined) return Math.random();
        return Math.random() * (max - min) + min;
    }

    initHUD() {
        if (this.healthText) {
            this.healthText.innerText = `${this.playerHealth} / ${this.maxHealth}`;
        }
        this.updateLoadoutUI();
        this.updateObjectives();
        
        if (this.gameMode === 'PANTHEON') {
            const topHud = document.getElementById('top-hud');
            if (topHud) topHud.style.display = 'none';
            const mini = document.getElementById('minimap-container');
            if (mini) mini.style.display = 'none';
            const compass = document.getElementById('compass-container');
            if (compass) compass.style.display = 'none';
            // Custom UI overlay handles itself in initPantheonUI
            return;
        }
        
        // Multiplayer HUD tweaks
        if (this.gameMode === 'MULTI') {
            const minimapContainer = document.getElementById('minimap-container');
            if (minimapContainer) minimapContainer.style.display = 'none';
            const objectivesBox = document.getElementById('objectives-box');
            if (objectivesBox) objectivesBox.style.display = 'none';
            const compass = document.getElementById('compass-container');
            if (compass) compass.style.display = 'none';
            
            // Switch to MP HUD
            const topHud = document.getElementById('top-hud');
            if (topHud) topHud.style.display = 'none';
            const mpHud = document.getElementById('multiplayer-hud');
            if (mpHud) mpHud.style.display = 'block';
            
            this.initMultiplayer();
        } else if (this.gameMode === 'SURVIVAL') {
            // Show four corner HUDs for up to 4 players
            const createCorner = (id) => {
                if (document.getElementById(id)) return;
                const el = document.createElement('div');
                el.id = id;
                el.style.position = 'fixed';
                el.style.width = '180px';
                el.style.height = '80px';
                el.style.background = 'rgba(0,0,0,0.6)';
                el.style.border = '2px solid rgba(255,255,255,0.4)';
                el.style.color = '#fff';
                el.style.padding = '8px';
                el.style.fontFamily = 'Space Mono, monospace';
                el.style.fontSize = '12px';
                el.style.pointerEvents = 'none';
                el.style.zIndex = '120';
                document.body.appendChild(el);
            };
            createCorner('mp-corner-top-left');
            createCorner('mp-corner-top-right');
            createCorner('mp-corner-bottom-left');
            createCorner('mp-corner-bottom-right');

            const tl = document.getElementById('mp-corner-top-left');
            const tr = document.getElementById('mp-corner-top-right');
            const bl = document.getElementById('mp-corner-bottom-left');
            const br = document.getElementById('mp-corner-bottom-right');
            if (tl) { tl.style.top = '10px'; tl.style.left = '10px'; }
            if (tr) { tr.style.top = '10px'; tr.style.right = '10px'; tr.style.left = ''; }
            if (bl) { bl.style.bottom = '10px'; bl.style.left = '10px'; bl.style.top = ''; }
            if (br) { br.style.bottom = '10px'; br.style.right = '10px'; br.style.top = ''; br.style.left = ''; }

            // Populate with local player initially
            const fillCorner = (el, peer) => {
                if (!el) return;
                if (!peer) {
                    el.innerHTML = `<div style="color:#777">Empty Slot</div>`;
                    return;
                }
                el.innerHTML = `<div style="font-weight:bold">${peer.username || 'Player'}</div>
                                <div style="font-size:11px;">Char: ${peer.character || '??'}</div>
                                <div style="font-size:11px;">HP: ${Math.floor(peer.health||0)}/${Math.floor(peer.maxHealth||0)}</div>
                                <div style="font-size:11px;">LVL: ${peer.level || 1}</div>`;
            };

            // Keep these corners updated via presence subscription
            if (this.room) {
                // initial fill (self)
                const me = this.room.peers[this.room.clientId];
                const selfPresence = this.room.presence[this.room.clientId] || {};
                fillCorner(tl, { username: me?.username, character: selfPresence.character, health: selfPresence.health, maxHealth: selfPresence.maxHealth, level: selfPresence.level });

                // subscribe to update presence
                this.room.subscribePresence((presence) => {
                    // Collect up to 4 players and assign them to corners by index
                    const ids = Object.keys(presence).slice(0,4);
                    const peers = ids.map(id => {
                        const p = presence[id] || {};
                        const peerInfo = this.room.peers[id] || {};
                        return { username: peerInfo.username, character: p.character, health: p.health, maxHealth: p.maxHealth, level: p.level };
                    });
                    fillCorner(tl, peers[0] || null);
                    fillCorner(tr, peers[1] || null);
                    fillCorner(bl, peers[2] || null);
                    fillCorner(br, peers[3] || null);
                });
            }

            // Hide the standard top HUD / mp HUD
            const topHud = document.getElementById('top-hud');
            if (topHud) topHud.style.display = 'none';
            const mpHud = document.getElementById('multiplayer-hud');
            if (mpHud) mpHud.style.display = 'none';
        } else {
            // Ensure standard HUD is visible
            const topHud = document.getElementById('top-hud');
            if (topHud) topHud.style.display = 'flex';
            const mpHud = document.getElementById('multiplayer-hud');
            if (mpHud) mpHud.style.display = 'none';
            
            // Restore single player elements
            const minimapContainer = document.getElementById('minimap-container');
            if (minimapContainer) minimapContainer.style.display = 'block';
            const objectivesBox = document.getElementById('objectives-box');
            if (objectivesBox) objectivesBox.style.display = 'block';
            const compass = document.getElementById('compass-container');
            if (compass) compass.style.display = 'flex';
        }
    }

    initMultiplayer() {
        if (!this.room) return;

        // Setup local player HUD
        const p1NameEl = document.getElementById('mp-p1-name');
        if (p1NameEl && this.room.peers[this.room.clientId]) {
            // Show only the actual username here; do not display a "YOU" fallback label.
            p1NameEl.textContent = this.room.peers[this.room.clientId].username;
        }
        const p1CharEl = document.getElementById('mp-p1-char');
        if (p1CharEl) {
            // Hide the local player's character label in the MP HUD — only opponents should show character picks.
            p1CharEl.textContent = '';
        }

        // Clear opponent HUD initially
        const p2NameEl = document.getElementById('mp-p2-name');
        if(p2NameEl) p2NameEl.textContent = "PLAYERS"; // Generic label for >1 players

        // Subscribe to ALL presence updates to handle multiple players
        this.room.subscribePresence((presence) => {
            Object.keys(presence).forEach(id => {
                // Ignore self
                if (id === this.room.clientId) return;
                
                // If this is a player in our lobby/game
                // We rely on the Lobby logic to filter, but here we just render everyone we see who is "in_game"
                const p = presence[id];
                if (p && p.status === 'in_game') {
                    this.updateRemotePlayer(id, p);
                }
            });
            
            // Remove disconnected players
            Object.keys(this.remotePlayers).forEach(id => {
                if (!presence[id]) {
                    this.removeRemotePlayer(id);
                }
            });
        });

        this.room.subscribePresenceUpdateRequests((req, fromId) => {
            if (req.type === 'damage') {
                // Only take damage if PVP is active
                if (this.gameMode === 'MULTI' && this.overtimeActive) {
                    this.takeDamage(req.amount);
                    this.broadcastPresence();
                }
            }
        });
        
        this.room.onmessage = (event) => {
            const data = event.data;
            if (data.type === 'spawnEnemy') {
                this.replicateEnemy(data.data);
            } else if (data.type === 'chat') {
                this.addChatMessage(data.sender, data.text, true);
            } else if (data.type === 'force_overtime') {
                this.startOvertime();
            }
        };
        
        // Initial broadcast
        this.broadcastPresence();
    }

    replicateEnemy(data) {
        // Don't spawn if we already have it
        if (this.enemies.find(e => e.id === data.id)) return;
        
        // Force spawn logic roughly matching createEnemy
        const y = this.getTerrainHeight(data.x, data.z) + 1; // Approx
        const group = new THREE.Group();
        
        // Generic visual fallback or use createEnemy logic... 
        // Better: Reuse createEnemy visual blocks.
        // For simplicity in this patch, I'll create a generic red orb if type unknown, or piggyback createEnemy.
        // But createEnemy generates random position. I need createEnemyAt(type, x, z, id).
        this.createEnemyAt(data.type, data.x, data.z, data.id, data.hp);
    }

    createEnemyAt(type, x, z, id, hp) {
        // Bypass random generation
        // Reuse visual generation logic from createEnemy (copy-paste refactor simulated here)
        // I will basically duplicate the visual part of createEnemy for brevity or assume createEnemy can be refactored.
        // Refactoring createEnemy is cleaner.
        
        // Call generic creator (we will modify createEnemy to accept overrides)
        this.createEnemy({ overrideType: type, overrideX: x, overrideZ: z, overrideId: id, overrideHp: hp });
    }

    broadcastPresence() {
        if (!this.room || !this.playerBody) return;
        const p = this.playerBody.position;
        const r = this.playerMesh ? this.playerMesh.rotation.y : 0;
        
        this.room.updatePresence({
            status: 'in_game',
            x: p.x,
            y: p.y,
            z: p.z,
            rotation: r,
            health: this.playerHealth,
            maxHealth: this.maxHealth,
            level: this.level,
            character: this.characterKey,
            weapons: this.weapons,
            lobbyId: this.room.presence.lobbyId // Keep lobby association
        });
    }

    updateRemotePlayer(data) {
        if (!this.remotePlayerMesh && data.character) {
            this.createRemotePlayerMesh(data.character);
        }
        
        // Update visual transform
        if (this.remotePlayerMesh) {
            // Simple interpolation could go here, for now direct set
            // In update() we might lerp, but let's just set target here
            this.remotePlayerTarget = {
                x: data.x || 0,
                y: data.y || 0,
                z: data.z || 0,
                rot: data.rotation || 0
            };
        }

        // Update HUD
        const p2NameEl = document.getElementById('mp-p2-name');
        if (p2NameEl && this.room.peers[this.opponentId]) {
            p2NameEl.textContent = this.room.peers[this.opponentId].username || "OPPONENT";
        }
        const p2Char = document.getElementById('mp-p2-char');
        if (p2Char && CHARACTERS[data.character]) p2Char.textContent = CHARACTERS[data.character].name;
        
        const p2HpBar = document.getElementById('mp-p2-hp-bar');
        const p2HpText = document.getElementById('mp-p2-hp-text');
        if (p2HpBar) {
            const pct = Math.max(0, (data.health / data.maxHealth) * 100);
            p2HpBar.style.width = pct + '%';
        }
        if (p2HpText) p2HpText.textContent = `${Math.floor(data.health)}/${Math.floor(data.maxHealth)}`;
        
        const p2Stats = document.getElementById('mp-p2-stats');
        if (p2Stats) p2Stats.textContent = `LVL ${data.level || 1}`;
        
        const p2Items = document.getElementById('mp-p2-items');
        if (p2Items && data.weapons) {
            // Simple list
            p2Items.innerHTML = data.weapons.map(w => {
                const n = WEAPONS[w] ? WEAPONS[w].name : w;
                return `<div>${n}</div>`;
            }).join('');
        }
        
        this.remotePlayer = data;
        
        // Check win condition
        if (data.health <= 0) {
            this.showToast("OPPONENT ELIMINATED! YOU WIN!");
            setTimeout(() => {
                this.gameOverTitle.textContent = "VICTORY";
                this.gameOver();
            }, 2000);
        }
    }

    updateRemotePlayer(id, data) {
        let rp = this.remotePlayers[id];
        
        // Create if new
        if (!rp) {
            const group = this.createCharacterMesh(data.character || 'MMOOVT');
            
            // Nameplate
            const canvas = document.createElement('canvas');
            canvas.width = 256; canvas.height = 64;
            const ctx = canvas.getContext('2d');
            ctx.fillStyle = this.gameMode === 'SURVIVAL' ? '#00ff88' : '#ff4444';
            ctx.font = 'bold 30px monospace';
            ctx.textAlign = 'center';
            ctx.shadowColor = 'black';
            ctx.shadowBlur = 4;
            const name = (this.room.peers[id] && this.room.peers[id].username) || "Player";
            ctx.fillText(name, 128, 40);
            const tex = new THREE.CanvasTexture(canvas);
            const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true }));
            sprite.position.y = 3.2;
            sprite.scale.set(3, 0.75, 1);
            group.add(sprite);
            
            // Indicator ring
            const indicator = new THREE.Mesh(
                new THREE.RingGeometry(0.8, 1.0, 16),
                new THREE.MeshBasicMaterial({ 
                    color: this.gameMode === 'SURVIVAL' ? 0x00ff88 : 0xff0000, 
                    side: THREE.DoubleSide, transparent: true, opacity: 0.6 
                })
            );
            indicator.rotation.x = -Math.PI/2;
            indicator.position.y = 0.1;
            group.add(indicator);

            this.scene.add(group);
            
            rp = { mesh: group, data: data, target: {x:0, y:0, z:0, rot:0} };
            this.remotePlayers[id] = rp;
        }
        
        // Update data
        rp.data = data;
        rp.target = {
            x: data.x || 0,
            y: data.y || 0,
            z: data.z || 0,
            rot: data.rotation || 0
        };
        
        // Update HUD for P2 (simplified for now, just shows first opponent stats)
        const p2NameEl = document.getElementById('mp-p2-name');
        if (p2NameEl) {
            // Cycle through stats? Just show last updated.
            const name = (this.room.peers[id] && this.room.peers[id].username) || "Opponent";
            p2NameEl.textContent = name;
            
            const p2HpBar = document.getElementById('mp-p2-hp-bar');
            const p2HpText = document.getElementById('mp-p2-hp-text');
            if(p2HpBar && data.maxHealth) {
                p2HpBar.style.width = ((data.health / data.maxHealth) * 100) + '%';
            }
            if(p2HpText) p2HpText.textContent = `${Math.floor(data.health)}/${Math.floor(data.maxHealth)}`;
        }
        
        // If PVP and hp <= 0, they died
        // Handle victory logic if everyone else is dead?
    }

    removeRemotePlayer(id) {
        const rp = this.remotePlayers[id];
        if (rp) {
            this.scene.remove(rp.mesh);
            delete this.remotePlayers[id];
        }
    }

    // Extracted mesh generation logic
    createCharacterMesh(type) {
        const group = new THREE.Group();
        let verticalVisualOffset = 0;
        let armL, armR, legL, legR;

        // Reusing the logic from createPlayer but returning the group instead of setting this.playerMesh
        // Simplified mapping from createPlayer:
        if (type === 'FOX') {
            verticalVisualOffset = 0.5;
            const body = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.6, 1.5), new THREE.MeshStandardMaterial({ color: 0xff7f3f }));
            body.position.y = 0.4; group.add(body);
            const head = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.6, 0.7), new THREE.MeshStandardMaterial({ color: 0xff9b5e }));
            head.position.set(0, 0.9, 0.6); group.add(head);
            const tail = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.25, 0.9), new THREE.MeshStandardMaterial({ color: 0xff7f3f }));
            tail.position.set(0, 0.6, -0.9); tail.rotation.x = 0.4; group.add(tail);
        } else if (type === 'CALCIUM') {
            verticalVisualOffset = 0.3;
            const boneMat = new THREE.MeshStandardMaterial({ color: 0xdddddd });
            const skullMat = new THREE.MeshStandardMaterial({ color: 0xf5f5f5 });
            const spine = new THREE.Mesh(new THREE.BoxGeometry(0.25, 1.0, 0.25), boneMat);
            spine.position.y = 1.1; group.add(spine);
            const head = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.7, 0.7), skullMat);
            head.position.y = 1.8; group.add(head);
            // Board
            const board = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.1, 0.4), new THREE.MeshStandardMaterial({ color: 0x222222 }));
            board.position.y = 0.1; group.add(board);
            group.rotation.y = Math.PI/2;
        } else if (type === 'GIGACHAD') {
            verticalVisualOffset = 0.6;
            const skinMat = new THREE.MeshStandardMaterial({ color: 0xffd1a4 });
            const upperChest = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.9, 0.7), skinMat);
            upperChest.position.y = 1.3; group.add(upperChest);
            const head = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.6, 0.6), skinMat);
            head.position.y = 2.1; group.add(head);
            const pantsMat = new THREE.MeshStandardMaterial({ color: 0x1f2933 });
            const legL = new THREE.Mesh(new THREE.BoxGeometry(0.45, 1.2, 0.45), pantsMat);
            legL.position.set(-0.35, -0.4, 0); group.add(legL);
            const legR = legL.clone(); legR.position.x = 0.35; group.add(legR);
        } else if (type === 'MONKE') {
            verticalVisualOffset = 0.3;
            const furMat = new THREE.MeshStandardMaterial({ color: 0x5C4033 });
            const body = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.8, 0.6), furMat);
            body.position.y = 0.7; group.add(body);
            const head = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.6, 0.6), furMat);
            head.position.y = 1.45; group.add(head);
        } else if (type === 'BLITZ') {
            verticalVisualOffset = 0.25;
            const metalMat = new THREE.MeshStandardMaterial({ color: 0x223344 });
            const body = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.2, 1.2, 8), metalMat);
            body.position.y = 1.0; group.add(body);
            const head = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.4, 0.5), metalMat);
            head.position.y = 1.7; group.add(head);
        } else if (type === 'SIR_CHAD') {
            verticalVisualOffset = 0.6;
            const armorMat = new THREE.MeshStandardMaterial({ color: 0x111111 });
            const torso = new THREE.Mesh(new THREE.BoxGeometry(1.1, 1.4, 0.7), armorMat);
            torso.position.y = 1.2; group.add(torso);
            const head = new THREE.Mesh(new THREE.BoxGeometry(0.75, 0.8, 0.75), armorMat);
            head.position.y = 2.1; group.add(head);
        } else {
            // Default MMOOVT
            verticalVisualOffset = 0.25;
            const torso = new THREE.Mesh(new THREE.BoxGeometry(0.85, 1.25, 0.55), new THREE.MeshStandardMaterial({ color: 0x3d3d3d }));
            torso.position.y = 0.9; group.add(torso);
            const head = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.6, 0.6), new THREE.MeshStandardMaterial({ color: 0x707070 }));
            head.position.y = 1.6; group.add(head);
        }
        
        // Adjust for ground offset
        group.position.y += verticalVisualOffset;
        group.scale.set(0.8, 0.8, 0.8);
        return group;
    }

    spawnUIParticles(count = 20, x, y, color = '#ffd700') {
        const container = document.body;
        for (let i = 0; i < count; i++) {
            const el = document.createElement('div');
            el.style.position = 'fixed';
            el.style.left = (x || window.innerWidth / 2) + 'px';
            el.style.top = (y || window.innerHeight / 2) + 'px';
            el.style.width = Math.random() * 8 + 4 + 'px';
            el.style.height = el.style.width;
            el.style.background = color;
            el.style.borderRadius = '50%';
            el.style.pointerEvents = 'none';
            // Increased z-index to ensure visibility over upgrade menu
            el.style.zIndex = '10000';
            el.style.transform = `translate(-50%, -50%)`;
            
            const angle = Math.random() * Math.PI * 2;
            const velocity = Math.random() * 150 + 50;
            const vx = Math.cos(angle) * velocity;
            const vy = Math.sin(angle) * velocity;
            
            container.appendChild(el);
            
            const anim = el.animate([
                { transform: `translate(-50%, -50%) scale(1)`, opacity: 1 },
                { transform: `translate(calc(-50% + ${vx}px), calc(-50% + ${vy}px)) scale(0)`, opacity: 0 }
            ], {
                duration: 800 + Math.random() * 400,
                easing: 'cubic-bezier(0.25, 1, 0.5, 1)'
            });
            
            anim.onfinish = () => el.remove();
        }
    }
    
    updateObjectives() {
        const containerObjText = document.getElementById('objectives-box');
        if (!containerObjText) return;
        
        if (this.gameMode === 'AWAKENING') {
            containerObjText.innerHTML = `
                <div class="objective-header">OBJECTIVE</div>
                <div style="font-size:0.8rem;color:#00ff00;margin-bottom:4px;">SURVIVE</div>
                <div style="font-size:0.65rem;color:#aaa;">Collect UPGRADES to Evolve into unlocked characters!</div>
                <div style="font-size:0.65rem;color:#aaa;">Find Graves to awaken bosses.</div>
            `;
            return;
        }

        if (this.gameMode === 'MULTI') {
            containerObjText.innerHTML = `
                <div class="objective-header">MULTIPLAYER</div>
                <div style="font-size:0.75rem;color:#fff;margin-bottom:4px;">Loot & level for 10 minutes. Then lava rises and PvP begins.</div>
                <div style="font-size:0.65rem;color:#aaa;">First to die loses. Monsters give double coins & XP.</div>
            `;
            return;
        }
        
        if (this.gameMode === 'TNS') {
            const bossName = this.tnsTier === 1 ? 'Babybark' : (this.tnsTier === 2 ? 'Smolbark' : (this.tnsTier === 3 ? 'Chadbark' : 'Barkvader'));
            containerObjText.innerHTML = `
                <div class="objective-header">STORY: TIER ${this.tnsTier}</div>
                <div style="font-size:0.8rem;color:#00ff88;margin-bottom:4px;">Defeat ${bossName}</div>
                <div style="font-size:0.65rem;color:#aaa;">This is totally not scripted.</div>
            `;
            return;
        }

        // Initialize runtime objective flags if needed
        if (this._objectives === undefined) {
            this._objectives = {
                foundPortal: false,
                defeatedBoss: false,
                enteredPortal: false
            };
        }

        // Update flags based on world state (but do not reveal future objectives prematurely)
        // "Find Boss Portal" should complete once the real boss shows up (you know where to go),
        // or if the portal has already been activated/seen.
        if (this.bossPortalActivated || (this.bossEnemy && this.bossEnemy.isMainBoss)) {
            this._objectives.foundPortal = true;
        }
        // "Defeat Gatekeeper" appears as soon as the Gatekeeper exists, and completes after it's dead.
        if (this.bossEnemy && this.bossEnemy.isMainBoss) {
            // show as pending; flag will be completed below when bossEnemy becomes null
        }
        if (this.bossEnemy === null && this.bossPortalActivated) {
            this._objectives.defeatedBoss = true;
        }
        if (this.bossPortalActivated && this.playerBody && this.bossPortal) {
            const p = new THREE.Vector3(this.playerBody.position.x, this.playerBody.position.y, this.playerBody.position.z);
            if (p.distanceTo(this.bossPortal.position) < 3.0) {
                this._objectives.enteredPortal = true;
            }
        }

        // Determine which objectives to display: show all completed ones (checked) and reveal exactly one next incomplete objective.
        const ordered = [
            { key: 'foundPortal', label: 'Find The Boss Portal' },
            { key: 'defeatedBoss', label: 'Defeat The Boss' },
            { key: 'enteredPortal', label: 'Enter Boss Portal' }
        ];

        // Build display list: include every completed objective, plus the next incomplete one (if any)
        const displayList = [];
        for (let i = 0; i < ordered.length; i++) {
            const o = ordered[i];
            if (this._objectives[o.key]) {
                displayList.push({ label: o.label, checked: true });
            } else {
                // push this next incomplete objective (but not further ones)
                displayList.push({ label: o.label, checked: false });
                break;
            }
        }

        // Build checklist DOM inside objectives-box
        const inner = document.createElement('div');
        inner.style.display = 'flex';
        inner.style.flexDirection = 'column';
        inner.style.gap = '6px';
        inner.style.marginTop = '8px';
        inner.style.fontSize = '0.78rem';
        inner.style.color = '#fff';

        const makeRow = (label, checked) => {
            const row = document.createElement('div');
            row.style.display = 'flex';
            row.style.alignItems = 'center';
            row.style.gap = '8px';
            const box = document.createElement('div');
            box.className = 'checkbox' + (checked ? ' checked' : '');
            if (checked) {
                box.style.background = '#00ff88';
                box.style.borderColor = '#00ff88';
            }
            box.style.width = '12px';
            box.style.height = '12px';
            const lbl = document.createElement('div');
            lbl.textContent = label;
            lbl.style.color = checked ? '#cfeee0' : '#fff';
            lbl.style.fontSize = '0.78rem';
            lbl.style.whiteSpace = 'normal';
            row.appendChild(box);
            row.appendChild(lbl);
            return row;
        };

        displayList.forEach(item => inner.appendChild(makeRow(item.label, item.checked)));

        // Replace or append the list under the objective header (keep header)
        Array.from(containerObjText.querySelectorAll('.objective-list')).forEach(n => n.remove());
        inner.classList.add('objective-list');
        containerObjText.appendChild(inner);

        // Visual pulse when checklist changes
        if (this._lastObjectiveState !== JSON.stringify(this._objectives)) {
            this._lastObjectiveState = JSON.stringify(this._objectives);
            containerObjText.animate([
                { transform: 'scale(1)' },
                { transform: 'scale(1.02)' },
                { transform: 'scale(1)' }
            ], { duration: 300, easing: 'ease-out' });
        }
    }

    setPixelMode(enabled) {
        // Awakening mode always forces pixelation.
        if (this.gameMode === 'AWAKENING') {
            this.pixelateEnabled = true;
        } else {
            // For non-Awakening modes (Arcade) respect the requested toggle.
            this.pixelateEnabled = !!enabled;
        }
        // Keep non-pixel mode as baseline brightness; boost only for pixelated view
        if (this.renderer) {
            // TNS Tier 4 Brightness Override
            if (this.gameMode === 'TNS' && this.tnsTier === 4) {
                this.renderer.toneMappingExposure = 2.5;
            } else {
                this.renderer.toneMappingExposure = this.pixelateEnabled ? 1.8 : 1.0;
            }
        }
    }

    updateAuraOwnership() {
        // Deprecated: GigaChad now unlocks via Level 3 Aura upgrade logic in selectUpgrade
    }

    unlockCharacter(key) {
        // TNS Mode shouldn't unlock global characters
        if (this.gameMode === 'TNS') return;

        if (!this.pendingUnlocks) this.pendingUnlocks = [];
        // Check if already unlocked to avoid dupes
        const saved = JSON.parse(localStorage.getItem('uberthump_unlocks') || '{}');
        if (saved[key]) return;
        
        // Check if already pending
        if (this.pendingUnlocks.includes(key)) return;
        
        this.pendingUnlocks.push(key);
        this.showToast(`SECRET FOUND! (Check Game Over Screen)`);
        this.playSound('unlock', 1.5, 0.5);
    }

    checkCalciumUnlock() {
        if (this.skeletonKills >= 200 && this.minibossKilledAsMMOOVT) {
            this.unlockCharacter('CALCIUM');
        }
    }

    async loadSound(url, name) {
        try {
            const encodedUrl = encodeURI(url);
            const response = await fetch(encodedUrl);
            if (!response.ok) {
                console.error(`Failed to load sound ${url}: ${response.status} ${response.statusText}`);
                return null;
            }
            const arrayBuffer = await response.arrayBuffer();
            this.sounds[name] = await this.audioCtx.decodeAudioData(arrayBuffer);
            return this.sounds[name];
        } catch(e) {
            console.error(`Error loading sound ${url}:`, e);
            return null;
        }
    }

    playSound(name, pitch = 1.0, volume = 1.0) {
        if (this.audioCtx.state === 'suspended') {
            this.audioCtx.resume().catch(()=>{});
        }
        if (this.sounds[name]) {
            const source = this.audioCtx.createBufferSource();
            source.buffer = this.sounds[name];
            source.playbackRate.value = pitch;

            const gain = this.audioCtx.createGain();
            gain.gain.value = volume;

            source.connect(gain);
            gain.connect(this.audioCtx.destination);
            source.start(0);
        }
        // Silent fallback - do nothing if sound not loaded
    }

    playSynth(type, pitch = 1.0, volume = 1.0) {
        if (this.audioCtx.state === 'suspended') this.audioCtx.resume();
        const t = this.audioCtx.currentTime;
        const osc = this.audioCtx.createOscillator();
        const gain = this.audioCtx.createGain();
        osc.connect(gain);
        gain.connect(this.audioCtx.destination);
        
        // Quiet SFX by default
        const vol = volume * 0.3;

        if (type === 'shoot' || type === 'fireball') {
            osc.type = 'square';
            osc.frequency.setValueAtTime(150 * pitch, t);
            osc.frequency.exponentialRampToValueAtTime(40 * pitch, t + 0.1);
            gain.gain.setValueAtTime(vol, t);
            gain.gain.exponentialRampToValueAtTime(0.01, t + 0.1);
            osc.start(t);
            osc.stop(t + 0.1);
        } else if (type === 'slice' || type === 'bonk') {
            osc.type = 'sawtooth';
            osc.frequency.setValueAtTime(400 * pitch, t);
            osc.frequency.linearRampToValueAtTime(100 * pitch, t + 0.15);
            gain.gain.setValueAtTime(vol * 0.8, t);
            gain.gain.linearRampToValueAtTime(0.01, t + 0.15);
            osc.start(t);
            osc.stop(t + 0.15);
        } else if (type === 'hit' || type === 'boom') {
            osc.type = 'sawtooth';
            osc.frequency.setValueAtTime(100 * pitch, t);
            osc.frequency.exponentialRampToValueAtTime(30 * pitch, t + 0.2);
            gain.gain.setValueAtTime(vol, t);
            gain.gain.exponentialRampToValueAtTime(0.01, t + 0.2);
            osc.start(t);
            osc.stop(t + 0.2);
        } else if (type === 'levelup' || type === 'unlock') {
            osc.type = 'sine';
            osc.frequency.setValueAtTime(440, t);
            osc.frequency.setValueAtTime(554, t + 0.1);
            osc.frequency.setValueAtTime(659, t + 0.2);
            osc.frequency.setValueAtTime(880, t + 0.3);
            gain.gain.setValueAtTime(vol, t);
            gain.gain.setValueAtTime(0, t + 0.6);
            osc.start(t);
            osc.stop(t + 0.6);
        } else if (type === 'ui') {
            osc.type = 'sine';
            osc.frequency.setValueAtTime(800, t);
            gain.gain.setValueAtTime(vol * 0.5, t);
            gain.gain.exponentialRampToValueAtTime(0.01, t + 0.05);
            osc.start(t);
            osc.stop(t + 0.05);
        }
    }
    
    startBGM() {
        if (this.audioCtx.state === 'suspended') this.audioCtx.resume();
        this.stopBGM();

        // Awaken the Undead: always use "The Thumps Arent Messing Around" looped.
        if (this.gameMode === 'AWAKENING') {
            this.playMusicUrl("./The Thumps Arent Messing Around.mp3", true);
            return;
        }

        // Pantheon Creative: Bonk Theme
        if (this.gameMode === 'PANTHEON' && this.pantheonState === 'CREATIVE') {
            this.playMusicUrl("./THUMP ME UP BEFORE YOU GO!!!.mp3", true);
            return;
        }

        let trackUrl = "";

        // Character Theme Override
        if (this.useCharacterTheme) {
            if (this.characterKey === 'SIR_CHAD') trackUrl = "./SIR CHADSIRWELLSIRCHADSIRCHADWELLWELL'S THEME.mp3";
            else if (this.characterKey === 'GIGACHAD') trackUrl = "./GIGACHAD'S THEME.mp3";
            else if (this.characterKey === 'BLITZ') trackUrl = "./BLITZ'S THEME.mp3";
            else if (this.characterKey === 'CALCIUM') trackUrl = "./CALCIUM'S THEME.mp3";
            else if (this.characterKey === 'MONKE') trackUrl = "./MONKE'S THEME.mp3";
        }


        // Random Gameplay Loop
        if (!trackUrl) {
            // Pick a random track different from last one if possible
            let nextIndex = Math.floor(Math.random() * this.bgmTracks.length);
            if (this.currentTrackIndex === nextIndex && this.bgmTracks.length > 1) {
                nextIndex = (nextIndex + 1) % this.bgmTracks.length;
            }
            this.currentTrackIndex = nextIndex;
            trackUrl = this.bgmTracks[nextIndex];
        }

        this.playMusicUrl(trackUrl, false);
    }

    playMusicUrl(url, isOvertime = false) {
        // Ensure any currently playing track is stopped before starting a new one
        try {
            this.stopBGM();
        } catch (e) {}

        const play = (buffer) => {
             const source = this.audioCtx.createBufferSource();
             source.buffer = buffer;
             source.loop = isOvertime || this.useCharacterTheme; // Overtime loops, themes loop
             
             // If normal gameplay, when it ends, play next random
             if (!isOvertime && !this.useCharacterTheme) {
                 source.onended = () => {
                     // Ensure we don't start normal BGM if overtime has started or game ended
                     if (this.isPlaying && !this.isOvertimeMusic && !this.overtimeActive) {
                         this.startBGM();
                     }
                 };
             }

             const gain = this.audioCtx.createGain();
             gain.gain.value = 0.35;
             source.connect(gain);
             // Connect through analyser
             gain.connect(this.analyser);
             this.analyser.connect(this.audioCtx.destination);
             
             source.start(0);
             
             this.currentBgmNode = source;
             this.currentBgmGain = gain;
             this.isOvertimeMusic = isOvertime;
        };

        if (this.sounds[url]) {
            play(this.sounds[url]);
        } else {
            this.loadSound(url, url).then(buffer => {
                if (buffer) play(buffer);
            });
        }
    }

    switchToOvertimeBGM() {
        // Awakening uses its own permanent track; don't override.
        if (this.gameMode === 'AWAKENING') return;
        if (this.useCharacterTheme) return; // Don't override theme
        
        const url = "./The Thumps Arent Messing Around.mp3";
        
        // Immediately stop any currently scheduled/playing music reliably, then start overtime track.
        try { 
            // aggressively clear any existing node
            if (this.currentBgmGain) {
                try { this.currentBgmGain.gain.cancelScheduledValues(this.audioCtx.currentTime); } catch(e) {}
            }
            this.stopBGM(); 
        } catch (e) {}
        
        // Start overtime music immediately and mark state so startBGM won't auto-chain normal tracks on end.
        try {
            this.playMusicUrl(url, true);
        } catch (e) {
            // fallback: attempt delayed start if something fails
            setTimeout(() => { try { this.playMusicUrl(url, true); } catch(e){} }, 200);
        }
    }

    stopBGM() {
        if (this.currentBgmNode) {
            try { this.currentBgmNode.stop(); } catch(e){}
            this.currentBgmNode = null;
        }
    }

    /**
     * Play the Game Over music at 50% volume, looping
     */
    playGameOverMusic() {
        const gameOverUrl = "./Game Over.mp3";

        const play = (buffer) => {
            if (!buffer) return;

            const source = this.audioCtx.createBufferSource();
            source.buffer = buffer;
            source.loop = true; // Loop the game over music

            const gain = this.audioCtx.createGain();
            gain.gain.value = 0.5; // 50% volume

            source.connect(gain);
            gain.connect(this.audioCtx.destination);
            source.start(0);

            // Store reference for cleanup
            this.gameOverMusicNode = source;
            this.gameOverMusicGain = gain;
        };

        // Check if already loaded, otherwise load it
        if (this.sounds[gameOverUrl]) {
            play(this.sounds[gameOverUrl]);
        } else {
            this.loadSound(gameOverUrl, gameOverUrl).then(buffer => {
                if (buffer) play(buffer);
            });
        }
    }

    /**
     * Stop the Game Over music
     */
    stopGameOverMusic() {
        if (this.gameOverMusicNode) {
            try { this.gameOverMusicNode.stop(); } catch(e){}
            this.gameOverMusicNode = null;
            this.gameOverMusicGain = null;
        }
    }

    init() {
        this.createWorld();
        this.createPlayer();
        
        // Restore TNS Save State
        if (this.gameMode === 'TNS' && this.lobbySettings.tnsData) {
            const d = this.lobbySettings.tnsData;
            
            // Apply Tier Scaling from TNS data to global tier tracking
            this.tier = this.tnsTier;

            if (d.weapons) this.weapons = [...d.weapons];
            if (d.runes) this.runes = [...d.runes];
            if (d.weaponLevels) this.weaponLevels = {...d.weaponLevels};
            if (d.runeLevels) this.runeLevels = {...d.runeLevels};
            
            // Restore Player Progression
            if (d.level) this.level = d.level;
            if (d.xp) this.xp = d.xp;
            if (d.xpToLevel) this.xpToLevel = d.xpToLevel;
            if (d.coins) this.coins = d.coins;
            if (d.kills) this.kills = d.kills;
            if (d.evolutionStats) this.evolutionStats = d.evolutionStats;

            // Re-apply stats
            if (d.savedStats) {
                this.runes.forEach(r => {
                    const lvl = this.runeLevels[r] || 1;
                    for(let i=0; i<lvl; i++) this.applyRune(r);
                });
            }
            
            // Ensure HP is full or saved value? Let's heal to full on tier start for fairness, 
            // but maxHealth is now correctly set by applyRune above.
            this.playerHealth = this.maxHealth;
            
            // Update UI
            this.updateUI();
            if (this.levelDisplay) this.levelDisplay.innerText = `LVL ${this.level}`;
            if (this.xpBar) this.xpBar.style.width = (this.xp / this.xpToLevel * 100) + '%';
            if (this.healthBar) this.healthBar.style.width = '100%';
            if (this.healthText) this.healthText.innerText = `${Math.floor(this.playerHealth)} / ${this.maxHealth}`;
        }

        // Lore UI setup removed from here - handled globally in main.js

        window.addEventListener('keydown', e => this.onKey(e, true));
        window.addEventListener('keyup', e => this.onKey(e, false));
        window.addEventListener('resize', () => this.onResize());
        window.addEventListener('mousemove', e => this.onMouseMove(e));
        window.addEventListener('click', (e) => {
            // Pantheon UI Protection: Don't lock if interacting with menu
            if (this.gameMode === 'PANTHEON') {
                if (e.target.closest('#pantheon-menu') || e.target.closest('.pan-tab') || e.target.closest('.pan-btn') || e.target.closest('button') || e.target.closest('input') || e.target.closest('select')) {
                    return;
                }
            }
            if (this.renderer && this.renderer.domElement) {
                const p = this.renderer.domElement.requestPointerLock();
                if (p instanceof Promise) p.catch(() => {});
            }
        });
        
        // Pantheon Zoom
        window.addEventListener('wheel', (e) => {
            if (this.gameMode === 'PANTHEON' && this.cameraDistance) {
                this.cameraDistance = Math.max(5, Math.min(60, this.cameraDistance + e.deltaY * 0.01));
            }
        }, { passive: true });

        // Initial HUD setup (fixes MP UI not showing)
        this.initHUD();
        
        if (this.gameMode === 'PANTHEON') {
            this.initPantheonUI();
            this.pantheonState = 'CREATIVE'; // Default
        }

        // Game only starts after intro sequence finishes
        this.isPlaying = false;
        this.lastTime = performance.now();
        this.startBGM();
        this.animate();
    }

    setGameMode(mode) {
        this.gameMode = mode;
        this.gameTime = 0;
    }

    onKey(e, pressed) {
        const key = e.key.toLowerCase();
        if (key === ' ') {
            this.keys.space = pressed;
            e.preventDefault();
        } else if (key === 'control') {
            this.keys.ctrl = pressed;
        } else if (this.keys.hasOwnProperty(key)) {
            this.keys[key] = pressed;
            e.preventDefault();
        }
    }

    onMouseMove(e) {
        if (document.pointerLockElement === this.renderer.domElement) {
            this.mouseMovement.x += e.movementX;
            this.mouseMovement.y += e.movementY;
        }
    }

    onResize() {
        this.width = window.innerWidth;
        this.height = window.innerHeight;
        this.camera.aspect = this.width / this.height;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(this.width, this.height);
        this.renderTarget.setSize(
            Math.floor(this.width * this.pixelRatio),
            Math.floor(this.height * this.pixelRatio)
        );
    }

    initMaterials() {
        // Shared materials setup
        this.grassMaterial = new THREE.MeshStandardMaterial({
            map: this.grassTex,
            roughness: 0.9,
            color: 0xffffff
        });

        // Lava Shader Material
        this.lavaMaterial = new THREE.ShaderMaterial({
            uniforms: {
                time: { value: 0 },
                uvScale: { value: new THREE.Vector2(3.0, 1.0) },
                texture1: { value: this.rockTex || null },
                fogColor: { value: new THREE.Color(0xc6f2ff) },
                fogDensity: { value: 0.012 }
            },
            vertexShader: `
                uniform vec2 uvScale;
                varying vec2 vUv;
                varying float vFogDepth;
                void main() {
                    vUv = uvScale * uv;
                    vec4 mvPosition = modelViewMatrix * vec4( position, 1.0 );
                    gl_Position = projectionMatrix * mvPosition;
                    vFogDepth = -mvPosition.z;
                }
            `,
            fragmentShader: `
                uniform float time;
                uniform sampler2D texture1;
                uniform vec3 fogColor;
                uniform float fogDensity;
                varying vec2 vUv;
                varying float vFogDepth;
                
                void main() {
                    vec2 p = -1.0 + 2.0 * vUv;
                    vec2 flow = vec2(time * 0.02, time * 0.05);
                    vec4 noise1 = texture2D( texture1, vUv + flow );
                    vec4 noise2 = texture2D( texture1, vUv * 2.0 - flow * 1.5 );
                    float mixVal = (noise1.r + noise2.r) * 0.5;
                    vec3 dark = vec3(0.4, 0.05, 0.0);
                    vec3 mid = vec3(0.9, 0.3, 0.0);
                    vec3 bright = vec3(1.0, 0.8, 0.2);
                    vec3 col = mix(dark, mid, smoothstep(0.2, 0.6, mixVal));
                    col = mix(col, bright, smoothstep(0.6, 1.0, mixVal));
                    col *= 1.0 + 0.3 * sin(time);
                    float fogFactor = 1.0 - exp( - fogDensity * fogDensity * vFogDepth * vFogDepth );
                    col = mix( col, fogColor, fogFactor );
                    gl_FragColor = vec4(col, 1.0);
                }
            `
        });
    }

    createWorld() {
        this.terrainPieces = [];
        this.ramps = [];
        this.obstacles = [];
        this.graves = [];
        this.clouds = []; // Track clouds

        // Initialize materials FIRST so they are available for all sub-generators
        this.initMaterials();

        if (this.customWorldData) {
            this.loadCustomWorld(this.customWorldData);
            return;
        }

        if (this.gameMode === 'AWAKENING') {
            this.createAwakeningWorld();
            return;
        }
        
        // TNS Tier 4: Custom small arena
        if (this.gameMode === 'TNS' && this.tnsTier === 4) {
            this.createTNSFinalArena();
            return;
        }
        
        if (this.gameMode === 'PANTHEON') {
            // Flat canvas
            this.createFlatWorld();
            return;
        }

        const size = 440;
        const grassMat = this.grassMaterial;

        const addPlatform = ({ x, z, width, depth, height }) => {
            const group = new THREE.Group();
            
            // Procedural grass texture without image
            // We use a noisy shader material earlier, but let's make sure it scales
            const topMat = grassMat.clone();
            
            const top = new THREE.Mesh(
                new THREE.BoxGeometry(width, 0.6, depth),
                topMat
            );
            top.position.y = height + 0.3;
            top.receiveShadow = true;
            top.castShadow = true;
            group.add(top);

            if (height > 0) {
                const sideMat = new THREE.MeshStandardMaterial({
                    map: this.sideTex,
                    roughness: 0.9
                });
                // Adjust repeat for height
                const scaledSideMat = sideMat.clone();
                scaledSideMat.map = this.sideTex.clone();
                scaledSideMat.map.wrapS = THREE.RepeatWrapping;
                scaledSideMat.map.wrapT = THREE.RepeatWrapping;
                scaledSideMat.map.repeat.set(2, height / 2);
                
                const h = height;
                const front = new THREE.Mesh(new THREE.BoxGeometry(width, h, 0.6), scaledSideMat);
                front.position.set(0, h / 2, depth / 2);
                front.castShadow = true;
                group.add(front);
                const back = front.clone();
                back.position.z = -depth / 2;
                group.add(back);
                const left = new THREE.Mesh(new THREE.BoxGeometry(0.6, h, depth), scaledSideMat);
                left.position.set(-width / 2, h / 2, 0);
                left.castShadow = true;
                group.add(left);
                const right = left.clone();
                right.position.x = width / 2;
                group.add(right);
            }

            group.position.set(x, 0, z);
            this.scene.add(group);
            // store the group reference so it can be removed on world clear
            this.terrainPieces.push({ x, z, width, depth, height, group });
            if (height >= 0) {
                const body = new CANNON.Body({
                    mass: 0,
                    position: new CANNON.Vec3(x, height / 2, z)
                });
                body.addShape(new CANNON.Box(new CANNON.Vec3(width / 2, height / 2, depth / 2)));
                this.world.addBody(body);
            }
        };

        const platformsOverlap = (a, b) => {
            const aw = a.width || a.size || 0;
            const ad = a.depth || a.size || 0;
            const bw = b.width || b.size || 0;
            const bd = b.depth || b.size || 0;

            const axMin = a.x - aw / 2;
            const axMax = a.x + aw / 2;
            const azMin = a.z - ad / 2;
            const azMax = a.z + ad / 2;

            const bxMin = b.x - bw / 2;
            const bxMax = b.x + bw / 2;
            const bzMin = b.z - bd / 2;
            const bzMax = b.z + bd / 2;

            const overlapX = axMin < bxMax && axMax > bxMin;
            const overlapZ = azMin < bzMax && azMax > bzMin;

            return overlapX && overlapZ;
        };

        // Helper to add a wide, gentle ramp between two heights
        const addRamp = ({ x, z, length, width, fromHeight, toHeight, yaw }) => {
            const rampGroup = new THREE.Group();

            const visualLength = length + 4;
            const midHeight = (fromHeight + toHeight) / 2;
            const rise = toHeight - fromHeight;
            const slope = Math.atan2(rise, visualLength);

            this.ramps.push({ x, z, length: visualLength, width, fromHeight, toHeight, yaw, slope, group: rampGroup });

            // Materials
            const sideMat = new THREE.MeshStandardMaterial({ map: this.sideTex, roughness: 0.95 });

            // 1. Ramp Top Surface
            const ramp = new THREE.Mesh(
                new THREE.BoxGeometry(width, 0.6, visualLength),
                grassMat.clone()
            );
            ramp.position.y = midHeight + 0.3;
            ramp.rotation.x = -slope;
            ramp.castShadow = true;
            ramp.receiveShadow = true;
            rampGroup.add(ramp);

            // 2. Side Walls (Thinner visuals)
            const sideThickness = 0.8; // Reduced thickness
            const sideHeight = 25.0; 
            const sideYOffset = -sideHeight / 2 + 0.3;

            // Visuals
            const leftSide = new THREE.Mesh(new THREE.BoxGeometry(sideThickness, sideHeight, visualLength), sideMat);
            // Position slightly overlapping the ramp to prevent gaps
            leftSide.position.set(-width / 2 - sideThickness / 2 + 0.1, midHeight + sideYOffset, 0);
            leftSide.rotation.x = -slope;
            leftSide.castShadow = true;
            rampGroup.add(leftSide);

            const rightSide = leftSide.clone();
            rightSide.position.x = width / 2 + sideThickness / 2 - 0.1;
            rampGroup.add(rightSide);

            // 3. Front/Back Caps
            const capThick = 2.0;
            // Visual caps positioned to fill void
            const startCap = new THREE.Mesh(new THREE.BoxGeometry(width + sideThickness*2, sideHeight, capThick), sideMat);
            startCap.position.set(0, midHeight + sideYOffset - (rise * 0.5), -visualLength/2);
            rampGroup.add(startCap);

            const endCap = new THREE.Mesh(new THREE.BoxGeometry(width + sideThickness*2, sideHeight, capThick), sideMat);
            endCap.position.set(0, midHeight + sideYOffset + (rise * 0.5), visualLength/2);
            rampGroup.add(endCap);
            
            // Add Group to scene
            rampGroup.position.set(x, 0, z);
            rampGroup.rotation.y = yaw;
            this.scene.add(rampGroup);

            // --- Physics ---
            // Construct correct rotation: Yaw(Global Y) * Slope(Local X)
            const qYaw = new CANNON.Quaternion();
            qYaw.setFromAxisAngle(new CANNON.Vec3(0,1,0), yaw);
            const qSlope = new CANNON.Quaternion();
            qSlope.setFromAxisAngle(new CANNON.Vec3(1,0,0), -slope);
            const qCombined = qYaw.mult(qSlope);

            // Main surface
            const mainBody = new CANNON.Body({ mass: 0 });
            mainBody.addShape(new CANNON.Box(new CANNON.Vec3(width / 2, 0.3, visualLength / 2)));
            mainBody.position.set(x, midHeight + 0.3, z);
            mainBody.quaternion.copy(qCombined);
            this.world.addBody(mainBody);

            // Side blockers
            const addSideBody = (offsetX) => {
                const body = new CANNON.Body({ mass: 0 });
                // Use slightly thicker collider than visual to ensure blocking
                body.addShape(new CANNON.Box(new CANNON.Vec3(sideThickness / 2, sideHeight / 2, visualLength / 2)));
                
                const pos = new THREE.Vector3(offsetX, sideYOffset, 0); 
                pos.applyAxisAngle(new THREE.Vector3(1,0,0), -slope);
                pos.applyAxisAngle(new THREE.Vector3(0,1,0), yaw);
                
                body.position.set(x + pos.x, midHeight + 0.3 + pos.y, z + pos.z);
                body.quaternion.copy(qCombined);
                this.world.addBody(body);
            };

            addSideBody(-(width / 2 + sideThickness / 2));
            addSideBody((width / 2 + sideThickness / 2));
            
            // Front/Back blockers - Vertical walls
            const addCapBody = (offsetZ, extraY) => {
                 const body = new CANNON.Body({ mass: 0 });
                 // Ensure width covers sides
                 body.addShape(new CANNON.Box(new CANNON.Vec3(width/2 + sideThickness + 1, sideHeight/2, capThick/2)));
                 
                 const pos = new THREE.Vector3(0, sideYOffset + extraY, offsetZ);
                 pos.applyAxisAngle(new THREE.Vector3(0,1,0), yaw);
                 
                 body.position.set(x + pos.x, midHeight + 0.3 + pos.y, z + pos.z);
                 // Caps are purely vertical, so only Yaw applies
                 body.quaternion.copy(qYaw);
                 this.world.addBody(body);
            };
            
            addCapBody(-visualLength/2, -rise/2);
            addCapBody(visualLength/2, rise/2);
        };

        // Use pre-initialized materials
        const lavaMat = this.lavaMaterial;

        this.baseGroundMesh = new THREE.Mesh(
            new THREE.PlaneGeometry(size, size),
            lavaMat
        );
        this.baseGroundMesh.rotation.x = -Math.PI / 2;
        this.baseGroundMesh.position.y = this.lavaGroundY;
        this.baseGroundMesh.receiveShadow = false;
        this.scene.add(this.baseGroundMesh);

        const floorBody = new CANNON.Body({
            mass: 0,
            shape: new CANNON.Plane()
        });
        floorBody.quaternion.setFromEuler(-Math.PI / 2, 0, 0);
        floorBody.position.set(0, this.lavaGroundY, 0);
        this.world.addBody(floorBody);

        // Completely procedural generation
        // Central Safe Zone
        addPlatform({ x: 0, z: 0, width: 40, depth: 40, height: 0 });

        const platformCount = 200;
        
        // Random platforms with better verticality
        for (let i = 0; i < platformCount; i++) {
            const w = this.randomValue(18, 40);
            const d = this.randomValue(18, 40);
            
            const angle = this.randomValue(0, Math.PI * 2);
            const radius = this.randomValue(35, size * 0.45); // Spread out more, avoid clumping center
            const x = Math.cos(angle) * radius;
            const z = Math.sin(angle) * radius;

            // Higher platforms for Tier 1 challenge
            // Chance for very high platforms
            let h = 0;
            const r = this.randomValue();
            if (r < 0.3) h = this.randomValue(2, 5);
            else if (r < 0.6) h = this.randomValue(5, 12); // Higher
            else if (r < 0.8) h = this.randomValue(12, 18); // Skyscrapers

            // Collision check with existing to prevent messy Z-fighting overlap
            let collision = false;
            for (let p of this.terrainPieces) {
                // Allow some overlap for connectivity, but not total
                // Actually, strict overlap check usually creates gaps.
                // Let's allow overlap if height is different, to create stacked feels?
                // For simplicity, standard overlap check
                if (platformsOverlap({x,z,width:w*0.8, depth:d*0.8}, p)) {
                    collision = true;
                    break;
                }
            }
            if (collision) continue;

            addPlatform({ x, z, width: w, depth: d, height: h });
        }

        // Removed hardcoded ramps and hills

        // Massive unclimbable mountains at the far edges of the map
        const wallHeight = 24;
        const wallThickness = 25;
        const half = size / 2;

        // North / South walls
        addPlatform({
            x: 0,
            z: half - wallThickness / 2,
            width: size,
            depth: wallThickness,
            height: wallHeight
        });
        addPlatform({
            x: 0,
            z: -half + wallThickness / 2,
            width: size,
            depth: wallThickness,
            height: wallHeight
        });

        // East / West walls
        addPlatform({
            x: half - wallThickness / 2,
            z: 0,
            width: wallThickness,
            depth: size,
            height: wallHeight
        });
        addPlatform({
            x: -half + wallThickness / 2,
            z: 0,
            width: wallThickness,
            depth: size,
            height: wallHeight
        });

        // Procedurally connect all platforms
        const rampPairs = new Set();
        const allRampSources = [...this.terrainPieces];

        const registerPairKey = (a, b) => {
            const id1 = `${Math.round(a.x)}:${Math.round(a.z)}`;
            const id2 = `${Math.round(b.x)}:${Math.round(b.z)}`;
            return id1 < id2 ? `${id1}|${id2}` : `${id2}|${id1}`;
        };

        // Improved connectivity: Ensure islands are reachable
        // Fix "ramps go nowhere" by only connecting valid platform centers
        for (let i = 0; i < allRampSources.length; i++) {
            const from = allRampSources[i];
            
            const neighbors = [];
            for (let j = 0; j < this.terrainPieces.length; j++) {
                const to = this.terrainPieces[j];
                if (to === from) continue;
                
                const heightDiff = Math.abs((to.height || 0) - (from.height || 0));
                // Stricter height diff check so ramps aren't impossibly steep
                if (heightDiff > 12) continue; 

                const dx = to.x - from.x;
                const dz = to.z - from.z;
                const dist = Math.sqrt(dx * dx + dz * dz);
                
                // Ensure platforms are actually separated enough to need a bridge
                // but close enough to be bridged
                const combinedRadius = (from.width || 20)/2 + (to.width || 20)/2;
                if (dist < combinedRadius * 0.8) continue; // overlapping already
                if (dist > 70) continue;

                neighbors.push({ to, dist, heightDiff });
            }
            
            neighbors.sort((a,b) => a.dist - b.dist);
            
            // Connect to closest 1-2 neighbors
            for(let k=0; k<Math.min(2, neighbors.length); k++) {
                const best = neighbors[k].to;
                const key = registerPairKey(from, best);
                if (rampPairs.has(key)) continue;
                rampPairs.add(key);

                const midX = (from.x + best.x) * 0.5;
                const midZ = (from.z + best.z) * 0.5;
                const dx = best.x - from.x;
                const dz = best.z - from.z;
                const dist = Math.sqrt(dx * dx + dz * dz);
                // Ramp angle
                const yaw = Math.atan2(dz, dx);

                const fromHeight = from.height || 0;
                const toHeight = best.height || 0;
                const low = Math.min(fromHeight, toHeight);
                const high = Math.max(fromHeight, toHeight);

                // Add bridge that fully spans center to center to ensure no gaps
                addRamp({
                    x: midX,
                    z: midZ,
                    length: dist, 
                    width: 14,
                    fromHeight: low,
                    toHeight: high,
                    yaw
                });
            }
        }

        // (Removed high platform specific logic, generic linker handles it)

        // Simple height lookup for grounding: step up when over a platform
        // checkY: optional current Y of entity. If provided, ignore surfaces far above/below to prevent snapping to overhead bridges or deep basements.
        this.getTerrainHeight = (x, z, checkY) => {
            let maxHeight = -999; // Default to abyss if nothing found
            let foundAny = false;

            const STEP_HEIGHT = 2.5; // Max height we can "snap" up to
            const DROP_HEIGHT = 100.0; // Max distance we can check down (raycast length essentially)

            // flat megabonk platforms
            for (let p of this.terrainPieces) {
                const halfW = p.width / 2;
                const halfD = p.depth / 2;
                if (
                    x >= p.x - halfW &&
                    x <= p.x + halfW &&
                    z >= p.z - halfD &&
                    z <= p.z + halfD
                ) {
                    const h = p.height;
                    // If checkY provided, filter out platforms that are too high to step onto
                    if (checkY !== undefined) {
                        if (h > checkY + STEP_HEIGHT) continue; // Too high, it's a ceiling/wall
                        // Note: We don't filter 'too low' strictly because we want to find the highest *valid* ground below us
                    }
                    if (h > maxHeight) {
                        maxHeight = h;
                        foundAny = true;
                    }
                }
            }

            // ramps: project into local ramp space and interpolate along slope
            for (let r of this.ramps) {
                const dx = x - r.x;
                const dz = z - r.z;

                const cos = Math.cos(-r.yaw);
                const sin = Math.sin(-r.yaw);
                const localX = dx * cos + dz * sin;
                const localZ = -dx * sin + dz * cos;

                const halfW = r.width / 2 + 0.6;
                const halfL = r.length / 2 + 0.6;

                if (
                    Math.abs(localX) <= halfW &&
                    localZ >= -halfL &&
                    localZ <= halfL
                ) {
                    const t = (localZ + r.length / 2) / r.length;
                    let h = r.fromHeight + t * (r.toHeight - r.fromHeight);
                    
                    // If checkY provided, check validity
                    if (checkY !== undefined) {
                        // Ramps are tricky because 'h' varies. Check specific point.
                        if (h > checkY + STEP_HEIGHT) continue; 
                    }
                    
                    if (h > maxHeight) {
                        maxHeight = h;
                        foundAny = true;
                    }
                }
            }

            // If we found nothing valid, fallback to 0 (default lava level) or just return the low value
            if (!foundAny) return 0;
            return maxHeight;
        };

        // Helper: is this position standing on any platform or ramp (solid ground)?
        this.isOnPlatformOrRamp = (x, z) => {
            // Flat platforms / plateaus
            for (let p of this.terrainPieces) {
                const sizeW = p.width || p.size || 0;
                const sizeD = p.depth || p.size || 0;
                const halfW = sizeW / 2;
                const halfD = sizeD / 2;
                if (
                    x >= p.x - halfW &&
                    x <= p.x + halfW &&
                    z >= p.z - halfD &&
                    z <= p.z + halfD
                ) {
                    return true;
                }
            }

            // Ramps
            for (let r of this.ramps) {
                const dx = x - r.x;
                const dz = z - r.z;

                const cos = Math.cos(-r.yaw);
                const sin = Math.sin(-r.yaw);
                const localX = dx * cos + dz * sin;
                const localZ = -dx * sin + dz * cos;

                const halfW = r.width / 2 + 0.6;
                const halfL = r.length / 2 + 0.6;

                if (Math.abs(localX) <= halfW && localZ >= -halfL && localZ <= halfL) {
                    return true;
                }
            }

            return false;
        };

        // Helper to tell if a world-space position is lava
        this.isLava = (x, z) => {
            const onSolid = this.isOnPlatformOrRamp(x, z);
            
            if (!onSolid) {
                return true;
            }

            // Overtime logic: Rising lava
            const terrainH = this.getTerrainHeight(x, z);
            if (this.overtimeActive) {
                if (terrainH < this.lavaHeight - 0.05) {
                    return true;
                }
            }

            return false;
        };

        this.scatterProps();
        
        // Always create the portal STRUCTURE so players know where to go, but keep it inactive
        // In Multiplayer, NO PORTAL.
        if (this.gameMode !== 'MULTI') {
            this.createBossPortal(); 
        }
        
        this.spawnMonkeCrate();
        this.spawnSecretLoreNote();
        this.createClouds();

        // Occasional tree leaf falls
        this.updateLeaves = (dt) => {
            if (!this.leafSpawners || this.leafSpawners.length === 0 || !this.particleSystem) return;
            if (Math.random() > 0.2) return;
            const spawn = this.leafSpawners[Math.floor(Math.random() * this.leafSpawners.length)];
            const pos = new THREE.Vector3(
                spawn.x + (Math.random() - 0.5) * 1.2,
                spawn.y,
                spawn.z + (Math.random() - 0.5) * 1.2
            );
            this.particleSystem.emit(pos, 0x1e7d1e, 2);
        };
    }

    createClouds() {
        // Visual Polish 2: Pixelated Clouds
        const cloudCount = 15;
        const geo = new THREE.BoxGeometry(12, 4, 8);
        // Make cloud material ignore scene fog so clouds don't get clipped by the fog sphere
        const mat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.4 });
        mat.fog = false;
        
        for(let i=0; i<cloudCount; i++) {
            const cloud = new THREE.Mesh(geo, mat);
            // Spawn high up and spread out
            const x = this.randomValue(-200, 200);
            const z = this.randomValue(-200, 200);
            const y = this.randomValue(45, 65);
            
            cloud.position.set(x, y, z);
            cloud.scale.set(
                this.randomValue(1, 2.5),
                this.randomValue(0.5, 1.2),
                this.randomValue(1, 2)
            );
            
            // Add some "pixel" chunks to it
            const detail = new THREE.Mesh(new THREE.BoxGeometry(4, 3, 4), mat.clone());
            detail.material.fog = false;
            detail.position.set(this.randomValue(-4,4), 1, this.randomValue(-3,3));
            cloud.add(detail);

            // Ensure clouds are rendered after fog and remain visible when above the camera
            cloud.traverse(c => { if (c.material) c.material.fog = false; });
            cloud.renderOrder = 2000;
            cloud.frustumCulled = false;

            this.scene.add(cloud);
            this.clouds.push({
                mesh: cloud,
                speed: this.randomValue(1, 3)
            });
        }
    }

    // Thoroughly remove tracked world objects and physics bodies before regenerating a new map
    clearWorld() {
        try {
            // Remove all bodies from physics world
            if (this.world && Array.isArray(this.world.bodies)) {
                this.world.bodies.slice().forEach(b => {
                    try { this.world.removeBody(b); } catch(e) {}
                });
            }
        } catch (e) {}

        const removeIf = (obj) => { try { if (!obj) return; if (obj && obj.parent) obj.parent.remove(obj); else if (obj) this.scene.remove(obj); } catch(e) {} };

        // Remove base ground mesh if it exists
        if (this.baseGroundMesh) {
            removeIf(this.baseGroundMesh);
            this.baseGroundMesh = null;
        }

        // Remove clouds
        if (this.clouds) {
            this.clouds.forEach(c => removeIf(c.mesh));
            this.clouds = [];
        }

        try {
            // Remove grouped/tracked scene objects
            (this.shrines || []).forEach(s => {
                try {
                    if (s.group) {
                        removeIf(s.group);
                    } else {
                        removeIf(s.crystal);
                        removeIf(s.barrier);
                        removeIf(s.chargeRing);
                    }
                } catch(e) {}
            });
            (this.chests || []).forEach(c => {
                try { removeIf(c.group); } catch(e) {}
                // Remove chest cost label sprite if present
                try {
                    if (c.costLabel && c.costLabel.sprite) {
                        removeIf(c.costLabel.sprite);
                    }
                } catch(e) {}
            });
            (this.turrets || []).forEach(t => { try { removeIf(t.mesh); } catch(e) {} });
            (this.enemies || []).forEach(e => { try { removeIf(e.mesh); } catch(e) {} });
            (this.projectiles || []).forEach(p => { try { removeIf(p.mesh); } catch(e) {} });
            (this.xpOrbs || []).forEach(o => { try { o.destroy(this.scene); } catch(e) {} });
            (this.orbitingBlades || []).forEach(b => { try { removeIf(b.mesh); } catch(e) {} });
            // aura visuals are attached to player mesh; detach and remove
            Object.values(this.auraVisuals || {}).forEach(av => { try { if (av.parent) av.parent.remove(av); else removeIf(av); } catch(e) {} });
            // decorative props (trees, rocks, ruins, etc.)
            (this.props || []).forEach(p => { try { removeIf(p); } catch(e) {} });
            // particle system pool
            try {
                if (this.particleSystem && Array.isArray(this.particleSystem.meshPool)) {
                    this.particleSystem.meshPool.forEach(m => { try { removeIf(m); } catch(e) {} });
                }
            } catch(e) {}
        } catch (e) {}

        // Remove procedural terrain pieces and ramps (we store group refs now)
        try {
            if (Array.isArray(this.terrainPieces)) {
                this.terrainPieces.forEach(p => { try { if (p && p.group) removeIf(p.group); } catch(e) {} });
            }
            if (Array.isArray(this.ramps)) {
                this.ramps.forEach(r => { try { if (r && r.group) removeIf(r.group); } catch(e) {} });
            }
            // Also remove any boss portal, portalParticles, monke visuals if present
            try { if (this.bossPortal && this.bossPortal.mesh) removeIf(this.bossPortal.mesh); } catch(e){}
            try { if (this.portalParticles) removeIf(this.portalParticles); } catch(e){}
            try { if (this.monkeCrate && this.monkeCrate.mesh) removeIf(this.monkeCrate.mesh); } catch(e){}
            try { if (this.monkeCrate && this.monkeCrate.monkeVisual) removeIf(this.monkeCrate.monkeVisual); } catch(e){}
            try { if (this.bossArena && this.bossArena.mesh) removeIf(this.bossArena.mesh); } catch(e){}
            try { if (this.bossArena && this.bossArena.groundRing) removeIf(this.bossArena.groundRing); } catch(e){}
            // Graves (Awakening + future uses)
            try {
                (this.graves || []).forEach(g => {
                    try { if (g.mesh) removeIf(g.mesh); } catch(e) {}
                });
            } catch(e){}
        } catch(e) {}

        // Clear arrays and references so createWorld starts fresh
        this.terrainPieces = [];
        this.ramps = [];
        this.obstacles = [];
        this.shrines = [];
        this.chests = [];
        this.turrets = [];
        this.enemies = [];
        this.projectiles = [];
        this.xpOrbs = [];
        this.orbitingBlades = [];
        this.auraVisuals = {};
        this.leafSpawners = [];
        this.monkeCrate = null;
        this.bossPortal = null;
        this.portalParticles = null;
        this.bossArena = null;
        this.props = [];
        this.graves = [];
    }

    createTerrainPiece(x, z, size, height) {
        const group = new THREE.Group();
        
        // Materials with textures if available
        const topMat = this.grassMaterial ? this.grassMaterial.clone() : new THREE.MeshStandardMaterial({ color: 0x4ade80, roughness: 0.7 });
        
        // Top surface
        const top = new THREE.Mesh(
            new THREE.BoxGeometry(size, 0.5, size),
            topMat
        );
        top.position.y = height + 0.25;
        top.receiveShadow = true;
        top.castShadow = true;
        group.add(top);
        
        // Sides
        if (height > 0) {
            const sideMat = new THREE.MeshStandardMaterial({
                map: this.sideTex || null,
                color: this.sideTex ? 0xffffff : 0x8B4513,
                roughness: 0.9
            });
            // Tiling
            if (this.sideTex) {
                sideMat.map = this.sideTex.clone();
                sideMat.map.wrapS = THREE.RepeatWrapping;
                sideMat.map.wrapT = THREE.RepeatWrapping;
                sideMat.map.repeat.set(Math.max(1, size/10), Math.max(1, height/10));
            }
            
            const sideHeight = height;
            
            // Front
            const front = new THREE.Mesh(new THREE.BoxGeometry(size, sideHeight, 0.5), sideMat);
            front.position.set(0, height/2, size/2);
            front.castShadow = true;
            group.add(front);
            
            const back = front.clone();
            back.position.z = -size/2;
            group.add(back);
            
            const left = new THREE.Mesh(new THREE.BoxGeometry(0.5, sideHeight, size), sideMat);
            left.position.set(-size/2, height/2, 0);
            left.castShadow = true;
            group.add(left);
            
            const right = left.clone();
            right.position.x = size/2;
            group.add(right);
        }
        
        group.position.set(x, 0, z);
        this.scene.add(group);
        
        // Add to tracking array used by isLava / isOnPlatformOrRamp
        this.terrainPieces.push({ x, z, size, width: size, depth: size, height, group });
    }
    
    createRamp(x, z, size, heightStart, heightEnd, rotation) {
        const rampHeight = heightEnd - heightStart;
        const group = new THREE.Group();

        // Make ramp a bit longer visually so it blends into platforms
        const visualLength = size * 0.8 + 4;
        const width = size * 0.8;
        const midHeight = (heightStart + heightEnd) / 2;
        const rise = heightEnd - heightStart;
        const slope = Math.atan2(rise, visualLength);

        // Main ramp surface
        const ramp = new THREE.Mesh(
            new THREE.BoxGeometry(width, 0.6, visualLength),
            (this.grassMaterial ? this.grassMaterial.clone() : new THREE.MeshStandardMaterial({ color: 0x4ade80, roughness: 0.7 }))
        );
        ramp.position.y = midHeight + 0.3;
        ramp.rotation.x = -slope;
        ramp.castShadow = true;
        ramp.receiveShadow = true;
        group.add(ramp);

        // Side Material (use texture if avail)
        const sideMat = new THREE.MeshStandardMaterial({
            map: this.sideTex || null,
            color: this.sideTex ? 0xffffff : 0x8B4513,
            roughness: 0.95
        });

        const sideThickness = 0.6;
        const sideHeight = 0.9;

        const leftSide = new THREE.Mesh(
            new THREE.BoxGeometry(sideThickness, sideHeight, visualLength),
            sideMat
        );
        leftSide.position.set(-width / 2 - sideThickness / 2, midHeight, 0);
        leftSide.rotation.x = -slope;
        leftSide.castShadow = true;
        leftSide.receiveShadow = true;
        group.add(leftSide);

        const rightSide = leftSide.clone();
        rightSide.position.x = width / 2 + sideThickness / 2;
        group.add(rightSide);

        // Slight bevel/top edge to make the ramp feel integrated
        const topEdgeMat = new THREE.MeshStandardMaterial({ color: 0x3c8f3c, roughness: 0.9, flatShading: true });
        const topEdge = new THREE.Mesh(
            new THREE.BoxGeometry(width - 0.2, 0.12, visualLength),
            topEdgeMat
        );
        topEdge.position.y = midHeight + 0.36;
        topEdge.rotation.x = -slope;
        group.add(topEdge);

        group.position.set(x, 0, z);
        group.rotation.y = rotation;
        this.scene.add(group);

        // Physics: add a simple oriented box for the ramp surface so collisions match visuals
        try {
            // Build combined quaternion from yaw (around Y) and slope (around X) to match visual orientation
            const qYaw = new CANNON.Quaternion();
            qYaw.setFromAxisAngle(new CANNON.Vec3(0, 1, 0), rotation);
            const qSlope = new CANNON.Quaternion();
            qSlope.setFromAxisAngle(new CANNON.Vec3(1, 0, 0), -slope);
            const qCombined = qYaw.mult(qSlope);

            const mainBody = new CANNON.Body({ mass: 0 });
            const rampThickness = 0.6;
            const mainShape = new CANNON.Box(new CANNON.Vec3(width / 2, rampThickness / 2, visualLength / 2));
            mainBody.addShape(mainShape);
            // position the main body at the ramp group's world position
            mainBody.position.set(x, midHeight + rampThickness / 2, z);
            mainBody.quaternion.copy(qCombined);
            this.world.addBody(mainBody);

            // Add slightly thicker side colliders (world-space positioned similarly to visuals)
            // Compute side collider vertical offset to match visual side placement
            const sideHalfX = sideThickness / 2;
            const sideHalfY = sideHeight / 2;
            const sideHalfZ = visualLength / 2;

            // vertical offset used when positioning side colliders so they sit flush with the ramp visuals
            const sideYOffset = -sideHeight / 2 + 0.3;

            const placeSide = (offsetX) => {
                const body = new CANNON.Body({ mass: 0 });
                body.addShape(new CANNON.Box(new CANNON.Vec3(sideHalfX, sideHalfY, sideHalfZ)));

                // local position relative to ramp center before rotation
                const localPos = new THREE.Vector3(offsetX, sideYOffset + 0.3, 0);
                // apply slope rotation locally (around X) then yaw (around Y)
                const v = localPos.clone();
                // rotate by slope (around X)
                const slopeQuat = new THREE.Quaternion();
                slopeQuat.setFromAxisAngle(new THREE.Vector3(1,0,0), -slope);
                v.applyQuaternion(slopeQuat);
                // rotate by yaw (around Y)
                const yawQuat = new THREE.Quaternion();
                yawQuat.setFromAxisAngle(new THREE.Vector3(0,1,0), rotation);
                v.applyQuaternion(yawQuat);

                body.position.set(x + v.x, midHeight + 0.3 + v.y, z + v.z);
                body.quaternion.copy(qCombined);
                this.world.addBody(body);
            };

            placeSide(-(width / 2 + sideThickness / 2 - 0.1));
            placeSide((width / 2 + sideThickness / 2 - 0.1));
        } catch (e) {
            console.warn('createRamp physics add skipped:', e);
        }
        
        // Add to tracking for isOnPlatformOrRamp so player doesn't die/teleport
        this.ramps.push({ x, z, length: visualLength, width, fromHeight: heightStart, toHeight: heightEnd, yaw: rotation, slope, group });
    }
    
    createFlatWorld() {
        // Pantheon Mode: Lava floor, single platform
        const size = 400;
        
        // Lava Floor
        this.baseGroundMesh = new THREE.Mesh(
            new THREE.PlaneGeometry(size, size),
            this.lavaMaterial // Use the animated lava material
        );
        this.baseGroundMesh.rotation.x = -Math.PI/2;
        this.baseGroundMesh.position.y = this.lavaGroundY;
        this.scene.add(this.baseGroundMesh);
        
        const body = new CANNON.Body({ mass: 0, shape: new CANNON.Plane() });
        body.quaternion.setFromEuler(-Math.PI/2, 0, 0);
        body.position.y = this.lavaGroundY;
        this.world.addBody(body);
        
        // Single Central Platform
        this.createTerrainPiece(0, 0, 40, 5);
        
        // Bright generic lighting
        this.scene.background = new THREE.Color(0x87CEEB);
        this.scene.fog = new THREE.FogExp2(0x87CEEB, 0.005);
        
        this.spawnPoint = new THREE.Vector3(0, 7, 0); // Spawn on platform
    }

    createTNSFinalArena() {
        // Epic Final Boss Arena
        const arenaRadius = 45;
        
        // Lava floor
        const lavaSize = 300;
        this.baseGroundMesh = new THREE.Mesh(
            new THREE.PlaneGeometry(lavaSize, lavaSize),
            this.lavaMaterial
        );
        this.baseGroundMesh.rotation.x = -Math.PI / 2;
        this.baseGroundMesh.position.y = -2;
        this.scene.add(this.baseGroundMesh);
        
        const floorBody = new CANNON.Body({ mass: 0, shape: new CANNON.Plane() });
        floorBody.quaternion.setFromEuler(-Math.PI/2, 0, 0);
        floorBody.position.set(0, -2, 0);
        this.world.addBody(floorBody);
        
        // Main Arena Platform (Grey Rock)
        const rockMat = new THREE.MeshStandardMaterial({ 
            map: this.rockTex, 
            roughness: 0.8,
            color: 0xaaaaaa // Even lighter
        });
        
        const arenaGroup = new THREE.Group();
        const mainPlat = new THREE.Mesh(new THREE.CylinderGeometry(arenaRadius, arenaRadius, 2, 32), rockMat);
        mainPlat.receiveShadow = true;
        arenaGroup.add(mainPlat);
        
        // Pillars around edge
        const pillarGeo = new THREE.BoxGeometry(2, 8, 2);
        for(let i=0; i<8; i++) {
            const angle = (i/8) * Math.PI*2;
            const px = Math.cos(angle) * (arenaRadius - 4);
            const pz = Math.sin(angle) * (arenaRadius - 4);
            const pillar = new THREE.Mesh(pillarGeo, rockMat);
            pillar.position.set(px, 4, pz);
            pillar.castShadow = true;
            arenaGroup.add(pillar);
            
            const pBody = new CANNON.Body({ mass: 0 });
            pBody.addShape(new CANNON.Box(new CANNON.Vec3(1, 4, 1)));
            pBody.position.set(px, 4, pz);
            this.world.addBody(pBody);
            this.obstacles.push({ type: 'box', x: px, z: pz, halfExtents: {x:1, z:1} });
        }
        
        this.scene.add(arenaGroup);
        
        const platBody = new CANNON.Body({ mass: 0 });
        platBody.addShape(new CANNON.Cylinder(arenaRadius, arenaRadius, 2, 16));
        const q = new CANNON.Quaternion();
        q.setFromAxisAngle(new CANNON.Vec3(1,0,0), -Math.PI/2);
        platBody.quaternion = q;
        this.world.addBody(platBody);
        
        this.terrainPieces.push({ x:0, z:0, width: arenaRadius*2, depth: arenaRadius*2, height: 1, group: arenaGroup });
        this.spawnPoint = new THREE.Vector3(0, 3, 30);
        
        // EXTRA BRIGHT Lighting for visibility
        this.scene.background = new THREE.Color(0xffaa88); // Very bright sunset
        this.scene.fog = new THREE.FogExp2(0xffaa88, 0.003); // Low density

        if (this.renderer) this.renderer.toneMappingExposure = 2.5;

        const tnsAmbient = new THREE.AmbientLight(0xffffff, 2.0);
        this.scene.add(tnsAmbient);

        const tnsFill = new THREE.DirectionalLight(0xffeedd, 1.2);
        tnsFill.position.set(-10, 20, -10);
        this.scene.add(tnsFill);
        
        this.bossPortal = null;
        
        // Boss Phase Logic Setup
        this.tnsPhase = 0; // 0: Warmup
        this.tnsTimer = 0;
        this.tnsWarmupDuration = 30;
        this.spawnRateMultiplier = 2.0; // 2x spawns
        
        this.showToast("SURVIVE! Boss arriving in 30s...");
        
        // Spawn chests immediately for prep
        for(let i=0; i<4; i++) {
            const angle = i * Math.PI/2 + Math.PI/4;
            const x = Math.cos(angle) * 20;
            const z = Math.sin(angle) * 20;
            this.spawnChest(new THREE.Vector3(x, 1, z), 10); // Costs coins
        }
    }

    createAwakeningWorld() {
        // Huge 2D Maze translated to 3D
        const mazeSize = 25; // Cells
        const cellSize = 20; // Units per cell
        const wallHeight = 12;
        
        // Maze Gen (DFS)
        const grid = Array(mazeSize).fill().map(() => Array(mazeSize).fill(1)); // 1 = Wall, 0 = Path
        const stack = [];
        const startX = 1;
        const startY = 1;
        
        grid[startY][startX] = 0;
        stack.push({x: startX, y: startY});
        
        const dirs = [[0, -2], [0, 2], [-2, 0], [2, 0]];
        
        // Carve Maze
        while (stack.length > 0) {
            const current = stack[stack.length - 1];
            const neighbors = [];
            
            for (let [dx, dy] of dirs) {
                const nx = current.x + dx;
                const ny = current.y + dy;
                if (nx > 0 && nx < mazeSize - 1 && ny > 0 && ny < mazeSize - 1 && grid[ny][nx] === 1) {
                    neighbors.push({x: nx, y: ny, dx, dy});
                }
            }
            
            if (neighbors.length > 0) {
                const chosen = neighbors[Math.floor(Math.random() * neighbors.length)];
                grid[current.y + chosen.dy/2][current.x + chosen.dx/2] = 0; // Remove wall between
                grid[chosen.y][chosen.x] = 0;
                stack.push({x: chosen.x, y: chosen.y});
            } else {
                stack.pop();
            }
        }
        
        // Carve Grave Rooms (3x3 clearings)
        const roomCount = 6;
        for(let i=0; i<roomCount; i++) {
            const rx = Math.floor(randomRange(2, mazeSize - 4));
            const ry = Math.floor(randomRange(2, mazeSize - 4));
            for(let y=0; y<4; y++) {
                for(let x=0; x<4; x++) {
                    grid[ry+y][rx+x] = 0;
                }
            }
            // Add Grave Prop in center
            const gx = (rx + 1.5) * cellSize;
            const gz = (ry + 1.5) * cellSize;
            this.spawnGrave(gx, gz);
        }

        // Build 3D World from Grid
        const rockMat = new THREE.MeshStandardMaterial({ map: this.rockTex, roughness: 0.8, color: 0xeeeeee });
        
        // Ensure tiling for floor
        const floorTex = this.rockTex.clone();
        floorTex.wrapS = THREE.RepeatWrapping; floorTex.wrapT = THREE.RepeatWrapping;
        floorTex.repeat.set(mazeSize * 2, mazeSize * 2);
        const floorMat = new THREE.MeshStandardMaterial({ map: floorTex, roughness: 0.9 });

        const floorGeo = new THREE.PlaneGeometry(mazeSize * cellSize, mazeSize * cellSize);
        const floor = new THREE.Mesh(floorGeo, floorMat);
        floor.rotation.x = -Math.PI/2;
        floor.position.set((mazeSize * cellSize)/2, 0, (mazeSize * cellSize)/2);
        floor.receiveShadow = true;
        this.scene.add(floor);
        this.baseGroundMesh = floor; // Track for cleanup
        
        // Physics Floor
        const floorBody = new CANNON.Body({ mass: 0, shape: new CANNON.Plane() });
        floorBody.quaternion.setFromEuler(-Math.PI / 2, 0, 0);
        this.world.addBody(floorBody);

        const wallGeo = new THREE.BoxGeometry(cellSize, wallHeight, cellSize);
        // Wall tiling
        const wallTex = this.rockTex.clone();
        wallTex.repeat.set(2, 1);
        const wallMat = new THREE.MeshStandardMaterial({ map: wallTex, roughness: 0.8 });

        for(let y=0; y<mazeSize; y++) {
            for(let x=0; x<mazeSize; x++) {
                if (grid[y][x] === 1) {
                    // Wall
                    const wx = x * cellSize + cellSize/2;
                    const wz = y * cellSize + cellSize/2;
                    
                    const mesh = new THREE.Mesh(wallGeo, wallMat);
                    mesh.position.set(wx, wallHeight/2, wz);
                    mesh.castShadow = true;
                    mesh.receiveShadow = true;
                    this.scene.add(mesh);
                    
                    const body = new CANNON.Body({ mass: 0 });
                    body.addShape(new CANNON.Box(new CANNON.Vec3(cellSize/2, wallHeight/2, cellSize/2)));
                    body.position.set(wx, wallHeight/2, wz);
                    this.world.addBody(body);
                    
                    this.terrainPieces.push({ x: wx, z: wz, width: cellSize, depth: cellSize, height: wallHeight, isWall: true, group: mesh });
                }
            }
        }
        
        // Set Spawn to start of maze (1,1)
        this.spawnPoint = new THREE.Vector3(1.5 * cellSize, 2, 1.5 * cellSize);
        if(this.playerBody) {
             this.playerBody.position.copy(this.spawnPoint);
             this.playerMesh.position.copy(this.spawnPoint);
        }
        
        // Bright Lighting for visibility
        const hemi = new THREE.HemisphereLight(0xffffff, 0x444444, 1.2);
        this.scene.add(hemi);
        const ambient = new THREE.AmbientLight(0xffffff, 0.5);
        this.scene.add(ambient);

        this.scene.fog = new THREE.FogExp2(0x111111, 0.015);
        this.scene.background = new THREE.Color(0x111111);

        // Create Portal in Awakening (far from spawn)
        // Find an empty cell far away
        const spawnX = this.spawnPoint.x;
        const spawnZ = this.spawnPoint.z;
        let portalX = spawnX, portalZ = spawnZ;
        let bestDist = 0;

        // Scan grid for floor
        for(let y=1; y<mazeSize-1; y++) {
            for(let x=1; x<mazeSize-1; x++) {
                if(grid[y][x] === 0) { // Floor
                    const wx = x * cellSize + cellSize/2;
                    const wz = y * cellSize + cellSize/2;
                    const d = Math.hypot(wx - spawnX, wz - spawnZ);
                    if (d > bestDist) {
                        bestDist = d;
                        portalX = wx;
                        portalZ = wz;
                    }
                }
            }
        }
        
        // Spawn portal
        this.createBossPortal(portalX, portalZ);

        // Add minimal props
        this.scatterProps();
    }

    spawnGrave(x, z) {
        const group = new THREE.Group();
        
        // Stone Tomb
        const stoneMat = new THREE.MeshStandardMaterial({ color: 0x555555 });
        const base = new THREE.Mesh(new THREE.BoxGeometry(2, 0.5, 3), stoneMat);
        group.add(base);
        
        const headstone = new THREE.Mesh(new THREE.BoxGeometry(1.5, 2, 0.4), stoneMat);
        headstone.position.set(0, 1, -1.2);
        group.add(headstone);
        
        const dirt = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.1, 2), new THREE.MeshStandardMaterial({ color: 0x332211 }));
        dirt.position.y = 0.3;
        group.add(dirt);

        // Interactive Trigger
        const trigger = new THREE.Mesh(new THREE.SphereGeometry(3), new THREE.MeshBasicMaterial({ visible: false }));
        trigger.userData = { isGrave: true, cx: x, cz: z };
        group.add(trigger);

        group.position.set(x, 0, z);
        this.scene.add(group);
        
        // Obstacle for physics
        const body = new CANNON.Body({ mass: 0 });
        body.addShape(new CANNON.Box(new CANNON.Vec3(1, 0.5, 1.5)));
        body.position.set(x, 0.25, z);
        this.world.addBody(body);
        
        this.graves.push({ mesh: group, x, z, used: false });
    }

    scatterProps() {
        if (this.gameMode === 'AWAKENING') return; // Props handled differently or minimal
        // Dense forest-like scattering with varied obstacles
        // Trees - lots of them for forest atmosphere
        this.leafSpawners = [];
        if (!this.props) this.props = [];
        
        // Use Tier based colors
        let treeColor = 0x4a3020;
        let leafColor1 = 0x1e7d1e;
        let leafColor2 = 0x2d8a2d;

        if (this.tier > 1) {
            treeColor = Math.random() * 0xffffff;
            leafColor1 = Math.random() * 0xffffff;
            leafColor2 = Math.random() * 0xffffff;
        }

        for(let i = 0; i < 180; i++) {
            const x = this.randomValue(-180, 180);
            const z = this.randomValue(-180, 180);
            if (Math.sqrt(x*x + z*z) < 16) continue;

            // Ensure not spawning trees on lava
            if (!this.isOnPlatformOrRamp(x, z)) continue;
            
            const terrainY = this.getTerrainHeight(x, z);
            
            const height = this.randomValue(3, 7);
            const radius = this.randomValue(0.4, 0.9);
            
            const trunk = new THREE.Mesh(
                new THREE.CylinderGeometry(radius * 0.35, radius * 0.45, height, 6),
                new THREE.MeshStandardMaterial({ 
                    color: treeColor,
                    roughness: 1,
                    flatShading: true
                })
            );
            trunk.position.set(x, terrainY + height/2, z);
            // Slight sway logic will be added in animate or via shader, 
            // but for now let's just rotate slightly random
            trunk.castShadow = true;
            trunk.receiveShadow = true;
            trunk.userData.isTree = true;
            this.scene.add(trunk);
            this.props.push(trunk);

            this.obstacles.push({
                type: 'cylinder',
                x,
                z,
                radius: radius * 0.6
            });
            
            const leafCount = Math.floor(randomRange(2, 4));
            for (let j = 0; j < leafCount; j++) {
                const leafSize = randomRange(1.2, 2) * radius;
                const leaves = new THREE.Mesh(
                    new THREE.DodecahedronGeometry(leafSize, 0),
                    new THREE.MeshStandardMaterial({ 
                        color: j % 2 === 0 ? leafColor1 : leafColor2,
                        roughness: 0.9,
                        flatShading: true
                    })
                );
                leaves.position.set(
                    x + randomRange(-0.3, 0.3), 
                    terrainY + height + j * 0.8, 
                    z + randomRange(-0.3, 0.3)
                );
                leaves.castShadow = true;
                leaves.receiveShadow = true;
                leaves.userData.isTree = true;
                leaves.userData.swayOffset = Math.random() * 100;
                this.scene.add(leaves);
                this.props.push(leaves);

                this.leafSpawners.push({
                    x,
                    z,
                    y: leaves.position.y
                });
            }
        }
        
        // Rocks - scattered decorative obstacles
        for(let i = 0; i < 90; i++) {
            const x = this.randomValue(-180, 180);
            const z = this.randomValue(-180, 180);
            if (Math.sqrt(x*x + z*z) < 16) continue;
            
            const terrainY = this.getTerrainHeight(x, z);
            const size = this.randomValue(0.6, 1.8);
            
            const rock = new THREE.Mesh(
                new THREE.DodecahedronGeometry(size, 0),
                new THREE.MeshStandardMaterial({ 
                    color: this.randomValue() > 0.5 ? 0x707070 : 0x5a5a5a,
                    roughness: 0.95,
                    flatShading: true
                })
            );
            rock.position.set(x, terrainY + size * 0.6, z);
            rock.rotation.set(
                randomRange(0, Math.PI), 
                randomRange(0, Math.PI * 2), 
                randomRange(0, Math.PI)
            );
            rock.castShadow = true;
            rock.receiveShadow = true;
            this.scene.add(rock);
            this.props.push(rock);

            // Rock obstacle (approx sphere)
            this.obstacles.push({
                type: 'sphere',
                x,
                z,
                radius: size * 0.7
            });
        }
        
        // Stone ruins / beams (decorative structures)
        for(let i = 0; i < 20; i++) {
            const x = this.randomValue(-170, 170);
            const z = this.randomValue(-170, 170);
            if (Math.sqrt(x*x + z*z) < 25) continue;
            
            const terrainY = this.getTerrainHeight(x, z);
            
            // Vertical stone pillar
            const height = this.randomValue(3, 6);
            const pillar = new THREE.Mesh(
                new THREE.BoxGeometry(0.8, height, 0.8),
                new THREE.MeshStandardMaterial({ 
                    color: 0x8a8a8a,
                    roughness: 0.9,
                    flatShading: true
                })
            );
            pillar.position.set(x, terrainY + height/2, z);
            pillar.rotation.y = this.randomValue(0, Math.PI * 2);
            
            // Sometimes tilted/broken
            if (this.randomValue() > 0.6) {
                pillar.rotation.z = this.randomValue(-0.3, 0.3);
            }
            
            pillar.castShadow = true;
            pillar.receiveShadow = true;
            this.scene.add(pillar);
            this.props.push(pillar);

            // Pillar obstacle (square-ish footprint)
            this.obstacles.push({
                type: 'box',
                x,
                z,
                halfExtents: { x: 0.5, z: 0.5 }
            });
            
            // Sometimes add horizontal beam
            if (Math.random() > 0.5) {
                const beam = new THREE.Mesh(
                    new THREE.BoxGeometry(3, 0.5, 0.6),
                    new THREE.MeshStandardMaterial({ 
                        color: 0x757575,
                        roughness: 0.9,
                        flatShading: true
                    })
                );
                beam.position.set(x, terrainY + height * 0.7, z);
                beam.rotation.y = randomRange(0, Math.PI * 2);
                beam.castShadow = true;
                beam.receiveShadow = true;
                this.scene.add(beam);
                this.props.push(beam);
            }
        }
        
        // Extra tall ruined stone pillars for a more dramatic skyline
        for (let i = 0; i < 18; i++) {
            const x = randomRange(-170, 170);
            const z = randomRange(-170, 170);
            if (Math.sqrt(x * x + z * z) < 35) continue;

            const terrainY = this.getTerrainHeight(x, z);
            const segments = Math.floor(randomRange(5, 9));
            let currentY = terrainY;

            for (let j = 0; j < segments; j++) {
                const brick = new THREE.Mesh(
                    new THREE.BoxGeometry(1.9, 0.9, 1.9),
                    new THREE.MeshStandardMaterial({
                        color: 0x777777,
                        roughness: 0.9,
                        flatShading: true
                    })
                );
                const wobble = (j === 0) ? 0 : randomRange(-0.15, 0.15);
                brick.position.set(x + wobble, currentY + 0.45, z + wobble);
                brick.rotation.y = randomRange(0, Math.PI * 2);
                brick.castShadow = true;
                brick.receiveShadow = true;
                this.scene.add(brick);
                this.props.push(brick);
                currentY += 0.9;

                if (j === 0) {
                    // Base of the pillar acts as a blocking obstacle
                    this.obstacles.push({
                        type: 'box',
                        x,
                        z,
                        halfExtents: { x: 0.95, z: 0.95 }
                    });
                }
            }

            // Simple vine strips
            if (Math.random() > 0.4) {
                const vine = new THREE.Mesh(
                    new THREE.BoxGeometry(0.2, randomRange(2, 4), 0.2),
                    new THREE.MeshStandardMaterial({
                        color: 0x1f6f2a,
                        roughness: 1,
                        flatShading: true
                    })
                );
                vine.position.set(x + randomRange(-0.7, 0.7), terrainY + randomRange(3, 6), z + 0.95);
                vine.castShadow = true;
                this.scene.add(vine);
                this.props.push(vine);
            }
        }
        
        // Increased Shrines & Chests
        const shrineCount = 12;
        for(let i = 0; i < shrineCount; i++) {
            const plateau = this.terrainPieces[Math.floor(this.randomValue(0, this.terrainPieces.length))];
            const plateauSize = (plateau.width && plateau.depth)
                ? Math.min(plateau.width, plateau.depth)
                : plateau.size || 20;
            const offsetX = this.randomValue(-plateauSize * 0.3, plateauSize * 0.3);
            const offsetZ = this.randomValue(-plateauSize * 0.3, plateauSize * 0.3);
            const x = plateau.x + offsetX;
            const z = plateau.z + offsetZ;
            const terrainY = plateau.height;
            
            const shrine = new THREE.Group();
            
            // Stone base
            const base = new THREE.Mesh(
                new THREE.CylinderGeometry(2, 2.5, 0.8, 8),
                new THREE.MeshStandardMaterial({ 
                    color: 0x606060,
                    roughness: 0.9,
                    flatShading: true
                })
            );
            base.position.y = terrainY + 0.4;
            base.castShadow = true;
            shrine.add(base);
            
            // Pillar
            const pillar = new THREE.Mesh(
                new THREE.CylinderGeometry(0.35, 0.35, 3.5, 8),
                new THREE.MeshStandardMaterial({ 
                    color: 0x808080,
                    roughness: 0.85,
                    flatShading: true
                })
            );
            pillar.position.y = terrainY + 2.3;
            pillar.castShadow = true;
            shrine.add(pillar);
            
            // Glowing crystal
            const crystal = new THREE.Mesh(
                new THREE.OctahedronGeometry(0.6, 0),
                new THREE.MeshStandardMaterial({ 
                    color: 0x00ffff,
                    emissive: 0x00ffff,
                    emissiveIntensity: 1,
                    flatShading: true
                })
            );
            crystal.position.y = terrainY + 4.5;
            crystal.castShadow = true;
            shrine.add(crystal);
            
            // Visual barrier sphere (range indicator)
            const barrierGeo = new THREE.SphereGeometry(3, 16, 16);
            const barrierMat = new THREE.MeshBasicMaterial({ 
                color: 0x00ffff,
                transparent: true,
                opacity: 0.15,
                wireframe: true
            });
            const barrier = new THREE.Mesh(barrierGeo, barrierMat);
            barrier.position.y = terrainY + 2.0;
            shrine.add(barrier);

            // Charge Ring (Visual Indicator)
            const chargeGeo = new THREE.RingGeometry(2.0, 2.5, 32);
            // Rotate flat
            chargeGeo.rotateX(-Math.PI / 2);
            
            const chargeMat = new THREE.ShaderMaterial({
                uniforms: {
                    uColor: { value: new THREE.Color(0x00ffff) },
                    uProgress: { value: 0.0 }
                },
                vertexShader: `
                    varying vec2 vUv;
                    void main() {
                        vUv = uv;
                        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
                    }
                `,
                fragmentShader: `
                    uniform vec3 uColor;
                    uniform float uProgress;
                    varying vec2 vUv;
                    #define PI 3.14159265
                    void main() {
                        vec2 dir = vUv - 0.5;
                        float angle = atan(dir.y, dir.x); // -PI to PI
                        float a = (angle + PI * 0.5); // 0 at top
                        if (a < 0.0) a += PI * 2.0;
                        a /= (PI * 2.0);
                        // Clockwise
                        a = 1.0 - a;
                        
                        if (a > uProgress) discard;
                        
                        gl_FragColor = vec4(uColor, 0.8);
                    }
                `,
                transparent: true,
                side: THREE.DoubleSide
            });
            const chargeRing = new THREE.Mesh(chargeGeo, chargeMat);
            chargeRing.position.y = terrainY + 5.5; // Above crystal
            chargeRing.visible = false;
            shrine.add(chargeRing);
            
            shrine.position.set(x, 0, z);
            this.scene.add(shrine);
            if (!this.props) this.props = [];
            this.props.push(shrine);
            
            this.shrines.push({
                group: shrine,
                position: new THREE.Vector3(x, terrainY, z),
                crystal: crystal,
                barrier: barrier,
                chargeRing: chargeRing,
                used: false,
                activationTime: 0,
                requiredTime: 5.5,
                isActivating: false
            });
        }

        // Scatter coin-locked chests on plateaus and safe ground
        const chestCount = 35;
        for (let i = 0; i < chestCount; i++) {
            const plateau = this.terrainPieces[Math.floor(this.randomValue(0, this.terrainPieces.length))];
            const plateauSize = (plateau.width && plateau.depth)
                ? Math.min(plateau.width, plateau.depth)
                : plateau.size || 20;
            const offsetX = this.randomValue(-plateauSize * 0.35, plateauSize * 0.35);
            const offsetZ = this.randomValue(-plateauSize * 0.35, plateauSize * 0.35);
            const x = plateau.x + offsetX;
            const z = plateau.z + offsetZ;
            const terrainY = plateau.height || this.getTerrainHeight(x, z);
            const distFromCenter = Math.sqrt(x * x + z * z);
            // Avoid cluttering the immediate spawn circle
            if (distFromCenter < 18) continue;
            this.spawnChest(new THREE.Vector3(x, terrainY, z), 6);
        }
    }

    createPlayer() {
        const group = new THREE.Group();
        // Safe accessor: createWorld defines getTerrainHeight later — guard against it being undefined during init
        const safeGetTerrain = (x, z) => {
            return (typeof this.getTerrainHeight === 'function') ? this.getTerrainHeight(x, z) : 0;
        };
        const type = this.characterKey;

        // Visual offset to fix characters sinking into ground
        // We attach this to the group user data to use in updatePlayer
        let verticalVisualOffset = 0.2; 

        let armL = null, armR = null, legL = null, legR = null;

        if (type === 'FOX') {
            verticalVisualOffset = 0.5; // Fox needs to float a bit higher
            // Fox – small quad-ish body with tail
            const body = new THREE.Mesh(
                new THREE.BoxGeometry(0.9, 0.6, 1.5),
                new THREE.MeshStandardMaterial({ color: 0xff7f3f, flatShading: true })
            );
            body.position.y = 0.4;
            group.add(body);

            const head = new THREE.Mesh(
                new THREE.BoxGeometry(0.7, 0.6, 0.7),
                new THREE.MeshStandardMaterial({ color: 0xff9b5e, flatShading: true })
            );
            head.position.set(0, 0.9, 0.6);
            group.add(head);

            const earGeo = new THREE.BoxGeometry(0.2, 0.4, 0.2);
            const earMat = new THREE.MeshStandardMaterial({ color: 0xffe0c0, flatShading: true });
            const earL = new THREE.Mesh(earGeo, earMat);
            earL.position.set(-0.25, 1.25, 0.6);
            const earR = earL.clone();
            earR.position.x = 0.25;
            group.add(earL, earR);

            const tail = new THREE.Mesh(
                new THREE.BoxGeometry(0.25, 0.25, 0.9),
                new THREE.MeshStandardMaterial({ color: 0xff7f3f, flatShading: true })
            );
            tail.position.set(0, 0.6, -0.9);
            tail.rotation.x = 0.4;
            group.add(tail);

            // Legs as simple blocks
            const legGeo = new THREE.BoxGeometry(0.2, 0.6, 0.2);
            const legMat = new THREE.MeshStandardMaterial({ color: 0x52220f, flatShading: true });

            legL = new THREE.Mesh(legGeo, legMat);
            legL.position.set(-0.3, 0.3, 0.5);
            legR = new THREE.Mesh(legGeo, legMat);
            legR.position.set(0.3, 0.3, 0.5);
            const legBL = new THREE.Mesh(legGeo, legMat);
            legBL.position.set(-0.3, 0.3, -0.3);
            const legBR = new THREE.Mesh(legGeo, legMat);
            legBR.position.set(0.3, 0.3, -0.3);

            group.add(legL, legR, legBL, legBR);

            this.playerLimbs = { legL, legR, armL: legBL, armR: legBR };
        } else if (type === 'CALCIUM') {
            verticalVisualOffset = 0.3;
            // Calcium – more detailed skeleton riding a skateboard (sideways stance)
            const boneMat = new THREE.MeshStandardMaterial({ color: 0xdddddd, flatShading: true });
            const skullMat = new THREE.MeshStandardMaterial({ color: 0xf5f5f5, flatShading: true });

            // Spine
            const spine = new THREE.Mesh(
                new THREE.BoxGeometry(0.25, 1.0, 0.25),
                boneMat
            );
            spine.position.y = 1.1;
            group.add(spine);

            // Simple ribcage plates
            for (let i = 0; i < 3; i++) {
                const rib = new THREE.Mesh(
                    new THREE.BoxGeometry(0.9, 0.12, 0.25),
                    boneMat
                );
                rib.position.y = 0.85 + i * 0.22;
                group.add(rib);
            }

            // Pelvis
            const pelvis = new THREE.Mesh(
                new THREE.BoxGeometry(0.6, 0.25, 0.4),
                boneMat
            );
            pelvis.position.y = 0.6;
            group.add(pelvis);

            // Skull
            const head = new THREE.Mesh(
                new THREE.BoxGeometry(0.7, 0.7, 0.7),
                skullMat
            );
            head.position.y = 1.8;
            group.add(head);

            const jaw = new THREE.Mesh(
                new THREE.BoxGeometry(0.6, 0.25, 0.55),
                skullMat
            );
            jaw.position.y = 1.55;
            group.add(jaw);

            const eyeL = new THREE.Mesh(
                new THREE.BoxGeometry(0.14, 0.16, 0.16),
                new THREE.MeshBasicMaterial({ color: 0x000000 })
            );
            eyeL.position.set(-0.18, 1.85, 0.39);
            const eyeR = eyeL.clone();
            eyeR.position.x = 0.18;
            group.add(eyeL, eyeR);

            // Arms (loose skate stance)
            armL = new THREE.Mesh(
                new THREE.BoxGeometry(0.18, 0.9, 0.18),
                boneMat
            );
            armL.position.set(-0.6, 1.1, 0.05);
            armR = armL.clone();
            armR.position.x = 0.6;
            group.add(armL, armR);

            // Legs planted wide on the board
            legL = new THREE.Mesh(
                new THREE.BoxGeometry(0.22, 0.9, 0.22),
                boneMat
            );
            legL.position.set(-0.4, 0.55, 0.05);
            legR = legL.clone();
            legR.position.x = 0.4;
            group.add(legL, legR);

            // Skateboard – slightly longer with rounded nose/tail feel
            const board = new THREE.Mesh(
                new THREE.BoxGeometry(1.8, 0.1, 0.4),
                new THREE.MeshStandardMaterial({ color: 0x222222, flatShading: true })
            );
            board.position.y = 0.1;
            board.rotation.z = 0.03;
            group.add(board);

            const grip = new THREE.Mesh(
                new THREE.PlaneGeometry(1.76, 0.36),
                new THREE.MeshStandardMaterial({ color: 0x111111, flatShading: true })
            );
            grip.rotation.x = -Math.PI / 2;
            grip.position.y = 0.16;
            group.add(grip);

            // Wheels
            const wheelGeo = new THREE.CylinderGeometry(0.12, 0.12, 0.22, 8);
            const wheelMat = new THREE.MeshStandardMaterial({ color: 0x555555, flatShading: true });
            for (let sx of [-0.7, 0.7]) {
                for (let sz of [-0.18, 0.18]) {
                    const wheel = new THREE.Mesh(wheelGeo, wheelMat);
                    wheel.rotation.z = Math.PI / 2;
                    wheel.position.set(sx, 0.02, sz);
                    group.add(wheel);
                }
            }

            // Start Calcium standing sideways relative to forward
            group.rotation.y = Math.PI / 2;

            this.playerLimbs = { armL, armR, legL, legR };
        } else if (type === 'GIGACHAD') {
            verticalVisualOffset = 0.6; // Raise him up so feet are on ground
            // GigaChad – lean, exaggerated muscular, shirtless upper body
            const skinMat = new THREE.MeshStandardMaterial({
                color: 0xffd1a4,
                flatShading: true
            });

            // Big upper chest, narrower waist
            const upperChest = new THREE.Mesh(
                new THREE.BoxGeometry(1.8, 0.9, 0.7),
                skinMat
            );
            upperChest.position.y = 1.3;
            group.add(upperChest);

            const lowerTorso = new THREE.Mesh(
                new THREE.BoxGeometry(1.0, 0.7, 0.6),
                skinMat
            );
            lowerTorso.position.y = 0.7;
            group.add(lowerTorso);

            // Simple blocky abs
            const absMat = new THREE.MeshStandardMaterial({
                color: 0xf9b98c,
                flatShading: true
            });
            for (let i = 0; i < 3; i++) {
                const ab = new THREE.Mesh(
                    new THREE.BoxGeometry(0.35, 0.18, 0.25),
                    absMat
                );
                ab.position.set(-0.18, 0.9 - i * 0.22, 0.32);
                group.add(ab);
                const abR = ab.clone();
                abR.position.x = 0.18;
                group.add(abR);
            }

            const head = new THREE.Mesh(
                new THREE.BoxGeometry(0.6, 0.6, 0.6),
                skinMat
            );
            head.position.y = 2.1;
            group.add(head);

            // Simple jawline / chin
            const jaw = new THREE.Mesh(
                new THREE.BoxGeometry(0.5, 0.25, 0.5),
                skinMat
            );
            jaw.position.set(0, 1.8, 0);
            group.add(jaw);

            // Arms – long and muscular
            armL = new THREE.Mesh(
                new THREE.BoxGeometry(0.35, 1.1, 0.35),
                skinMat
            );
            armL.position.set(-1.1, 1.1, 0);
            armR = armL.clone();
            armR.position.x = 1.1;
            group.add(armL, armR);

            // Pants & legs
            const pantsMat = new THREE.MeshStandardMaterial({
                color: 0x1f2933,
                flatShading: true
            });
            const hips = new THREE.Mesh(
                new THREE.BoxGeometry(0.9, 0.4, 0.6),
                pantsMat
            );
            hips.position.y = 0.25;
            group.add(hips);

            legL = new THREE.Mesh(
                new THREE.BoxGeometry(0.45, 1.2, 0.45),
                pantsMat
            );
            legL.position.set(-0.35, -0.4, 0);
            legR = legL.clone();
            legR.position.x = 0.35;
            group.add(legL, legR);
            
            // Chad Aura Visual
            const auraGeo = new THREE.SphereGeometry(3.5, 16, 16);
            const auraMat = new THREE.MeshBasicMaterial({ 
                color: 0xffaa00, 
                transparent: true, 
                opacity: 0.1, 
                wireframe: true 
            });
            const auraMesh = new THREE.Mesh(auraGeo, auraMat);
            // Pulse animation handled in update
            auraMesh.userData = { isAura: true };
            group.add(auraMesh);

            this.playerLimbs = { armL, armR, legL, legR };
        } else if (type === 'MONKE') {
            verticalVisualOffset = 0.3;
            // Monke: Brown fur, sunglasses
            const furColor = 0x5C4033;
            const skinColor = 0xC4A484;

            const furMat = new THREE.MeshStandardMaterial({ color: furColor, flatShading: true });
            const skinMat = new THREE.MeshStandardMaterial({ color: skinColor, flatShading: true });

            // Body
            const body = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.8, 0.6), furMat);
            body.position.y = 0.7;
            group.add(body);

            // Head
            const head = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.6, 0.6), furMat);
            head.position.y = 1.45;
            group.add(head);

            // Muzzle
            const muzzle = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.3, 0.2), skinMat);
            muzzle.position.set(0, 1.35, 0.35);
            group.add(muzzle);

            // Ears
            const earL = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.3, 0.1), furMat);
            earL.position.set(-0.4, 1.5, 0);
            group.add(earL);
            const earR = earL.clone();
            earR.position.x = 0.4;
            group.add(earR);

            // Sunglasses
            const glasses = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.15, 0.1), new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.2 }));
            glasses.position.set(0, 1.55, 0.32);
            group.add(glasses);

            // Long Arms
            armL = new THREE.Mesh(new THREE.BoxGeometry(0.25, 1.1, 0.25), furMat);
            armL.position.set(-0.65, 1.0, 0);
            group.add(armL);
            armR = armL.clone();
            armR.position.x = 0.65;
            group.add(armR);

            // Short Legs
            legL = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.6, 0.3), furMat);
            legL.position.set(-0.25, 0.3, 0);
            group.add(legL);
            legR = legL.clone();
            legR.position.x = 0.25;
            group.add(legR);
            
            // Tail
            const tail = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.8, 0.15), furMat);
            tail.position.set(0, 0.6, -0.4);
            tail.rotation.x = 1.0;
            group.add(tail);

            this.playerLimbs = { armL, armR, legL, legR };

        } else if (type === 'BLITZ') {
            // Epic Menu Blitz ported to Game - Sleek combat bot (Hovering)
            verticalVisualOffset = 0.25;
            
            const metalMat = new THREE.MeshStandardMaterial({ color: 0x223344, flatShading: true });
            const glowMat = new THREE.MeshStandardMaterial({ color: 0x00ffff, emissive: 0x00ffff, emissiveIntensity: 1.5 });
            
            // Hover unit body (conical)
            const body = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.2, 1.2, 8), metalMat);
            body.position.y = 1.0;
            group.add(body);
            
            // Core reactor
            const core = new THREE.Mesh(new THREE.SphereGeometry(0.25), glowMat);
            core.position.set(0, 1.1, 0.3);
            group.add(core);

            // Head
            const head = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.4, 0.5), metalMat);
            head.position.y = 1.7;
            group.add(head);
            const visor = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.1, 0.1), glowMat);
            visor.position.set(0, 1.7, 0.25);
            group.add(visor);

            // Floating shoulders/arms
            const shoulderL = new THREE.Mesh(new THREE.SphereGeometry(0.25), metalMat);
            shoulderL.position.set(-0.7, 1.4, 0);
            group.add(shoulderL);
            const shoulderR = shoulderL.clone();
            shoulderR.position.x = 0.7;
            group.add(shoulderR);

            // Hands (Use as arm limbs for animation purposes)
            armL = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.5, 0.2), metalMat);
            armL.position.set(-0.7, 0.9, 0.2);
            group.add(armL);
            
            armR = armL.clone();
            armR.position.x = 0.7;
            group.add(armR);

            // Blitz hovers, no legs
            this.playerLimbs = { armL, armR, legL: null, legR: null };
            
        } else if (type === 'SIR_CHAD') {
            verticalVisualOffset = 0.6;
            // Sir Chad - Improved Visuals: More detailed, darker, glowing accents
            const armorMat = new THREE.MeshStandardMaterial({ 
                color: 0x050505, 
                metalness: 0.8, 
                roughness: 0.2, 
                flatShading: true 
            });
            const glowMat = new THREE.MeshStandardMaterial({
                color: 0xff0000,
                emissive: 0xff0000,
                emissiveIntensity: 3.0
            });
            
            // Bulky Torso with spikes
            const torso = new THREE.Mesh(new THREE.BoxGeometry(1.2, 1.5, 0.8), armorMat);
            torso.position.y = 1.2;
            group.add(torso);
            
            // Chest plate detail
            const plate = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.8, 0.9), armorMat);
            plate.position.y = 1.4;
            group.add(plate);
            
            // Head (Helmet)
            const head = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.9, 0.8), armorMat);
            head.position.y = 2.2;
            group.add(head);
            
            // Glowing Eye Slit (Visor)
            const visor = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.1, 0.85), glowMat);
            visor.position.y = 2.2;
            group.add(visor);
            
            // Crown Spikes
            const spikeGeo = new THREE.ConeGeometry(0.1, 0.4, 4);
            const spike1 = new THREE.Mesh(spikeGeo, armorMat);
            spike1.position.set(0, 2.7, 0);
            group.add(spike1);
            const spike2 = new THREE.Mesh(spikeGeo, armorMat);
            spike2.position.set(-0.3, 2.65, 0); spike2.rotation.z = 0.3;
            group.add(spike2);
            const spike3 = new THREE.Mesh(spikeGeo, armorMat);
            spike3.position.set(0.3, 2.65, 0); spike3.rotation.z = -0.3;
            group.add(spike3);
            
            // Massive Pauldrons
            const shL = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.7, 0.7), armorMat);
            shL.position.set(-0.9, 1.8, 0);
            // Spikes on shoulders
            const sSpike = new THREE.Mesh(spikeGeo, glowMat);
            sSpike.position.y = 0.4;
            shL.add(sSpike);
            group.add(shL);
            
            const shR = shL.clone();
            shR.position.x = 0.9;
            group.add(shR);
            
            armL = new THREE.Mesh(new THREE.BoxGeometry(0.35, 1.1, 0.35), armorMat);
            armL.position.set(-0.8, 1.2, 0);
            group.add(armL);
            armR = armL.clone();
            armR.position.x = 0.8;
            group.add(armR);
            
            legL = new THREE.Mesh(new THREE.BoxGeometry(0.4, 1.1, 0.4), armorMat);
            legL.position.set(-0.3, 0.55, 0);
            group.add(legL);
            legR = legL.clone();
            legR.position.x = 0.3;
            group.add(legR);
            
            // Giga Sword
            const swordGroup = new THREE.Group();
            const blade = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.1, 2.4), new THREE.MeshStandardMaterial({ color: 0x555555, metalness: 0.8 }));
            blade.position.z = 1.2;
            swordGroup.add(blade);
            const hilt = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.1, 0.6), new THREE.MeshStandardMaterial({ color: 0x880000 }));
            hilt.position.z = 0;
            swordGroup.add(hilt);
            
            swordGroup.position.set(0, -0.3, 0.5);
            swordGroup.rotation.x = -0.3;
            armR.add(swordGroup);
            this.playerSword = swordGroup;
            this.playerLimbs = { armL, armR, legL, legR };
            
        } else if (type === 'BOBERTO') {
            verticalVisualOffset = 0.4;
            // Boberto - Sheet Ghost with visible legs
            
            // Legs (Jeans)
            const legMat = new THREE.MeshStandardMaterial({ color: 0x223355, flatShading: true });
            legL = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.8, 0.25), legMat);
            legL.position.set(-0.2, 0.4, 0);
            group.add(legL);
            legR = legL.clone();
            legR.position.x = 0.2;
            group.add(legR);
            
            // Sheet Body
            const sheetMat = new THREE.MeshStandardMaterial({ color: 0xffffff, side: THREE.DoubleSide, roughness: 0.9 });
            const body = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.7, 1.4, 16, 1, true), sheetMat);
            body.position.y = 1.1;
            group.add(body);
            
            // Head (rounded top)
            const head = new THREE.Mesh(new THREE.SphereGeometry(0.5, 16, 16, 0, Math.PI * 2, 0, Math.PI * 0.5), sheetMat);
            head.position.y = 1.8;
            group.add(head);
            
            // Sunglasses
            const glassMat = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.1 });
            const glasses = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.15, 0.1), glassMat);
            glasses.position.set(0, 1.85, 0.45);
            group.add(glasses);
            
            // No arms animation, just a sheet
            this.playerLimbs = { legL, legR, armL: null, armR: null };

        } else {
            verticalVisualOffset = 0.25;
            // Default MMOOVT knight with fixed arm placement
            const torso = new THREE.Mesh(
                new THREE.BoxGeometry(0.85, 1.25, 0.55),
                new THREE.MeshStandardMaterial({ color: 0x3d3d3d, flatShading: true, metalness: 0.3, roughness: 0.6 })
            );
            torso.position.y = 0.9;
            torso.castShadow = true;
            group.add(torso);
            
            const head = new THREE.Mesh(
                new THREE.BoxGeometry(0.6, 0.6, 0.6),
                new THREE.MeshStandardMaterial({ color: 0x707070, flatShading: true, metalness: 0.4, roughness: 0.5 })
            );
            head.position.y = 1.6;
            head.castShadow = true;
            group.add(head);
            
            // Visor
            const visor = new THREE.Mesh(
                new THREE.BoxGeometry(0.65, 0.22, 0.22),
                new THREE.MeshStandardMaterial({ color: 0x00ffff, emissive: 0x00ffff, emissiveIntensity: 1.2 })
            );
            visor.position.set(0, 1.6, 0.32);
            group.add(visor);
            
            // Glowing eye slits
            const eyeStrip = new THREE.Mesh(
                new THREE.BoxGeometry(0.4, 0.08, 0.04),
                new THREE.MeshBasicMaterial({ color: 0x00ffff })
            );
            eyeStrip.position.set(0, 1.62, 0.35);
            group.add(eyeStrip);
            
            // Shoulders
            const shoulderL = new THREE.Mesh(
                new THREE.BoxGeometry(0.45, 0.4, 0.45),
                new THREE.MeshStandardMaterial({ color: 0x6f6f6f, flatShading: true, metalness: 0.3 })
            );
            shoulderL.position.set(-0.6, 1.25, 0);
            shoulderL.castShadow = true;
            group.add(shoulderL);
            
            const shoulderR = shoulderL.clone();
            shoulderR.position.x = 0.6;
            group.add(shoulderR);
            
            // Arms anchored to shoulders
            armL = new THREE.Mesh(
                new THREE.BoxGeometry(0.3, 0.9, 0.3),
                new THREE.MeshStandardMaterial({ color: 0x444444, flatShading: true })
            );
            armL.position.set(-0.6, 0.75, 0);
            armL.castShadow = true;
            group.add(armL);
            
            armR = armL.clone();
            armR.position.x = 0.6;
            group.add(armR);
            
            // Legs
            legL = new THREE.Mesh(
                new THREE.BoxGeometry(0.35, 0.85, 0.35),
                new THREE.MeshStandardMaterial({ color: 0x2b2b2b, flatShading: true })
            );
            legL.position.set(-0.25, 0.0, 0);
            legL.castShadow = true;
            group.add(legL);
            
            legR = legL.clone();
            legR.position.x = 0.25;
            group.add(legR);

            this.playerLimbs = { armL, armR, legL, legR };

            // Knight sword mesh
            const swordGroup = new THREE.Group();
            const blade = new THREE.Mesh(
                new THREE.BoxGeometry(0.2, 0.1, 1.8),
                new THREE.MeshStandardMaterial({ color: 0xd1d5db, metalness: 0.8, flatShading: true })
            );
            blade.position.z = 0.9;
            swordGroup.add(blade);

            const hilt = new THREE.Mesh(
                new THREE.BoxGeometry(0.25, 0.25, 0.4),
                new THREE.MeshStandardMaterial({ color: 0x111111, flatShading: true })
            );
            hilt.position.z = -0.1;
            swordGroup.add(hilt);

            swordGroup.position.set(0.0, -0.2, 0.4);
            swordGroup.rotation.x = -0.2;
            armR.add(swordGroup);
            this.playerSword = swordGroup;
        }

        group.scale.set(0.8, 0.8, 0.8);
        group.userData.limbs = this.playerLimbs;

        // Physics "capsule" used only as a kinematic state container now
        const shape = new CANNON.Sphere(this.playerRadius);
        // Use predefined spawnPoint if the world provided one (e.g. AWAKENING maze),
        // otherwise fall back to terrain height at origin.
        const initialSpawn = (this.spawnPoint && this.spawnPoint instanceof THREE.Vector3) ?
            this.spawnPoint.clone() :
            new THREE.Vector3(0, safeGetTerrain(0, 0) + this.playerRadius + 0.05, 0);

        this.playerBody = new CANNON.Body({
            mass: 5,
            fixedRotation: true,
            position: new CANNON.Vec3(
                initialSpawn.x,
                initialSpawn.y,
                initialSpawn.z
            ),
            linearDamping: 0.02,
            angularDamping: 0.99,
            allowSleep: false
        });
        this.playerBody.addShape(shape);
        // Double-jump state: true when available (reset on ground), consumed on mid-air double jump
        this.doubleJumpAvailable = true;
        // NOTE: Do NOT add playerBody to the physics world – we move and ground it manually.

        // Remember a safe spawn point so we can teleport the player back if they fall into the void
        // Only set a default spawn if one hasn't already been provided by the world (e.g. AWAKENING maze).
        if (!this.spawnPoint || !(this.spawnPoint instanceof THREE.Vector3)) {
            this.spawnPoint = new THREE.Vector3(
                0,
                safeGetTerrain(0, 0) + this.playerRadius + 0.05,
                0
            );
        }

        // Place visual model so feet sit on the ground
        const startTerrain = safeGetTerrain(0, 0);
        
        group.position.set(
            this.playerBody.position.x,
            startTerrain + verticalVisualOffset,
            this.playerBody.position.z
        );
        group.userData.verticalOffset = verticalVisualOffset;
        
        this.scene.add(group);
        this.playerMesh = group;

        // Mouse attack for knight / Calcium bone throw
        window.addEventListener('mousedown', (e) => {
            if (e.button !== 0) return;
            if (!this.isPlaying || this.isPaused) return;

            // Grave Interaction (Awakening Mode)
            if (this.gameMode === 'AWAKENING') {
                const p = this.playerBody.position;
                for (let g of this.graves) {
                    if (!g.used) {
                        const dist = Math.hypot(g.x - p.x, g.z - p.z);
                        if (dist < 4.0) {
                            g.used = true;
                            // Awaken Bob
                            const isDeadly = this.gameTime > 1200; // 20 mins
                            const type = isDeadly ? 'DEADLY_BOB' : 'BOB';
                            this.spawnBob(g.x, g.z, type);
                            return;
                        }
                    }
                }
            }

            // If player clicked near the Monke crate, check requirements
            try {
                if (this.monkeCrate && !this.monkeCrate.interacted) {
                    const worldPos = new THREE.Vector3(this.playerBody.position.x, this.playerBody.position.y, this.playerBody.position.z);
                    const d = worldPos.distanceTo(this.monkeCrate.pos);
                    if (d < 3.5) {
                        // REQUIREMENT CHECK: Bananerang Level 3
                        const bananaLvl = this.weaponLevels['BANANERANG'] || 0;
                        if (bananaLvl < 3) {
                            this.showToast("Locked: Requires Bananerang Lvl 3!");
                            this.playSound('bonk', 0.5, 0.5);
                            return;
                        }

                        // mark interacted and immediately trigger unlock sequence
                        this.monkeCrate.interacted = true;
                        // visually open the door: rotate door outward if present
                        if (this.monkeCrate.doorMesh) {
                            const door = this.monkeCrate.doorMesh;
                            // animate simple rotation (instant for reliability)
                            door.rotation.y = Math.PI * 0.9;
                            door.position.z += 0.2;
                        }
                        // reveal monke visual immediately
                        if (this.monkeCrate.monkeVisual) {
                            this.monkeCrate.monkeVisual.visible = true;
                        }
                        // Trigger unlock animation/sequence
                        this.triggerMonkeUnlock();
                        return; // do not also perform an attack on the same click
                    }
                }
            } catch(e){}

            // Ensure we grab pointer lock on first click, but still allow this click to attack
            if (this.renderer && document.pointerLockElement !== this.renderer.domElement) {
                const p = this.renderer.domElement.requestPointerLock();
                if (p instanceof Promise) p.catch(() => {});
            }

            // Check for manual slash ability (Any char with sword)
            const hasSword = (this.weaponLevels['KNIGHT_SWORD'] || 0) > 0 || (this.weaponLevels['GIGA_SWORD'] || 0) > 0;

            if (this.characterKey === 'MMOOVT' || this.characterKey === 'SIR_CHAD' || hasSword) {
                this.knightSlash();
            }
            
            if (this.characterKey === 'CALCIUM') {
                this.throwBone();
            } else if (this.characterKey === 'BOBERTO' && !hasSword) {
                // Manual ghost spawn check? Or just passive.
                this.particleSystem.emit(this.playerMesh.position.clone().add(new THREE.Vector3(0,1,0)), 0xffffff, 5);
            }
            
            // Pantheon Placement
            if (this.gameMode === 'PANTHEON' && this.activeTool) {
                this.pantheonSpawn();
            }
        });
    }
    
    pantheonSpawn() {
        if (!this.activeTool) return;
        
        // Raycast from camera center to ground
        const raycaster = new THREE.Raycaster();
        raycaster.setFromCamera({x:0, y:0}, this.camera);
        
        // Simple plane intersection for placement (y=0 plane approximation or terrain check)
        // Since we don't have easy mesh access to all terrain for raycasting in this architecture,
        // let's project forward a fixed distance or until y=terrainHeight.
        
        // Project 15 units forward, find ground Y there
        const dir = new THREE.Vector3();
        this.camera.getWorldDirection(dir);
        const dist = 10;
        const targetPos = this.camera.position.clone().add(dir.multiplyScalar(dist));
        
        // Snap to ground
        const h = this.getTerrainHeight(targetPos.x, targetPos.z);
        // If aiming at sky, use dist. If aiming at ground, use intersection?
        // Simple logic: Place at (x, z) on terrain height.
        
        const x = targetPos.x;
        const z = targetPos.z;
        const y = h;
        
        const t = this.activeTool;
        const data = { type: t.type, id: t.id, x, y, z, rotation: this.playerMesh.rotation.y };
        
        this.spawnFromData(data);
        this.placedObjects.push(data);
        this.showToast(`Placed ${t.name}`);
        this.playSound('bonk', 1.5, 0.5);
    }
    
    spawnFromData(d) {
        // Handle spawning based on type
        if (d.type === 'enemy') {
            this.createEnemy({ overrideX: d.x, overrideZ: d.z, overrideType: d.id });
        } else if (d.type === 'ghost') {
            // Need custom spawn for ghost at location
            // Hack: override createGhost to accept pos? No, just push to enemies manually
            // Reuse createEnemy logic? Ghosts in createEnemy? No.
            // createGhost spawns around player. Let's just spawn a new enemy entry manually.
            // Simplified: treat as enemy but call createGhost logic? 
            // Just spawn a standard enemy of that type ID to keep it simple, 
            // but Ghosts have special physics.
            // Let's create a temp enemy spawn for now.
            // actually createGhost(type) uses player pos.
            // I'll make createGhost accept pos.
            this.createGhostAt(d.id, d.x, d.z);
        } else if (d.type === 'boss') {
            // Hack createBoss
            // We need to move the portal? Or just spawn the boss mesh.
            // createBoss uses bossPortal pos.
            // Let's create a standalone boss entity.
            this.spawnBossAt(d.id, d.x, d.z);
        } else if (d.type === 'miniboss') {
            // spawnMiniboss uses random near player.
            this.spawnMinibossAt(d.id, d.x, d.z);
        } else if (d.type === 'bob') {
            this.spawnBob(d.x, d.z, d.id);
        } else if (d.type === 'prop') {
            // Reuse scatterProps logic for single item?
            this.spawnProp(d.id, d.x, d.z, d.y, d.rotation);
        } else if (d.type === 'chest') {
            this.spawnChest(new THREE.Vector3(d.x, d.y, d.z), 0);
        } else if (d.type === 'shrine') {
            this.createShrineAt(d.x, d.z);
        } else if (d.type === 'wall') {
            // Maze Wall (Awakening Block)
            const cellSize = 20; const wallHeight = 12;
            const wTex = this.rockTex ? this.rockTex.clone() : null;
            if(wTex) wTex.repeat.set(2,1);
            const mesh = new THREE.Mesh(
                new THREE.BoxGeometry(cellSize, wallHeight, cellSize),
                new THREE.MeshStandardMaterial({ map: wTex, color: 0x888888, roughness: 0.8 })
            );
            mesh.position.set(d.x, d.y + wallHeight/2, d.z);
            this.scene.add(mesh);
            const body = new CANNON.Body({ mass: 0 });
            body.addShape(new CANNON.Box(new CANNON.Vec3(cellSize/2, wallHeight/2, cellSize/2)));
            body.position.set(d.x, d.y + wallHeight/2, d.z);
            this.world.addBody(body);
            this.terrainPieces.push({ x: d.x, z: d.z, width: cellSize, depth: cellSize, height: wallHeight, isWall: true, group: mesh });
        } else if (d.type === 'platform') {
            let w=20, dep=20, h=5;
            if(d.id==='small') { w=10; dep=10; h=3; }
            if(d.id==='medium') { w=20; dep=20; h=8; }
            if(d.id==='large') { w=40; dep=40; h=12; }
            // Ensure texture support
            this.createTerrainPiece(d.x, d.z, w, h);
        } else if (d.type === 'ramp') {
            let hEnd = d.y + 5;
            if(d.id==='long') hEnd = d.y + 10;
            if(d.id==='steep') hEnd = d.y + 15;
            // createRamp(x, z, size, hStart, hEnd, rot)
            this.createRamp(d.x, d.z, 20, d.y, hEnd, d.rotation);
        } else if (d.type === 'portal') {
            this.createBossPortal(d.x, d.z);
        }
    }
    
    spawnProp(id, x, z, y, rot) {
        // Simplified prop spawn
        const group = new THREE.Group();
        let mesh;
        if(id === 'tree') {
            mesh = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.8, 6, 6), new THREE.MeshStandardMaterial({color:0x4a3020}));
            mesh.position.y = 3;
            const leaves = new THREE.Mesh(new THREE.DodecahedronGeometry(2), new THREE.MeshStandardMaterial({color:0x1e7d1e}));
            leaves.position.y = 6;
            group.add(leaves);
        } else if (id === 'rock') {
            mesh = new THREE.Mesh(new THREE.DodecahedronGeometry(1.5), new THREE.MeshStandardMaterial({color:0x777777}));
            mesh.position.y = 1;
        } else if (id === 'pillar') {
            mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 6, 1), new THREE.MeshStandardMaterial({color:0x888888}));
            mesh.position.y = 3;
        } else if (id === 'ruins') {
            mesh = new THREE.Mesh(new THREE.BoxGeometry(3, 1, 1), new THREE.MeshStandardMaterial({color:0x666666}));
            mesh.position.y = 0.5;
        }
        
        if (mesh) group.add(mesh);
        group.position.set(x, y, z);
        group.rotation.y = rot;
        this.scene.add(group);
        // Add to obstacles for physics
        this.obstacles.push({ type:'box', x, z, halfExtents:{x:1, z:1} }); // approx
    }
    
    createGhostAt(type, x, z) {
        // Hacky override of createGhost logic
        const pPos = this.playerBody.position.clone();
        this.playerBody.position.set(x - 10, 0, z); // fake player pos so createGhost spawns near target
        this.createGhost(type); // will spawn around 'player'
        // fix pos
        const ghost = this.enemies[this.enemies.length-1];
        if(ghost) {
            const y = this.getTerrainHeight(x, z) + 3;
            ghost.body.position.set(x, y, z);
            ghost.mesh.position.set(x, y, z);
        }
        this.playerBody.position.copy(pPos); // restore
    }
    
    spawnBossAt(type, x, z) {
        // Create boss then move it
        // TNS bosses rely on tier/mode.
        // We need to temporarily force mode/tier or just implement manual boss visuals.
        // This is complex. For now, just spawn standard Gatekeeper.
        this.createBoss(true);
        const b = this.bossEnemy; // newly created
        if(b) {
            const y = this.getTerrainHeight(x, z);
            b.body.position.set(x, y+2, z);
            b.mesh.position.set(x, y, z);
        }
    }
    
    spawnMinibossAt(type, x, z) {
        this.spawnMiniboss(type);
        const b = this.enemies[this.enemies.length-1]; // assuming it's the last added
        if(b && b.type === 'miniboss') {
            const y = this.getTerrainHeight(x, z);
            b.body.position.set(x, y+2, z);
            b.mesh.position.set(x, y, z);
        }
    }
    
    exportWorld() {
        const data = {
            version: 1,
            objects: this.placedObjects
        };
        const str = JSON.stringify(data);
        const b64 = btoa(str);
        const ta = document.getElementById('pan-export-area');
        if(ta) {
            ta.value = b64;
            ta.select();
            document.execCommand('copy');
            this.showToast("World Data Copied to Clipboard!");
        }
    }
    
    loadCustomWorld(b64) {
        try {
            const str = atob(b64);
            const data = JSON.parse(str);
            
            this.createFlatWorld(); // Base
            
            // Replay spawning
            if (data.objects) {
                data.objects.forEach(obj => {
                    this.spawnFromData(obj);
                    // Keep tracking if in pantheon mode to re-export
                    if(this.gameMode === 'PANTHEON') {
                        this.placedObjects.push(obj);
                    }
                });
            }
            this.showToast("Custom World Loaded!");
        } catch(e) {
            console.error(e);
            this.showToast("Error Loading World Data");
            this.createFlatWorld();
        }
    }

    runTutorial() {
        // Simple overlay sequence
        const overlay = document.getElementById('tutorial-overlay');
        if (!overlay) return;

        // Duck and slow music for tutorial (only save once)
        try {
            if (!this._savedBgmState) {
                this._savedBgmState = {
                    gain: this.currentBgmGain ? (this.currentBgmGain.gain.value || 0.35) : 0.35,
                    rate: this.currentBgmNode ? (this.currentBgmNode.playbackRate.value || 1.0) : 1.0
                };
                if (this.currentBgmGain && this.currentBgmGain.gain) {
                    // Lower to ~30% of previous (reduce by 70%)
                    this.currentBgmGain.gain.setTargetAtTime(this._savedBgmState.gain * 0.3, this.audioCtx.currentTime, 0.05);
                }
                if (this.currentBgmNode && this.currentBgmNode.playbackRate) {
                    // Slow music to 0.5x
                    try { this.currentBgmNode.playbackRate.setValueAtTime(this._savedBgmState.rate * 0.5, this.audioCtx.currentTime); } catch(e){}
                }
            }
        } catch (e) {}

        overlay.style.display = 'block';
        
        // Define steps
        const steps = [
            { el: '#objectives-box', title: 'OBJECTIVES', text: 'Follow these to progress.' },
            { el: '#stats-left', title: 'STATS', text: 'Keep an eye on your Health and XP.' },
            { el: '#loadout-box', title: 'GEAR', text: 'Your weapons and buffs appear here.' },
            { el: '#minimap-container', title: 'MAP', text: 'Shows enemies (red) and loot (gold).' }
        ];
        
        let stepIdx = 0;
        
        const showStep = () => {
            if (stepIdx >= steps.length) {
                overlay.style.display = 'none';
                overlay.innerHTML = '';
                this.isPaused = false;

                // Restore BGM state (fade back to original)
                try {
                    if (this._savedBgmState && this.currentBgmGain && this.currentBgmGain.gain) {
                        this.currentBgmGain.gain.setTargetAtTime(this._savedBgmState.gain, this.audioCtx.currentTime, 0.3);
                    }
                    if (this._savedBgmState && this.currentBgmNode && this.currentBgmNode.playbackRate) {
                        try { this.currentBgmNode.playbackRate.setValueAtTime(this._savedBgmState.rate, this.audioCtx.currentTime + 0.15); } catch(e){}
                    }
                    this._savedBgmState = null;
                } catch (e) {}

                return;
            }
            
            this.isPaused = true;
            overlay.innerHTML = '';
            
            const step = steps[stepIdx];
            const target = document.querySelector(step.el);
            if (!target) {
                stepIdx++;
                showStep();
                return;
            }
            
            const rect = target.getBoundingClientRect();
            
            // Highlight box
            const hl = document.createElement('div');
            hl.className = 'tutorial-highlight';
            hl.style.left = (rect.left - 5) + 'px';
            hl.style.top = (rect.top - 5) + 'px';
            hl.style.width = (rect.width + 10) + 'px';
            hl.style.height = (rect.height + 10) + 'px';
            overlay.appendChild(hl);
            
            // Text box
            const box = document.createElement('div');
            box.className = 'tutorial-box';
            
            // Position near the highlight intelligently
            let top = rect.bottom + 15;
            if (top + 100 > window.innerHeight) {
                top = rect.top - 120;
            }
            
            box.style.left = Math.max(10, Math.min(window.innerWidth - 260, rect.left)) + 'px';
            box.style.top = top + 'px';
            
            box.innerHTML = `
                <h4>${step.title}</h4>
                <p>${step.text}</p>
                <button id="tut-next">NEXT ></button>
            `;
            
            overlay.appendChild(box);
            
            const btn = document.getElementById('tut-next');
            btn.onclick = (e) => {
                e.stopPropagation(); // Prevent click from triggering pointer lock
                stepIdx++;
                showStep();
            };
        };
        
        showStep();
    }

    startIntro() {
        const bars = document.getElementById('cinematic-bars');
        if (bars) bars.classList.add('active');

        // Safe accessor: createWorld defines getTerrainHeight later — guard against it being undefined during init
        const safeGetTerrain = (x, z) => {
            return (typeof this.getTerrainHeight === 'function') ? this.getTerrainHeight(x, z) : 0;
        };

        // Tutorial logic moved to after Lore Note dismissal for new players.
        // For returning players (lore read), run tutorial if somehow missed?
        if (this.tier === 1 && !this.tutorialRun) {
            const hasReadLore = localStorage.getItem('uberthump_lore_read');
            const hasTut = localStorage.getItem('uberthump_tut_done');
            
            if (hasReadLore && !hasTut) {
                 setTimeout(() => this.runTutorial(), 500);
                 localStorage.setItem('uberthump_tut_done', 'true');
                 this.tutorialRun = true;
            }
        }

        // Player starts inside the portal at the arena center and walks out of it
        // For Awakening mode, start inside the maze spawnPoint if available so the intro doesn't place you outside the map.
        const startX = (this.gameMode === 'AWAKENING' && this.spawnPoint) ? this.spawnPoint.x : 0;
        const startZ = (this.gameMode === 'AWAKENING' && this.spawnPoint) ? this.spawnPoint.z : 0;

        // Instead of a hardcoded off-map end position, choose an end point that stays inside the generated maze/arena.
        // If we're in AWAKENING and have a spawnPoint, move a short distance forward from spawn into the maze so the intro walks inward.
        let endX, endZ;
        if (this.gameMode === 'AWAKENING' && this.spawnPoint) {
            // Prefer stepping forward along the +X axis of the spawn so the intro moves into the maze.
            // If the spawnPoint is near an edge, bias inward by checking terrain neighbors (fallback to small offset).
            endX = this.spawnPoint.x + 6;
            endZ = this.spawnPoint.z;
        } else {
            endX = -8;
            endZ = 0;
        }

        // Use safe accessor instead of direct this.getTerrainHeight calls
        const startTerrain = safeGetTerrain(startX, startZ);
        const endTerrain = safeGetTerrain(endX, endZ);
        const portalY = endTerrain + 1.5;

        // Start inside the portal ring height, then step down onto the ground
        const startY = portalY;
        const endY = endTerrain + this.playerRadius + 0.1;

        // Ensure playerBody exists before setting positions
        if (this.playerBody) {
            this.playerBody.position.set(startX, startY, startZ);
            this.playerBody.velocity.set(0, 0, 0);
        }

        if (this.playerMesh) {
            this.playerMesh.position.set(
                startX,
                startY - this.playerRadius + 1.1,
                startZ
            );
        }

        this.introStartPos.set(startX, startY, startZ);
        this.introEndPos.set(endX, endY, endZ);

        // Face out of the portal, along the intro movement direction
        this.cameraRotation = Math.atan2(
            this.introEndPos.x - this.introStartPos.x,
            this.introEndPos.z - this.introStartPos.z
        );
        this.cameraPitch = 0.6;

        // Rotate player to walk straight toward camera
        if (this.playerMesh) {
            this.playerMesh.rotation.y = this.cameraRotation;
        }

        // Build portal visuals at the end position
        if (this.portalGroup) {
            try { this.scene.remove(this.portalGroup); } catch(e) {}
        }

        // Use unified portal model
        const portalGroup = this.createVoidPortalModel();
        portalGroup.position.set(0, portalY, 0);
        
        // Intro specific scaling
        portalGroup.scale.setScalar(0.8);
        
        // Rotate to face camera
        portalGroup.rotation.y = this.cameraRotation;

        this.scene.add(portalGroup);
        this.portalGroup = portalGroup;

        this.inIntro = true;
        this.introTime = 0;
    }

    createVoidPortalModel(isActive = true) {
        const group = new THREE.Group();
        
        // 1. Black Void Sphere (Inner)
        // Scaled down slightly to fit inside arch
        const voidGeo = new THREE.SphereGeometry(2.0, 32, 32);
        const voidMat = new THREE.MeshBasicMaterial({ color: 0x000000 });
        const voidSphere = new THREE.Mesh(voidGeo, voidMat);
        // Elongate vertically for portal shape
        voidSphere.scale.set(1, 1.4, 1);
        group.add(voidSphere);
        
        // 2. Spinning Energy Blades (The "Activated" Look)
        const spinner = new THREE.Group();
        const bladeColor = 0x00ffff; // Always cyan when active
        const bladeGeo = new THREE.TorusGeometry(2.5, 0.1, 8, 32, Math.PI); 
        const bladeMat = new THREE.MeshBasicMaterial({ color: bladeColor, transparent: true, opacity: 0.8, toneMapped: false });
        const blade = new THREE.Mesh(bladeGeo, bladeMat);
        spinner.add(blade);
        const blade2 = blade.clone();
        blade2.rotation.z = Math.PI;
        spinner.add(blade2);
        
        spinner.userData = { isSpinner: true };
        // Hide if not active
        if (!isActive) spinner.visible = false;
        group.add(spinner);
        
        // 3. Inner Particle System (The Intro Portal Look)
        const pGroup = new THREE.Group();
        const pGeo = new THREE.BoxGeometry(0.15, 0.15, 0.15);
        const pMat = new THREE.MeshBasicMaterial({ color: 0xaaddff, toneMapped: false });
        
        for(let i=0; i<30; i++) {
            const p = new THREE.Mesh(pGeo, pMat);
            const r = 2.2 + Math.random();
            const theta = Math.random() * Math.PI * 2;
            const phi = Math.random() * Math.PI;
            p.position.setFromSphericalCoords(r, phi, theta);
            p.userData = { 
                basePos: p.position.clone(), 
                phase: Math.random() * 10, 
                speed: 0.5 + Math.random() 
            };
            pGroup.add(p);
        }
        pGroup.userData = { isParticleSystem: true };
        if (!isActive) pGroup.visible = false;
        group.add(pGroup);

        // 4. Distant Beacons (Giant spinning particles around the whole structure)
        const beaconGroup = new THREE.Group();
        const bGeo = new THREE.SphereGeometry(0.5);
        const bMat = new THREE.MeshBasicMaterial({ color: 0x00ff88, toneMapped: false });
        for(let i=0; i<6; i++) {
            const b = new THREE.Mesh(bGeo, bMat);
            b.position.set(10, 0, 0); // radius 10
            const orbit = new THREE.Group();
            orbit.rotation.y = (i / 6) * Math.PI * 2;
            orbit.rotation.z = Math.random() * 0.5; // Slight tilt
            orbit.add(b);
            orbit.userData = { isOrbiter: true, speed: 1.0 + Math.random() };
            beaconGroup.add(orbit);
        }
        beaconGroup.userData = { isBeacon: true };
        if (!isActive) beaconGroup.visible = false;
        group.add(beaconGroup);
        
        return group;
    }

    createBossPortal(overrideX, overrideZ) {
        let choice = null;

        if (overrideX !== undefined && overrideZ !== undefined) {
            choice = { x: overrideX, z: overrideZ, y: this.getTerrainHeight(overrideX, overrideZ) };
        } else {
            // Find a suitable distant spot for the portal
            let bestDist = 0;
            for (let p of this.terrainPieces) {
                 if (p.isWall) continue;
                 const dist = Math.sqrt(p.x*p.x + p.z*p.z);
                 if (dist > 50 && dist < 180 && p.width > 10 && p.depth > 10 && (p.height || 0) < 20) {
                     if (dist > bestDist) {
                        bestDist = dist;
                        choice = { x: p.x, z: p.z, y: p.height };
                     }
                 }
            }
            if (!choice) {
                 choice = { x: 0, z: 80, y: 0 }; 
                 this.createTerrainPiece(0, 80, 20, 0);
            }
        }
        
        const terrainY = choice.y;
        const group = new THREE.Group();

        // 1. Stone Platform Base (Steps)
        const stoneMat = new THREE.MeshStandardMaterial({ color: 0x333333, roughness: 0.9, flatShading: true });
        const base1 = new THREE.Mesh(new THREE.CylinderGeometry(7, 8, 0.6, 8), stoneMat);
        base1.position.y = terrainY + 0.3;
        group.add(base1);
        const base2 = new THREE.Mesh(new THREE.CylinderGeometry(5, 6, 0.6, 8), stoneMat);
        base2.position.y = terrainY + 0.8;
        group.add(base2);

        // 2. Archway (Rugged Rocks)
        const rockMat = new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 1.0, flatShading: true });
        
        // Function to build a rugged pillar
        const buildPillar = (offsetX) => {
            const pillar = new THREE.Group();
            for(let i=0; i<5; i++) {
                const w = 1.8 - i * 0.15;
                const block = new THREE.Mesh(new THREE.BoxGeometry(w, 1.2, w), rockMat);
                block.position.y = i * 1.1;
                // Add "runes" or details?
                block.rotation.y = (Math.random() - 0.5) * 0.2;
                block.rotation.z = (Math.random() - 0.5) * 0.1;
                pillar.add(block);
            }
            pillar.position.set(offsetX, terrainY + 1.2, 0);
            // Angle inwards slightly
            pillar.rotation.z = offsetX > 0 ? 0.1 : -0.1;
            group.add(pillar);
            return pillar;
        };

        const leftPillar = buildPillar(-3.5);
        const rightPillar = buildPillar(3.5);

        // Top Arch (Curved blocks)
        const archGroup = new THREE.Group();
        archGroup.position.y = terrainY + 6.5;
        for(let i=0; i<5; i++) {
            const angle = Math.PI + (i/4) * Math.PI; // Semicircle top
            // Place blocks along arch
            const bx = Math.cos(angle) * 3.5;
            const by = Math.sin(angle) * 2.0; // Squashed vertically
            const block = new THREE.Mesh(new THREE.BoxGeometry(1.6, 1.2, 1.8), rockMat);
            block.position.set(bx, by, 0);
            block.rotation.z = angle - Math.PI/2;
            archGroup.add(block);
        }
        group.add(archGroup);

        // Keystone Skull
        const skullGroup = new THREE.Group();
        const boneMat = new THREE.MeshStandardMaterial({ color: 0xcccccc, roughness: 0.6 });
        const cranium = new THREE.Mesh(new THREE.BoxGeometry(1.2, 1.0, 1.0), boneMat);
        skullGroup.add(cranium);
        const jaw = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.6, 0.8), boneMat);
        jaw.position.y = -0.7;
        skullGroup.add(jaw);
        // Eyes
        const eyeMat = new THREE.MeshBasicMaterial({ color: 0x000000 });
        const eyeL = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.3, 0.1), eyeMat);
        eyeL.position.set(-0.3, 0, 0.51);
        skullGroup.add(eyeL);
        const eyeR = eyeL.clone();
        eyeR.position.x = 0.3;
        skullGroup.add(eyeR);

        skullGroup.position.set(0, terrainY + 8.5, 0);
        group.add(skullGroup);

        // 3. Void Portal Visuals (The "Active" part)
        // Hidden by default
        const portalModel = this.createVoidPortalModel(false);
        // Position in center of arch
        portalModel.position.set(0, terrainY + 4.5, 0);
        portalModel.visible = false;
        group.add(portalModel);

        group.position.set(choice.x, 0, choice.z);
        // Rotate to face center roughly
        group.lookAt(0, 0, 0);
        
        this.scene.add(group);

        this.bossPortal = {
            mesh: group,
            visuals: portalModel, // for animation reference
            position: new THREE.Vector3(choice.x, terrainY, choice.z),
            active: false
        };
        
        // No boom sound on creation (silent structure until activation)
    }

    createBoss(isMain = true, hpOverride = null) {
        // Before creating the main boss, ensure any existing miniboss is fully removed
        // to avoid softlocks (player trapped with a lingering miniboss preventing tier progress).
        if (this.bossEnemy && !this.bossEnemy.isMainBoss) {
            try {
                this.safeRemoveBoss(this.bossEnemy, /*quiet=*/true);
            } catch (e) {
                console.warn('safeRemoveBoss failed during createBoss pre-clean:', e);
                // Best-effort fallback: brute-force clear possible remnants
                try {
                    if (this.bossEnemy && this.bossEnemy.body) this.world.removeBody(this.bossEnemy.body);
                } catch (e2) {}
                try { if (this.bossEnemy && this.bossEnemy.mesh) this.scene.remove(this.bossEnemy.mesh); } catch(e3){}
                try { this.removeBossBar(this.bossEnemy.id); } catch(e4){}
                this.enemies = (this.enemies || []).filter(e => e && e.id !== (this.bossEnemy && this.bossEnemy.id));
                this.bossEnemy = null;
            }
        }

        // Remove any leftover boss bars to avoid duplicates before creating
        const container = document.getElementById('boss-bars-container');
        if (container) {
            // clear existing boss bars (they will be recreated for the new boss)
            container.innerHTML = '';
        }

        // allow create even if a boss was present but removed above

        const x = this.bossPortal ? this.bossPortal.position.x : 40;
        const z = this.bossPortal ? this.bossPortal.position.z : 40;
        const terrainY = this.getTerrainHeight(x, z);

        const group = new THREE.Group();
        let bossRing = null;
        let armL, armR, legL, legR;
        let bossName = 'The Gatekeeper';

        // Custom visuals for TNS bosses
        if (this.gameMode === 'TNS' && isMain) {
            // Apply TNS names here to ensure object is consistent with visual
            if (this.tnsTier === 1) bossName = 'Babybark';
            else if (this.tnsTier === 2) bossName = 'Smolbark';
            else if (this.tnsTier === 3) bossName = 'Chadbark';
            else if (this.tnsTier === 4) bossName = 'Barkvader';

            const barkMat = new THREE.MeshStandardMaterial({ color: 0x5D4037, roughness: 0.9 });
            const darkBarkMat = new THREE.MeshStandardMaterial({ color: 0x3E2723, roughness: 1.0 });
            const leafMat = new THREE.MeshStandardMaterial({ color: 0x33691E, flatShading: true });
            const glowingRed = new THREE.MeshBasicMaterial({ color: 0xff0000 });
            const glowingGreen = new THREE.MeshBasicMaterial({ color: 0x00ff00 });

            if (this.tnsTier === 1) { 
                // Babybark: Cute stump
                const stump = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 1.0, 1.5, 12), barkMat);
                stump.position.y = 0.75;
                group.add(stump);
                
                // Big eyes
                const eyeL = new THREE.Mesh(new THREE.SphereGeometry(0.15), glowingGreen);
                eyeL.position.set(-0.3, 1.0, 0.8);
                group.add(eyeL);
                const eyeR = eyeL.clone();
                eyeR.position.x = 0.3;
                group.add(eyeR);
                
                // Tiny leaf on head
                const leaf = new THREE.Mesh(new THREE.ConeGeometry(0.3, 0.6, 4), leafMat);
                leaf.position.set(0, 1.5, 0);
                leaf.rotation.z = 0.3;
                group.add(leaf);
                
                // Stick arms
                armL = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.6, 0.1), darkBarkMat);
                armL.position.set(-0.9, 0.8, 0);
                armL.rotation.z = 0.5;
                group.add(armL);
                armR = armL.clone();
                armR.position.set(0.9, 0.8, 0);
                armR.rotation.z = -0.5;
                group.add(armR);

            } else if (this.tnsTier === 2) {
                // Smolbark: Taller, angrier
                const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 1.1, 2.5, 10), barkMat);
                trunk.position.y = 1.25;
                group.add(trunk);
                
                // Angry eyebrows
                const browL = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.1, 0.1), darkBarkMat);
                browL.position.set(-0.25, 1.9, 0.8);
                browL.rotation.z = 0.2;
                group.add(browL);
                const browR = browL.clone();
                browR.position.set(0.25, 1.9, 0.8);
                browR.rotation.z = -0.2;
                group.add(browR);
                
                const eyeL = new THREE.Mesh(new THREE.SphereGeometry(0.12), glowingRed);
                eyeL.position.set(-0.25, 1.8, 0.85);
                group.add(eyeL);
                const eyeR = eyeL.clone();
                eyeR.position.x = 0.25;
                group.add(eyeR);
                
                // Branch arms with leaves
                armL = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.2, 1.2), darkBarkMat);
                armL.position.set(-1.1, 1.5, 0);
                armL.rotation.z = 0.3;
                group.add(armL);
                const lLeaf = new THREE.Mesh(new THREE.DodecahedronGeometry(0.4), leafMat);
                lLeaf.position.y = 0.6;
                armL.add(lLeaf);
                
                armR = armL.clone();
                armR.position.set(1.1, 1.5, 0);
                armR.rotation.z = -0.3;
                group.add(armR);

            } else if (this.tnsTier === 3) {
                // Chadbark: Massive muscular tree
                const torso = new THREE.Mesh(new THREE.BoxGeometry(1.8, 1.6, 1.0), barkMat);
                torso.position.y = 2.0;
                group.add(torso);
                
                const abs = new THREE.Mesh(new THREE.BoxGeometry(1.4, 1.2, 0.8), darkBarkMat);
                abs.position.y = 0.8;
                group.add(abs);
                
                const head = new THREE.Mesh(new THREE.BoxGeometry(1.0, 1.0, 1.0), barkMat);
                head.position.y = 3.2;
                group.add(head);
                
                // Shades
                const shades = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.2, 0.2), new THREE.MeshBasicMaterial({color:0x000000}));
                shades.position.set(0, 3.2, 0.5);
                group.add(shades);
                
                // Massive arms
                armL = new THREE.Mesh(new THREE.BoxGeometry(0.6, 1.8, 0.6), barkMat);
                armL.position.set(-1.4, 2.2, 0);
                group.add(armL);
                armR = armL.clone();
                armR.position.x = 1.4;
                group.add(armR);
                
                // Roots as legs
                legL = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.3, 1.5), darkBarkMat);
                legL.position.set(-0.6, 0.75, 0);
                group.add(legL);
                legR = legL.clone();
                legR.position.x = 0.6;
                group.add(legR);

            } else {
                // Barkvader: Sci-fi Tree Lord
                const blackWood = new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.5 });
                const neonRed = new THREE.MeshBasicMaterial({ color: 0xff0000 });
                
                const cape = new THREE.Mesh(new THREE.BoxGeometry(1.6, 3.5, 0.2), new THREE.MeshStandardMaterial({color:0x000000}));
                cape.position.set(0, 2.0, -0.8);
                group.add(cape);
                
                const body = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 1.0, 2.5, 8), blackWood);
                body.position.y = 1.5;
                group.add(body);
                
                // Control panel
                const panel = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.4, 0.1), new THREE.MeshBasicMaterial({color:0x555555}));
                panel.position.set(0, 1.8, 0.9);
                group.add(panel);
                // Buttons
                const b1 = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 0.05), neonRed); b1.position.set(-0.15, 0, 0.05); panel.add(b1);
                const b2 = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 0.05), new THREE.MeshBasicMaterial({color:0x00ff00})); b2.position.set(0.15, 0, 0.05); panel.add(b2);
                
                // Helmet
                const helm = new THREE.Mesh(new THREE.SphereGeometry(0.8, 16, 16, 0, Math.PI*2, 0, Math.PI*0.55), blackWood);
                helm.position.y = 3.0;
                group.add(helm);
                
                // Mask
                const mask = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.5, 0.4), new THREE.MeshStandardMaterial({color:0x333333}));
                mask.position.set(0, 3.0, 0.6);
                group.add(mask);
                
                // Red Lightsaber / Staff
                const staff = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 4.5), neonRed);
                staff.position.set(1.4, 2.0, 0.5);
                staff.rotation.x = 0.2;
                group.add(staff);
                
                armL = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 1.8), blackWood);
                armL.position.set(-1.1, 2.0, 0);
                group.add(armL);
                armR = armL.clone();
                armR.position.x = 1.1;
                group.add(armR);
                
                legL = new THREE.Mesh(new THREE.BoxGeometry(0.4, 1.5, 0.5), blackWood);
                legL.position.set(-0.5, 0.75, 0);
                group.add(legL);
                legR = legL.clone();
                legR.position.x = 0.5;
                group.add(legR);
            }

        } else {
            // UPGRADED Gatekeeper visuals (Default)
            const darkMetal = new THREE.MeshStandardMaterial({ color: 0x110505, metalness: 0.8, roughness: 0.2 });
            const magmaSkin = new THREE.MeshStandardMaterial({ color: 0x550000, emissive: 0x330000, emissiveIntensity: 0.5 });
            const glowRed = new THREE.MeshBasicMaterial({ color: 0xff0000 });

            // Giant segmented body
            const torso = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 1.0, 3.0, 6), darkMetal);
            torso.position.y = 3.0;
            group.add(torso);
            
            // Glowing core
            const core = new THREE.Mesh(new THREE.OctahedronGeometry(0.8), new THREE.MeshBasicMaterial({ color: 0xff4400 }));
            core.position.set(0, 3.2, 0.8);
            group.add(core);

            const head = new THREE.Mesh(new THREE.BoxGeometry(1.2, 1.4, 1.2), darkMetal);
            head.position.y = 5.0;
            group.add(head);
            
            // Floating Crown
            const crownRing = new THREE.Mesh(new THREE.TorusGeometry(0.8, 0.1, 8, 16), glowRed);
            crownRing.position.set(0, 6.0, 0);
            crownRing.rotation.x = Math.PI/2;
            group.add(crownRing);

            // Eyes
            const eyeL = new THREE.Mesh(new THREE.SphereGeometry(0.2), glowRed);
            eyeL.position.set(-0.3, 5.2, 0.6);
            group.add(eyeL);
            const eyeR = eyeL.clone();
            eyeR.position.x = 0.3;
            group.add(eyeR);

            // Huge Arms
            armL = new THREE.Mesh(new THREE.BoxGeometry(0.8, 3.5, 0.8), magmaSkin);
            armL.position.set(-2.2, 3.5, 0);
            group.add(armL);
            armR = armL.clone();
            armR.position.x = 2.2;
            group.add(armR);
            
            // Pauldrons
            const pauldron = new THREE.Mesh(new THREE.SphereGeometry(1.2, 8, 8), darkMetal);
            pauldron.position.set(-2.2, 5.0, 0);
            group.add(pauldron);
            const pauldronR = pauldron.clone();
            pauldronR.position.x = 2.2;
            group.add(pauldronR);

            // Legs
            legL = new THREE.Mesh(new THREE.BoxGeometry(1.0, 3.0, 1.0), darkMetal);
            legL.position.set(-1.0, 1.5, 0);
            group.add(legL);
            legR = legL.clone();
            legR.position.x = 1.0;
            group.add(legR);
            
            // Giant Pitchfork (Trident) held in right hand
            const tridentGroup = new THREE.Group();
            const staff = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 8, 8), new THREE.MeshStandardMaterial({ color: 0x444444 }));
            tridentGroup.add(staff);
            const tipGeo = new THREE.ConeGeometry(0.2, 1.5, 8);
            const tipMat = new THREE.MeshStandardMaterial({ color: 0xff0000, emissive: 0xff0000 });
            const t1 = new THREE.Mesh(tipGeo, tipMat); t1.position.y = 4; tridentGroup.add(t1);
            const t2 = t1.clone(); t2.position.set(-0.8, 3.5, 0); t2.rotation.z = 0.2; tridentGroup.add(t2);
            const t3 = t1.clone(); t3.position.set(0.8, 3.5, 0); t3.rotation.z = -0.2; tridentGroup.add(t3);
            
            tridentGroup.position.set(2.2, 2.0, 1.5);
            tridentGroup.rotation.x = -0.4;
            group.add(tridentGroup);
        }

        // Visible boss arena ring on the ground (for everyone)
        const ringGeo = new THREE.RingGeometry(5.0, 5.8, 48);
        const ringMat = new THREE.MeshBasicMaterial({
            color: 0xff4444,
            transparent: true,
            opacity: 0.85,
            side: THREE.DoubleSide
        });
        bossRing = new THREE.Mesh(ringGeo, ringMat);
        bossRing.rotation.x = -Math.PI / 2;
        bossRing.position.y = terrainY + 0.02;
        group.add(bossRing);

        group.position.set(x, terrainY, z);
        this.scene.add(group);

        const shape = new CANNON.Sphere(1.8);
        const physicsBody = new CANNON.Body({
            mass: 5,
            position: new CANNON.Vec3(x, terrainY + 2.1, z),
            linearDamping: 0.4,
            fixedRotation: true
        });
        physicsBody.addShape(shape);
        this.world.addBody(physicsBody);

        // Add active boss behaviour state: attack timer and teleport cooldown
        // MASSIVELY BUFFED HP (10x base)
        // TNS Boss Overrides
        let customHp = 30000;
        
        if (this.gameMode === 'TNS' && isMain) {
            // Force names based on tier
            if (this.tnsTier === 1) bossName = 'Babybark';
            else if (this.tnsTier === 2) bossName = 'Smolbark';
            else if (this.tnsTier === 3) bossName = 'Chadbark';
            else if (this.tnsTier === 4) bossName = 'Barkvader';
            
            // 15x scaling per tier (starting base 5000 for tier 1)
            // Tier 1: 5000
            // Tier 2: 75000
            // Tier 3: 1.125M
            // Tier 4: 16.8M
            customHp = 5000 * Math.pow(15, this.tnsTier - 1);
        } else {
            // Classic Scaling: Base 30k * 15^(tier-1)
            customHp = 30000 * Math.pow(15, this.tier - 1);
        }

        const hpVal = hpOverride !== null ? hpOverride : customHp;
        const maxHpVal = hpVal; // Fix: Define maxHpVal

        const bossObj = {
            id: 'BOSS_MAIN_' + Date.now(),
            name: bossName,
            mesh: group,
            body: physicsBody,
            hp: hpVal,
            maxHp: maxHpVal,
            size: 1.8,
            attackCooldown: 0,
            isBoss: true,
            isMainBoss: true,
            walkTime: 0,
            anim: {
                arms: [armL, armR],
                legs: [legL, legR]
            },
            bossRing,
            attackTimer: 0,
            teleportCooldown: 0,
            farTimer: 0 // Track time spent far away
        };

        this.bossEnemy = bossObj;
        // Track the current main boss instance so we only react to this exact boss's death
        this.currentMainBossId = bossObj.id;
        


        this.enemies.push(this.bossEnemy);
        this.createBossBar(this.bossEnemy);

        // --- Create an inescapable arena sphere around the chosen flat-top so players can't leave while boss is active ---
        try {
            const arenaCenter = new THREE.Vector3(x, terrainY, z);
            // BIGGER arena to actually feel sealed — made substantially larger per feedback
            const arenaRadius = 20.0; // radius around the flat-top that becomes sealed (was 6.0)
            const sphereGeo = new THREE.SphereGeometry(arenaRadius, 36, 24);

            // Visible but mostly translucent material so the arena is clearly noticeable.
            const sphereMat = new THREE.MeshBasicMaterial({
                color: 0x002244,
                transparent: true,
                opacity: 0.14,
                side: THREE.BackSide
            });
            const arenaMesh = new THREE.Mesh(sphereGeo, sphereMat);
            arenaMesh.position.copy(arenaCenter);
            arenaMesh.userData.isBossArena = true;
            this.scene.add(arenaMesh);

            // Add a subtle glowing ring on the ground to further indicate the sealed area
            const ringGeo = new THREE.RingGeometry(arenaRadius - 0.6, arenaRadius + 0.6, 64);
            const ringMat = new THREE.MeshBasicMaterial({ color: 0xff4444, transparent: true, opacity: 0.18, side: THREE.DoubleSide });
            const groundRing = new THREE.Mesh(ringGeo, ringMat);
            groundRing.rotation.x = -Math.PI / 2;
            groundRing.position.set(arenaCenter.x, arenaCenter.y + 0.02, arenaCenter.z);
            this.scene.add(groundRing);

            this.bossArena = {
                center: arenaCenter.clone(),
                radius: arenaRadius,
                mesh: arenaMesh,
                groundRing: groundRing,
                sealedToastShown: false
            };
        } catch (e) {
            console.warn('Failed to create boss arena sphere:', e);
            this.bossArena = null;
        }

        this.updateObjectives();
    }

    // Safely remove a boss/miniboss instance and all tracked references/bars/bodies.
    // 'quiet' silences some toast/UI feedback when used preemptively.
    safeRemoveBoss(boss, quiet = false) {
        if (!boss) return;
        try {
            // Remove boss bar UI
            try { this.removeBossBar(boss.id); } catch (e) {}
            // Remove physics body
            try { if (boss.body) this.world.removeBody(boss.body); } catch (e) {}
            // Remove mesh visuals
            try { if (boss.mesh) this.scene.remove(boss.mesh); } catch (e) {}
            // Remove from enemies array
            try { this.enemies = (this.enemies || []).filter(e => e && e.id !== boss.id); } catch (e) {}
            // If this was referenced as this.bossEnemy, clear it safely
            if (this.bossEnemy && this.bossEnemy.id === boss.id) {
                this.bossEnemy = null;
            }
            // If bossArena referenced this boss, clear seals so player isn't trapped
            if (this.bossArena && this.bossArena.sealedToastShown) {
                this.bossArena.sealedToastShown = false;
            }
            // Defensive: clear any lingering boss id trackers
            if (this.currentMainBossId && this.currentMainBossId === boss.id) {
                this.currentMainBossId = null;
            }
        } catch (e) {
            console.warn('safeRemoveBoss encountered an error:', e);
        }

        if (!quiet) {
            try { this.showToast(`${boss.name || 'Boss'} removed.`); } catch(e) {}
        }
    }

    spawnRandomMiniboss() {
        if (this.bossEnemy) return; // Wait until current boss is dead

        const types = ['JOHN_PORK', 'KAREN', 'BRUH_NUBIS'];
        const type = types[Math.floor(Math.random() * types.length)];
        this.spawnMiniboss(type);
    }

    spawnMiniboss(type, hpOverride = null) {
        if (this.bossEnemy) return; 
        
        // Classic Scaling for Minibosses
        const scale = Math.pow(15, this.tier - 1);

        const playerPos = this.playerBody.position;
        // Find valid spawn location near player
        let x=0, z=0;
        for(let i=0; i<20; i++) {
             const angle = Math.random() * Math.PI * 2;
             const dist = 20;
             x = playerPos.x + Math.cos(angle) * dist;
             z = playerPos.z + Math.sin(angle) * dist;
             if(!this.isLava(x, z)) break;
        }

        const y = this.getTerrainHeight(x, z) + 2;

        const group = new THREE.Group();
        let name = "";
        
        if (type === 'JOHN_PORK') {
            name = "John Pork the Terrible";
            // Realistic Pigman Bruiser
            const suitMat = new THREE.MeshStandardMaterial({ color: 0x222222 });
            const pigSkin = new THREE.MeshStandardMaterial({ color: 0xffaa88 });
            
            const body = new THREE.Mesh(new THREE.BoxGeometry(1.6, 2.0, 1.0), suitMat);
            body.position.y = 1.5;
            group.add(body);
            
            const head = new THREE.Mesh(new THREE.BoxGeometry(1.2, 1.2, 1.4), pigSkin);
            head.position.y = 2.8;
            group.add(head);
            
            const snout = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, 0.4, 8), new THREE.MeshStandardMaterial({ color: 0xff8866 }));
            snout.rotation.x = Math.PI/2;
            snout.position.set(0, 2.7, 0.8);
            group.add(snout);
            
            // Fists
            const fistL = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.6, 0.6), pigSkin);
            fistL.position.set(-1.0, 1.5, 0.8);
            group.add(fistL);
            const fistR = fistL.clone();
            fistR.position.x = 1.0;
            group.add(fistR);
            
        } else if (type === 'KAREN') {
            name = "Queen Karen";
            // Floating Banshee
            const dressMat = new THREE.MeshStandardMaterial({ color: 0xaa00aa, side: THREE.DoubleSide });
            const body = new THREE.Mesh(new THREE.ConeGeometry(1.0, 3.0, 16, 1, true), dressMat);
            body.position.y = 1.5;
            group.add(body);
            
            const head = new THREE.Mesh(new THREE.SphereGeometry(0.6), new THREE.MeshStandardMaterial({ color: 0xffddbb }));
            head.position.y = 3.2;
            group.add(head);
            
            // The Hair (Iconic Wedge)
            const hairGeo = new THREE.BoxGeometry(1.4, 1.0, 1.4);
            const hairMat = new THREE.MeshStandardMaterial({ color: 0xffff00 });
            const hair = new THREE.Mesh(hairGeo, hairMat);
            hair.position.set(0, 3.6, 0.2);
            hair.rotation.x = -0.3;
            group.add(hair);
            
        } else {
            name = "Bruh-nubis";
            // Golden God
            const goldMat = new THREE.MeshStandardMaterial({ color: 0xffd700, metalness: 0.8, roughness: 0.2 });
            const blackMat = new THREE.MeshStandardMaterial({ color: 0x111111 });
            
            const body = new THREE.Mesh(new THREE.BoxGeometry(1.0, 2.2, 0.6), blackMat);
            body.position.y = 1.5;
            group.add(body);
            
            // Jackal Head
            const head = new THREE.Mesh(new THREE.BoxGeometry(0.7, 1.0, 1.0), blackMat);
            head.position.y = 2.9;
            group.add(head);
            
            const snout = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.4, 0.8), blackMat);
            snout.position.set(0, 2.8, 0.8);
            group.add(snout);
            
            // Tall Ears
            const earL = new THREE.Mesh(new THREE.BoxGeometry(0.2, 1.2, 0.2), goldMat);
            earL.position.set(-0.3, 3.6, 0);
            group.add(earL);
            const earR = earL.clone();
            earR.position.x = 0.3;
            group.add(earR);
            
            // Staff
            const staff = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 4.0), goldMat);
            staff.position.set(0.8, 2.0, 0.5);
            staff.rotation.x = 0.2;
            group.add(staff);
        }

        group.position.set(x, y, z);
        this.scene.add(group);
        
        const body = new CANNON.Body({ mass: 10, position: new CANNON.Vec3(x, y, z), fixedRotation: true });
        body.addShape(new CANNON.Sphere(1.5));
        this.world.addBody(body);
        
        const baseHp = 15000;
        const maxHpVal = baseHp * scale; 
        const hpVal = hpOverride !== null ? hpOverride : maxHpVal;

        // Slightly buffed HP for minibosses
        const mbId = 'MINIBOSS_' + Date.now();
        this.bossEnemy = {
            id: mbId,
            name: name,
            mesh: group,
            body: body,
            hp: hpVal,
            maxHp: maxHpVal,
            size: 1.5,
            isBoss: true,
            isMainBoss: false,
            type: 'miniboss',
            minibossType: type, // Store specific type for respawning
            farTimer: 0
        };
        this.enemies.push(this.bossEnemy);
        this.createBossBar(this.bossEnemy);
        this.showToast(`${name} has appeared!`);
    }

    respawnBossNearPlayer(oldBoss) {
        // Save state
        const savedHp = oldBoss.hp;
        const isMain = oldBoss.isMainBoss;
        const type = oldBoss.minibossType;

        // Cleanup old
        this.removeBossBar(oldBoss.id);
        if (oldBoss.body) this.world.removeBody(oldBoss.body);
        if (oldBoss.mesh) this.scene.remove(oldBoss.mesh);
        this.enemies = this.enemies.filter(e => e.id !== oldBoss.id);
        this.bossEnemy = null; // Clear so createBoss allows new one

        // Spawn new
        if (isMain) {
            this.createBoss(true, savedHp);
            this.showToast("The Gatekeeper followed you!");
        } else {
            this.spawnMiniboss(type, savedHp);
            this.showToast("The Miniboss followed you!");
        }
    }

    createBossBar(boss) {
        const container = document.getElementById('boss-bars-container');
        if (!container) return;
        
        const barDiv = document.createElement('div');
        barDiv.id = `boss-bar-${boss.id}`;
        barDiv.style.width = '100%';
        barDiv.style.background = 'rgba(0,0,0,0.7)';
        barDiv.style.border = '2px solid white';
        barDiv.style.padding = '4px';
        barDiv.innerHTML = `
            <div style="color:white; font-size:0.8rem; margin-bottom:2px; text-transform:uppercase; letter-spacing:1px;">${boss.name}</div>
            <div style="width:100%; height:12px; background:#330000;">
                <div class="fill" style="width:100%; height:100%; background:linear-gradient(90deg, #ff0000, #ff6600); transition:width 0.2s;"></div>
            </div>
        `;
        container.appendChild(barDiv);
    }

    updateBossBar(boss) {
        const el = document.getElementById(`boss-bar-${boss.id}`);
        if (el) {
            const pct = Math.max(0, (boss.hp / boss.maxHp) * 100);
            el.querySelector('.fill').style.width = pct + '%';
        }
    }

    removeBossBar(id) {
        const el = document.getElementById(`boss-bar-${id}`);
        if (el) el.remove();
    }

    spawnBob(x, z, type) {
        // Type variants:
        // - 'BOB'           -> Awakening default (used elsewhere)
        // - 'DEADLY_BOB'    -> Awakening deadly variant (existing)
        // - 'OVERTIME_BOB'  -> Arcade overtime stacked bob (very large HP, high melee damage)
        this.playSound('boom', 0.5, 1.0);
        this.showToast(type === 'DEADLY_BOB' ? 'DEADLY BOB AWAKENS!' : (type === 'OVERTIME_BOB' ? 'OVERTIME BOB ARRIVES!' : 'Bob has awoken.'));
        
        // Spawn slightly above spawn location to avoid floor clip
        const spawnY = this.getTerrainHeight(x, z) + 4;
        
        const group = new THREE.Group();
        const mat = new THREE.MeshStandardMaterial({ color: type === 'DEADLY_BOB' ? 0xaa0000 : (type === 'OVERTIME_BOB' ? 0x660000 : 0x444444) });
        
        const head = new THREE.Mesh(new THREE.BoxGeometry(3, 3, 3), mat);
        head.position.y = 1.5; // Centered locally
        group.add(head);
        
        const hand = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), mat);
        hand.position.set(-2.5, 1, 1);
        group.add(hand);
        const hand2 = hand.clone();
        hand2.position.set(2.5, 1, 1);
        group.add(hand2);

        group.position.set(x, spawnY, z);
        this.scene.add(group);

        const body = new CANNON.Body({ mass: 20, position: new CANNON.Vec3(x, spawnY, z), fixedRotation: true });
        body.addShape(new CANNON.Sphere(2.5));
        this.world.addBody(body);

        let hp = 2000;
        let bobDamagePerHit = null;

        if (type === 'DEADLY_BOB') {
            hp = 5000;
            bobDamagePerHit = 40;
        } else if (type === 'OVERTIME_BOB') {
            // Use bobSpawnCount to determine stacking HP: first overtime bob = 1,000,000, second = 2,000,000, etc.
            const count = Math.max(1, (this.bobSpawnCount || 1));
            hp = 1000000 * count;
            bobDamagePerHit = 1000; // Overtime Bob hits are 1000 per hit
        } else {
            // Standard Awakening bob (BOB)
            hp = 2000;
            bobDamagePerHit = 35;
        }
        
        const bob = {
            id: 'BOB_' + Date.now(),
            name: type.replace('_', ' '),
            mesh: group,
            body: body,
            hp: hp,
            maxHp: hp,
            size: 2.5,
            isBoss: true,
            isMainBoss: false, // Don't trigger portal
            type: type === 'OVERTIME_BOB' ? 'OVERTIME_BOB' : 'BOB',
            walkTime: 0,
            anim: {},
            bobDamage: bobDamagePerHit
        };
        this.enemies.push(bob);
        this.createBossBar(bob);
    }

    spawnMonkeCrate() {
        if (this.gameMode === 'AWAKENING') return;
        // Only spawn if Monke isn't unlocked yet
        try {
            const saved = JSON.parse(localStorage.getItem('uberthump_unlocks') || '{}');
            if (saved.MONKE) return;
        } catch(e) { return; }

        let x=0, z=0;
        // Far away position
        const angle = Math.random() * Math.PI * 2;
        const dist = 140; 
        x = Math.cos(angle) * dist;
        z = Math.sin(angle) * dist;
        
        // Ensure platform
        const h = this.getTerrainHeight(x, z);
        if (h <= 0) {
            // Force create a platform if none exists
            this.createTerrainPiece(x, z, 15, 5);
        }
        
        const y = this.getTerrainHeight(x, z);
        
        const group = new THREE.Group();
        // Crate/cage visuals - sturdy wooden cage with full sides, back and top, and a visible lock
        const woodMat = new THREE.MeshStandardMaterial({ color: 0x5C4033, flatShading: true });
        const metalMat = new THREE.MeshStandardMaterial({ color: 0x444444, flatShading: true });
        const goldMat = new THREE.MeshStandardMaterial({ color: 0xffd700, flatShading: true });
        
        // Base platform (so cage sits slightly above ground)
        const base = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.2, 2.2), woodMat);
        base.position.y = 0.1;
        group.add(base);

        // Cage frame (4 vertical posts)
        const postGeo = new THREE.BoxGeometry(0.15, 2.0, 0.15);
        const posts = [
            new THREE.Mesh(postGeo, woodMat),
            new THREE.Mesh(postGeo, woodMat),
            new THREE.Mesh(postGeo, woodMat),
            new THREE.Mesh(postGeo, woodMat)
        ];
        posts[0].position.set(-0.95, 1.05, -0.95);
        posts[1].position.set(0.95, 1.05, -0.95);
        posts[2].position.set(-0.95, 1.05, 0.95);
        posts[3].position.set(0.95, 1.05, 0.95);
        posts.forEach(p => group.add(p));

        // Top frame
        const topPlate = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.15, 2.2), woodMat);
        topPlate.position.y = 2.05;
        group.add(topPlate);

        // Bars on all four sides (fill sides and back/front)
        const barGeoV = new THREE.BoxGeometry(0.08, 1.8, 0.08);
        const barGeoH = new THREE.BoxGeometry(1.9, 0.08, 0.08);
        // front/back rows
        for (let i = -0.75; i <= 0.75; i += 0.25) {
            const b1 = new THREE.Mesh(barGeoV, metalMat);
            b1.position.set(i, 1.0, 0.95);
            group.add(b1);
            const b2 = b1.clone();
            b2.position.z = -0.95;
            group.add(b2);
        }
        // left/right rows
        for (let i = -0.75; i <= 0.75; i += 0.25) {
            const b1 = new THREE.Mesh(barGeoV, metalMat);
            b1.position.set(0.95, 1.0, i);
            group.add(b1);
            const b2 = b1.clone();
            b2.position.x = -0.95;
            group.add(b2);
        }

        // Door at front (separate slab so it can "open" visually later)
        const door = new THREE.Mesh(new THREE.BoxGeometry(1.2, 1.8, 0.08), woodMat);
        door.position.set(0, 1.0, 0.98);
        door.userData.isDoor = true;
        group.add(door);

        // Lock (visual)
        const lock = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.6, 0.1), goldMat);
        lock.position.set(0, 1.05, 1.14);
        group.add(lock);

        // Place group in world
        group.position.set(x, y + 0.1, z);
        this.scene.add(group);
        
        // Create a hidden Monke model inside the cage (visible after open)
        const monkeGroup = new THREE.Group();
        const furMat = new THREE.MeshStandardMaterial({ color: 0x5C4033, flatShading: true });
        const skinMat = new THREE.MeshStandardMaterial({ color: 0xC4A484, flatShading: true });
        const body = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.8, 0.6), furMat);
        body.position.y = 0.7;
        monkeGroup.add(body);
        const head = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.6, 0.6), furMat);
        head.position.y = 1.45;
        monkeGroup.add(head);
        const muzzle = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.3, 0.2), skinMat);
        muzzle.position.set(0, 1.35, 0.35);
        monkeGroup.add(muzzle);
        // Sunglasses
        const glasses = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.15, 0.1), new THREE.MeshStandardMaterial({ color: 0x111111 }));
        glasses.position.set(0, 1.55, 0.32);
        monkeGroup.add(glasses);

        // Position monke inside cage and hide visually until opened
        monkeGroup.position.set(x, y + 0.1, z);
        monkeGroup.visible = false;
        this.scene.add(monkeGroup);

        this.monkeCrate = {
            mesh: group,
            doorMesh: door,
            lockMesh: lock,
            pos: new THREE.Vector3(x, y, z),
            interacted: false,
            monkeVisual: monkeGroup
        };
    }

    // Spawn a single secret lore note in the world (non-Awakening modes)
    spawnSecretLoreNote() {
        if (this.gameMode === 'AWAKENING') return;

        try {
            // If player has already unlocked the secret note in a previous playthrough, don't spawn it again.
            try {
                if (localStorage.getItem('uberthump_secret_note_unlocked') === 'true') {
                    return;
                }
            } catch (e) {
                // ignore localStorage errors and proceed to spawn
            }

            // If already placed or unlocked within this run, keep the existing one
            if (this.secretNote && !this.secretNote.collected) return;

            // Try multiple attempts to find a valid solid platform location, falling back to a safe created platform.
            const maxAttempts = 12;
            let placed = false;
            let sx = 0, sz = 0, sy = 0;

            for (let attempt = 0; attempt < maxAttempts; attempt++) {
                const angle = this.randomValue(0, Math.PI * 2);
                const dist = 100 + this.randomValue(-30, 30); // slightly closer spread for reliability
                const x = Math.cos(angle) * dist;
                const z = Math.sin(angle) * dist;

                // Prefer platform or ramp; if none, allow slightly off-platform but still solid ground
                if (this.isOnPlatformOrRamp(x, z) || this.getTerrainHeight(x, z) >= 0) {
                    sx = x; sz = z; sy = this.getTerrainHeight(x, z);
                    placed = true;
                    break;
                }
            }

            // If nothing valid found, create a small safe platform near the origin fallback
            if (!placed) {
                const fallbackX = 40 + Math.floor(this.randomValue(-12, 12));
                const fallbackZ = 40 + Math.floor(this.randomValue(-12, 12));
                this.createTerrainPiece(fallbackX, fallbackZ, 12, 4);
                sx = fallbackX;
                sz = fallbackZ;
                sy = this.getTerrainHeight(sx, sz);
            }

            // Create the visual note object
            const group = new THREE.Group();

            // Wooden pin / stand
            const pin = new THREE.Mesh(
                new THREE.CylinderGeometry(0.08, 0.08, 0.6, 8),
                new THREE.MeshStandardMaterial({ color: 0x7a5b3a, roughness: 0.9 })
            );
            pin.position.y = sy + 0.3;
            group.add(pin);

            // Paper sheet
            const paper = new THREE.Mesh(
                new THREE.PlaneGeometry(1.2, 1.6, 1, 1),
                new THREE.MeshStandardMaterial({
                    color: 0xfdfbf7,
                    roughness: 0.8,
                    metalness: 0,
                    side: THREE.DoubleSide
                })
            );
            paper.position.set(0, sy + 1.3, 0);
            paper.rotation.y = this.randomValue(0, Math.PI * 2);
            paper.rotation.x = THREE.MathUtils.degToRad(-10);
            group.add(paper);

            // Slight bend effect (safe try/catch)
            try {
                paper.geometry.applyMatrix4(
                    new THREE.Matrix4().makeShear(0.05 * (Math.random() - 0.5), 0.02, 0, 0, 0, 0)
                );
            } catch (e) {}

            // Tiny glowing pin at top
            const thumb = new THREE.Mesh(
                new THREE.SphereGeometry(0.07, 8, 8),
                new THREE.MeshStandardMaterial({ color: 0xff4444, emissive: 0xff4444, emissiveIntensity: 1.0 })
            );
            thumb.position.set(0, sy + 1.6, 0.02);
            group.add(thumb);

            group.position.set(sx, 0, sz);
            group.userData.isSecretNote = true;
            this.scene.add(group);

            this.secretNote = {
                mesh: group,
                pos: new THREE.Vector3(sx, sy, sz),
                collected: false
            };
        } catch (e) {
            // If anything goes wrong, silently skip spawning the note
        }
    }

    createEnemy(options = {}) {
        let x, z, spawnTerrainY;
        let valid = false;
        
        if (options.overrideX !== undefined) {
            x = options.overrideX;
            z = options.overrideZ;
            spawnTerrainY = this.getTerrainHeight(x, z);
            valid = true;
        } else {
            // Random generation (Host/Local only)
            for (let tries = 0; tries < 30; tries++) {
                const angle = Math.random() * Math.PI * 2;
                const dist = 45 + Math.random() * 25;
                x = this.playerBody.position.x + Math.sin(angle) * dist;
                z = this.playerBody.position.z + Math.cos(angle) * dist;
                if (!this.isLava(x, z)) {
                    spawnTerrainY = this.getTerrainHeight(x, z);
                    valid = true;
                    break;
                }
            }
        }
        
        if (!valid) return;
        
        const types = ['ogre', 'skeleton', 'piglin', 'zombie', 'spider'];
        const type = options.overrideType || types[Math.floor(Math.random() * types.length)];
        
        // ... (Visual generation continues) ...
        const group = new THREE.Group();
        let size = 1;
        let displayName = "Enemy";
        const animParts = { arms: [], legs: [] };

        // Helper to vary color slightly to prevent uniformity
        const varyColor = (hex, variance = 0.15) => {
            const c = new THREE.Color(hex);
            const offset = (Math.random() - 0.5) * variance;
            c.offsetHSL(0, 0, offset);
            return c;
        };
        
        // Buff Damage scaling
        const damageMult = 2.5; // Significantly higher damage output for enemies

        if (type === 'ogre') {
            const skinMat = new THREE.MeshStandardMaterial({ color: varyColor(0x4a7c59), flatShading: true });
            const armorMat = new THREE.MeshStandardMaterial({ color: 0x333333, metalness: 0.3, roughness: 0.6, flatShading: true });

            const body = new THREE.Mesh(
                new THREE.BoxGeometry(1.3, 1.6, 0.9),
                skinMat
            );
            body.position.y = 0.8;
            group.add(body);

            const belt = new THREE.Mesh(
                new THREE.BoxGeometry(1.35, 0.25, 0.95),
                armorMat
            );
            belt.position.y = 0.25;
            group.add(belt);
            
            const head = new THREE.Mesh(
                new THREE.BoxGeometry(1.0, 1.0, 1.0),
                skinMat
            );
            head.position.y = 1.9;
            group.add(head);

            const brow = new THREE.Mesh(
                new THREE.BoxGeometry(1.0, 0.2, 0.4),
                armorMat
            );
            brow.position.set(0, 2.15, 0.45);
            group.add(brow);
            
            const armL = new THREE.Mesh(
                new THREE.BoxGeometry(0.45, 1.2, 0.45),
                skinMat
            );
            armL.position.set(-0.9, 0.9, 0);
            group.add(armL);
            
            const armR = armL.clone();
            armR.position.x = 0.9;
            group.add(armR);

            const padL = new THREE.Mesh(
                new THREE.BoxGeometry(0.7, 0.3, 0.7),
                armorMat
            );
            padL.position.set(-0.9, 1.4, 0);
            group.add(padL);
            const padR = padL.clone();
            padR.position.x = 0.9;
            group.add(padR);

            animParts.arms.push(armL, armR);
            size = 1.25;
            displayName = "Ogre";
        } else if (type === 'skeleton') {
            // Pixelly skeleton with ribs and spine
            const boneMat = new THREE.MeshStandardMaterial({ color: varyColor(0xdddddd, 0.05), flatShading: true });

            const spine = new THREE.Mesh(
                new THREE.BoxGeometry(0.25, 1.3, 0.25),
                boneMat
            );
            spine.position.y = 0.75;
            group.add(spine);

            for (let i = 0; i < 3; i++) {
                const rib = new THREE.Mesh(
                    new THREE.BoxGeometry(0.9, 0.15, 0.25),
                    boneMat
                );
                rib.position.y = 0.4 + i * 0.3;
                group.add(rib);
            }
            
            const head = new THREE.Mesh(
                new THREE.BoxGeometry(0.8, 0.8, 0.8),
                new THREE.MeshStandardMaterial({ color: 0xf5f5f5, flatShading: true })
            );
            head.position.y = 1.6;
            group.add(head);
            
            const eye1 = new THREE.Mesh(
                new THREE.BoxGeometry(0.16, 0.16, 0.16),
                new THREE.MeshStandardMaterial({ color: 0x000000 })
            );
            eye1.position.set(-0.18, 1.7, 0.38);
            group.add(eye1);
            
            const eye2 = eye1.clone();
            eye2.position.x = 0.18;
            group.add(eye2);

            const jaw = new THREE.Mesh(
                new THREE.BoxGeometry(0.7, 0.25, 0.7),
                boneMat
            );
            jaw.position.y = 1.3;
            group.add(jaw);

            const armL = new THREE.Mesh(
                new THREE.BoxGeometry(0.2, 1.0, 0.2),
                boneMat
            );
            armL.position.set(-0.6, 0.9, 0);
            group.add(armL);
            const armR = armL.clone();
            armR.position.x = 0.6;
            group.add(armR);
            animParts.arms.push(armL, armR);

            const legL = new THREE.Mesh(
                new THREE.BoxGeometry(0.22, 1.0, 0.22),
                boneMat
            );
            legL.position.set(-0.25, 0.1, 0);
            group.add(legL);
            const legR = legL.clone();
            legR.position.x = 0.25;
            group.add(legR);
            animParts.legs.push(legL, legR);
            
            size = 1;
            displayName = "Skeleton";
        } else if (type === 'piglin') {
            // Piglin with gold belt and tusks
            const skinMat = new THREE.MeshStandardMaterial({ color: varyColor(0xf4b894), flatShading: true });
            const clothMat = new THREE.MeshStandardMaterial({ color: varyColor(0x8b4513), flatShading: true });
            const goldMat = new THREE.MeshStandardMaterial({ color: 0xffd700, metalness: 0.7, roughness: 0.3, flatShading: true });

            const body = new THREE.Mesh(
                new THREE.BoxGeometry(0.95, 1.3, 0.65),
                clothMat
            );
            body.position.y = 0.7;
            group.add(body);
            
            const head = new THREE.Mesh(
                new THREE.BoxGeometry(0.9, 0.9, 0.9),
                skinMat
            );
            head.position.y = 1.6;
            group.add(head);
            
            const snout = new THREE.Mesh(
                new THREE.BoxGeometry(0.5, 0.35, 0.4),
                skinMat
            );
            snout.position.set(0, 1.5, 0.6);
            group.add(snout);
            
            const tuskL = new THREE.Mesh(
                new THREE.BoxGeometry(0.12, 0.25, 0.12),
                goldMat
            );
            tuskL.position.set(-0.18, 1.4, 0.8);
            group.add(tuskL);
            const tuskR = tuskL.clone();
            tuskR.position.x = 0.18;
            group.add(tuskR);
            
            const ear1 = new THREE.Mesh(
                new THREE.BoxGeometry(0.35, 0.55, 0.1),
                skinMat
            );
            ear1.position.set(-0.55, 1.9, 0);
            group.add(ear1);
            
            const ear2 = ear1.clone();
            ear2.position.x = 0.55;
            group.add(ear2);

            const belt = new THREE.Mesh(
                new THREE.BoxGeometry(1.0, 0.2, 0.7),
                goldMat
            );
            belt.position.y = 0.35;
            group.add(belt);

            const armL = new THREE.Mesh(
                new THREE.BoxGeometry(0.35, 1.0, 0.35),
                skinMat
            );
            armL.position.set(-0.8, 0.9, 0);
            group.add(armL);
            const armR = armL.clone();
            armR.position.x = 0.8;
            group.add(armR);
            animParts.arms.push(armL, armR);
            
            size = 1.05;
            displayName = "Piglin";
        } else if (type === 'spider') {
            // Fixed Spider Spatter
            const bodyMat = new THREE.MeshStandardMaterial({ color: varyColor(0x222222), flatShading: true });
            const sacMat = new THREE.MeshStandardMaterial({ color: 0x5522aa, emissive: 0x8811ff, emissiveIntensity: 1.2, flatShading: true });

            const body = new THREE.Mesh(new THREE.SphereGeometry(0.5, 8, 8), bodyMat);
            body.position.y = 0.5;
            group.add(body);

            const sac = new THREE.Mesh(new THREE.SphereGeometry(0.6, 8, 8), sacMat);
            sac.position.set(0, 0.6, -0.7);
            group.add(sac);
            
            const head = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.3, 0.4), bodyMat);
            head.position.set(0, 0.5, 0.4);
            group.add(head);
            
            const eyeGeo = new THREE.BoxGeometry(0.08, 0.08, 0.08);
            const eyeMat = new THREE.MeshBasicMaterial({ color: 0xff0000 });
            const eyeL = new THREE.Mesh(eyeGeo, eyeMat);
            eyeL.position.set(-0.1, 0.55, 0.6);
            group.add(eyeL);
            const eyeR = eyeL.clone();
            eyeR.position.x = 0.1;
            group.add(eyeR);

            const legMat = new THREE.MeshStandardMaterial({ color: 0x111111, flatShading: true });
            const legParts = [];

            // 8 Legs
            for (let i = 0; i < 8; i++) {
                const legGroup = new THREE.Group();
                // Flip leg structure so it points down correctly
                const upperLeg = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.6, 0.1), legMat);
                upperLeg.position.set(0, 0.3, 0); 
                legGroup.add(upperLeg);
                
                const lowerLeg = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.7, 0.1), legMat);
                lowerLeg.position.set(0.1, -0.2, 0); // extend out and down
                lowerLeg.rotation.z = -0.5;
                upperLeg.add(lowerLeg);

                // Side determination
                const isRight = i % 2 === 0;
                const side = isRight ? 1 : -1;
                const index = Math.floor(i/2);
                
                legGroup.position.set(side * 0.3, 0.4, 0.5 - index * 0.35);
                
                // Fix spider legs being upside down/weird
                // Adjust base rotations to point DOWN (geometry is +Y up)
                legGroup.rotation.z = side * (-2.5); 
                legGroup.rotation.y = side * 0.4;
                // Adjust attachment height
                legGroup.position.y = 0.4;

                group.add(legGroup);
                legParts.push(legGroup);
            }

            // Fix spider body rotation so it's not upside down
            // Sphere is symmetric, but head placement matters.
            // Currently head is at +Y=0.5. Looks ok.
            // Maybe user saw legs pointing up. The Z rotation above should fix it.

            size = 0.8;
            animParts.legs = legParts; // Animate these
            displayName = "Spider";
        } else {
            // Zombie with shirt + pants, more segmented
            const skinMat = new THREE.MeshStandardMaterial({ color: varyColor(0x5a8c5a), flatShading: true });
            const shirtMat = new THREE.MeshStandardMaterial({ color: varyColor(0x2f6f9a), flatShading: true });
            const pantsMat = new THREE.MeshStandardMaterial({ color: varyColor(0x1f2933), flatShading: true });

            const torso = new THREE.Mesh(
                new THREE.BoxGeometry(0.95, 1.2, 0.55),
                shirtMat
            );
            torso.position.y = 0.9;
            group.add(torso);
            
            const head = new THREE.Mesh(
                new THREE.BoxGeometry(0.8, 0.8, 0.8),
                skinMat
            );
            head.position.y = 1.7;
            group.add(head);
            
            const eyeStrip = new THREE.Mesh(
                new THREE.BoxGeometry(0.5, 0.18, 0.1),
                new THREE.MeshBasicMaterial({ color: 0x99ff99 })
            );
            eyeStrip.position.set(0, 1.7, 0.45);
            group.add(eyeStrip);
            
            const armL = new THREE.Mesh(
                new THREE.BoxGeometry(0.35, 1.0, 0.35),
                skinMat
            );
            armL.position.set(-0.75, 0.9, 0);
            group.add(armL);
            
            const armR = armL.clone();
            armR.position.x = 0.75;
            group.add(armR);

            animParts.arms.push(armL, armR);

            const legL = new THREE.Mesh(
                new THREE.BoxGeometry(0.35, 1.0, 0.35),
                pantsMat
            );
            legL.position.set(-0.3, 0.1, 0);
            group.add(legL);
            const legR = legL.clone();
            legR.position.x = 0.3;
            group.add(legR);
            animParts.legs.push(legL, legR);
            
            size = 1;
            displayName = "Zombie";
        }
        
        const targetY = spawnTerrainY + size;
        const spawnStartY = targetY - 3; // rise up from below ground

        group.position.set(x, spawnStartY, z);
        group.castShadow = true;
        this.scene.add(group);
        
        const shape = new CANNON.Sphere(size);
        const physicsBody = new CANNON.Body({
            mass: 1,
            position: new CANNON.Vec3(x, spawnStartY, z),
            linearDamping: 0.3,
            fixedRotation: true
        });
        physicsBody.addShape(shape);
        this.world.addBody(physicsBody);
        
        // Tier Scaling - 15x PER tier exponential
        const tierHpMult = Math.pow(15, this.tier - 1);
        
        // Base stats from Bestiary relative values (Halved as requested)
        const bestiaryHP = {
            'skeleton': 5,
            'ogre': 22,
            'piglin': 10,
            'spider': 6,
            'zombie': 9
        };
        const baseTypeHp = bestiaryHP[type] || 7;

        // Formula: (Base + Level Scaling) * Tier
        // Level scaling needs to be significant enough that enemies don't get one-shot immediately
        const levelScaling = this.level * 2.5; 
        const hpValue = options.overrideHp || ((baseTypeHp + levelScaling) * tierHpMult);
        const enemyId = options.overrideId || Math.random().toString(36);

        // Multiplayer Sync: If we are HOST (authority) and this is a fresh spawn (no overrideId), broadcast it
        if (this.gameMode === 'MULTI' && this.room && !options.overrideId) {
            const isHost = Object.keys(this.room.peers).sort()[0] === this.room.clientId;
            if (isHost) {
                this.room.send({
                    type: 'spawnEnemy',
                    data: {
                        type: type,
                        x: x,
                        z: z,
                        id: enemyId,
                        hp: hpValue
                    }
                });
            } else {
                // If not host and trying to auto-spawn, abort!
                // Wait for host event.
                this.scene.remove(group);
                this.world.removeBody(physicsBody);
                return;
            }
        }

        this.enemies.push({
            id: enemyId,
            name: displayName,
            mesh: group,
            body: physicsBody,
            hp: hpValue,
            maxHp: hpValue,
            size: size,
            attackCooldown: 0,
            anim: animParts,
            walkTime: 0,
            type,
            // Extra state for special enemies
            isCharging: false,
            chargeTimer: 0,
            spawn: {
                timer: 0,
                duration: 0.7,
                startY: spawnStartY,
                targetY: targetY
            }
        });
    }

    autoAttack() {
        if (this.enemies.length === 0) return;

        // Drive character-specific basic attacks automatically so you don't need to click.
        if (this.characterKey === 'MMOOVT' || this.characterKey === 'SIR_CHAD') {
            // Auto slash
            let closeEnemy = false;
            const origin = this.playerMesh.position.clone();
            for (let enemy of this.enemies) {
                if (enemy.isBoss) continue;
                const dist = enemy.mesh.position.distanceTo(origin);
                if (dist < 4.0) {
                    closeEnemy = true;
                    break;
                }
            }
            if (closeEnemy) {
                this.knightSlash();
            }
        } else if (this.characterKey === 'CALCIUM') {
            // Auto bone throws at targets for Calcium.
            this.throwBone();
        }
    }

    shootProjectile(target, angleOffset = 0, options = {}) {
        if (!target || !target.mesh) return;
        
        const dir = new THREE.Vector3()
            .subVectors(target.mesh.position, this.playerMesh.position)
            .normalize();
        
        // Apply angle offset
        const rotated = dir.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), angleOffset);
        
        // Enhanced projectile visuals - glowing energy bolt
        const geometry = new THREE.CylinderGeometry(0.1, 0.2, 0.5, 8);
        const material = new THREE.MeshStandardMaterial({ 
            color: 0xffff00,
            emissive: 0xffaa00,
            emissiveIntensity: 2
        });
        const mesh = new THREE.Mesh(geometry, material);
        
        // Add glow sphere
        const glow = new THREE.Mesh(
            new THREE.SphereGeometry(0.25),
            new THREE.MeshBasicMaterial({ 
                color: 0xffff00,
                transparent: true,
                opacity: 0.6
            })
        );
        mesh.add(glow);
        
        const startPos = this.playerMesh.position.clone();
        startPos.y += 1;
        mesh.position.copy(startPos);
        this.scene.add(mesh);
        
        const speed = 40 * this.stats.projectileSpeed;
        
        this.projectiles.push({
            mesh: mesh,
            velocity: rotated.multiplyScalar(speed),
            damage: this.stats.damage,
            life: 3,
            isBone: options.isBone || false,
            bouncesLeft: options.bouncesLeft || 0
        });
    }

    damageEnemy(enemy, amount) {
        if (enemy.isShielded) {
            this.spawnDamageNumber(enemy.mesh.position.clone().add(new THREE.Vector3(0,3,0)), "IMMUNE", false);
            return;
        }

        // Easy Mode: Enemies take 4x damage from player
        const easyScale = 4.0;
        
        // Check for crit
        const isCrit = Math.random() < (this.stats.critChance || 0);
        const finalDamage = (isCrit ? amount * 2 : amount) * easyScale;
        
        enemy.hp -= finalDamage;

        // Damage Number
        this.spawnDamageNumber(enemy.mesh.position.clone().add(new THREE.Vector3(0, enemy.size, 0)), Math.round(finalDamage), isCrit);
        
        // Flash effect on all meshes in the group (only if material has emissive)
        enemy.mesh.traverse((child) => {
            if (
                child.isMesh &&
                child.material &&
                child.material.emissive &&
                typeof child.material.emissive.setHex === 'function'
            ) {
                child.material.emissive.setHex(isCrit ? 0xffd700 : 0xffffff);
                setTimeout(() => {
                    if (
                        child.material &&
                        child.material.emissive &&
                        typeof child.material.emissive.setHex === 'function'
                    ) {
                        child.material.emissive.setHex(0x000000);
                    }
                }, 50);
            }
        });
        
        if (enemy.hp <= 0) {
            this.killEnemy(enemy);
        }
    }

    killEnemy(enemy) {
        this.kills++;
        this.updateUI();
        
        // Vampirism healing
        if (this.stats.vampirism > 0) {
            const heal = this.stats.vampirism;
            this.playerHealth = Math.min(this.maxHealth, this.playerHealth + heal);
            this.healthBar.style.width = (this.playerHealth / this.maxHealth * 100) + '%';
            
            // Visual Pulse on Health Bar (Minor feature 2)
            if (this.healthBar) {
                this.healthBar.style.filter = 'brightness(1.5) hue-rotate(90deg)'; // Greenish flash
                setTimeout(() => { if(this.healthBar) this.healthBar.style.filter = 'none'; }, 100);
            }

            // Feedback for vampirism
            this.spawnDamageNumber(this.playerMesh.position.clone().add(new THREE.Vector3(0,2,0)), `+${heal} HP`, false, true);
        }
        
        this.world.removeBody(enemy.body);
        this.scene.remove(enemy.mesh);
        this.enemies = this.enemies.filter(e => e.id !== enemy.id);
        
        this.particleSystem.emit(enemy.mesh.position, 0xff4444, 15);
        this.playSound('boom', 0.8 + Math.random() * 0.4, 0.3);
        
        // Track unlock conditions
        if (enemy.type === 'skeleton') {
            this.skeletonKills = (this.skeletonKills || 0) + 1;
            this.checkCalciumUnlock();
        }
        // Drop coins
        let coinAmount = Math.ceil(1 + this.level * 0.25);
        if (this.gameMode === 'MULTI' || this.gameMode === 'SURVIVAL') {
             // Use lobby loot multiplier
             coinAmount *= (this.lootMultiplier || 1.0);
        }
        this.coins += Math.ceil(coinAmount);
        this.updateUI();

        // Track boss death for portal activation
        if (enemy.isBoss) {
            // If this was the main boss, create/activate the portal for the next tier (only after kill)
            if (enemy.isMainBoss) {
                // Juice: Portal open sound
                this.playSynth('unlock', 0.5, 0.8);
                // Ensure a portal exists before referencing its visuals to avoid softlocks
                if (!this.bossPortal) {
                    try {
                        this.createBossPortal();
                    } catch (e) {
                        console.warn('Failed to create boss portal on main boss death:', e);
                    }
                }

                this.bossPortalActivated = true;

                // If portal visuals exist, simply reveal the full portal model so it's obvious
                try {
                    if (this.bossPortal && this.bossPortal.visuals) {
                        this.bossPortal.visuals.visible = true;
                        // Slight pulse/scale for emphasis
                        this.bossPortal.visuals.scale.setScalar(1.1);
                    }
                } catch (e) {
                    console.warn('Failed to reveal boss portal visuals:', e);
                }

                this.showToast('Main Boss defeated! Portal open!');
                this.removeBossBar(enemy.id);

                // Ensure end-of-run timer behavior remains consistent
                if (this.gameTime < 590) {
                    this.gameTime = 590;
                    this.showToast("Portal closes in 10 seconds!");
                }
            } else {
                // Miniboss defeated
                this.removeBossBar(enemy.id);
                this.showToast(`${enemy.name} Defeated!`);
            }

            this.updateObjectives();

            // Unlock Blitz when you defeat the boss once
            this.unlockCharacter('BLITZ');

            // Calcium condition: Miniboss kill as MMOOVT
            if (this.characterKey === 'MMOOVT' && !enemy.isMainBoss) {
                this.minibossKilledAsMMOOVT = true;
                this.checkCalciumUnlock();
            }

            // Clear boss reference if it pointed to this enemy
            if (this.bossEnemy && this.bossEnemy.id === enemy.id) {
                this.bossEnemy = null;
            }

            this.updateObjectives();
        }
        
        // Drop XP at the actual enemy height
        const xpAmount = Math.ceil(1 + this.level * 0.3);
        for (let i = 0; i < xpAmount; i++) {
            const offset = new THREE.Vector3(
                randomRange(-1, 1),
                0,
                randomRange(-1, 1)
            );
            const dropPos = enemy.mesh.position.clone().add(offset);
            const orb = new XPOrb(this.scene, dropPos);
            this.xpOrbs.push(orb);
        }
        
        // Chests are no longer dropped by enemies – they are pre-placed around the map
    }

    despawnEnemy(enemy) {
        // Remove enemy without granting rewards (used when they touch lava)
        this.world.removeBody(enemy.body);
        this.scene.remove(enemy.mesh);
        this.enemies = this.enemies.filter(e => e.id !== enemy.id);
    }

    collectXP(amount = 1) {
        const gainMult = this.stats.xpGain || 1;
        this.xp += amount * gainMult;
        this.xpBar.style.width = (this.xp / this.xpToLevel * 100) + '%';
        
        // Visual Pulse on XP Bar (Minor feature 1)
        if (this.xpBar) {
            this.xpBar.style.filter = 'brightness(2.0)';
            setTimeout(() => { if (this.xpBar) this.xpBar.style.filter = 'brightness(1.0)'; }, 100);
        }

        // Level cap increased to 75
        if (this.level < 75 && this.xp >= this.xpToLevel) {
            this.levelUp();
        }
    }
    
    updateUI() {
        this.killCounter.innerText = `Kills: ${this.kills} | Coins: ${this.coins}`;
        
        // MP HUD Local Update
        if (this.gameMode === 'MULTI') {
            const p1HpBar = document.getElementById('mp-p1-hp-bar');
            const p1HpText = document.getElementById('mp-p1-hp-text');
            const p1Stats = document.getElementById('mp-p1-stats');
            const p1Items = document.getElementById('mp-p1-items');
            
            if(p1HpBar) p1HpBar.style.width = (this.playerHealth / this.maxHealth * 100) + '%';
            if(p1HpText) p1HpText.textContent = `${Math.floor(this.playerHealth)}/${Math.floor(this.maxHealth)}`;
            if(p1Stats) p1Stats.textContent = `LVL ${this.level} | DMG ${this.stats.damage.toFixed(1)}`;
            
            if(p1Items) {
                // Rebuild list
                let html = '';
                this.weapons.forEach(w => html += `<div>${WEAPONS[w] ? WEAPONS[w].name : w}</div>`);
                this.buffs.forEach(b => html += `<div style="color:#aaa">${b}</div>`);
                p1Items.innerHTML = html;
            }
        }
    }

    getDefaultWeaponLabel() {
        switch (this.characterKey) {
            case 'MMOOVT': return 'Knight Slash';
            case 'FOX': return 'Fox Fireball';
            case 'CALCIUM': return 'Bone Throw';
            case 'GIGACHAD': return 'Chad Aura';
            case 'BLITZ': return 'Storm Lightning';
            case 'MONKE': return 'Bananerang';
            case 'SIR_CHAD': return 'Giga Slash';
            case 'BOBERTO': return 'Ghost Summon';
            default: return 'Basic Attack';
        }
    }

    updateLoadoutUI() {
        this.consolidateInventory(); // Ensure no duplicates displayed
        if (!this.weaponListEl || !this.buffListEl) return;

        // Weapons
        const weaponLines = [];
        // Only show the "default" weapon label if it's literally your only weapon.
        const nonDefaultWeapons = this.weapons.filter(w => w !== 'DEFAULT');
        if (this.weapons.length === 1 && this.weapons[0] === 'DEFAULT') {
            weaponLines.push(this.getDefaultWeaponLabel());
        } else {
            nonDefaultWeapons.forEach(w => {
                const info = WEAPONS[w];
                const lvl = this.weaponLevels[w] || 1;
                if (info) {
                    weaponLines.push(`${info.name} [Lv${lvl}]`);
                } else {
                    weaponLines.push(`${w} [Lv${lvl}]`);
                }
            });
        }
        this.weaponListEl.innerHTML = weaponLines
            .map(text => `<div>${text}</div>`)
            .join('');

        // Buffs: runes + shrine upgrades
        const buffLines = [];
        this.runes.forEach(r => {
            const info = RUNES[r];
            const lvl = this.runeLevels[r] || 1;
            if (info) {
                buffLines.push(`${info.name} [Lv${lvl}]`);
            } else {
                buffLines.push(`${r} [Lv${lvl}]`);
            }
        });
        if (this.buffs && this.buffs.length) {
            this.buffs.forEach(name => buffLines.push(name));
        }
        this.buffListEl.innerHTML = buffLines
            .map(text => `<div>${text}</div>`)
            .join('');
    }

    showToast(message) {
        if (!this.toastEl) return;
        this.toastEl.textContent = message;
        this.toastEl.classList.add('show');
        
        // Spawn UI particles around toast
        const rect = this.toastEl.getBoundingClientRect();
        this.spawnUIParticles(15, rect.left + rect.width/2, rect.top + rect.height/2, '#00ffff');

        if (this.toastTimeout) {
            clearTimeout(this.toastTimeout);
        }
        this.toastTimeout = setTimeout(() => {
            this.toastEl.classList.remove('show');
        }, 1800);
    }

    levelUp() {
        // Hard cap at level 75
        if (this.level >= 75) {
            this.xp = 0;
            this.xpBar.style.width = '0%';
            return;
        }

        this.level++;
        this.xp = 0;

        if (this.level < 75) {
            // Smoother XP curve for long play
            this.xpToLevel = Math.ceil(14 * Math.pow(1.15, this.level - 1));
        } else {
            this.xpToLevel = Infinity;
        }

        this.levelDisplay.innerText = `LVL ${this.level}`;
        this.xpBar.style.width = '0%';
        
        // Confetti burst near camera when leveling
        // Actually emit particles near player mesh
        if (this.playerMesh && this.particleSystem) {
            const base = this.playerMesh.position.clone();
            base.y += 1.0;
            for (let i = 0; i < 40; i++) { 
                const offset = new THREE.Vector3(
                    (Math.random() - 0.5) * 2,
                    Math.random() * 2,
                    (Math.random() - 0.5) * 2
                );
                this.particleSystem.emit(base.clone().add(offset), 0xffd700, 20); // Gold
                this.particleSystem.emit(base.clone().add(offset), 0x00ffff, 20); // Cyan
            }
            this.playSound('boom', 1.5, 0.5);
        }
        
        // UI particles center screen
        this.spawnUIParticles(40, window.innerWidth/2, window.innerHeight/2, '#ffd700');
        
        // Also spawn a DOM element explosion if requested? 
        // User asked for "UI particles".
        // Let's stick to 3D world particles as they look better in WebGL.

        // Show upgrade choices only while you can still meaningfully level
        if (this.level <= 75) {
            this.showUpgradeMenu();
        }
    }
    
    canAddWeapon() {
        if (this.gameMode === 'AWAKENING' || this.infiniteSlots) return true;
        return this.weapons.length < this.maxWeapons;
    }
    
    canAddRune() {
        if (this.gameMode === 'AWAKENING' || this.infiniteSlots) return true;
        return this.runes.length < this.maxRunes;
    }
    
    spawnChest(position, cost = 0) {
        const terrainY = this.getTerrainHeight(position.x, position.z);
        
        const chest = new THREE.Group();
        const box = new THREE.Mesh(
            new THREE.BoxGeometry(1, 0.8, 0.8),
            new THREE.MeshStandardMaterial({ color: 0x8B4513, flatShading: true })
        );
        box.position.y = terrainY + 0.4;
        box.castShadow = true;
        chest.add(box);
        
        const lid = new THREE.Mesh(
            new THREE.BoxGeometry(1.1, 0.2, 0.9),
            new THREE.MeshStandardMaterial({ color: 0xFFD700, flatShading: true })
        );
        lid.position.y = terrainY + 0.9;
        lid.castShadow = true;
        chest.add(lid);
        
        chest.position.set(position.x, 0, position.z);
        this.scene.add(chest);
        if (!this.props) this.props = [];
        this.props.push(chest);
        
        // Generate random upgrade for this chest
        const allUpgrades = [...Object.keys(WEAPONS), ...Object.keys(RUNES)];
        const upgrade = allUpgrades[Math.floor(this.randomValue(0, allUpgrades.length))];
        
        // Store baseCost so we can recompute dynamic cost later.
        const baseCost = Math.max(1, cost | 0) || 6;

        // Create a simple 2D canvas label texture to show chest cost over the chest in-world
        const createCostSprite = (initialText) => {
            const canvas = document.createElement('canvas');
            canvas.width = 256;
            canvas.height = 64;
            const ctx = canvas.getContext('2d');
            ctx.font = 'bold 28px monospace';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillStyle = 'rgba(0,0,0,0.65)';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            ctx.fillStyle = '#ffd700';
            ctx.fillText(initialText, canvas.width / 2, canvas.height / 2);
            const tex = new THREE.CanvasTexture(canvas);
            tex.minFilter = THREE.LinearFilter;
            tex.magFilter = THREE.LinearFilter;
            const mat = new THREE.SpriteMaterial({ map: tex, transparent: true });
            const sprite = new THREE.Sprite(mat);
            sprite.scale.set(2.4, 0.6, 1);
            sprite.position.set(position.x, terrainY + 1.6, position.z);
            this.scene.add(sprite);

            return { sprite, canvas, ctx, tex };
        };

        const label = createCostSprite('COST: ?');

        this.chests.push({
            group: chest,
            position: new THREE.Vector3(position.x, terrainY, position.z),
            opened: false,
            baseCost: baseCost,
            upgrade: upgrade,
            lidMesh: lid,
            costLabel: label,
            _lastComputedCost: null,
            _lastPlayerCoins: null, // cache player's coins to avoid recomputing cost every frame
            cost: baseCost
        });
    }

    showUpgradeMenu() {
        this.consolidateInventory(); // Cleanup duplicates before showing menu

        // Juice: Particles from HUD center
        this.spawnUIParticles(30, window.innerWidth / 2, window.innerHeight / 2, '#ffd700');

        // Save current audio state so we can restore it if needed
        const prevGain = this.currentBgmGain ? this.currentBgmGain.gain.value : null;
        const prevRate = this.currentBgmNode ? this.currentBgmNode.playbackRate.value : null;

        // In multiplayer, do NOT pause the game loop (time keeps ticking)
        if (this.gameMode !== 'MULTI') {
            this.isPaused = true;
        }
        
        // Quiet & slow music
        if (this.currentBgmGain) this.currentBgmGain.gain.setTargetAtTime(0.15, this.audioCtx.currentTime, 0.1);
        if (this.currentBgmNode) this.currentBgmNode.playbackRate.setValueAtTime(0.5, this.audioCtx.currentTime);
        this.playSynth('levelup');

        this.upgradeMenu.classList.add('active');
        // Release pointer lock while menu is open
        if (document.exitPointerLock) {
            try { document.exitPointerLock(); } catch (e) {}
        }
        
        let options = [];
        
        // If we can add weapons, include them
        if (this.canAddWeapon()) {
            const weaponKeys = Object.keys(WEAPONS).filter(k => !this.weapons.includes(k));
            if (weaponKeys.length > 0) {
                const randomWeapon = weaponKeys[Math.floor(Math.random() * weaponKeys.length)];
                options.push({ key: randomWeapon, data: WEAPONS[randomWeapon] });
            }
        }
        
        // If we can add runes, include them
        if (this.canAddRune()) {
            const runeKeys = Object.keys(RUNES).filter(k => !this.runes.includes(k));
            if (runeKeys.length > 0) {
                const randomRune = runeKeys[Math.floor(Math.random() * runeKeys.length)];
                options.push({ key: randomRune, data: RUNES[randomRune] });
            }
        }
        
        // Add weapon upgrades for existing weapons - Infinite upgrades
        this.weapons.forEach(weaponKey => {
            if (weaponKey !== 'DEFAULT') {
                const weaponData = WEAPONS[weaponKey];
                options.push({ 
                    key: weaponKey, 
                    data: { 
                        name: `Upgrade ${weaponData.name}`, 
                        desc: `Level ${this.weaponLevels[weaponKey] || 1} → ${(this.weaponLevels[weaponKey] || 1) + 1}`,
                        type: 'weapon_upgrade'
                    }
                });
            }
        });
        
        // Add rune upgrades - Infinite upgrades
        this.runes.forEach(runeKey => {
            const runeData = RUNES[runeKey];
            options.push({ 
                key: runeKey, 
                data: { 
                    name: `Upgrade ${runeData.name}`, 
                    desc: `Level ${this.runeLevels[runeKey] || 1} → ${(this.runeLevels[runeKey] || 1) + 1}`,
                    type: 'rune_upgrade'
                }
            });
        });
        
        // Awakening Evolution Logic
        if (this.gameMode === 'AWAKENING' && !this.hasEvolved) {
            // Check for evolution conditions
            let potentialEvo = null;
            if (this.evolutionStats.health > 4 && this.characterKey !== 'GIGACHAD') potentialEvo = 'GIGACHAD';
            else if (this.evolutionStats.speed > 4 && this.characterKey !== 'MONKE' && this.characterKey !== 'CALCIUM') potentialEvo = Math.random() > 0.5 ? 'MONKE' : 'CALCIUM';
            else if (this.evolutionStats.offense > 4 && this.characterKey !== 'FOX' && this.characterKey !== 'BLITZ') potentialEvo = Math.random() > 0.5 ? 'FOX' : 'BLITZ';
            
            if (potentialEvo) {
                options.unshift({
                    key: 'EVOLVE_' + potentialEvo,
                    data: {
                        name: `EVOLVE: ${CHARACTERS[potentialEvo].name}`,
                        desc: `Transform into ${potentialEvo}! Changes base stats and model.`,
                        type: 'evolution',
                        targetChar: potentialEvo
                    }
                });
            }
        }

        // Select 3 random options
        const selected = [];
        // Force evolution option if present
        const evoOpt = options.find(o => o.key.startsWith('EVOLVE_'));
        if (evoOpt) {
            selected.push(evoOpt);
            options = options.filter(o => o !== evoOpt);
        }

        while (selected.length < 3 && options.length > 0) {
            const idx = Math.floor(Math.random() * options.length);
            selected.push(options.splice(idx, 1)[0]);
        }

        // If there is literally nothing left to upgrade, restore audio/pointerlock and close menu
        if (selected.length === 0) {
            this.upgradeMenu.classList.remove('active');

            // Restore audio state if we changed it
            if (this.currentBgmGain && prevGain !== null) this.currentBgmGain.gain.value = prevGain;
            if (this.currentBgmNode && prevRate !== null) this.currentBgmNode.playbackRate.value = prevRate;

            if (this.gameMode !== 'MULTI') this.isPaused = false;
            this.showToast('Build maxed out – no more upgrades!');

            // Try to re-acquire pointer lock so the player regains control
            try {
                if (this.renderer && this.renderer.domElement && this.renderer.domElement.requestPointerLock) {
                    const pl = this.renderer.domElement.requestPointerLock();
                    if (pl instanceof Promise) pl.catch(()=>{});
                }
            } catch (e) {}
            return;
        }
        
        this.upgradeOptions.innerHTML = '';
        selected.forEach(option => {
            const card = document.createElement('div');
            card.className = 'upgrade-card';
            card.innerHTML = `<h3>${option.data.name}</h3><p>${option.data.desc}</p>`;
            card.onclick = (e) => {
                // Juice: Particles from clicked card
                const rect = card.getBoundingClientRect();
                this.spawnUIParticles(20, rect.left + rect.width/2, rect.top + rect.height/2, '#00ff88');
                // Pass the correct upgrade key from the selected option
                this.selectUpgrade(option.key, option.data.type);
            };
            this.upgradeOptions.appendChild(card);
        });
    }

    selectUpgrade(key, type) {
        // Restore music
        if (this.currentBgmGain) this.currentBgmGain.gain.setTargetAtTime(0.35, this.audioCtx.currentTime, 0.1);
        if (this.currentBgmNode) this.currentBgmNode.playbackRate.setValueAtTime(1.0, this.audioCtx.currentTime);
        this.playSynth('ui');

        if (type === 'evolution') {
            const target = key.split('_')[1];
            this.evolveCharacter(target);
            this.upgradeMenu.classList.remove('active');
            if (this.gameMode !== 'MULTI') this.isPaused = false;
            return;
        }

        // Tracking for Awakening Evolution
        if (this.gameMode === 'AWAKENING') {
            // Classify upgrade
            if (['MAX_HEALTH', 'ARMOR_PLATE', 'REGEN_BONE', 'VAMPIRISM', 'ICE_AURA', 'SPIKE_RING', 'GIGACHAD'].some(k => key.includes(k))) this.evolutionStats.health++;
            if (['SPEED_BOOST', 'FIRE_RATE', 'CALCIUM', 'MONKE', 'BANANERANG'].some(k => key.includes(k))) this.evolutionStats.speed++;
            if (['DAMAGE', 'CRITICAL', 'PIERCING', 'FOX', 'BLITZ', 'FIREBALL', 'LIGHTNING'].some(k => key.includes(k))) this.evolutionStats.offense++;
        }

        if (WEAPONS[key] && type !== 'weapon_upgrade' && type !== 'rune_upgrade') {
            // Add new weapon
            this.weapons.push(key);
            this.weaponLevels[key] = 1;
            this.updateAuraOwnership();
        } else if (RUNES[key] && type !== 'weapon_upgrade' && type !== 'rune_upgrade') {
            // Add new rune
            this.runes.push(key);
            this.runeLevels[key] = 1;
            this.applyRune(key);
        } else if (type === 'weapon_upgrade') {
            // Upgrade weapon
            this.weaponLevels[key]++;
            
            // Check GigaChad Unlock (Level 3 Aura + Monke Unlocked)
            if (AURA_WEAPONS.includes(key) && this.weaponLevels[key] >= 3) {
                 try {
                     const saved = JSON.parse(localStorage.getItem('uberthump_unlocks') || '{}');
                     if (saved.MONKE) {
                         this.unlockCharacter('GIGACHAD');
                     }
                 } catch(e) {}
            }
            
            // Check Sir Chad Unlock (Level 5 Spinning Blade + GigaChad Unlocked)
            if (key === 'SWORD' && this.weaponLevels[key] >= 5) {
                 try {
                     const saved = JSON.parse(localStorage.getItem('uberthump_unlocks') || '{}');
                     if (saved.GIGACHAD) {
                         this.unlockCharacter('SIR_CHAD');
                     }
                 } catch(e) {}
            }
        } else if (type === 'rune_upgrade') {
            // Upgrade rune
            this.runeLevels[key]++;
            this.applyRune(key);
        }
        
        this.updateLoadoutUI();
        this.upgradeMenu.classList.remove('active');
        if (this.gameMode !== 'MULTI') this.isPaused = false;
    }

    evolveCharacter(newCharKey) {
        this.showToast(`Evolving to ${newCharKey}...`);
        this.characterKey = newCharKey;
        this.characterConfig = CHARACTERS[newCharKey];
        
        // Remove old mesh
        if (this.playerMesh) {
            this.scene.remove(this.playerMesh);
        }
        
        // Recreate with new model
        this.createPlayer();
        
        // Update base stats (additive, preserving rune buffs is hard without recalculating, 
        // so we'll just apply the new base and let runes stack on top implicitly via percentages next time stats calc?
        // Simpler: Just refresh stats from config and re-apply all runes.
        const baseFireRate = this.characterConfig.fireRate;
        const baseDamage = this.characterConfig.baseDamage;
        const baseMoveSpeed = this.characterConfig.moveSpeed;
        
        // Reset base stats
        this.stats.fireRate = baseFireRate;
        this.stats.damage = baseDamage;
        this.stats.moveSpeed = baseMoveSpeed;
        
        // Re-apply runes
        this.runes.forEach(r => {
            const lvl = this.runeLevels[r];
            // Re-run apply logic (careful with maxHealth, we don't want to double dip or lose HP)
            // For maxHealth, just leave it as is to avoid healing exploits or bugs.
            if (RUNES[r].stat !== 'maxHealth') {
                for(let i=0; i<lvl; i++) {
                    const rune = RUNES[r];
                    if (rune.mult) this.stats[rune.stat] *= rune.mult;
                    else if (rune.add) this.stats[rune.stat] += rune.add;
                }
            }
        });
        
        this.hasEvolved = true;
        this.playSound('unlock', 1.0, 0.5);
    }
    
    applyRune(key) {
        const rune = RUNES[key];
        const level = this.runeLevels[key];
        if (!rune || !level) return;

        // Special handling: maxHealth actually changes your real HP pool
        if (rune.stat === 'maxHealth') {
            const flatPerLevel = rune.add || 0;
            const multPerLevel = rune.mult ? (rune.mult - 1) : 0;

            const flatBonus = flatPerLevel * level;
            const multBonus = this.maxHealth * multPerLevel * level;
            const totalDelta = flatBonus + multBonus;

            if (totalDelta !== 0) {
                this.maxHealth += totalDelta;
                this.playerHealth = Math.min(this.playerHealth + totalDelta, this.maxHealth);

                if (this.healthBar) {
                    this.healthBar.style.width = (this.playerHealth / this.maxHealth * 100) + '%';
                }
                if (this.healthText) {
                    this.healthText.innerText = `${Math.floor(this.playerHealth)} / ${Math.floor(this.maxHealth)}`;
                }
            }

            return;
        }

        // Generic stat runes
        if (rune.mult) {
            this.stats[rune.stat] = (this.stats[rune.stat] || 1) * rune.mult;
        } else if (rune.add) {
            this.stats[rune.stat] = (this.stats[rune.stat] || 0) + rune.add;
        }
    }

    takeDamage(amount) {
        // God Mode for Pantheon Creative
        if (this.gameMode === 'PANTHEON' && this.pantheonState === 'CREATIVE') return;

        if (this.playerHealth <= 0) return;

        // Calcium loses all built-up speed when hit
        if (this.characterKey === 'CALCIUM') {
            this.calciumSpeedCharge = 0;
        }

        // Easy Mode: Reduce incoming damage by 75%
        amount *= 0.25;

        // Flat armor reduction from runes (capped so hits always do something)
        const armor = this.stats.armor || 0;
        const mitigated = Math.max(0, amount * (1 - Math.min(armor, 0.9)));
        amount = mitigated;

        // GigaChad flex: every flexCooldown seconds, ignore one hit
        if (this.characterKey === 'GIGACHAD' && this.characterConfig) {
            const cd = this.characterConfig.flexCooldown || 15;
            if (this.gameTime - this.lastFlexTime >= cd) {
                this.lastFlexTime = this.gameTime;
                this.spawnSlash(this.playerMesh.position.clone()); // visual flex burst
                this.showToast('GigaChad FLEX – no damage taken');
                return;
            }
        }

        this.playerHealth -= amount;
        this.healthBar.style.width = (this.playerHealth / this.maxHealth * 100) + '%';
        
        // Screen Shake
        this.screenShake = 0.4;
        this.playSound('boom', 2.0, 0.4);

        if (this.healthText) {
            this.healthText.innerText = `${Math.max(0, Math.floor(this.playerHealth))} / ${this.maxHealth}`;
        }

        if (this.playerHealth <= 0) {
            this.gameOver();
        }
    }

    updatePauseStats() {
        this.consolidateInventory();
        const container = document.getElementById('pause-stats');
        if (!container) return;
        
        let html = '<div style="color:#ffd700; border-bottom:1px solid #555; margin-bottom:6px;">STATS ESTIMATE</div>';
        
        // Crit info
        const critChance = Math.floor((this.stats.critChance || 0) * 100);
        html += `<div>Crit Chance: <span style="color:#ff8888">${critChance}%</span></div>`;
        html += `<div>Move Speed: <span style="color:#88ff88">${Math.floor(this.stats.moveSpeed * 100)}%</span></div>`;
        html += `<div>Armor: <span style="color:#aaaaff">${Math.floor((this.stats.armor || 0)*100)}%</span></div>`;
        html += `<br><div style="color:#00ffff; border-bottom:1px solid #555; margin-bottom:6px;">WEAPONS</div>`;

        // Weapons
        const baseDmgGlobal = this.stats.damage || 1;
        
        this.weapons.forEach(w => {
            const lvl = this.weaponLevels[w] || 1;
            let name = w;
            let desc = '';
            let baseDmg = 0;
            
            if (WEAPONS[w]) {
                name = WEAPONS[w].name;
            } else if (w === 'DEFAULT') {
                name = this.getDefaultWeaponLabel();
            }
            
            // Estimations based on updateWeapons logic
            if (w === 'DEFAULT') {
                if (this.characterKey === 'MMOOVT') {
                    baseDmg = 3.0 * baseDmgGlobal;
                    desc = `Slash Dmg: ~${Math.round(baseDmg)}`;
                } else if (this.characterKey === 'CALCIUM') {
                    baseDmg = 1.1 * baseDmgGlobal;
                    desc = `Bone Dmg: ~${Math.floor(baseDmg)}`;
                } else if (this.characterKey === 'FOX') {
                    baseDmg = 1.5 * baseDmgGlobal; // Fireball equivalent
                    desc = `Blast Dmg: ~${Math.floor(baseDmg)}`;
                } else {
                    baseDmg = baseDmgGlobal;
                    desc = `Dmg: ~${Math.floor(baseDmg)}`;
                }
            } else if (w === 'LIGHTNING') {
                baseDmg = 0.5 * lvl * baseDmgGlobal;
                desc = `Zap Dmg: ~${Math.floor(baseDmg)}`;
            } else if (w === 'FIREBALL') {
                baseDmg = 1.5 * baseDmgGlobal;
                desc = `Explosion: ~${Math.floor(baseDmg)}`;
            } else if (w === 'SWORD') {
                baseDmg = 5.0 * baseDmgGlobal; // dps
                desc = `DPS: ~${Math.max(1, Math.round(baseDmg))}`;
            } else if (w === 'MISSILE') {
                baseDmg = 1.0 * baseDmgGlobal;
                desc = `Impact: ~${Math.floor(baseDmg)}`;
            } else if (w === 'SPIKE_RING') {
                baseDmg = 1.5 * baseDmgGlobal * lvl;
                desc = `Pulse: ~${Math.floor(baseDmg)}`;
            } else if (w === 'POISON_MIST') {
                baseDmg = 0.9 * lvl * baseDmgGlobal * 5; // approx dps?
                desc = `Tick Dmg: ~${Math.floor(baseDmg/5)}`;
            } else {
                desc = `Lvl ${lvl}`;
            }
            
            html += `<div style="margin-bottom:4px;">
                <strong style="color:#eee">${name}</strong> <span style="color:#aaa; font-size:0.65rem;">(Lv${lvl})</span><br>
                <span style="color:#ddd">${desc}</span>
            </div>`;
        });

        container.innerHTML = html;
    }

    consolidateInventory() {
        // Weapons
        const uniqueW = [];
        const seenW = {};
        for (let i = 0; i < this.weapons.length; i++) {
            const w = this.weapons[i];
            if (seenW[w]) {
                this.weaponLevels[w] = (this.weaponLevels[w] || 1) + 1;
            } else {
                seenW[w] = true;
                uniqueW.push(w);
            }
        }
        this.weapons = uniqueW;

        // Runes
        const uniqueR = [];
        const seenR = {};
        for (let i = 0; i < this.runes.length; i++) {
            const r = this.runes[i];
            if (seenR[r]) {
                this.runeLevels[r] = (this.runeLevels[r] || 1) + 1;
            } else {
                seenR[r] = true;
                uniqueR.push(r);
            }
        }
        this.runes = uniqueR;
    }

    // Compute the dynamic chest cost based on a chest-baseline snapshot of player coins vs base chest price.
    // The baseline only updates when a chest is opened so kills (which increase current coins) won't immediately raise chest prices.
    // - baseCost: the nominal chest cost (e.g. 6)
    // - Scales with ratio = baselineCoins / baseCost.
    // - If player (baseline) has similar or fewer coins than chest, multiplier remains small (~1.2).
    // - If baseline has far more coins than chest, multiplier ramps toward maxMultiplier.
    // - Never reduces below baseCost (i.e. multiplier >= 1.0, and we enforce a visible floor of 1.2).
    computeChestCost(baseCost = 6) {
        try {
            // Use the snapshot baseline (updated only when a chest is opened).
            // Intentionally allow multiplier growth even when baseline < baseCost so chest prices
            // ramp up aggressively (less forgiving).
            const playerCoinsBaseline = Math.max(0, (typeof this.chestBaselineCoins === 'number') ? this.chestBaselineCoins : (this.coins || 0));
            
            // Use a ratio that acknowledges low baselines (adds 1 so ratio isn't zero)
            const ratio = (playerCoinsBaseline + 1) / Math.max(1, baseCost);

            // Harsher floor so even low baselines cause a visible increase
            const minMultiplier = 1.4;    
            const maxMultiplier = 10.0;    // increased cap so early growth can escalate
            const maxRatioForScale = 150.0; // scaling range
            const t = Math.min(ratio, maxRatioForScale) / maxRatioForScale; // 0..1

            // Softer easing but applied over broader range; ensures small baselines still push multiplier above floor.
            const eased = Math.pow(t, 0.55);
            const multiplier = minMultiplier + (maxMultiplier - minMultiplier) * eased;

            // Even when ratio < 1 we want multiplier >= minMultiplier
            const finalMult = Math.max(minMultiplier, multiplier);
            const cost = Math.max(baseCost, Math.ceil(baseCost * finalMult));

            return {
                cost,
                multiplier: finalMult
            };
        } catch (e) {
            return { cost: baseCost, multiplier: 1.0 };
        }
    }

    gameOver() {
        this.isPlaying = false;
        this.isPaused = true;
        if (document.exitPointerLock) document.exitPointerLock();

        // Duck the current BGM instead of stopping it completely
        // Lower volume to very low (0.05) and half speed (0.5)
        if (this.currentBgmNode && this.currentBgmGain) {
            try {
                const t = this.audioCtx.currentTime;
                // Duck volume to 0.05 (very low)
                this.currentBgmGain.gain.cancelScheduledValues(t);
                this.currentBgmGain.gain.setValueAtTime(this.currentBgmGain.gain.value, t);
                this.currentBgmGain.gain.linearRampToValueAtTime(0.05, t + 0.5);
                // Slow down to half speed
                this.currentBgmNode.playbackRate.setValueAtTime(this.currentBgmNode.playbackRate.value, t);
                this.currentBgmNode.playbackRate.linearRampToValueAtTime(0.5, t + 0.5);
            } catch(e) {
                // Fallback: just stop BGM if ducking fails
                this.stopBGM();
            }
        }

        // Play Game Over song at 50% volume, looping
        this.playGameOverMusic();

        const screen = document.getElementById('game-over-screen');
        const title = document.getElementById('go-title');
        const subtitle = document.getElementById('go-subtitle');
        const scoreEl = document.getElementById('go-score');
        const statsGrid = document.getElementById('go-stats-grid');
        const unlockCont = document.getElementById('unlocks-container');
        const historyList = document.getElementById('history-list');
        const mpAftermath = document.getElementById('mp-aftermath');
        const rays = document.getElementById('go-rays');
        const coins = document.getElementById('go-coins');

        screen.classList.add('active');
        if (rays) rays.style.display = 'none';
        if (coins) coins.innerHTML = '';

        // Calculate Score
        const timeScore = Math.floor(this.gameTime * 10);
        const killScore = this.kills * 50;
        const levelScore = this.level * 500;
        const totalScore = timeScore + killScore + levelScore;

        // Update basic UI
        const minutes = Math.floor(this.gameTime / 60);
        const seconds = Math.floor(this.gameTime % 60);
        const timeStr = `${minutes}:${seconds.toString().padStart(2, '0')}`;

        let isVictory = false;

        if (this.gameMode === 'MULTI') {
            const iWon = this.playerHealth > 0;
            const oppHp = this.remotePlayer ? this.remotePlayer.health : 0;
            isVictory = iWon && oppHp <= 0;
            
            if (title) {
                title.innerText = isVictory ? "VICTORY" : "DEFEAT";
                title.style.color = isVictory ? "#00ff88" : "#ff0044";
            }
            subtitle.innerText = isVictory ? "You dominated the arena!" : "Better luck next time.";
            
            if (mpAftermath) mpAftermath.style.display = 'block';
            this.setupChat();
        } else {
            if (title) {
                title.innerText = "GAME OVER";
                title.style.color = "#ff0044"; // Red text, but we'll add happy bg
            }
            subtitle.innerText = "The void consumed you.";
            if (mpAftermath) mpAftermath.style.display = 'none';
        }

        // Happy visuals for: Single Player Lose/Win OR Multiplayer Win
        // Multiplayer Lose gets sad screen (no rays)
        const showHappy = this.gameMode !== 'MULTI' || isVictory;

        if (showHappy) {
            if (rays) rays.style.display = 'block';
            this.spawnCoinRain();
        }

        // Animate score count up with audio
        let s = 0;
        const step = Math.ceil(totalScore / 50); // ~1.5 sec duration
        // We want a sound every ~10 score points in value, but we increment by `step` each frame.
        // Let's play sound every frame or every few frames.
        let frameCount = 0;
        
        const interval = setInterval(() => {
            s += step;
            if (s >= totalScore) {
                s = totalScore;
                clearInterval(interval);
                // Final Ding
                this.playSynth('unlock', 1.5, 0.8);
            }
            scoreEl.innerText = s.toLocaleString();
            
            // Play tick sound every frame
            this.playSynth('ui', 2.0, 0.1); 
        }, 30);

        // Stats
        statsGrid.innerHTML = `
            <div class="stat-item"><span>Time Survived</span><span>${timeStr}</span></div>
            <div class="stat-item"><span>Enemies Defeated</span><span>${this.kills}</span></div>
            <div class="stat-item"><span>Level Reached</span><span>${this.level}</span></div>
            <div class="stat-item"><span>Coins Collected</span><span>${this.coins}</span></div>
            <div class="stat-item"><span>Highest Damage</span><span>${Math.round(this.stats.damage * 10)}</span></div>
        `;

        // Process Unlocks
        unlockCont.innerHTML = '';
        if (this.pendingUnlocks && this.pendingUnlocks.length > 0) {
            const saved = JSON.parse(localStorage.getItem('uberthump_unlocks') || '{}');
            this.pendingUnlocks.forEach(key => {
                if (!saved[key]) {
                    saved[key] = true;
                    const name = CHARACTERS[key] ? CHARACTERS[key].name : key;
                    const badge = document.createElement('div');
                    badge.className = 'unlock-badge';
                    badge.innerText = `UNLOCKED: ${name}`;
                    unlockCont.appendChild(badge);
                }
            });
            localStorage.setItem('uberthump_unlocks', JSON.stringify(saved));
            this.playSound('levelup', 1.0, 0.8);
        }

        // Run History (Skip if Pantheon)
        if (this.gameMode !== 'PANTHEON') {
            const runData = { date: new Date().toLocaleDateString(), score: totalScore, char: CHARACTERS[this.characterKey].name };
            let history = [];
            try {
                const raw = localStorage.getItem('uberthump_history');
                history = raw ? JSON.parse(raw) : [];
                if (!Array.isArray(history)) history = [];
            } catch(e) { history = []; }
            
            history.unshift(runData);
            if (history.length > 10) history.pop();
            localStorage.setItem('uberthump_history', JSON.stringify(history));
        }

        // Secret lore note unlock handling
        if (this.runFoundSecretNote) {
            try {
                localStorage.setItem('uberthump_secret_note_unlocked', 'true');
            } catch(e) {}
            const badge = document.createElement('div');
            badge.className = 'unlock-badge';
            badge.innerText = 'FOUND: STRANGE NOTE (NEW LORE UNLOCKED)';
            unlockCont.appendChild(badge);

            // If the paper button exists (e.g. in menu), make sure it's visible next time
            const secretBtnTop = document.getElementById('secret-note-btn');
            if (secretBtnTop) secretBtnTop.style.display = 'inline-block';
        }

        // Display History
        const runHistEl = document.getElementById('run-history');
        runHistEl.style.display = 'block';
        historyList.innerHTML = '';
        
        // Safety: Ensure history loaded cleanly before mapping
        let history = [];
        try {
            history = JSON.parse(localStorage.getItem('uberthump_history') || '[]');
            if(!Array.isArray(history)) history = [];
        } catch(e) {}

        const bestScore = history.length > 0 ? Math.max(...history.map(h => h.score || 0)) : 0;
        
        history.forEach(h => {
            const div = document.createElement('div');
            div.className = 'history-entry' + (h.score === bestScore ? ' best' : '');
            div.innerHTML = `<span>${h.char}</span><span>${h.score.toLocaleString()}</span>`;
            historyList.appendChild(div);
        });
    }

    spawnCoinRain() {
        const container = document.getElementById('go-coins');
        if (!container) return;
        container.innerHTML = '';
        
        const count = 50;
        for (let i = 0; i < count; i++) {
            setTimeout(() => {
                if (!container.parentElement) return; // Check if screen closed
                const coin = document.createElement('div');
                coin.className = 'go-coin';
                coin.style.left = Math.random() * 100 + 'vw';
                coin.style.top = '-50px';
                coin.style.animationDuration = (2 + Math.random() * 3) + 's';
                container.appendChild(coin);
                
                // Cleanup
                setTimeout(() => coin.remove(), 5000);
            }, i * 100);
        }
    }

    setupChat() {
        const input = document.getElementById('mp-chat-input');
        const sendBtn = document.getElementById('mp-chat-send');
        const box = document.getElementById('mp-chat-box');
        
        const send = () => {
            let txt = input.value.trim();
            if (!txt) return;
            
            // Filter toxicity - simple remove
            const badWords = ['fuck', 'shit', 'bitch', 'ass', 'pussy', 'clanker', 'whore', 'cunt', 'nigger', 'faggot', 'retard', 'kys', 'kill yourself', 'die', 'fuq', 'f u c k', 's h i t'];
            // Normalize for check
            const norm = txt.toLowerCase().replace(/[^a-z0-9 ]/g, '');
            for (let bad of badWords) {
                if (norm.includes(bad.replace(/ /g,''))) {
                    // Toxic detected. Don't send.
                    input.value = "";
                    this.addChatMessage("System", "Message deleted for toxicity.", true);
                    return;
                }
            }
            
            this.room.send({ type: 'chat', text: txt, sender: this.room.peers[this.room.clientId].username });
            this.addChatMessage("Me", txt);
            input.value = "";
        };
        
        sendBtn.onclick = send;
        input.onkeydown = (e) => { if(e.key === 'Enter') send(); };
    }

    addChatMessage(author, text, isOpponent = false) {
        const box = document.getElementById('mp-chat-box');
        const d = document.createElement('div');
        d.className = 'chat-msg' + (isOpponent ? ' opponent' : ' me');
        if(author === 'System') d.className = 'chat-msg system';
        d.innerHTML = `<span class="author">${author}:</span> ${text.replace(/</g, "&lt;")}`;
        box.appendChild(d);
        box.scrollTop = box.scrollHeight;
    }

    winGame() {
        if (this.victoryTriggered) return; // Stop spam
        this.victoryTriggered = true;

        // TNS Logic: Finish Story Tier
        if (this.gameMode === 'TNS') {
            // Tier 4 Win -> Pantheon Unlock
            if (this.tnsTier === 4) {
                localStorage.setItem('uberthump_pantheon_unlocked', 'true');
                
                // Epic Portal Animation
                // Create giant portal encompassing map
                const giantPortal = new THREE.Mesh(new THREE.SphereGeometry(300, 32, 32), new THREE.MeshBasicMaterial({color:0x000000, side:THREE.BackSide}));
                this.scene.add(giantPortal);
                
                this.showToast("THE CYCLE IS BROKEN!");
                this.playSound('boom', 0.2, 1.0);
                
                setTimeout(() => {
                    alert("CONGRATULATIONS! PANTHEON MODE UNLOCKED.");
                    // Clear save
                    try {
                        const saves = JSON.parse(localStorage.getItem('uberthump_tns_saves') || '[null,null,null]');
                        const slot = this.lobbySettings.tnsSlot;
                        if(slot !== undefined && slot !== null) {
                            saves[slot] = null; // Completed
                            localStorage.setItem('uberthump_tns_saves', JSON.stringify(saves));
                        }
                    } catch(e) { console.error(e); }
                    window.location.reload();
                }, 4000);
                return;
            }

            const nextTier = this.tnsTier + 1;
            this.showToast(`TIER ${this.tnsTier} COMPLETE! SAVING...`);
            this.playSound('unlock', 1.0, 1.0);
            
            // Save Progress to Slot
            const slot = this.lobbySettings.tnsSlot;
            if (slot !== undefined && slot !== null) {
                try {
                    const saves = JSON.parse(localStorage.getItem('uberthump_tns_saves') || '[null,null,null]');
                    saves[slot] = {
                        tier: nextTier,
                        character: this.characterKey,
                        weapons: this.weapons,
                        runes: this.runes,
                        weaponLevels: this.weaponLevels,
                        runeLevels: this.runeLevels,
                        // Save Progression
                        level: this.level,
                        xp: this.xp,
                        xpToLevel: this.xpToLevel,
                        coins: this.coins,
                        kills: this.kills,
                        evolutionStats: this.evolutionStats,
                        savedStats: true // marker to reload stats
                    };
                    localStorage.setItem('uberthump_tns_saves', JSON.stringify(saves));
                    console.log(`TNS Progress Saved: Slot ${slot}, Tier ${nextTier}`);
                } catch(e) {
                    console.error("Failed to save TNS progress", e);
                    alert("Error saving progress! Check console.");
                }
            } else {
                console.error("TNS Win: No slot defined!", this.lobbySettings);
            }
            
            setTimeout(() => {
                window.location.reload(); // Return to menu
            }, 2500);
            return;
        }

        // Prevent re-entrancy: if a tier transition is already running, ignore subsequent triggers.
        if (this._tierTransitioning) return;
        this._tierTransitioning = true;

        // Wait sequence for "Generating Chaos"
        const loadingOverlay = document.getElementById('loading-overlay');
        if (loadingOverlay) loadingOverlay.classList.add('active');

        setTimeout(() => {
            this._finishWin();
            if (loadingOverlay) loadingOverlay.classList.remove('active');
            // ensure we clear the transitioning flag in case _finishWin returned early
            // (but _finishWin also clears it at the end)
            if (this._tierTransitioning) this._tierTransitioning = false;
        }, 2500);
    }
    
    _finishWin() {
        try { this.stopBGM(); } catch (e) {}
        this.tier++;
        
        // Unlock Multiplayer immediately upon beating Tier 1
        if (this.tier === 2) {
            localStorage.setItem('uberthump_multiplayer_unlocked', 'true');
            this.showToast("MULTIPLAYER MODE UNLOCKED!");
            this.playSound('unlock', 1.0, 1.0);
        }

        // Reset runtime objectives for the new tier so the UI restarts fresh
        this._objectives = undefined;

        // Reset Fog for new map
        if (this.fogCtx) {
            this.fogCtx.fillStyle = 'black';
            this.fogCtx.fillRect(0, 0, this.fogResolution, this.fogResolution);
        }
        this.showToast(`Entering Tier ${this.tier} - ENDLESS MODE!`);

        // Reset run timer so next tier starts fresh
        this.gameTime = 0;
        this.updateTimer();

        // Reset spawn pacing to sane defaults for the next tier (prevent explosive spawn ramp-ups)
        this.ghostSpawnRate = 1.0;
        this.spawnRateMultiplier = 1.0;
        this.spawnTimer = 0;
        this.ghostSpawnTimer = 0;
        this.bobSpawnTimer = 0;
        // Clear boss state and enemies from previous tier
        this.bossPortalActivated = false;
        this.bossEnemy = null;
        this.victoryTriggered = false; // Reset trigger for next tier

        // Remove old boss portal mesh if present
        if (this.bossPortal) {
            try { this.scene.remove(this.bossPortal.mesh); } catch(e){}
            this.bossPortal = null;
        }

        // Ensure any boss arena seal is removed when transitioning tiers/winning
        if (this.bossArena) {
            try {
                if (this.bossArena.mesh) this.scene.remove(this.bossArena.mesh);
            } catch (e) {}
            this.bossArena = null;
        }

        // Reset overtime/lava
        this.overtimeActive = false;
        this.lavaHeight = 0;
        
        this.updateObjectives();

        // Thorough cleanup of previous scene and physics so the new map won't overlap and cause clipping
        try { 
            // Always call clearWorld to aggressively free previous terrain, ramps, enemies, bodies and visuals
            if (typeof this.clearWorld === 'function') {
                this.clearWorld();
            } else {
                // Fallback safety: attempt to remove many common tracked objects
                this.enemies.forEach(e => { try { if (e.body) this.world.removeBody(e.body); } catch(e){}; try { if (e.mesh) this.scene.remove(e.mesh); } catch(e){}; });
                (this.projectiles||[]).forEach(p => { try { if (p.mesh) this.scene.remove(p.mesh); } catch(e){}; });
                (this.chests||[]).forEach(c => { try { if (c.group) this.scene.remove(c.group); } catch(e){}; });
                (this.turrets||[]).forEach(t => { try { if (t.mesh) this.scene.remove(t.mesh); } catch(e){}; });
                Object.values(this.auraVisuals||{}).forEach(av => { try { if (av.parent) av.parent.remove(av); else this.scene.remove(av); } catch(e){}; });
            }
        } catch(e){}

        // Recreate physics world to ensure no stale bodies remain
        try {
            this.world = new CANNON.World();
            this.world.gravity.set(0, -40, 0);
        } catch(e){}

        // Rebuild scene content / terrain
        // Some helper arrays reset inside createWorld
        this.createWorld();

        // Create the inactive boss portal landmark for the new tier
        this.createBossPortal();
        this.updateObjectives();

        // Trigger intro animation to mask transition
        this.startIntro();

        // Slightly recolor sky for tier variation
        const r = Math.random();
        const g = Math.random();
        const b = Math.random();
        this.scene.background = new THREE.Color(r, g, b);
        this.scene.fog.color = new THREE.Color(r, g, b);
    }

    reset(newCharacterKey) {
        this.gameTime = 0;
        this.kills = 0;
        this.level = 1;
        this.xp = 0;
        this.xpToLevel = 20;
        // Reset runtime objectives when resetting the run
        this._objectives = undefined;
        
        // Reset Fog
        if (this.fogCtx) {
            this.fogCtx.fillStyle = 'black';
            this.fogCtx.fillRect(0, 0, this.fogResolution, this.fogResolution);
        }

        // Allow changing character between runs
        if (newCharacterKey && CHARACTERS[newCharacterKey]) {
            this.characterKey = newCharacterKey;
        }

        // Reset character config based on current character key
        this.characterConfig = CHARACTERS[this.characterKey] || CHARACTERS.MMOOVT;
        this.playerHealth = this.characterConfig.maxHealth;
        this.maxHealth = this.characterConfig.maxHealth;
        this.coins = 0;

        const baseFireRate = this.characterConfig.fireRate;
        const baseDamage = this.characterConfig.baseDamage;
        const baseMoveSpeed = this.characterConfig.moveSpeed;

        this.stats = {
            projectileSpeed: 1,
            fireRate: baseFireRate,
            damage: baseDamage,
            moveSpeed: baseMoveSpeed,
            pickupRange: 8,
            attackRange: 15,
            extraProjectiles: 0,
            luck: 0,
            vampirism: 0,
            piercing: 0,
            critChance: 0,

            armor: 0,
            regen: 0,
            lavaResist: 0,
            xpGain: 1,
            areaMult: 1
        };

        this.weapons = ['DEFAULT'];
        if (this.characterConfig && Array.isArray(this.characterConfig.startingWeapons)) {
            this.weapons.push(...this.characterConfig.startingWeapons);
        }
        this.maxWeapons = 3;
        this.runes = [];
        this.maxRunes = 4;
        this.weaponLevels = { DEFAULT: 1 };
        this.runeLevels = {};
        this.weaponTimers = {};
        this.ghosts = [];
        this.orbitingBlades = [];
        this.buffs = [];
        this.turrets = [];
        this.skeletonKills = 0;
        this.enemies.forEach(e => {
            this.world.removeBody(e.body);
            this.scene.remove(e.mesh);
        });
        this.enemies = [];

        this.projectiles.forEach(p => this.scene.remove(p.mesh));
        this.projectiles = [];

        this.xpOrbs.forEach(orb => orb.destroy(this.scene));
        this.xpOrbs = [];

        this.slashes.forEach(s => this.scene.remove(s.mesh));
        this.slashes = [];

        // Rebuild player model/body for the newly selected character
        if (this.playerMesh) {
            this.scene.remove(this.playerMesh);
        }
        this.createPlayer();

        this.playerBody.allowSleep = false;

        this.updateAuraOwnership();

        this.healthBar.style.width = '100%';
        if (this.healthText) {
            this.healthText.innerText = `${this.playerHealth} / ${this.maxHealth}`;
        }
        this.levelDisplay.innerText = 'LVL 1';
        this.xpBar.style.width = '0%';
        this.updateUI();
        this.gameTime = 0;
        this.updateTimer();
        this.updateLoadoutUI();

        if (this.bossPortal) {
            this.scene.remove(this.bossPortal.mesh);
            this.bossPortal = null;
        }
        // Create the portal structure on reset (inactive state)
        this.createBossPortal();
        
        // Clear any lingering tracked main boss id when transitioning tiers
        this.currentMainBossId = null;
        
        this.updateObjectives();

        this.isPaused = false;
        this.isPlaying = false;

        // Restart BGM and play the intro walk-out every run
        this.startBGM();
        this.startIntro();
    }

    updatePlayerAnimation(dt, isMoving) {
        // Calcium rides the board – no walk cycle animation
        if (this.characterKey === 'CALCIUM') return;
        
        // Boberto is just a sheet, but has legs. Animate legs only.
        // Handled by generic limb check below.

        if (!this.playerLimbs) return;

        const { armL, armR, legL, legR } = this.playerLimbs;

        if (isMoving) {
            let speedFactor = 2.0;
            let armAmp = 0.4;
            let legAmp = 0.6;
            
            // GigaChad Swagger
            if (this.characterKey === 'GIGACHAD') {
                speedFactor = 1.0; // Slow, deliberate
                armAmp = 0.8; // Big arm swings
            }

            this.playerWalkTime += dt * speedFactor;
            const phase = this.playerWalkTime * 4; 
            const swing = Math.sin(phase);
            const swingOpp = Math.sin(phase + Math.PI);

            if (armL && armR) {
                // GigaChad arms swing wider and maybe slightly outward
                if (this.characterKey === 'GIGACHAD') {
                    armL.rotation.z = -0.3; // Flared lats
                    armR.rotation.z = 0.3;
                }
                armL.rotation.x = swing * armAmp;
                armR.rotation.x = swingOpp * armAmp;
            }
            if (legL && legR) {
                legL.rotation.x = swingOpp * legAmp;
                legR.rotation.x = swing * legAmp;
            }
        } else {
            // Smoothly return limbs to neutral when idle
            const damp = Math.min(1, dt * 10);
            if (armL) armL.rotation.x *= (1 - damp);
            if (armR) armR.rotation.x *= (1 - damp);
            if (legL) legL.rotation.x *= (1 - damp);
            if (legR) legR.rotation.x *= (1 - damp);
        }
    }

    updatePlayer(dt) {
        // Flight Logic (Pantheon) - Only in Creative State
        if (this.gameMode === 'PANTHEON' && this.pantheonState === 'CREATIVE') {
            // Check double jump for flight toggle
            if (this.keys.space && !this.prevSpace) {
                const now = performance.now();
                if (now - this.lastSpaceTime < 300) {
                    this.isFlying = !this.isFlying;
                    this.showToast(this.isFlying ? "Flight Enabled" : "Flight Disabled");
                    this.playerBody.velocity.set(0,0,0);
                }
                this.lastSpaceTime = now;
            }
            this.prevSpace = this.keys.space;
            
            if (this.isFlying) {
                // Override physics
                this.playerBody.velocity.set(0,0,0);
                this.playerBody.mass = 0; // prevent gravity
                
                let speed = 20;
                // Move based on camera dir
                const dir = new THREE.Vector3();
                this.camera.getWorldDirection(dir);
                const side = new THREE.Vector3().crossVectors(dir, new THREE.Vector3(0,1,0)).normalize();
                
                // W/S move fwd/back relative to camera flat
                const flatFwd = new THREE.Vector3(dir.x, 0, dir.z).normalize();
                
                if (this.keys.w) this.playerBody.position.vadd(new CANNON.Vec3(flatFwd.x*speed*dt, 0, flatFwd.z*speed*dt), this.playerBody.position);
                if (this.keys.s) this.playerBody.position.vsub(new CANNON.Vec3(flatFwd.x*speed*dt, 0, flatFwd.z*speed*dt), this.playerBody.position);
                if (this.keys.d) this.playerBody.position.vadd(new CANNON.Vec3(side.x*speed*dt, 0, side.z*speed*dt), this.playerBody.position);
                if (this.keys.a) this.playerBody.position.vsub(new CANNON.Vec3(side.x*speed*dt, 0, side.z*speed*dt), this.playerBody.position);
                
                // Space Up, Shift/Ctrl Down
                if (this.keys.space) this.playerBody.position.y += speed * dt;
                // Since we don't track Ctrl explicitly in this.keys, assume logic handles it or check event.
                // Actually update key listener to track Ctrl? Or just reuse another key? 
                // User said "hold ctrl". We need to add ctrl to key listener.
                if (this.keys.ctrl) this.playerBody.position.y -= speed * dt;
                
                // Land if touching ground
                const h = this.getTerrainHeight(this.playerBody.position.x, this.playerBody.position.z);
                if (this.playerBody.position.y < h + 1.0) {
                    this.isFlying = false;
                    this.showToast("Landed");
                }
                
                // Sync
                this.playerMesh.position.copy(this.playerBody.position);
                this.playerMesh.position.y -= 1.0; // Visual fix
                
                // Look
                this.cameraRotation -= this.mouseMovement.x * 0.002;
                this.cameraPitch = Math.max(-1.5, Math.min(1.5, this.cameraPitch + this.mouseMovement.y * 0.002));
                this.mouseMovement.x = 0; this.mouseMovement.y = 0;
                
                // Sync rotation
                this.playerMesh.rotation.y = this.cameraRotation;
                
                // Skip rest of normal physics
                this.updateCamera();
                return;
            } else {
                // Restore mass if needed
                // Cannon doesn't dynamic mass change easily, assume we manually handle gravity in normal loop anyway
                // Normal loop does manual gravity integration below.
            }
        }

        // Update Fog of War
        const fogX = (this.playerBody.position.x + 300) / 600 * this.fogResolution;
        const fogY = (this.playerBody.position.z + 300) / 600 * this.fogResolution;
        
        // Clear fog at player pos
        if (this.fogCtx) {
            this.fogCtx.globalCompositeOperation = 'destination-out';
            this.fogCtx.beginPath();
            this.fogCtx.arc(fogX, fogY, 40, 0, Math.PI * 2);
            this.fogCtx.fill();
            this.fogCtx.globalCompositeOperation = 'source-over';
        }

        // Update camera rotation from mouse
        this.cameraRotation -= this.mouseMovement.x * 0.002;
        // Non-inverted vertical look (moving mouse up looks up)
        // Loosen vertical clamp so player can look farther up and down without over-rotating.
        // Allow a wider pitch range but still prevent full 360 inversion.
        this.cameraPitch = Math.max(
            -0.6, // allow looking further upward
            Math.min(1.6, this.cameraPitch + this.mouseMovement.y * 0.002) // allow looking further downward
        );
        this.mouseMovement.x = 0;
        this.mouseMovement.y = 0;

        // Manual gravity + vertical integration (player is no longer in the physics world)
        this.playerBody.velocity.y -= 40 * dt;
        this.playerBody.position.y += this.playerBody.velocity.y * dt;

        let ix = 0, iz = 0;
        
        // Keyboard
        if (this.keys.w) iz -= 1;
        if (this.keys.s) iz += 1;
        if (this.keys.a) ix -= 1;
        if (this.keys.d) ix += 1;

        // Controller support
        const gamepads = navigator.getGamepads ? navigator.getGamepads() : [];
        if (gamepads[0]) {
            const gp = gamepads[0];
            // Left stick for movement
            if (Math.abs(gp.axes[0]) > 0.1) ix = gp.axes[0];
            if (Math.abs(gp.axes[1]) > 0.1) iz = gp.axes[1];
            
            // Right stick for camera
            if (Math.abs(gp.axes[2]) > 0.1) this.mouseMovement.x -= gp.axes[2] * 20;
            if (Math.abs(gp.axes[3]) > 0.1) this.mouseMovement.y += gp.axes[3] * 20;

            // Buttons: A (0) for Jump, RT/RB for attack if manual?
            if (gp.buttons[0].pressed) this.keys.space = true;
            
            // Manual attacks for Knight/Calcium
            if ((gp.buttons[7] && gp.buttons[7].pressed) || (gp.buttons[5] && gp.buttons[5].pressed)) {
                 if (this.characterKey === 'MMOOVT') this.knightSlash();
                 else if (this.characterKey === 'CALCIUM') this.throwBone();
            }
        }
        
        if (this.moveVector.lengthSq() > 0.01) {
            ix = this.moveVector.x;
            iz = this.moveVector.y;
        }

        let speed = 4.2 * this.stats.moveSpeed;
        if (this.characterKey === 'FOX') {
            speed *= 1.15;
        } else if (this.characterKey === 'GIGACHAD') {
            // Slightly reduce the extra slowdown so GigaChad moves with a confident swagger
            // (was 0.85 before; 0.95 keeps him deliberate but noticeably more mobile)
            speed *= 0.95;
        }

        // Smooth, controlled speed build-up for Calcium (no crazy launch when stopping)
        let hasInput = false;
        if (this.moveVector.lengthSq() > 0.01) {
            hasInput = true;
        } else if (this.keys.w || this.keys.a || this.keys.s || this.keys.d) {
            hasInput = true;
        }

        if (this.characterKey === 'CALCIUM') {
            if (hasInput) {
                // Builds speed the longer you keep moving without getting hit
                this.calciumSpeedCharge = Math.min(1.5, this.calciumSpeedCharge + dt * 0.6);
            } else {
                // Lose charge fairly quickly when you stop
                this.calciumSpeedCharge = Math.max(0, this.calciumSpeedCharge - dt * 1.2);
            }
            // Big speed boost so Calcium really feels faster over time
            const boost = 1 + this.calciumSpeedCharge * 0.6;
            speed *= boost;
        }
        if (ix !== 0 || iz !== 0) {
            const len = Math.sqrt(ix * ix + iz * iz);
            ix /= len;
            iz /= len;
            
            // Apply camera rotation to movement
            const cos = Math.cos(this.cameraRotation);
            const sin = Math.sin(this.cameraRotation);
            const rotatedX = ix * cos + iz * sin;
            const rotatedZ = -ix * sin + iz * cos;
            
            // Directly control horizontal velocity
            this.playerBody.velocity.x = rotatedX * speed;
            this.playerBody.velocity.z = rotatedZ * speed;
            
            let angle = Math.atan2(rotatedX, rotatedZ);
            // Calcium stands sideways on the board relative to movement
            if (this.characterKey === 'CALCIUM') {
                angle += Math.PI / 2;
            }
            const q = new THREE.Quaternion().setFromAxisAngle(
                new THREE.Vector3(0, 1, 0),
                angle
            );
            this.playerMesh.quaternion.slerp(q, 0.1);
        } else {
            // Gentle damping when no input
            this.playerBody.velocity.x *= 0.9;
            this.playerBody.velocity.z *= 0.9;
        }

        // Calcium boost is now baked directly into the speed calculation above,
        // so no extra per-frame velocity scaling here (prevents runaway launching).
        if (this.characterKey === 'CALCIUM') {
            // Nothing here on purpose – movement is handled via the speed boost.
        }

        // Apply horizontal velocity to position
        this.playerBody.position.x += this.playerBody.velocity.x * dt;
        this.playerBody.position.z += this.playerBody.velocity.z * dt;

        // Lava Shader Update
        if (this.lavaMaterial) {
            this.lavaMaterial.uniforms.time.value += dt;
        }

        // Very simple collision against world props so you don't walk through trees/rocks
        const px = this.playerBody.position.x;
        const pz = this.playerBody.position.z;
        const playerR = this.playerRadius * 0.7;

        for (const ob of this.obstacles) {
            if (ob.type === 'sphere' || ob.type === 'cylinder') {
                const dx = px - ob.x;
                const dz = pz - ob.z;
                const dist = Math.sqrt(dx * dx + dz * dz);
                const minDist = playerR + ob.radius;
                if (dist < minDist && dist > 0.0001) {
                    const push = (minDist - dist) + 0.01;
                    const nx = dx / dist;
                    const nz = dz / dist;
                    this.playerBody.position.x += nx * push;
                    this.playerBody.position.z += nz * push;
                }
            } else if (ob.type === 'box') {
                const dx = px - ob.x;
                const dz = pz - ob.z;
                const overlapX = ob.halfExtents.x + playerR - Math.abs(dx);
                const overlapZ = ob.halfExtents.z + playerR - Math.abs(dz);
                if (overlapX > 0 && overlapZ > 0) {
                    if (overlapX < overlapZ) {
                        this.playerBody.position.x += (dx > 0 ? overlapX : -overlapX);
                    } else {
                        this.playerBody.position.z += (dz > 0 ? overlapZ : -overlapZ);
                    }
                }
            }
        }

        // Improved Collision Handling: Stop at walls (flat platforms)
        // Check collision against terrain pieces
        const pRad = this.playerRadius * 0.8;
        const pPos = this.playerBody.position;
        const pY = pPos.y - this.playerRadius; // Feet Y

        for (let p of this.terrainPieces) {
            // Simple AABB check for horizontal overlap
            const halfW = (p.width || 20) / 2 + pRad;
            const halfD = (p.depth || 20) / 2 + pRad;
            
            const dx = pPos.x - p.x;
            const dz = pPos.z - p.z;
            
            if (Math.abs(dx) < halfW && Math.abs(dz) < halfD) {
                // We are horizontally intersecting this platform.
                // Check if we are "inside" it (hitting the side wall) or "on top" of it.
                // If feet are significantly below platform top, it's a wall.
                
                const platTop = p.height || 0;
                // Allow step up of 1.2 units
                if (pY < platTop - 1.2) {
                    // MONKE BUFF: Climb walls instead of blocking
                    if (this.characterKey === 'MONKE') {
                        // Check if we are actually pressing towards the wall
                        // Simple approximation: lift if colliding
                        this.playerBody.velocity.y = 12;
                        continue; 
                    }

                    // We hit a wall. Resolve collision by pushing out nearest axis.
                    const penX = halfW - Math.abs(dx);
                    const penZ = halfD - Math.abs(dz);
                    
                    if (penX < penZ) {
                        // Push X
                        pPos.x += dx > 0 ? penX : -penX;
                        this.playerBody.velocity.x = 0;
                    } else {
                        // Push Z
                        pPos.z += dz > 0 ? penZ : -penZ;
                        this.playerBody.velocity.z = 0;
                    }
                }
            }
        }

        // Additional ramp-side blocking: prevent walking through ramp walls by testing ramp local bounds
        for (let r of this.ramps) {
            // Translate world position into ramp-local coordinates
            const dx = pPos.x - r.x;
            const dz = pPos.z - r.z;
            const cos = Math.cos(-r.yaw);
            const sin = Math.sin(-r.yaw);
            const localX = dx * cos + dz * sin;
            const localZ = -dx * sin + dz * cos;

            const halfW = r.width / 2 + pRad + 0.25; // small padding
            const halfL = r.length / 2 + pRad + 0.25;

            if (Math.abs(localX) <= halfW && localZ >= -halfL && localZ <= halfL) {
                // Point lies within ramp footprint; compute ramp surface height at this localZ
                const t = (localZ + r.length / 2) / r.length;
                const rampH = r.fromHeight + t * (r.toHeight - r.fromHeight);

                // If player's feet are below the ramp surface by a margin, we are colliding the ramp side/wall.
                // Consider "platTop" as rampH for comparison.
                if (pY < rampH - 0.6) {
                    // MONKE can climb steep ramp sides
                    if (this.characterKey === 'MONKE') {
                        this.playerBody.velocity.y = 12;
                        continue;
                    }

                    // Push out horizontally along the local X axis to the nearest edge
                    // Clamp push amount to prevent massive teleportation if deeply inside
                    let pushAmount = halfW - Math.abs(localX) + 0.05;
                    if (pushAmount > 2.0) pushAmount = 2.0; // Limit correction per frame

                    const signX = localX >= 0 ? 1 : -1;
                    // Convert local push back to world space using yaw rotation
                    const worldPushX = signX * pushAmount * cos;
                    const worldPushZ = signX * pushAmount * -sin;

                    pPos.x += worldPushX;
                    pPos.z += worldPushZ;
                    
                    // Kill horizontal velocity to prevent sticking/rubbing accumulation
                    // Project velocity onto the ramp wall plane (remove normal component)
                    // Ramp side normal is roughly local X axis rotated by yaw.
                    const normX = signX * cos;
                    const normZ = signX * -sin;
                    const dot = this.playerBody.velocity.x * normX + this.playerBody.velocity.z * normZ;
                    if (dot < 0) { // Only remove velocity moving INTO the wall
                        this.playerBody.velocity.x -= dot * normX;
                        this.playerBody.velocity.z -= dot * normZ;
                    }
                }
            }
        }

        // Grounding based on terrain height (keep capsule firmly on top of surfaces)
        // Pass current foot position (y - radius) so getTerrainHeight can filter overhead platforms
        const currentFeetY = this.playerBody.position.y - this.playerRadius;
        const terrainHeight = this.getTerrainHeight(
            this.playerBody.position.x,
            this.playerBody.position.z,
            currentFeetY
        );
        const radius = this.playerRadius;
        
        const groundY = terrainHeight + radius;
        const diffY = groundY - this.playerBody.position.y;

        // Ground snapping logic
        // We only snap up if the target ground is close enough above/below.
        // The getTerrainHeight filter handles ceilings, but we still check diffY logic for smoothness.
        
        const snapThreshold = 1.8; // Max step up/down distance to snap
        if (Math.abs(diffY) < snapThreshold) {
             // We are close to a valid ground surface
             
             // If sinking into ground
            if (this.playerBody.position.y < groundY - 0.05) {
                // Hard snap up to prevent falling through
                this.playerBody.position.y = groundY;
                if (this.playerBody.velocity.y < 0) {
                    this.playerBody.velocity.y = 0;
                }
            } else if (diffY > 0.001) {
                // Step up smoothly
                const stepSpeed = 20; 
                const step = Math.min(diffY, stepSpeed * dt);
                this.playerBody.position.y += step;
                // Kill downward velocity if stepping up
                if (this.playerBody.velocity.y < 0) {
                    this.playerBody.velocity.y = 0;
                }
            }
        }

        // Consider grounded when close to ground and not moving fast vertically
        const nearGround = Math.abs(diffY) < 0.2 && Math.abs(this.playerBody.velocity.y) < 5.0;
        this.canJump = nearGround;

        // If we're basically on the ground, kill vertical drift completely
        if (nearGround) {
            this.playerBody.velocity.y = 0;
            this.playerBody.position.y = groundY;
        }

        // Generic dirt trail when moving on solid ground
        const horizSpeed = Math.hypot(this.playerBody.velocity.x, this.playerBody.velocity.z);
        if (nearGround && horizSpeed > 1.2 && this.particleSystem) {
            const dustPos = this.playerMesh.position.clone();
            dustPos.y = terrainHeight + 0.05;
            this.particleSystem.emit(dustPos, 0x8b5a2b, 3);
        }

        // Jump handling: apply an upward impulse; support one mid-air double jump.
        // canJump is set based on nearGround above; space is our jump key.
        if (this.keys.space) {
            // If grounded -> normal jump and allow a mid-air double jump
            if (this.canJump) {
                let jumpStrength = 16;
                if (this.characterKey === 'GIGACHAD' || this.characterKey === 'SIR_CHAD') {
                    jumpStrength = 14;
                }
                this.playerBody.velocity.y = jumpStrength;
                this.canJump = false;
                // After first jump, allow one double jump while airborne
                this.doubleJumpAvailable = true;
            }
            // If not grounded and double jump available -> perform double jump
            else if (!this.canJump && this.doubleJumpAvailable) {
                let djStrength = 14;
                // Slightly alter double-jump power per character
                if (this.characterKey === 'CALCIUM') djStrength = 16; // Calcium gets a snappier double
                if (this.characterKey === 'MONKE') djStrength = 18; // Monke gets a higher second jump
                if (this.characterKey === 'GIGACHAD' || this.characterKey === 'SIR_CHAD') djStrength = 13;
                this.playerBody.velocity.y = djStrength;
                this.doubleJumpAvailable = false; // consume double jump
                // Small visual/particle feedback for double jump
                if (this.particleSystem && this.playerMesh) {
                    const pos = this.playerMesh.position.clone();
                    pos.y += 0.5;
                    this.particleSystem.emit(pos, 0xffffff, 8);
                }
            }
        }

        // Sync visual with kinematic "body"
        // Use the per-character offset calculated in createPlayer
        const yOffset = this.playerMesh.userData.verticalOffset || 0.1;
        
        this.playerMesh.position.set(
            this.playerBody.position.x,
            this.playerBody.position.y - this.playerRadius + 1.0 + yOffset,
            this.playerBody.position.z
        );

        // Walk / ride animation based on horizontal speed
        this.updatePlayerAnimation(dt, horizSpeed > 0.5);

        // Calcium skateboard dust trail when moving on the ground
        if (this.characterKey === 'CALCIUM' && horizSpeed > 1.0 && Math.abs(this.playerBody.position.y - groundY) < 0.2) {
            this.calciumDustTimer += dt;
            if (this.calciumDustTimer >= 0.03) {
                this.calciumDustTimer = 0;
                const dir = new THREE.Vector3(this.playerBody.velocity.x, 0, this.playerBody.velocity.z).normalize();
                const backPos = this.playerMesh.position.clone().addScaledVector(dir, -0.8);
                backPos.y = terrainHeight + 0.05;
                this.particleSystem.emit(backPos, 0xaaaaaa, 4);
            }
        } else if (this.characterKey === 'CALCIUM') {
            this.calciumDustTimer = 0;
        }

        // Track last ground height so Calcium can get extra speed when dropping down ramps
        if (this.characterKey === 'CALCIUM') {
            if (hasInput) {
                const heightDrop = this.lastGroundHeight - terrainHeight;
                if (heightDrop > 0.4) {
                    // Going down a ramp: build speed much faster and allow a higher cap
                    this.calciumSpeedCharge = Math.min(1.8, this.calciumSpeedCharge + dt * 1.5);
                }
            }
            this.lastGroundHeight = terrainHeight;
        } else {
            this.lastGroundHeight = terrainHeight;
        }

        // Lava damage when standing on default ground outside the safe arena
        // Base lava: 20 DPS; each next tier multiplies DPS by 10 (tier1=20, tier2=200, tier3=2000, ...)
        const onLava = this.isLava(this.playerBody.position.x, this.playerBody.position.z);
        if (onLava) {
            // No lava damage in Pantheon Creative
            if (this.gameMode === 'PANTHEON' && this.pantheonState === 'CREATIVE') {
                this.lavaDamageTimer = 0;
            } else {
                this.lavaDamageTimer += dt;
                // Compute DPS according to current tier (defensive clamp to avoid negative tiers)
                const baseLavaDps = 20;
            const tierMultiplier = Math.pow(10, Math.max(0, (this.tier || 1) - 1));
            const lavaDps = baseLavaDps * tierMultiplier;

            // Apply damage each full second (accumulate fractional time).
            // Apply directly to player health so lava damage bypasses the generic global damage multiplier,
            // but still respects lava resistance (lavaResist).
            while (this.lavaDamageTimer >= 1.0) {
                const resist = Math.min(this.stats.lavaResist || 0, 0.9);
                const dmg = lavaDps * (1 - resist);

                // Directly subtract HP (do not pass through takeDamage which applies the global 0.25 easy-mode scaling).
                this.playerHealth -= dmg;

                // Visual / HUD update
                if (this.healthBar) this.healthBar.style.width = (Math.max(0, this.playerHealth) / this.maxHealth * 100) + '%';
                if (this.healthText) this.healthText.innerText = `${Math.max(0, Math.floor(this.playerHealth))} / ${this.maxHealth}`;

                // Floating damage number for feedback
                try {
                    this.spawnDamageNumber(this.playerMesh.position.clone().add(new THREE.Vector3(0, 1.6, 0)), Math.round(dmg), false);
                } catch (e) {}

                // Check death
                if (this.playerHealth <= 0) {
                    this.playerHealth = 0;
                    this.gameOver();
                    // Break to avoid further damage queue processing after death
                    break;
                }

                this.lavaDamageTimer -= 1.0;
            }
            } // End of else block for pantheon creative check

            // If you fall down into the lava void, land on a lava floor that bounces you back up
            if (this.playerBody.position.y <= this.lavaGroundY + this.playerRadius + 0.05 && this.playerBody.velocity.y < 0) {
                this.playerBody.position.y = this.lavaGroundY + this.playerRadius + 0.05;
                this.playerBody.velocity.y = 26;
                
                // Only take impact damage if not in Creative
                if (!(this.gameMode === 'PANTHEON' && this.pantheonState === 'CREATIVE')) {
                    const impactDmg = 8;
                    this.playerHealth -= impactDmg;
                    if (this.healthBar) this.healthBar.style.width = (Math.max(0, this.playerHealth) / this.maxHealth * 100) + '%';
                    if (this.healthText) this.healthText.innerText = `${Math.max(0, Math.floor(this.playerHealth))} / ${this.maxHealth}`;
                    try { this.spawnDamageNumber(this.playerMesh.position.clone().add(new THREE.Vector3(0,1.6,0)), Math.round(impactDmg), false); } catch(e){}
                    if (this.playerHealth <= 0) {
                        this.playerHealth = 0;
                        this.gameOver();
                    }
                }
            }
        } else {
            this.lavaDamageTimer = 0;
        }

        // Passive regeneration from runes when not in lava
        if (!onLava && this.stats.regen > 0 && this.playerHealth > 0 && this.playerHealth < this.maxHealth) {
            this.playerHealth = Math.min(this.maxHealth, this.playerHealth + this.stats.regen * dt);
            if (this.healthBar) {
                this.healthBar.style.width = (this.playerHealth / this.maxHealth * 100) + '%';
            }
            if (this.healthText) {
                this.healthText.innerText = `${Math.floor(this.playerHealth)} / ${this.maxHealth}`;
            }
        }
    }

    updateProjectiles(dt) {
        for (let i = this.projectiles.length - 1; i >= 0; i--) {
            const proj = this.projectiles[i];
            proj.life -= dt;
            
            // Init hit tracking
            if (!proj.hitIds) proj.hitIds = [];

            // Friendly Ghost Logic (Boberto)
            if (proj.isFriendlyGhost) {
                // Seek nearest enemy
                let nearest = null;
                let minDist = Infinity;
                for (let enemy of this.enemies) {
                    const d = enemy.mesh.position.distanceTo(proj.mesh.position);
                    if (d < minDist) { minDist = d; nearest = enemy; }
                }
                
                if (nearest) {
                    const dir = new THREE.Vector3().subVectors(nearest.mesh.position, proj.mesh.position).normalize();
                    // Move towards enemy (ignoring terrain collision for ghosts)
                    proj.velocity.addScaledVector(dir, 60 * dt); // High acceleration
                    proj.velocity.multiplyScalar(0.92); // Damping
                    
                    // Face target
                    const angle = Math.atan2(dir.x, dir.z);
                    proj.mesh.rotation.y = angle;
                } else {
                    // Wander if no enemies
                    proj.velocity.multiplyScalar(0.95);
                    proj.mesh.rotation.y += dt;
                }
                
                proj.mesh.position.addScaledVector(proj.velocity, dt);
                
                // Bob particles
                if (Math.random() > 0.8) {
                    this.particleSystem.emit(proj.mesh.position, proj.isDeadly ? 0xff0000 : (proj.isMiniBob ? 0x000000 : 0x00ffcc), 1);
                }
                
                // Collision Logic
                for (let enemy of this.enemies) {
                    const dist = proj.mesh.position.distanceTo(enemy.mesh.position);
                    // Hit radius
                    if (dist < (enemy.size + 1.0)) {
                        // Dealing damage on contact ticks
                        proj.attackTimer = (proj.attackTimer || 0) + dt;
                        if (proj.attackTimer >= 0.2) { // Attack rate
                            proj.attackTimer = 0;
                            this.damageEnemy(enemy, proj.damage);
                            this.particleSystem.emit(enemy.mesh.position, 0xffffff, 3);
                        }
                    }
                }
                
                if (proj.life <= 0) {
                    this.scene.remove(proj.mesh);
                    this.projectiles.splice(i, 1);
                }
                continue;
            }

            // Slutty Missiles: arc phase then aggressive homing
            if (proj.isMissile) {
                proj.age = (proj.age || 0) + dt;
                
                // If target died, try to retarget to nearest enemy
                if (!proj.target || !this.enemies.includes(proj.target)) {
                    let nearest = null;
                    let minDist = Infinity;
                    for (let enemy of this.enemies) {
                        const d = enemy.mesh.position.distanceTo(proj.mesh.position);
                        if (d < minDist) { minDist = d; nearest = enemy; }
                    }
                    proj.target = nearest || null;
                }

                // Phase 1: arc upwards for a short time
                if (!proj.homing) {
                    const upBoost = 30;
                    proj.velocity.y += upBoost * dt;
                    if (proj.age >= (proj.arcingTime || 0.3)) {
                        proj.homing = true;
                    }
                }
                
                // Phase 2: hard seek current target
                if (proj.homing && proj.target && this.enemies.includes(proj.target)) {
                    const seekDir = new THREE.Vector3()
                        .subVectors(proj.target.mesh.position, proj.mesh.position)
                        .normalize();
                    const desired = seekDir.multiplyScalar(35);
                    // Steer into desired direction
                    proj.velocity.lerp(desired, 0.18);
                }

                // Orient missile along velocity
                const horizontalDir = proj.velocity.clone();
                if (horizontalDir.lengthSq() > 0.0001) {
                    const angle = Math.atan2(horizontalDir.x, horizontalDir.z);
                    proj.mesh.rotation.y = angle;
                    proj.mesh.rotation.x = -Math.PI / 2;
                }
            }

            // Boomerang Logic
            if (proj.isBoomerang) {
                proj.mesh.rotation.y += dt * 15; // Spin
                if (proj.returnState === 0) {
                     // Slow down
                     proj.velocity.multiplyScalar(0.96);
                     if (proj.velocity.length() < 2) {
                         proj.returnState = 1;
                         // Reset hits when returning so it can hit them again
                         proj.hitIds = [];
                     }
                } else {
                    // Return
                    const toPlayer = new THREE.Vector3().subVectors(proj.owner.position, proj.mesh.position);
                    if (toPlayer.length() < 1) {
                         // Caught
                         this.scene.remove(proj.mesh);
                         this.projectiles.splice(i, 1);
                         continue;
                    }
                    toPlayer.normalize();
                    proj.velocity.addScaledVector(toPlayer, 50 * dt);
                    // Cap speed
                    if(proj.velocity.length() > 30) proj.velocity.setLength(30);
                }
            }
            
            proj.mesh.position.addScaledVector(proj.velocity, dt);

            // Particle trails behind different projectile types
            if (this.particleSystem) {
                const trailPos = proj.mesh.position.clone();
                let color = 0xffffaa;
                if (proj.isFireball) color = 0xff6600;
                else if (proj.isMissile) color = 0xffee88;
                else if (proj.isBone) color = 0xffffff;
                this.particleSystem.emit(trailPos, color, 1);
            }
            
            // ENEMY PROJECTILE COLLISION (Player Hit)
            if (proj.isEnemyProjectile) {
                const pDist = proj.mesh.position.distanceTo(this.playerBody.position);
                if (pDist < 1.5) { // Generous player hitbox
                    this.takeDamage(proj.damage);
                    this.particleSystem.emit(this.playerBody.position, 0xff0000, 10);
                    this.scene.remove(proj.mesh);
                    this.projectiles.splice(i, 1);
                    continue;
                }
            }
            
            // Check enemy collision
            let hit = false;
            for (let enemy of this.enemies) {
                // Ignore enemy projectiles hitting enemies
                if (proj.isEnemyProjectile) continue;

                // Ignore already hit enemies for this projectile
                if (proj.hitIds.includes(enemy.id)) continue;

                const dist = proj.mesh.position.distanceTo(enemy.mesh.position);
                if (dist < enemy.size * 0.8 + 0.25) {
                    
                    // Register Hit
                    proj.hitIds.push(enemy.id);

                    if (proj.isFireball) {
                        // AOE damage
                        for (let e of this.enemies) {
                            const d = proj.mesh.position.distanceTo(e.mesh.position);
                            if (d < 2.5) {
                                this.damageEnemy(e, proj.damage * Math.max(0.3, 1 - d / 2.5));
                            }
                        }
                        this.particleSystem.emit(proj.mesh.position, 0xff4400, 15);
                        hit = true;
                        break;
                    } else if (proj.isBone && proj.bouncesLeft > 0) {
                        // Ricochet bone: damage enemy and bounce toward another
                        this.damageEnemy(enemy, proj.damage);
                        proj.bouncesLeft -= 1;

                        // Find new target
                        let nextTarget = null;
                        let closest = Infinity;
                        for (let e of this.enemies) {
                            if (e === enemy) continue;
                            const d2 = proj.mesh.position.distanceTo(e.mesh.position);
                            if (d2 < closest) {
                                closest = d2;
                                nextTarget = e;
                            }
                        }
                        if (nextTarget) {
                            const ndir = new THREE.Vector3().subVectors(nextTarget.mesh.position, proj.mesh.position).normalize();
                            proj.velocity.copy(ndir.multiplyScalar(35));
                            this.particleSystem.emit(proj.mesh.position, 0xffffff, 4);
                            hit = false; // keep projectile alive
                            break;
                        } else {
                            hit = true;
                            break;
                        }
                    } else {
                        this.damageEnemy(enemy, proj.damage);
                        this.particleSystem.emit(proj.mesh.position, 0xffaa00, 5);
                        
                        // Piercing check
                        // Bananerangs have infinite pierce while moving out/returning
                        if (proj.isBoomerang) {
                             // Do not destroy
                             hit = false;
                             continue;
                        }

                        const maxPierce = this.stats.piercing || 0;
                        if (maxPierce > 0) {
                            proj.pierceCount = (proj.pierceCount || 0) + 1;
                            if (proj.pierceCount <= maxPierce) {
                                // Continue flying through
                                hit = false;
                                continue;
                            }
                        }
                        
                        hit = true;
                        break;
                    }
                }
            }
            
            if (hit) {
                this.scene.remove(proj.mesh);
                this.projectiles.splice(i, 1);
                continue;
            }
            
            if (proj.life <= 0) {
                this.scene.remove(proj.mesh);
                this.projectiles.splice(i, 1);
            }
        }
    }

    updateEnemies(dt) {
        const playerPos = new THREE.Vector3().copy(this.playerBody.position);
        
        for (let enemy of this.enemies) {
            // Spawn animation: rise from the ground before doing anything
            if (enemy.spawn) {
                enemy.spawn.timer += dt;
                const t = Math.min(enemy.spawn.timer / enemy.spawn.duration, 1);
                const y = THREE.MathUtils.lerp(enemy.spawn.startY, enemy.spawn.targetY, t);
                enemy.body.position.y = y;
                enemy.mesh.position.copy(enemy.body.position);

                // Small wobble while spawning
                enemy.mesh.scale.setScalar(0.6 + 0.4 * t);

                if (t < 1) {
                    continue; // still spawning, don't move or attack yet
                } else {
                    enemy.mesh.scale.setScalar(1);
                    enemy.body.position.y = enemy.spawn.targetY;
                    delete enemy.spawn;
                }
            }

            const diff = new THREE.Vector3().subVectors(playerPos, enemy.mesh.position);
            const dist = diff.length();
            diff.normalize();

            // Add a little wander so enemies don't perfectly beeline
            enemy.walkTime = (enemy.walkTime || 0) + dt * 1.2;
            if (enemy.wanderSeed === undefined) enemy.wanderSeed = Math.random() * 10;
            const wanderStrength = 0.3;
            const wanderAngle = enemy.walkTime * 0.9 + enemy.wanderSeed;
            const wander = new THREE.Vector3(
                Math.sin(wanderAngle) * wanderStrength,
                0,
                Math.cos(wanderAngle) * wanderStrength
            );
            diff.add(wander).normalize();
            
            // Boss moves slower, ghosts handled separately
            const timeFactor = 1 + this.gameTime * 0.002;
            
            // Boss respawn check if far away
            if (enemy.isBoss && !enemy.isCharging) {
                const distToP = enemy.mesh.position.distanceTo(playerPos);
                if (distToP > 50) {
                    enemy.farTimer = (enemy.farTimer || 0) + dt;
                    if (enemy.farTimer > 60) {
                        this.respawnBossNearPlayer(enemy);
                        return; // Stop updating this dead instance
                    }
                } else {
                    enemy.farTimer = 0;
                }
            }

            // Make enemies more aggressive so they don't just idle
            let baseSpeed = 2.4; // Base speed, no level scaling for normal mobs

            // Overtime ghosts specifically get faster
            if (enemy.type === 'ghost_default' || enemy.type === 'ghost_deadly') {
                const paceMultiplier = (1.0 + (this.level - 1) * 0.03) * 1.5;
                baseSpeed = (1.6 + this.level * 0.03) * timeFactor * paceMultiplier;
            }

            // Apply slow from ICE_AURA if tagged
            if (enemy.slowUntil && enemy.slowUntil > this.gameTime) {
                baseSpeed *= 0.4;
            }
            if (enemy.isBoss) {
                baseSpeed = 3.0; // Boss constant speed
            }
            
            // Track distance before moving so we can detect "stuck" enemies
            const distBefore = dist;
            
            // Proposed new horizontal position
            const moveX = diff.x * baseSpeed * dt;
            const moveZ = diff.z * baseSpeed * dt;
            const candidateX = enemy.body.position.x + moveX;
            const candidateZ = enemy.body.position.z + moveZ;

            // Flying ghosts ignore lava/height and hover
            if (enemy.type === 'ghost_default' || enemy.type === 'ghost_deadly') {
                enemy.body.position.x = candidateX;
                enemy.body.position.z = candidateZ;

                const terrainHeight = this.getTerrainHeight(enemy.body.position.x, enemy.body.position.z);
                const hover = enemy.type === 'ghost_deadly' ? 4.0 : 3.0;
                enemy.body.position.y = terrainHeight + hover;
            } else {
                // Ground enemies simply chase you, even across dangerous terrain
                enemy.body.position.x = candidateX;
                enemy.body.position.z = candidateZ;
                
                const terrainHeightEnemy = this.getTerrainHeight(enemy.body.position.x, enemy.body.position.z);
                const minY = Math.max(0, terrainHeightEnemy) + enemy.size;
                if (enemy.body.position.y < minY) {
                    enemy.body.position.y = minY;
                }

                // Dirt puff under walking enemies
                if (this.particleSystem && baseSpeed > 0.1) {
                    const dustPos = enemy.mesh.position.clone();
                    dustPos.y = terrainHeightEnemy + 0.05;
                    this.particleSystem.emit(dustPos, 0x7c5a3a, 1);
                }
            }
            
            // Sync mesh with body
            enemy.mesh.position.copy(enemy.body.position);

            // (Duplicate block removed - animation is handled in the lower block in updateEnemies)
            
            // If the enemy is getting further from the player and player is higher,
            // let the enemy "climb" upwards instead of getting stuck on walls.
            const afterDiff = new THREE.Vector3().subVectors(playerPos, enemy.mesh.position);
            const distAfter = afterDiff.length();

            const horizontalDiff = new THREE.Vector2(
                playerPos.x - enemy.body.position.x,
                playerPos.z - enemy.body.position.z
            ).length();
            const verticalDiff = playerPos.y - enemy.body.position.y;

            // Direct climbing when close horizontally and player is clearly above
            if (horizontalDiff < 3 && verticalDiff > 0.6) {
                const climbSpeed = 10;
                enemy.body.position.y += climbSpeed * dt;
                enemy.mesh.position.y = enemy.body.position.y;
            } else if (distAfter > distBefore + 0.05 && playerPos.y > enemy.body.position.y + 0.5) {
                // Fallback "unstuck" climb for weird geometry
                enemy.body.position.y += 6 * dt;
                enemy.mesh.position.y = enemy.body.position.y;
            }
            
            // Face player
            const angle = Math.atan2(diff.x, diff.z);
            enemy.mesh.rotation.y = angle;

            // Simple walk animation for enemies that have limbs
            if (enemy.anim && (enemy.anim.arms || enemy.anim.legs)) {
                // Slower enemy animation
                const animSpeed = 2.5;
                enemy.walkTime = (enemy.walkTime || 0) + dt * animSpeed;
                const phase = enemy.walkTime * 4;
                const swing = Math.sin(phase);
                const swingOpp = Math.sin(phase + Math.PI);

                if (enemy.anim.arms) {
                    const armAmp = 0.5;
                    enemy.anim.arms.forEach((arm, idx) => {
                        if (!arm) return;
                        const s = idx % 2 === 0 ? swing : swingOpp;
                        arm.rotation.x = s * armAmp;
                    });
                }
                if (enemy.anim.legs) {
                    const legAmp = 0.7;
                    enemy.anim.legs.forEach((leg, idx) => {
                        if (!leg) return;
                        const s = idx % 2 === 0 ? swingOpp : swing;
                        leg.rotation.x = s * legAmp;
                    });
                }
            }

            // Boss / Miniboss behavior
            if (enemy.isBoss) {
                enemy.attackTimer = (enemy.attackTimer || 0) + dt;
                enemy.teleportCooldown = (enemy.teleportCooldown || 0) - dt;

                const origin = enemy.mesh.position.clone();
                const playerPos = new THREE.Vector3().copy(this.playerBody.position);
                const distToPlayer = origin.distanceTo(playerPos);

                // TNS Tier 4 Barkvader Logic
                if (this.gameMode === 'TNS' && this.tnsTier === 4 && enemy.isMainBoss) {
                    // Check HP Thresholds for Phases
                    const hpRatio = enemy.hp / enemy.maxHp;
                    
                    // Trigger Shield Phases (75%, 50%, 25%)
                    // Only trigger if not already shielded and in a fight phase
                    if (!enemy.isShielded) {
                        if ((hpRatio <= 0.75 && this.tnsPhase === 1) || 
                            (hpRatio <= 0.50 && this.tnsPhase === 3) || 
                            (hpRatio <= 0.25 && this.tnsPhase === 5)) {
                            
                            // Activate Shield
                            this.tnsPhase++; // 2, 4, 6
                            enemy.isShielded = true;
                            this.showToast("BARKVADER SHIELDS UP! KILL CHADBARK!");
                            
                            // Rise up
                            enemy.body.position.y += 10;
                            enemy.mesh.position.y += 10;
                            
                            // Visual Shield
                            if(!enemy.shieldMesh) {
                                const s = new THREE.Mesh(new THREE.SphereGeometry(3, 16, 16), new THREE.MeshBasicMaterial({color:0x00ffff, transparent:true, opacity:0.3, wireframe:true}));
                                enemy.mesh.add(s);
                                enemy.shieldMesh = s;
                            }
                            enemy.shieldMesh.visible = true;
                            
                            // Spawn Chadbark Miniboss with scaled HP
                            // Phase 2 (75%): Normal HP. Phase 4 (50%): 2x HP. Phase 6 (25%): 2x HP? User said "Same thing".
                            const hpMult = (this.tnsPhase === 4 || this.tnsPhase === 6) ? 2.0 : 1.0;
                            const chadbarkHp = 15000 * hpMult; 
                            // Spawn Chadbark specifically. Use Miniboss spawner with custom type?
                            // Let's reuse 'JOHN_PORK' visual but name it Chadbark
                            this.spawnMiniboss('JOHN_PORK', chadbarkHp);
                            const cb = this.bossEnemy; // The newly spawned miniboss
                            if (cb) {
                                cb.name = "Chadbark";
                                cb.isChadbark = true; // Mark him
                                this.bossEnemy = enemy; // Restore Barkvader as main boss ref, stick Chadbark in enemies list
                                // Need to ensure Chadbark is treated as a separate boss entity
                                // Actually spawnMiniboss sets this.bossEnemy. We need to preserve Barkvader reference.
                                // We have 'enemy' as Barkvader here.
                            }
                            
                            // Resume spawns
                            this.spawnRateMultiplier = 2.0;
                        }
                    } else {
                        // Check if Chadbark is dead
                        const chadbarkAlive = this.enemies.some(e => e.isChadbark);
                        if (!chadbarkAlive) {
                            // Break Shield
                            enemy.isShielded = false;
                            this.tnsPhase++; // 3, 5, 7
                            this.showToast("SHIELD BROKEN!");
                            
                            // Drop down
                            enemy.body.position.y -= 10;
                            enemy.mesh.position.y -= 10;
                            if(enemy.shieldMesh) enemy.shieldMesh.visible = false;
                            
                            // Clear minions
                            this.enemies.forEach(e => {
                                if(!e.isBoss) this.despawnEnemy(e);
                            });
                            this.spawnRateMultiplier = 0; // Stop spawns during boss duel
                        }
                    }
                    
                    // Invincibility handling in damageEnemy (add check there)
                }

                if (enemy.isMainBoss) {
                    if (enemy.name === 'Babybark') {
                        // BABYBARK: Simple Acorn Shot
                        const attackInterval = 2.0;
                        if (enemy.attackTimer >= attackInterval) {
                            enemy.attackTimer = 0;
                            const dir = new THREE.Vector3().subVectors(playerPos, origin).normalize();
                            
                            const acorn = new THREE.Mesh(new THREE.SphereGeometry(0.4), new THREE.MeshStandardMaterial({ color: 0x8D6E63 }));
                            acorn.position.copy(origin);
                            acorn.position.y += 1.0;
                            this.scene.add(acorn);
                            
                            this.projectiles.push({
                                mesh: acorn,
                                velocity: dir.multiplyScalar(15),
                                damage: 15,
                                life: 4,
                                isEnemyProjectile: true
                            });
                            this.playSound('bonk', 1.5, 0.3);
                        }
                    } else if (enemy.name === 'Smolbark') {
                        // SMOLBARK: Leaf Volley (3 spread)
                        const attackInterval = 1.5;
                        if (enemy.attackTimer >= attackInterval) {
                            enemy.attackTimer = 0;
                            const baseDir = new THREE.Vector3().subVectors(playerPos, origin).normalize();
                            
                            for(let i=-1; i<=1; i++) {
                                const dir = baseDir.clone().applyAxisAngle(new THREE.Vector3(0,1,0), i * 0.25);
                                const leaf = new THREE.Mesh(new THREE.ConeGeometry(0.2, 0.6), new THREE.MeshStandardMaterial({ color: 0x33691E }));
                                leaf.rotation.x = Math.PI/2;
                                leaf.position.copy(origin);
                                leaf.position.y += 1.5;
                                leaf.lookAt(origin.clone().add(dir));
                                this.scene.add(leaf);
                                
                                this.projectiles.push({
                                    mesh: leaf,
                                    velocity: dir.multiplyScalar(18),
                                    damage: 20,
                                    life: 4,
                                    isEnemyProjectile: true
                                });
                            }
                            this.playSound('slice', 1.2, 0.3);
                        }
                    } else if (enemy.name === 'Chadbark') {
                        // CHADBARK: Mix of Charge and Log Throw
                        if (enemy.chargeTimer === undefined) enemy.chargeTimer = 0;
                        enemy.chargeTimer += dt;
                        
                        if (enemy.chargeTimer > 4.0) {
                            // CHARGE ATTACK
                            const dir = new THREE.Vector3().subVectors(playerPos, origin).normalize();
                            enemy.body.position.x += dir.x * 12.0; // Big lunge
                            enemy.body.position.z += dir.z * 12.0;
                            this.particleSystem.emit(enemy.mesh.position.clone(), 0x5D4037, 30);
                            this.playSound('boom', 0.8, 0.5);
                            this.screenShake = 0.5;
                            
                            // AOE Slam at destination
                            if (playerPos.distanceTo(enemy.mesh.position) < 5.0) {
                                this.takeDamage(30);
                            }
                            enemy.chargeTimer = 0;
                            enemy.attackTimer = 0; // reset projectile timer
                        } else {
                            // LOG THROW
                            const attackInterval = 1.8;
                            if (enemy.attackTimer >= attackInterval) {
                                enemy.attackTimer = 0;
                                const dir = new THREE.Vector3().subVectors(playerPos, origin).normalize();
                                const log = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 2.0), new THREE.MeshStandardMaterial({ color: 0x3E2723 }));
                                log.rotation.x = Math.PI/2; // sideways log? No, missile log.
                                log.rotation.z = Math.PI/2; // Horizontal log spinning?
                                log.position.copy(origin);
                                log.position.y += 2.0;
                                this.scene.add(log);
                                
                                this.projectiles.push({
                                    mesh: log,
                                    velocity: dir.multiplyScalar(22),
                                    damage: 35,
                                    life: 5,
                                    isEnemyProjectile: true
                                });
                                this.playSound('bonk', 0.6, 0.4);
                            }
                        }
                    } else if (enemy.name === 'Barkvader') {
                        // BARKVADER: 4 Attacks
                        if (enemy.bvPhase === undefined) enemy.bvPhase = 0;
                        if (enemy.bvTimer === undefined) enemy.bvTimer = 0;
                        
                        enemy.bvTimer += dt;
                        
                        // Attack cooldown varies by phase
                        const cooldowns = [2.5, 3.0, 4.0, 3.0];
                        if (enemy.bvTimer >= cooldowns[enemy.bvPhase]) {
                            enemy.bvTimer = 0;
                            
                            // Execute Attack based on Phase
                            if (enemy.bvPhase === 0) {
                                // 1. LIGHTSABER THROW (Boomerang)
                                const dir = new THREE.Vector3().subVectors(playerPos, origin).normalize();
                                const saber = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 3.0), new THREE.MeshBasicMaterial({ color: 0xff0000 }));
                                saber.rotation.x = Math.PI/2;
                                saber.position.copy(origin);
                                saber.position.y += 2.0;
                                this.scene.add(saber);
                                
                                this.projectiles.push({
                                    mesh: saber,
                                    velocity: dir.multiplyScalar(28),
                                    damage: 40,
                                    life: 5,
                                    isEnemyProjectile: true,
                                    isBoomerang: true,
                                    returnState: 0,
                                    owner: enemy.mesh,
                                    hitIds: []
                                });
                                this.playSound('slice', 0.5, 0.5);
                                this.showToast("Barkvader throws his saber!");
                            } else if (enemy.bvPhase === 1) {
                                // 2. FORCE LIGHTNING (Rapid Fire)
                                const count = 8;
                                for(let k=0; k<count; k++) {
                                    setTimeout(() => {
                                        if(!this.isPlaying || !enemy.mesh) return; // safety
                                        // Recalc player pos
                                        const currP = this.playerBody.position.clone();
                                        const currO = enemy.mesh.position.clone();
                                        const d = new THREE.Vector3().subVectors(currP, currO).normalize();
                                        // Add spread
                                        d.applyAxisAngle(new THREE.Vector3(0,1,0), (Math.random()-0.5)*0.3);
                                        
                                        const bolt = new THREE.Mesh(new THREE.SphereGeometry(0.3), new THREE.MeshBasicMaterial({ color: 0xaa00ff })); // Purple lightning? Or Red? Barkvader -> Red.
                                        bolt.material.color.setHex(0xff0000);
                                        bolt.position.copy(currO);
                                        bolt.position.y += 2.5;
                                        this.scene.add(bolt);
                                        
                                        this.projectiles.push({
                                            mesh: bolt,
                                            velocity: d.multiplyScalar(35),
                                            damage: 15,
                                            life: 3,
                                            isEnemyProjectile: true
                                        });
                                        this.playSynth('shoot', 2.0, 0.2);
                                    }, k * 100);
                                }
                            } else if (enemy.bvPhase === 2) {
                                // 3. DARK SIDE BURST (360 Radial)
                                const count = 24;
                                for(let k=0; k<count; k++) {
                                    const angle = (k/count) * Math.PI * 2;
                                    const d = new THREE.Vector3(Math.sin(angle), 0, Math.cos(angle));
                                    const ball = new THREE.Mesh(new THREE.SphereGeometry(0.5), new THREE.MeshBasicMaterial({ color: 0x330000 }));
                                    ball.position.copy(origin);
                                    ball.position.y += 1.0;
                                    this.scene.add(ball);
                                    this.projectiles.push({
                                        mesh: ball,
                                        velocity: d.multiplyScalar(15),
                                        damage: 30,
                                        life: 6,
                                        isEnemyProjectile: true
                                    });
                                }
                                this.playSound('boom', 0.4, 0.6);
                                this.screenShake = 0.4;
                            } else if (enemy.bvPhase === 3) {
                                // 4. FORCE CRUSH (Ground Eruption under player)
                                const target = playerPos.clone();
                                // Telegraph
                                const marker = new THREE.Mesh(new THREE.RingGeometry(0.5, 3.5, 32), new THREE.MeshBasicMaterial({ color: 0xff0000, side: THREE.DoubleSide, transparent: true, opacity: 0.5 }));
                                marker.rotation.x = -Math.PI/2;
                                marker.position.copy(target);
                                marker.position.y = this.getTerrainHeight(target.x, target.z) + 0.1;
                                this.scene.add(marker);
                                
                                setTimeout(() => {
                                    this.scene.remove(marker);
                                    // Explode
                                    this.particleSystem.emit(target, 0xff0000, 50);
                                    this.playSound('boom', 0.8, 0.8);
                                    // Check damage
                                    const pNow = this.playerBody.position;
                                    if (pNow.distanceTo(target) < 3.5) {
                                        this.takeDamage(50);
                                        // Knockback
                                        this.playerBody.velocity.y = 15;
                                    }
                                }, 1200); // 1.2s delay
                            }
                            
                            // Advance Phase
                            enemy.bvPhase = (enemy.bvPhase + 1) % 4;
                        }
                    } else {
                        // DEFAULT GATEKEEPER
                        const attackInterval = 1.2;
                        if (enemy.attackTimer >= attackInterval) {
                            enemy.attackTimer = 0;
                            for (let i = -1; i <= 1; i++) {
                                const dir = new THREE.Vector3().subVectors(playerPos, origin).normalize();
                                const spread = 0.18 * i;
                                dir.applyAxisAngle(new THREE.Vector3(0,1,0), spread);

                                // Upgraded Pitchfork Volley
                                const pfGroup = new THREE.Group();
                                // Larger, glowing Trident shape
                                const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 2.5), new THREE.MeshStandardMaterial({ color: 0x888888 }));
                                shaft.rotation.x = Math.PI/2;
                                pfGroup.add(shaft);
                                const tip = new THREE.Mesh(new THREE.ConeGeometry(0.3, 1.0), new THREE.MeshBasicMaterial({ color: 0xff0000 }));
                                tip.rotation.x = Math.PI/2;
                                tip.position.z = 1.2;
                                pfGroup.add(tip);
                                
                                // Adjust height to player level so it hits
                                pfGroup.position.copy(origin);
                                pfGroup.position.y = playerPos.y + 0.5; // Aim at player height!
                                pfGroup.lookAt(playerPos);
                                
                                this.scene.add(pfGroup);

                                this.projectiles.push({
                                    mesh: pfGroup,
                                    velocity: dir.multiplyScalar(20),
                                    damage: 40,
                                    life: 5,
                                    isEnemyProjectile: true
                                });
                            }
                            this.playSound && this.playSound('boom', 0.9, 0.25);
                        }
                    }

                    // Teleport if too far (keep boss engaging)
                    // Barkvader has his own movement logic or can share this? 
                    // Let's allow teleport for all bosses to avoid stuckness.
                    if (distToPlayer > 25 && (enemy.teleportCooldown === undefined || enemy.teleportCooldown <= 0)) {
                        this.teleportEnemyNearPlayer(enemy);
                        enemy.teleportCooldown = 8.0;
                    }
                } else {
                    // Miniboss unique attacks based on name/type
                    const atk = (enemy.name || '').toLowerCase();
                    // JOHN_PORK / CHADBARK: charge lunge after wind-up
                    if (atk.includes('john pork') || atk.includes('chadbark')) {
                        enemy.chargeTimer = (enemy.chargeTimer || 0) + dt;
                        const windUp = 1.1;
                        if (enemy.chargeTimer >= windUp) {
                            // lunge toward player
                            const dir = new THREE.Vector3().subVectors(playerPos, origin).normalize();
                            enemy.body.position.x += dir.x * 6.5;
                            enemy.body.position.z += dir.z * 6.5;
                            this.particleSystem.emit(enemy.mesh.position.clone(), 0xffaa00, 20);
                            this.playSound && this.playSound('boom', 1.1, 0.3);
                            enemy.chargeTimer = 0;
                            enemy.attackTimer = 0;
                            // small cooldown before next charge
                            enemy.teleportCooldown = 2.0;
                        } else {
                            // telegraph by slight shake
                            enemy.mesh.position.y += Math.sin(enemy.chargeTimer * 30) * 0.002;
                        }
                    }
                    // QUEEN KAREN: summon minions or spawn small projectile cones
                    else if (atk.includes('queen karen') || atk.includes('karen')) {
                        enemy.attackTimer = (enemy.attackTimer || 0) + dt;
                        const summonInterval = 3.2;
                        if (enemy.attackTimer >= summonInterval) {
                            enemy.attackTimer = 0;
                            // spawn 2 smaller enemies near her (light foes)
                            for (let i = 0; i < 2; i++) {
                                const angle = Math.random() * Math.PI * 2;
                                const dist = 2 + Math.random() * 2;
                                const sx = enemy.mesh.position.x + Math.cos(angle) * dist;
                                const sz = enemy.mesh.position.z + Math.sin(angle) * dist;
                                // simple spawned enemy visual (weak)
                                const grp = new THREE.Group();
                                const body = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.9, 0.5), new THREE.MeshStandardMaterial({ color: 0x9966aa }));
                                body.position.y = 0.5;
                                grp.add(body);
                                grp.position.set(sx, this.getTerrainHeight(sx, sz) + 0.5, sz);
                                this.scene.add(grp);

                                const b = new CANNON.Body({ mass: 1, position: new CANNON.Vec3(sx, this.getTerrainHeight(sx, sz) + 0.5, sz), fixedRotation: true });
                                b.addShape(new CANNON.Sphere(0.5));
                                this.world.addBody(b);

                                this.enemies.push({
                                    id: 'karen_minion_' + Date.now() + Math.random(),
                                    mesh: grp,
                                    body: b,
                                    hp: 6,
                                    maxHp: 6,
                                    size: 0.6,
                                    attackCooldown: 0,
                                    anim: {},
                                    walkTime: 0,
                                    type: 'karen_minion'
                                });
                            }
                            this.particleSystem.emit(enemy.mesh.position.clone(), 0xff88ff, 30);
                        }
                    }
                    // BRUH_NUBIS: teleport-strike — blink behind player and fire a cone
                    else if (atk.includes('bruh-nubis') || atk.includes('bruh')) {
                        enemy.attackTimer = (enemy.attackTimer || 0) + dt;
                        const strikeInterval = 2.8;
                        if (enemy.attackTimer >= strikeInterval && (enemy.teleportCooldown === undefined || enemy.teleportCooldown <= 0)) {
                            enemy.attackTimer = 0;
                            // teleport behind player
                            this.teleportEnemyNearPlayer(enemy);
                            // after teleport, do a quick cone of projectiles outward
                            const o2 = enemy.mesh.position.clone();
                            const p2 = new THREE.Vector3().copy(this.playerBody.position);
                            for (let i = -2; i <= 2; i++) {
                                const dir = new THREE.Vector3().subVectors(p2, o2).normalize();
                                dir.applyAxisAngle(new THREE.Vector3(0,1,0), i * 0.18);
                                const proj = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.5, 6), new THREE.MeshStandardMaterial({ color: 0xffcc66 }));
                                proj.rotation.x = Math.PI/2;
                                proj.position.copy(o2);
                                proj.position.y += 1.2;
                                this.scene.add(proj);
                                this.projectiles.push({
                                    mesh: proj,
                                    velocity: dir.multiplyScalar(22),
                                    damage: 10,
                                    life: 2.6,
                                    isEnemyProjectile: true
                                });
                            }
                            enemy.teleportCooldown = 3.0;
                        }
                    } else {
                        // Fallback: light pitchfork volley so it still threatens
                        enemy.attackTimer = (enemy.attackTimer || 0) + dt;
                        const fallbackInterval = 1.6;
                        if (enemy.attackTimer >= fallbackInterval) {
                            enemy.attackTimer = 0;
                            const dir = new THREE.Vector3().subVectors(playerPos, origin).normalize();
                            const pf = new THREE.Mesh(
                                new THREE.ConeGeometry(0.1, 0.6, 6),
                                new THREE.MeshStandardMaterial({ color: 0xcccccc, emissive: 0x888888 })
                            );
                            pf.rotation.x = Math.PI/2;
                            pf.position.copy(origin);
                            pf.position.y += 1.5;
                            this.scene.add(pf);
                            this.projectiles.push({
                                mesh: pf,
                                velocity: dir.multiplyScalar(18),
                                damage: 12,
                                life: 3,
                                isEnemyProjectile: true
                            });
                        }
                    }
                }

                // Keep boss/miniboss engaged: if too far, teleport to keep fight active
                if (distToPlayer > 20 && (enemy.teleportCooldown === undefined || enemy.teleportCooldown <= 0)) {
                    this.teleportEnemyNearPlayer(enemy);
                    enemy.teleportCooldown = 6.0;
                }
            }

            // Special behavior: Spider Spatter charging and explosion
            if (enemy.type === 'spider') {
                const chargeRange = 3.0;
                const explosionRadius = 3.5;
                const chargeDuration = 1.1;

                if (!enemy.isCharging && dist < chargeRange) {
                    enemy.isCharging = true;
                    enemy.chargeTimer = 0;
                }

                if (enemy.isCharging) {
                    enemy.chargeTimer += dt;

                    // Shake and flash white while charging
                    const shakeAmp = 0.15;
                    const offsetX = (Math.random() - 0.5) * shakeAmp;
                    const offsetZ = (Math.random() - 0.5) * shakeAmp;
                    enemy.mesh.position.x += offsetX;
                    enemy.mesh.position.z += offsetZ;

                    // Rapid flash
                    enemy.mesh.traverse((child) => {
                        if (child.isMesh && child.material && child.material.emissive) {
                            const t = (Math.sin(enemy.chargeTimer * 30) * 0.5 + 0.5);
                            child.material.emissive.setRGB(1.0, 0.5 + 0.5 * t, 0.5 + 0.5 * t); // Flash reddish white
                        }
                    });

                    if (enemy.chargeTimer >= chargeDuration) {
                        // Explode
                        const explosionPos = enemy.mesh.position.clone();
                        explosionPos.y += 1.5; // Lift explosion center to be more visible
                        
                        // MASSIVE explosion for Spider (increased counts)
                        this.particleSystem.emit(explosionPos, 0xffffff, 300); // White core burst
                        this.particleSystem.emit(explosionPos, 0xff2222, 200); // Red viscera
                        this.particleSystem.emit(explosionPos, 0xffaa00, 150); // Fire/Sparks
                        this.particleSystem.emit(explosionPos, 0x550000, 120); // Dark debris
                        
                        // Wide spray
                        for(let k=0; k<30; k++) {
                            const off = new THREE.Vector3((Math.random()-0.5)*5, (Math.random()-0.5)*5, (Math.random()-0.5)*5);
                            this.particleSystem.emit(explosionPos.clone().add(off), 0xff4400, 15);
                        }

                        this.screenShake = 1.2; 
                        this.playSound('boom', 0.5, 1.0);

                        const explosionDamage = 14; 
                        const explosionKnock = 50;
                        const explosionRadiusSq = explosionRadius * explosionRadius;

                        const toPlayer = new THREE.Vector3().subVectors(playerPos, explosionPos);
                        if (toPlayer.lengthSq() <= explosionRadiusSq) {
                            // Damage and big knockback
                            this.takeDamage(explosionDamage);
                            toPlayer.normalize();
                            this.playerBody.velocity.x += toPlayer.x * explosionKnock;
                            this.playerBody.velocity.z += toPlayer.z * explosionKnock;
                            this.playerBody.velocity.y += 18;
                        }

                        this.despawnEnemy(enemy);
                        continue;
                    }
                }
            }

            // (Bandit removed)

            // Per-enemy attack cooldown for melee hits + slash telegraph
            enemy.attackCooldown = Math.max(0, enemy.attackCooldown - dt);

            // Use a larger attack radius for ghosts so their hitbox better matches their visual float
            const isGhost = String(enemy.type || '').toLowerCase().includes('ghost');
            const attackThreshold = isGhost ? 3.0 : 1.8;

            // For ghosts, check horizontal distance (x,z) so hovering doesn't avoid hits;
            // for others, use full 3D distance.
            const horizDist = Math.hypot(enemy.mesh.position.x - playerPos.x, enemy.mesh.position.z - playerPos.z);
            const effectiveDist = isGhost ? horizDist : dist;

            if (effectiveDist < attackThreshold && enemy.attackCooldown <= 0 && enemy.type !== 'spider' && enemy.type !== 'bandit') {
                let baseDmg = 8 + this.level * 0.6; // toned down overall enemy melee
                // Ghost Damage scaling
                if (enemy.type === 'ghost_default') {
                    // Ghosts do very low damage now to avoid insta-kills in early overtime
                    baseDmg = 4 + this.level * 0.25;
                } else if (enemy.type === 'ghost_deadly') {
                    // Deadly ghosts still stronger but balanced
                    baseDmg = 9 + this.level * 0.6;
                } else if (enemy.isBoss) {
                    // If boss has a special bobDamage defined, use it (overtime Bob uses 1000). Otherwise fallback to regular boss damage scale.
                    if (enemy.bobDamage) {
                        baseDmg = enemy.bobDamage;
                    } else {
                        baseDmg = 40 + this.level * 3.0;
                    }
                }
                const dmg = baseDmg;
                this.spawnSlash(playerPos.clone());
                this.takeDamage(dmg);
                // Ghosts attack a bit faster so they feel responsive
                enemy.attackCooldown = isGhost ? 0.9 : 1.2;
            }
            
            // If an enemy is a boss and dies, make sure its bar is cleared and portal opens cleanly
            if (enemy.isBoss && enemy.hp <= 0) {
                // Remove its bar if present
                try {
                    this.removeBossBar(enemy.id);
                } catch (e) {}
            }

            // Spin boss ring for extra visibility
            if (enemy.isBoss && enemy.bossRing) {
                enemy.bossRing.rotation.z += dt * 0.8;
            }
            
            // If ground enemy somehow walks into lava, handle it
            if ((enemy.type !== 'ghost_default' && enemy.type !== 'ghost_deadly') &&
                this.isLava(enemy.body.position.x, enemy.body.position.z)) {
                
                // If it's a boss, NEVER despawn it. Teleport it to safety near player.
                if (enemy.isBoss) {
                    this.teleportEnemyNearPlayer(enemy);
                } else {
                    // Regular mobs just die/despawn
                    this.despawnEnemy(enemy);
                    this.createEnemy();
                }
                continue;
            }

            // Smart Teleport Logic (Anti-stuck)
            // If an enemy hasn't reached the player's island within 20 seconds, teleport them
            if (!enemy.isBoss && enemy.type !== 'ghost_default' && enemy.type !== 'ghost_deadly') {
                // Determine if enemy is effectively stuck (far away)
                const toEnemy = new THREE.Vector3().subVectors(enemy.mesh.position, playerPos);
                const distFar = toEnemy.length();
                
                // Track time being far away
                if (distFar > 30) {
                    enemy.stuckTimer = (enemy.stuckTimer || 0) + dt;
                } else {
                    enemy.stuckTimer = 0;
                }

                if (enemy.stuckTimer > 20) {
                     // Check visibility (behind player) before teleporting
                    toEnemy.normalize();
                    const forward = new THREE.Vector3(0, 0, -1).applyAxisAngle(
                        new THREE.Vector3(0, 1, 0),
                        this.cameraRotation
                    );
                    const dot = forward.dot(toEnemy);
                    // Dot < 0 means behind, roughly. 
                    // Let's use specific angle check to be safe.
                    // Actually, if they are stuck for 20s, just teleport them somewhere valid near player (behind preferred)
                    this.teleportEnemyNearPlayer(enemy);
                    enemy.stuckTimer = 0;
                }
            }

            // Remove fallen
            if (enemy.body.position.y < -30) {
                this.killEnemy(enemy);
            }
        }

        // Check boss death logic
        if (this.bossEnemy && this.bossEnemy.hp <= 0) {
             if (this.bossEnemy.isMainBoss && !this.bossPortalActivated) {
                this.bossPortalActivated = true;
                
                // In Survival mode, sync win
                if (this.gameMode === 'SURVIVAL' && this.room) {
                    this.room.send({ type: 'boss_defeated' });
                }
                
                // Activate the portal visuals
                if (this.bossPortal && this.bossPortal.visuals) {
                    const v = this.bossPortal.visuals;
                    v.visible = true; // REVEAL portal on death
                    // Find parts by user data
                    v.children.forEach(c => {
                        if (c.userData.isRim) {
                            c.material.color.setHex(0x00ffff); // Cyan
                        }
                        if (c.userData.isSpinner) {
                            c.visible = true; // Show spinner
                        }
                        if (c.userData.isParticleSystem) {
                            c.visible = true; // Show particles
                        }
                    });
                    
                    // Add a massive beacon beam
                    const beamGeo = new THREE.CylinderGeometry(1, 1, 100, 16, 1, true);
                    const beamMat = new THREE.MeshBasicMaterial({ 
                        color: 0x00ffff, 
                        transparent: true, 
                        opacity: 0.3,
                        side: THREE.DoubleSide,
                        blending: THREE.AdditiveBlending
                    });
                    const beam = new THREE.Mesh(beamGeo, beamMat);
                    beam.position.y = 50;
                    v.add(beam);
                }
                
                this.playSound('boom', 0.5, 0.6); // Activation sound
                this.showToast('Main Boss defeated! Portal ACTIVATED!');
                this.removeBossBar(this.bossEnemy.id);
                this.bossEnemy = null;
             } else if (!this.bossEnemy.isMainBoss) {
                // Miniboss defeated
                this.removeBossBar(this.bossEnemy.id);
                this.showToast(`${this.bossEnemy.name} Defeated!`);
                this.bossEnemy = null; // Clear reference so other bosses can spawn
             }
        }
        
        // Update boss bars for ALL active bosses (Bob, Miniboss, etc.)
        for (let e of this.enemies) {
            if (e.isBoss) {
                this.updateBossBar(e);
            }
        }
    }
    
    triggerMonkeUnlock() {
        // Animation sequence
        this.isPaused = true;
        
        // Spawn Monke
        const monkeGroup = new THREE.Group();
        // (Copy visual logic or simplified)
        const furMat = new THREE.MeshStandardMaterial({ color: 0x5C4033 });
        const body = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.8, 0.6), furMat);
        body.position.y = 0.7;
        monkeGroup.add(body);
        const head = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.6, 0.6), furMat);
        head.position.y = 1.45;
        monkeGroup.add(head);
        const glasses = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.15, 0.1), new THREE.MeshStandardMaterial({ color: 0x111111 }));
        glasses.position.set(0, 1.55, 0.32);
        monkeGroup.add(glasses);
        
        monkeGroup.position.copy(this.monkeCrate.pos);
        monkeGroup.position.y = this.getTerrainHeight(this.monkeCrate.pos.x, this.monkeCrate.pos.z);
        this.scene.add(monkeGroup);
        this.scene.remove(this.monkeCrate.mesh); // Remove crate

        // Backflip animation
        let t = 0;
        const anim = () => {
            t += 0.05;
            monkeGroup.position.y += Math.sin(t * Math.PI) * 0.2;
            monkeGroup.rotation.x -= 0.3; // Flip
            
            if (t < 2) {
                requestAnimationFrame(anim);
                this.renderer.render(this.scene, this.camera);
            } else {
                // Done flip, open portal
                monkeGroup.rotation.x = 0;
                monkeGroup.position.y = this.getTerrainHeight(this.monkeCrate.pos.x, this.monkeCrate.pos.z);
                
                // Spawn Portal
                const ring = new THREE.Mesh(new THREE.TorusGeometry(2, 0.2, 16, 32), new THREE.MeshBasicMaterial({ color: 0x00ffff }));
                ring.position.copy(monkeGroup.position);
                ring.position.z -= 2;
                ring.position.y += 1.5;
                this.scene.add(ring);
                
                // Unlock
                this.unlockCharacter('MONKE');

                // Play Monke's Theme snippet as requested
                const themeUrl = "./MONKE'S THEME.mp3";
                this.loadSound(themeUrl, 'monke_theme').then(buf => {
                    if(!buf) return;
                    // Fade out current BGM
                    if(this.currentBgmGain) this.currentBgmGain.gain.linearRampToValueAtTime(0, this.audioCtx.currentTime + 0.5);
                    
                    const src = this.audioCtx.createBufferSource();
                    src.buffer = buf;
                    const gain = this.audioCtx.createGain();
                    gain.gain.value = 0;
                    src.connect(gain);
                    gain.connect(this.audioCtx.destination);
                    src.start(0);
                    
                    // Fade In
                    gain.gain.linearRampToValueAtTime(0.6, this.audioCtx.currentTime + 0.5);
                    
                    // Play briefly then fade out
                    setTimeout(() => {
                        gain.gain.linearRampToValueAtTime(0, this.audioCtx.currentTime + 0.5);
                        src.stop(this.audioCtx.currentTime + 0.5);
                        // Restore main BGM
                        if(this.currentBgmGain) this.currentBgmGain.gain.linearRampToValueAtTime(0.35, this.audioCtx.currentTime + 1.0);
                    }, 3000);
                });
                
                setTimeout(() => {
                    this.scene.remove(monkeGroup);
                    this.scene.remove(ring);
                    this.isPaused = false;
                    this.showToast('Monke Unlocked!');
                }, 3500); // Wait for song snippet
            }
        };
        anim();
    }

    teleportEnemyNearPlayer(enemy) {
        // Robust instant teleport to prevent physics explosions or disappearances.
        const playerPos = new THREE.Vector3().copy(this.playerBody.position);
        const radius = 22;
        const maxTries = 15;

        // Choose a target spot near the player (prefer behind)
        let chosen = null;
        for (let i = 0; i < maxTries; i++) {
            const angle = this.cameraRotation + Math.PI + (Math.random() - 0.5) * 1.5; // broadly behind
            const dist = radius + Math.random() * 5;
            const x = playerPos.x + Math.sin(angle) * dist;
            const z = playerPos.z + Math.cos(angle) * dist;
            if (this.isLava(x, z)) continue;
            const terrainY = this.getTerrainHeight(x, z);
            chosen = { x, z, y: terrainY };
            break;
        }

        // If no safe spot found, just pick a spot near player slightly in air
        if (!chosen) {
            chosen = { x: playerPos.x, z: playerPos.z, y: playerPos.y + 10 };
        }

        try {
            // Effects at old pos
            if (this.particleSystem) this.particleSystem.emit(enemy.mesh.position.clone(), 0xff00ff, 15);
            
            // Hard reset of physics state
            // Lift slightly above target Y to ensure no ground clipping
            const safeY = chosen.y + enemy.size + 0.5;
            
            enemy.body.position.set(chosen.x, safeY, chosen.z);
            enemy.body.velocity.set(0, 0, 0);
            enemy.body.angularVelocity.set(0, 0, 0);
            
            // Sync mesh immediately
            enemy.mesh.position.copy(enemy.body.position);
            
            // Effects at new pos
            if (this.particleSystem) this.particleSystem.emit(enemy.mesh.position.clone(), 0xff00ff, 15);
            
            if (this.debugMode) {
                this.showToast(`${enemy.name || enemy.type || 'Enemy'} teleported!`);
            }
        } catch (e) {
            console.warn("Teleport failed", e);
        }
    }
    
    updateChests(dt) {
        const playerPos = new THREE.Vector3().copy(this.playerBody.position);
        
        for (let chest of this.chests) {
            // Recompute dynamic chest cost only when the player's coin total changes
            if (chest && chest.baseCost) {
                // If we've never computed or the player's coins have changed since last compute, recalc.
                if (chest._lastPlayerCoins !== this.coins) {
                    const computed = this.computeChestCost(chest.baseCost);
                    chest.cost = computed.cost;
                    chest._lastComputedMultiplier = computed.multiplier;
                    chest._lastPlayerCoins = this.coins;

                    // Update label if changed
                    try {
                        const lbl = chest.costLabel;
                        if (lbl && chest._lastComputedCost !== chest.cost) {
                            chest._lastComputedCost = chest.cost;
                            const ctx = lbl.ctx;
                            const canvas = lbl.canvas;
                            ctx.clearRect(0, 0, canvas.width, canvas.height);
                            ctx.fillStyle = 'rgba(0,0,0,0.65)';
                            ctx.fillRect(0, 0, canvas.width, canvas.height);
                            ctx.fillStyle = '#ffd700';
                            ctx.font = 'bold 28px monospace';
                            ctx.textAlign = 'center';
                            ctx.textBaseline = 'middle';
                            ctx.fillText(`COST: ${chest.cost}`, canvas.width / 2, canvas.height / 2);
                            lbl.tex.needsUpdate = true;
                        }
                        // Position label above chest (in case terrain height changed)
                        if (lbl && chest.position) {
                            lbl.sprite.position.set(chest.position.x, chest.position.y + 1.6, chest.position.z);
                        }
                    } catch (e) {}
                } else {
                    // Still update label position even when cost doesn't change
                    try {
                        const lbl = chest.costLabel;
                        if (lbl && chest.position) {
                            lbl.sprite.position.set(chest.position.x, chest.position.y + 1.6, chest.position.z);
                        }
                    } catch (e) {}
                }
            }

            if (chest.opened) {
                // hide label when opened
                try {
                    if (chest.costLabel && chest.costLabel.sprite) {
                        chest.costLabel.sprite.visible = false;
                    }
                } catch (e) {}
                continue;
            }
            
            const dist = playerPos.distanceTo(chest.position);
            // show label only when nearby enough or always visible (we'll keep it visible so players can see price)
            try {
                if (chest.costLabel && chest.costLabel.sprite) {
                    chest.costLabel.sprite.visible = true;
                }
            } catch (e) {}

            if (dist < 2) {
                const price = chest.cost || chest.baseCost || 0;
                if (price > 0 && this.coins < price) {
                    if (!chest._notified) {
                        this.showToast(`Need ${price} coins (you have ${this.coins})`);
                        chest._notified = true;
                    }
                    continue;
                }
                if (price > 0) {
                    // Deduct cost and then update the chest-baseline snapshot so future chest price calculations
                    // reflect that the player has already paid for a chest; this prevents kills from altering price.
                    this.coins -= price;
                    this.updateUI();
                    // Update global chest baseline only when a chest is actually opened/purchased.
                    this.chestBaselineCoins = this.coins;
                }

                chest.opened = true;
                chest.lidMesh.rotation.x = Math.PI / 3;
                
                // hide label on open
                try { if (chest.costLabel && chest.costLabel.sprite) chest.costLabel.sprite.visible = false; } catch(e){}

                let upgrade = chest.upgrade;
                let lootName = 'Upgrade';
                
                // Logic check: avoid giving duplicate NEW items if slots are full
                let giveUpgrade = true;
                
                // If it's a new weapon but slots full -> force random owned weapon upgrade
                if (WEAPONS[upgrade] && !this.weapons.includes(upgrade) && !this.canAddWeapon()) {
                    const owned = this.weapons.filter(w => w !== 'DEFAULT');
                    if (owned.length > 0) {
                        upgrade = owned[Math.floor(Math.random() * owned.length)];
                    } else {
                        giveUpgrade = false; // No upgradeable weapon, fallback to health
                    }
                }
                // If it's a new rune but slots full
                else if (RUNES[upgrade] && !this.runes.includes(upgrade) && !this.canAddRune()) {
                    const owned = this.runes;
                    if (owned.length > 0) {
                        upgrade = owned[Math.floor(Math.random() * owned.length)];
                    } else {
                        giveUpgrade = false;
                    }
                }
                
                if (giveUpgrade) {
                    if (WEAPONS[upgrade]) {
                        lootName = WEAPONS[upgrade].name + (this.weapons.includes(upgrade) ? " (Level Up)" : " (New)");
                        if (!this.weapons.includes(upgrade)) {
                            this.weapons.push(upgrade);
                            this.weaponLevels[upgrade] = 1;
                        } else {
                            this.weaponLevels[upgrade] = (this.weaponLevels[upgrade] || 1) + 1;
                        }
                    } else if (RUNES[upgrade]) {
                        lootName = RUNES[upgrade].name + (this.runes.includes(upgrade) ? " (Level Up)" : " (New)");
                        if (!this.runes.includes(upgrade)) {
                            this.runes.push(upgrade);
                            this.runeLevels[upgrade] = 1;
                            this.applyRune(upgrade);
                        } else {
                            this.runeLevels[upgrade] = (this.runeLevels[upgrade] || 1) + 1;
                            this.applyRune(upgrade);
                        }
                    }
                    this.showToast(`Chest loot: ${lootName} (Paid ${price})`);
                } else {
                    // Fallback Reward
                    this.playerHealth = Math.min(this.maxHealth, this.playerHealth + 30);
                    this.coins += 20;
                    this.updateUI();
                    this.showToast(`Chest: HP Restored + 20 Coins! (Paid ${price})`);
                }
                
                this.playSynth('unlock', 0.8, 0.4);
                this.particleSystem.emit(chest.position, 0xFFD700, 20);
                
                // Temporary audio dip for chest opening
                if (this.currentBgmGain) this.currentBgmGain.gain.setTargetAtTime(0.15, this.audioCtx.currentTime, 0.1);
                if (this.currentBgmNode) this.currentBgmNode.playbackRate.setValueAtTime(0.5, this.audioCtx.currentTime);
                
                setTimeout(() => {
                    // Only restore if we haven't entered a pause menu (like level up) in the meantime
                    if (!this.isPaused) {
                        if (this.currentBgmGain) this.currentBgmGain.gain.setTargetAtTime(0.35, this.audioCtx.currentTime, 0.5);
                        if (this.currentBgmNode) this.currentBgmNode.playbackRate.setValueAtTime(1.0, this.audioCtx.currentTime);
                    }
                }, 1200);

                this.updateLoadoutUI();
            } else {
                chest._notified = false;
            }
        }
    }
    
    updateShrines(dt) {
        // If shrines were cleared (e.g. during world reset) just bail out safely
        if (!this.shrines || !Array.isArray(this.shrines) || this.shrines.length === 0) return;

        const playerPos = new THREE.Vector3().copy(this.playerBody.position);
        
        for (let shrine of this.shrines) {
            // Defensive guards: skip any shrine missing its visual pieces to avoid undefined errors
            if (!shrine || !shrine.crystal || !shrine.barrier) continue;
            const crystalMat = shrine.crystal.material;
            const barrierMat = shrine.barrier.material;
            if (!crystalMat || !barrierMat) continue;

            // Basic idle spin
            shrine.crystal.rotation.y += dt * 2;
            
            if (!shrine.used) {
                const dist = playerPos.distanceTo(shrine.position);
                if (dist < 3) {
                    // Player is in range
                    shrine.isActivating = true;
                    shrine.activationTime += dt;
                    
                    // Simple progress tracking avoiding NaN or complex color lerps
                    const progress = Math.min(1, shrine.activationTime / shrine.requiredTime);

                    // All material accesses are guarded through local refs
                    if (typeof barrierMat.opacity === 'number') {
                        barrierMat.opacity = 0.2 + progress * 0.5;
                    }
                    
                    // Safe pulsing
                    const pulse = Math.sin(this.gameTime * 10) * 0.5 + 0.5;
                    if (barrierMat.emissive) {
                        barrierMat.emissiveIntensity = 0.5 + pulse;
                    }
                    
                    // Fixed color stages to prevent "world disappearing" glitches
                    if (barrierMat.color && barrierMat.emissive) {
                        if (progress < 0.5) {
                            barrierMat.color.setHex(0x00ffff);
                            barrierMat.emissive.setHex(0x00ffff);
                        } else {
                            barrierMat.color.setHex(0xffd700);
                            barrierMat.emissive.setHex(0xffd700);
                        }
                    }
                    
                    shrine.barrier.scale.setScalar(1 + pulse * 0.1);
                    shrine.crystal.rotation.y += dt * 10 * progress;

                    // Update Charge Ring
                    if (shrine.chargeRing) {
                        shrine.chargeRing.visible = true;
                        if (shrine.chargeRing.material.uniforms) {
                            shrine.chargeRing.material.uniforms.uProgress.value = progress;
                            if (progress > 0.5) {
                                shrine.chargeRing.material.uniforms.uColor.value.setHex(0xffd700);
                            } else {
                                shrine.chargeRing.material.uniforms.uColor.value.setHex(0x00ffff);
                            }
                        }
                    }

                    // Optimized Particle emission (Reduced rate)
                    if (this.particleSystem && Math.random() < 0.1) {
                        const pos = shrine.position.clone();
                        pos.y += Math.random() * 3;
                        pos.x += (Math.random() - 0.5) * 2;
                        pos.z += (Math.random() - 0.5) * 2;
                        this.particleSystem.emit(pos, progress < 0.5 ? 0x00ffff : 0xffd700, 1);
                    }
                    
                    if (shrine.activationTime >= shrine.requiredTime) {
                        shrine.used = true;
                        shrine.barrier.visible = false;
                        if (shrine.chargeRing) shrine.chargeRing.visible = false;
                        if (crystalMat.emissive) {
                            crystalMat.emissive.setHex(0x555555);
                            crystalMat.emissiveIntensity = 0.1;
                        }
                        this.playSound('boom', 0.5, 0.3);
                        if (this.particleSystem) {
                            this.particleSystem.emit(shrine.position, 0xffd700, 30);
                        }
                        this.showShrineUpgradeMenu();
                    }
                } else {
                    // Reset when player leaves shrine area
                    if (shrine.isActivating) {
                        shrine.activationTime = 0;
                        shrine.isActivating = false;
                        if (crystalMat.emissive) {
                            crystalMat.emissiveIntensity = 1;
                        }
                        if (typeof barrierMat.opacity === 'number') {
                            barrierMat.opacity = 0.3;
                        }
                        shrine.barrier.scale.setScalar(1);
                        if (barrierMat.color && barrierMat.emissive) {
                            barrierMat.color.setHex(0x00ffff);
                            barrierMat.emissive.setHex(0x00ffff);
                            barrierMat.emissiveIntensity = 0;
                        }
                    }
                }
            }
        }
    }
    
    showShrineUpgradeMenu() {
        // Apply audio dampening
        if (this.currentBgmGain) {
            this.currentBgmGain.gain.setTargetAtTime(0.15, this.audioCtx.currentTime, 0.1);
        }
        if (this.currentBgmNode) {
            this.currentBgmNode.playbackRate.setValueAtTime(0.5, this.audioCtx.currentTime);
        }
        this.playSynth('levelup');

        if (this.gameMode !== 'MULTI') this.isPaused = true;
        this.upgradeMenu.classList.add('active');
        // Release pointer lock
        if (document.exitPointerLock) {
            try { document.exitPointerLock(); } catch(e) {}
        }
        
        const allUpgrades = Object.keys(UPGRADES);
        const selected = [];
        
        // Pick 3 random upgrades with rarities
        for (let i = 0; i < 3; i++) {
            if (allUpgrades.length === 0) break;
            const idx = Math.floor(Math.random() * allUpgrades.length);
            const key = allUpgrades.splice(idx, 1)[0];
            const rarity = this.rollRarity();
            selected.push({ key, rarity });
        }
        
        this.upgradeOptions.innerHTML = '';
        selected.forEach(option => {
            const upgrade = UPGRADES[option.key];
            const rarityData = RARITIES[option.rarity];
            
            // Calculate dynamic description value
            let val = 0;
            if (upgrade.add) val = upgrade.add * rarityData.mult;
            else if (upgrade.mult) val = (upgrade.mult - 1) * rarityData.mult; // approx for display?
            
            // Format value
            let valStr = val.toString();
            if (upgrade.percent) valStr = Math.round(val * 100);
            else if (val % 1 !== 0) valStr = val.toFixed(1);
            
            // Interpolate description
            let desc = upgrade.baseDesc ? upgrade.baseDesc.replace('{VAL}', valStr) : upgrade.desc;

            const card = document.createElement('div');
            card.className = 'upgrade-card';
            card.style.borderColor = `#${rarityData.color.toString(16).padStart(6, '0')}`;
            card.innerHTML = `
                <h3 style="color: #${rarityData.color.toString(16).padStart(6, '0')}">${upgrade.name}</h3>
                <p style="font-size: 0.7rem; color: #${rarityData.color.toString(16).padStart(6, '0')}">${rarityData.name}</p>
                <p>${desc}</p>
            `;
            card.onclick = () => this.selectShrineUpgrade(option.key, option.rarity);
            this.upgradeOptions.appendChild(card);
        });
    }
    
    rollRarity() {
        const luckBonus = this.stats.luck || 0;
        const roll = Math.random() - luckBonus;
        
        let cumulative = 0;
        for (let [key, rarity] of Object.entries(RARITIES).reverse()) {
            cumulative += rarity.chance;
            if (roll <= cumulative) {
                return key;
            }
        }
        return 'COMMON';
    }
    
    selectShrineUpgrade(key, rarity) {
        // Restore audio
        if (this.currentBgmGain) {
            this.currentBgmGain.gain.setTargetAtTime(0.35, this.audioCtx.currentTime, 0.1);
        }
        if (this.currentBgmNode) {
            this.currentBgmNode.playbackRate.setValueAtTime(1.0, this.audioCtx.currentTime);
        }
        this.playSynth('ui');

        const upgrade = UPGRADES[key];
        const rarityData = RARITIES[rarity];
        
        if (upgrade.add) {
            this.stats[upgrade.stat] = (this.stats[upgrade.stat] || 0) + (upgrade.add * rarityData.mult);
        } else if (upgrade.mult) {
            this.stats[upgrade.stat] = (this.stats[upgrade.stat] || 1) * (upgrade.mult * rarityData.mult);
        }

        if (!this.buffs) this.buffs = [];
        this.buffs.push(`${upgrade.name} (${rarityData.name})`);
        this.updateLoadoutUI();
        
        this.upgradeMenu.classList.remove('active');
        if (this.gameMode !== 'MULTI') this.isPaused = false;
    }

    updateAuraVisual(key, colorHex) {
        if (this.auraVisuals[key]) return; // Already exists

        // Create visual sphere attached to player mesh
        // Base geometry radius = 1.0 so we can scale directly by desired radius
        const geo = new THREE.SphereGeometry(1.0, 16, 16); 
        const mat = new THREE.MeshBasicMaterial({
            color: colorHex,
            transparent: true,
            opacity: 0.15,
            wireframe: true
        });
        const mesh = new THREE.Mesh(geo, mat);
        mesh.userData.isAura = true;
        this.playerMesh.add(mesh);
        this.auraVisuals[key] = mesh;
    }

    updateAuraScale(key, radius) {
        if (this.auraVisuals[key]) {
            this.auraVisuals[key].scale.setScalar(radius);
        }
    }

    // Targeting Helper: Gets valid enemies AND players if in PVP
    getValidTargets() {
        const targets = [...this.enemies];
        // If PVP enabled (MULTI + Overtime) or if we want FFA, add remote players
        // Currently PVP only active in Overtime for MULTI mode
        if (this.gameMode === 'MULTI' && this.overtimeActive) {
            Object.values(this.remotePlayers).forEach(rp => {
                // Wrap in enemy-like structure for weapon logic
                targets.push({
                    mesh: rp.mesh,
                    hp: 100, // Dummy
                    size: 1.0,
                    isPlayer: true,
                    id: rp.data.clientId // Use client ID
                });
            });
        }
        return targets;
    }

    damageTarget(target, amount) {
        if (target.isPlayer) {
            // Request damage on remote player
            // Find client ID
            // Since we stored client ID as ID in wrapper
            // But wait, wrapper id is `rp.data.clientId`? Wait, remotePlayers keys ARE clientIds.
            const clientId = Object.keys(this.remotePlayers).find(key => this.remotePlayers[key].mesh === target.mesh);
            if (clientId) {
                this.room.requestPresenceUpdate(clientId, {
                    type: 'damage',
                    amount: amount
                });
                // Visual feedback locally
                this.spawnDamageNumber(target.mesh.position.clone().add(new THREE.Vector3(0,2,0)), Math.round(amount), true);
            }
        } else {
            this.damageEnemy(target, amount);
        }
    }

    updateWeapons(dt) {
        const playerPos = new THREE.Vector3().copy(this.playerBody.position);
        const fireRateMult = Math.max(0.3, this.stats.fireRate || 1);
        const targets = this.getValidTargets();

        // Lightning
        if (this.weapons.includes('LIGHTNING')) {
            this.weaponTimers.LIGHTNING = (this.weaponTimers.LIGHTNING || 0) + dt;
            const level = this.weaponLevels.LIGHTNING || 1;
            let cooldown = Math.max(0.5, 2 - level * 0.3);
            if (this.characterKey === 'BLITZ') {
                cooldown *= 0.7;
            }
            cooldown /= fireRateMult;
            
            if (this.weaponTimers.LIGHTNING >= cooldown) {
                this.weaponTimers.LIGHTNING = 0;
                
                // Find closest
                let closest = null;
                let minDist = Infinity;
                for (let enemy of targets) {
                    const dist = playerPos.distanceTo(enemy.mesh.position);
                    if (dist < 12 && dist < minDist) {
                        minDist = dist;
                        closest = enemy;
                    }
                }
                
                if (closest) {
                    const baseDmg = 0.5 * level * (this.stats.damage || 1);
                    this.damageTarget(closest, baseDmg);
                    this.particleSystem.emit(closest.mesh.position, 0x00ffff, 10);
                }
            }
        }
        
        // Ghost
        if (this.weapons.includes('GHOST')) {
            this.weaponTimers.GHOST = (this.weaponTimers.GHOST || 0) + dt;
            const level = this.weaponLevels.GHOST || 1;
            // Buffed: Much faster fire rate (1.5s base)
            let cooldown = Math.max(0.5, 1.5 - level * 0.1);
            cooldown /= fireRateMult;
            
            if (this.weaponTimers.GHOST >= cooldown) {
                this.weaponTimers.GHOST = 0;
                this.spawnGhost();
            }
            
            // Update ghosts
            for (let i = this.ghosts.length - 1; i >= 0; i--) {
                const ghost = this.ghosts[i];
                ghost.lifetime += dt;
                
                // Move toward nearest enemy
                let nearest = null;
                let minDist = Infinity;
                for (let enemy of this.enemies) {
                    const dist = ghost.mesh.position.distanceTo(enemy.mesh.position);
                    if (dist < minDist) {
                        minDist = dist;
                        nearest = enemy;
                    }
                }
                
                if (nearest && minDist < 35) {
                    const dir = new THREE.Vector3().subVectors(nearest.mesh.position, ghost.mesh.position).normalize();
                    // Buffed: Faster movement speed (15 instead of 5)
                    ghost.mesh.position.addScaledVector(dir, 15 * dt);
                    
                    // Explode if close
                    if (minDist < 1.5) {
                        // AOE damage
                        for (let enemy of this.enemies) {
                            const dist = ghost.mesh.position.distanceTo(enemy.mesh.position);
                            if (dist < 3.5) {
                                // Buffed: Higher damage (4.0 base instead of 0.3)
                                const baseDmg = 4.0 * level * (this.stats.damage || 1);
                                this.damageEnemy(enemy, baseDmg);
                            }
                        }
                        this.particleSystem.emit(ghost.mesh.position, 0x00ff00, 20);
                        this.scene.remove(ghost.mesh);
                        this.ghosts.splice(i, 1);
                        continue;
                    }
                }
                
                ghost.mesh.rotation.y += dt * 3;
                
                if (ghost.lifetime > 10) {
                    this.scene.remove(ghost.mesh);
                    this.ghosts.splice(i, 1);
                }
            }
        }
        
        // Fireball
        if (this.weapons.includes('FIREBALL')) {
            this.weaponTimers.FIREBALL = (this.weaponTimers.FIREBALL || 0) + dt;
            const level = this.weaponLevels.FIREBALL || 1;
            let cooldown = Math.max(0.4, 1.6 - level * 0.2);
            if (this.characterKey === 'FOX') {
                cooldown *= 0.6; // Fox slings fireballs fast
            }
            cooldown /= fireRateMult;
            
            if (this.weaponTimers.FIREBALL >= cooldown) {
                this.weaponTimers.FIREBALL = 0;
                this.shootFireball();
            }
        }
        
        // Spinning blade
        if (this.weapons.includes('SWORD')) {
            const level = this.weaponLevels.SWORD || 1;
            
            // Ensure we have the right number of blades
            while (this.orbitingBlades.length < level) {
                // Enhanced blade - glowing sword
                const group = new THREE.Group();
                
                const blade = new THREE.Mesh(
                    new THREE.BoxGeometry(0.5, 0.15, 2),
                    new THREE.MeshStandardMaterial({ 
                        color: 0xff0000,
                        emissive: 0xff0000,
                        emissiveIntensity: 1.5,
                        flatShading: true
                    })
                );
                group.add(blade);
                
                const edge = new THREE.Mesh(
                    new THREE.BoxGeometry(0.2, 0.05, 2.2),
                    new THREE.MeshBasicMaterial({ 
                        color: 0xffaa00,
                        transparent: true,
                        opacity: 0.7
                    })
                );
                group.add(edge);
                
                const hilt = new THREE.Mesh(
                    new THREE.BoxGeometry(0.3, 0.3, 0.4),
                    new THREE.MeshStandardMaterial({ 
                        color: 0x333333,
                        flatShading: true
                    })
                );
                hilt.position.z = -0.8;
                group.add(hilt);
                
                this.scene.add(group);
                this.orbitingBlades.push({ mesh: group, angle: (Math.PI * 2 / level) * this.orbitingBlades.length });
            }
            
            // Update blade positions
            for (let i = 0; i < this.orbitingBlades.length; i++) {
                const blade = this.orbitingBlades[i];
                blade.angle += dt * 2;
                
                const radius = 2.5;
                blade.mesh.position.set(
                    playerPos.x + Math.cos(blade.angle) * radius,
                    playerPos.y,
                    playerPos.z + Math.sin(blade.angle) * radius
                );
                blade.mesh.rotation.y = blade.angle + Math.PI / 2;
                
                // Check damage
                for (let enemy of this.enemies) {
                    const dist = blade.mesh.position.distanceTo(enemy.mesh.position);
                    if (dist < 1.0) {
                        // Buffed: 5.0 base DPS per blade
                        const baseDps = 5.0 * (this.stats.damage || 1);
                        this.damageEnemy(enemy, baseDps * dt);
                        this.particleSystem.emit(enemy.mesh.position, 0xff0000, 6);
                        this.playSound('bonk', 1.0 + Math.random() * 0.2, 0.12);
                    }
                }
            }
        }
        
        // Slutty Missiles (reworked Homing Missile): arc up, then aggressively seek
        if (this.weapons.includes('MISSILE')) {
            this.weaponTimers.MISSILE = (this.weaponTimers.MISSILE || 0) + dt;
            const level = this.weaponLevels.MISSILE || 1;
            let cooldown = Math.max(0.7, 2.4 - level * 0.3);
            cooldown /= fireRateMult;
            
            if (this.weaponTimers.MISSILE >= cooldown) {
                this.weaponTimers.MISSILE = 0;
                this.shootMissile();
            }
        }

        // New weapons: Spike Ring – periodic radial damage + spike visuals that reach farther with upgrades
        if (this.weapons.includes('SPIKE_RING')) {
            this.weaponTimers.SPIKE_RING = (this.weaponTimers.SPIKE_RING || 0) + dt;
            const level = this.weaponLevels.SPIKE_RING || 1;
            const baseCooldown = 4.0;
            const cooldown = Math.max(1.4, baseCooldown - level * 0.45); // slightly faster with upgrades

            if (this.weaponTimers.SPIKE_RING >= cooldown) {
                this.weaponTimers.SPIKE_RING = 0;

                // Radius scales with level and Big Aura stat
                const radius = (3.0 + level * 0.9) * (this.stats.areaMult || 1);
                const dmg = 1.2 * (this.stats.damage || 1) * level;

                // Spawn spike visuals and apply immediate damage falloff
                const spikeCount = 12 + Math.floor(level * 2);
                this.spawnSpikeRing(radius, spikeCount, dmg);

                // Extra particle feedback
                this.particleSystem.emit(playerPos.clone(), 0xffffff, 10);
            }
        }

        // New weapons: Poison Mist – constant light damage in a small radius
        if (this.weapons.includes('POISON_MIST')) {
            this.updateAuraVisual('POISON_MIST', 0x00ff00);
            const level = this.weaponLevels.POISON_MIST || 1;
            const radius = (2.7 + level * 0.4) * (this.stats.areaMult || 1);
            this.updateAuraScale('POISON_MIST', radius);
            
            // Reduced tick rate: 0.5s instead of 0.2s (Slower attacks)
            this.weaponTimers.POISON_MIST = (this.weaponTimers.POISON_MIST || 0) + dt;
            const tickRate = 0.5;
            
            if (this.weaponTimers.POISON_MIST >= tickRate) {
                this.weaponTimers.POISON_MIST = 0;
                // Nerfed damage: base 0.7 down from 0.9, scaled to tick rate
                const dmg = (0.7 * level * (this.stats.damage || 1)) * tickRate * 4;

                for (let enemy of this.enemies) {
                    const dist = enemy.mesh.position.distanceTo(playerPos);
                    if (dist <= radius) {
                        this.damageEnemy(enemy, dmg);
                    }
                }
            }
        }

        if (this.weapons.includes('SPIKE_RING')) {
             const level = this.weaponLevels.SPIKE_RING || 1;
             const radius = (3.0 + level * 0.6) * (this.stats.areaMult || 1);
             this.updateAuraVisual('SPIKE_RING', 0x666666);
             this.updateAuraScale('SPIKE_RING', radius);
        }

        // New weapon: Ice Aura – slows and chips enemies near you
        if (this.weapons.includes('ICE_AURA')) {
            this.updateAuraVisual('ICE_AURA', 0x00ffff);
            const level = this.weaponLevels.ICE_AURA || 1;
            const radius = (3.0 + level * 0.5) * (this.stats.areaMult || 1);
            this.updateAuraScale('ICE_AURA', radius);
            
            // Reduced tick rate: Damage every 0.8s (Even slower)
            this.weaponTimers.ICE_AURA = (this.weaponTimers.ICE_AURA || 0) + dt;
            const tickRate = 0.8;
            
            if (this.weaponTimers.ICE_AURA >= tickRate) {
                this.weaponTimers.ICE_AURA = 0;
                // Nerfed damage: base 0.4 down from 0.6
                const dmg = (0.4 * level * (this.stats.damage || 1)) * tickRate * 4;

                for (let enemy of this.enemies) {
                    const dist = enemy.mesh.position.distanceTo(playerPos);
                    if (dist <= radius) {
                        enemy.slowUntil = this.gameTime + 0.6;
                        this.damageEnemy(enemy, dmg);
                        // Visual chill effect
                        if (Math.random() > 0.7) this.particleSystem.emit(enemy.mesh.position, 0x00ffff, 2);
                    }
                }
            }
        }

        // New weapon: Nova Blast – periodic big explosion from your position
        if (this.weapons.includes('NOVA_BLAST')) {
            this.weaponTimers.NOVA_BLAST = (this.weaponTimers.NOVA_BLAST || 0) + dt;
            const level = this.weaponLevels.NOVA_BLAST || 1;
            let cooldown = Math.max(2.5, 6.0 - level * 0.7);
            cooldown /= fireRateMult;

            if (this.weaponTimers.NOVA_BLAST >= cooldown) {
                this.weaponTimers.NOVA_BLAST = 0;
                const radius = (4.0 + level * 0.8) * (this.stats.areaMult || 1);
                const dmg = 2.5 * level * (this.stats.damage || 1);

                this.spawnSlash(playerPos.clone());

                for (let enemy of this.enemies) {
                    const dist = enemy.mesh.position.distanceTo(playerPos);
                    if (dist <= radius) {
                        this.damageEnemy(enemy, dmg * (1 - dist / radius));
                    }
                }
            }
        }

        // Bananerang: Thrown, arcs back
        if (this.weapons.includes('BANANERANG')) {
            this.weaponTimers.BANANERANG = (this.weaponTimers.BANANERANG || 0) + dt;
            const level = this.weaponLevels.BANANERANG || 1;
            let cooldown = Math.max(0.6, 1.8 - level * 0.2);
            if (this.characterKey === 'MONKE') cooldown *= 0.6;
            cooldown /= fireRateMult;
            
            if (this.weaponTimers.BANANERANG >= cooldown) {
                this.weaponTimers.BANANERANG = 0;
                this.shootBananerang(level);
            }
        }

        // Boberto's Spooky Bois (Ghost Summon)
        if (this.weapons.includes('SUMMON_GHOST')) {
            this.weaponTimers.SUMMON_GHOST = (this.weaponTimers.SUMMON_GHOST || 0) + dt;
            const level = this.weaponLevels.SUMMON_GHOST || 1;
            // Upgrades increase spawn rate slowly
            // Base cooldown ~3s, reduces slightly
            let cooldown = Math.max(0.5, 3.5 - level * 0.15); 
            cooldown /= fireRateMult;
            
            if (this.weaponTimers.SUMMON_GHOST >= cooldown) {
                this.weaponTimers.SUMMON_GHOST = 0;
                
                // Determine Ghost Type
                let type = 'normal';
                let life = 6.0;
                let hp = 10;
                let scale = 1.0;
                let color = 0xccffcc; // Default friendly ghost color
                
                // 2% chance for Deadly at Lvl 5+
                if (level >= 5 && Math.random() < 0.02) {
                    type = 'deadly';
                    life = 10.0;
                    scale = 1.3;
                    color = 0xff0000;
                }
                
                // 1% chance for Mini Bob at Lvl 12+
                if (level >= 12 && Math.random() < 0.01) {
                    type = 'bob';
                    life = 45.0;
                    scale = 2.0;
                    color = 0x222222;
                }
                
                // Spawn position: "around you... a little farther"
                const angle = Math.random() * Math.PI * 2;
                const dist = 10 + Math.random() * 5;
                const sx = playerPos.x + Math.cos(angle) * dist;
                const sz = playerPos.z + Math.sin(angle) * dist;
                const sy = this.getTerrainHeight(sx, sz) + 2.0;
                
                // Visuals
                const group = new THREE.Group();
                
                if (type === 'bob') {
                    // Mini Bob visual (Cube head)
                    const head = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ color: 0x444444 }));
                    group.add(head);
                    const eye = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.2, 0.1), new THREE.MeshBasicMaterial({ color: 0xffffff }));
                    eye.position.set(0, 0.1, 0.5);
                    group.add(eye);
                } else {
                    // Ghost visual (Sheet)
                    const mat = new THREE.MeshStandardMaterial({ color: color, transparent: true, opacity: 0.8 });
                    const core = new THREE.Mesh(new THREE.CapsuleGeometry(0.4 * scale, 1.0 * scale, 4, 8), mat);
                    group.add(core);
                    // Eyes
                    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.1 * scale), new THREE.MeshBasicMaterial({ color: 0x000000 }));
                    eye.position.set(-0.15*scale, 0.2*scale, 0.35*scale);
                    group.add(eye);
                    const eye2 = eye.clone();
                    eye2.position.x = 0.15*scale;
                    group.add(eye2);
                }
                
                group.position.set(sx, sy, sz);
                this.scene.add(group);
                
                const dmgBase = type === 'bob' ? 50 : (type === 'deadly' ? 20 : 8);
                const damage = dmgBase * level * (this.stats.damage || 1);
                
                this.projectiles.push({
                    mesh: group,
                    velocity: new THREE.Vector3(0,0,0),
                    damage: damage,
                    life: life,
                    isFriendlyGhost: true,
                    isDeadly: type === 'deadly',
                    isMiniBob: type === 'bob',
                    attackTimer: 0
                });
                
                this.particleSystem.emit(group.position, color, 10);
            }
        }

        // New weapon: Mini Turret – orbiting bots that auto-shoot
        if (this.weapons.includes('MINI_TURRET')) {
            const level = this.weaponLevels.MINI_TURRET || 1;
            const desiredTurrets = Math.min(3, 1 + Math.floor(level / 2));
            while (this.turrets.length < desiredTurrets) {
                const mesh = new THREE.Mesh(
                    new THREE.BoxGeometry(0.4, 0.6, 0.4),
                    new THREE.MeshStandardMaterial({
                        color: 0x00c0ff,
                        emissive: 0x00c0ff,
                        emissiveIntensity: 0.8,
                        flatShading: true
                    })
                );
                mesh.position.copy(playerPos);
                this.scene.add(mesh);
                this.turrets.push({
                    mesh,
                    angle: (Math.PI * 2 / desiredTurrets) * this.turrets.length,
                    fireTimer: 0
                });
            }

            const turretRadius = 2.2;
            const fireInterval = Math.max(0.4, 1.2 - level * 0.15) / fireRateMult;

            for (let turret of this.turrets) {
                turret.angle += dt * 1.5;
                turret.mesh.position.set(
                    playerPos.x + Math.cos(turret.angle) * turretRadius,
                    playerPos.y + 0.8,
                    playerPos.z + Math.sin(turret.angle) * turretRadius
                );

                turret.fireTimer += dt;
                if (turret.fireTimer >= fireInterval && this.enemies.length > 0) {
                    turret.fireTimer = 0;
                    let nearest = null;
                    let minDist = Infinity;
                    for (let enemy of this.enemies) {
                        const d = enemy.mesh.position.distanceTo(turret.mesh.position);
                        if (d < 14 && d < minDist) {
                            minDist = d;
                            nearest = enemy;
                        }
                    }
                    if (nearest) {
                        const dir = new THREE.Vector3()
                            .subVectors(nearest.mesh.position, turret.mesh.position)
                            .normalize();
                        const projMesh = new THREE.Mesh(
                            new THREE.SphereGeometry(0.18, 6, 6),
                            new THREE.MeshStandardMaterial({
                                color: 0x00e0ff,
                                emissive: 0x00e0ff,
                                emissiveIntensity: 1.2
                            })
                        );
                        projMesh.position.copy(turret.mesh.position);
                        this.scene.add(projMesh);
                        this.projectiles.push({
                            mesh: projMesh,
                            velocity: dir.multiplyScalar(26),
                            damage: 0.9 * level * (this.stats.damage || 1),
                            life: 3,
                            isTurret: true
                        });
                    }
                }
            }
        }
    }
    
    spawnGhost() {
        // Enhanced ghost visuals - spectral orb with trail
        const group = new THREE.Group();
        
        const core = new THREE.Mesh(
            new THREE.SphereGeometry(0.5, 8, 8),
            new THREE.MeshStandardMaterial({ 
                color: 0x00ff88,
                transparent: true,
                opacity: 0.7,
                emissive: 0x00ff88,
                emissiveIntensity: 1
            })
        );
        group.add(core);
        
        // Outer glow
        const glow = new THREE.Mesh(
            new THREE.SphereGeometry(0.8, 8, 8),
            new THREE.MeshBasicMaterial({ 
                color: 0x00ff88,
                transparent: true,
                opacity: 0.3
            })
        );
        group.add(glow);
        
        // Eyes
        const eye1 = new THREE.Mesh(
            new THREE.SphereGeometry(0.1),
            new THREE.MeshBasicMaterial({ color: 0x000000 })
        );
        eye1.position.set(-0.15, 0.1, 0.4);
        group.add(eye1);
        
        const eye2 = eye1.clone();
        eye2.position.x = 0.15;
        group.add(eye2);
        
        group.position.copy(this.playerMesh.position);
        group.position.y += 2;
        this.scene.add(group);
        
        this.ghosts.push({ mesh: group, lifetime: 0 });
    }

    // Spawn a radial spike volley visual + immediate damage application (used by Spike Ring)
    spawnSpikeRing(radius = 3.0, count = 14, damage = 5) {
        // Visual spikes (cones) created around the player and removed after a short time.
        const center = this.playerMesh.position.clone();
        const spikes = [];
        for (let i = 0; i < count; i++) {
            const angle = (i / count) * Math.PI * 2 + (Math.random() - 0.5) * 0.05;
            const dir = new THREE.Vector3(Math.cos(angle), 0, Math.sin(angle));
            const spike = new THREE.Mesh(
                new THREE.ConeGeometry(0.12, Math.max(0.6, radius * 0.35), 6),
                new THREE.MeshStandardMaterial({ color: 0x999999, emissive: 0xffcc88, flatShading: true })
            );
            // place near player, rotated outward
            spike.position.copy(center).addScaledVector(dir, 0.9);
            spike.position.y = center.y + 0.5;
            spike.lookAt(center.clone().add(dir));
            // scale by radius for "reach"
            spike.userData = { dir: dir.clone(), speed: radius * 2.2 };
            this.scene.add(spike);
            spikes.push(spike);
        }

        // Immediate damage application to enemies within the spike max radius
        for (let enemy of this.enemies.slice()) {
            const d = enemy.mesh.position.distanceTo(center);
            if (d <= radius + 0.8) {
                // damage falls off with distance
                const fall = 1 - (d / (radius + 0.8));
                this.damageEnemy(enemy, damage * Math.max(0.35, fall));
            }
        }

        // Animate spikes outward & fade then remove after short lifetime
        const lifetime = 0.55;
        const start = performance.now();
        const tick = () => {
            const t = (performance.now() - start) / 1000;
            for (let sp of spikes) {
                sp.position.addScaledVector(sp.userData.dir, sp.userData.speed * (1/60) * Math.min(1, t * 4));
                sp.material.opacity = Math.max(0, 1 - t * 1.8);
                sp.scale.setScalar(1 - t * 0.6);
            }
            if (t < lifetime) {
                requestAnimationFrame(tick);
            } else {
                for (let sp of spikes) {
                    try { this.scene.remove(sp); } catch (e) {}
                }
            }
        };
        tick();

        // Small particle burst
        this.particleSystem.emit(center.clone(), 0xffcc88, 20);
    }
    
    shootFireball() {
        if (this.enemies.length === 0) return;
        
        const playerPos = new THREE.Vector3().copy(this.playerBody.position);
        let nearest = null;
        let minDist = Infinity;
        
        for (let enemy of this.enemies) {
            const dist = playerPos.distanceTo(enemy.mesh.position);
            if (dist < minDist && dist <= this.stats.attackRange * 1.5) {
                minDist = dist;
                nearest = enemy;
            }
        }
        
        if (!nearest) return;
        
        const baseDir = new THREE.Vector3().subVectors(nearest.mesh.position, this.playerMesh.position).normalize();
        
        const count = 1 + (this.stats.extraProjectiles || 0);
        // Spread logic: center the volley
        const totalSpread = Math.min(Math.PI / 2, count * 0.2); 
        const startAngle = count > 1 ? -totalSpread / 2 : 0;
        const step = count > 1 ? totalSpread / (count - 1) : 0;

        for (let i = 0; i < count; i++) {
            const angle = startAngle + step * i;
            const dir = baseDir.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), angle);

            // Enhanced fireball - core + flame aura
            const group = new THREE.Group();
            
            const core = new THREE.Mesh(
                new THREE.SphereGeometry(0.4, 8, 8),
                new THREE.MeshStandardMaterial({ 
                    color: 0xff6600,
                    emissive: 0xff4400,
                    emissiveIntensity: 2
                })
            );
            group.add(core);
            
            const flames = new THREE.Mesh(
                new THREE.SphereGeometry(0.6, 8, 8),
                new THREE.MeshBasicMaterial({ 
                    color: 0xff8800,
                    transparent: true,
                    opacity: 0.5
                })
            );
            group.add(flames);
            
            group.position.copy(this.playerMesh.position);
            group.position.y += 1;
            this.scene.add(group);
            
            this.projectiles.push({
                mesh: group,
                velocity: dir.multiplyScalar(30),
                damage: 1.5 * (this.stats.damage || 1),
                life: 3,
                isFireball: true,
                hitIds: [] // Track hits for piercing
            });
        }
    }
    
    shootMissile() {
        // Slutty Missiles: launch upward in a sexy arc, then hard-seek targets
        if (this.enemies.length === 0) return;
        
        const playerPos = new THREE.Vector3().copy(this.playerBody.position);
        
        // Sort enemies by distance from player
        const enemiesCopy = [...this.enemies].sort((a,b) => 
            playerPos.distanceTo(a.mesh.position) - playerPos.distanceTo(b.mesh.position)
        );
        
        const count = 1 + (this.stats.extraProjectiles || 0);
        const targets = [];
        for (let i = 0; i < count; i++) {
            if (enemiesCopy.length === 0) break;
            targets.push(enemiesCopy[i % enemiesCopy.length]);
        }
        if (targets.length === 0) return;
        
        targets.forEach((target, i) => {
            const group = new THREE.Group();
            const body = new THREE.Mesh(
                new THREE.ConeGeometry(0.2, 0.8, 6),
                new THREE.MeshStandardMaterial({ color: 0xaaaaaa, emissive: 0x666666, flatShading: true })
            );
            group.add(body);
            group.position.copy(this.playerMesh.position);
            group.position.y += 1.2;
            this.scene.add(group);
            
            // Initial direction: mostly upward, slight horizontal bias so it arcs out of you first
            const upward = new THREE.Vector3(0, 1, 0);
            const toTargetFlat = new THREE.Vector3()
                .subVectors(target.mesh.position, this.playerMesh.position)
                .setY(0)
                .normalize()
                .multiplyScalar(0.35); // small horizontal drift
            const initialDir = upward.clone().add(toTargetFlat).normalize();

            const speed = 24;
            const baseVelocity = initialDir.multiplyScalar(speed);
            
            // Slight horizontal spread between multiple missiles
            const spreadAngle = (i % 2 === 0 ? 1 : -1) * (Math.ceil(i / 2) * 0.15);
            baseVelocity.applyAxisAngle(new THREE.Vector3(0,1,0), spreadAngle);

            this.projectiles.push({
                mesh: group,
                velocity: baseVelocity,
                damage: 1.0 * (this.stats.damage || 1),
                life: 5,
                isMissile: true,
                target: target,
                arcingTime: 0.35,   // seconds spent arcing up before full seek
                age: 0,
                homing: false,
                hitIds: []
            });
        });
    }

    shootBananerang(level) {
        if(this.enemies.length === 0) return;
        
        // Nearest enemy as primary target direction
        let nearest = null;
        let minDist = Infinity;
        for (let enemy of this.enemies) {
            const dist = this.playerMesh.position.distanceTo(enemy.mesh.position);
            if (dist < minDist) { minDist = dist; nearest = enemy; }
        }
        if(!nearest) return;

        const baseDir = new THREE.Vector3().subVectors(nearest.mesh.position, this.playerMesh.position).normalize();
        
        const count = 1 + (this.stats.extraProjectiles || 0);
        // Fan out bananerangs
        const totalSpread = Math.min(Math.PI, count * 0.3);
        const startAngle = count > 1 ? -totalSpread / 2 : 0;
        const step = count > 1 ? totalSpread / (count - 1) : 0;

        for (let i = 0; i < count; i++) {
            const angle = startAngle + step * i;
            const dir = baseDir.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), angle);

            const banana = new THREE.Mesh(
                new THREE.BoxGeometry(0.6, 0.2, 0.2),
                new THREE.MeshStandardMaterial({ color: 0xffff00 })
            );
            banana.position.copy(this.playerMesh.position);
            banana.position.y += 1;
            this.scene.add(banana);

            this.projectiles.push({
                mesh: banana,
                velocity: dir.multiplyScalar(22),
                damage: 1.5 * (this.stats.damage || 1) * level,
                life: 3,
                isBoomerang: true,
                returnState: 0, // 0: out, 1: returning
                owner: this.playerMesh,
                hitIds: []
            });
        }
    }

    spawnSlash(position) {
        // Bright U-shaped ground slash at the player's feet
        const innerRadius = 0.45;
        const outerRadius = 2.2;
        const thetaLength = Math.PI * 0.9;
        const geometry = new THREE.RingGeometry(innerRadius, outerRadius, 32, 1, -thetaLength / 2, thetaLength);
        const material = new THREE.MeshBasicMaterial({
            color: 0xffee00,
            transparent: true,
            opacity: 1.0,
            side: THREE.DoubleSide
        });
        const slash = new THREE.Mesh(geometry, material);
        slash.rotation.x = -Math.PI / 2;
        slash.position.set(position.x, position.y + 0.02, position.z);
        this.scene.add(slash);

        this.slashes.push({
            mesh: slash,
            life: 0.45
        });

        this.playSound('boom', 1.4, 0.25);
    }

    // Teleport / respawn helper: bring the player back to a safe start location
    respawnPlayer() {
        // In Creative Pantheon, just reset to 0,10,0 or starting plat
        if (this.gameMode === 'PANTHEON' && this.pantheonState === 'CREATIVE') {
            this.playerBody.position.set(0, 10, 0);
            this.playerBody.velocity.set(0,0,0);
            if(this.playerMesh) this.playerMesh.position.set(0, 10, 0);
            this.isFlying = false;
            return;
        }

        if (!this.spawnPoint) {
            // fallback spawn
            this.spawnPoint = new THREE.Vector3(0, this.getTerrainHeight(0,0) + this.playerRadius + 0.05, 0);
        }
        // Reset physics position and velocity
        this.playerBody.position.set(this.spawnPoint.x, this.spawnPoint.y, this.spawnPoint.z);
        this.playerBody.velocity.set(0, 0, 0);
        if (this.playerBody.angularVelocity) this.playerBody.angularVelocity.set(0,0,0);

        // Place visual model so feet sit on the ground
        const yOffset = this.playerMesh ? (this.playerMesh.userData.verticalOffset || 0.1) : 0.1;
        if (this.playerMesh) {
            this.playerMesh.position.set(this.spawnPoint.x, this.spawnPoint.y - this.playerRadius + 1.0 + yOffset, this.spawnPoint.z);
            this.playerMesh.quaternion.set(0,0,0,1);
        }

        // Small safety so player doesn't immediately re-fall
        this.playerBody.velocity.y = 0;

        // Minor heal/update HUD so respawn isn't too punishing
        this.playerHealth = Math.min(this.maxHealth, Math.max(1, this.playerHealth));
        if (this.healthBar) this.healthBar.style.width = (this.playerHealth / this.maxHealth * 100) + '%';
        if (this.healthText) this.healthText.innerText = `${Math.floor(this.playerHealth)} / ${this.maxHealth}`;

        // brief feedback
        this.showToast('You were returned to spawn.');
        this.playSound('bonk', 1.0, 0.25);
    }

    knightSlash() {
        // Determine weapon stats based on available weapon levels
        const swordLvl = this.weaponLevels['KNIGHT_SWORD'] || 0;
        const gigaLvl = this.weaponLevels['GIGA_SWORD'] || 0;
        
        // Use the stronger sword if both exist (rare case)
        const isGiga = gigaLvl > 0 && (gigaLvl >= swordLvl || this.characterKey === 'SIR_CHAD');
        const level = isGiga ? gigaLvl : Math.max(1, swordLvl);
        
        // Cooldown improves slightly with level
        const baseCD = isGiga ? 0.65 : 0.5;
        if (this.knightSlashCooldown > 0) return;
        this.knightSlashCooldown = Math.max(0.25, baseCD - level * 0.02);

        const origin = this.playerMesh.position.clone();
        this.spawnSlash(origin);

        // Swing sword forward if model exists
        if (this.playerSword) {
            this.playerSword.rotation.z = -0.8;
            setTimeout(() => {
                if (this.playerSword) this.playerSword.rotation.z = 0;
            }, 120);
        }

        const forward = new THREE.Vector3(0, 0, -1)
            .applyAxisAngle(new THREE.Vector3(0, 1, 0), this.cameraRotation);

        const baseRange = isGiga ? 7.0 : 5.0;
        const range = baseRange + level * 0.3;
        const damageMult = isGiga ? 5.0 : 3.0;
        const dmg = damageMult * (this.stats.damage || 1) * level;

        for (let enemy of this.enemies) {
            const toEnemy = new THREE.Vector3().subVectors(enemy.mesh.position, origin);
            const dist = toEnemy.length();
            if (dist > range) continue;
            toEnemy.normalize();
            const dot = forward.dot(toEnemy);
            if (dot > 0.3) {
                this.damageEnemy(enemy, dmg);
                // Visual hit
                this.particleSystem.emit(enemy.mesh.position, 0xffffff, 5);
            }
        }
        
        // Play sound
        this.playSynth('slice', isGiga ? 0.5 : 1.0, 0.5);
    }

    throwBone() {
        if (this.enemies.length === 0) return;
        const level = this.weaponLevels['BONE'] || 1;

        const playerPos = new THREE.Vector3().copy(this.playerBody.position);
        let nearest = null;
        let minDist = Infinity;
        for (let enemy of this.enemies) {
            const d = playerPos.distanceTo(enemy.mesh.position);
            if (d < minDist) {
                minDist = d;
                nearest = enemy;
            }
        }
        if (!nearest) return;

        const dir = new THREE.Vector3()
            .subVectors(nearest.mesh.position, this.playerMesh.position)
            .normalize();

        const bone = new THREE.Mesh(
            new THREE.BoxGeometry(0.2, 0.2, 0.9),
            new THREE.MeshStandardMaterial({ color: 0xffffff, flatShading: true })
        );
        bone.position.copy(this.playerMesh.position);
        bone.position.y += 1;
        this.scene.add(bone);

        const bounces = 2 + Math.floor(level / 2);
        const dmg = 1.1 * (this.stats.damage || 1) * level;
        const life = 0.8 + level * 0.1;

        this.projectiles.push({
            mesh: bone,
            velocity: dir.multiplyScalar(30),
            damage: dmg,
            life: life,
            isBone: true,
            bouncesLeft: bounces
        });

        this.playSound('bonk', 1.2, 0.3);
    }

    updateSlashes(dt) {
        for (let i = this.slashes.length - 1; i >= 0; i--) {
            const s = this.slashes[i];
            s.life -= dt;
            if (s.life <= 0) {
                this.scene.remove(s.mesh);
                this.slashes.splice(i, 1);
                continue;
            }
            const baseLife = 0.45;
            const t = 1 - s.life / baseLife;
            s.mesh.material.opacity = 1.0 * (1 - t);
            const scale = 1 + t * 0.4;
            s.mesh.scale.set(scale, scale, scale);
        }
    }

    updateEnemyBullets(dt) {
        const playerPos = new THREE.Vector3().copy(this.playerBody.position);
        for (let i = this.enemyBullets.length - 1; i >= 0; i--) {
            const b = this.enemyBullets[i];
            b.life -= dt;
            b.mesh.position.addScaledVector(b.velocity, dt);

            // Tiny smoke trail
            if (this.particleSystem) {
                this.particleSystem.emit(b.mesh.position.clone(), 0x444444, 1);
            }

            const distToPlayer = b.mesh.position.distanceTo(playerPos);
            if (distToPlayer < 1.0) {
                const dmg = 8 * 0.25; // pistol shot, quartered
                this.takeDamage(dmg);
                this.scene.remove(b.mesh);
                this.enemyBullets.splice(i, 1);
                continue;
            }

            if (b.life <= 0) {
                this.scene.remove(b.mesh);
                this.enemyBullets.splice(i, 1);
            }
        }
    }
    
    updateXPOrbs(dt) {
        const playerPos = new THREE.Vector3(
            this.playerBody.position.x,
            this.playerBody.position.y,
            this.playerBody.position.z
        );
        
        for (let i = this.xpOrbs.length - 1; i >= 0; i--) {
            const orb = this.xpOrbs[i];
            
            const dist = orb.mesh.position.distanceTo(playerPos);
            if (dist < this.stats.pickupRange) {
                orb.targetPlayer = true;
            }
            
            // Juice: Trail particles when flying
            if (orb.targetPlayer && this.particleSystem && Math.random() > 0.6) {
                this.particleSystem.emit(orb.mesh.position, 0x00ff88, 1);
            }
            
            const collected = orb.update(dt, playerPos);
            if (collected) {
                const baseXp = 1;
        const gain = this.gameMode === 'MULTI' ? baseXp * 2 : baseXp;
        this.collectXP(gain);
                orb.destroy(this.scene);
                this.xpOrbs.splice(i, 1);
                this.playSound('bonk', 2.0, 0.15);
            }
        }
    }

    updateAudioDynamics() {
        if (!this.currentBgmNode || !this.isPlaying) return;

        // 1. Health-based Speed (Pitch)
        // If health drops below 40%, slow down music linearly down to 0.6x at 0% HP
        const hpRatio = Math.max(0, this.playerHealth / this.maxHealth);
        let targetRate = 1.0;
        if (hpRatio < 0.4) {
            // Map 0.4 -> 1.0, 0.0 -> 0.6
            const t = hpRatio / 0.4; // 0 to 1
            targetRate = 0.6 + 0.4 * t;
        }
        
        // Smoothly adjust playback rate
        if (this.currentBgmNode.playbackRate) {
            const current = this.currentBgmNode.playbackRate.value;
            this.currentBgmNode.playbackRate.value += (targetRate - current) * 0.05;
        }

        // 2. Intensity-based Volume
        // If many enemies are close, increase volume slightly
        let intensity = 0;
        const pPos = this.playerBody.position;
        // Count enemies within 15 units
        let closeCount = 0;
        for (let e of this.enemies) {
            if (pPos.distanceTo(e.body.position) < 15) closeCount++;
        }
        
        // Base volume is 0.35. Max boost +0.15
        const baseVol = 0.35;
        const boost = Math.min(0.15, closeCount * 0.015);
        const targetVol = baseVol + boost;
        
        if (this.currentBgmGain) {
            const currentVol = this.currentBgmGain.gain.value;
            this.currentBgmGain.gain.value += (targetVol - currentVol) * 0.05;
        }

        // 3. Overtime Visuals (Red Vignette Pulse)
        if (this.overtimeActive) {
            const vignette = document.getElementById('overtime-vignette');
            if (vignette) {
                vignette.style.display = 'block';
                this.analyser.getByteFrequencyData(this.audioDataArray);
                // Get bass energy (low bins)
                let bass = 0;
                for(let i=0; i<10; i++) bass += this.audioDataArray[i];
                bass /= 10; // 0-255 average
                
                // Map to opacity/box-shadow spread
                // Ensure a base visibility so it's always red in overtime, pulsing adds more
                const spread = 80 + (bass / 255) * 200;
                const opacity = 0.4 + (bass / 255) * 0.6;
                vignette.style.boxShadow = `inset 0 0 ${spread}px rgba(255, 0, 0, ${opacity})`;
            }
        } else {
            const vignette = document.getElementById('overtime-vignette');
            if (vignette) vignette.style.display = 'none';
        }
    }

    updateCamera() {
        const offset = new THREE.Vector3(
            Math.sin(this.cameraRotation) * this.cameraDistance,
            this.cameraHeight * this.cameraPitch,
            Math.cos(this.cameraRotation) * this.cameraDistance
        );
        
        const targetPos = this.playerMesh.position.clone().add(offset);
        
        // Apply smooth follow
        this.camera.position.x += (targetPos.x - this.camera.position.x) * 0.1;
        this.camera.position.z += (targetPos.z - this.camera.position.z) * 0.1;
        this.camera.position.y += (targetPos.y - this.camera.position.y) * 0.1;

        // Apply Screen Shake
        if (this.screenShake > 0) {
            const shakeAmount = this.screenShake * 0.5;
            this.camera.position.x += (Math.random() - 0.5) * shakeAmount;
            this.camera.position.y += (Math.random() - 0.5) * shakeAmount;
            this.camera.position.z += (Math.random() - 0.5) * shakeAmount;
            this.screenShake = Math.max(0, this.screenShake - 0.02);
        }

        // Prevent camera clipping into ramps / flat-top geometry:
        // Sample along the line from player to camera and ensure camera sits above the highest sampled terrain + clearance.
        // If blocked, slide the camera outward along the player->camera horizontal vector and raise it above the obstruction.
        try {
            const clearance = 0.8; // slightly larger minimum vertical clearance over terrain
            const maxIterations = 10;
            const samples = 6; // number of samples along the segment to check for intersections

            // Horizontal direction from player to camera (normalized)
            const horiz = new THREE.Vector3(
                this.camera.position.x - this.playerMesh.position.x,
                0,
                this.camera.position.z - this.playerMesh.position.z
            );
            const horizLen = horiz.length();

            if (horizLen > 0.001) {
                horiz.normalize();

                // Function: returns highest terrain height along the segment between player and a given candidate camera position
                const highestTerrainAlong = (camPos) => {
                    let highest = -Infinity;
                    for (let s = 0; s <= samples; s++) {
                        const t = s / samples;
                        const sx = this.playerMesh.position.x + (camPos.x - this.playerMesh.position.x) * t;
                        const sz = this.playerMesh.position.z + (camPos.z - this.playerMesh.position.z) * t;
                        const terrainH = this.getTerrainHeight(sx, sz);
                        if (terrainH > highest) highest = terrainH;
                    }
                    return highest;
                };

                // Try a few iterations: if camera is under terrain+clearance, push it outward and recompute.
                let iter = 0;
                let moved = false;
                while (iter < maxIterations) {
                    const camPos = this.camera.position;
                    const highest = highestTerrainAlong(camPos);
                    if (camPos.y >= highest + clearance) break;

                    // If camera is intersecting geometry, move it outward and raise it above the obstruction.
                    const pushDist = Math.max(1.0, horizLen * 0.12) + iter * 0.6; // increase push each iteration
                    this.camera.position.x += horiz.x * pushDist;
                    this.camera.position.z += horiz.z * pushDist;

                    // Raise the camera to clear the highest sampled terrain point
                    this.camera.position.y = highest + clearance + 0.2;

                    moved = true;
                    iter++;
                }

                // If we moved the camera a lot, gently nudge it back a bit toward the ideal target for smoothness
                if (moved) {
                    this.camera.position.x += (targetPos.x - this.camera.position.x) * 0.08;
                    this.camera.position.z += (targetPos.z - this.camera.position.z) * 0.08;
                }
            }
        } catch (e) {
            // In case terrain queries fail, fail silently and keep prior camera position
        }
        
        this.camera.lookAt(this.playerMesh.position);
    }

    spawnDamageNumber(pos, amount, isCrit, isHeal = false) {
        const div = document.createElement('div');
        div.textContent = amount;
        div.style.position = 'absolute';
        
        if (isHeal) {
            div.className = 'damage-number-vamp';
        } else {
            div.style.color = isCrit ? '#ff3333' : '#ffffff';
            div.style.fontWeight = 'bold';
            div.style.fontSize = isCrit ? '20px' : '14px';
            div.style.textShadow = '1px 1px 0 #000';
        }
        
        // Juice: Pop animation
        div.style.transition = 'transform 0.1s cubic-bezier(0.175, 0.885, 0.32, 1.275)';
        div.style.transform = 'translate(-50%, -50%) scale(0.5)';
        setTimeout(() => div.style.transform = 'translate(-50%, -50%) scale(1.2)', 10);
        setTimeout(() => div.style.transform = 'translate(-50%, -50%) scale(1.0)', 150);
        
        div.style.pointerEvents = 'none';
        document.body.appendChild(div);
        
        this.damageNumbers.push({
            el: div,
            worldPos: pos,
            life: 0.8,
            velocity: new THREE.Vector3(
                (Math.random() - 0.5) * 2,
                4,
                (Math.random() - 0.5) * 2
            )
        });
    }

    updateDamageNumbers(dt) {
        if (this.damageNumbers.length === 0) return;
        
        // Project positions
        const widthHalf = window.innerWidth / 2;
        const heightHalf = window.innerHeight / 2;

        for (let i = this.damageNumbers.length - 1; i >= 0; i--) {
            const dn = this.damageNumbers[i];
            dn.life -= dt;
            dn.worldPos.addScaledVector(dn.velocity, dt);
            dn.velocity.y -= 10 * dt; // gravity

            // Screen projection
            const p = dn.worldPos.clone();
            p.project(this.camera);
            
            const x = (p.x * widthHalf) + widthHalf;
            const y = -(p.y * heightHalf) + heightHalf;

            dn.el.style.left = `${x}px`;
            dn.el.style.top = `${y}px`;
            dn.el.style.opacity = dn.life;

            // Cull if behind camera or dead
            if (dn.life <= 0 || p.z > 1) {
                dn.el.remove();
                this.damageNumbers.splice(i, 1);
            }
        }
    }

    updateTimer() {
        let display = "";
        const limit = this.timeLimit || 600;
        
        if (this.gameMode === 'ARCADE' || (this.gameMode === 'MULTI' && !this.overtimeActive) || (this.gameMode === 'SURVIVAL' && !this.overtimeActive)) {
            const totalRemaining = Math.max(0, Math.ceil(limit - this.gameTime));
            const minutes = Math.floor(totalRemaining / 60);
            const seconds = totalRemaining % 60;
            display = `${minutes}:${seconds.toString().padStart(2, '0')}`;
        } else if (this.gameMode === 'TNS') {
            // TNS Tier 4 Warmup Countdown
            if (this.tnsTier === 4 && this.tnsPhase === 0) {
                const warmupLeft = Math.max(0, Math.ceil(this.tnsWarmupDuration - this.tnsTimer));
                display = `BOSS IN: ${warmupLeft}s`;
            } else {
                // Standard elapsed
                const totalElapsed = Math.floor(this.gameTime);
                const minutes = Math.floor(totalElapsed / 60);
                const seconds = totalElapsed % 60;
                display = `${minutes}:${seconds.toString().padStart(2, '0')}`;
            }
        } else {
            // Overtime / Pantheon
            const totalElapsed = Math.floor(this.gameTime);
            const minutes = Math.floor(totalElapsed / 60);
            const seconds = totalElapsed % 60;
            display = `${minutes}:${seconds.toString().padStart(2, '0')}`;
        }
        
        if (this.timerEl) this.timerEl.innerText = display;
        
        // Also update MP center timer
        const mpCenter = document.getElementById('mp-center');
        if (mpCenter) mpCenter.innerText = display;
    }

    startOvertime() {
        this.overtimeActive = true;
        this.overtimeStartTime = this.gameTime;
        this.lavaHeight = 0;

        // Dramatic sky / fog shift
        this.scene.background = new THREE.Color(0x772222);
        this.scene.fog = new THREE.FogExp2(0x772222, 0.018);

        if (this.gameMode === 'MULTI') {
            this.showToast('SUDDEN DEATH! FIGHT!');
            // Clear ALL enemies in multiplayer overtime
            // Remove physics
            this.enemies.forEach(e => {
                try { if (e.body) this.world.removeBody(e.body); } catch(e){}
                try { if (e.mesh) this.scene.remove(e.mesh); } catch(e){}
            });
            this.enemies = []; // Nuke em
            // Also nuke bosses if any
            if(this.bossEnemy) {
                this.removeBossBar(this.bossEnemy.id);
                this.bossEnemy = null;
            }
        } else {
            this.showToast('OVERTIME! Lava is rising and ghosts are coming...');
        }
        
        this.switchToOvertimeBGM();
    }

    createGhost(type) {
        const playerPos = new THREE.Vector3().copy(this.playerBody.position);
        const angle = Math.random() * Math.PI * 2;
        const dist = 30; // Closer spawns in overtime
        const x = playerPos.x + Math.cos(angle) * dist;
        const z = playerPos.z + Math.sin(angle) * dist;
        const terrainY = this.getTerrainHeight(x, z);

        const group = new THREE.Group();

        const isDeadly = type === 'ghost_deadly';

        // Better ghost visuals - long tattered shape (visuals kept slightly higher for effect)
        const color = isDeadly ? 0xff0000 : 0x00ffcc;
        
        const core = new THREE.Mesh(
            new THREE.CapsuleGeometry(isDeadly ? 0.8 : 0.6, 2.0, 4, 8),
            new THREE.MeshStandardMaterial({
                color: color,
                emissive: color,
                emissiveIntensity: 2.0,
                transparent: true,
                opacity: 0.8
            })
        );
        group.add(core);

        const eyeColor = isDeadly ? 0xff0000 : 0x00ffff;
        const eyeL = new THREE.Mesh(
            new THREE.SphereGeometry(0.12),
            new THREE.MeshBasicMaterial({ color: eyeColor })
        );
        eyeL.position.set(-0.25, 0.2, 0.7);
        group.add(eyeL);
        const eyeR = eyeL.clone();
        eyeR.position.x = 0.25;
        group.add(eyeR);

        // Place visual group slightly above the physics body so the visible ghost looks to float,
        // but keep the physics/body near the player's level to make collision checks fair.
        const visualOffset = isDeadly ? 1.0 : 0.6;
        const bodyHover = isDeadly ? 1.2 : 0.9; // physics body hover height above terrain

        group.position.set(x, terrainY + visualOffset + bodyHover, z);
        this.scene.add(group);

        const size = isDeadly ? 1.1 : 0.9;
        const body = new CANNON.Body({
            mass: 0.5,
            position: new CANNON.Vec3(x, terrainY + bodyHover, z),
            linearDamping: 0.3,
            fixedRotation: true,
            // Collision Filter: Group 8 (Ghosts), Collide with 1 (Player) only.
            // This prevents them colliding with world (2) or enemies (4) or each other (8).
            collisionFilterGroup: 8,
            collisionFilterMask: 1
        });
        body.addShape(new CANNON.Sphere(size));
        this.world.addBody(body);

        // Ghost HP tuning: drastically reduce overtime exponential growth so ghosts stay manageable.
        const hpBase = isDeadly ? 22 : 10;

        // Much gentler scaling over time (was 1.35), reduce to 1.08 to massively tone down HP growth.
        const timeSinceOvertime = Math.max(0, this.gameTime - this.overtimeStartTime);
        const timeScale = Math.pow(1.08, timeSinceOvertime / 8);

        const scaledHp = Math.max(6, (hpBase + this.level * (isDeadly ? 1.6 : 0.6)) * timeScale);

        const enemy = {
            id: 'ghost-' + Math.random().toString(36).slice(2),
            mesh: group,
            body,
            hp: scaledHp,
            maxHp: scaledHp,
            size,
            attackCooldown: 0,
            anim: {},
            walkTime: 0,
            type
        };
        this.enemies.push(enemy);
    }

    updateIntro(dt) {
        this.introTime += dt;
        const rawT = Math.min(this.introTime / this.introDuration, 1);
        const t = rawT * rawT * (3 - 2 * rawT); // smoothstep

        // Move player along intro path using manual component-wise interpolation
        this.playerBody.position.x = this.introStartPos.x + (this.introEndPos.x - this.introStartPos.x) * t;
        this.playerBody.position.y = this.introStartPos.y + (this.introEndPos.y - this.introStartPos.y) * t;
        this.playerBody.position.z = this.introStartPos.z + (this.introEndPos.z - this.introStartPos.z) * t;

        this.playerMesh.position.set(
            this.playerBody.position.x,
            this.playerBody.position.y - this.playerRadius + 1.1,
            this.playerBody.position.z
        );

        // Play walk animation during intro
        this.updatePlayerAnimation(dt, true);

        // Portal visuals: animate separation
        if (this.portalGroup) {
            // Emulate "Particles fly out when character goes out"
            // Spawn particles at player pos during the walk
            if (this.particleSystem && Math.random() > 0.6) {
                const pPos = this.playerMesh.position.clone();
                pPos.y += 1;
                // Fly backwards (towards portal) or outwards? User said "fly out when character goes out"
                // Probably burst forward
                this.particleSystem.emit(pPos, 0x00ffff, 2);
            }

            const scale = 1 - 0.2 * t;
            this.portalGroup.scale.setScalar(Math.max(0.1, scale));

            // Animate internal components of portalGroup if they exist
            this.portalGroup.children.forEach(child => {
                if (child.userData.isSpinner) {
                    child.rotation.z += dt * 5;
                }
                if (child.userData.isParticleSystem) {
                    child.rotation.y -= dt;
                }
            });

            if (rawT > 0.7) {
                // Quick Fade
                this.portalGroup.scale.multiplyScalar(0.9);
            }
        }

        if (rawT >= 1) {
            // Intro sequence finished
            
            // Check Lore for new players
            const hasReadLore = localStorage.getItem('uberthump_lore_read');
            
            // If first time, show lore note
            if (!hasReadLore && !this._showingLore) {
                this._showingLore = true; // prevent loop
                this.showLoreNote();
                // Pause simulation while note is up
                return; 
            }

            // Cleanup portal visuals
            if (this.portalGroup) {
                this.scene.remove(this.portalGroup);
                this.portalGroup = null;
                this.portalRing = null;
                this.portalCore = null;
            }
            this.inIntro = false;
            this.isPlaying = true;
            
            const bars = document.getElementById('cinematic-bars');
            if (bars) bars.classList.remove('active');
        }
    }

    showLoreNote() {
        const overlay = document.getElementById('lore-note-overlay');
        if (overlay) {
            overlay.style.display = 'flex';
            this.isPaused = true;
            if (document.exitPointerLock) document.exitPointerLock();
        }

        // Duck and slow music for lore note (only save once)
        try {
            if (!this._savedBgmState) {
                this._savedBgmState = {
                    gain: this.currentBgmGain ? (this.currentBgmGain.gain.value || 0.35) : 0.35,
                    rate: this.currentBgmNode ? (this.currentBgmNode.playbackRate.value || 1.0) : 1.0
                };
                if (this.currentBgmGain && this.currentBgmGain.gain) {
                    this.currentBgmGain.gain.setTargetAtTime(this._savedBgmState.gain * 0.3, this.audioCtx.currentTime, 0.05);
                }
                if (this.currentBgmNode && this.currentBgmNode.playbackRate) {
                    try { this.currentBgmNode.playbackRate.setValueAtTime(this._savedBgmState.rate * 0.5, this.audioCtx.currentTime); } catch(e){}
                }
            }
        } catch (e) {}
    }

    hideLoreNote() {
        const overlay = document.getElementById('lore-note-overlay');
        if (overlay && overlay.style.display === 'flex') {
            overlay.style.display = 'none';
            
            // Mark as read
            if (!localStorage.getItem('uberthump_lore_read')) {
                localStorage.setItem('uberthump_lore_read', 'true');
                // Trigger Tutorial after first lore read
                setTimeout(() => this.runTutorial(), 200);
            }
            
            this.isPaused = false;
            // If we were stuck in intro loop, this allows it to proceed
            if (this.inIntro && this._showingLore) {
                // Intro loop will check next frame and see hasReadLore=true
                // But we need to ensure the update loop continues
            }

            // Smoothly restore music volume and speed if we previously ducked it
            try {
                if (this._savedBgmState) {
                    if (this.currentBgmGain && this.currentBgmGain.gain) {
                        this.currentBgmGain.gain.setTargetAtTime(this._savedBgmState.gain, this.audioCtx.currentTime, 0.3);
                    }
                    if (this.currentBgmNode && this.currentBgmNode.playbackRate) {
                        try { this.currentBgmNode.playbackRate.setValueAtTime(this._savedBgmState.rate, this.audioCtx.currentTime + 0.15); } catch(e){}
                    }
                    this._savedBgmState = null;
                }
            } catch (e) {}
        }
    }

    // In-game secret note viewing (shares the same overlay as menu, but pauses + ducks BGM)
    showSecretNote() {
        const overlay = document.getElementById('secret-note-overlay');
        if (overlay) {
            overlay.style.display = 'flex';
            this.isPaused = true;
            if (document.exitPointerLock) {
                try { document.exitPointerLock(); } catch(e){}
            }
        }

        // Duck and slow music for secret note
        try {
            if (!this._savedSecretBgmState) {
                this._savedSecretBgmState = {
                    gain: this.currentBgmGain ? (this.currentBgmGain.gain.value || 0.35) : 0.35,
                    rate: this.currentBgmNode ? (this.currentBgmNode.playbackRate.value || 1.0) : 1.0
                };
                if (this.currentBgmGain && this.currentBgmGain.gain) {
                    this.currentBgmGain.gain.setTargetAtTime(this._savedSecretBgmState.gain * 0.3, this.audioCtx.currentTime, 0.05);
                }
                if (this.currentBgmNode && this.currentBgmNode.playbackRate) {
                    try { this.currentBgmNode.playbackRate.setValueAtTime(this._savedSecretBgmState.rate * 0.6, this.audioCtx.currentTime); } catch(e){}
                }
            }
        } catch(e){}
    }

    hideSecretNote() {
        const overlay = document.getElementById('secret-note-overlay');
        if (overlay) {
            overlay.style.display = 'none';
        }
        this.isPaused = false;

        try {
            if (this._savedSecretBgmState) {
                if (this.currentBgmGain && this.currentBgmGain.gain) {
                    this.currentBgmGain.gain.setTargetAtTime(this._savedSecretBgmState.gain, this.audioCtx.currentTime, 0.3);
                }
                if (this.currentBgmNode && this.currentBgmNode.playbackRate) {
                    try { this.currentBgmNode.playbackRate.setValueAtTime(this._savedSecretBgmState.rate, this.audioCtx.currentTime + 0.15); } catch(e){}
                }
                this._savedSecretBgmState = null;
            }
        } catch(e){}
    }

    animate() {
        requestAnimationFrame(() => this.animate());

        const now = performance.now();
        let dt = Math.min((now - this.lastTime) / 1000, 0.1);
        if (this.timeScale) dt *= this.timeScale; // Pantheon time control
        this.lastTime = now;

        // Portal intro sequence runs before the main game loop kicks in
        if (this.inIntro) {
            this.updateIntro(dt);
            this.updateCamera();

            if (this.pixelateEnabled) {
                // Render scene to low-res target, then to screen for pixelated look
                this.renderer.setRenderTarget(this.renderTarget);
                this.renderer.clear();
                this.renderer.render(this.scene, this.camera);
                this.renderer.setRenderTarget(null);
                this.renderer.clear();
                this.renderer.render(this.fsScene, this.fsCamera);
            } else {
                this.renderer.setRenderTarget(null);
                this.renderer.clear();
                this.renderer.render(this.scene, this.camera);
            }

            return;
        }

        if (this.isPlaying && !this.isPaused) {
            this.gameTime += dt;
            this.updateTimer();

            // Start overtime at limit
            const limit = this.timeLimit || 600;
            if (!this.overtimeActive && this.gameTime >= limit) {
                this.startOvertime();
            }

            // Lava rising over time once overtime starts
            if (this.overtimeActive) {
                const t = this.gameTime - this.overtimeStartTime;
                // Very slow rise at first, then slightly faster
                this.lavaHeight = Math.max(0, 0.2 + t * 0.08);
            }
            
            this.world.step(1/60, dt, 3);
            
            this.updatePlayer(dt);
            this.updateProjectiles(dt);
            this.updateEnemies(dt);
            this.updateXPOrbs(dt);
            this.updateChests(dt);
            this.updateShrines(dt);
            this.updateSlashes(dt);
            this.updateEnemyBullets(dt);
            if (this.updateLeaves) {
                this.updateLeaves(dt);
            }
            this.particleSystem.update(dt);
            this.updateDamageNumbers(dt);
            this.updateAudioDynamics();
            this.updateCamera();

            // Tree animation (sway)
            const time = performance.now() * 0.001;
            this.scene.traverse(obj => {
                if (obj.userData.isTree) {
                    const offset = obj.userData.swayOffset || 0;
                    obj.rotation.z = Math.sin(time + offset) * 0.05;
                }
            });

            // Character auras (Upgraded)
            if (this.characterKey === 'GIGACHAD' && this.characterConfig) {
                const level = this.weaponLevels['CHAD_AURA'] || 1;
                const radius = (this.characterConfig.auraRadius || 3) * (this.stats.areaMult || 1) * (1 + level * 0.2);
                const dps = (this.characterConfig.auraDps || 10) * (this.stats.damage || 1) * 2.5 * level;
                
                // Visual update
                if (!this.auraVisuals['CHAD_AURA']) {
                    this.updateAuraVisual('CHAD_AURA', 0xffaa00);
                }
                this.updateAuraScale('CHAD_AURA', radius);

                const origin = new THREE.Vector3().copy(this.playerBody.position);
                for (let enemy of this.enemies) {
                    const dist = origin.distanceTo(enemy.mesh.position);
                    if (dist < radius) {
                        this.damageEnemy(enemy, dps * dt);
                    }
                }
            }

            // Boss Portal Animation
            if (this.bossPortal) {
                // Animate void portal visuals if present
                if (this.bossPortal.visuals) {
                    const visuals = this.bossPortal.visuals;
                    // Spin blade
                    visuals.children.forEach(c => {
                        if (c.userData.isSpinner) {
                            c.rotation.z += dt * 3.0; // Fast spin
                            c.rotation.x = Math.sin(this.gameTime * 2) * 0.2; // Wobble
                        }
                        if (c.userData.isParticleSystem) {
                            c.rotation.y += dt * 0.5;
                            c.children.forEach(p => {
                                // Pulse particles
                                const scale = 1 + Math.sin(this.gameTime * 5 + p.userData.phase) * 0.3;
                                p.scale.setScalar(scale);
                            });
                        }
                        if (c.userData.isBeacon) {
                            c.children.forEach(o => {
                                o.rotation.y += dt * (o.userData.speed || 1);
                            });
                        }
                    });
                }

                // If portal has been activated, entering it still triggers win/transition
                if (this.bossPortalActivated && !this.victoryTriggered) {
                    // Ensure portal visual is visible if activated
                    if (this.bossPortal && this.bossPortal.visuals && !this.bossPortal.visuals.visible) {
                        this.bossPortal.visuals.visible = true;
                    }
                    
                    const p = new THREE.Vector3().copy(this.playerBody.position);
                    // Defensive check in case bossPortal was removed
                    if (this.bossPortal && this.bossPortal.position) {
                        const distToPortal = p.distanceTo(this.bossPortal.position);
                        if (distToPortal < 3.0) {
                            this.winGame();
                            return;
                        }
                    }
                }

                // Enforce sealed boss arena while a boss is active: keep player inside arena sphere
                if (this.bossArena && this.bossEnemy) {
                    try {
                        const center = this.bossArena.center;
                        const radius = this.bossArena.radius;
                        const playerPos = new THREE.Vector3(this.playerBody.position.x, this.playerBody.position.y, this.playerBody.position.z);
                        const toPlayer = new THREE.Vector3().subVectors(playerPos, center);
                        const dist = toPlayer.length();

                        if (dist > radius) {
                            // Push the player back inside the sphere smoothly
                            const excess = dist - radius;
                            const pushDir = toPlayer.normalize();
                            // Move player back a little and reduce their horizontal velocity outward
                            this.playerBody.position.x -= pushDir.x * (excess + 0.1);
                            this.playerBody.position.z -= pushDir.z * (excess + 0.1);
                            this.playerBody.velocity.x *= 0.3;
                            this.playerBody.velocity.z *= 0.3;

                            // One-time toast when sealed (so it isn't spammy)
                            if (!this.bossArena.sealedToastShown) {
                                this.showToast('Arena sealed — defeat the boss or you cannot leave!');
                                this.bossArena.sealedToastShown = true;
                            }
                        }
                    } catch (e) {
                        // Fail silently if position math errors happen
                    }
                }
            }

            // Check Monke Crate interaction
            if (this.monkeCrate && !this.monkeCrate.interacted) {
                 const d = this.playerMesh.position.distanceTo(this.monkeCrate.pos);
                 if (d < 3.5) {
                     if (!this.monkeCrate.toastTime || now - this.monkeCrate.toastTime > 3500) {
                         // Check requirement for toast hint
                         const bananaLvl = this.weaponLevels['BANANERANG'] || 0;
                         const msg = bananaLvl >= 3 ? 'Tap / Left-click to open the cage' : 'LOCKED: Need Bananerang Lv.3';
                         this.showToast(msg);
                         this.monkeCrate.toastTime = now;
                     }
                 }
            }

            // Check secret lore note proximity
            if (this.secretNote && !this.secretNote.collected) {
                const dNote = this.playerMesh.position.distanceTo(this.secretNote.pos);
                if (dNote < 3.0) {
                    this.secretNote.collected = true;
                    this.runFoundSecretNote = true;
                    try { this.scene.remove(this.secretNote.mesh); } catch(e){}
                    // Immediately persist that the secret note has been found so it won't spawn in future runs
                    try { localStorage.setItem('uberthump_secret_note_unlocked', 'true'); } catch (e) {}
                    this.showToast('You found a strange note...');
                    this.playSound('unlock', 0.9, 0.5);
                }
            }

            // Awakening Grave Interaction
            if (this.gameMode === 'AWAKENING') {
                const p = this.playerMesh.position;
                for (let g of this.graves) {
                    if (!g.used) {
                        const dist = Math.hypot(g.x - p.x, g.z - p.z);
                        if (dist < 4) {
                             if (!g.toastTime || now - g.toastTime > 4000) {
                                 this.showToast('Tap / Left-click Grave to Awaken');
                                 g.toastTime = now;
                             }
                        }
                    }
                }
            }

            // Auto attack - default weapon
            this.autoAttackTimer += dt;
            const attackInterval = 1 / this.stats.fireRate;
            if (this.autoAttackTimer >= attackInterval) {
                this.autoAttack();
                this.autoAttackTimer = 0;
            }

            // Click handling covers manual slash, but if a ranged character picks up a sword,
            // we should allow manual slashing via click. The mousedown listener in createPlayer
            // handles this by calling knightSlash().
            
            // Other weapons
            this.updateWeapons(dt);

            // Cooldown tick for knight's auto slash so it can trigger repeatedly
            if (this.knightSlashCooldown > 0) {
                this.knightSlashCooldown = Math.max(0, this.knightSlashCooldown - dt);
            }

            // Spawn enemies
            // Pantheon: No auto-spawns unless toggled (which requires UI we haven't built, so off by default)
            if (this.gameMode === 'PANTHEON' && !this.pantheonSpawning) {
                // Do nothing
            } else if (this.gameMode === 'AWAKENING') {
                // Awakening Mode: Only debuffed Ghosts spawn naturally
                this.spawnTimer += dt;
                if (this.spawnTimer >= 3.0) { // Slower spawn rate
                    this.spawnTimer = 0;
                    this.createGhost('ghost_default'); // Weak ghosts
                }
            } else if (!this.overtimeActive) {
                // Normal ground enemies – slower, less overwhelming spawns
                this.spawnTimer += dt;
                // Start fairly slow and ramp up gently with level.
                // Use a much gentler time-based accel so spawns don't explode after a tier change.
                let baseSpawnDelay = Math.max(0.9, 3.0 - (this.level * 0.04)); // slightly reduced level influence

                if (this.tier > 1) {
                    // Reduce time-based acceleration so spawn frequency grows slowly during a run.
                    // Previously divided by (1 + this.gameTime * 0.01) — now much gentler:
                    const timeAccel = 1 + this.gameTime * 0.004; // slower ramp over time
                    baseSpawnDelay = Math.max(0.6, baseSpawnDelay / timeAccel);
                }

                // Apply any global spawnRateMultiplier if present (kept/reset on tier change)
                if (this.spawnRateMultiplier && this.spawnRateMultiplier > 0) {
                    baseSpawnDelay = baseSpawnDelay / this.spawnRateMultiplier;
                }

                if (this.spawnTimer >= baseSpawnDelay) {
                    // Lowered spawn count slightly for difficulty adjustment
                    const spawnCount = Math.min(6, 1 + Math.floor(this.level / 3));
                    for (let i = 0; i < spawnCount; i++) {
                        this.createEnemy();
                    }
                    this.spawnTimer = 0;
                }
            } else {
                // Overtime: ghost storm replaces regular spawns
                // In MULTI: NO GHOSTS. Just PvP.
                if (this.gameMode !== 'MULTI') {
                    this.ghostSpawnTimer += dt;
                    const t = this.gameTime - this.overtimeStartTime;

                    let interval = this.ghostSpawnRate; // Starts at 1.0, decreases in Tier 2
                    let batchDefault = 2;
                    let batchDeadly = 0;

                    if (t < 60) {
                        // First minute: mostly default ghosts, a bit scary
                        interval = 0.8;
                        batchDefault = 3;
                        batchDeadly = 0;
                    } else if (t < 90) {
                        // Next 30 sec: deadly ghosts join in
                        interval = 0.6;
                        batchDefault = 2;
                        batchDeadly = 2;
                    } else {
                        // After 1:30 of overtime – pure deadly chaos
                        interval = 0.4;
                        batchDefault = 0;
                        batchDeadly = 4;
                    }

                    if (this.ghostSpawnTimer >= interval) {
                        this.ghostSpawnTimer = 0;
                        for (let i = 0; i < batchDefault; i++) {
                            this.createGhost('ghost_default');
                        }
                        for (let i = 0; i < batchDeadly; i++) {
                            this.createGhost('ghost_deadly');
                        }
                    }
                }

                // --- Overtime Bob spawning (Arcade only) ---
                // Bob spawns begin after 2.5 minutes (150s) into OVERTIME, then stack; ensure timing uses overtime start anchor.
                if (this.gameMode !== 'AWAKENING') {
                    // Only proceed if overtime has actually started
                    if (this.overtimeActive && this.gameMode !== 'MULTI' && (this.gameTime >= (this.overtimeStartTime + (this.bobNextSpawnTime || 150)))) {
                        this.bobSpawnCount = (this.bobSpawnCount || 0) + 1;
                        // Attempt to place near portal, fallback near player
                        let sx = 0, sz = 0;
                        if (this.bossPortal && this.bossPortal.position) {
                            sx = this.bossPortal.position.x + (Math.random() - 0.5) * 6;
                            sz = this.bossPortal.position.z + (Math.random() - 0.5) * 6;
                        } else {
                            sx = this.playerBody.position.x + Math.cos(Math.random() * Math.PI*2) * 18;
                            sz = this.playerBody.position.z + Math.sin(Math.random() * Math.PI*2) * 18;
                        }
                        // spawn with OVERTIME_BOB type so spawnBob handles HP/damage specifics
                        this.spawnBob(sx, sz, 'OVERTIME_BOB');

                        // After each spawn, reduce the next interval by 30s down to minimum
                        this.bobSpawnInterval = Math.max(this.bobMinInterval, this.bobSpawnInterval - 30);
                        // Schedule next spawn relative to the overtime anchor
                        this.bobNextSpawnTime = (this.overtimeStartTime || this.gameTime) + this.bobSpawnInterval;
                    }
                }
            }

            // Main Boss spawning near portal if close
            // TNS Tier 4 Logic (handled by timer, no portal proximity needed)
            if (this.gameMode === 'TNS' && this.tnsTier === 4 && !this.bossPortalActivated) {
                // Phase 0: Warmup
                if (this.tnsPhase === 0) {
                    this.tnsTimer += dt;
                    if (this.tnsTimer >= this.tnsWarmupDuration) {
                        this.tnsPhase = 1;
                        this.createBoss(true); // Spawn Barkvader
                        this.showToast("BARKVADER HAS ARRIVED!");
                        this.playSound('boom', 0.5, 1.0);
                    }
                }
                // Boss Logic in updateEnemies handles Phases 2+
            }
            
            // General Boss Spawn by Proximity (Arcade, Awakening, TNS Tiers 1-3)
            // Explicitly allow TNS (except Tier 4) to spawn via proximity
            const allowProximitySpawn = (this.gameMode !== 'TNS') || (this.gameMode === 'TNS' && this.tnsTier < 4);

            if (allowProximitySpawn && !this.bossEnemy && this.bossPortal && !this.bossPortalActivated) {
                const distToPortal = new THREE.Vector3().copy(this.playerBody.position).distanceTo(this.bossPortal.position);
                // Increased range to 30 so it's easier to trigger
                if (distToPortal < 30) {
                    this.createBoss(true); // Main Boss
                }
            }
            
            // Timed Miniboss Spawns (Events)
            // Times: 240s (6m remaining), 360s (4m remaining)
            for(let ev of this.bossEvents) {
                if (!ev.spawned && this.gameTime > ev.time && !this.bossEnemy) {
                    ev.spawned = true;
                    // Prevent miniboss spawns in AWAKENING mode
                    if (this.gameMode !== 'AWAKENING') {
                        this.spawnRandomMiniboss();
                    } else {
                        // skip spawning minibosses in Awakening
                    }
                }
            }
            
            // Cap enemy count to prevent lag (Vampire Survivors has enemy caps too)
            // Keep bosses (main/miniboss) from being removed by the cap to avoid softlocks.
            const maxEnemies = 300; // raised cap to be generous
            let i = 0;
            // Remove non-boss oldest entries first
            while (this.enemies.length > maxEnemies) {
                // find first non-boss enemy (preserve any enemy.isBoss)
                const idx = this.enemies.findIndex(e => !e.isBoss);
                if (idx === -1) break; // all remaining are bosses — stop pruning
                const oldest = this.enemies[idx];
                try { if (oldest.body) this.world.removeBody(oldest.body); } catch(e) {}
                try { if (oldest.mesh) this.scene.remove(oldest.mesh); } catch(e) {}
                this.enemies.splice(idx, 1);
                i++;
                if (i > 1000) break;
            }

            // If the player accidentally falls out of the world, teleport them back to spawn
            if (this.playerBody && this.playerBody.position.y < -30) {
                this.respawnPlayer();
            }
        }

        // Ensure timer shows initial 10:00 before intro/game starts
        if (!this.isPlaying && !this.inIntro) {
            this.updateTimer();
        }

        // Update Multiplayer Sync
        if ((this.gameMode === 'MULTI' || this.gameMode === 'SURVIVAL') && this.room) {
            // Lerp remote players
            Object.values(this.remotePlayers).forEach(rp => {
                if (rp.mesh && rp.target) {
                    rp.mesh.position.lerp(new THREE.Vector3(rp.target.x, rp.target.y, rp.target.z), 0.2);
                    const currentRot = rp.mesh.rotation.y;
                    let targetRot = rp.target.rot;
                    if (targetRot - currentRot > Math.PI) targetRot -= Math.PI * 2;
                    if (targetRot - currentRot < -Math.PI) targetRot += Math.PI * 2;
                    rp.mesh.rotation.y += (targetRot - currentRot) * 0.2;
                }
            });
            
            // Broadcast
            const now = performance.now();
            if (now - this.lastSyncTime > 50) {
                this.broadcastPresence();
                this.lastSyncTime = now;
            }
        }

        // Visual Polish 4: Animated Lava Texture
        // Scroll the lava texture over time for a flowing magma effect
        if (this.baseGroundMesh && this.baseGroundMesh.material && this.baseGroundMesh.material.map) {
            // Assuming this.rockTex or similar is used for floor? Wait, it's procedural color mostly.
            // Ah, createWorld uses this.rockTex for Awakening or color for Arcade. 
            // Arcade lava is just a colored plane.
            // Let's scroll the grass texture? No. 
            // If it's a texture (Awakening), scroll it maybe?
            // If it's Arcade, it's just color.
            // Let's create a noise overlay if we want, but for now let's just stick to the particles we added.
        }

        // Animate Clouds
        if (this.clouds) {
            for (let c of this.clouds) {
                c.mesh.position.x += c.speed * dt;
                if (c.mesh.position.x > 250) c.mesh.position.x = -250;
            }
        }

        // Final render pass (pixelated or clean based on toggle)
        try {
            if (this.pixelateEnabled) {
                this.renderer.setRenderTarget(this.renderTarget);
                this.renderer.clear();
                this.renderer.render(this.scene, this.camera);
                this.renderer.setRenderTarget(null);
                this.renderer.clear();
                this.renderer.render(this.fsScene, this.fsCamera);
            } else {
                this.renderer.setRenderTarget(null);
                this.renderer.clear();
                this.renderer.render(this.scene, this.camera);
            }
        } catch (renderErr) {
            console.error('Render error (game) — skipping frame render:', renderErr);
            try { this.renderer.setRenderTarget(null); this.renderer.clear(); } catch (e) {}
        }

        // Ambient lava embers (Red particles)
        if (this.particleSystem && Math.random() < 0.2) {
            // Only spawn near player to optimize
            const p = this.playerBody.position;
            const angle = Math.random() * Math.PI * 2;
            const dist = 5 + Math.random() * 30; // Radius around player
            const x = p.x + Math.cos(angle) * dist;
            const z = p.z + Math.sin(angle) * dist;
            
            if (this.isLava(x, z)) {
                const y = this.getTerrainHeight(x, z) + 0.2;
                // Red particles for lava
                this.particleSystem.emit(new THREE.Vector3(x, y, z), 0xff2200, 1);
            }
        }
        
        // Sir Chad Eye Particles
        if (this.characterKey === 'SIR_CHAD' && this.playerMesh && this.particleSystem && Math.random() < 0.3) {
            const pPos = this.playerMesh.position.clone();
            pPos.y += 2.15; // Head height
            const fwd = new THREE.Vector3(0, 0, 1).applyQuaternion(this.playerMesh.quaternion);
            const eyeL = pPos.clone().add(fwd.clone().multiplyScalar(0.4)).add(new THREE.Vector3(0,0,0).applyQuaternion(this.playerMesh.quaternion).addScaledVector(new THREE.Vector3(1,0,0).applyQuaternion(this.playerMesh.quaternion), -0.2));
            const eyeR = pPos.clone().add(fwd.clone().multiplyScalar(0.4)).add(new THREE.Vector3(0,0,0).applyQuaternion(this.playerMesh.quaternion).addScaledVector(new THREE.Vector3(1,0,0).applyQuaternion(this.playerMesh.quaternion), 0.2));
            
            this.particleSystem.emit(eyeL, 0xff0000, 1);
            this.particleSystem.emit(eyeR, 0xff0000, 1);
        }
        
        this.drawMinimap();
        this.drawCompass();
        
        // Handle Q for Big Map
        if (this.keys.q && this.bigMapOverlay) {
             this.bigMapOverlay.classList.add('active');
             if (this.bigMapCanvas) {
                 this.bigMapCanvas.width = window.innerWidth * 0.8;
                 this.bigMapCanvas.height = window.innerHeight * 0.8;
                 this.drawBigMap();
             }
        } else if (this.bigMapOverlay) {
             this.bigMapOverlay.classList.remove('active');
        }
    }
    
    drawCompass() {
        const strip = document.getElementById('compass-strip');
        if (!strip) return;
        
        // Convert radians to degrees. 
        // Three.js: +Rotation Y is Counter-Clockwise (Left).
        // Compass Strip: N E S W (Left to Right).
        // If we turn Left (CCW, +deg), we want the strip to move Right to bring W (left of N) into view?
        // Actually, standard HUDs: If I face North (0) and turn Right (-deg), I face East. 
        // The strip should slide Left to reveal 'E' which is to the right of 'N'.
        
        let deg = (this.cameraRotation * 180 / Math.PI);
        
        // Cycle width = 400px (4 directions * 100px gap)
        const pixelsPerDeg = 400 / 360;
        
        // If we turn right (negative deg), we want to shift strip left (negative x) so 'E' (at +100px) moves towards center?
        // Wait, strip is N E S W N E S W.
        // Center is index 0 (N). E is at +100px.
        // If I look East, I want E to be at Center (0).
        // So I must shift strip by -100px.
        // Looking East = -90 deg rotation in Three.js (approx).
        // So -90 deg -> -100px offset.
        // Formula: offset = deg * pixelsPerDeg.
        // -90 * (400/360) = -100. Correct.
        
        // We wrap the offset to keep it within the repeating texture bounds (0 to -400 or similar)
        // Since the strip text is centered via CSS flex usually, let's just translate.
        // To make it loop, we rely on the duplicated letters N E S W N E S W.
        
        let offset = deg * pixelsPerDeg;
        
        // Modulo 400 to loop
        offset = offset % 400;
        
        // Adjust for smooth wrap. If positive, subtract 400 to stay in valid range if needed, 
        // but since we have double letters, we can just oscillate.
        
        strip.style.transform = `translateX(${offset}px)`;
    }

    revealMap() {
        if (this.fogCtx) {
            this.fogCtx.globalCompositeOperation = 'source-over';
            this.fogCtx.fillStyle = 'rgba(0,0,0,0)'; // Transparent
            this.fogCtx.clearRect(0, 0, this.fogResolution, this.fogResolution);
        }
    }

    drawMinimap() {
        if (!this.minimapCtx) return;
        if (this.gameMode === 'MULTI') return; // No minimap in MP

        const ctx = this.minimapCtx;
        const size = 160;
        const range = 100;
        
        ctx.clearRect(0, 0, size, size);
        
        const px = this.playerBody.position.x;
        const pz = this.playerBody.position.z;
        
        // Transform world to map (Player centered)
        const map = (x, z) => {
            const dx = x - px;
            const dz = z - pz;
            return {
                x: size/2 + (dx / range) * (size/2),
                y: size/2 + (dz / range) * (size/2)
            };
        };
        
        // Draw terrain
        ctx.fillStyle = 'rgba(60, 140, 60, 0.6)';
        for (let p of this.terrainPieces) {
             const m = map(p.x, p.z);
             const w = (p.width / range) * (size/2);
             const h = (p.depth / range) * (size/2);
             if (m.x + w/2 < 0 || m.x - w/2 > size || m.y + h/2 < 0 || m.y - h/2 > size) continue;
             ctx.fillRect(m.x - w/2, m.y - h/2, w, h);
        }
        
        // Draw Chests
        ctx.fillStyle = '#ffd700';
        for (let c of this.chests) {
            if(c.opened) continue;
            const m = map(c.position.x, c.position.z);
            ctx.fillRect(m.x-2, m.y-2, 4, 4);
        }
        
        // Draw Boss Portal
        if (this.bossPortal) {
            ctx.fillStyle = '#ff00ff';
            const m = map(this.bossPortal.position.x, this.bossPortal.position.z);
            ctx.beginPath();
            ctx.arc(m.x, m.y, 5, 0, Math.PI*2);
            ctx.fill();
        }

        // Draw Secret Note (yellow dot) if present and not collected
        if (this.secretNote && !this.secretNote.collected && this.secretNote.pos) {
            try {
                ctx.fillStyle = '#ffea00';
                const m = map(this.secretNote.pos.x, this.secretNote.pos.z);
                ctx.beginPath();
                ctx.arc(m.x, m.y, 3.5, 0, Math.PI*2);
                ctx.fill();
                // small highlight ring
                ctx.strokeStyle = 'rgba(255,234,0,0.6)';
                ctx.lineWidth = 1;
                ctx.beginPath();
                ctx.arc(m.x, m.y, 6, 0, Math.PI*2);
                ctx.stroke();
            } catch (e) {}
        }

        // Player Arrow
        ctx.save();
        ctx.translate(size/2, size/2);
        // Correct rotation: arrow points direction we face.
        ctx.rotate(this.cameraRotation); 
        ctx.fillStyle = '#ffd700'; // Yellow arrow
        ctx.beginPath();
        ctx.moveTo(0, -7);
        ctx.lineTo(6, 6);
        ctx.lineTo(-6, 6);
        ctx.fill();
        ctx.restore();
    }

    drawBigMap() {
        if (!this.bigMapCtx) return;
        const ctx = this.bigMapCtx;
        const w = this.bigMapCanvas.width;
        const h = this.bigMapCanvas.height;
        const range = 500; // Full map view
        
        ctx.fillStyle = '#000';
        ctx.fillRect(0, 0, w, h);
        
        // Map world 0,0 to center of canvas
        const map = (x, z) => {
            return {
                x: w/2 + (x / range) * (Math.min(w,h)/2),
                y: h/2 + (z / range) * (Math.min(w,h)/2)
            };
        };
        
        // Draw terrain
        ctx.fillStyle = '#226622';
        for (let p of this.terrainPieces) {
             const m = map(p.x, p.z);
             const sw = (p.width / range) * (Math.min(w,h)/2);
             const sh = (p.depth / range) * (Math.min(w,h)/2);
             ctx.fillRect(m.x - sw/2, m.y - sh/2, sw, sh);
        }
        
        // Draw Chests
        ctx.fillStyle = '#ffd700';
        for (let c of this.chests) {
            if(c.opened) continue;
            const m = map(c.position.x, c.position.z);
            ctx.fillRect(m.x-3, m.y-3, 6, 6);
        }
        
        // Draw Boss Portal
        if (this.bossPortal) {
            ctx.fillStyle = '#ff00ff';
            const m = map(this.bossPortal.position.x, this.bossPortal.position.z);
            ctx.beginPath();
            ctx.arc(m.x, m.y, 8, 0, Math.PI*2);
            ctx.fill();
            // Pulse ring
            ctx.strokeStyle = '#ff00ff';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.arc(m.x, m.y, 12 + Math.sin(Date.now()*0.01)*4, 0, Math.PI*2);
            ctx.stroke();
        }

        // Draw Secret Note on Big Map (yellow marker)
        if (this.secretNote && !this.secretNote.collected && this.secretNote.pos) {
            try {
                ctx.fillStyle = '#ffea00';
                const m = map(this.secretNote.pos.x, this.secretNote.pos.z);
                ctx.beginPath();
                ctx.arc(m.x, m.y, 6, 0, Math.PI*2);
                ctx.fill();
                ctx.strokeStyle = 'rgba(255,234,0,0.6)';
                ctx.lineWidth = 2;
                ctx.beginPath();
                ctx.arc(m.x, m.y, 10, 0, Math.PI*2);
                ctx.stroke();
                // Label
                ctx.fillStyle = '#222';
                ctx.font = '12px monospace';
                ctx.fillText('SECRET', m.x + 12, m.y + 4);
            } catch (e) {}
        }

        // Draw Fog of War
        if (this.fogCanvas) {
            ctx.drawImage(this.fogCanvas, 0, 0, this.fogResolution, this.fogResolution, 0, 0, w, h);
        }
        
        // Draw Player
        const px = this.playerBody.position.x;
        const pz = this.playerBody.position.z;
        const pm = map(px, pz);

        ctx.save();
        ctx.translate(pm.x, pm.y);
        ctx.rotate(this.cameraRotation);
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.moveTo(0, -9);
        ctx.lineTo(7, 8);
        ctx.lineTo(-7, 8);
        ctx.fill();
        ctx.restore();
        
        // Label
        ctx.fillStyle = '#fff';
        ctx.font = '16px monospace';
        ctx.fillText("YOU", pm.x + 12, pm.y);
    }
}
