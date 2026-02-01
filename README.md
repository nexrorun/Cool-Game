# UBERTHUMP

A fast-paced action roguelike arena shooter built with THREE.js, featuring procedural world generation, deep character progression, multiple game modes, and real-time multiplayer battles.

---

## Table of Contents

1. [Game Overview](#game-overview)
2. [Getting Started](#getting-started)
3. [Game Modes](#game-modes)
4. [Playable Characters](#playable-characters)
5. [Weapons System](#weapons-system)
6. [Runes and Upgrades](#runes-and-upgrades)
7. [Enemies and Bosses](#enemies-and-bosses)
8. [World and Level Design](#world-and-level-design)
9. [Progression and Unlocks](#progression-and-unlocks)
10. [Multiplayer System](#multiplayer-system)
11. [Controls](#controls)
12. [Technical Architecture](#technical-architecture)
13. [Save Data and Persistence](#save-data-and-persistence)

---

## Game Overview

UberThump is an action-roguelike arena shooter that draws inspiration from games like Vampire Survivors. Players select from a roster of unique characters, each with their own starting weapon and playstyle, then battle waves of procedurally spawned enemies while collecting experience orbs, coins, and powerful upgrades. The core gameplay loop revolves around surviving increasingly difficult enemy waves, leveling up to acquire new weapons and passive abilities, and ultimately defeating powerful bosses to progress through tiers or complete objectives.

The game features a distinctive pixelated retro aesthetic achieved through custom post-processing shaders that apply resolution reduction and color quantization to the rendered scene. This visual style is complemented by a carefully curated soundtrack with tracks that match the game's energetic, arcade-style atmosphere.

At its heart, UberThump offers both single-player and multiplayer experiences. In single-player modes, players can tackle the endless Classic arcade mode, experience the narrative-driven Awakening mode with its evolution system, or progress through the four-tier Totally Not Scripted story campaign. The multiplayer component transforms the experience into a competitive PvP battle where two players loot and level for an initial phase before the arena shrinks with rising lava, forcing them into direct combat.

---

## Getting Started

To play UberThump, simply open `index.html` in a modern web browser that supports WebGL. The game runs entirely client-side with no server requirements for single-player modes. For multiplayer functionality, the game connects to WebSocket servers for real-time synchronization between players.

Upon launching, you will be greeted by the main menu featuring the animated UBERTHUMP title with its characteristic RGB-shifting underline. From here, you can enter the arena to begin playing, access the Bestiary to view information about enemies and characters you have encountered, or visit the Forge for additional game features.

The first time you play, you will have access to two starting characters: MMOOVT (a tanky knight with a powerful sword) and Fox (a fast-moving caster with seeking fireballs). Additional characters are unlocked by completing specific in-game achievements and challenges, encouraging experimentation with different playstyles and repeated runs.

---

## Game Modes

### Classic (Arcade) Mode

Classic mode is the foundational UberThump experience. Players begin in a procedurally generated arena and must survive increasingly difficult waves of enemies while collecting loot and leveling up their character. The mode operates on a 10-minute timer, after which "overtime" activates and lava begins rising from the edges of the arena, progressively shrinking the safe play area.

The primary objective in Classic mode is to defeat the main boss, which spawns at specific intervals and guards the transition to the next tier. Each tier increases enemy difficulty and unlocks new challenges, creating an endless progression system that tests player skill and build optimization. Boss battles take place within an inescapable arena sphere that prevents players from fleeing, forcing them to confront the threat directly.

Victory in Classic mode is achieved by defeating the main boss, while defeat occurs when the player's health reaches zero or when the rising lava catches them after overtime begins. The mode supports a wide range of playstyles, from aggressive damage-focused builds to defensive regeneration strategies.

### Awakening Mode

Awakening mode presents a unique single-character experience that locks players into playing as Mr. Mc. Oofy Otterson Vangough III with a permanently pixelated visual filter. This mode introduces the evolution system, where graves spawn throughout the world containing awakened versions of bosses that players must defeat to unlock permanent stat improvements.

The Awakening narrative is explicitly non-canonical, presenting an alternative story experience separate from the main game lore. Players progress through four distinct bosses in order: Babybark, Smolbark, Chadbark, and finally Barkvader. Each boss represents an escalating challenge, and defeating grave-spawned awakened bosses contributes to unlocking permanent progression benefits in the categories of Health, Speed, and Offense.

This mode appeals to players who enjoy focused, narrative-driven experiences with clear objectives and a defined endpoint, rather than the endless progression of Classic mode.

### Totally Not Scripted (Story Mode)

The Totally Not Scripted mode (often abbreviated as TNS) provides a structured four-tier story campaign with specific boss encounters and limited character pools at each stage. Unlike Classic mode's endless progression, TNS offers a definitive beginning and ending, making it ideal for players who prefer self-contained gaming sessions.

Each tier in TNS unlocks additional characters for use in that mode specifically:

- **Tier 1**: Players can choose from MMOOVT, Fox, or Calcium to face Babybark (5,000 HP)
- **Tier 2**: GigaChad, Blitz, and Monke become available against Smolbark (15,000 HP)
- **Tier 3**: Sir Chad and Boberto join the roster to fight Chadbark (45,000 HP)
- **Tier 4**: All characters are available for the final confrontation with Barkvader (100,000 HP)

Progress through TNS tiers is saved between sessions, and completing certain tiers unlocks new characters for use across all game modes. The mode offers a curated difficulty curve and story progression that differs from the procedural challenge of other modes.

### Multiplayer (PvP) Mode

Multiplayer mode transforms UberThump into a competitive 1v1 arena battle. Two players connect through the lobby system and compete in real-time, with the match structured in two distinct phases.

During the initial looting phase, both players independently explore the procedurally generated map, fighting enemies that drop double the normal amount of coins and experience orbs. This phase lasts for a configurable time period (default 10 minutes), during which players race to build the strongest possible character through strategic upgrade choices and efficient farming.

When the timer expires, overtime activates and the competitive phase begins. Lava rises from the arena edges, progressively shrinking the playable area while players can now damage each other directly. The match continues until one player dies, with the survivor declared the winner. Post-match, players can communicate through an integrated chat system.

Multiplayer matches use seeded random number generation to ensure both players experience the same procedurally generated terrain and enemy spawn patterns, maintaining fairness despite the distributed nature of the game.

---

## Playable Characters

UberThump features eight playable characters, each with distinct statistics, abilities, and starting weapons. Two characters are available from the start, while the remaining six must be unlocked through gameplay achievements.

### MMOOVT (Unlocked by Default)

MMOOVT is a heavily armored knight designed for players who prefer a tanky, up-close-and-personal playstyle. With 190 base HP (the second-highest in the roster), MMOOVT can absorb significant punishment while dealing high single-target damage with the Knight Sword starting weapon. This character moves slower than most others, trading mobility for survivability. The Knight Sword executes wide sweeping slashes controlled by manual input, rewarding players with good timing and positioning.

### Fox (Unlocked by Default)

Fox represents the opposite end of the spectrum from MMOOVT, offering a fast-moving caster playstyle with only 80 HP but exceptional speed and area-of-effect damage potential. The Fireball starting weapon launches rapid-fire seeking projectiles that home in on nearby enemies, allowing Fox players to focus on positioning and dodging rather than aiming. This character excels at kiting enemies and maintaining distance while dealing consistent damage across multiple targets.

### Calcium (Unlockable)

Calcium is an undead skeleton with a unique momentum-based movement system. Starting at 110 HP with moderate base speed, Calcium builds velocity while moving continuously, eventually reaching very high speeds that make the character difficult for enemies to catch. The Bone starting weapon deals chain damage that can bounce between multiple enemies. To unlock Calcium, players must kill 200 skeletons across all runs AND defeat the Mr. Mc. Oofy Otterson miniboss.

### GigaChad (Unlockable)

GigaChad is the ultimate tank character, boasting a massive 300 HP pool that dwarfs all other characters. Despite slow movement speed, GigaChad makes up for it with the Chad Aura starting weapon that deals consistent damage-per-second to all nearby enemies without requiring any manual input. The character also possesses a unique "Flex" ability that can ignore a single instance of heavy damage on a cooldown, providing clutch survival moments. Unlocking GigaChad requires upgrading any aura-type weapon to Level 3 AND having already unlocked Monke.

### Blitz (Unlockable)

Blitz is a storm-powered robot character with 140 HP and average movement speed. The Lightning starting weapon automatically zaps nearby enemies at regular intervals, combining the hands-free damage of aura weapons with burst damage spikes. Blitz provides a balanced playstyle suitable for players who want consistent damage output without complex mechanics. This character is unlocked by defeating the main boss in any mode.

### Monke (Unlockable)

Monke offers a primal, highly mobile playstyle with 130 HP and very fast movement speed. The Bananerang starting weapon throws projectiles that return to the player after reaching maximum range, dealing damage both on the way out and on the return journey. Monke's unique ability is wall climbing, allowing the character to traverse steep terrain that other characters cannot navigate. Unlocking Monke requires upgrading the Bananerang weapon to Level 3 AND discovering a hidden crate somewhere in the world.

### Sir Chad (Unlockable)

Sir Chad represents the pinnacle of tank gameplay, possessing an extraordinary 800 HP that makes the character nearly unkillable by normal enemies. Despite heavy, slow movement, Sir Chad wields the Giga Sword, which deals massive damage in wide arcs. The character's intimidating presence affects nearby enemies (primarily through flavor text rather than mechanical effects). Sir Chad has the most complex unlock requirement: players must first unlock GigaChad AND upgrade the Spinning Blade weapon to Level 5.

### Boberto (Unlockable)

Boberto is a summoner character with only 90 HP but a unique minion-based playstyle. The Spooky Bois starting weapon spawns friendly ghost allies that fight alongside the player, attacking enemies independently. Boberto also possesses a double jump ability for enhanced mobility and vertical navigation. This character has the most demanding unlock requirement in the game: players must find the Secret Note hidden somewhere in the world AND unlock all five other unlockable characters (Calcium, GigaChad, Blitz, Monke, and Sir Chad).

---

## Weapons System

Weapons in UberThump fall into two categories: starting weapons that are intrinsic to each character, and unlockable weapons that can be obtained through the level-up upgrade system during gameplay.

### Starting Weapons

Each character begins with a unique weapon that cannot be unequipped or replaced. These weapons define the core gameplay identity of each character and scale with leveling alongside other obtained weapons.

- **Knight Sword (MMOOVT)**: Wide sweeping melee attacks with manual directional control
- **Fireball (Fox)**: Rapid-fire homing projectiles that seek nearby enemies
- **Bone (Calcium)**: Chain-hitting projectiles that bounce between enemies
- **Chad Aura (GigaChad)**: Passive area damage to all nearby enemies
- **Lightning (Blitz)**: Automatic electrical zaps to nearby targets at intervals
- **Bananerang (Monke)**: Returning projectiles that damage on both outbound and return paths
- **Giga Sword (Sir Chad)**: Massive sweeping attacks with extreme damage
- **Summon Ghost (Boberto)**: Spawns autonomous friendly ghosts that attack enemies

### Unlockable Weapons

During level-up events, players may be offered new weapons to add to their loadout. By default, players can equip up to 3 active weapons simultaneously, though the "Infinite Weapon Slots" lobby setting removes this restriction.

**Aura Weapons** deal passive damage to enemies within their radius without requiring player input:
- **Spike Ring**: Pulsing ring of spikes that damages touching enemies
- **Poison Mist**: Slow damage-over-time effect to all nearby enemies
- **Ice Aura**: Chills and slows enemies while dealing minor damage

**Projectile Weapons** fire various forms of ammunition:
- **Missile**: Seeking projectiles with homing behavior
- **Ghost**: Spawns ghost entities that explode on contact with enemies

**Orbital Weapons** rotate around the player:
- **Sword/Spinning Blade**: Orbiting blade that damages enemies in its path

**Stationary Weapons**:
- **Mini Turret**: Deploys an auto-targeting turret that fires at nearby enemies

**Area-of-Effect Weapons**:
- **Nova Blast**: Periodic radial explosions centered on the player

### Weapon Mechanics

All weapons can be leveled up when the same weapon is offered during a level-up event. Leveling a weapon improves various statistics including damage output, fire rate, projectile count, and effect radius. The fire rate of all weapons is affected by the player's attack speed stat, which can be increased through runes and character-specific bonuses.

Weapon selection during level-ups is influenced by the player's luck stat, which increases the probability of higher-rarity weapons appearing. The rarity system affects the power multiplier of weapons:

| Rarity | Chance | Damage Multiplier |
|--------|--------|-------------------|
| Common | 50% | 1.0x |
| Uncommon | 30% | 1.2x |
| Rare | 15% | 1.5x |
| Ultra Rare | 4% | 2.0x |
| Legendary | 1% | 3.0x |

---

## Runes and Upgrades

Beyond weapons, the level-up system offers two additional categories of character improvements: runes (passive stat modifiers) and upgrades (gameplay-changing enhancements).

### Runes

Runes provide permanent stat bonuses for the duration of a run. Players can equip up to 4 runes simultaneously, making rune selection a strategic decision about which stats to prioritize.

- **Lanky Hands**: Increases pickup range by 40%, making it easier to collect coins and XP orbs
- **Speed Boost**: Increases movement speed by 15%, improving both offense and evasion
- **Max Health**: Adds 20 HP to maximum health pool
- **Fire Rate**: Increases attack speed by 15% for all weapons
- **Damage**: Increases all damage dealt by 30%
- **Armor Plate**: Reduces all incoming damage by 6%
- **Regen Bone**: Provides slow passive health regeneration over time
- **Lava Boots**: Reduces lava damage by 20%, crucial for overtime survival
- **Wisdom**: Increases experience gained by 20%, accelerating level progression
- **Big Aura**: Increases the area of effect for all weapons and abilities by 20%

### Upgrades

Upgrades differ from runes in that they stack multiplicatively and can be obtained multiple times for increasing effect.

- **Extra Projectile**: Adds one additional projectile to each attack, dramatically increasing damage potential
- **Luck**: Each level increases the chance of higher-rarity items appearing by 20%
- **Vampirism**: Heals the player for a small amount with each enemy killed
- **Piercing**: Allows projectiles to pass through enemies and hit additional targets
- **Critical**: Each level adds 25% critical hit chance for double damage attacks

---

## Enemies and Bosses

### Standard Enemies

The world is populated by various enemy types that spawn in waves throughout gameplay. Enemy difficulty scales with both the current tier and the player's level, with health and damage increasing proportionally.

- **Skeletons**: The most common enemy type, featuring slow melee attacks and moderate health. Killing 200 skeletons across all runs contributes to unlocking the Calcium character.
- **Ghosts**: Rare floating enemies that can pass through terrain obstacles, making them unpredictable threats.
- **Slimes**: Bouncy enemies that split into smaller versions when killed, requiring multiple hits to fully eliminate.
- **Wizards**: Uncommon ranged enemies that fire magical projectiles from distance, requiring players to either close the gap quickly or dodge their attacks.

Enemy spawn rates increase as the game progresses, with wave timers of approximately 0.7 seconds between spawns. The maximum number of active enemies is performance-dependent but typically ranges from 50 to 100 simultaneous enemies.

### Minibosses

Minibosses are stronger-than-normal enemies that spawn procedurally during gameplay. They possess significantly more health than standard enemies and deal increased damage, but drop enhanced rewards upon defeat. Certain unlock conditions, such as the Calcium character unlock, require defeating specific minibosses.

### Main Bosses

Main bosses serve as gatekeepers between progression tiers and represent the primary combat challenges in UberThump. When a boss spawns, an arena sphere appears around the boss location, preventing players from fleeing and forcing a direct confrontation.

Boss health in Classic mode scales exponentially with tier using the formula: `30,000 * 15^(tier-1)`. This creates a steep difficulty curve where each subsequent tier requires significantly more powerful builds to overcome.

Bosses employ multiple attack patterns including:
- Teleportation to reposition around the arena
- Melee attacks with wide hit zones
- Projectile attacks that must be dodged
- Special mechanics specific to each boss type

A boss health bar appears at the top of the screen during boss encounters, allowing players to track their progress. Defeating a boss triggers a tier transition, regenerating the map with increased difficulty and new challenges.

### Totally Not Scripted Bosses

TNS mode features four specific bosses with fixed health values:

| Boss | Tier | Health | Description |
|------|------|--------|-------------|
| Babybark | 1 | 5,000 HP | Introductory boss with basic attack patterns |
| Smolbark | 2 | 15,000 HP | Enhanced version with additional abilities |
| Chadbark | 3 | 45,000 HP | Challenging boss requiring strong builds |
| Barkvader | 4 | 100,000 HP | Final boss with the most complex attack patterns |

---

## World and Level Design

### Procedural Generation

UberThump's arenas are procedurally generated using a seed-based system that ensures consistent terrain across multiplayer matches while providing variety between runs. The world generation creates varied terrain with multiple elevation levels, platforms, ramps, and natural obstacles.

The central area of the map contains a safe arena with a radius of approximately 36 units, surrounded by a lava moat. During normal gameplay, this provides a large space for combat and movement. When overtime activates, the lava begins rising, progressively shrinking the safe area and forcing players toward the center.

### Map Features

**Terrain and Platforms**: The world features height-based terrain with collision detection, allowing players to navigate vertically using ramps and platforms. Some characters (like Monke) can traverse steeper terrain that others cannot.

**Props and Decorations**: Trees, rocks, and ruins are scattered throughout the map, providing visual variety and occasional obstacles. These props are generated procedurally based on the map seed.

**Shrines**: Twelve shrines are distributed across the map, each offering temporary stat boosts when activated. Shrine buffs include damage increases, speed boosts, health bonuses, and fire rate improvements. Active buffs are displayed in a buff bar on the player's HUD.

**Chests**: Over 35 loot chests spawn on plateaus throughout the map. Chests require coins to open, with the cost scaling based on the player's current wealth. Opening a chest provides random weapon or rune drops.

**Graves (Awakening Mode Only)**: In Awakening mode, graves spawn throughout the world containing awakened versions of bosses. These optional challenges provide permanent stat upgrades when completed.

**Boss Portal**: When tier progression conditions are met, a boss portal spawns that players must enter to face the main boss. The portal leads to a dedicated boss arena with the inescapable sphere mechanic.

### Physics

The game uses Cannon.js for physics simulation, providing realistic collision detection and movement. Key physics parameters include:
- Gravity: -40 units
- Player collision radius: 1.0 units
- Fixed physics timestep: ~0.016 seconds

Terrain collision uses heightfield data, allowing players to walk on uneven surfaces naturally. Physics bodies are assigned to enemies, projectiles, and loot items for accurate interaction.

---

## Progression and Unlocks

### Experience and Leveling

Experience points (XP) are gained by collecting orbs dropped by defeated enemies. The amount of XP required to level up starts at 14 and scales with the formula: `14 * 1.15^(level-1)`. This creates an exponential curve where early levels come quickly while later levels require significant farming.

The maximum achievable level is 75, implemented as a hard cap to prevent infinite progression in single runs. Each level-up allows the player to choose one of three randomly offered upgrades, which may include new weapons, weapon level-ups, runes, or stat upgrades.

XP orbs have automatic tracking behavior, moving toward the player when within 8 units range. The Lanky Hands rune increases this pickup range by 40%.

### Coins and Economy

Coins are dropped by enemies based on the formula: `1 + level * 0.25`, where level refers to the enemy's level. In multiplayer mode, coin drops are doubled to accelerate the looting phase.

Coins serve as currency for opening chests, with chest costs scaling based on the player's current coin total. This prevents players from hoarding coins indefinitely while still rewarding efficient farming.

### Character Unlocks

Each unlockable character has specific requirements:

| Character | Requirements |
|-----------|--------------|
| Calcium | Kill 200 skeletons (cumulative) AND defeat the Oofy miniboss |
| Blitz | Defeat the main boss once in any mode |
| Monke | Upgrade Bananerang to Level 3 AND find the hidden crate |
| GigaChad | Upgrade any aura weapon to Level 3 AND unlock Monke first |
| Sir Chad | Unlock GigaChad AND upgrade Spinning Blade to Level 5 |
| Boberto | Find the Secret Note AND unlock all other characters |

Unlock progress is tracked across sessions and stored in local storage, ensuring that partial progress is not lost.

### Multiplayer Unlock

Access to multiplayer mode is unlocked by completing Tier 1 in Classic mode. This ensures new players have a basic understanding of game mechanics before entering competitive matches.

### TNS Tier Progress

Totally Not Scripted mode tracks tier progress separately, saving which tiers have been completed. Each completed tier unlocks the next tier's character pool and boss encounter.

---

## Multiplayer System

### Networking Architecture

UberThump's multiplayer uses WebsimSocket for real-time communication between players. The system synchronizes player positions, health, equipped weapons, and game events at approximately 100ms intervals to balance responsiveness with bandwidth efficiency.

To ensure fairness, both clients generate the same procedurally generated world using a shared seed derived from the match ID and player IDs. This means terrain, enemy spawns, and chest locations are identical for both players despite being generated locally.

### Matchmaking and Lobbies

The multiplayer flow begins at the Server Browser, which displays open lobbies available to join. Players can either join an existing lobby or create a new one with custom settings.

**Lobby Settings**:
- **Mode**: PVP (competitive) or Survival (cooperative)
- **Time Limit**: 5, 10, or 15 minutes (or 1 minute for quick matches)
- **Loot Multiplier**: 0.5x to 5.0x (affects coin and XP drop rates)
- **Spawn Multiplier**: 0.5x to 5.0x (affects enemy spawn frequency)
- **Infinite Weapon Slots**: Toggle to remove the 3-weapon limit

Once both players have joined and selected their characters, the host can start the match. Character selection prevents duplicate picks, ensuring each player has a unique character.

### Match Flow

1. **Looting Phase**: Both players explore independently, fighting enemies that drop double loot. Players cannot damage each other during this phase.

2. **Overtime Activation**: When the timer expires, overtime begins. Lava starts rising from the arena edges.

3. **PvP Phase**: Players can now damage each other directly. The shrinking safe area forces eventual confrontation.

4. **Resolution**: The match ends when one player dies. The survivor wins.

5. **Post-Match**: A chat system allows players to communicate after the match concludes.

### Multiplayer HUD

The in-game HUD expands during multiplayer to show both players' status:
- **Top-Left (Green Border)**: Local player's health, level, and equipment
- **Top-Right (Red Border)**: Remote player's health, level, and equipment
- **Center**: Match timer counting down to overtime

---

## Controls

### Keyboard and Mouse

- **W/A/S/D** or **Arrow Keys**: Move character
- **Mouse Movement**: Aim direction
- **Left Click**: Attack (for applicable weapons)
- **Q**: Open big map overlay
- **Escape**: Pause game

### Gamepad/Touch

The game supports touch controls through the NippleJS virtual joystick library, allowing play on mobile devices. Gamepad support provides controller-based movement and actions.

### Menu Navigation

- **Click**: Select menu options
- **Hover**: Preview information and effects

---

## Technical Architecture

### Core Technologies

- **THREE.js (v0.160.0)**: 3D rendering engine for WebGL graphics
- **Cannon.js**: Physics simulation for collision and movement
- **WebSocket/WebsimSocket**: Real-time multiplayer communication
- **NippleJS**: Virtual joystick for touch/mobile support

### File Structure

```
Cool-Game/
├── index.html      # HTML structure, CSS styling, UI elements
├── main.js         # Entry point, menu system, lobby management
├── game/
│   └── game.js     # Core game engine, world generation, combat
└── utils/
    └── game.js     # Utility functions, particle system, RNG
```

### Visual Rendering

The game employs custom post-processing shaders to achieve its distinctive retro aesthetic:

- **Pixelation Filter**: Renders at 55% resolution then upscales with nearest-neighbor filtering
- **Color Quantization**: Reduces color palette for a vintage look
- **Lighting**: Combination of ambient, directional, fill, and hemisphere lights

Material systems include PBR (physically-based rendering) for realistic surfaces and custom shaders for special effects like animated lava.

### Performance Optimizations

- **Object Pooling**: Particles and effects use pre-allocated pools (600 max particles) instead of creating/destroying objects
- **Frustum Culling**: Only renders objects visible to the camera
- **Geometry Reuse**: Common shapes are instanced rather than duplicated
- **Efficient Updates**: Physics uses fixed timestep while rendering adapts to actual framerate

### Audio System

Sound effects are triggered for combat events:
- `bonk.mp3`: Hit and attack sounds
- `boom.mp3`: Explosion effects

Background music features a 5-track playlist that shuffles automatically:
1. She Went Uber On My Thump
2. Unthumpable!
3. Thumpin' Around
4. Thump Thump, IDK WHAT THE MEANS BRO
5. Wednesday morning Thump it's 9am

Sir Chad has a unique character theme that plays instead of the standard playlist.

---

## Save Data and Persistence

UberThump uses browser localStorage to persist player progress between sessions. The following data is saved:

| Key | Purpose |
|-----|---------|
| `uberthump_has_played` | Tracks first-run status for tutorial display |
| `uberthump_unlocks` | Stores character unlock states |
| `uberthump_multiplayer_unlocked` | Tracks multiplayer access |
| `uberthump_tns_tier` | Story mode progress (1-4) |
| `uberthump_secret_note_unlocked` | Meta-story/Boberto unlock progress |
| `uberthump_skeletonKills` | Cumulative skeleton kill counter |
| `uberthump_weaponLevels` | Weapon leveling statistics |

All save data is local to the browser and not synced to any server. Clearing browser data will reset all progress.

### Debug Features

A hidden developer button in the top-left corner (10x10 pixels) provides instant unlock of all characters when clicked. The global function `__uberthump_unlockAll()` can also be called from the browser console for the same effect.

The settings panel includes a map code override field for custom map generation seeds and an entity log checkbox for verbose debugging output.

---

## Conclusion

UberThump represents a comprehensive action roguelike experience that combines accessible gameplay with deep character progression and strategic build variety. From the straightforward satisfaction of mowing down enemy hordes to the tense strategic decisions of competitive multiplayer, the game offers multiple engaging experiences within its retro-styled arena framework.

Whether you prefer the tanky resilience of MMOOVT, the blazing speed of Fox, the escalating momentum of Calcium, or the summoner gameplay of Boberto, there is a playstyle to match every preference. The unlock system provides long-term goals that reward exploration and mastery, while the multiple game modes ensure variety across play sessions.

The procedurally generated worlds, combined with the deep weapon and rune systems, ensure that no two runs are identical. Every session presents new opportunities to discover powerful synergies and push further than before. Good luck, and may your thump be uber.
