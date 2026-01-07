import * as THREE from 'three';

export function randomRange(min, max) {
    return Math.random() * (max - min) + min;
}

export class SeededRandom {
    constructor(seed) {
        this.seed = seed % 2147483647;
        if (this.seed <= 0) this.seed += 2147483646;
    }
    next() {
        this.seed = (this.seed * 16807) % 2147483647;
        return (this.seed - 1) / 2147483646;
    }
    range(min, max) {
        return min + this.next() * (max - min);
    }
}

export class ParticleSystem {
    constructor(scene) {
        this.scene = scene;
        this.particles = [];
        
        const geometry = new THREE.BoxGeometry(0.2, 0.2, 0.2);
        const material = new THREE.MeshBasicMaterial({ color: 0xffffff });
        
        this.poolSize = 600;
        this.meshPool = [];
        for(let i=0; i<this.poolSize; i++) {
            const mesh = new THREE.Mesh(geometry, material.clone());
            mesh.visible = false;
            this.scene.add(mesh);
            this.meshPool.push(mesh);
        }
    }
    
    emit(pos, color, count = 10) {
        for(let i=0; i<count; i++) {
            const mesh = this.meshPool.find(m => !m.visible);
            if(!mesh) return;
            
            mesh.visible = true;
            mesh.position.copy(pos);
            mesh.material.color.setHex(color);
            
            const vel = new THREE.Vector3(
                (Math.random() - 0.5) * 8,
                Math.random() * 5 + 2,
                (Math.random() - 0.5) * 8
            );
            
            this.particles.push({
                mesh: mesh,
                velocity: vel,
                life: 1.0
            });
        }
    }
    
    update(dt) {
        for(let i = this.particles.length - 1; i >= 0; i--) {
            const p = this.particles[i];
            p.life -= dt * 2;
            
            if(p.life <= 0) {
                p.mesh.visible = false;
                this.particles.splice(i, 1);
                continue;
            }
            
            p.velocity.y -= 15 * dt;
            p.mesh.position.addScaledVector(p.velocity, dt);
            p.mesh.rotation.x += p.velocity.z * dt * 2;
            p.mesh.rotation.z -= p.velocity.x * dt * 2;
            p.mesh.scale.setScalar(p.life * 0.5);
        }
    }
}

export class XPOrb {
    constructor(scene, position) {
        const geometry = new THREE.OctahedronGeometry(0.3);
        const material = new THREE.MeshStandardMaterial({ 
            color: 0x00ff88,
            emissive: 0x00ff88,
            emissiveIntensity: 0.5
        });
        this.mesh = new THREE.Mesh(geometry, material);
        this.mesh.position.copy(position);
        scene.add(this.mesh);
        
        this.targetPlayer = false;
        this.velocity = new THREE.Vector3(0, 0, 0);
        this.collected = false;
    }
    
    update(dt, playerPos) {
        const dist = this.mesh.position.distanceTo(playerPos);
        
        if (dist < 8 || this.targetPlayer) {
            this.targetPlayer = true;
            const dir = new THREE.Vector3().subVectors(playerPos, this.mesh.position).normalize();
            this.velocity.addScaledVector(dir, 80 * dt);
            
            // Apply damping to prevent orbiting
            this.velocity.multiplyScalar(0.95);
        }
        
        this.mesh.position.addScaledVector(this.velocity, dt);
        this.mesh.rotation.y += dt * 5;
        
        if (dist < 0.8) {
            return true; // Collected
        }
        return false;
    }
    
    destroy(scene) {
        scene.remove(this.mesh);
    }
}game/utils.js
