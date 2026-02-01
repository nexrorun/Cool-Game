/**
 * @fileoverview Utility classes and functions for the game
 * Contains particle system, XP orbs, and math helpers
 *
 * @module utils/game
 */

import * as THREE from 'three';

// ============================================================================
// MATH UTILITIES
// ============================================================================

/**
 * Generate a random number within a range
 * @param {number} min - Minimum value (inclusive)
 * @param {number} max - Maximum value (exclusive)
 * @returns {number}
 */
export function randomRange(min, max) {
    return Math.random() * (max - min) + min;
}

/**
 * Clamp a value between min and max
 * @param {number} value - Value to clamp
 * @param {number} min - Minimum
 * @param {number} max - Maximum
 * @returns {number}
 */
export function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
}

/**
 * Linear interpolation between two values
 * @param {number} a - Start value
 * @param {number} b - End value
 * @param {number} t - Interpolation factor (0-1)
 * @returns {number}
 */
export function lerp(a, b, t) {
    return a + (b - a) * t;
}

/**
 * Smooth step interpolation
 * @param {number} edge0 - Lower edge
 * @param {number} edge1 - Upper edge
 * @param {number} x - Input value
 * @returns {number}
 */
export function smoothstep(edge0, edge1, x) {
    const t = clamp((x - edge0) / (edge1 - edge0), 0, 1);
    return t * t * (3 - 2 * t);
}

/**
 * Calculate distance between two 2D points
 * @param {number} x1
 * @param {number} y1
 * @param {number} x2
 * @param {number} y2
 * @returns {number}
 */
export function distance2D(x1, y1, x2, y2) {
    const dx = x2 - x1;
    const dy = y2 - y1;
    return Math.sqrt(dx * dx + dy * dy);
}

// ============================================================================
// SEEDED RANDOM
// ============================================================================

/**
 * Seeded random number generator for deterministic randomness
 * Uses Linear Congruential Generator algorithm
 * @class
 */
export class SeededRandom {
    /**
     * @param {number} seed - Initial seed value
     */
    constructor(seed) {
        /** @type {number} */
        this.seed = seed % 2147483647;
        if (this.seed <= 0) this.seed += 2147483646;
    }

    /**
     * Generate next random number (0-1)
     * @returns {number}
     */
    next() {
        this.seed = (this.seed * 16807) % 2147483647;
        return (this.seed - 1) / 2147483646;
    }

    /**
     * Generate random number in range
     * @param {number} min - Minimum value
     * @param {number} max - Maximum value
     * @returns {number}
     */
    range(min, max) {
        return min + this.next() * (max - min);
    }

    /**
     * Generate random integer in range (inclusive)
     * @param {number} min - Minimum value
     * @param {number} max - Maximum value
     * @returns {number}
     */
    rangeInt(min, max) {
        return Math.floor(this.range(min, max + 1));
    }

    /**
     * Pick random element from array
     * @template T
     * @param {T[]} array - Array to pick from
     * @returns {T}
     */
    pick(array) {
        return array[Math.floor(this.next() * array.length)];
    }

    /**
     * Shuffle array in place
     * @template T
     * @param {T[]} array - Array to shuffle
     * @returns {T[]}
     */
    shuffle(array) {
        for (let i = array.length - 1; i > 0; i--) {
            const j = Math.floor(this.next() * (i + 1));
            [array[i], array[j]] = [array[j], array[i]];
        }
        return array;
    }
}

// ============================================================================
// PARTICLE SYSTEM
// ============================================================================

/**
 * Pooled particle system for visual effects
 * Uses object pooling to avoid garbage collection
 * @class
 */
export class ParticleSystem {
    /**
     * @param {THREE.Scene} scene - Three.js scene to add particles to
     * @param {number} [poolSize=600] - Maximum number of particles
     */
    constructor(scene, poolSize = 600) {
        /** @type {THREE.Scene} */
        this.scene = scene;

        /** @type {number} */
        this.poolSize = poolSize;

        /** @type {Array<{mesh: THREE.Mesh, velocity: THREE.Vector3, life: number}>} */
        this.particles = [];

        /** @type {THREE.Mesh[]} */
        this.meshPool = [];

        /** @type {THREE.BoxGeometry} */
        this._geometry = new THREE.BoxGeometry(0.2, 0.2, 0.2);

        /** @type {THREE.MeshBasicMaterial} */
        this._baseMaterial = new THREE.MeshBasicMaterial({ color: 0xffffff });

        // Initialize pool
        for (let i = 0; i < this.poolSize; i++) {
            const mesh = new THREE.Mesh(this._geometry, this._baseMaterial.clone());
            mesh.visible = false;
            this.scene.add(mesh);
            this.meshPool.push(mesh);
        }
    }

    /**
     * Emit particles at a position
     * @param {THREE.Vector3} pos - Emission position
     * @param {number} color - Hex color
     * @param {number} [count=10] - Number of particles
     * @param {Object} [options] - Additional options
     * @param {number} [options.speed=8] - Initial velocity magnitude
     * @param {number} [options.upwardBias=5] - Upward velocity component
     * @param {number} [options.lifetime=1] - Particle lifetime in seconds
     */
    emit(pos, color, count = 10, options = {}) {
        const { speed = 8, upwardBias = 5, lifetime = 1 } = options;

        for (let i = 0; i < count; i++) {
            const mesh = this.meshPool.find(m => !m.visible);
            if (!mesh) return; // Pool exhausted

            mesh.visible = true;
            mesh.position.copy(pos);
            mesh.material.color.setHex(color);
            mesh.scale.setScalar(1);

            const vel = new THREE.Vector3(
                (Math.random() - 0.5) * speed,
                Math.random() * upwardBias + 2,
                (Math.random() - 0.5) * speed
            );

            this.particles.push({
                mesh: mesh,
                velocity: vel,
                life: lifetime
            });
        }
    }

    /**
     * Update all active particles
     * @param {number} dt - Delta time in seconds
     */
    update(dt) {
        const gravity = 15;

        for (let i = this.particles.length - 1; i >= 0; i--) {
            const p = this.particles[i];
            p.life -= dt * 2;

            if (p.life <= 0) {
                p.mesh.visible = false;
                this.particles.splice(i, 1);
                continue;
            }

            // Physics
            p.velocity.y -= gravity * dt;
            p.mesh.position.addScaledVector(p.velocity, dt);

            // Rotation based on velocity
            p.mesh.rotation.x += p.velocity.z * dt * 2;
            p.mesh.rotation.z -= p.velocity.x * dt * 2;

            // Shrink over lifetime
            p.mesh.scale.setScalar(p.life * 0.5);
        }
    }

    /**
     * Get current active particle count
     * @returns {number}
     */
    get activeCount() {
        return this.particles.length;
    }

    /**
     * Clear all active particles
     */
    clear() {
        for (const p of this.particles) {
            p.mesh.visible = false;
        }
        this.particles.length = 0;
    }

    /**
     * Dispose of all resources
     * Call this when destroying the particle system
     */
    dispose() {
        this.clear();

        for (const mesh of this.meshPool) {
            this.scene.remove(mesh);
            mesh.geometry.dispose();
            mesh.material.dispose();
        }

        this._geometry.dispose();
        this._baseMaterial.dispose();

        this.meshPool.length = 0;
    }
}

// ============================================================================
// XP ORB
// ============================================================================

/**
 * Collectible XP orb that flies toward the player
 * @class
 */
export class XPOrb {
    /**
     * @param {THREE.Scene} scene - Scene to add orb to
     * @param {THREE.Vector3} position - Initial position
     * @param {number} [value=1] - XP value of orb
     */
    constructor(scene, position, value = 1) {
        /** @type {THREE.Scene} */
        this.scene = scene;

        /** @type {number} */
        this.value = value;

        /** @type {THREE.Mesh} */
        this.mesh = this._createMesh();
        this.mesh.position.copy(position);
        scene.add(this.mesh);

        /** @type {boolean} */
        this.targetPlayer = false;

        /** @type {THREE.Vector3} */
        this.velocity = new THREE.Vector3(0, 0, 0);

        /** @type {boolean} */
        this.collected = false;
    }

    /**
     * Create the orb mesh
     * @private
     * @returns {THREE.Mesh}
     */
    _createMesh() {
        const geometry = new THREE.OctahedronGeometry(0.3);
        const material = new THREE.MeshStandardMaterial({
            color: 0x00ff88,
            emissive: 0x00ff88,
            emissiveIntensity: 0.5
        });
        return new THREE.Mesh(geometry, material);
    }

    /**
     * Update orb position and check collection
     * @param {number} dt - Delta time
     * @param {THREE.Vector3} playerPos - Player position
     * @param {number} [pickupRange=8] - Range at which orb starts homing
     * @returns {boolean} True if collected
     */
    update(dt, playerPos, pickupRange = 8) {
        const dist = this.mesh.position.distanceTo(playerPos);

        // Start homing when in range
        if (dist < pickupRange || this.targetPlayer) {
            this.targetPlayer = true;

            const dir = new THREE.Vector3()
                .subVectors(playerPos, this.mesh.position)
                .normalize();

            this.velocity.addScaledVector(dir, 80 * dt);
            this.velocity.multiplyScalar(0.95); // Damping
        }

        // Apply velocity
        this.mesh.position.addScaledVector(this.velocity, dt);

        // Rotation animation
        this.mesh.rotation.y += dt * 5;

        // Check collection
        if (dist < 0.8) {
            this.collected = true;
            return true;
        }

        return false;
    }

    /**
     * Remove orb from scene and dispose resources
     */
    destroy() {
        this.scene.remove(this.mesh);
        this.mesh.geometry.dispose();
        this.mesh.material.dispose();
    }
}

// ============================================================================
// OBJECT POOL
// ============================================================================

/**
 * Generic object pool for reusing objects
 * @template T
 * @class
 */
export class ObjectPool {
    /**
     * @param {function(): T} factory - Function to create new objects
     * @param {function(T): void} reset - Function to reset objects for reuse
     * @param {number} [initialSize=10] - Initial pool size
     */
    constructor(factory, reset, initialSize = 10) {
        /** @type {function(): T} */
        this._factory = factory;

        /** @type {function(T): void} */
        this._reset = reset;

        /** @type {T[]} */
        this._available = [];

        /** @type {Set<T>} */
        this._active = new Set();

        // Pre-populate pool
        for (let i = 0; i < initialSize; i++) {
            this._available.push(this._factory());
        }
    }

    /**
     * Get an object from the pool
     * @returns {T}
     */
    acquire() {
        let obj;
        if (this._available.length > 0) {
            obj = this._available.pop();
        } else {
            obj = this._factory();
        }
        this._active.add(obj);
        return obj;
    }

    /**
     * Return an object to the pool
     * @param {T} obj - Object to release
     */
    release(obj) {
        if (this._active.has(obj)) {
            this._active.delete(obj);
            this._reset(obj);
            this._available.push(obj);
        }
    }

    /**
     * Get count of active objects
     * @returns {number}
     */
    get activeCount() {
        return this._active.size;
    }

    /**
     * Get count of available objects
     * @returns {number}
     */
    get availableCount() {
        return this._available.length;
    }

    /**
     * Clear all objects (both active and available)
     * @param {function(T): void} [dispose] - Optional disposal function
     */
    clear(dispose) {
        if (dispose) {
            for (const obj of this._active) {
                dispose(obj);
            }
            for (const obj of this._available) {
                dispose(obj);
            }
        }
        this._active.clear();
        this._available.length = 0;
    }
}

// ============================================================================
// TIMER UTILITIES
// ============================================================================

/**
 * Manages multiple named timers
 * @class
 */
export class TimerManager {
    constructor() {
        /** @type {Map<string, {elapsed: number, duration: number, repeat: boolean, callback: Function}>} */
        this._timers = new Map();
    }

    /**
     * Add a timer
     * @param {string} name - Timer identifier
     * @param {number} duration - Duration in seconds
     * @param {Function} callback - Callback when timer completes
     * @param {boolean} [repeat=false] - Whether to repeat
     */
    add(name, duration, callback, repeat = false) {
        this._timers.set(name, {
            elapsed: 0,
            duration,
            repeat,
            callback
        });
    }

    /**
     * Remove a timer
     * @param {string} name - Timer to remove
     */
    remove(name) {
        this._timers.delete(name);
    }

    /**
     * Update all timers
     * @param {number} dt - Delta time in seconds
     */
    update(dt) {
        for (const [name, timer] of this._timers) {
            timer.elapsed += dt;

            if (timer.elapsed >= timer.duration) {
                timer.callback();

                if (timer.repeat) {
                    timer.elapsed = 0;
                } else {
                    this._timers.delete(name);
                }
            }
        }
    }

    /**
     * Check if a timer exists
     * @param {string} name
     * @returns {boolean}
     */
    has(name) {
        return this._timers.has(name);
    }

    /**
     * Clear all timers
     */
    clear() {
        this._timers.clear();
    }
}

// ============================================================================
// VECTOR UTILITIES
// ============================================================================

/**
 * Create a direction vector from angle (in radians)
 * @param {number} angle - Angle in radians
 * @returns {THREE.Vector3}
 */
export function directionFromAngle(angle) {
    return new THREE.Vector3(Math.sin(angle), 0, Math.cos(angle));
}

/**
 * Get angle between two points (in XZ plane)
 * @param {THREE.Vector3} from
 * @param {THREE.Vector3} to
 * @returns {number} Angle in radians
 */
export function angleBetween(from, to) {
    return Math.atan2(to.x - from.x, to.z - from.z);
}

/**
 * Rotate a point around the Y axis
 * @param {THREE.Vector3} point - Point to rotate
 * @param {THREE.Vector3} center - Center of rotation
 * @param {number} angle - Angle in radians
 * @returns {THREE.Vector3}
 */
export function rotateAroundY(point, center, angle) {
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    const dx = point.x - center.x;
    const dz = point.z - center.z;

    return new THREE.Vector3(
        center.x + dx * cos - dz * sin,
        point.y,
        center.z + dx * sin + dz * cos
    );
}
