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

// Camera pan position (lerped each frame)
let camXTarget = 450, camYTarget = 260, camXCur = 450, camYCur = 260;

// ============================================================
// SETTINGS & FRAME STATE
// ============================================================
// User-configurable settings (toggled from menu)
const settings = { particles: true, screenShake: true, dmgNumbers: true, landingDust: true, bossAura: true, phaseFlash: true };
let bossPhaseFlash     = 0;    // countdown for white screen flash on boss phase transition
let abilityFlashTimer  = 0;    // frames remaining for ability ring flash
let abilityFlashPlayer = null; // player who activated ability
let frameCount         = 0;
let aiTick             = 0;    // AI update runs every N frames (see AI_TICK_INTERVAL)
const AI_TICK_INTERVAL = 15;
let currentArena    = null;    // the arena data object
let currentArenaKey = 'grass';

// Pre-generated bg elements (so they don't flicker each frame)
let bgStars     = [];
let bgBuildings = [];

// ============================================================
// TRUE FORM BOSS STATE
// ============================================================
let unlockedTrueBoss   = !!localStorage.getItem('smc_trueform');
let tfGravityInverted  = false;
let tfGravityTimer     = 0;    // countdown (frames); 0 = gravity normal
let tfControlsInverted = false;
let tfFloorRemoved     = false;
let tfFloorTimer       = 0;    // countdown (frames) until floor returns
let tfBlackHoles       = [];   // { x, y, r, timer, maxTimer }
let tfSizeTargets      = new Map(); // fighter → {origW, origH, scale}

// ============================================================
// SECRET LETTER HUNT
// ============================================================
let bossBeaten         = !!localStorage.getItem('smc_bossBeaten');
let collectedLetterIds = new Set(JSON.parse(localStorage.getItem('smc_letters') || '[]'));
const SECRET_LETTERS   = ['T','R','U','E','F','O','R','M'];
const SECRET_ARENAS    = ['grass','city','space','lava','forest','ice','ruins','creator'];
const SECRET_LETTER_POS = {
  grass:   { x: 450, y: 330 },
  city:    { x: 748, y: 390 },
  space:   { x: 200, y: 290 },
  lava:    { x: 450, y: 170 },
  forest:  { x: 310, y: 360 },
  ice:     { x: 640, y: 290 },
  ruins:   { x: 765, y: 360 },
  creator: { x: 450, y: 220 },
};

// Arena order (used for menu background cycling)
const ARENA_KEYS_ORDERED = ['grass', 'city', 'space', 'lava', 'forest', 'ice', 'ruins'];

// Menu background cycling state
let menuBgArenaIdx   = 0;
let menuBgTimer      = 0;
let menuBgFade       = 0;      // 0→1 fade to black, 1→2 fade from black
let menuBgFrameCount = 0;
let menuLoopRunning  = false;

// ============================================================
// ONLINE STATE
// ============================================================
let onlineMode       = false;
let onlineReady      = false;
let onlineLocalSlot  = 0;
let _onlineGameMode  = '2p';
let _cheatBuffer     = ''; // tracks recent keypresses for cheat codes
let unlockedMegaknight = (localStorage.getItem('smc_megaknight') === '1');

// ============================================================
// ENTITY & VISUAL STATE
// ============================================================
let lightningBolts   = [];    // { x, y, timer, segments } — Thor perk visual lightning
let backstagePortals = [];    // {x,y,type,phase,timer,radius,maxRadius,codeChars,done}
let bossDeathScene   = null;  // boss defeat animation state
let fakeDeath        = { triggered: false, active: false, timer: 0, player: null };
let bossPlayerCount  = 1;     // 1 or 2 players vs boss
let forestBeast      = null;  // current ForestBeast instance (null if none)
let forestBeastCooldown = 0;  // frames until beast can spawn again after death
let yeti             = null;  // current Yeti instance in ice arena
let yetiCooldown     = 0;     // frames until yeti can spawn again
let mapItems         = [];    // arena-perk pickups
let randomWeaponPool = null;  // null = use all; Set of weapon keys
let randomClassPool  = null;  // null = use all; Set of class keys

// Boss fight floor hazard state machine
let bossFloorState = 'normal';  // 'normal' | 'warning' | 'hazard'
let bossFloorType  = 'lava';    // 'lava' | 'void'
let bossFloorTimer = 1500;      // frames until next state transition

