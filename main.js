import { Game, preloadGameTextures } from './game/game.js';
import * as THREE from 'three';

// Global preloaded textures cache
let preloadedTextures = null;

// Properly encode a file path for URLs - handles special characters like parentheses, braces, apostrophes
function encodeAssetPath(path) {
    // Split path by /, encode each component, rejoin
    return path.split('/').map((part, i) => {
        // Don't encode empty parts or the leading dot
        if (part === '' || part === '.') return part;
        // Encode the filename/directory part
        return encodeURIComponent(part);
    }).join('/');
}

// Fallback color texture generator
function createColorTexture(color, width = 64, height = 64, repeatX = 1, repeatY = 1) {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, width, height);
    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(repeatX, repeatY);
    texture.colorSpace = THREE.SRGBColorSpace;
    return texture;
}

window.addEventListener('DOMContentLoaded', () => {
    const enterGameBtn = document.getElementById('enter-game-btn');
    const startBtn = document.getElementById('start-btn');
    const startScreen = document.getElementById('start-screen');
    const gameOverScreen = document.getElementById('game-over-screen');
    const restartBtn = document.getElementById('restart-btn');
    // Fix main menu button
    if (restartBtn) {
        restartBtn.addEventListener('click', () => {
            window.location.reload();
        });
    }

    const unlockScreen = document.getElementById('unlock-screen');
    const unlockTitle = document.getElementById('unlock-title');
    const unlockName = document.getElementById('unlock-char-name');
    const unlockBtn = document.getElementById('unlock-continue-btn');
    const loadingOverlay = document.getElementById('loading-overlay');
    const characterCards = document.querySelectorAll('.character-card');
    // Note: pixel toggle moved to bottom-right (persistent). Use pixelToggleBottom below.
    const modeSelect = document.getElementById('mode-select');
    const awakeningMsg = document.getElementById('awakening-msg');
    const charDetailsEl = document.getElementById('character-details-panel');
    const charSelectGrid = document.getElementById('character-select');
    
    // Views
    const pixelToggleBottom = document.getElementById('pixel-toggle-bottom-input');
    let pixelateEnabled = pixelToggleBottom ? pixelToggleBottom.checked : true;
    const viewIntro = document.getElementById('menu-view-intro');
    const viewSelect = document.getElementById('menu-view-select');
    const viewLobby = document.getElementById('menu-view-lobby');
    const menuCanvas = document.getElementById('menu-bg-canvas');

    // Lobby Elements
    const lobbyP1Name = document.getElementById('lobby-p1-name');
    const lobbyP1Avatar = document.getElementById('lobby-p1-avatar');
    const lobbyP2Name = document.getElementById('lobby-p2-name');
    const lobbyP2Avatar = document.getElementById('lobby-p2-avatar');
    const lobbyStatus = document.querySelector('.lobby-header h2');
    const lobbySpinner = document.querySelector('.searching-spinner');
    const lobbyCancelBtn = document.getElementById('lobby-cancel-btn');
    const selectionHeader = document.getElementById('selection-header');

    // MP Selection State
    let mpOpponentReady = false;
    let mpOpponentChar = null;
    let mpMeReady = false;
    let mpMatchId = null;
    let mpSelectionInterval = null;

    let game = null;
    let room = null;
    let lobbyTimer = null;
    let selectedCharacter = 'MMOOVT';
    let selectedMode = 'ARCADE'; // 'ARCADE' | 'AWAKENING' | 'MULTI'
    // pixelateEnabled already declared earlier for the bottom pixel toggle; do not redeclare here.
    let useCharacterTheme = false;
    let menuScene = null;
    let menuAudio = null;
    let currentThemeNode = null;
    // Saved menu music state for temporary duck/slow while showing lore/tutorial
    let _savedMenuBgmState = null;

    const themeToggle = document.getElementById('theme-toggle');
    const themeToggleContainer = document.getElementById('theme-toggle-container');
    const modeHelperText = document.getElementById('mode-helper-text');

    // TNS Unlock: Requires Calcium
    function isTNSUnlocked() {
        return isCharacterUnlocked('CALCIUM');
    }
    // Pantheon Unlock: Beating TNS (Story Mode)
    function isPantheonUnlocked() {
        try { return !!localStorage.getItem('uberthump_pantheon_unlocked'); } catch (e) { return false; }
    }

    const loadWorldBtn = document.getElementById('load-world-btn');

    function updateGamemodeSelectState() {
        if (!modeSelect) return;
        const tnsOption = Array.from(modeSelect.options).find(o => o.value === 'TNS');
        const panOption = Array.from(modeSelect.options).find(o => o.value === 'PANTHEON');

        const tnsUnlocked = isTNSUnlocked();
        const panUnlocked = isPantheonUnlocked();

        if (tnsOption) {
            tnsOption.disabled = !tnsUnlocked;
            if (!tnsUnlocked && modeSelect.value === 'TNS') {
                modeSelect.value = 'ARCADE';
                selectedMode = 'ARCADE';
            }
        }
        if (panOption) {
            panOption.disabled = !panUnlocked;
            if (!panUnlocked && modeSelect.value === 'PANTHEON') {
                modeSelect.value = 'ARCADE';
                selectedMode = 'ARCADE';
            }
        }

        if (loadWorldBtn) loadWorldBtn.style.display = 'none';

        if (modeHelperText) {
            modeHelperText.style.display = 'block';
            if (!tnsUnlocked && modeSelect.value === 'TNS') {
                 modeHelperText.style.color = '#ff4444';
                 modeHelperText.textContent = 'Unlock CALCIUM to play Story Mode.';
            } else if (modeSelect.value === 'PANTHEON' && !panUnlocked) {
                 modeHelperText.style.color = '#ff4444';
                 modeHelperText.textContent = 'LOCKED: Beat Story Mode (Totally Not Scripted) to unlock Pantheon.';
            } else if (modeSelect.value === 'TNS') {
                 modeHelperText.style.color = '#00ff88';
                 modeHelperText.textContent = `STORY MODE: Save & Load Progression. 4 Tiers.`;
            } else if (modeSelect.value === 'PANTHEON') {
                 modeHelperText.style.color = '#00ffff';
                 modeHelperText.textContent = 'CREATIVE MODE: Totally not hacks, chat; im just locked in asf. (Non-Canon)';
                 if (loadWorldBtn) loadWorldBtn.style.display = 'inline-block';
            } else {
                modeHelperText.style.display = 'none';
            }
        }
    }

    // Hash function for seed
    function stringToSeed(str) {
        let hash = 0;
        if (str.length === 0) return hash;
        for (let i = 0; i < str.length; i++) {
            const char = str.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash;
        }
        return Math.abs(hash);
    }

    // TNS Saves Logic
    const tnsSaveUI = document.getElementById('tns-save-ui');
    const tnsSaveList = document.getElementById('tns-save-list');
    const tnsBackBtn = document.getElementById('tns-back-btn');
    let pendingTNSSlot = null; // Slot index we are currently creating a new game for

    function getTNSSaves() {
        try {
            const raw = localStorage.getItem('uberthump_tns_saves');
            return raw ? JSON.parse(raw) : [null, null, null];
        } catch(e) { return [null, null, null]; }
    }

    function renderSaveList() {
        const saves = getTNSSaves();
        tnsSaveList.innerHTML = '';
        
        saves.forEach((save, idx) => {
            const row = document.createElement('div');
            row.style.background = '#111';
            row.style.border = '1px solid #444';
            row.style.padding = '8px';
            row.style.display = 'flex';
            row.style.justifyContent = 'space-between';
            row.style.alignItems = 'center';
            
            if (save) {
                // Occupied Save
                const info = document.createElement('div');
                info.innerHTML = `<div style="color:#00ff88; font-size:0.8rem; font-weight:bold;">SAVE ${idx+1}: Tier ${save.tier}</div>
                                  <div style="color:#aaa; font-size:0.65rem;">${CHARACTERS[save.character] ? CHARACTERS[save.character].name : save.character}</div>`;
                
                const actions = document.createElement('div');
                actions.style.display = 'flex';
                actions.style.gap = '6px';
                
                const playBtn = document.createElement('button');
                playBtn.textContent = 'PLAY';
                playBtn.style.padding = '4px 8px';
                playBtn.style.fontSize = '0.7rem';
                playBtn.onclick = (e) => {
                    e.stopPropagation();
                    launchTNS(idx, save);
                };
                
                const delBtn = document.createElement('button');
                delBtn.textContent = 'DEL';
                delBtn.style.padding = '4px 8px';
                delBtn.style.fontSize = '0.7rem';
                delBtn.style.background = '#330000';
                delBtn.style.borderColor = '#ff4444';
                delBtn.style.color = '#ff4444';
                delBtn.onclick = (e) => {
                    e.stopPropagation();
                    if(confirm("Delete this save?")) {
                        saves[idx] = null;
                        localStorage.setItem('uberthump_tns_saves', JSON.stringify(saves));
                        renderSaveList();
                    }
                };
                
                actions.appendChild(playBtn);
                actions.appendChild(delBtn);
                
                row.appendChild(info);
                row.appendChild(actions);
            } else {
                // Empty Save
                row.innerHTML = `<div style="color:#666; font-size:0.8rem;">SAVE ${idx+1} (EMPTY)</div>`;
                const newBtn = document.createElement('button');
                newBtn.textContent = 'NEW GAME';
                newBtn.style.padding = '4px 8px';
                newBtn.style.fontSize = '0.7rem';
                newBtn.onclick = (e) => {
                    e.stopPropagation();
                    startNewTNS(idx);
                };
                row.appendChild(newBtn);
            }
            tnsSaveList.appendChild(row);
        });
    }

    function startNewTNS(slotIdx) {
        // Instead of creating immediately, go to character selection phase
        pendingTNSSlot = slotIdx;
        
        // Hide Save UI, Show Character Selection
        tnsSaveUI.style.display = 'none';
        charSelectGrid.style.display = 'grid';
        if (selectionHeader) selectionHeader.style.display = 'block';
        if (selectionHeader) selectionHeader.textContent = `SELECT HERO FOR SAVE ${slotIdx + 1}`;
        
        // Show confirm button
        startBtn.style.display = 'block';
        startBtn.textContent = 'START NEW STORY';
        startBtn.classList.add('pulse-btn');
        
        // Filter character grid to show only unlocked ones? 
        // Logic already handles this via `isCharacterUnlocked`.
    }

    function launchTNS(slotIdx, saveData) {
        // Launch Game with TNS params
        const settings = {
            mode: 'TNS',
            tnsSlot: slotIdx,
            tnsData: saveData
        };
        // Force character selection to match save
        selectedCharacter = saveData.character;
        
        // Hide UI
        tnsSaveUI.style.display = 'none';
        
        // Start
        if (menuScene) {
            menuScene.playPortalAnim(() => {
                startGame(settings);
            });
        } else {
            startGame(settings);
        }
    }

    if (tnsBackBtn) {
        tnsBackBtn.onclick = () => {
            tnsSaveUI.style.display = 'none';
            // If we backed out of creating a new save in TNS, return to the "TNS Mode" start screen state
            // which hides the grid.
            if (selectedMode === 'TNS') {
                charSelectGrid.style.display = 'none';
            } else {
                charSelectGrid.style.display = 'grid';
            }
            startBtn.style.display = 'block';
            startBtn.textContent = '▶ PLAY';
            startBtn.classList.remove('pulse-btn');
            pendingTNSSlot = null;
            if (selectionHeader) selectionHeader.style.display = 'none';
        };
    }

    // Run once on load deferred until dependencies are ready (see bottom of file)
    
    // Move the "Use Character Theme" toggle to sit near the gamemode control so it's not cut off.
    try {
        if (themeToggleContainer && modeSelect && modeSelect.parentElement) {
            const parent = modeSelect.parentElement;
            if (parent.nextSibling) parent.parentElement.insertBefore(themeToggleContainer, parent.nextSibling);
            else parent.parentElement.appendChild(themeToggleContainer);
        }
    } catch (e) {}

    if (themeToggle) {
        themeToggle.addEventListener('change', () => {
            useCharacterTheme = themeToggle.checked;
        });
    }
    
    // Initial state check
    if (themeToggleContainer) {
        // Hide by default for MMOOVT
        themeToggleContainer.style.display = 'none';
    }

    if (modeSelect) {
        modeSelect.addEventListener('change', () => {
            selectedMode = modeSelect.value || 'ARCADE';

            // Simple mode-dependent menu behavior
            if (selectedMode === 'AWAKENING') {
                // Awakening: force Knight, hide character grid
                charSelectGrid.style.display = 'none';
                if (charDetailsEl) charDetailsEl.style.display = 'none';
                if (pixelToggleBottom) {
                    pixelToggleBottom.checked = true;
                    pixelToggleBottom.disabled = true;
                    pixelateEnabled = true;
                    if (menuScene && typeof menuScene.setPixelMode === 'function') menuScene.setPixelMode(true);
                }
                awakeningMsg.style.display = 'block';
                selectedCharacter = 'MMOOVT';
                if (menuScene) menuScene.setPreviewCharacter('MMOOVT');
                if (selectionHeader) selectionHeader.style.display = 'none';
                
            } else if (selectedMode === 'TNS') {
                // Totally Not Scripted (Story Mode)
                // Hide character grid initially - user selects character AFTER choosing a save slot
                charSelectGrid.style.display = 'none'; 
                if (charDetailsEl) charDetailsEl.style.display = 'none';
                if (pixelToggleBottom) pixelToggleBottom.disabled = false;
                
                awakeningMsg.style.display = 'block';
                awakeningMsg.style.color = '#ffd700';
                awakeningMsg.textContent = `STORY MODE: Select a Save to continue or start new.`;
                
                if (selectionHeader) selectionHeader.style.display = 'none';

            } else if (selectedMode === 'PANTHEON') {
                // Pantheon / Creative
                charSelectGrid.style.display = 'grid';
                // Reset card visibility
                const cards = document.querySelectorAll('.character-card');
                cards.forEach(c => {
                    const k = c.getAttribute('data-char');
                    if (isCharacterUnlocked(k)) c.style.display = '';
                });
                
                if (charDetailsEl && !isFirstRun) charDetailsEl.style.display = 'block';
                if (pixelToggleBottom) pixelToggleBottom.disabled = false;
                awakeningMsg.style.display = 'block';
                awakeningMsg.style.color = '#00ffff';
                awakeningMsg.textContent = "PANTHEON: Build & Export custom worlds. Creative mode with flight. Totally not hacks.";
                
                if (selectionHeader) selectionHeader.style.display = 'none';

            } else {
                // Classic
                charSelectGrid.style.display = 'grid';
                // Reset card visibility (show all unlocked)
                const cards = document.querySelectorAll('.character-card');
                cards.forEach(c => {
                    const k = c.getAttribute('data-char');
                    if (isCharacterUnlocked(k)) c.style.display = '';
                });

                if (charDetailsEl && !isFirstRun) charDetailsEl.style.display = 'block';
                if (pixelToggleBottom) pixelToggleBottom.disabled = false;
                awakeningMsg.style.display = 'none';
                
                const card = document.querySelector(`.character-card[data-char="${selectedCharacter}"]`);
                if (card) card.click();

                if (menuScene && typeof menuScene.setPixelMode === 'function') {
                    menuScene.setPixelMode(pixelateEnabled);
                }
                if (selectionHeader) selectionHeader.style.display = 'none';
            }

            updateGamemodeSelectState();
        });
    }
    
    // Load World Handler
    if (loadWorldBtn) {
        loadWorldBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            const input = prompt("Paste your World Data Code here:");
            if (!input || !input.trim()) return;
            
            try {
                // Basic validation (base64 check or just length)
                if (input.length < 5) throw new Error("Invalid code");
                
                const choice = confirm("Press OK to Edit in Pantheon, or Cancel to Play in Arcade mode.");
                
                // Determine settings based on choice
                const settings = {
                    mode: choice ? 'PANTHEON' : 'ARCADE',
                    customWorldData: input
                };
                
                // Force mode selection visual sync if Editing
                if (choice) {
                    modeSelect.value = 'PANTHEON';
                    selectedMode = 'PANTHEON';
                } else {
                    modeSelect.value = 'ARCADE';
                    selectedMode = 'ARCADE';
                }
                
                // Start game with data
                startGame(settings);
                
            } catch(e) {
                alert("Failed to load world. Code may be invalid.");
                console.error(e);
            }
        });
    }

    // --- NEW LOBBY SYSTEM ---
    
    // Elements
    const viewBrowser = document.getElementById('menu-view-browser');
    const viewLobbyRoom = document.getElementById('menu-view-lobby-room');
    const lobbyList = document.getElementById('lobby-list');
    const browserCreateBtn = document.getElementById('browser-create-btn');
    const browserBackBtn = document.getElementById('browser-back-btn');
    
    const lobbyRoomTitle = document.getElementById('lobby-room-title');
    const lobbyRoomId = document.getElementById('lobby-room-id');
    const lobbyPlayerList = document.getElementById('lobby-player-list');
    const lobbyStartBtn = document.getElementById('lobby-start-btn');
    const lobbyLeaveBtn = document.getElementById('lobby-leave-btn');
    const lobbyPlayerCount = document.getElementById('lobby-player-count');
    
    // Settings inputs
    const setMode = document.getElementById('lobby-setting-mode');
    const setTime = document.getElementById('lobby-setting-time');
    const setLoot = document.getElementById('lobby-setting-loot');
    const setSpawn = document.getElementById('lobby-setting-spawn');
    const setInf = document.getElementById('lobby-setting-infinite');

    let currentLobby = null; // { id, hostId, isHost, settings }
    let lobbyPollInterval = null;

    async function openBrowser() {
        if (!room) {
            room = new window.WebsimSocket();
            await room.initialize();
        }
        
        viewSelect.style.display = 'none';
        viewIntro.style.display = 'none';
        viewBrowser.style.display = 'flex';
        
        // Reset presence to "browser"
        room.updatePresence({ status: 'browser', lobbyId: null, hosting: null });
        
        startLobbyScan();
    }
    
    function startLobbyScan() {
        if (lobbyPollInterval) clearInterval(lobbyPollInterval);
        
        const scan = () => {
            lobbyList.innerHTML = '';
            const peers = room.peers;
            let found = false;
            
            for (const id in peers) {
                if (id === room.clientId) continue;
                const p = room.presence[id];
                if (p && p.hosting) {
                    found = true;
                    // Render Lobby Card
                    const hostName = peers[id].username || "Player";
                    const info = p.hosting;
                    const mode = info.mode || 'PVP';
                    const playerCount = info.playerCount || 1;
                    
                    const div = document.createElement('div');
                    div.style.background = '#111';
                    div.style.border = '1px solid #444';
                    div.style.padding = '10px';
                    div.style.marginBottom = '8px';
                    div.style.display = 'flex';
                    div.style.justifyContent = 'space-between';
                    div.style.alignItems = 'center';
                    
                    div.innerHTML = `
                        <div>
                            <div style="color:#00ff88; font-weight:bold; font-size:0.8rem;">${hostName}'s Lobby</div>
                            <div style="color:#aaa; font-size:0.7rem;">${mode} • ${playerCount}/4 Players</div>
                        </div>
                        <button style="background:#222; border:1px solid #fff; color:#fff; font-size:0.7rem; padding:6px 12px; cursor:pointer;">JOIN</button>
                    `;
                    
                    div.querySelector('button').onclick = () => joinLobby(id);
                    lobbyList.appendChild(div);
                }
            }
            
            if (!found) {
                lobbyList.innerHTML = '<div style="color:#666; text-align:center; margin-top:20px;">No open lobbies found. Create one!</div>';
            }
        };
        
        scan();
        lobbyPollInterval = setInterval(scan, 2000);
    }
    
    // Create Lobby
    browserCreateBtn.onclick = () => {
        if (lobbyPollInterval) clearInterval(lobbyPollInterval);
        currentLobby = {
            id: 'lobby_' + room.clientId,
            hostId: room.clientId,
            isHost: true,
            players: [room.clientId],
            settings: { mode: 'PVP', timeLimit: 600 },
            status: 'waiting' // Init status
        };
        
        enterLobbyRoom();
        updateHostPresence();
    };
    
    // Join Lobby
    function joinLobby(hostId) {
        if (lobbyPollInterval) clearInterval(lobbyPollInterval);
        currentLobby = {
            id: 'lobby_' + hostId,
            hostId: hostId,
            isHost: false,
            players: [],
            settings: {} // will sync
        };
        
        // Notify host we are joining via presence and explicitly mark that we are NOT yet allowed to pick
        // (host will enable mpAllowed when they press Start Game to begin selection).
        if (room) {
            room.updatePresence({
                status: 'lobby_member',
                lobbyId: currentLobby.id,
                mpAllowed: false
            });
        }
        enterLobbyRoom();
    }

    // Shared 3-second synced start countdown for all players in a lobby
    let mpCountdownActive = false;
    function beginSyncedStart(settings) {
        if (mpCountdownActive) return;
        mpCountdownActive = true;

        // Simple top-center countdown banner
        let banner = document.getElementById('mp-countdown-banner');
        if (!banner) {
            banner = document.createElement('div');
            banner.id = 'mp-countdown-banner';
            banner.style.position = 'fixed';
            banner.style.top = '18px';
            banner.style.left = '50%';
            banner.style.transform = 'translateX(-50%)';
            banner.style.zIndex = '300';
            banner.style.background = 'rgba(0,0,0,0.9)';
            banner.style.border = '2px solid #00ff88';
            banner.style.color = '#fff';
            banner.style.padding = '6px 14px';
            banner.style.fontFamily = 'Press Start 2P, monospace';
            banner.style.fontSize = '0.75rem';
            banner.style.letterSpacing = '0.12em';
            document.body.appendChild(banner);
        }
        let count = 3;
        banner.textContent = `MATCH STARTS IN ${count}...`;

        const interval = setInterval(() => {
            count--;
            if (count > 0) {
                banner.textContent = `MATCH STARTS IN ${count}...`;
            } else {
                clearInterval(interval);
                banner.textContent = 'GO!';
                setTimeout(() => {
                    if (banner && banner.parentElement) banner.parentElement.removeChild(banner);
                }, 600);
                mpCountdownActive = false;
                // Launch the game using lobby settings (PVP or SURVIVAL)
                launchGameFromLobby(settings || {});
            }
        }, 1000);
    }
    
    function enterLobbyRoom() {
        viewBrowser.style.display = 'none';
        viewLobbyRoom.style.display = 'flex';
        
        lobbyRoomId.innerText = `ID: ${currentLobby.id.substr(0, 12)}...`;
        
        // Disable settings for guests
        const disable = !currentLobby.isHost;
        setMode.disabled = disable;
        setTime.disabled = disable;
        setLoot.disabled = disable;
        setSpawn.disabled = disable;
        setInf.disabled = disable;
        
        lobbyStartBtn.style.display = currentLobby.isHost ? 'block' : 'none';
        
        if (currentLobby.isHost) {
            // Host Loop: Monitor members
            lobbyPollInterval = setInterval(() => {
                const members = [room.clientId];
                const peers = room.peers;
                for (const id in peers) {
                    if (id === room.clientId) continue;
                    const p = room.presence[id];
                    if (p && p.lobbyId === currentLobby.id) {
                        members.push(id);
                    }
                }
                currentLobby.players = members;
                updateLobbyUI(members);
                updateHostPresence(); // Broadcast latest state

                // If host put lobby into 'selecting' and there is at least one other player, open selection UI for host
                const myPres = room.presence[room.clientId];
                if (myPres && myPres.hosting) {
                    // Host enters selection even if alone (for testing) or with players
                    if (myPres.hosting.status === 'selecting' && !window.mpSelectionActive) {
                        const opponentId = members.find(id => id !== room.clientId) || null;
                        startMPSelection(opponentId);
                    } else if (myPres.hosting.status === 'starting') {
                        // Shared start state: begin synced countdown & launch for host
                        beginSyncedStart(myPres.hosting.settings || currentLobby.settings || {});
                    }
                }
            }, 1000);
        } else {
            // Guest Loop: Monitor Host settings
            lobbyStartBtn.innerText = "WAITING FOR HOST...";
            lobbyPollInterval = setInterval(() => {
                const p = room.presence[currentLobby.hostId];
                if (!p || !p.hosting) {
                    // Host left
                    leaveLobby();
                    alert("Host disconnected.");
                    return;
                }
                
                // Sync UI
                const s = p.hosting.settings;
                setMode.value = s.mode;
                setTime.value = s.timeLimit;
                setLoot.value = s.lootMult;
                setSpawn.value = s.spawnMult;
                setInf.checked = !!s.infiniteSlots;
                
                // Sync Players
                const members = p.hosting.players || [];
                updateLobbyUI(members);
                
                // If host moved into character selection state, open MP selection UI for guests
                if (p.hosting.status === 'selecting') {
                    // If guest -> present selection and ready flow
                    if (!window.mpSelectionActive) {
                        startMPSelection(currentLobby.hostId);
                    }
                }
                
                // Check start signal (only host will set to 'starting' once both ready and selection complete)
                if (p.hosting.status === 'starting') {
                    // Hide character select overlay just in case
                    if (viewSelect) viewSelect.style.display = 'none';
                    // Begin shared countdown & start for guests
                    beginSyncedStart(s);
                }
            }, 1000);
        }
    }
    
    function updateHostPresence() {
        if (!currentLobby.isHost) return;
        
        // Grab current settings from UI
        const s = {
            mode: setMode.value,
            timeLimit: parseInt(setTime.value),
            lootMult: parseFloat(setLoot.value),
            spawnMult: parseFloat(setSpawn.value),
            infiniteSlots: setInf.checked
        };
        currentLobby.settings = s;
        
        room.updatePresence({
            status: 'hosting',
            hosting: {
                name: (room.peers[room.clientId].username || "Host"),
                mode: s.mode,
                playerCount: currentLobby.players.length,
                players: currentLobby.players,
                settings: s,
                status: currentLobby.status || 'waiting' // Use stored status
            },
            lobbyId: currentLobby.id
        });
    }
    
    function updateLobbyUI(members) {
        // Compute capacity based on lobby mode (default to PVP rules)
        const mode = (currentLobby && currentLobby.settings && currentLobby.settings.mode) ? currentLobby.settings.mode : (setMode ? setMode.value : 'PVP');
        const capacity = (mode === 'SURVIVAL') ? 4 : 2;
        lobbyPlayerCount.innerText = `(${members.length}/${capacity})`;
        lobbyPlayerList.innerHTML = '';
        
        members.forEach(id => {
            const peer = room.peers[id];
            const name = peer ? peer.username : "Unknown";
            const div = document.createElement('div');
            div.style.padding = '4px';
            div.style.background = '#222';
            div.style.borderLeft = (id === currentLobby.hostId) ? '3px solid #ffd700' : '3px solid #666';
            div.innerText = name + (id === room.clientId ? " (YOU)" : "");
            lobbyPlayerList.appendChild(div);
        });
    }
    
    function leaveLobby() {
        if (lobbyPollInterval) clearInterval(lobbyPollInterval);
        currentLobby = null;
        if (room) {
            room.updatePresence({ status: 'browser', lobbyId: null, hosting: null, mpAllowed: false });
        }
        viewLobbyRoom.style.display = 'none';
        openBrowser();
    }
    
    lobbyLeaveBtn.onclick = leaveLobby;
    browserBackBtn.onclick = () => {
        if (lobbyPollInterval) clearInterval(lobbyPollInterval);
        viewBrowser.style.display = 'none';
        viewSelect.style.display = 'flex';
        // Go back to main
    };
    
    // Host Start -> Switch to character selection state, do NOT immediately launch game.
    lobbyStartBtn.onclick = () => {
        if (!currentLobby.isHost) return;

        // Determine the authoritative mode from the lobby settings UI (PVP or SURVIVAL)
        const uiMode = (currentLobby.settings && currentLobby.settings.mode) ? currentLobby.settings.mode : setMode.value;
        
        // Relaxed requirement: Warn instead of block if count is low, default min is 2
        const minPlayers = 2;

        // Compute current members directly from presence to avoid stale currentLobby.players
        let members = [room.clientId];
        for (const id in room.presence) {
            if (id === room.clientId) continue;
            const p = room.presence[id];
            if (p && p.lobbyId === currentLobby.id) {
                members.push(id);
            }
        }
        const currentCount = members.length;

        if (currentCount < minPlayers) {
            const proceed = confirm(`Usually requires ${minPlayers}+ players. Start anyway with ${currentCount}?`);
            if (!proceed) return;
        }

        // Build hosting object with up-to-date players list and status 'selecting'
        const hostingState = {
            name: (room.peers[room.clientId] && room.peers[room.clientId].username) || "Host",
            mode: setMode.value,
            playerCount: currentCount,
            players: members,
            settings: {
                mode: setMode.value,
                timeLimit: parseInt(setTime.value),
                lootMult: parseFloat(setLoot.value),
                spawnMult: parseFloat(setSpawn.value),
                infiniteSlots: setInf.checked
            },
            status: 'selecting'
        };

        // Persist currentLobby.players locally too so UI stays consistent
        currentLobby.players = members;
        currentLobby.settings = hostingState.settings;
        // UPDATE LOCAL STATUS to 'selecting' so the polling loop doesn't overwrite it
        currentLobby.status = 'selecting';

        // Signal selection phase (wait for players to ready + choose chars)
        // Also set mpAllowed:true so clients know host opened character selection
        room.updatePresence({
            status: 'hosting',
            hosting: hostingState,
            lobbyId: currentLobby.id,
            mpAllowed: true
        });

        // Immediately transition host to selection screen to avoid waiting for polling loop
        // Find first opponent for the UI
        const opponentId = members.find(id => id !== room.clientId) || null;
        startMPSelection(opponentId);
    };
    
    function launchGameFromLobby(settings) {
        if (lobbyPollInterval) clearInterval(lobbyPollInterval);
        
        // Transition to in-game from lobby using the current selected character & lobby settings
        viewLobbyRoom.style.display = 'none';
        
        // Stop theme preview
        if (currentThemeNode) {
            try { currentThemeNode.stop(); } catch(e){}
        }
        
        if (menuScene) {
            menuScene.playPortalAnim(() => {
                startGame(settings);
            });
        } else {
            startGame(settings);
        }
    }

    function startMPSelection(oppId) {
        // Ensure selection mode state
        window.mpSelectionActive = true;
        mpOpponentReady = false;
        mpMeReady = false;
        mpOpponentChar = null;

        // Hide Lobby UI to reduce clutter
        if (viewLobbyRoom) viewLobbyRoom.style.display = 'none';

        // Ensure the selection view is visible so players can actually pick characters
        try {
            // Show the selection view and character grid if hidden
            if (viewSelect) viewSelect.style.display = 'flex';
            if (charSelectGrid) charSelectGrid.style.display = 'grid';
            if (selectionHeader) selectionHeader.style.display = 'block';
            // Ensure menu camera/preview is in selection pose
            if (menuScene && typeof menuScene.transitionToSelect === 'function') menuScene.transitionToSelect();
        } catch (e) {}

        // Add Opponent Status UI to top-right and remove duplicate "you" status UI if present
        let oppStatus = document.getElementById('mp-select-status');
        if (!oppStatus) {
            oppStatus = document.createElement('div');
            oppStatus.id = 'mp-select-status';
            oppStatus.style.position = 'absolute';
            oppStatus.style.top = '20px';
            oppStatus.style.right = '20px';
            oppStatus.style.background = 'rgba(0,0,0,0.8)';
            oppStatus.style.border = '2px solid #ff4444';
            oppStatus.style.padding = '10px';
            oppStatus.style.color = '#fff';
            oppStatus.style.zIndex = '150';
            oppStatus.style.textAlign = 'left';
            oppStatus.innerHTML = `
                <div style="font-size:0.7rem; color:#aaa; margin-bottom:4px;">OPPONENT</div>
                <div id="mp-opp-name" style="font-size:1rem; font-weight:bold;">Player 2</div>
                <div id="mp-opp-state" style="font-size:0.8rem; color:#ff4444; margin-top:4px;">CHOOSING...</div>
                <div id="mp-opp-char" style="font-size:0.7rem; color:#ddd; margin-top:2px;"></div>
            `;
            document.body.appendChild(oppStatus);
        } else {
            oppStatus.style.display = 'block';
        }

        // Remove any leftover player-top-left status UI to avoid duplicates
        const youStatus = document.getElementById('mp-select-status-you');
        if (youStatus) {
            try { youStatus.remove(); } catch (e) {}
        }

        // Populate opponent info immediately if available
        try {
            if (room && room.peers && room.peers[oppId]) {
                const name = room.peers[oppId].username || 'Opponent';
                const nameEl = document.getElementById('mp-opp-name');
                if (nameEl) nameEl.textContent = name;
            }
        } catch (e) {}

        // Ensure player's displayed name if UI exists
        try {
            if (room && room.clientId && room.peers && room.peers[room.clientId]) {
                const youName = room.peers[room.clientId].username || 'You';
                let youEl = document.getElementById('mp-you-name');
                if (!youEl) {
                    // create a small you-status in top-left if desired
                    youEl = document.createElement('div');
                    youEl.id = 'mp-you-name';
                    youEl.style.position = 'absolute';
                    youEl.style.top = '20px';
                    youEl.style.left = '20px';
                    youEl.style.background = 'rgba(0,0,0,0.8)';
                    youEl.style.border = '2px solid #00ff88';
                    youEl.style.padding = '10px';
                    youEl.style.color = '#fff';
                    youEl.style.zIndex = '150';
                    youEl.style.textAlign = 'left';
                    youEl.textContent = youName;
                    document.body.appendChild(youEl);
                } else {
                    youEl.textContent = youName;
                }
            }
        } catch (e) {}

        // Loop to sync selection state (presence of all players in this lobby)
        mpSelectionInterval = setInterval(() => {
            if (!room) return;

            // Build list of all players in this lobby and their picks
            const takenChars = new Set();
            let opponentPresence = null;
            for (const id in room.presence) {
                const p = room.presence[id];
                if (!p || p.lobbyId !== (currentLobby && currentLobby.id)) continue;

                if (p.mpChar) {
                    takenChars.add(p.mpChar);
                }
                // Track primary opponent as "someone that is not me"
                if (id !== room.clientId && !opponentPresence) {
                    opponentPresence = { id, pres: p };
                }
            }

            // Update opponent ready/char UI from primary opponent presence
            if (opponentPresence) {
                const p = opponentPresence.pres;

                // Sync Ready
                const isReady = p.mpReady === true;
                if (mpOpponentReady !== isReady) {
                    mpOpponentReady = isReady;
                    const stateEl = document.getElementById('mp-opp-state');
                    if (stateEl) {
                        if (isReady) {
                            stateEl.textContent = "READY!";
                            stateEl.style.color = "#00ff88";
                        } else {
                            stateEl.textContent = "CHOOSING...";
                            stateEl.style.color = "#ff4444";
                        }
                    }
                    checkStart();
                }

                // Sync Character for opponent label
                if (p.mpChar && p.mpChar !== mpOpponentChar) {
                    mpOpponentChar = p.mpChar;
                    const charName = CHARACTER_INFO[p.mpChar] ? CHARACTER_INFO[p.mpChar].name : p.mpChar;
                    const charEl = document.getElementById('mp-opp-char');
                    if (charEl) charEl.textContent = `Picked: ${charName}`;
                }
            }

            // Enforce one unique skin per lobby: lock any card taken by someone else
            characterCards.forEach(card => {
                const key = card.getAttribute('data-char');
                card.classList.remove('mp-locked');
                if (takenChars.has(key) && key !== selectedCharacter) {
                    card.classList.add('mp-locked');
                }
            });
        }, 100);

        // Ensure character cards remain selectable locally; Start button becomes Ready toggle for lobby selection
        const btn = document.getElementById('start-btn');
        if (btn) {
            btn.textContent = mpMeReady ? "READY!" : "READY UP";
            btn.style.background = mpMeReady ? "#00ff88" : "#000";
            btn.style.color = mpMeReady ? "#000" : "#fff";
            btn.onclick = (e) => {
                e.stopPropagation();
                e.stopImmediatePropagation();

                // Toggle Ready
                mpMeReady = !mpMeReady;

                // Broadcast selection & ready state to peers
                if (room) {
                    room.updatePresence({
                        mpReady: mpMeReady,
                        mpChar: selectedCharacter,
                        matchId: mpMatchId
                    });
                }

                // Update button visuals
                if (mpMeReady) {
                    btn.style.background = "#00ff88";
                    btn.style.color = "#000";
                    btn.textContent = "READY!";
                } else {
                    btn.style.background = "#000";
                    btn.style.color = "#fff";
                    btn.textContent = "READY UP";
                }

                checkStart();
            };
        }
    }

    function checkStart() {
        // Only the host is responsible for signalling the shared start state
        if (mpMeReady && mpOpponentReady && currentLobby && currentLobby.isHost && room) {
            // Build up-to-date list of players in this lobby
            const members = [room.clientId];
            for (const id in room.presence) {
                if (id === room.clientId) continue;
                const p = room.presence[id];
                if (p && p.lobbyId === currentLobby.id) {
                    members.push(id);
                }
            }

            // Mark status locally so polling loop maintains it
            currentLobby.status = 'starting';

            // Update hosting presence to "starting" so all clients see it and run the synced countdown
            const s = currentLobby.settings || {
                mode: setMode.value,
                timeLimit: parseInt(setTime.value),
                lootMult: parseFloat(setLoot.value),
                spawnMult: parseFloat(setSpawn.value),
                infiniteSlots: setInf.checked
            };

            room.updatePresence({
                status: 'hosting',
                hosting: {
                    name: (room.peers[room.clientId] && room.peers[room.clientId].username) || "Host",
                    mode: s.mode,
                    playerCount: members.length,
                    players: members,
                    settings: s,
                    status: 'starting'
                },
                lobbyId: currentLobby.id
            });
        }
    }
    
    function launchMPGame() {
        window.mpSelectionActive = false;
        // Clean up UI
        const oppStatus = document.getElementById('mp-select-status');
        if (oppStatus) oppStatus.style.display = 'none';
        
        // Restore standard start button for next time (if any)
        const btn = document.getElementById('start-btn');
        if (btn) btn.onclick = null; // Remove override
        
        // Direct call to start logic, bypassing menu
        // Stop theme preview
        if (currentThemeNode) {
            try { currentThemeNode.stop(); } catch(e){}
        }
        
        // Trigger portal sequence
        if (menuScene) {
            menuScene.playPortalAnim(() => {
                startGame();
            });
        } else {
            startGame();
        }
    }

    if (lobbyCancelBtn) {
        lobbyCancelBtn.addEventListener('click', () => {
            if (lobbyTimer) clearInterval(lobbyTimer);
            if (room) room.updatePresence({ status: 'menu' }); // stop searching
            
            viewLobby.style.display = 'none';
            viewSelect.style.display = 'flex';
            // Return to defaults
            charSelectGrid.style.display = 'none';
            if (selectionHeader) selectionHeader.style.display = 'none';
        });
    }

    const CHARACTER_INFO = {
        MMOOVT: {
            name: 'Mr. Mc. Oofy Otterson Vangough III',
            role: 'Tanky Knight • Melee',
            hp: 160,
            speed: 'Slow',
            damage: 'High single-hit',
            special: 'Manual sword slashes in a wide arc.',
            blurb: 'A stubborn frontline tank who rewards careful positioning. Great at deleting clusters of enemies once you get in range.',
            unlock: 'Always unlocked.'
        },
        FOX: {
            name: 'Fox',
            role: 'Fast Caster • Fireball',
            hp: 65,
            speed: 'Very fast',
            damage: 'High AoE',
            special: 'Rapid-fire explosive fireballs that seek enemies.',
            blurb: 'Glass cannon caster that lives by kiting. Use speed and ranged pressure to control the arena.',
            unlock: 'Always unlocked.'
        },
        CALCIUM: {
            name: 'Calcium',
            role: 'Skate Skeleton • Bones',
            hp: 90,
            speed: 'Builds speed while moving',
            damage: 'Chain hits',
            special: 'Throws ricocheting bones that bounce between enemies.',
            blurb: 'A momentum-based skater that gets faster the more you move. Keep shredding to stay safe and delete lines of enemies.',
            unlock: 'Unlock: Kill 200 skeletons AND get a miniboss kill as Mr. Mc. Oofy Otterson Vangough III.',
            themeUrl: "./CALCIUM'S THEME.mp3"
        },
        GIGACHAD: {
            name: 'GigaChad',
            role: 'Mega Tank • Aura',
            hp: 260,
            speed: 'Slow',
            damage: 'Sustained aura DPS',
            special: 'Damage aura around you and a flex that periodically ignores one big hit.',
            blurb: 'Walk into danger, flex through hits, and let enemies melt in your aura. Great for aggressive, close-range play.',
            unlock: 'Unlock: Upgrade any Aura weapon to Lv.3 AND unlock Monke.',
            themeColor: 'linear-gradient(135deg, #ffaa00, #ff5500)',
            themeUrl: "./GIGACHAD'S THEME.mp3"
        },
        BLITZ: {
            name: 'Blitz',
            role: 'Storm Bot • Lightning',
            hp: 120,
            speed: 'Average',
            damage: 'Burst zaps',
            special: 'Built-in lightning that auto-zaps nearby enemies, plus strong weapon fire rate.',
            blurb: 'All-rounder bot that feels good with almost any build. Great for learning routes around the arena.',
            unlock: 'Unlock: Defeat the main boss once.',
            themeColor: 'linear-gradient(135deg, #00ccff, #0044ff)',
            themeUrl: "./BLITZ'S THEME.mp3"
        },
        MONKE: {
            name: 'Monke',
            role: 'Primal • Bananas',
            hp: 130,
            speed: 'Very Fast',
            damage: 'Return Damage',
            special: 'Throws bananas that return. High agility and can climb steep walls.',
            blurb: 'Reject humanity. Return to monke. Finds creative ways around obstacles.',
            unlock: 'Unlock: Upgrade Bananerang to Lv.3 AND find the hidden crate in the world.',
            themeColor: 'linear-gradient(135deg, #5C4033, #C4A484)',
            themeUrl: "./MONKE'S THEME.mp3"
        },
        SIR_CHAD: {
            name: 'Sir Chadsirwellsirchadsirchadwellwell',
            role: 'God Tank • Giga Sword',
            hp: 800,
            speed: 'Heavy',
            damage: 'Massive Slash',
            special: 'Intimidating presence. Married to GigaChad.',
            blurb: 'The ultimate tank. A black knight of legend. #Pansexual #Bisexual #Poly #LoveIsLove #TankLife #GigaLove #SwordMaster #Pride #Rainbow #ChadFamily 🏳️‍🌈. He strikes with immense power.',
            unlock: 'Unlock: Unlock GigaChad AND Upgrade "Spinning Blade" to Lvl 5.',
            themeColor: 'linear-gradient(135deg, #000000, #440000)',
            themeUrl: "./SIR CHADSIRWELLSIRCHADSIRCHADWELLWELL'S THEME.mp3"
        },
        BOBERTO: {
            name: 'Boberto',
            role: 'Summoner • Ghost Sheet',
            hp: 90,
            speed: 'Average',
            damage: 'Minion Damage',
            special: 'Double Jump! Summons ghosts that seek and destroy enemies.',
            blurb: "Bob's legal son, immediately abandoned. Spawns friendly ghosts. Can eventually summon Deadly Ghosts and even a friendly Mini-Bob. Has a double jump.",
            unlock: 'Unlock: Find the Secret Note AND unlock Calcium, GigaChad, Blitz, Monke, and Sir Chad.',
            // Explicit requirements so the checklist and logic match what you actually did
            unlockRequirements: [
                'Find the Secret Note',
                'Unlock Calcium, GigaChad, Blitz, and Monke',
                'Unlock Sir Chad'
            ],
            themeColor: 'linear-gradient(135deg, #ffffff, #aaaaaa)'
        }
    };
    
    // Add theme color for Calcium
    if(CHARACTER_INFO.CALCIUM) CHARACTER_INFO.CALCIUM.themeColor = 'linear-gradient(135deg, #ffffff, #888888)';
    if(CHARACTER_INFO.MONKE) CHARACTER_INFO.MONKE.themeColor = 'linear-gradient(135deg, #5C4033, #FFD700)';

    const DEFAULT_UNLOCKS = {
        MMOOVT: true,
        FOX: true,
        CALCIUM: false,
        GIGACHAD: false,
        BLITZ: false,
        MONKE: false,
        SIR_CHAD: false,
        BOBERTO: false
    };

    function loadUnlocks() {
        try {
            const savedRaw = localStorage.getItem('uberthump_unlocks') || '{}';
            const saved = JSON.parse(savedRaw);
            const merged = { ...DEFAULT_UNLOCKS, ...saved };

            // Auto-unlock Boberto if all real requirements are met:
            //  - Secret note found
            //  - Calcium, GigaChad, Blitz, Monke, and Sir Chad all unlocked
            try {
                const hasSecretNote = localStorage.getItem('uberthump_secret_note_unlocked') === 'true';
                if (
                    !merged.BOBERTO &&
                    hasSecretNote &&
                    merged.CALCIUM &&
                    merged.GIGACHAD &&
                    merged.BLITZ &&
                    merged.MONKE &&
                    merged.SIR_CHAD
                ) {
                    merged.BOBERTO = true;
                    localStorage.setItem('uberthump_unlocks', JSON.stringify(merged));
                }
            } catch (e2) {}

            return merged;
        } catch (e) {
            return { ...DEFAULT_UNLOCKS };
        }
    }

    function saveUnlocks(unlocks) {
        try {
            localStorage.setItem('uberthump_unlocks', JSON.stringify(unlocks));
        } catch (e) {}
    }

    let unlocks = loadUnlocks();
    
    // FTUE: Check if first run
    const isFirstRun = !localStorage.getItem('uberthump_has_played');

    function isCharacterUnlocked(key) {
        return !!unlocks[key];
    }

    const lockedListEl = document.getElementById('locked-list');
    const lockedListItemsEl = document.getElementById('locked-list-items');

    function updateCharacterLocks() {
        unlocks = loadUnlocks();

        // Reset locked list
        if (lockedListItemsEl) lockedListItemsEl.innerHTML = '';
        
        // FTUE: Hide locked list entirely on first run
        if (isFirstRun) {
            if (lockedListEl) lockedListEl.style.display = 'none';
        }

        // Helper: evaluate common requirement phrases to check progress
        function evalRequirement(reqText, charKey) {
            // Normalize
            const t = (reqText || '').toLowerCase().trim();

            try {
                const saved = JSON.parse(localStorage.getItem('uberthump_unlocks') || '{}');
                const stats = {
                    skeletonKills: Number(localStorage.getItem('uberthump_skeletonKills') || 0),
                    minibossAsMMOOVT: !!(saved._minibossKilledAsMMOOVT),
                    weaponLevels: JSON.parse(localStorage.getItem('uberthump_weaponLevels') || '{}'),
                };
                const hasCalcium = !!saved.CALCIUM;
                const hasGiga = !!saved.GIGACHAD;
                const hasBlitz = !!saved.BLITZ;
                const hasMonke = !!saved.MONKE;
                const hasSir = !!saved.SIR_CHAD;
                const hasSecretNote = localStorage.getItem('uberthump_secret_note_unlocked') === 'true';

                // Specific Key Checks first
                if (t.includes('find the secret note') || t.includes('find secret note')) {
                    return hasSecretNote;
                }
                if (t.includes('unlock sir chad') || t.includes('sir chad')) {
                    return hasSir;
                }
                if (t.includes('unlock calcium')) return hasCalcium;
                if (t.includes('unlock gigachad')) return hasGiga;
                if (t.includes('unlock blitz')) return hasBlitz;
                if (t.includes('unlock monke')) return hasMonke;
                // Combined Boberto requirement line: "Unlock Calcium, GigaChad, Blitz, and Monke"
                if (t.includes('unlock calcium') && t.includes('gigachad') && t.includes('blitz') && t.includes('monke')) {
                    return hasCalcium && hasGiga && hasBlitz && hasMonke;
                }

                // Common patterns
                if (t.includes('kill') && t.includes('skeleton')) {
                    // e.g. "Kill 200 skeletons"
                    const m = t.match(/kill\s*(\d+)/);
                    const need = m ? Number(m[1]) : 1;
                    return stats.skeletonKills >= need;
                }
                if (t.includes('miniboss') && t.includes('mm oofy')) {
                    // "get a MM Oofy miniboss kill" or similar
                    return stats.minibossAsMMOOVT === true;
                }
                if (t.includes('find') && t.includes('crate')) {
                    // hidden crate requirement -> check crate open flag
                    return !!(saved.MONKE || saved._monkeCrateOpened);
                }
                if (t.includes('upgrade') && t.includes('bananerang')) {
                    // Upgrade Bananerang to Lvl 3
                    const lvl = (stats.weaponLevels && stats.weaponLevels['BANANERANG']) || 0;
                    return lvl >= 3;
                }
                if (t.includes('upgrade') && t.includes('aura')) {
                    // Example: "Upgrade any Aura weapon to Lv.3"
                    const wl = stats.weaponLevels || {};
                    const has = Object.keys(wl).some(k => (['ICE_AURA','SPIKE_RING','POISON_MIST'].includes(k) && wl[k] >= 3));
                    return has;
                }
                if (t.includes('defeat') && t.includes('main boss')) {
                    return !!saved._defeatedMainBoss;
                }
                if (t.includes('defeat') && t.includes('boss')) {
                    return !!saved._defeatedAnyBoss;
                }
                if (t.includes('upgrade') && t.includes('spinning blade') && t.includes('5')) {
                    // Check spinning blade level (SWORD)
                    const wl = stats.weaponLevels || {};
                    return (wl['SWORD'] || 0) >= 5;
                }
                
                // Composite check for Boberto list (fallback if individual checks above didn't catch specific list item)
                if (t.includes('gigachad') && t.includes('blitz') && t.includes('monke')) {
                    return hasCalcium && hasGiga && hasBlitz && hasMonke;
                }
            } catch (e) {
                // ignore parse errors
            }

            // Unknown requirement — default to false (unchecked)
            return false;
        }

        // Hide or show cards depending on unlocked state and build compact locked checklist
        characterCards.forEach(card => {
            const key = card.getAttribute('data-char');
            if (!key) return;
            const unlocked = isCharacterUnlocked(key);

            if (!unlocked) {
                card.classList.add('locked');
                // hide locked characters from main selection grid
                card.style.display = 'none';

                // FTUE: Don't populate locked list if first run
                if (isFirstRun) return;

                // Add to compact locked list with per-requirement checklist
                const info = CHARACTER_INFO[key];
                if (info && lockedListItemsEl) {
                    const wrapper = document.createElement('div');
                    wrapper.style.padding = '6px';
                    wrapper.style.borderBottom = '1px dashed rgba(255,255,255,0.08)';

                    const title = document.createElement('div');
                    title.textContent = info.name;
                    title.style.fontWeight = 'bold';
                    title.style.color = '#fff';
                    title.style.fontSize = '0.9rem';
                    title.style.marginBottom = '6px';
                    wrapper.appendChild(title);

                    // If the data object provides an explicit unlockRequirements array, use it.
                    // Otherwise, try to split the single unlock string by common separators ("AND", "&", ",")
                    let reqList = [];

                    if (Array.isArray(info.unlockRequirements) && info.unlockRequirements.length) {
                        reqList = info.unlockRequirements.slice();
                    } else if (typeof info.unlock === 'string' && info.unlock.trim().length) {
                        // Try splitting on " AND " or " & " or commas
                        if (info.unlock.indexOf('AND') !== -1) {
                            reqList = info.unlock.split(/AND/i).map(s => s.trim()).filter(Boolean);
                        } else if (info.unlock.indexOf('&') !== -1) {
                            reqList = info.unlock.split('&').map(s => s.trim()).filter(Boolean);
                        } else if (info.unlock.indexOf(',') !== -1) {
                            reqList = info.unlock.split(',').map(s => s.trim()).filter(Boolean);
                        } else {
                            reqList = [info.unlock];
                        }
                    } else {
                        reqList = ['Locked'];
                    }

                    // Create a tiny checklist UI, each requirement on its own row
                    const listEl = document.createElement('div');
                    listEl.style.display = 'flex';
                    listEl.style.flexDirection = 'column';
                    listEl.style.gap = '4px';
                    listEl.style.marginTop = '4px';
                    listEl.style.fontSize = '0.75rem';
                    listEl.style.color = '#fff';
                    listEl.style.opacity = '0.95';

                    reqList.forEach(reqText => {
                        const row = document.createElement('div');
                        row.style.display = 'flex';
                        row.style.alignItems = 'center';
                        row.style.gap = '8px';

                        const box = document.createElement('div');
                        box.className = 'checkbox';
                        box.style.width = '12px';
                        box.style.height = '12px';
                        box.style.border = '2px solid #fff';
                        box.style.display = 'inline-block';
                        box.style.flex = '0 0 auto';

                        const label = document.createElement('div');
                        label.textContent = reqText;
                        label.style.flex = '1 1 auto';
                        label.style.color = '#ff8888';
                        label.style.fontSize = '0.72rem';
                        // Allow wrapping so long unlock requirement texts are fully visible
                        label.style.whiteSpace = 'normal';
                        label.style.overflow = 'visible';
                        label.style.textOverflow = 'unset';

                        const checked = evalRequirement(reqText, key);
                        if (checked) {
                            box.classList.add('checked');
                            box.style.background = '#00ff88';
                            box.style.borderColor = '#00ff88';
                            label.style.color = '#cfeee0';
                        }

                        row.appendChild(box);
                        row.appendChild(label);
                        listEl.appendChild(row);
                    });

                    wrapper.appendChild(listEl);
                    lockedListItemsEl.appendChild(wrapper);
                }
            } else {
                card.classList.remove('locked');
                card.style.display = ''; // show unlocked characters in grid
            }
        });

        // Show locked-list only if there are items (and not first run)
        if (lockedListItemsEl && lockedListItemsEl.children.length > 0 && !isFirstRun) {
            if (lockedListEl) lockedListEl.style.display = 'block';
        } else {
            if (lockedListEl) lockedListEl.style.display = 'none';
        }

        // Ensure selectedCharacter is unlocked; if not, pick first available unlocked
        if (!isCharacterUnlocked(selectedCharacter)) {
            const firstUnlocked = Array.from(characterCards).find(card => {
                const key = card.getAttribute('data-char');
                return key && isCharacterUnlocked(key);
            });
            if (firstUnlocked) {
                selectedCharacter = firstUnlocked.getAttribute('data-char');
                characterCards.forEach(c => c.classList.remove('selected'));
                firstUnlocked.classList.add('selected');
            }
        }
        // Do NOT automatically pop the details panel on initial menu load.
        // Details are shown when the player opens the selection view.
    }

    function updateCharacterDetails() {
        if (!charDetailsEl) return;
        
        // FTUE: Hide details panel on first run
        if (isFirstRun) {
            charDetailsEl.style.display = 'none';
            return;
        }

        // Show panel
        charDetailsEl.style.display = 'block';
        
        const info = CHARACTER_INFO[selectedCharacter];
        if (!info) {
            charDetailsEl.style.display = 'none';
            return;
        }

        const isUnlocked = isCharacterUnlocked(selectedCharacter);
        
        // Only show unlock requirement if locked
        const unlockHtml = (!isUnlocked && info.unlock)
            ? `<div class="char-unlock">${info.unlock}</div>`
            : '';

        // Show theme song checkbox only for characters with themes (not Fox or MMOOVT)
        const hasTheme = !!info.themeUrl;
        const themeCheckboxHtml = hasTheme ? `
            <div class="char-stat-row" style="margin-top:8px;border-top:1px solid #333;padding-top:8px;">
                <label for="use-char-theme" style="display:flex;align-items:center;gap:8px;cursor:pointer;font-size:0.7rem;">
                    <input type="checkbox" id="use-char-theme" ${useCharacterTheme ? 'checked' : ''} style="width:16px;height:16px;cursor:pointer;">
                    <span>Use Character Theme</span>
                </label>
            </div>
        ` : '';

        // Add a top-level "View Bestiary" button that opens the enemy journal
        // Note: the Bestiary toggle button was moved out of this panel to a persistent top-right toggle.
        charDetailsEl.innerHTML = `
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">
                <h2 style="margin:0;">${info.name}</h2>
            </div>
            <div class="char-role">${info.role}</div>
            <div class="char-stat-row"><span>Max HP</span><span>${info.hp}</span></div>
            <div class="char-stat-row"><span>Move Speed</span><span>${info.speed}</span></div>
            <div class="char-stat-row"><span>Damage Style</span><span>${info.damage}</span></div>
            <div class="char-stat-row"><span>Special</span><span>${info.special}</span></div>
            <div class="char-desc">${info.blurb}</div>
            ${themeCheckboxHtml}
            ${unlockHtml}
        `;

        // Hook up the theme checkbox if present
        const themeCheckbox = document.getElementById('use-char-theme');
        if (themeCheckbox) {
            themeCheckbox.addEventListener('change', (e) => {
                useCharacterTheme = e.target.checked;
            });
        }

        // Hook up the bestiary button - logic moved to top-right persistent button
    }

    // ---- Bestiary data and overlay helpers ----
    const BESTIARY = [
        // Ground / melee enemies
        { key: 'skeleton', title: 'Skeleton', type: 'Enemy', hp: 5, damage: 6, notes: 'Light, mobile; often in groups.' },
        { key: 'ogre', title: 'Ogre', type: 'Enemy', hp: 22, damage: 18, notes: 'Tanky melee bruiser; high single-hit damage.' },
        { key: 'piglin', title: 'Piglin', type: 'Enemy', hp: 10, damage: 9, notes: 'Medium durability with tusks; mid-threat.' },
        { key: 'spider', title: 'Spider', type: 'Enemy', hp: 6, damage: 10, notes: 'Charges and explodes after a short wind-up; avoid close range.' },
        { key: 'zombie', title: 'Zombie', type: 'Enemy', hp: 9, damage: 8, notes: 'Slow but persistent; can block narrow paths.' },

        // Explicit miniboss entries
        { key: 'JOHN_PORK', title: 'John Pork the Terrible', type: 'Miniboss', hp: 700, damage: 28, notes: 'Armored brawler with heavy swings and a short charge; stagger window after his swing.' },
        { key: 'KAREN', title: 'Queen Karen', type: 'Miniboss', hp: 550, damage: 22, notes: 'Ranged/minion support; summons or zones the area with cone attacks.' },
        { key: 'BRUH_NUBIS', title: 'Bruh-nubis', type: 'Miniboss', hp: 625, damage: 26, notes: 'Teleporting strikes and collar-based AOE; punish flanking attempts.' },

        { key: 'BOSS_MAIN', title: 'The Gatekeeper', type: 'Boss', hp: 1500, damage: 40, notes: 'Massive health, teleports and fires pitchfork volleys; opens the portal when defeated.' },

        // Awakening-specific boss entry (Awakened Bob)
        { key: 'BOB', title: 'Bob (Awakened)', type: 'Awakened Boss', hp: 2000, damage: 35, notes: 'A massive grave guardian risen from the crypts; standard Bob spawns with ~2000 HP, heavy melee attacks and powerful shockwave tantrums. DEADLY_BOB spawns with ~5000 HP and stronger tantrums.' },

        // Overtime variant for Arcade (stacks) – enormous HP scaling and brutal hits
        { key: 'OVERTIME_BOB', title: 'Bob (Overtime Variant)', type: 'Overtime Boss', hp: 1000000, damage: 1000, notes: 'Arcade Overtime variant: spawns after 2.5 minutes and then repeatedly stacks; first Overtime Bob has 1,000,000 HP and each subsequent spawn adds another 1,000,000 HP to the newly spawned Bob; they deal 1000 damage per hit.' },

        // Ghost-class enemies (separated so players can see flying/overtime threats)
        { key: 'ghost_default', title: 'Ghost', type: 'Ghost', hp: 5, damage: 4, notes: 'Overtime floater; ignores terrain and lava, harasses from above; low HP but travels in waves — focus-fire to avoid being overwhelmed.' },
        { key: 'ghost_deadly', title: 'Deadly Ghost', type: 'Ghost (Deadly)', hp: 11, damage: 9, notes: 'Stronger ghost variant with higher HP and damage; more persistent and tougher to kite; prioritize with area-of-effect or fast single-target bursts.' }
    ];

    function ensureBestiaryOverlay() {
        if (document.getElementById('bestiary-overlay')) return;
        const overlay = document.createElement('div');
        overlay.id = 'bestiary-overlay';
        // Place bestiary as a compact top-right panel instead of a full-screen modal
        overlay.style.position = 'fixed';
        overlay.style.top = '16px';
        overlay.style.right = '16px';
        overlay.style.width = '420px';
        overlay.style.maxHeight = '70vh';
        overlay.style.background = 'rgba(0,0,0,0.92)';
        overlay.style.border = '3px solid #fff';
        overlay.style.display = 'none';
        overlay.style.zIndex = '200';
        overlay.style.color = '#fff';
        overlay.style.fontFamily = 'Space Mono, monospace';
        overlay.style.padding = '12px';
        overlay.style.boxShadow = '0 6px 30px rgba(0,0,0,0.8)';
        overlay.style.overflow = 'auto';
        overlay.innerHTML = `
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">
                <div style="font-size:1.1rem;color:#ffd700;font-weight:bold;">BESTIARY</div>
                <button id="bestiary-close" style="padding:6px 8px;border:2px solid #fff;background:transparent;color:#fff;cursor:pointer;font-size:0.8rem;">CLOSE</button>
            </div>
            <div id="bestiary-entries" style="display:grid;grid-template-columns:1fr;gap:8px;"></div>
            <div style="margin-top:10px;font-size:0.75rem;color:#ccc;opacity:0.9;">Tip: open this while playing to keep an eye on enemy notes.</div>
        `;
        document.body.appendChild(overlay);

        document.getElementById('bestiary-close').addEventListener('click', () => {
            overlay.style.display = 'none';
        });

        // Populate entries immediately so the overlay always has content ready
        const container = overlay.querySelector('#bestiary-entries');
        if (container) {
            container.innerHTML = '';
            if (Array.isArray(BESTIARY) && BESTIARY.length > 0) {
                BESTIARY.forEach(entry => {
                    const card = document.createElement('div');
                    card.style.border = '2px solid rgba(255,255,255,0.08)';
                    card.style.padding = '10px';
                    card.style.background = 'linear-gradient(180deg, rgba(255,255,255,0.02), rgba(255,255,255,0.01))';
                    card.innerHTML = `
                        <div style="font-weight:bold;color:#ffd700;margin-bottom:6px;">${entry.title}</div>
                        <div style="font-size:0.85rem;color:#ccc;margin-bottom:6px;">${entry.type}</div>
                        <div style="font-size:0.8rem;color:#fff;margin-bottom:6px;">
                            HP: <strong>${entry.hp}</strong><br>
                            Damage: <strong>${entry.damage}</strong>
                        </div>
                        <div style="font-size:0.78rem;color:#ddd;">${entry.notes}</div>
                    `;
                    container.appendChild(card);
                });
            } else {
                // Fallback message if BESTIARY is unexpectedly empty
                const note = document.createElement('div');
                note.style.color = '#ccc';
                note.style.fontSize = '0.9rem';
                note.textContent = 'No entries available.';
                container.appendChild(note);
            }
        }
    }

    // Bestiary Button Logic (Menu Only)
    const viewBestiaryBtn = document.getElementById('menu-bestiary-btn');
    if (viewBestiaryBtn) {
        viewBestiaryBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            ensureBestiaryOverlay();
            const overlay = document.getElementById('bestiary-overlay');
            if (overlay) overlay.style.display = 'block';
        });
    }

    // Weapon Forge Logic (Menu Only)
    const viewForgeBtn = document.getElementById('menu-forge-btn');
    if (viewForgeBtn) {
        viewForgeBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            showForgeOverlay();
        });
    }

    function showForgeOverlay() {
        if (document.getElementById('forge-overlay')) {
             document.getElementById('forge-overlay').style.display = 'block';
             return;
        }
        
        const overlay = document.createElement('div');
        overlay.id = 'forge-overlay';
        overlay.style.position = 'fixed';
        overlay.style.top = '16px';
        overlay.style.right = '16px'; // Same pos as bestiary, they overlap if both open (modal style)
        overlay.style.width = '420px';
        overlay.style.maxHeight = '70vh';
        overlay.style.background = 'rgba(0,0,0,0.95)';
        overlay.style.border = '3px solid #ffaa00';
        overlay.style.zIndex = '210';
        overlay.style.color = '#fff';
        overlay.style.padding = '12px';
        overlay.style.overflow = 'auto';
        
        overlay.innerHTML = `
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">
                <div style="font-size:1.1rem;color:#ffaa00;font-weight:bold;">WEAPON FORGE</div>
                <button id="forge-close" style="padding:6px 8px;border:2px solid #fff;background:transparent;color:#fff;cursor:pointer;">CLOSE</button>
            </div>
            <div style="font-size:0.8rem; line-height:1.4;">
                <h4 style="color:#00ffff; margin:8px 0;">WEAPONS</h4>
                <div id="forge-weapons"></div>
                <h4 style="color:#00ff88; margin:12px 0 8px 0;">RUNES</h4>
                <div id="forge-runes"></div>
            </div>
        `;
        document.body.appendChild(overlay);
        
        document.getElementById('forge-close').onclick = () => overlay.style.display = 'none';

        // Populate
        // Updated weapon list including character specials and new additions
        const wList = [
            {n:"Lightning Rod", d:"Auto-zaps nearby enemies"},
            {n:"Being Ghosted", d:"Spawns friendly ghost bombers"},
            {n:"Fireball", d:"Shoots explosive fireballs"},
            {n:"Spinning Blade", d:"Orbiting blade damages enemies"},
            {n:"Slutty Missiles", d:"Launches up, then aggressively seeks enemies"},
            {n:"Spike Ring", d:"Pulsing ring of spikes"},
            {n:"Poison Mist", d:"Poison damage aura"},
            {n:"Ice Aura", d:"Slows and chills enemies"},
            {n:"Mini Turret", d:"Orbiting turret bot"},
            {n:"Nova Blast", d:"Periodic explosion"},
            {n:"Bananerang", d:"Thrown banana returns"},
            {n:"Spooky Bois", d:"Summons friendly ghosts (Boberto)"},
            {n:"Knight Sword", d:"Manual slash (Melee)"},
            {n:"Giga Sword", d:"Massive slash (Sir Chad)"},
            {n:"Bone Throw", d:"Ricocheting bone (Calcium)"}
        ];
        
        const rList = [
            {n:"Lanky Hands", d:"Pickup Range"},
            {n:"Speed Rune", d:"Move Speed"},
            {n:"Health Rune", d:"+Max HP"},
            {n:"Haste Rune", d:"Attack Speed"},
            {n:"Power Rune", d:"Damage"},
            {n:"Armor Plate", d:"Damage Reduction"},
            {n:"Regen Bone", d:"HP Regen"},
            {n:"Lava Boots", d:"Lava Resistance"},
            {n:"Wisdom", d:"XP Gain"},
            {n:"Big Aura", d:"Area Size"},
            {n:"Bling Bling Chain", d:"Boosts Luck / Rarity Chance"}
        ];
        
        const wContainer = overlay.querySelector('#forge-weapons');
        wList.forEach(i => wContainer.innerHTML += `<div style="margin-bottom:4px; border-bottom:1px solid #333;"><strong style="color:#eee;">${i.n}</strong>: <span style="color:#aaa;">${i.d}</span></div>`);
        
        const rContainer = overlay.querySelector('#forge-runes');
        rList.forEach(i => rContainer.innerHTML += `<div style="margin-bottom:4px; border-bottom:1px solid #333;"><strong style="color:#eee;">${i.n}</strong>: <span style="color:#aaa;">${i.d}</span></div>`);
    }

    function showBestiaryOverlay() {
        ensureBestiaryOverlay();
        const overlay = document.getElementById('bestiary-overlay');
        const container = document.getElementById('bestiary-entries');
        if (!container) return;

        // If entries already populated by ensureBestiaryOverlay, skip re-populating heavy DOM work,
        // but always ensure it's up-to-date by clearing & rebuilding if needed.
        container.innerHTML = '';

        if (Array.isArray(BESTIARY) && BESTIARY.length > 0) {
            BESTIARY.forEach(entry => {
                const card = document.createElement('div');
                card.style.border = '2px solid rgba(255,255,255,0.08)';
                card.style.padding = '10px';
                card.style.background = 'linear-gradient(180deg, rgba(255,255,255,0.02), rgba(255,255,255,0.01))';
                card.innerHTML = `
                    <div style="font-weight:bold;color:#ffd700;margin-bottom:6px;">${entry.title}</div>
                    <div style="font-size:0.85rem;color:#ccc;margin-bottom:6px;">${entry.type}</div>
                    <div style="font-size:0.8rem;color:#fff;margin-bottom:6px;">
                        HP: <strong>${entry.hp}</strong><br>
                        Damage: <strong>${entry.damage}</strong>
                    </div>
                    <div style="font-size:0.78rem;color:#ddd;">${entry.notes}</div>
                `;
                container.appendChild(card);
            });
        } else {
            const note = document.createElement('div');
            note.style.color = '#ccc';
            note.style.fontSize = '0.9rem';
            note.textContent = 'No entries available.';
            container.appendChild(note);
        }

        overlay.style.display = 'block';
        // Scroll to top so the player sees the start of entries immediately
        overlay.scrollTop = 0;
    }

    updateCharacterLocks();
    // Initialize gamemode select state (including multiplayer lock)
    try { updateGamemodeSelectState(); } catch (e) {}

    window.__uberthump_unlockAll = function () {
        const allTrue = { MMOOVT: true, FOX: true, CALCIUM: true, GIGACHAD: true, BLITZ: true, MONKE: true, SIR_CHAD: true };
        saveUnlocks(allTrue);
        unlocks = loadUnlocks();
        updateCharacterLocks();
    };

    // Audio Helper
    const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const soundCache = {};
    
    async function loadSound(url) {
        if(soundCache[url]) return soundCache[url];
        try {
            const encodedUrl = encodeAssetPath(url);
            const res = await fetch(encodedUrl);
            if (!res.ok) {
                console.error(`Failed to load sound ${url}: ${res.status} ${res.statusText}`);
                return null;
            }
            const buff = await res.arrayBuffer();
            const audioBuffer = await audioCtx.decodeAudioData(buff);
            soundCache[url] = audioBuffer;
            return audioBuffer;
        } catch(e) {
            console.error(`Error loading sound ${url}:`, e);
            return null;
        }
    }

    // Preload themes
    setTimeout(() => {
        const themeUrls = [
            "./GIGACHAD'S THEME.mp3",
            "./BLITZ'S THEME.mp3",
            "./CALCIUM'S THEME.mp3",
            "./MONKE'S THEME.mp3",
            "./SIR CHADSIRWELLSIRCHADSIRCHADWELLWELL'S THEME.mp3"
        ];
        themeUrls.forEach(url => loadSound(url));
    }, 1000);

    // LORE BUTTON LOGIC (Unified)
    const loreBtn = document.getElementById('lore-btn');
    const loreOverlay = document.getElementById('lore-note-overlay');
    const secretNoteBtn = document.getElementById('secret-note-btn');
    const secretNoteOverlay = document.getElementById('secret-note-overlay');
    if (loreBtn && loreOverlay) {
        loreBtn.addEventListener('click', (e) => {
            e.stopPropagation();

            // If the game is running, use the game's lore flow which properly ducks gameplay BGM
            if (game && typeof game.showLoreNote === 'function' && game.isPlaying) {
                try {
                    game.showLoreNote();
                } catch (err) {
                    // fallback to showing overlay if game method fails
                    loreOverlay.style.display = 'flex';
                }
                return;
            }

            // Otherwise show the menu lore overlay and duck menu music
            loreOverlay.style.display = 'flex';

            // Duck and slow menu music if present (save previous state)
            try {
                if (menuAudio && menuAudio.gain && menuAudio.source) {
                    _savedMenuBgmState = {
                        gain: menuAudio.gain.gain.value,
                        rate: menuAudio.source.playbackRate ? menuAudio.source.playbackRate.value : 1
                    };
                    try { menuAudio.gain.gain.setTargetAtTime(_savedMenuBgmState.gain * 0.3, audioCtx.currentTime, 0.05); } catch(e){}
                    try { if (menuAudio.source.playbackRate) menuAudio.source.playbackRate.setValueAtTime((_savedMenuBgmState.rate || 1) * 0.5, audioCtx.currentTime); } catch(e){}
                }
            } catch(e){}
        });
        
        // Handle dismissal click on the overlay itself
        loreOverlay.addEventListener('click', (e) => {
            // If the game is running, prefer the game's hideLoreNote to restore gameplay audio & tutorial flow
            if (game && typeof game.hideLoreNote === 'function' && game.isPlaying) {
                try {
                    game.hideLoreNote();
                } catch (err) {
                    // fallback to manual behavior if game method fails
                    loreOverlay.style.display = 'none';
                }
                return;
            }

            // Dismiss overlay (menu path)
            loreOverlay.style.display = 'none';

            // Restore menu music state if we changed it
            try {
                if (_savedMenuBgmState && menuAudio && menuAudio.gain && menuAudio.source) {
                    try { menuAudio.gain.gain.setTargetAtTime(_savedMenuBgmState.gain, audioCtx.currentTime, 0.2); } catch(e){}
                    try { if (menuAudio.source.playbackRate) menuAudio.source.playbackRate.setValueAtTime(_savedMenuBgmState.rate || 1, audioCtx.currentTime + 0.05); } catch(e){}
                }
            } catch(e){}
            _savedMenuBgmState = null;

            if (game && game.isPlaying) {
                game.isPaused = false;
                // Trigger tutorial if first time reading lore
                if (!localStorage.getItem('uberthump_lore_read')) {
                    localStorage.setItem('uberthump_lore_read', 'true');
                    setTimeout(() => game.runTutorial(), 200);
                }
            } else if (!localStorage.getItem('uberthump_lore_read')) {
                // Just mark read in menu
                localStorage.setItem('uberthump_lore_read', 'true');
            }
        });
    }

    // Secret NOTE button logic (menu + in-game)
    if (secretNoteBtn && secretNoteOverlay) {
        // Show button if player has ever unlocked the secret note
        try {
            if (localStorage.getItem('uberthump_secret_note_unlocked') === 'true') {
                secretNoteBtn.style.display = 'inline-block';
            }
        } catch(e) {}

        secretNoteBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            // If the game is running, prefer the Game method so it can pause & duck BGM
            if (game && typeof game.showSecretNote === 'function' && game.isPlaying) {
                game.showSecretNote();
                return;
            }
            // Menu path: just show overlay
            secretNoteOverlay.style.display = 'flex';
        });

        // Clicking anywhere folds the note (menu path)
        secretNoteOverlay.addEventListener('click', () => {
            // If game has its own handler, let it manage close instead
            if (game && typeof game.hideSecretNote === 'function' && game.isPlaying) {
                game.hideSecretNote();
                return;
            }
            secretNoteOverlay.style.display = 'none';
        });
    }

    // Secret NOTE button logic (menu + in-game)
    if (secretNoteBtn && secretNoteOverlay) {
        // Show button if player has ever unlocked the secret note
        try {
            if (localStorage.getItem('uberthump_secret_note_unlocked') === 'true') {
                secretNoteBtn.style.display = 'inline-block';
            }
        } catch(e) {}

        secretNoteBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            // If the game is running, prefer the Game method so it can pause & duck BGM
            if (game && typeof game.showSecretNote === 'function' && game.isPlaying) {
                game.showSecretNote();
                return;
            }
            // Menu path: just show overlay
            secretNoteOverlay.style.display = 'flex';
        });

        // Clicking anywhere folds the note (menu path)
        secretNoteOverlay.addEventListener('click', () => {
            // If game has its own handler, let it manage close instead
            if (game && typeof game.hideSecretNote === 'function' && game.isPlaying) {
                game.hideSecretNote();
                return;
            }
            secretNoteOverlay.style.display = 'none';
        });
    }

    // Diary button logic (menu only - unlocked via rare cabin find)
    const diaryBtn = document.getElementById('diary-btn');
    const diaryOverlay = document.getElementById('diary-overlay');
    const diaryBook = document.getElementById('diary-book');
    const diaryPrevBtn = document.getElementById('diary-prev-btn');
    const diaryNextBtn = document.getElementById('diary-next-btn');
    const diaryPageIndicator = document.getElementById('diary-page-indicator');
    let currentDiaryPage = 1;
    const totalDiaryPages = 3;

    function updateDiaryPage() {
        // Hide all pages
        for (let i = 1; i <= totalDiaryPages; i++) {
            const page = document.getElementById(`diary-page-${i}`);
            if (page) page.style.display = 'none';
        }
        // Show current page
        const currentPage = document.getElementById(`diary-page-${currentDiaryPage}`);
        if (currentPage) currentPage.style.display = 'block';
        // Update indicator
        if (diaryPageIndicator) diaryPageIndicator.textContent = `Page ${currentDiaryPage} of ${totalDiaryPages}`;
        // Update button states
        if (diaryPrevBtn) {
            diaryPrevBtn.disabled = currentDiaryPage === 1;
            diaryPrevBtn.style.opacity = currentDiaryPage === 1 ? '0.5' : '1';
        }
        if (diaryNextBtn) {
            diaryNextBtn.disabled = currentDiaryPage === totalDiaryPages;
            diaryNextBtn.style.opacity = currentDiaryPage === totalDiaryPages ? '0.5' : '1';
        }
    }

    if (diaryBtn && diaryOverlay) {
        // Show button if player has found the diary
        try {
            if (localStorage.getItem('uberthump_diary_unlocked') === 'true') {
                diaryBtn.style.display = 'inline-block';
            }
        } catch(e) {}

        diaryBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            currentDiaryPage = 1;
            updateDiaryPage();
            diaryOverlay.style.display = 'flex';
        });

        // Clicking outside the book closes the diary
        diaryOverlay.addEventListener('click', (e) => {
            if (e.target === diaryOverlay) {
                diaryOverlay.style.display = 'none';
            }
        });

        // Prevent clicks inside the book from closing
        if (diaryBook) {
            diaryBook.addEventListener('click', (e) => {
                e.stopPropagation();
            });
        }

        // Page navigation
        if (diaryPrevBtn) {
            diaryPrevBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                if (currentDiaryPage > 1) {
                    currentDiaryPage--;
                    updateDiaryPage();
                }
            });
        }

        if (diaryNextBtn) {
            diaryNextBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                if (currentDiaryPage < totalDiaryPages) {
                    currentDiaryPage++;
                    updateDiaryPage();
                }
            });
        }
    }

    // Start menu music helper – called on load and when entering menu.
    function startMenuMusic() {
        if (audioCtx.state === 'suspended') audioCtx.resume();
        // Already playing?
        if (menuAudio && menuAudio.source) return;

        loadSound("./MY FRIENDS WONT STOP THUMPING AND NOW I AM THUMPING TOO (send help).mp3").then(buf => {
            if (!buf) return;
            // If something started in the meantime, don't double-play
            if (menuAudio && menuAudio.source) return;

            const src = audioCtx.createBufferSource();
            src.buffer = buf;
            src.loop = true;
            const gain = audioCtx.createGain();
            gain.gain.value = 0.4;
            src.connect(gain);
            gain.connect(audioCtx.destination);
            src.start(0);
            menuAudio = { source: src, gain: gain };
        });
    }

    function playThemeSnippet(key) {
        // Stop current if playing
        if (currentThemeNode) {
            try { currentThemeNode.stop(); } catch(e){}
            currentThemeNode = null;
        }
        
        // Duck menu music if present (use the AudioParam on the GainNode)
        if (menuAudio && menuAudio.gain && menuAudio.gain.gain) {
            menuAudio.gain.gain.setTargetAtTime(0.1, audioCtx.currentTime, 0.1);
        }

        let url = null;
        if (key === 'SIR_CHAD') url = "./SIR CHADSIRWELLSIRCHADSIRCHADWELLWELL'S THEME.mp3";
        else if (key === 'GIGACHAD') url = "./GIGACHAD'S THEME.mp3";
        else if (key === 'BLITZ') url = "./BLITZ'S THEME.mp3";
        else if (key === 'CALCIUM') url = "./CALCIUM'S THEME.mp3";
        else if (key === 'MONKE') url = "./MONKE'S THEME.mp3";
        
        if (!url) {
            // Restore menu volume properly via the GainNode's AudioParam
            if (menuAudio && menuAudio.gain && menuAudio.gain.gain) {
                menuAudio.gain.gain.setTargetAtTime(0.4, audioCtx.currentTime, 0.5);
            }
            return;
        }

        loadSound(url).then(buffer => {
            if (!buffer) return;
            const source = audioCtx.createBufferSource();
            source.buffer = buffer;
            const gain = audioCtx.createGain();
            gain.gain.value = 0.5;
            source.connect(gain);
            gain.connect(audioCtx.destination);
            source.start(0);
            currentThemeNode = source;
            
            // Play for 10 seconds then fade out
            gain.gain.setValueAtTime(0.5, audioCtx.currentTime + 10);
            gain.gain.linearRampToValueAtTime(0, audioCtx.currentTime + 12);
            source.stop(audioCtx.currentTime + 12);
            
            setTimeout(() => {
                 if (menuAudio && menuAudio.gain && menuAudio.gain.gain) {
                     menuAudio.gain.gain.setTargetAtTime(0.4, audioCtx.currentTime, 0.5);
                 }
            }, 12000);
        });
    }

    characterCards.forEach(card => {
        card.addEventListener('click', (e) => {
            e.stopPropagation();
            const key = card.getAttribute('data-char');
            if (!key) return;
            if (card.classList.contains('locked')) return;
            if (card.classList.contains('mp-locked')) return; // Cannot select if taken by opponent
            
            selectedCharacter = key;
            characterCards.forEach(c => c.classList.remove('selected'));
            card.classList.add('selected');
            updateCharacterDetails();
            
            // Toggle theme checkbox visibility
            if (themeToggleContainer) {
                if (key === 'MMOOVT' || key === 'FOX') {
                    themeToggleContainer.style.display = 'none';
                    useCharacterTheme = false; // Force off for generic chars
                    if(themeToggle) themeToggle.checked = false;
                } else {
                    themeToggleContainer.style.display = 'flex';
                }
            }
            
            // Update the menu preview
            if (menuScene) menuScene.setPreviewCharacter(selectedCharacter);
            
            // Play Theme snippet - DISABLED for selection
            // playThemeSnippet(key);
            
            // Broadcast selection if in MP lobby phase
            if (room && selectedMode === 'MULTI') {
                room.updatePresence({
                    mpChar: selectedCharacter,
                    mpReady: mpMeReady, // preserve ready state
                    matchId: mpMatchId
                });
            }
            
            if(game && game.playSynth) {
                game.playSynth('ui');
            }
        });
    });

    // Settings / Dev Panel Logic
    const settingsBtn = document.getElementById('settings-btn');
    // Ensure button is visible in menu
    if (settingsBtn) settingsBtn.style.display = 'block';

    const settingsPanel = document.getElementById('settings-panel');
    const settingsClose = document.getElementById('settings-close');
    const pixelSettingCheck = document.getElementById('pixel-setting-check');
    const debugLogCheck = document.getElementById('debug-log-check');
    const mapCodeInput = document.getElementById('map-code-input');
    const mapCodeBtn = document.getElementById('map-code-btn');

    // Sync initial state
    if (pixelSettingCheck) pixelSettingCheck.checked = pixelateEnabled;

    if (settingsBtn) {
        settingsBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            if (settingsPanel) settingsPanel.style.display = 'block';
            // If in game, pause (and release pointer lock implicitly via UI interaction)
            if (game && game.isPlaying) {
                game.isPaused = true;
                if (document.exitPointerLock) document.exitPointerLock();
            }
        });
    }

    if (settingsClose) {
        settingsClose.addEventListener('click', () => {
            if (settingsPanel) settingsPanel.style.display = 'none';
            if (game && game.isPlaying) {
                game.isPaused = false;
                // Try to re-lock
                if (game.renderer && game.renderer.domElement) {
                    game.renderer.domElement.requestPointerLock();
                }
            }
        });
    }

    // Pixel Toggle
    if (pixelSettingCheck) {
        pixelSettingCheck.addEventListener('change', () => {
            pixelateEnabled = pixelSettingCheck.checked;
            
            // Apply to Menu
            if (menuScene) {
                if (modeSelect && modeSelect.value === 'AWAKENING') menuScene.setPixelMode(true);
                else if (modeSelect && modeSelect.value === 'MULTI') menuScene.setPixelMode(true);
                else menuScene.setPixelMode(pixelateEnabled);
            }
            
            // Apply to Game
            if (game) {
                if (game.gameMode === 'AWAKENING' || game.gameMode === 'MULTI') game.setPixelMode(true);
                else game.setPixelMode(pixelateEnabled);
            }
        });
    }

    // Debug Log Toggle
    if (debugLogCheck) {
        debugLogCheck.addEventListener('change', () => {
            if (debugLogCheck.checked) {
                const sure = confirm("WARNING: Enabling verbose entity logging may flood your interface with technical data like 'Enemy Teleported'. This is intended for developers. Proceed?");
                if (!sure) {
                    debugLogCheck.checked = false;
                    return;
                }
                const really = confirm("FINAL WARNING: Unfiltered dev output. Are you sure?");
                if (!really) {
                    debugLogCheck.checked = false;
                    return;
                }
            }
            
            if (game) {
                game.debugMode = debugLogCheck.checked;
            }
        });
    }

    // Map Code
    if (mapCodeBtn) {
        mapCodeBtn.addEventListener('click', () => {
            if (mapCodeInput.value === 'supamonke123') {
                if (game) {
                    game.revealMap();
                    alert("DEV OVERRIDE: Fog of War Removed.");
                } else {
                    alert("Start game first.");
                }
                // Also enable guaranteed cabin spawn for next run
                try { localStorage.setItem('uberthump_force_cabin', 'true'); } catch(e) {}
            } else {
                alert("ACCESS DENIED.");
            }
            mapCodeInput.value = '';
        });
    }

    const devUnlockBtn = document.getElementById('dev-unlock');
    if (devUnlockBtn) {
        devUnlockBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            const code = prompt('Enter code:');
            if (code === 'supamonke123') {
                if (window.__uberthump_unlockAll) {
                    window.__uberthump_unlockAll();
                    alert('All characters unlocked!');
                }
                // Also enable guaranteed cabin spawn for next run
                try { localStorage.setItem('uberthump_force_cabin', 'true'); } catch(e) {}
            }
        });
    }

    // --- Main Menu 3D Background Logic ---
    class MenuBackground {
        constructor(canvas) {
            this.canvas = canvas;
            this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false });
            this.renderer.setSize(window.innerWidth, window.innerHeight);
            this.renderer.shadowMap.enabled = true;
            this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
            this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
            this.renderer.toneMappingExposure = pixelateEnabled ? 1.35 : 1.0;

            this.scene = new THREE.Scene();
            this.scene.background = new THREE.Color(0xc6f2ff);
            this.scene.fog = new THREE.FogExp2(0xc6f2ff, 0.003);

            this.camera = new THREE.PerspectiveCamera(50, window.innerWidth/window.innerHeight, 0.1, 300);
            
            // "Birdseye" view initially
            this.overviewPos = new THREE.Vector3(0, 45, 60);
            this.overviewLook = new THREE.Vector3(0, 0, 0);
            
            // "Selection" view (close up)
            this.selectPos = new THREE.Vector3(0, 4.5, 10);
            this.selectLook = new THREE.Vector3(0, 1.5, 0);

            this.camera.position.copy(this.overviewPos);
            this.camera.lookAt(this.overviewLook);

            this.targetCameraPos = this.overviewPos.clone();
            this.targetCameraLook = this.overviewLook.clone();
            this.cameraTransitionSpeed = 0;

            // Texture Loading - use preloaded textures if available, otherwise use color fallbacks
            // Grass = green, Side = brown, Rock = grey
            if (preloadedTextures) {
                this.grassTex = preloadedTextures.grassTex;
                this.sideTex = preloadedTextures.sideTex;
                this.rockTex = preloadedTextures.rockTex;
            } else {
                // Fallback to color textures if preloading hasn't happened yet
                console.warn('MenuBackground: Textures not preloaded, using color fallbacks');
                this.grassTex = createColorTexture('#228B22', 64, 64, 4, 4);
                this.sideTex = createColorTexture('#8B4513', 64, 64, 2, 1);
                this.rockTex = createColorTexture('#808080', 64, 64, 6, 6);
            }

            // Pixelation Setup
            this.pixelRatio = 0.3;
            this.renderTarget = new THREE.WebGLRenderTarget(
                Math.floor(window.innerWidth * this.pixelRatio),
                Math.floor(window.innerHeight * this.pixelRatio)
            );
            this.renderTarget.texture.minFilter = THREE.NearestFilter;
            this.renderTarget.texture.magFilter = THREE.NearestFilter;
            this.fsScene = new THREE.Scene();
            this.fsCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
            this.fsQuad = new THREE.Mesh(
                new THREE.PlaneGeometry(2, 2),
                new THREE.ShaderMaterial({
                    uniforms: { tDiffuse: { value: this.renderTarget.texture } },
                    vertexShader: `
                        varying vec2 vUv;
                        void main() { vUv = uv; gl_Position = vec4(position, 1.0); }
                    `,
                    fragmentShader: `
                        varying vec2 vUv;
                        uniform sampler2D tDiffuse;
                        vec3 quantizePalette(vec3 c) {
                            c = floor(c * 5.0) / 5.0;
                            vec3 boosted = vec3(c.r > 0.5 ? 1.0 : c.r, c.g > 0.5 ? 1.0 : c.g, c.b > 0.5 ? 1.0 : c.b);
                            return mix(c, boosted, 0.35);
                        }
                        void main() {
                            vec4 col = texture2D(tDiffuse, vUv);
                            vec3 quant = quantizePalette(col.rgb);
                            quant *= 1.18;
                            gl_FragColor = vec4(quant, col.a);
                        }
                    `
                })
            );
            this.fsScene.add(this.fsQuad);
            this.pixelMode = pixelateEnabled;

            this.setupWorld();
            this.characterGroup = new THREE.Group();
            this.scene.add(this.characterGroup);
            
            this.setPreviewCharacter(selectedCharacter);

            // Re-create the fancy portal for menu locally
            this.portalGroup = this.createMenuPortal();
            this.portalGroup.position.set(0, 1.5, -4); 
            this.portalGroup.visible = false;
            this.scene.add(this.portalGroup);

            this.isPortalAnim = false;
            this.portalTimer = 0;

            window.addEventListener('resize', () => this.onResize());
            this.animate();
        }

        createMenuPortal() {
            const group = new THREE.Group();
            // Void Sphere
            const voidGeo = new THREE.SphereGeometry(1.8, 32, 32);
            const voidMat = new THREE.MeshBasicMaterial({ color: 0x000000 });
            group.add(new THREE.Mesh(voidGeo, voidMat));
            
            // Rim
            const rim = new THREE.Mesh(
                new THREE.TorusGeometry(1.8, 0.1, 16, 64),
                new THREE.MeshBasicMaterial({ color: 0x00ffff, toneMapped: false })
            );
            group.add(rim);
            
            // Spinner
            const spinner = new THREE.Group();
            const blade = new THREE.Mesh(
                new THREE.TorusGeometry(2.2, 0.08, 8, 32, Math.PI),
                new THREE.MeshBasicMaterial({ color: 0x0088ff, transparent: true, opacity: 0.8, toneMapped: false })
            );
            spinner.add(blade);
            const blade2 = blade.clone(); blade2.rotation.z = Math.PI;
            spinner.add(blade2);
            spinner.userData = { isSpinner: true };
            group.add(spinner);
            
            // Particles
            const pGroup = new THREE.Group();
            const pMat = new THREE.MeshBasicMaterial({ color: 0xaaddff, toneMapped: false });
            const pGeo = new THREE.BoxGeometry(0.1, 0.1, 0.1);
            for(let i=0; i<20; i++) {
                const p = new THREE.Mesh(pGeo, pMat);
                const r = 2.0 + Math.random();
                p.position.setFromSphericalCoords(r, Math.random()*Math.PI, Math.random()*Math.PI*2);
                pGroup.add(p);
            }
            pGroup.userData = { isP: true };
            group.add(pGroup);
            
            return group;
        }

        setupWorld() {
            // Lighting
            const ambient = new THREE.AmbientLight(0xffffff, 1.1);
            this.scene.add(ambient);
            const dir = new THREE.DirectionalLight(0xfff4e6, 1.8);
            dir.position.set(20, 30, 15);
            dir.castShadow = true;
            dir.shadow.mapSize.width = 1024;
            dir.shadow.mapSize.height = 1024;
            this.scene.add(dir);

            // Lava Sea
            const lava = new THREE.Mesh(
                new THREE.PlaneGeometry(300, 300),
                new THREE.MeshStandardMaterial({ color: 0xff7a2a, emissive: 0xff9b3a, emissiveIntensity: 0.5, roughness: 0.5 })
            );
            lava.rotation.x = -Math.PI/2;
            lava.position.y = -2;
            this.scene.add(lava);

            // Main Island (Flat top)
            // Use loaded textures
            const grassMat = new THREE.MeshStandardMaterial({ map: this.grassTex, roughness: 0.9 });
            const dirtMat = new THREE.MeshStandardMaterial({ map: this.sideTex, roughness: 0.9 });
            
            const islandGroup = new THREE.Group();
            const top = new THREE.Mesh(new THREE.BoxGeometry(20, 1, 20), grassMat);
            top.position.y = 0;
            top.receiveShadow = true;
            islandGroup.add(top);
            
            const side = new THREE.Mesh(new THREE.BoxGeometry(20, 6, 19.9), dirtMat);
            side.position.y = -3.5;
            islandGroup.add(side);
            const side2 = new THREE.Mesh(new THREE.BoxGeometry(19.9, 6, 20), dirtMat);
            side2.position.y = -3.5;
            islandGroup.add(side2);

            this.scene.add(islandGroup);

            // Distant islands
            for (let i = 0; i < 6; i++) {
                const grp = islandGroup.clone();
                const angle = i * (Math.PI / 3);
                const dist = 40 + Math.random() * 20;
                grp.position.set(Math.cos(angle)*dist, Math.random() * 5 - 2, Math.sin(angle)*dist);
                grp.scale.setScalar(0.5 + Math.random());
                this.scene.add(grp);
            }
        }

        setPreviewCharacter(key) {
            while(this.characterGroup.children.length) {
                this.characterGroup.remove(this.characterGroup.children[0]);
            }
            
            let group = new THREE.Group();
            
            // Helper to make materials transparent for fade effect
            const makeTransparent = (mat) => {
                mat.transparent = true;
                mat.opacity = 1.0;
                return mat;
            };

            // Reconstruct high-fidelity models for main menu
            // Lift characters up so they aren't in the floor
            const yOffset = 0.5;

            if (key === 'CALCIUM') {
                // Calcium – skeleton skater
                const boneMat = makeTransparent(new THREE.MeshStandardMaterial({ color: 0xdddddd }));
                const skullMat = makeTransparent(new THREE.MeshStandardMaterial({ color: 0xf5f5f5 }));

                const spine = new THREE.Mesh(new THREE.BoxGeometry(0.25, 1.0, 0.25), boneMat);
                spine.position.y = 1.1 + yOffset;
                group.add(spine);

                for (let i = 0; i < 3; i++) {
                    const rib = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.12, 0.25), boneMat);
                    rib.position.y = 0.85 + i * 0.22 + yOffset;
                    group.add(rib);
                }

                const pelvis = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.25, 0.4), boneMat);
                pelvis.position.y = 0.6 + yOffset;
                group.add(pelvis);

                const head = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.7, 0.7), skullMat);
                head.position.y = 1.8 + yOffset;
                group.add(head);

                const armL = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.9, 0.18), boneMat);
                armL.position.set(-0.6, 1.1 + yOffset, 0.05);
                group.add(armL);
                const armR = armL.clone();
                armR.position.x = 0.6;
                group.add(armR);

                const legL = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.9, 0.22), boneMat);
                legL.position.set(-0.4, 0.55 + yOffset, 0.05);
                group.add(legL);
                const legR = legL.clone();
                legR.position.x = 0.4;
                group.add(legR);

                const board = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.1, 0.4), makeTransparent(new THREE.MeshStandardMaterial({ color: 0x222222 })));
                board.position.y = 0.1 + yOffset;
                board.rotation.z = 0.03;
                group.add(board);

                // Stand sideways
                group.rotation.y = Math.PI / 2;

            } else if (key === 'GIGACHAD') {
                // GigaChad - FIX: Lift higher so not in floor
                const chadYOffset = 1.3; // Specific fix for menu
                const skinMat = makeTransparent(new THREE.MeshStandardMaterial({ color: 0xffd1a4 }));
                
                const upperChest = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.9, 0.7), skinMat);
                upperChest.position.y = 1.3 + chadYOffset;
                group.add(upperChest);

                const lowerTorso = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.7, 0.6), skinMat);
                lowerTorso.position.y = 0.7 + chadYOffset;
                group.add(lowerTorso);

                const head = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.6, 0.6), skinMat);
                head.position.y = 2.1 + chadYOffset;
                group.add(head);

                const armL = new THREE.Mesh(new THREE.BoxGeometry(0.35, 1.1, 0.35), skinMat);
                armL.position.set(-1.1, 1.1 + chadYOffset, 0);
                group.add(armL);
                const armR = armL.clone();
                armR.position.x = 1.1;
                group.add(armR);

                const pantsMat = makeTransparent(new THREE.MeshStandardMaterial({ color: 0x1f2933 }));
                const legL = new THREE.Mesh(new THREE.BoxGeometry(0.45, 1.2, 0.45), pantsMat);
                legL.position.set(-0.35, 0.4 + chadYOffset, 0); 
                group.add(legL);
                const legR = legL.clone();
                legR.position.x = 0.35;
                group.add(legR);

            } else if (key === 'FOX') {
                const body = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.6, 1.5), makeTransparent(new THREE.MeshStandardMaterial({ color: 0xff7f3f })));
                body.position.y = 0.6 + yOffset;
                group.add(body);
                const head = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.6, 0.7), makeTransparent(new THREE.MeshStandardMaterial({ color: 0xff9b5e })));
                head.position.set(0, 1.1 + yOffset, 0.6);
                group.add(head);
                const tail = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.25, 0.9), makeTransparent(new THREE.MeshStandardMaterial({ color: 0xff7f3f })));
                tail.position.set(0, 0.8 + yOffset, -0.9);
                tail.rotation.x = 0.4;
                group.add(tail);

                const legGeo = new THREE.BoxGeometry(0.2, 0.6, 0.2);
                const legMat = makeTransparent(new THREE.MeshStandardMaterial({ color: 0x52220f }));
                const legL = new THREE.Mesh(legGeo, legMat);
                legL.position.set(-0.3, 0.3 + yOffset, 0.5);
                group.add(legL);
                const legR = legL.clone();
                legR.position.x = 0.3;
                group.add(legR);
                const legBL = new THREE.Mesh(legGeo, legMat);
                legBL.position.set(-0.3, 0.3 + yOffset, -0.3);
                group.add(legBL);
                const legBR = new THREE.Mesh(legGeo, legMat);
                legBR.position.set(0.3, 0.3 + yOffset, -0.3);
                group.add(legBR);

            } else if (key === 'BLITZ') {
                // Redesigned Blitz - Sleek combat bot
                const metalMat = makeTransparent(new THREE.MeshStandardMaterial({ color: 0x223344 }));
                const glowMat = makeTransparent(new THREE.MeshStandardMaterial({ color: 0x00ffff, emissive: 0x00ffff, emissiveIntensity: 1.5 }));
                
                // Hover unit body (conical)
                const body = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.2, 1.2, 8), metalMat);
                body.position.y = 1.0 + yOffset;
                group.add(body);
                
                // Core reactor
                const core = new THREE.Mesh(new THREE.SphereGeometry(0.25), glowMat);
                core.position.set(0, 1.1 + yOffset, 0.3);
                group.add(core);

                // Head
                const head = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.4, 0.5), metalMat);
                head.position.y = 1.7 + yOffset;
                group.add(head);
                const visor = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.1, 0.1), glowMat);
                visor.position.set(0, 1.7 + yOffset, 0.25);
                group.add(visor);

                // Floating shoulders/arms
                const shoulderL = new THREE.Mesh(new THREE.SphereGeometry(0.25), metalMat);
                shoulderL.position.set(-0.7, 1.4 + yOffset, 0);
                group.add(shoulderL);
                const shoulderR = shoulderL.clone();
                shoulderR.position.x = 0.7;
                group.add(shoulderR);

                const handL = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.5, 0.2), metalMat);
                handL.position.set(-0.7, 0.9 + yOffset, 0.2);
                group.add(handL);
                const handR = handL.clone();
                handR.position.x = 0.7;
                group.add(handR);

            } else if (key === 'MONKE') {
                // Gameplay Monke (Boxy) - As requested
                const furMat = makeTransparent(new THREE.MeshStandardMaterial({ color: 0x5C4033, flatShading: true }));
                const skinMat = makeTransparent(new THREE.MeshStandardMaterial({ color: 0xC4A484, flatShading: true }));
                const glassMat = makeTransparent(new THREE.MeshStandardMaterial({ color: 0x111111, flatShading: true }));

                // Body
                const body = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.8, 0.6), furMat);
                body.position.y = 0.7 + yOffset;
                group.add(body);

                // Head
                const head = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.6, 0.6), furMat);
                head.position.y = 1.45 + yOffset;
                group.add(head);

                // Muzzle
                const muzzle = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.3, 0.2), skinMat);
                muzzle.position.set(0, 1.35 + yOffset, 0.35);
                group.add(muzzle);

                // Ears
                const earL = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.3, 0.1), furMat);
                earL.position.set(-0.4, 1.5 + yOffset, 0);
                group.add(earL);
                const earR = earL.clone();
                earR.position.x = 0.4;
                group.add(earR);

                // Sunglasses (Boxy)
                const glasses = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.15, 0.1), glassMat);
                glasses.position.set(0, 1.55 + yOffset, 0.32);
                group.add(glasses);

                // Long Arms
                const armL = new THREE.Mesh(new THREE.BoxGeometry(0.25, 1.1, 0.25), furMat);
                armL.position.set(-0.65, 1.0 + yOffset, 0);
                group.add(armL);
                const armR = armL.clone();
                armR.position.x = 0.65;
                group.add(armR);

                // Short Legs
                const legL = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.6, 0.3), furMat);
                legL.position.set(-0.25, 0.3 + yOffset, 0);
                group.add(legL);
                const legR = legL.clone();
                legR.position.x = 0.25;
                group.add(legR);
                
                // Tail
                const tail = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.8, 0.15), furMat);
                tail.position.set(0, 0.6 + yOffset, -0.4);
                tail.rotation.x = 1.0;
                group.add(tail);

            } else if (key === 'SIR_CHAD') {
                // Sir Chad - Black Knight, Tall, Red Eyes
                const armorMat = makeTransparent(new THREE.MeshStandardMaterial({ color: 0x111111, metalness: 0.6, roughness: 0.4 }));
                const detailMat = makeTransparent(new THREE.MeshStandardMaterial({ color: 0x330000 }));
                
                // Torso
                const torso = new THREE.Mesh(new THREE.BoxGeometry(1.1, 1.4, 0.7), armorMat);
                torso.position.y = 1.2 + yOffset;
                group.add(torso);
                
                // Head
                const head = new THREE.Mesh(new THREE.BoxGeometry(0.75, 0.8, 0.75), armorMat);
                head.position.y = 2.1 + yOffset;
                group.add(head);
                
                // Eye slits (Red)
                const eyeL = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.08, 0.1), new THREE.MeshBasicMaterial({ color: 0xff0000 }));
                eyeL.position.set(-0.2, 2.15 + yOffset, 0.38);
                group.add(eyeL);
                const eyeR = eyeL.clone();
                eyeR.position.x = 0.2;
                group.add(eyeR);
                
                // Arms
                const armL = new THREE.Mesh(new THREE.BoxGeometry(0.35, 1.1, 0.35), armorMat);
                armL.position.set(-0.8, 1.2 + yOffset, 0);
                group.add(armL);
                const armR = armL.clone();
                armR.position.x = 0.8;
                group.add(armR);
                
                // Legs
                const legL = new THREE.Mesh(new THREE.BoxGeometry(0.4, 1.1, 0.4), armorMat);
                legL.position.set(-0.3, 0.55 + yOffset, 0);
                group.add(legL);
                const legR = legL.clone();
                legR.position.x = 0.3;
                group.add(legR);
                
                // Big Sword
                const sword = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.1, 2.2), makeTransparent(new THREE.MeshStandardMaterial({ color: 0x444444, metalness: 0.8 })));
                sword.position.set(1.1, 0.7 + yOffset, 0.8);
                sword.rotation.x = -0.3;
                group.add(sword);

            } else if (key === 'BOBERTO') {
                // Boberto: Sheet ghost
                const sheetMat = makeTransparent(new THREE.MeshStandardMaterial({ color: 0xffffff, side: THREE.DoubleSide }));
                const darkMat = makeTransparent(new THREE.MeshStandardMaterial({ color: 0x111111 }));
                
                // Head shape
                const head = new THREE.Mesh(new THREE.SphereGeometry(0.5, 16, 16, 0, Math.PI * 2, 0, Math.PI * 0.6), sheetMat);
                head.position.y = 1.6 + yOffset;
                group.add(head);
                
                // Body sheet (cylinder)
                const body = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.6, 1.2, 16, 1, true), sheetMat);
                body.position.y = 0.9 + yOffset;
                group.add(body);
                
                // Legs (Jeans)
                const legL = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.6, 0.25), makeTransparent(new THREE.MeshStandardMaterial({ color: 0x223355 })));
                legL.position.set(-0.2, 0.3 + yOffset, 0);
                group.add(legL);
                const legR = legL.clone();
                legR.position.x = 0.2;
                group.add(legR);
                
                // Sunglasses
                const glasses = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.15, 0.1), darkMat);
                glasses.position.set(0, 1.65 + yOffset, 0.45);
                group.add(glasses);

            } else { // MMOOVT
                const torso = new THREE.Mesh(new THREE.BoxGeometry(0.85, 1.25, 0.55), makeTransparent(new THREE.MeshStandardMaterial({ color: 0x3d3d3d })));
                torso.position.y = 0.9 + yOffset;
                group.add(torso);
                const head = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.6, 0.6), makeTransparent(new THREE.MeshStandardMaterial({ color: 0x707070 })));
                head.position.y = 1.6 + yOffset;
                group.add(head);
                const armL = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.9, 0.3), makeTransparent(new THREE.MeshStandardMaterial({ color: 0x444444 })));
                armL.position.set(-0.6, 0.75 + yOffset, 0);
                group.add(armL);
                const armR = armL.clone();
                armR.position.x = 0.6;
                group.add(armR);
                const legL = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.85, 0.35), makeTransparent(new THREE.MeshStandardMaterial({ color: 0x2b2b2b })));
                legL.position.set(-0.25, 0.4 + yOffset, 0);
                group.add(legL);
                const legR = legL.clone();
                legR.position.x = 0.25;
                group.add(legR);
                
                // Sword for menu
                const blade = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.1, 1.8), makeTransparent(new THREE.MeshStandardMaterial({ color: 0xd1d5db })));
                blade.position.set(0.9, 0.5 + yOffset, 0.6);
                blade.rotation.x = -0.2;
                group.add(blade);
            }
            
            // Normalize scale and position
            group.scale.setScalar(0.9);
            // Center on floor
            group.position.y = 0;

            // Shadows
            group.traverse(o => { if(o.isMesh){ o.castShadow = true; o.receiveShadow = true; }});
            
            this.characterGroup.add(group);
        }

        transitionToSelect() {
            this.cameraTransitionSpeed = 0.02; // slow smooth zoom
            this.targetCameraPos.copy(this.selectPos);
            this.targetCameraLook.copy(this.selectLook);
        }

        playPortalAnim(callback) {
            this.isPortalAnim = true;
            this.portalCallback = callback;
            this.portalTimer = 0;
            this.animState = 0; // 0: Idle, 1: Rumble, 2: Ghosts, 3: Jump, 4: Portal, 5: Exit
            
            // Create "Exclamation" sprite if not exists
            if (!this.exclamation) {
                const canvas = document.createElement('canvas');
                canvas.width = 64; canvas.height = 64;
                const ctx = canvas.getContext('2d');
                ctx.font = 'bold 50px sans-serif';
                ctx.fillStyle = '#ff0000';
                ctx.textAlign = 'center';
                ctx.fillText('!', 32, 50);
                const tex = new THREE.CanvasTexture(canvas);
                const mat = new THREE.SpriteMaterial({ map: tex });
                this.exclamation = new THREE.Sprite(mat);
                this.exclamation.scale.set(1, 1, 1);
                this.exclamation.visible = false;
                this.scene.add(this.exclamation);
            }
            
            // Ghost pool for menu anim
            this.menuGhosts = [];
        }

        setPixelMode(enabled) {
            this.pixelMode = enabled;
            this.renderer.toneMappingExposure = enabled ? 1.35 : 1.0;
        }

        onResize() {
            const w = window.innerWidth, h = window.innerHeight;
            this.renderer.setSize(w, h);
            this.camera.aspect = w/h;
            this.camera.updateProjectionMatrix();
            this.renderTarget.setSize(Math.floor(w * this.pixelRatio), Math.floor(h * this.pixelRatio));
        }

        animate() {
            requestAnimationFrame(() => this.animate());
            
            // Camera transition
            const bob = Math.sin(Date.now() * 0.0005) * 0.5; // Slight camera bob
            const bobVec = new THREE.Vector3(0, bob, 0);
            
            const targetPos = this.targetCameraPos.clone().add(bobVec);
            this.camera.position.lerp(targetPos, 0.04);
            
            // Interpolate lookAt target
            const currentLook = new THREE.Vector3();
            this.camera.getWorldDirection(currentLook);
            const targetDir = new THREE.Vector3().subVectors(this.targetCameraLook, this.camera.position).normalize();
            currentLook.lerp(targetDir, 0.04);
            const newTarget = new THREE.Vector3().addVectors(this.camera.position, currentLook);
            this.camera.lookAt(newTarget);

            if (this.portalGroup && this.portalGroup.visible) {
                this.portalGroup.children.forEach(c => {
                    if (c.userData.isSpinner) c.rotation.z += 0.1;
                    if (c.userData.isP) c.rotation.y -= 0.02;
                });
            }

            if (this.isPortalAnim) {
                this.portalTimer += 0.016;
                const t = this.portalTimer;
                
                // Camera shake helper
                const shake = (amount) => {
                    const rx = (Math.random() - 0.5) * amount;
                    const ry = (Math.random() - 0.5) * amount;
                    this.camera.position.x += rx;
                    this.camera.position.y += ry;
                };

                // Sequence:
                // 0.0 - 1.0: Rumble start, Sky turns red
                // 1.0 - 2.5: Ghosts rise/rush
                // 2.5 - 3.0: Jump ! 
                // 3.0: Portal open behind
                // 3.5 - 4.5: Run into portal
                
                if (t < 1.0) {
                    // Rumble build up
                    shake(t * 0.1);
                    // Sky Red shift
                    const redVal = Math.min(1, t);
                    const col = new THREE.Color(0xc6f2ff).lerp(new THREE.Color(0x550000), redVal);
                    this.scene.background = col;
                    this.scene.fog.color = col;
                } else if (t < 2.5) {
                    // Heavy rumble
                    shake(0.15);
                    
                    // Spawn ghosts once
                    if (this.animState < 2) {
                        this.animState = 2;
                        // Spawn menu ghosts clearly behind the character, visible from a distance
                        const ghostGeo = new THREE.CapsuleGeometry(0.4, 1.2, 4, 8);
                        const ghostMat = new THREE.MeshBasicMaterial({ color: 0x00ffcc, transparent: true, opacity: 0.6 });
                        for(let i=0; i<7; i++) {
                            const g = new THREE.Mesh(ghostGeo, ghostMat);
                            // Character at 0,0. Camera at 0,4.5,10. Put ghosts in a wide arc further away so they are noticeable from distance.
                            const angle = -Math.PI / 2 + (i / 6) * Math.PI; // arc from left-back to right-back
                            // Increase spawn radius and push ghosts further behind the character so none appear right next to them
                            const dist = 140; // spawn much farther away so ghosts are seeable from a DISTANCE
                            
                            // place ghosts on a wide arc far behind the character so they approach slowly and remain visible
                            const gx = Math.cos(angle) * dist;
                            const gz = -40 + Math.sin(angle) * 20; // push further back and widen spread
                            
                            g.position.set(gx, -6, gz); // start well below ground to rise during animation
                            this.scene.add(g);
                            this.menuGhosts.push({ mesh: g });
                        }
                    }
                    
                    // Move ghosts
                    this.menuGhosts.forEach(g => {
                        // Rise slowly and continuously (do NOT pause during the jump/run stages)
                        if (g.mesh.position.y < 2.0) g.mesh.position.y += 0.06;
                        // Slowly approach the center so they remain visible while the character jumps/enters portal
                        const target = new THREE.Vector3(0, 1, 0);
                        const dir = new THREE.Vector3().subVectors(target, g.mesh.position).normalize();
                        // intentionally very slow approach to keep them in the scene during the whole sequence
                        g.mesh.position.addScaledVector(dir, 0.06);
                        
                        // Gentle wobble for liveliness
                        g.mesh.rotation.z = Math.sin(Date.now() * 0.01 + g.mesh.id) * 0.18;
                    });
                    
                } else if (t < 3.2) {
                    // Jump !
                    if (this.animState < 3) {
                        this.animState = 3;
                        // Hop
                        this.characterGroup.position.y = 1.5; 
                        this.exclamation.visible = true;
                        this.exclamation.position.copy(this.characterGroup.position);
                        this.exclamation.position.y += 2.5;
                    }
                    // Land (do not drop fully to 0 so the character doesn't go into the floor)
                    if (t > 2.7) this.characterGroup.position.y = THREE.MathUtils.lerp(1.5, 0.3, (t-2.7)/0.3);
                    
                    // Exclamation follow
                    this.exclamation.position.copy(this.characterGroup.position);
                    this.exclamation.position.y += 2.5;
                    
                } else if (t < 4.5) {
                    // Portal Open & Run
                    this.exclamation.visible = false;
                    
                    if (this.animState < 4) {
                        this.animState = 4;
                        // Show Portal BEHIND character (Z positive in this view? No, character faces +Z (camera is at +Z).
                        // Wait, camera is at (0, 4.5, 10). Character at (0,0,0).
                        // Character faces forward (towards +Z / camera) usually in menu.
                        // "Portal opens behind then" -> Behind the character relative to camera?
                        // Let's spawn portal at (0, 1.5, -4) (Behind character).
                        this.portalGroup.position.set(0, 1.5, -4);
                        this.portalGroup.visible = true;
                    }
                    
                    // Character turns around to face portal (at -Z)
                    // Currently facing approx +Z or rotated.
                    // Lerp rotation to Math.PI (facing -Z)
                    this.characterGroup.rotation.y = THREE.MathUtils.lerp(0, Math.PI, (t - 3.2) * 2);
                    
                    if (t > 3.6) {
                        // Run into portal
                        const runT = (t - 3.6) / 0.9;
                        this.characterGroup.position.z = THREE.MathUtils.lerp(0, -4, runT);
                        // Fade
                        const opacity = Math.max(0, 1.0 - runT * 2);
                        this.characterGroup.traverse(o => {
                            if (o.isMesh && o.material) o.material.opacity = opacity;
                        });
                    }
                } else {
                    this.isPortalAnim = false;
                    // Cleanup ghosts
                    this.menuGhosts.forEach(g => this.scene.remove(g.mesh));
                    this.menuGhosts = [];
                    if (this.portalCallback) this.portalCallback();
                }
            } else {
                // Idle rotate
                this.characterGroup.rotation.y = Math.sin(Date.now() * 0.001) * 0.2;
            }

            try {
                if (this.pixelMode) {
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
                console.error('Render error (menu background) — skipping frame render:', renderErr);
                // Fallback: clear render target to avoid stale buffer
                try { this.renderer.setRenderTarget(null); this.renderer.clear(); } catch(e){}
            }
        }
    }

    // Preload textures before creating menu background
    (async () => {
        if (!preloadedTextures) {
            try {
                preloadedTextures = await preloadGameTextures();
                console.log('Textures preloaded for menu');
            } catch (e) {
                console.error('Failed to preload textures for menu:', e);
            }
        }

        if (menuCanvas) {
            menuScene = new MenuBackground(menuCanvas);
        }
    })();

    // --- Pause overlay wiring & global pause toggle (Escape) ---
    const pauseOverlay = document.getElementById('pause-overlay');
    const pauseResumeBtn = document.getElementById('pause-resume-btn');
    const pauseQuitBtn = document.getElementById('pause-quit-btn');
    function showPause() {
        if (!pauseOverlay) return;
        pauseOverlay.style.display = 'flex';
        // Ensure the game's paused flag is set
        if (game) {
            game.isPaused = true;
            if (game.updatePauseStats) game.updatePauseStats();
        }
        // Release pointer lock so the user can interact with menu
        try { if (document.exitPointerLock) document.exitPointerLock(); } catch(e){}
    }
    function hidePause() {
        if (!pauseOverlay) return;
        pauseOverlay.style.display = 'none';
        if (game) game.isPaused = false;
        // Re-acquire pointer lock for gameplay if possible
        try {
            if (game && game.renderer && game.renderer.domElement && document.pointerLockElement !== game.renderer.domElement) {
                const p = game.renderer.domElement.requestPointerLock();
                if (p instanceof Promise) p.catch(()=>{});
            }
        } catch(e){}
    }
    function togglePause() {
        if (!game) return;
        if (game.isPaused) hidePause();
        else showPause();
    }

    if (pauseResumeBtn) {
        pauseResumeBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            hidePause();
        });
    }
    if (pauseQuitBtn) {
        pauseQuitBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            // Quick quit to menu (reload to keep game reset simple)
            window.location.reload();
        });
    }

    // Ensure pause works by attaching to document and checking visibility
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' || e.key === 'Esc') {
            // Only toggle if game is running and not in start screen
            if (game && !game.inIntro && startScreen.style.display === 'none') {
                // In Multiplayer VS mode, pausing is disabled
                if (game.gameMode === 'MULTI' && game.allowPause === false) return;
                togglePause();
                e.preventDefault();
            }
        }
    });

    // --- Device Recommendation Logic ---
    function checkDeviceSpecs() {
        const overlay = document.getElementById('device-check-overlay');
        if (!overlay) return;
        
        overlay.style.display = 'flex';
        
        const cpuEl = document.getElementById('dc-cpu');
        const ramEl = document.getElementById('dc-ram');
        const gpuEl = document.getElementById('dc-gpu');
        const osEl = document.getElementById('dc-os');
        const badgeEl = document.getElementById('dc-verdict-badge');
        const descEl = document.getElementById('dc-verdict-desc');
        const contBtn = document.getElementById('dc-continue-btn');

        // Get Specs
        const ua = navigator.userAgent;
        const cores = navigator.hardwareConcurrency || 'Unknown';
        const ram = navigator.deviceMemory ? `>= ${navigator.deviceMemory} GB` : 'Unknown';
        
        let renderer = 'Unknown GPU';
        try {
            const canvas = document.createElement('canvas');
            const gl = canvas.getContext('webgl');
            const dbg = gl.getExtension('WEBGL_debug_renderer_info');
            if (dbg) renderer = gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL);
        } catch(e) {}

        // Populate Raw Data
        cpuEl.textContent = cores;
        ramEl.textContent = ram;
        gpuEl.textContent = renderer;
        
        // Simple OS detection
        let os = "Desktop";
        if (/Android/i.test(ua)) os = "Android";
        else if (/iPhone|iPad|iPod/i.test(ua)) os = "iOS";
        else if (/CrOS/i.test(ua)) os = "Chrome OS";
        else if (/Linux/i.test(ua)) os = "Linux / Steam Deck";
        else if (/Windows/i.test(ua)) os = "Windows";
        else if (/Mac/i.test(ua)) os = "MacOS";
        osEl.textContent = os;

        // Rating Logic
        let tier = 'MODERATE';
        let color = '#ffffff';
        let message = "";

        const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(ua);
        const gpuLower = renderer.toLowerCase();
        const ramVal = navigator.deviceMemory || 8; // Default to 8 if unknown (desktop usually)
        const coresVal = navigator.hardwareConcurrency || 4;

        if (isMobile) {
            tier = 'UNSUPPORTED';
            color = '#ff4444';
            message = "This device (Mobile) is not fully supported. You may experience crashes, lag, or control issues. A physical keyboard is recommended.";
        } else {
            const isIntel = gpuLower.includes('intel');
            const isUHD = gpuLower.includes('uhd') || gpuLower.includes('hd graphics');
            const isDedicated = gpuLower.includes('nvidia') || (gpuLower.includes('radeon') && !gpuLower.includes('graphics'));
            const isHighEnd = gpuLower.includes('rtx') || gpuLower.includes('gtx') || gpuLower.includes('rx 6') || gpuLower.includes('rx 7');

            if (os === "Chrome OS" || ramVal <= 4 || coresVal <= 2 || (isIntel && isUHD)) {
                tier = 'POORLY';
                color = '#ffaa00';
                message = "Your device specs (Chromebook/Entry Level) meet the minimums but may struggle with high enemy counts. Expect lag. Using the 'Pixel Filter' setting is recommended.";
            } else if (isHighEnd && ramVal >= 8 && coresVal >= 6) {
                tier = 'RUNS GREAT';
                color = '#00ff88';
                message = "Your system is performance ready! You should be able to handle maximum enemy counts and visual effects without issues.";
            } else {
                tier = 'MODERATE';
                color = '#00ccff';
                message = "Your system meets the requirements. Handhelds (Steam Deck) run fine but may have UI quirks. Occasional stutters may occur during intense action.";
            }
        }

        badgeEl.textContent = tier;
        badgeEl.style.color = color;
        descEl.textContent = message;
        descEl.style.color = tier === 'UNSUPPORTED' ? '#ff8888' : (tier === 'POORLY' ? '#ffcc88' : '#ccc');

        // Handle Continue
        contBtn.onclick = () => {
            localStorage.setItem('uberthump_device_checked', 'true');
            overlay.style.display = 'none';
            // Start Menu Flow
            startMenuMusic();
        };
    }

    // Check if device check has run
    const hasCheckedDevice = localStorage.getItem('uberthump_device_checked');
    if (!hasCheckedDevice) {
        checkDeviceSpecs();
    } else {
        startMenuMusic();
    }

    // UI State Transitions
    enterGameBtn.addEventListener('click', () => {
        if (audioCtx.state === 'suspended') audioCtx.resume();
        // Ensure menu music is playing (idempotent)
        startMenuMusic();

        viewIntro.style.display = 'none';
        viewSelect.style.display = 'flex';

        // Move title out of left bar and show centered top title for selection screen
        try {
            const leftH1 = document.querySelector('#menu-ui-left h1');
            if (leftH1) leftH1.style.display = 'none';

            let centerTitle = document.getElementById('center-menu-title');
            if (!centerTitle) {
                centerTitle = document.createElement('div');
                centerTitle.id = 'center-menu-title';
                centerTitle.style.position = 'fixed';
                centerTitle.style.top = '14px';
                centerTitle.style.left = '50%';
                centerTitle.style.transform = 'translateX(-50%)';
                centerTitle.style.zIndex = '100';
                centerTitle.style.color = '#fff';
                centerTitle.style.fontFamily = "Press Start 2P, Space Mono, monospace";
                centerTitle.style.fontSize = '1.4rem';
                centerTitle.style.letterSpacing = '0.12em';
                centerTitle.style.pointerEvents = 'none';
                centerTitle.textContent = 'UBERTHUMP';
                document.body.appendChild(centerTitle);
            } else {
                centerTitle.style.display = 'block';
            }
        } catch (e) {}

        // Show detail panel (selection screen only)
        if (charDetailsEl) {
            charDetailsEl.style.display = 'block';
        }
        updateCharacterDetails();

        // Show persistent bestiary toggle button for selection screen (if not first run)
        const bbtn = document.getElementById('bestiary-toggle-btn');
        if (bbtn && !isFirstRun) bbtn.style.display = 'block';
        else if (bbtn) bbtn.style.display = 'none';
        
        // Trigger camera zoom
        if (menuScene) menuScene.transitionToSelect();
    });

    startBtn.addEventListener('click', (e) => {
        // Intercept TNS
        if (selectedMode === 'TNS') {
            // If we are in the "Pick Character for New Save" phase
            if (pendingTNSSlot !== null) {
                // Create the save now with the SELECTED character
                const charKey = selectedCharacter;
                const charInfo = window.CHARACTERS && window.CHARACTERS[charKey];
                
                // Construct initial save with starting weapons populated to fix softlock
                const startingWeapons = ['DEFAULT'];
                if (charInfo && charInfo.startingWeapons) {
                    startingWeapons.push(...charInfo.startingWeapons);
                }
                
                // Consolidate weapon levels (all start at 1)
                const weaponLevels = { 'DEFAULT': 1 };
                if (charInfo && charInfo.startingWeapons) {
                    charInfo.startingWeapons.forEach(w => weaponLevels[w] = 1);
                }

                const save = {
                    tier: 1,
                    character: charKey,
                    weapons: startingWeapons,
                    buffs: [], 
                    stats: null,
                    weaponLevels: weaponLevels,
                    runeLevels: {}
                };
                
                const saves = getTNSSaves();
                saves[pendingTNSSlot] = save;
                localStorage.setItem('uberthump_tns_saves', JSON.stringify(saves));
                
                // Launch
                pendingTNSSlot = null;
                launchTNS(pendingTNSSlot, save); // index passed is null? No, we need index.
                // Wait, pendingTNSSlot was cleared. Use temp var.
                // Re-read saves to get index? No, just use closure.
                // But launchTNS takes index. 
                // Correction:
                const slot = pendingTNSSlot; // Capture before nulling
                pendingTNSSlot = null;
                launchTNS(slot, save);
                return;
            }

            // Normal TNS start -> Show Save UI
            tnsSaveUI.style.display = 'flex';
            renderSaveList();
            charSelectGrid.style.display = 'none'; // Hide grid while selecting save
            startBtn.style.display = 'none';
            if (selectionHeader) selectionHeader.style.display = 'none';
            return;
        }

        // Standard Start (ARCADE / AWAKENING)
        // Play start sound
        if(game && game.playSynth) game.playSynth('unlock');
        else if (audioCtx && audioCtx.state === 'running') {
             // Simple fallback ping
             const o = audioCtx.createOscillator();
             const g = audioCtx.createGain();
             o.connect(g); g.connect(audioCtx.destination);
             o.frequency.setValueAtTime(440, audioCtx.currentTime);
             o.frequency.exponentialRampToValueAtTime(880, audioCtx.currentTime+0.1);
             g.gain.setValueAtTime(0.1, audioCtx.currentTime);
             g.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime+0.3);
             o.start(); o.stop(audioCtx.currentTime+0.3);
        }

        // Stop theme preview
        if (currentThemeNode) {
            try { currentThemeNode.stop(); } catch(e){}
        }
        
        // Trigger portal sequence
        if (menuScene) {
            menuScene.playPortalAnim(() => {
                startGame();
            });
        } else {
            startGame();
        }
    });
    
    // Unlock celebration
    window.__showUnlockScreen = function(charKey) {
        if (!unlockScreen) return;
        const info = CHARACTER_INFO[charKey];
        if (!info) return;

        unlockName.innerText = info.name;
        unlockScreen.style.background = info.themeColor || '#333';
        unlockScreen.classList.add('active');

        // Play theme
        playThemeSnippet(charKey);

        // Particles
        const container = document.getElementById('unlock-particles');
        container.innerHTML = '';
        for(let i=0; i<50; i++) {
            const p = document.createElement('div');
            p.className = 'u-particle';
            p.style.left = Math.random()*100 + '%';
            p.style.animationDuration = (2 + Math.random()*3) + 's';
            p.style.animationDelay = Math.random() + 's';
            container.appendChild(p);
        }
    };

    if (unlockBtn) {
        unlockBtn.addEventListener('click', () => {
            // Stop theme music immediately
            if (currentThemeNode) {
                try { currentThemeNode.stop(); } catch(e){}
                currentThemeNode = null;
            }
            // Restore menu music volume if in menu
            if (menuAudio && menuAudio.gain && menuAudio.gain.gain) {
                menuAudio.gain.gain.setTargetAtTime(0.4, audioCtx.currentTime, 0.5);
            }
            
            unlockScreen.classList.remove('active');
            if (game) game.isPaused = false; // Resume game
        });
    }

    function startGame(lobbySettings) {
        // Mark first run complete
        if (!localStorage.getItem('uberthump_has_played')) {
            localStorage.setItem('uberthump_has_played', 'true');
        }

        startScreen.style.display = 'none';
        // Hide selection-only UI (character details / bestiary toggle) when transitioning into game
        if (charDetailsEl) charDetailsEl.style.display = 'none';
        
        const bbtn = document.getElementById('bestiary-toggle-btn');
        if (bbtn) bbtn.style.display = 'none';

        if (loadingOverlay) loadingOverlay.classList.add('active');
        
        // HARD STOP menu music to prevent overlap
        if (menuAudio) {
            try {
                if (menuAudio.gain) menuAudio.gain.gain.setValueAtTime(0, audioCtx.currentTime);
                if (menuAudio.source) menuAudio.source.stop();
            } catch(e) {}
            menuAudio = null;
        }
        // Force clean any lingering audio
        if (window.menuAudio) {
             try { window.menuAudio.source.stop(); } catch(e){}
             window.menuAudio = null;
        }

        menuCanvas.style.display = 'none';
        const centerTitle = document.getElementById('center-menu-title');
        if (centerTitle) centerTitle.style.display = 'none';

        const setBtn = document.getElementById('settings-btn');
        const loreBtnTop = document.getElementById('lore-btn');
        const secretBtnTop = document.getElementById('secret-note-btn');
        if (setBtn) setBtn.style.display = 'none';
        if (loreBtnTop) loreBtnTop.style.display = 'none';
        if (secretBtnTop) secretBtnTop.style.display = 'none';

        // Override mode from settings if provided
        let mode = selectedMode || 'ARCADE';
        if (lobbySettings && lobbySettings.mode) {
            mode = lobbySettings.mode; // PVP or SURVIVAL
        }
        // Map Lobby 'PVP' back to internal 'MULTI' if needed, or keep distinct?
        // Internal Game uses 'MULTI' for PVP. 'SURVIVAL' for co-op.
        if (mode === 'PVP') mode = 'MULTI';

        // Force pixelate for online modes
        const runPixelate = (mode === 'AWAKENING' || mode === 'MULTI' || mode === 'SURVIVAL') ? true : !!pixelateEnabled;

        setTimeout(async () => {
            // Seed logic
            let seed = null;
            if (currentLobby && currentLobby.id) {
                seed = stringToSeed(currentLobby.id);
            }

            // Preload textures if not already loaded
            if (!preloadedTextures) {
                try {
                    preloadedTextures = await preloadGameTextures();
                    console.log('Textures preloaded successfully');
                } catch (e) {
                    console.error('Failed to preload textures:', e);
                }
            }

            // Re-instantiate game to ensure clean state with new settings
            if (game) {
                // Cleanup old game loosely?
                // Just create new instance, old one will be GC'd hopefully (we overwrite `game`)
                // Be careful of event listeners.
                // For safety, let's reuse if possible, or reload page? Reload is safest but jarring.
                // Let's just create new.
                try {
                    game.container.innerHTML = ''; // clear renderer
                } catch(e){}
            }

            game = new Game(selectedCharacter, runPixelate, useCharacterTheme, mode, room, lobbySettings, seed, preloadedTextures);
            game.init();

            if (typeof game.startIntro === 'function') {
                game.startIntro();
            }

            if (loadingOverlay) loadingOverlay.classList.remove('active');
            if(charDetailsEl) charDetailsEl.style.display = 'none';
        }, 2200);
    }
});
