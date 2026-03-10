'use strict';

// ============================================================
// CANVAS
// ============================================================
const canvas = document.getElementById('gameCanvas');
const ctx    = canvas.getContext('2d');
ctx.imageSmoothingEnabled = true;

// Logical game-space dimensions — all game coordinates use these
const GAME_W = 900;
const GAME_H = 520;

// Resize canvas to fill the browser window; game world stays GAME_W x GAME_H (fixed resolution)
function resizeCanvas() {
  canvas.width  = window.innerWidth;
  canvas.height = window.innerHeight;
  ctx.imageSmoothingEnabled = true;
}
resizeCanvas();
window.addEventListener('resize', resizeCanvas);

// ============================================================
// GLOBAL STATE
// ============================================================
let gameMode        = '2p';
let selectedArena   = 'grass';
let isRandomMapMode = false;
let chosenLives     = 3;
let gameRunning     = false;
let p1IsBot         = false;
let p2IsBot         = false;
let training2P      = false; // 2-player training mode toggle
let p2IsNone        = false; // "None" — no P2 at all (solo mode)
let paused          = false;
let players         = [];
let minions         = [];    // boss-spawned minions
let verletRagdolls  = [];    // active Verlet death ragdolls
let bossBeams       = [];    // boss beam attacks (warning + active)
let bossSpikes      = [];    // boss spike attacks rising from floor
let infiniteMode    = false; // if true, no game over — just win counter
let tutorialMode       = false; // tutorial mode flag
let tutorialStep       = 0;     // current tutorial step index
let tutorialStepTimer  = 0;     // frames since step started
let tutorialDismissed  = false; // (legacy) current step has been completed/dismissed
let tutorialFlags      = {};    // per-step completion flags
let tutPrevOnGround    = false; // previous frame onGround state (for jump detection)
let tutPrevCanDblJump  = false; // previous frame canDoubleJump state
let tutStepComplete    = false; // true when current step's condition was just met
let trainingMode       = false; // training mode flag
let trainingDummies    = [];    // training dummies/bots
let trainingPlayerOnly = true;  // godmode/onePunch apply only to player (not all entities)
let trainingChaosMode  = false; // all entities attack nearest target
let winsP1 = 0, winsP2 = 0;
let bossDialogue    = { text: '', timer: 0 }; // speech bubble above boss
let projectiles        = [];
let particles          = [];
let damageTexts        = [];
let respawnCountdowns  = [];  // { color, x, y, framesLeft }
let screenShake     = 0;

// Dynamic camera zoom — lerped each frame
let camZoomTarget = 1, camZoomCur = 1;
let hitStopFrames  = 0; // frames to freeze game for hit impact feel
let camHitZoomTimer = 0; // frames of zoom-in after a heavy hit
// Camera dead zone: don't update target until center moves beyond this (reduces jitter)
const CAMERA_DEAD_ZONE = 18;
const CAMERA_LERP_ZOOM = 0.07;
const CAMERA_LERP_POS  = 0.08;

// ============================================================
// NETWORK MANAGER — WebSocket multiplayer via Socket.IO
// ============================================================
const NetworkManager = (function() {
  let _socket = null;
  let _slot   = 0;     // 1 = this client controls p1; 2 = this client controls p2
  let _room   = null;
  let _connected = false;
  let _sendTimer = 0;
  // Interpolation buffer for remote player state
  const _buf = [];  // [ {ts, x, y, vx, vy, health, maxHealth, state, facing, color, weaponKey, charClass, lives, hat, cape, curses} ]
  const MAX_BUF = 12;

  function _pushBuf(state) {
    state.ts = Date.now();
    _buf.push(state);
    while (_buf.length > MAX_BUF) _buf.shift();
  }

  function _lerp(a, b, t) { return a + (b - a) * t; }

  return {
    get connected()   { return _connected; },
    get slot()        { return _slot; },
    get room()        { return _room; },
    get socket()      { return _socket; },

    connect(serverUrl, roomCode, onJoined, onBothConnected, onRemoteState, onRemoteHit, onRemoteEvent, onDisconnect) {
      if (_socket) { _socket.disconnect(); _socket = null; }
      _connected = false;
      _slot = 0; _room = null;
      /* global io */
      if (typeof io === 'undefined') {
        console.error('Socket.IO not loaded');
        return;
      }
      _socket = io(serverUrl, { transports: ['websocket'], reconnectionAttempts: 3 });

      _socket.on('connect', () => {
        _socket.emit('joinRoom', roomCode.trim().toLowerCase());
      });

      _socket.on('joined', (data) => {
        _slot = data.slot;
        _room = data.roomCode;
        _connected = true;
        if (onJoined) onJoined(data.slot);
      });

      _socket.on('bothConnected', () => {
        if (onBothConnected) onBothConnected();
      });

      _socket.on('remoteState', (state) => {
        _pushBuf(state);
        if (onRemoteState) onRemoteState(state);
      });

      _socket.on('remoteHit', (ev) => {
        if (onRemoteHit) onRemoteHit(ev);
      });

      _socket.on('remoteGameEvent', (ev) => {
        if (onRemoteEvent) onRemoteEvent(ev);
      });

      _socket.on('opponentDisconnected', () => {
        _connected = false;
        if (onDisconnect) onDisconnect();
      });

      _socket.on('roomFull', () => {
        _connected = false;
        const el = document.getElementById('onlineStatus');
        if (el) el.textContent = '❌ Room is full — try a different code.';
      });

      _socket.on('connect_error', (err) => {
        _connected = false;
        const el = document.getElementById('onlineStatus');
        if (el) el.textContent = `❌ Cannot connect: ${err.message}`;
      });

      _socket.on('disconnect', () => {
        _connected = false;
        if (onDisconnect) onDisconnect();
      });
    },

    disconnect() {
      if (_socket) { _socket.disconnect(); _socket = null; }
      _connected = false; _slot = 0; _room = null;
      _buf.length = 0;
    },

    // Send local player state to server (call at ~20Hz)
    sendState(p) {
      if (!_socket || !_connected || !p) return;
      _socket.emit('playerState', {
        x: p.x, y: p.y, vx: p.vx, vy: p.vy,
        health: p.health, maxHealth: p.maxHealth,
        state: p.state, facing: p.facing,
        color: p.color, weaponKey: p.weaponKey,
        charClass: p.charClass || 'none',
        lives: p.lives,
        hat: p.hat || 'none', cape: p.cape || 'none',
        name: p.name || (_slot === 1 ? 'P1' : 'P2'),
        curses: (p.curses || []).map(c => ({ type: c.type, timer: c.timer })),
      });
    },

    // Send a hit event (damage dealt by local player to remote)
    sendHit(dmg, kb, kbDir) {
      if (!_socket || !_connected) return;
      _socket.emit('hitEvent', { dmg, kb, kbDir, ts: Date.now() });
    },

    // Send a generic game event
    sendGameEvent(type, data) {
      if (!_socket || !_connected) return;
      _socket.emit('gameEvent', { type, data, ts: Date.now() });
    },

    // Get the interpolated state of the remote player (call each render frame)
    getRemoteState() {
      if (_buf.length === 0) return null;
      if (_buf.length === 1) return _buf[0];
      const now = Date.now() - 130; // 130ms interpolation delay (prevents teleporting)
      let lo = _buf[0], hi = _buf[_buf.length - 1];
      for (let i = 0; i < _buf.length - 1; i++) {
        if (_buf[i].ts <= now && _buf[i + 1].ts >= now) {
          lo = _buf[i]; hi = _buf[i + 1]; break;
        }
      }
      if (lo === hi) return hi;
      const dt = hi.ts - lo.ts;
      const t  = dt > 0 ? Math.min(1, (now - lo.ts) / dt) : 1;
      return {
        x:         _lerp(lo.x,  hi.x,  t),
        y:         _lerp(lo.y,  hi.y,  t),
        vx:        _lerp(lo.vx, hi.vx, t),
        vy:        _lerp(lo.vy, hi.vy, t),
        health:    hi.health, maxHealth: hi.maxHealth,
        state:     hi.state,  facing: hi.facing,
        color:     hi.color,  weaponKey: hi.weaponKey,
        charClass: hi.charClass, lives: hi.lives,
        hat:       hi.hat,    cape: hi.cape,
        name:      hi.name,   curses: hi.curses || [],
      };
    },

    // Called every game frame — sends state at 20Hz (every 3 frames at 60fps)
    tick(localPlayer) {
      _sendTimer++;
      if (_sendTimer >= 3) {
        _sendTimer = 0;
        this.sendState(localPlayer);
      }
    },
  };
})();

let onlineMode       = false;  // true when playing online multiplayer
let onlineReady      = false;  // true when both players are connected
let onlineLocalSlot  = 0;      // 1 or 2 — which player this machine controls
let _onlineGameMode  = '2p';   // game mode selected by host for online session

let _cheatBuffer = ''; // tracks recent keypresses for cheat codes
let unlockedMegaknight = (localStorage.getItem('smc_megaknight') === '1'); // unlocked via cheat code
let camXTarget = 450, camYTarget = 260, camXCur = 450, camYCur = 260;

let lightningBolts   = [];    // { x, y, timer, segments } — Thor perk visual lightning
let backstagePortals = [];    // {x,y,type,phase,timer,radius,maxRadius,codeChars,done}
let bossDeathScene   = null;  // boss defeat animation state
let fakeDeath       = { triggered: false, active: false, timer: 0, player: null };
let bossPlayerCount = 1;    // 1 or 2 players vs boss
let forestBeast     = null;   // current ForestBeast instance (null if none)
let forestBeastCooldown = 0;  // frames until beast can spawn again after death
let yeti            = null;   // current Yeti instance in ice arena
let yetiCooldown    = 0;      // frames until yeti can spawn again
let mapItems        = [];   // arena-perk pickups
let randomWeaponPool = null; // null = use all; Set of weapon keys
let randomClassPool  = null; // null = use all; Set of class keys

// Boss fight floor hazard state machine
let bossFloorState = 'normal';  // 'normal' | 'warning' | 'hazard'
let bossFloorType  = 'lava';    // 'lava' | 'void'
let bossFloorTimer = 1500;      // frames until next state transition

