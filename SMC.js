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

// Resize canvas to fill the browser window (no aspect ratio preservation)
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
let chosenLives     = 3;
let gameRunning     = false;
let p1IsBot         = false;
let p2IsBot         = false;
let p2IsNone        = false; // "None" — no P2 at all (solo mode)
let paused          = false;
let players         = [];
let minions         = [];    // boss-spawned minions
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
let hitStopFrames = 0; // frames to freeze game for hit impact feel
let _cheatBuffer = ''; // tracks recent keypresses for cheat codes
let camXTarget = 450, camYTarget = 260, camXCur = 450, camYCur = 260;

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

// User-configurable settings (toggled from menu)
const settings = { particles: true, screenShake: true, dmgNumbers: true, landingDust: true, bossAura: true, phaseFlash: true };
let bossPhaseFlash = 0;  // countdown for white screen flash on boss phase transition
let abilityFlashTimer  = 0;  // frames remaining for ability ring flash
let abilityFlashPlayer = null; // player who activated ability
let frameCount      = 0;
let currentArena    = null;  // the arena data object
let currentArenaKey = 'grass';

// Pre-generated bg elements (so they don't flicker each frame)
let bgStars     = [];
let bgBuildings = [];


// True-boss unlock (entered via code or secret letter hunt)
let unlockedTrueBoss = !!localStorage.getItem('smc_trueform');

// True Form boss global state
let tfGravityInverted  = false;
let tfControlsInverted = false;
let tfFloorRemoved     = false;
let tfFloorTimer       = 0;        // countdown (frames) until floor returns
let tfBlackHoles       = [];       // { x, y, r, timer, maxTimer }
let tfSizeTargets      = new Map(); // fighter → {origW, origH, scale}

// Secret letter hunt system
let bossBeaten        = !!localStorage.getItem('smc_bossBeaten');
let collectedLetterIds = new Set(JSON.parse(localStorage.getItem('smc_letters') || '[]'));
const SECRET_LETTERS = ['T','R','U','E','F','O','R','M'];
const SECRET_ARENAS  = ['grass','city','space','lava','forest','ice','ruins','creator'];
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
// SOUND SYSTEM
// ============================================================
const SoundManager = (() => {
  let _ctx = null;
  let _vol = 0.35;
  let _muted = false;
  function _getCtx() {
    if (!_ctx) _ctx = new (window.AudioContext || (/** @type {any} */(window)).webkitAudioContext)();
    if (_ctx.state === 'suspended') _ctx.resume();
    return _ctx;
  }
  function _play(fn) {
    if (_muted) return;
    try { fn(_getCtx()); } catch(e) {}
  }
  function _osc(ctx, type, freq, dur, vol, envA = 0.005) {
    const g = ctx.createGain();
    g.connect(ctx.destination);
    g.gain.setValueAtTime(0, ctx.currentTime);
    g.gain.linearRampToValueAtTime(vol * _vol, ctx.currentTime + envA);
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dur);
    const o = ctx.createOscillator();
    o.type = type; o.frequency.value = freq;
    o.connect(g); o.start(); o.stop(ctx.currentTime + dur);
  }
  function _noise(ctx, dur, vol, hiPass = 300) {
    const len = Math.ceil(ctx.sampleRate * dur);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    const src = ctx.createBufferSource(); src.buffer = buf;
    const filt = ctx.createBiquadFilter(); filt.type = 'highpass'; filt.frequency.value = hiPass;
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol * _vol, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dur);
    src.connect(filt); filt.connect(g); g.connect(ctx.destination);
    src.start(); src.stop(ctx.currentTime + dur);
  }
  return {
    setVolume(v) { _vol = Math.max(0, Math.min(1, v)); },
    setMuted(m) { _muted = m; },
    isMuted() { return _muted; },
    getVolume() { return _vol; },

    swing()    { _play(c => { _osc(c,'sine',180,0.10,0.18); _noise(c,0.07,0.12,800); }); },
    hit()      { _play(c => { _osc(c,'square',120,0.12,0.22); _noise(c,0.10,0.20,400); }); },
    heavyHit() { _play(c => { _osc(c,'sawtooth',80,0.20,0.38); _noise(c,0.18,0.35,200); }); },
    jump()     { _play(c => { const o=c.createOscillator(); const g=c.createGain();
                   o.type='sine'; o.frequency.setValueAtTime(220,c.currentTime);
                   o.frequency.linearRampToValueAtTime(440,c.currentTime+0.10);
                   g.gain.setValueAtTime(_vol*0.15,c.currentTime);
                   g.gain.exponentialRampToValueAtTime(0.001,c.currentTime+0.18);
                   o.connect(g); g.connect(c.destination); o.start(); o.stop(c.currentTime+0.18); }); },
    land()     { _play(c => { _noise(c,0.06,0.18,100); _osc(c,'sine',80,0.06,0.12); }); },
    shoot()    { _play(c => { _noise(c,0.08,0.22,2000); _osc(c,'sawtooth',300,0.05,0.10); }); },
    pickup()   { _play(c => { _osc(c,'sine',523,0.08,0.10); _osc(c,'sine',784,0.08,0.10); }); },
    death()    { _play(c => { _osc(c,'sawtooth',160,0.30,0.35); _osc(c,'sine',80,0.20,0.50); _noise(c,0.25,0.20,150); }); },
    explosion(){ _play(c => { _noise(c,0.35,0.55,80); _osc(c,'sawtooth',55,0.25,0.40); }); },
    uiClick()  { _play(c => { _osc(c,'sine',440,0.06,0.10); }); },
    uiHover()  { _play(c => { _osc(c,'sine',330,0.03,0.05); }); },
    clang()    { _play(c => { _osc(c,'triangle',600,0.15,0.20); _osc(c,'sine',300,0.10,0.18); _noise(c,0.05,0.15,1200); }); },
    phaseUp()  { _play(c => { [440,554,659,880].forEach((f,i)=>setTimeout(()=>_osc(c,'sine',f,0.20,0.18),i*80)); }); },
    waveStart(){ _play(c => { [330,440,550].forEach((f,i)=>setTimeout(()=>_osc(c,'square',f,0.12,0.14),i*60)); }); },
    portalOpen(){ _play(c => { const o=c.createOscillator(); const g=c.createGain();
                   o.type='sine'; o.frequency.setValueAtTime(880,c.currentTime);
                   o.frequency.exponentialRampToValueAtTime(110,c.currentTime+0.40);
                   g.gain.setValueAtTime(_vol*0.22,c.currentTime);
                   g.gain.exponentialRampToValueAtTime(0.001,c.currentTime+0.40);
                   o.connect(g); g.connect(c.destination); o.start(); o.stop(c.currentTime+0.40); }); },
    superActivate(){ _play(c => { [262,330,392,523].forEach((f,i)=>setTimeout(()=>_osc(c,'sine',f,0.18,0.22),i*55)); }); },
  };
})();

// Sound volume and mute state (persisted in localStorage)
(function() {
  const sv = localStorage.getItem('smc_sfxVol');
  if (sv !== null) SoundManager.setVolume(parseFloat(sv));
  if (localStorage.getItem('smc_sfxMute') === '1') SoundManager.setMuted(true);
})();

function toggleSfxMute() {
  const m = !SoundManager.isMuted();
  SoundManager.setMuted(m);
  localStorage.setItem('smc_sfxMute', m ? '1' : '0');
  const btn = document.getElementById('sfxMuteBtn');
  if (btn) btn.textContent = m ? '🔇 Sound: Off' : '🔊 Sound: On';
}
function setSfxVolume(v) {
  SoundManager.setVolume(v);
  localStorage.setItem('smc_sfxVol', v);
}

// ============================================================
// ACHIEVEMENT SYSTEM
// ============================================================
const ACHIEVEMENTS = [
  // Combat
  { id: 'first_blood',    title: 'First Blood',        desc: 'Win your first match',                icon: '🩸' },
  { id: 'hat_trick',      title: 'Hat Trick',          desc: 'Win 3 matches in a row',              icon: '🎩' },
  { id: 'survivor',       title: 'Survivor',            desc: 'Win with 10 HP or less',              icon: '💀' },
  { id: 'untouchable',    title: 'Untouchable',         desc: 'Win without taking any damage',       icon: '✨' },
  { id: 'combo_king',     title: 'Combo King',          desc: 'Land 5 hits without missing',         icon: '👑' },
  // Weapons
  { id: 'gunslinger',     title: 'Gunslinger',          desc: 'Deal 500 ranged damage in one match', icon: '🔫' },
  { id: 'hammer_time',    title: 'Hammer Time',         desc: 'Win using only hammer',               icon: '🔨' },
  { id: 'clash_master',   title: 'Clash Master',        desc: 'Trigger a weapon clash (spark)',       icon: '⚡' },
  // Minigames
  { id: 'wave_5',         title: 'Wave Warrior',        desc: 'Survive 5 survival waves',            icon: '🌊' },
  { id: 'wave_10',        title: 'Wave Master',         desc: 'Survive 10 survival waves',           icon: '🌊🌊' },
  { id: 'survival_win',   title: 'Extinction Event',    desc: 'Beat all waves in team survival',     icon: '🏆' },
  { id: 'koth_win',       title: 'King of the Hill',   desc: 'Win a King of the Hill match',        icon: '🏔' },
  // Exploration
  { id: 'boss_slayer',    title: 'Boss Slayer',         desc: 'Defeat the Creator boss',             icon: '👹' },
  { id: 'true_form',      title: 'True Form',           desc: 'Unlock and defeat the True Form',    icon: '🌑' },
  { id: 'yeti_hunter',    title: 'Yeti Hunter',         desc: 'Defeat the Yeti on Ice arena',       icon: '❄' },
  { id: 'beast_tamer',    title: 'Beast Tamer',         desc: 'Defeat the Forest Beast',             icon: '🦴' },
  // Fun
  { id: 'chaos_survivor', title: 'Chaos Agent',         desc: 'Survive a wave with 3 chaos mods',   icon: '🌀' },
  { id: 'super_saver',    title: 'Super Saver',         desc: 'Use your super move 10 times',        icon: '⚡' },
  { id: 'speedrun',       title: 'Speedster',           desc: 'Win a match in under 30 seconds',     icon: '⏱' },
  { id: 'perfectionist',  title: 'Perfectionist',       desc: 'Win 10 total matches',                icon: '🌟' },
];

let earnedAchievements = new Set(JSON.parse(localStorage.getItem('smc_achievements') || '[]'));
let achievementQueue   = []; // pending popup animations
let achievementTimer   = 0;  // frames remaining for current popup

// Per-session stats for achievements
let _achStats = { damageTaken: 0, rangedDmg: 0, consecutiveHits: 0, superCount: 0,
                  winStreak: 0, totalWins: 0, matchStartTime: 0 };

function unlockAchievement(id) {
  if (earnedAchievements.has(id)) return;
  const def = ACHIEVEMENTS.find(a => a.id === id);
  if (!def) return;
  earnedAchievements.add(id);
  localStorage.setItem('smc_achievements', JSON.stringify([...earnedAchievements]));
  achievementQueue.push({ ...def, frame: 0 });
  SoundManager.phaseUp();
}

function drawAchievementPopups() {
  if (achievementQueue.length === 0) return;
  const ACH_SHOW = 240; // 4 seconds
  const cur = achievementQueue[0];
  cur.frame++;
  if (cur.frame >= ACH_SHOW) { achievementQueue.shift(); return; }

  const t = cur.frame;
  const alpha = t < 20 ? t / 20 : t > ACH_SHOW - 30 ? (ACH_SHOW - t) / 30 : 1;
  const slideX = t < 20 ? (20 - t) * 14 : 0;

  ctx.save();
  ctx.globalAlpha = alpha;
  const bw = 260, bh = 52, bx = GAME_W - bw - 12 + slideX, by = 12;
  // Background
  ctx.fillStyle = 'rgba(20,10,40,0.92)';
  ctx.beginPath(); ctx.roundRect(bx, by, bw, bh, 8); ctx.fill();
  ctx.strokeStyle = '#ffcc00'; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.roundRect(bx, by, bw, bh, 8); ctx.stroke();
  // Icon
  ctx.font = '24px Arial'; ctx.textAlign = 'left';
  ctx.fillText(cur.icon, bx + 10, by + 33);
  // Text
  ctx.fillStyle = '#ffcc00'; ctx.font = 'bold 11px Arial';
  ctx.fillText('ACHIEVEMENT UNLOCKED', bx + 42, by + 16);
  ctx.fillStyle = '#ffffff'; ctx.font = 'bold 13px Arial';
  ctx.fillText(cur.title, bx + 42, by + 30);
  ctx.fillStyle = '#aaaaaa'; ctx.font = '10px Arial';
  ctx.fillText(cur.desc, bx + 42, by + 43);
  ctx.globalAlpha = 1;
  ctx.restore();
}

function showAchievementsModal() {
  const modal = document.getElementById('achievementsModal');
  if (!modal) return;
  const grid = document.getElementById('achievementsGrid');
  if (!grid) return;
  grid.innerHTML = '';
  ACHIEVEMENTS.forEach(a => {
    const earned = earnedAchievements.has(a.id);
    const div = document.createElement('div');
    div.className = 'ach-card' + (earned ? ' ach-earned' : ' ach-locked');
    div.innerHTML = `<div class="ach-icon">${earned ? a.icon : '🔒'}</div>
      <div class="ach-title">${earned ? a.title : '???'}</div>
      <div class="ach-desc">${earned ? a.desc : 'Not yet unlocked'}</div>`;
    grid.appendChild(div);
  });
  modal.style.display = 'flex';
}

// ============================================================
// ARENA DEFINITIONS
// ============================================================
const ARENAS = {
  grass: {
    sky:         ['#68c0ea', '#aadaf5'],
    groundColor: '#4a8f3f',
    platColor:   '#5aae4e',
    platEdge:    '#3a7030',
    hasLava:     false,
    deathY:      640,
    platforms: [
      { x: -60, y: 480, w: 1020, h: 40 }, // ground (extended to prevent instant edge-fall)
      { x: 370, y: 265, w: 160, h: 18 }, // centre top
      { x: 175, y: 345, w: 165, h: 18 }, // left mid
      { x: 560, y: 345, w: 165, h: 18 }, // right mid
      { x:  30, y: 228, w: 115, h: 16 }, // far-left high
      { x: 755, y: 228, w: 115, h: 16 }, // far-right high
    ]
  },
  lava: {
    sky:            ['#1a0000', '#3d0800'],
    groundColor:    '#ff4500',
    platColor:      '#6b2b0a',
    platEdge:       '#8b3a0f',
    hasLava:        true,
    isHeavyGravity: true,
    lavaY:       442,
    deathY:      580,
    platforms: [
      { x: 360, y: 188, w: 180, h: 18 }, // top centre
      { x: 178, y: 278, w: 140, h: 18 }, // upper left
      { x: 582, y: 278, w: 140, h: 18 }, // upper right
      { x:  45, y: 362, w: 165, h: 18 }, // lower left
      { x: 690, y: 362, w: 165, h: 18 }, // lower right
      { x: 328, y: 348, w: 244, h: 18 }, // centre bridge
    ]
  },
  space: {
    sky:          ['#000010', '#000830'],
    groundColor:  '#2a2a4a',
    platColor:    '#3a3a6a',
    platEdge:     '#5a5a9a',
    hasLava:      false,
    deathY:       640,
    isLowGravity: true,
    platforms: [
      { x: -60, y: 480, w: 1020, h: 40 }, // floor (extended)
      { x: 355, y: 255, w: 190, h: 15 }, // centre top
      { x: 145, y: 332, w: 165, h: 15 }, // left mid
      { x: 590, y: 332, w: 165, h: 15 }, // right mid
      { x:  22, y: 245, w: 105, h: 15 }, // far-left
      { x: 773, y: 245, w: 105, h: 15 }, // far-right
    ]
  },
  city: {
    sky:         ['#060614', '#121228'],
    groundColor: '#222233',
    platColor:   '#33334a',
    platEdge:    '#55556a',
    hasLava:     false,
    deathY:      640,
    platforms: [
      { x: -60, y: 438, w: 1020, h: 82 }, // continuous rooftop floor (extended)
      { x:  52, y: 338, w: 132, h: 15 }, // left mid
      { x: 372, y: 322, w: 156, h: 15 }, // centre mid
      { x: 716, y: 338, w: 132, h: 15 }, // right mid
      { x: 198, y: 238, w: 122, h: 15 }, // left high
      { x: 580, y: 238, w: 122, h: 15 }, // right high
    ]
  },
  void: {
    sky:         ['#000000', '#050505'],
    groundColor: '#000000',
    platColor:   '#000000',
    platEdge:    '#ffffff',
    hasLava:     false,
    deathY:      640,
    isBossArena: true,
    isVoidArena: true,
    platforms: [
      { x: 0,   y: 460, w: 900, h: 60, isFloor: true, isFloorDisabled: false },
      { x: 280, y: 300, w: 200, h: 16 },
      { x: 80,  y: 360, w: 140, h: 16 },
      { x: 680, y: 360, w: 140, h: 16 },
    ]
  },
  creator: {
    sky:         ['#050010', '#180030'],
    groundColor: '#1a0028',
    platColor:   '#3a0055',
    platEdge:    '#9900ee',
    hasLava:     false,
    deathY:      640,
    isBossArena: true,
    platforms: [
      { x: 0,   y: 460, w: 900, h: 60, isFloor: true, isFloorDisabled: false },
      { x: 300, y: 270, w: 300, h: 18, ox: 300, oscX: 80,  oscSpeed: 0.013, oscPhase: 0.0 },
      { x: 60,  y: 345, w: 150, h: 18, ox: 60,  oscX: 35,  oscSpeed: 0.019, oscPhase: 1.0 },
      { x: 690, y: 345, w: 150, h: 18, ox: 690, oscX: 35,  oscSpeed: 0.019, oscPhase: 2.1 },
      { x: 185, y: 220, w: 130, h: 18, oy: 220, oscY: 28,  oscSpeed: 0.022, oscPhase: 0.5 },
      { x: 585, y: 220, w: 130, h: 18, oy: 220, oscY: 28,  oscSpeed: 0.022, oscPhase: 1.6 },
      { x: 375, y: 155, w: 150, h: 18 },
    ]
  },
  forest: {
    sky:         ['#1a4020', '#2d6b3a'],
    groundColor: '#2a5a20',
    platColor:   '#4a8a38',
    platEdge:    '#2a5a18',
    hasLava:     false,
    deathY:      640,
    platforms: [
      { x: -60, y: 480, w: 1020, h: 40 }, // extended
      { x: 340, y: 270, w: 220, h: 18 },
      { x: 120, y: 345, w: 145, h: 18 },
      { x: 635, y: 345, w: 145, h: 18 },
      { x:  18, y: 215, w: 110, h: 16 },
      { x: 772, y: 215, w: 110, h: 16 },
      { x: 375, y: 178, w: 150, h: 16 },
    ]
  },
  ice: {
    sky:         ['#99c8e8', '#cce8f8'],
    groundColor: '#b8d8ee',
    platColor:   '#7ab0d0',
    platEdge:    '#5090b8',
    hasLava:     false,
    deathY:      640,
    isIcy:       true,
    platforms: [
      { x: -60, y: 460, w: 1020, h: 60 }, // extended
      { x: 310, y: 285, w: 280, h: 16 },
      { x:  70, y: 360, w: 170, h: 16 },
      { x: 660, y: 360, w: 170, h: 16 },
      { x: 185, y: 225, w: 130, h: 16 },
      { x: 585, y: 225, w: 130, h: 16 },
    ]
  },
  ruins: {
    sky:         ['#1f1008', '#3a2418'],
    groundColor: '#7a6445',
    platColor:   '#8a7455',
    platEdge:    '#5a4432',
    hasLava:     false,
    deathY:      640,
    platforms: [
      { x:   0, y: 440, w: 260, h: 80 },
      { x: 320, y: 440, w: 260, h: 80 },
      { x: 640, y: 440, w: 260, h: 80 },
      { x:  90, y: 330, w: 145, h: 18 },
      { x: 665, y: 330, w: 145, h: 18 },
      { x: 360, y: 260, w: 180, h: 18 },
      { x: 195, y: 200, w: 120, h: 15 },
      { x: 585, y: 200, w: 120, h: 15 },
    ]
  }
};

// ============================================================
// ARENA LAYOUT RANDOMIZATION
// ============================================================
// Stores base platform positions per arena for randomization reference
const ARENA_BASE_PLATFORMS = {};
for (const key of Object.keys(ARENAS)) {
  if (key === 'creator') continue; // boss arena — never randomize
  ARENA_BASE_PLATFORMS[key] = ARENAS[key].platforms.map(p => ({ ...p }));
}

function randomizeArenaLayout(key) {
  if (key === 'creator') return; // never randomize boss arena
  const base  = ARENA_BASE_PLATFORMS[key];
  if (!base) return;
  const arena = ARENAS[key];
  arena.platforms = base.map((p, idx) => {
    if (idx === 0) return { ...p }; // always keep ground platform fixed
    // Randomize within ±70px x, ±45px y (except ground)
    return {
      ...p,
      x: Math.max(10, Math.min(GAME_W - p.w - 10, p.x + (Math.random() - 0.5) * 140)),
      y: Math.max(80, Math.min(440, p.y + (Math.random() - 0.5) * 90))
    };
  });
}

// ============================================================
// MAP PERKS — per-arena special item/event state
// ============================================================
const MAP_PERK_DEFS = {
  ruins: {
    items: [
      { baseX: 135, baseY: 400 },  // on left block
      { baseX: 450, baseY: 400 },  // on center block
      { baseX: 765, baseY: 400 },  // on right block
    ],
    types: ['speed','power','heal','shield','maxhp','curse_slow','curse_weak','curse_fragile','curse_maxhp_perm']
  },
  forest: {
    healZones: [{ x: 0, w: 900, healRate: 60 }]  // gentle healing every 60 frames
  },
  city: {
    carCooldown: 600  // frames between car runs
  },
  lava: {
    eruptionCooldown: 480
  }
};

let mapPerkState = {};  // runtime state per arena

function initMapPerks(key) {
  mapItems    = [];
  mapPerkState = {};
  if (key === 'ruins') {
    const def = MAP_PERK_DEFS.ruins;
    for (const pos of def.items) {
      mapItems.push({
        x: pos.baseX, y: pos.baseY - 22,
        type: def.types[Math.floor(Math.random() * def.types.length)],
        collected: false, respawnIn: 0, radius: 14, animPhase: Math.random() * Math.PI * 2
      });
    }
    mapPerkState.crates       = [];
    mapPerkState.crateCooldown = 300; // first crate after 5s
  }
  if (key === 'grass') {
    // Mark raised platforms as bouncy/floating (skip the ground floor at index 0)
    const grassPlatforms = ARENAS.grass.platforms;
    for (let i = 1; i < grassPlatforms.length; i++) {
      const pl = grassPlatforms[i];
      pl.isBouncy    = true;
      pl.naturalY    = pl.y;
      pl.sinkOffset  = 0;
      pl.floatPhase  = Math.random() * Math.PI * 2;
    }
  }
  if (key === 'city') {
    mapPerkState.carCooldown = MAP_PERK_DEFS.city.carCooldown;
    mapPerkState.cars        = [];
  }
  if (key === 'lava') {
    mapPerkState.eruptCooldown = MAP_PERK_DEFS.lava.eruptionCooldown;
    mapPerkState.eruptions     = [];
  }
}

function updateMapPerks() {
  if (!currentArena || !gameRunning) return;

  // ---- GRASS: Bouncy floating platforms ----
  if (currentArenaKey === 'grass') {
    for (const pl of currentArena.platforms) {
      if (!pl.isBouncy) continue;
      pl.sinkOffset = pl.sinkOffset * 0.94; // recover
      const floatY = Math.sin(frameCount * 0.018 + pl.floatPhase) * 4;
      pl.y = pl.naturalY + floatY + pl.sinkOffset;
    }
  }

  // ---- RUINS: Artifact pickups ----
  if (currentArenaKey === 'ruins') {
    for (const item of mapItems) {
      item.animPhase += 0.06;
      if (item.collected) {
        item.respawnIn--;
        if (item.respawnIn <= 0) {
          item.collected = false;
          item.type = MAP_PERK_DEFS.ruins.types[Math.floor(Math.random() * MAP_PERK_DEFS.ruins.types.length)];
        }
        continue;
      }
      // Check proximity
      for (const p of players) {
        if (p.isBoss || p.health <= 0) continue;
        const dx = p.cx() - item.x, dy = (p.y + p.h/2) - item.y;
        if (Math.hypot(dx, dy) < 28) {
          item.collected  = true;
          item.respawnIn  = 1800 + Math.random() * 600; // 30–40 s
          applyMapPerk(p, item.type);
          SoundManager.pickup();
          spawnParticles(item.x, item.y, '#ffd700', 16);
          screenShake = Math.max(screenShake, 6);
          if (settings.dmgNumbers) {
            const labels = { speed:'SWIFT!', power:'POWER!', heal:'+30 HP', shield:'SHIELD!', maxhp:'+15 MAX HP' };
            damageTexts.push(new DamageText(item.x, item.y - 20, labels[item.type] || '!', '#ffd700'));
          }
          break;
        }
      }
    }

    // ---- RUINS: Breakable crates ----
    if (!mapPerkState.crates)       mapPerkState.crates       = [];
    if (mapPerkState.crateCooldown === undefined) mapPerkState.crateCooldown = 300;
    if (mapPerkState.crates.length < 3) {
      mapPerkState.crateCooldown--;
      if (mapPerkState.crateCooldown <= 0) {
        // Pick a random platform surface to place the crate
        const pls = currentArena.platforms.filter(p => !p.isFloor && p.w >= 60);
        if (pls.length > 0) {
          const pl  = pls[Math.floor(Math.random() * pls.length)];
          const cx  = pl.x + 20 + Math.random() * (pl.w - 40);
          const cy  = pl.y; // crate bottom sits on platform top
          // Avoid stacking on existing crates
          const occupied = mapPerkState.crates.some(c => Math.abs(c.x - cx) < 50 && Math.abs(c.y - cy) < 40);
          if (!occupied) {
            const t = MAP_PERK_DEFS.ruins.types[Math.floor(Math.random() * MAP_PERK_DEFS.ruins.types.length)];
            mapPerkState.crates.push({ x: cx, y: cy, hp: 50, maxHp: 50, type: t, hitShake: 0, lastHitFrame: -30 });
          }
        }
        mapPerkState.crateCooldown = 1200 + Math.floor(Math.random() * 600); // 20–30 s
      }
    }
    // Crate hit detection
    for (let ci = mapPerkState.crates.length - 1; ci >= 0; ci--) {
      const crate = mapPerkState.crates[ci];
      if (crate.hitShake > 0) crate.hitShake--;
      for (const p of players) {
        if (p.health <= 0 || p.state !== 'attacking') continue;
        if (frameCount - crate.lastHitFrame < 12) continue;
        const reach = (p.weapon ? (p.weapon.range || 40) : 40) + 20;
        const inX = Math.abs(p.cx() - crate.x) < reach;
        const inY = p.y < crate.y && p.y + p.h + 10 > crate.y;
        if (inX && inY) {
          const dmg = p.weapon ? (p.weapon.damage || 10) : 10;
          crate.hp -= dmg;
          crate.hitShake = 6;
          crate.lastHitFrame = frameCount;
          spawnParticles(crate.x, crate.y - 15, '#8B5E3C', 6);
          if (crate.hp <= 0) {
            applyMapPerk(p, crate.type);
            spawnParticles(crate.x, crate.y - 15, '#ffd700', 20);
            screenShake = Math.max(screenShake, 5);
            if (settings.dmgNumbers) {
              const labels = { speed:'SWIFT!', power:'POWER!', heal:'+30 HP', shield:'SHIELD!', maxhp:'+15 MAX HP' };
              damageTexts.push(new DamageText(crate.x, crate.y - 40, labels[crate.type] || '!', '#ffd700'));
            }
            mapPerkState.crates.splice(ci, 1);
          }
          break;
        }
      }
    }
  }

  // ---- FOREST: Gradual healing ----
  if (currentArenaKey === 'forest' && frameCount % 90 === 0) {
    for (const p of players) {
      if (p.isBoss || p.health <= 0 || p.hurtTimer > 0) continue;
      if (p.onGround && p.health < p.maxHealth) {
        p.health = Math.min(p.maxHealth, p.health + 1);
        if (settings.particles && Math.random() < 0.4) {
          spawnParticles(p.cx(), p.y, '#44ff44', 3);
        }
      }
    }
  }

  // ---- FOREST: Rare beast encounter ----
  if (currentArenaKey === 'forest') {
    // Track beast death → set cooldown
    if (forestBeast && forestBeast.health <= 0) {
      _achCheckBeastDead();
      forestBeast = null;
      forestBeastCooldown = 1800; // 30s cooldown after death
    }
    if (forestBeastCooldown > 0) forestBeastCooldown--;
    // 1/1000 chance per second to spawn (checked once per second)
    if (!forestBeast && forestBeastCooldown <= 0 && frameCount % 60 === 0 && Math.random() < 0.01) {
      // Spawn on a random platform edge in the forest arena
      const pls = currentArena.platforms;
      const pl  = pls[Math.floor(Math.random() * pls.length)];
      const spawnX = pl.x + Math.random() * pl.w;
      const spawnY = pl.y - 62;
      forestBeast = new ForestBeast(spawnX, spawnY);
      // 1/10 chance: spawn as raged beast (lower HP, higher everything else)
      if (Math.random() < 0.10) {
        forestBeast.isRaged     = true;
        forestBeast.health      = 180;
        forestBeast.maxHealth   = 180;
        forestBeast.dmgMult     = 2.2;
        forestBeast.kbBonus     = 1.8;
        forestBeast.kbResist    = 0.25;
        forestBeast.color       = '#ff2200';
        forestBeast.name        = 'RAGED BEAST';
        // Speed handled in updateAI via dash cooldown tweak
        forestBeast.dashCooldown = 60;
      }
      // Target the player with lowest health
      const livingPlayers = players.filter(p => !p.isBoss && p.health > 0);
      if (livingPlayers.length > 0) {
        forestBeast.target = livingPlayers.reduce((a, b) => a.health < b.health ? a : b);
      }
      minions.push(forestBeast);
      spawnParticles(spawnX, spawnY, forestBeast.isRaged ? '#ff2200' : '#1a8a2e', 20);
      if (settings.screenShake) screenShake = Math.max(screenShake, 10);
      const beastLabel = forestBeast.isRaged ? 'RAGED BEAST!' : 'BEAST APPEARS!';
      if (settings.dmgNumbers) damageTexts.push(new DamageText(spawnX, spawnY - 20, beastLabel, forestBeast.isRaged ? '#ff4400' : '#1aff3a'));
    }
  }

  // ---- CITY: Occasional car ----
  if (currentArenaKey === 'city') {
    if (!mapPerkState.cars)        mapPerkState.cars        = [];
    if (!mapPerkState.carCooldown) mapPerkState.carCooldown = MAP_PERK_DEFS.city.carCooldown;
    if (mapPerkState.carCooldown > 0) {
      mapPerkState.carCooldown--;
    } else {
      // Spawn a car
      const fromLeft = Math.random() < 0.5;
      mapPerkState.cars.push({ x: fromLeft ? -60 : GAME_W + 60, y: 432,
        vx: fromLeft ? 9 : -9, warned: false, warnTimer: 60 });
      mapPerkState.carCooldown = 1200 + Math.floor(Math.random() * 800);
    }
    for (let ci = mapPerkState.cars.length - 1; ci >= 0; ci--) {
      const car = mapPerkState.cars[ci];
      if (car.warnTimer > 0) { car.warnTimer--; continue; }
      car.x += car.vx;
      if (car.x < -120 || car.x > GAME_W + 120) {
        mapPerkState.cars.splice(ci, 1); continue;
      }
      // Damage players in path
      for (const p of players) {
        if (p.health <= 0 || p.invincible > 0) continue;
        if (Math.abs(p.cx() - car.x) < 40 && Math.abs((p.y + p.h) - car.y) < 60) {
          dealDamage(players.find(q => q.isBoss) || players[1], p, 18, 16);
        }
      }
    }
  }

  // ---- LAVA: Eruptions ----
  if (currentArenaKey === 'lava') {
    if (!mapPerkState.eruptCooldown) mapPerkState.eruptCooldown = 480;
    if (!mapPerkState.eruptions)     mapPerkState.eruptions     = [];
    mapPerkState.eruptCooldown--;
    if (mapPerkState.eruptCooldown <= 0) {
      const ex = 60 + Math.random() * 780;
      mapPerkState.eruptions.push({ x: ex, timer: 180 });
      mapPerkState.eruptCooldown = 360 + Math.floor(Math.random() * 360);
    }
    for (let ei = mapPerkState.eruptions.length - 1; ei >= 0; ei--) {
      const er = mapPerkState.eruptions[ei];
      er.timer--;
      if (er.timer <= 0) { mapPerkState.eruptions.splice(ei, 1); continue; }
      if (er.timer % 5 === 0 && settings.particles) {
        const upA = -Math.PI/2 + (Math.random()-0.5)*0.5;
        particles.push({ x: er.x, y: currentArena.lavaY || 442,
          vx: Math.cos(upA)*5, vy: Math.sin(upA)*(8+Math.random()*8),
          color: Math.random() < 0.5 ? '#ff4400' : '#ff8800',
          size: 3+Math.random()*4, life: 30+Math.random()*20, maxLife: 50 });
      }
      // Damage nearby players — wider (±100px), taller (250px above lava)
      for (const p of players) {
        if (p.isBoss || p.health <= 0 || p.invincible > 0) continue;
        if (Math.abs(p.cx() - er.x) < 100 && p.y + p.h > (currentArena.lavaY || 442) - 250) {
          if (er.timer % 10 === 0) dealDamage(players.find(q => q.isBoss) || players[1], p, Math.ceil(p.maxHealth * 0.044), 8);
        }
      }
    }
  }

  // ---- SPACE: Falling meteorites ----
  if (currentArenaKey === 'space') {
    if (!mapPerkState.meteors)         mapPerkState.meteors        = [];
    if (!mapPerkState.meteorCooldown)  mapPerkState.meteorCooldown = 1800;
    mapPerkState.meteorCooldown--;
    if (mapPerkState.meteorCooldown <= 0) {
      mapPerkState.meteorCooldown = 1200 + Math.floor(Math.random() * 600);
      const mx = 80 + Math.random() * (GAME_W - 160);
      mapPerkState.meteors.push({ x: mx, y: -20, vy: 0, warned: true, warnTimer: 90, landed: false });
    }
    for (let mi = mapPerkState.meteors.length - 1; mi >= 0; mi--) {
      const m = mapPerkState.meteors[mi];
      if (m.warnTimer > 0) { m.warnTimer--; continue; }
      m.vy += 0.55; // gravity accelerates
      m.y  += m.vy;
      if (m.y > GAME_H + 20) { mapPerkState.meteors.splice(mi, 1); continue; }
      // Damage players in blast radius
      for (const p of players) {
        if (p.health <= 0 || p.invincible > 0) continue;
        if (Math.hypot(p.cx() - m.x, p.cy() - m.y) < 55) {
          spawnParticles(m.x, m.y, '#ff8844', 14);
          dealDamage(players[1] || players[0], p, 28, 22);
          mapPerkState.meteors.splice(mi, 1);
          if (settings.screenShake) screenShake = Math.max(screenShake, 18);
          break;
        }
      }
      // Explode on ground (y > 460)
      if (mi < mapPerkState.meteors.length && mapPerkState.meteors[mi].y > 455) {
        spawnParticles(m.x, 460, '#ff8844', 20);
        if (settings.screenShake) screenShake = Math.max(screenShake, 14);
        mapPerkState.meteors.splice(mi, 1);
      }
    }
  }

  // ---- ICE: Yeti rare encounter ----
  if (currentArenaKey === 'ice') {
    // Clean up dead yeti and start 20s respawn cooldown
    if (yeti && yeti.health <= 0) { _achCheckYetiDead(); yeti = null; yetiCooldown = 1200; }
    if (yetiCooldown > 0) yetiCooldown--;
    // Can't spawn: still on cooldown, one already alive, or first 15s of game haven't passed
    const yetiMinStartFrame = 900; // 15 seconds at 60fps
    if (!yeti && yetiCooldown <= 0 && frameCount >= yetiMinStartFrame && Math.random() < 1/200) {
      const spawnX = Math.random() < 0.5 ? 60 : GAME_W - 60;
      yeti = new Yeti(spawnX, 200);
      const living = players.filter(p => !p.isBoss && p.health > 0);
      yeti.target = living[0] || players[0];
      minions.push(yeti);
      spawnParticles(spawnX, 200, '#88ccff', 20);
      if (settings.dmgNumbers) damageTexts.push(new DamageText(GAME_W / 2, 80, 'A YETI APPEARS!', '#88ccff'));
    }
  }

  // ---- ICE/SNOW: Blizzard wind gusts ----
  if (currentArenaKey === 'ice') {
    if (mapPerkState.blizzardTimer === undefined) mapPerkState.blizzardTimer = 1200;
    if (mapPerkState.blizzardActive === undefined) mapPerkState.blizzardActive = false;
    if (mapPerkState.blizzardDir    === undefined) mapPerkState.blizzardDir    = 1;
    mapPerkState.blizzardTimer--;
    if (!mapPerkState.blizzardActive && mapPerkState.blizzardTimer <= 0) {
      mapPerkState.blizzardActive = true;
      mapPerkState.blizzardDir    = Math.random() < 0.5 ? 1 : -1;
      mapPerkState.blizzardTimer  = 180; // gust lasts 3 seconds
      if (settings.dmgNumbers) damageTexts.push(new DamageText(GAME_W / 2, 80, 'BLIZZARD!', '#88ccff'));
    } else if (mapPerkState.blizzardActive && mapPerkState.blizzardTimer <= 0) {
      mapPerkState.blizzardActive = false;
      mapPerkState.blizzardTimer  = 1200 + Math.floor(Math.random() * 600);
    }
    if (mapPerkState.blizzardActive) {
      const pushForce = 1.2 * mapPerkState.blizzardDir;
      for (const p of players) {
        if (p.health <= 0) continue;
        p.vx += pushForce;
        // Spawn snow particles
        if (Math.random() < 0.25) {
          particles.push({
            x: Math.random() * GAME_W, y: -5,
            vx: -2 * mapPerkState.blizzardDir + (Math.random()-0.5)*2,
            vy: 2 + Math.random() * 2,
            color: 'rgba(200,230,255,0.7)', size: 2 + Math.random() * 2,
            life: 50, maxLife: 50
          });
        }
      }
    }
  }
}

function applyMapPerk(player, type) {
  if (type === 'heal') {
    player.health = Math.min(player.maxHealth, player.health + 30);
  } else if (type === 'speed') {
    player._speedBuff = 360; // 6 seconds
  } else if (type === 'power') {
    player._powerBuff = 360;
  } else if (type === 'shield') {
    player.invincible = Math.max(player.invincible, 180);
    spawnParticles(player.cx(), player.cy(), '#88ddff', 20);
  } else if (type === 'maxhp') {
    player.maxHealth = Math.min(250, player.maxHealth + 15);
    player.health    = Math.min(player.maxHealth, player.health + 15);
    spawnParticles(player.cx(), player.cy(), '#ff88ff', 20);
  } else if (type === 'curse_slow') {
    if (!player.curses) player.curses = [];
    player.curses = player.curses.filter(c => c.type !== 'curse_slow');
    player.curses.push({ type: 'curse_slow', timer: 30 * 60 }); // 30s
    spawnParticles(player.cx(), player.cy(), '#4488ff', 14);
  } else if (type === 'curse_weak') {
    if (!player.curses) player.curses = [];
    player.curses = player.curses.filter(c => c.type !== 'curse_weak');
    player.curses.push({ type: 'curse_weak', timer: 20 * 60 }); // 20s
    spawnParticles(player.cx(), player.cy(), '#222222', 14);
  } else if (type === 'curse_fragile') {
    if (!player.curses) player.curses = [];
    player.curses = player.curses.filter(c => c.type !== 'curse_fragile');
    player.curses.push({ type: 'curse_fragile', timer: 25 * 60 }); // 25s
    spawnParticles(player.cx(), player.cy(), '#ff8800', 14);
  } else if (type === 'curse_maxhp_perm') {
    player.maxHealth = Math.max(50, player.maxHealth - 15);
    if (player.health > player.maxHealth) player.health = player.maxHealth;
    spawnParticles(player.cx(), player.cy(), '#880000', 18);
  }
}

function drawMapPerks() {
  // ---- RUINS artifacts ----
  if (currentArenaKey === 'ruins') {
    // Breakable crates
    if (mapPerkState.crates) {
      for (const crate of mapPerkState.crates) {
        const sx = crate.hitShake > 0 ? (Math.random() - 0.5) * 4 : 0;
        const bx = crate.x + sx;
        const by = crate.y;          // crate bottom = platform top
        const cw = 32, ch = 28;
        ctx.save();
        // Box body
        ctx.fillStyle = '#7B4F2A';
        ctx.fillRect(bx - cw/2, by - ch, cw, ch);
        // Wood grain lines
        ctx.strokeStyle = '#4A2E10';
        ctx.lineWidth = 1.5;
        ctx.strokeRect(bx - cw/2, by - ch, cw, ch);
        ctx.beginPath();
        ctx.moveTo(bx, by - ch); ctx.lineTo(bx, by);
        ctx.moveTo(bx - cw/2, by - ch/2); ctx.lineTo(bx + cw/2, by - ch/2);
        ctx.stroke();
        // HP bar
        const hpFrac = crate.hp / crate.maxHp;
        ctx.fillStyle = '#222';
        ctx.fillRect(bx - 18, by - ch - 7, 36, 4);
        ctx.fillStyle = hpFrac > 0.5 ? '#44dd44' : hpFrac > 0.25 ? '#ddcc22' : '#dd3333';
        ctx.fillRect(bx - 18, by - ch - 7, 36 * hpFrac, 4);
        // Type icon
        const icons = { speed:'S', power:'P', heal:'H', shield:'D', maxhp:'+' };
        ctx.fillStyle = '#ffe8a0';
        ctx.font = 'bold 11px Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(icons[crate.type] || '?', bx, by - ch/2);
        ctx.restore();
      }
    }
    for (const item of mapItems) {
      if (item.collected) continue;
      const bob   = Math.sin(item.animPhase) * 5;
      const glow  = 0.6 + Math.sin(item.animPhase * 1.3) * 0.3;
      const colors = { speed:'#44aaff', power:'#ff4422', heal:'#44ff88', shield:'#88ddff', maxhp:'#ff88ff' };
      const glowC  = colors[item.type] || '#ffd700';
      ctx.save();
      ctx.shadowColor = glowC;
      ctx.shadowBlur  = 12 * glow;
      ctx.fillStyle   = glowC;
      ctx.globalAlpha = 0.9;
      ctx.beginPath();
      ctx.arc(item.x, item.y + bob, 10, 0, Math.PI * 2);
      ctx.fill();
      // Icon letter
      ctx.fillStyle   = '#000';
      ctx.shadowBlur  = 0;
      ctx.font        = 'bold 10px Arial';
      ctx.textAlign   = 'center';
      ctx.textBaseline = 'middle';
      const icons = { speed:'S', power:'P', heal:'H', shield:'D', maxhp:'+' };
      ctx.fillText(icons[item.type] || '?', item.x, item.y + bob);
      ctx.restore();
    }
  }

  // ---- LAVA eruption columns (lava arena + boss arena lava hazard) ----
  const showEruptions = (currentArenaKey === 'lava' || currentArenaKey === 'creator') && mapPerkState.eruptions;
  if (showEruptions) {
    const ly = currentArena.lavaY || 462;
    for (const er of mapPerkState.eruptions) {
      const progress = 1 - (er.timer / 180);
      const colH = Math.min(300, progress * 600);
      const alpha = er.timer < 40 ? er.timer / 40 : Math.min(1, (180 - er.timer) / 18 + 0.55);
      ctx.save();
      ctx.globalAlpha = alpha * 0.90;
      const cg = ctx.createLinearGradient(er.x, ly, er.x, ly - colH);
      cg.addColorStop(0, '#ff8800');
      cg.addColorStop(0.35, 'rgba(255,60,0,0.80)');
      cg.addColorStop(1, 'rgba(255,40,0,0)');
      ctx.fillStyle = cg;
      ctx.fillRect(er.x - 40, ly - colH, 80, colH);
      ctx.restore();
    }
  }

  // ---- CITY cars ----
  if (currentArenaKey === 'city' && mapPerkState.cars) {
    for (const car of mapPerkState.cars) {
      if (car.warnTimer > 0) {
        // Warning arrow
        const wx = car.vx > 0 ? 20 : GAME_W - 20;
        ctx.save();
        ctx.globalAlpha = Math.sin(frameCount * 0.3) * 0.5 + 0.5;
        ctx.fillStyle   = '#ff4400';
        ctx.font        = 'bold 18px Arial';
        ctx.textAlign   = 'center';
        ctx.fillText(car.vx > 0 ? '\u25b6 CAR!' : 'CAR! \u25c0', wx, car.y - 20);
        ctx.restore();
        continue;
      }
      ctx.save();
      ctx.fillStyle = '#cc3300';
      ctx.fillRect(car.x - 30, car.y - 24, 60, 24);
      ctx.fillStyle = '#ff5500';
      ctx.fillRect(car.x - 24, car.y - 38, 48, 16);
      ctx.fillStyle = '#ffee88';
      ctx.fillRect(car.vx > 0 ? car.x + 26 : car.x - 34, car.y - 20, 8, 8);
      ctx.restore();
    }
  }

  // ---- SPACE: Draw meteors + warning ----
  if (currentArenaKey === 'space' && mapPerkState.meteors) {
    for (const m of mapPerkState.meteors) {
      ctx.save();
      if (m.warnTimer > 0) {
        // Red X warning on ground
        ctx.globalAlpha = Math.sin(frameCount * 0.4) * 0.5 + 0.5;
        ctx.strokeStyle = '#ff4400';
        ctx.lineWidth   = 3;
        ctx.beginPath();
        ctx.moveTo(m.x - 14, 450); ctx.lineTo(m.x + 14, 464);
        ctx.moveTo(m.x + 14, 450); ctx.lineTo(m.x - 14, 464);
        ctx.stroke();
        // Dashed drop line
        ctx.setLineDash([4, 6]);
        ctx.strokeStyle = 'rgba(255,100,0,0.4)';
        ctx.beginPath(); ctx.moveTo(m.x, 0); ctx.lineTo(m.x, 450); ctx.stroke();
      } else {
        // Meteor body
        const mg = ctx.createRadialGradient(m.x, m.y, 0, m.x, m.y, 16);
        mg.addColorStop(0, '#ffffff');
        mg.addColorStop(0.4, '#ffaa44');
        mg.addColorStop(1, '#cc3300');
        ctx.fillStyle = mg;
        ctx.shadowColor = '#ff6600';
        ctx.shadowBlur  = 16;
        ctx.beginPath(); ctx.arc(m.x, m.y, 14, 0, Math.PI * 2); ctx.fill();
        // Trail
        ctx.globalAlpha = 0.4;
        ctx.fillStyle = '#ffaa44';
        ctx.beginPath(); ctx.arc(m.x, m.y - 20, 8, 0, Math.PI * 2); ctx.fill();
        ctx.globalAlpha = 0.2;
        ctx.beginPath(); ctx.arc(m.x, m.y - 38, 5, 0, Math.PI * 2); ctx.fill();
      }
      ctx.restore();
    }
  }

  // ---- ICE: Blizzard overlay ----
  if (currentArenaKey === 'ice' && mapPerkState.blizzardActive) {
    ctx.save();
    const windAlpha = Math.min(1, (180 - mapPerkState.blizzardTimer) / 60) * 0.18;
    ctx.fillStyle = `rgba(180,220,255,${windAlpha})`;
    ctx.fillRect(0, 0, GAME_W, GAME_H);
    // Wind lines
    ctx.strokeStyle = 'rgba(200,240,255,0.35)';
    ctx.lineWidth = 1.5;
    for (let li = 0; li < 12; li++) {
      const lx = ((frameCount * 6 * mapPerkState.blizzardDir + li * 80) % (GAME_W + 60)) - 30;
      const ly = 40 + li * 45;
      ctx.beginPath();
      ctx.moveTo(lx, ly);
      ctx.lineTo(lx + mapPerkState.blizzardDir * -60, ly + 8);
      ctx.stroke();
    }
    ctx.restore();
  }
}

// ============================================================
// WEAPON DEFINITIONS
// ============================================================
const WEAPONS = {
  sword: {
    // Fast gap-closer. Good damage, moderate reach.
    name: 'Sword',   damage: 18, range: 74, cooldown: 36,
    kb: 11,          abilityCooldown: 140, type: 'melee', color: '#cccccc',
    abilityName: 'Dash Slash',
    ability(user, target) {
      user.vx = user.facing * 18;
      if (dist(user, target) < 140) dealDamage(user, target, 36, 18);
    }
  },
  hammer: {
    // Devastating but very slow. Short range forces commitment.
    name: 'Hammer',  damage: 28, range: 54, cooldown: 50,
    kb: 20,          abilityCooldown: 210, type: 'melee', color: '#888888',
    abilityName: 'Ground Slam',
    ability(user, target) {
      screenShake = Math.max(screenShake, 32);
      spawnRing(user.cx(), user.y + user.h);
      if (dist(user, target) < 145) dealDamage(user, target, 34, 26);
    }
  },
  gun: {
    // Ranged weapon. Each bullet deals 5–8 random damage.
    name: 'Gun',     damage: 10, range: 600, cooldown: 38,
    damageFunc: () => Math.floor(Math.random() * 4) + 5,
    superRateBonus: 2.8,
    splashRange: 38, splashDmgPct: 0.30,
    kb: 6,           abilityCooldown: 150, type: 'ranged', color: '#666666',
    abilityName: 'Rapid Fire',
    ability(user, _target) {
      for (let i = 0; i < 5; i++) {
        setTimeout(() => {
          if (!gameRunning || user.health <= 0) return;
          spawnBullet(user, 14 + (Math.random()-0.5)*2, '#ffdd00');
        }, i * 80);
      }
    }
  },
  axe: {
    // Balanced all-rounder. Spin ability covers both sides.
    name: 'Axe',     damage: 22, range: 70, cooldown: 44,
    splashRange: 95, splashDmgPct: 0.55,
    kb: 14,          abilityCooldown: 150, type: 'melee', color: '#cc4422',
    abilityName: 'Spin Attack',
    ability(user, target) {
      user.spinning = 30;
      if (dist(user, target) < 120) dealDamage(user, target, 30, 18);
    }
  },
  spear: {
    // Longest reach, consistent damage. Rewards spacing.
    name: 'Spear',   damage: 18, range: 105, cooldown: 36,
    kb: 10,          abilityCooldown: 155, type: 'melee', color: '#8888ff',
    abilityName: 'Lunge',
    ability(user, target) {
      user.vx = user.facing * 16;
      user.vy = -6;
      if (dist(user, target) < 155) dealDamage(user, target, 30, 15);
    }
  },
  bow: {
    // Long-range arc weapon. Class-specific to Archer.
    name: 'Bow',  damage: 0, range: 700, cooldown: 52,
    damageFunc: () => Math.floor(12 + Math.random() * 8),
    kb: 12,       abilityCooldown: 180, type: 'ranged', color: '#aad47a',
    requiresClass: 'archer',
    abilityName: 'Triple Shot',
    ability(user, _target) {
      const angles = [-0.2, 0, 0.2];
      for (let i = 0; i < 3; i++) {
        const dmg = user.weapon.damageFunc();
        const speed = 12;
        const vx = user.facing * speed * Math.cos(angles[i]);
        const vy = speed * Math.sin(angles[i]);
        projectiles.push(new Projectile(user.cx() + user.facing * 12, user.y + 22, vx, vy, user, dmg, '#aad47a'));
      }
    }
  },
  shield: {
    // Defensive melee. High KB pushback. Class-specific to Paladin.
    name: 'Shield', damage: 10, range: 52, cooldown: 38,
    kb: 22,         abilityCooldown: 200, type: 'melee', color: '#88aaff',
    requiresClass: 'paladin',
    contactDmgMult: 0,
    abilityName: 'Shield Bash',
    ability(user, target) {
      if (dist(user, target) < 100) {
        target.vx  = user.facing * 28;
        target.stunTimer = Math.max(target.stunTimer || 0, 25);
        dealDamage(user, target, 14, 24);
        spawnParticles(target.cx(), target.cy(), '#88aaff', 10);
      }
    }
  },
  scythe: {
    // Wide sweep melee. Heals on hit.
    name: 'Scythe', damage: 20, range: 110, cooldown: 34,
    splashRange: 70, splashDmgPct: 0.6,
    kb: 13,          abilityCooldown: 160, type: 'melee', color: '#aa44aa',
    abilityName: 'Reaping Sweep',
    ability(user, _target) {
      let healed = 0;
      for (const p of players) {
        if (p === user || p.health <= 0) continue;
        if (dist(user, p) < 130) { dealDamage(user, p, 16, 10); healed++; }
      }
      for (const d of trainingDummies) {
        if (d.health > 0 && dist(user, d) < 130) { dealDamage(user, d, 16, 10); healed++; }
      }
      if (healed > 0) {
        user.health = Math.min(user.maxHealth, user.health + healed * 5);
        spawnParticles(user.cx(), user.cy(), '#aa44aa', 12);
      }
    }
  },
  fryingpan: {
    // Slow heavy swing. High KB, short stun. Balanced by slow swing.
    name: 'Frying Pan', damage: 20, range: 58, cooldown: 52,
    kb: 22,              abilityCooldown: 190, type: 'melee', color: '#ccaa44',
    abilityName: 'Pan Slam',
    ability(user, target) {
      if (dist(user, target) < 100) {
        dealDamage(user, target, 28, 28);
        target.stunTimer = Math.max(target.stunTimer || 0, 40); // 0.67s stun
        spawnParticles(target.cx(), target.cy(), '#ffdd66', 12);
        screenShake = Math.max(screenShake, 16);
      }
    }
  },
  broomstick: {
    // Long reach but low damage. Pushes enemies back. Spacing weapon.
    name: 'Broomstick', damage: 10, range: 130, cooldown: 34,
    kb: 16,              abilityCooldown: 160, type: 'melee', color: '#aa8855',
    abilityName: 'Sweep',
    ability(user, target) {
      user.vx = user.facing * 10;
      if (dist(user, target) < 170) {
        dealDamage(user, target, 12, 24);
        target.vx += user.facing * 18; // big push
        spawnParticles(target.cx(), target.cy(), '#cc9966', 10);
      }
    }
  },
  boxinggloves: {
    // Very fast combos. Low damage per hit but chains quickly.
    name: 'Boxing Gloves', damage: 7, range: 52, cooldown: 16,
    kb: 5,                 abilityCooldown: 120, type: 'melee', color: '#ee3333',
    abilityName: 'Rapid Combo',
    ability(user, target) {
      let count = 0;
      const doHit = () => {
        if (!gameRunning || user.health <= 0) return;
        if (dist(user, target) < 90) {
          dealDamage(user, target, 9, 5);
          spawnParticles(target.cx(), target.cy(), '#ff4444', 4);
        }
        count++;
        if (count < 5) setTimeout(doHit, 100);
      };
      doHit();
    }
  },
  peashooter: {
    // Rapid-fire, very low damage per shot. Pestering weapon.
    name: 'Pea Shooter', damage: 0, range: 700, cooldown: 10,
    damageFunc: () => 2 + Math.floor(Math.random() * 2), // 2-3 per shot
    bulletSpeed: 15, bulletColor: '#44cc44',
    kb: 2,               abilityCooldown: 130, type: 'ranged', color: '#44cc44',
    abilityName: 'Pea Storm',
    ability(user, _target) {
      for (let i = 0; i < 10; i++) {
        setTimeout(() => {
          if (!gameRunning || user.health <= 0) return;
          const angle = (Math.random() - 0.5) * 0.3;
          const spd   = 12 + Math.random() * 3;
          projectiles.push(new Projectile(
            user.cx() + user.facing * 12, user.y + 22,
            user.facing * spd * Math.cos(angle), spd * Math.sin(angle),
            user, user.weapon.damageFunc(), '#44cc44'
          ));
        }, i * 60);
      }
    }
  },
  slingshot: {
    // Slower fire rate, arc projectile, moderate damage.
    name: 'Slingshot', damage: 0, range: 650, cooldown: 50,
    damageFunc: () => 12 + Math.floor(Math.random() * 6), // 12-17 per shot
    bulletSpeed: 10, bulletColor: '#ff9933', bulletVy: -1.5,
    kb: 10,            abilityCooldown: 200, type: 'ranged', color: '#cc8833',
    abilityName: 'Power Stone',
    ability(user, target) {
      // Fires a larger, faster stone with splash
      const dx = (target.cx() - user.cx()) || 1;
      const dy = (target.cy() - user.cy()) || 1;
      const len = Math.hypot(dx, dy);
      const proj = new Projectile(
        user.cx() + user.facing * 12, user.y + 22,
        (dx / len) * 16, (dy / len) * 16,
        user, 24, '#ff9933'
      );
      proj.splashRange = 60;
      proj.dmg = 24;
      projectiles.push(proj);
    }
  },
  paperairplane: {
    // Slow curving projectile. Low damage but confusing arc.
    name: 'Paper Airplane', damage: 0, range: 800, cooldown: 38,
    damageFunc: () => 6 + Math.floor(Math.random() * 4), // 6-9 per shot
    bulletSpeed: 7, bulletColor: '#aaccff', bulletVy: -0.5,
    kb: 4,                  abilityCooldown: 170, type: 'ranged', color: '#ddeeff',
    abilityName: 'Paper Barrage',
    ability(user, _target) {
      for (let i = 0; i < 4; i++) {
        setTimeout(() => {
          if (!gameRunning || user.health <= 0) return;
          const angle = (Math.random() - 0.5) * 0.5;
          projectiles.push(new Projectile(
            user.cx() + user.facing * 12, user.y + 20,
            user.facing * (8 + Math.random() * 4) * Math.cos(angle),
            (8 + Math.random() * 4) * Math.sin(angle) - 2,
            user, user.weapon.damageFunc(), '#aaccff'
          ));
        }, i * 140);
      }
    }
  },
  gauntlet: {
    // Boss-only weapon. Low base contact damage, massive void slam ability.
    name: 'Gauntlet', damage: 5, range: 34, cooldown: 30,
    kb: 10,            abilityCooldown: 200, type: 'melee', color: '#9900ee',
    contactDmgMult: 0.4,
    abilityName: 'Void Slam',
    ability(user, _target) {
      screenShake = Math.max(screenShake, 28);
      spawnRing(user.cx(), user.cy());
      spawnRing(user.cx(), user.cy());
      for (const p of players) {
        if (p === user || p.health <= 0) continue;
        if (dist(user, p) < 165) dealDamage(user, p, 30, 40);
      }
      // Also hit training dummies
      for (const d of trainingDummies) {
        if (d.health <= 0) continue;
        if (dist(user, d) < 165) dealDamage(user, d, 7, 40);
      }
    }
  }
};

const WEAPON_KEYS = Object.keys(WEAPONS).filter(k => k !== 'gauntlet');

// ============================================================
// CHARACTER CLASSES
// ============================================================
const CLASSES = {
  none:      { name: 'None',      desc: 'Standard balanced fighter',            weapon: null,     hp: 100, speedMult: 1.00, perk: null           },
  thor:      { name: 'Thor',      desc: 'Hammer master, thunder on dash',       weapon: 'hammer', hp: 115, speedMult: 0.90, perk: 'thunder'      },
  kratos:    { name: 'Kratos',    desc: 'Axe specialist, rage on hit',          weapon: 'axe',    hp: 125, speedMult: 0.92, perk: 'rage'         },
  ninja:     { name: 'Ninja',     desc: 'Fast sword fighter, quick dash',       weapon: 'sword',  hp: 80,  speedMult: 1.22, perk: 'swift'        },
  gunner:    { name: 'Gunner',    desc: 'Dual-shot gunslinger',                 weapon: 'gun',    hp: 95,  speedMult: 1.05, perk: 'dual_shot'    },
  archer:    { name: 'Archer',    desc: 'Bow-only. Fast. Auto-backstep at low HP.', weapon: 'bow', hp: 85,  speedMult: 1.18, perk: 'backstep'    },
  paladin:   { name: 'Paladin',   desc: 'Shield-only. Tanky. 15% dmg reduction.', weapon: 'shield', hp: 130, speedMult: 0.88, perk: 'holy_light' },
  berserker: { name: 'Berserker', desc: 'Any weapon. Rage boosts dmg at low HP.',  weapon: null, hp: 120,  speedMult: 1.10, perk: 'blood_frenzy'  },
};

// ============================================================
// WEAPON & CLASS DESCRIPTIONS  (shown in menu sidebar)
// ============================================================
const WEAPON_DESCS = {
  random:  { title: 'Random Weapon',  what: 'Picks a random weapon each game — embrace the chaos.',                                                         ability: null,                                                              super: null,                                                               how:  'Adapt to whatever you get each round.' },
  sword:   { title: 'Sword',          what: 'Fast, balanced melee weapon with good range. Damage: 18.',                                                     ability: 'Q — Dash Slash: dashes forward and slices for 36 dmg.',           super: 'E — Power Thrust: massive forward lunge for 60 dmg.',              how:  'Great all-rounder. Use Dash Slash to chase and punish.' },
  hammer:  { title: 'Hammer',         what: 'Slow but devastating. Huge knockback on every hit. Damage: 28.',                                               ability: 'Q — Ground Slam: shockwave AoE around you for 34 dmg.',          super: 'E — Mega Slam: screen-shaking AoE crush for 58 dmg.',              how:  'Get close, be patient, then smash hard.' },
  gun:     { title: 'Gun',            what: 'Ranged weapon. Each bullet deals 5–8 damage. Fires splash rounds.',                                            ability: 'Q — Rapid Fire: 5-shot burst.',                                   super: 'E — Bullet Storm: 14 rapid shots (9–12 dmg each).',               how:  'Keep your distance. Use Rapid Fire to pressure from afar.' },
  axe:     { title: 'Axe',            what: 'Balanced melee with solid damage, good knockback, and splash hits. Damage: 22.',                               ability: 'Q — Spin Attack: 360° slash that hits both sides.',               super: 'E — Berserker Spin: long spinning AoE for 52 dmg.',               how:  'Use Spin Attack in tight spots to cover all angles.' },
  spear:   { title: 'Spear',          what: 'Longest melee reach in the game. Consistent damage. Damage: 18.',                                              ability: 'Q — Lunge: leap forward with the spear for 30 dmg.',             super: 'E — Sky Piercer: aerial forward lunge for 50 dmg.',               how:  'Stay at optimal range. Poke safely from afar.' },
  bow:     { title: 'Bow ⚔ Archer only', what: 'Long-range arc weapon. Arrows deal 12–20 damage and arc slightly over distance.', ability: 'Q — Triple Shot: fires 3 arrows in a fan spread.',       super: 'E — Power Arrow: giant arrow for 60 dmg with high knockback.',    how:  'Stay back and poke. Triple Shot punishes clustered enemies. ARCHER CLASS REQUIRED.' },
  shield:  { title: 'Shield ⚔ Paladin only', what: 'Defensive melee weapon. High knockback. Damage: 10.', ability: 'Q — Shield Bash: pushes enemy back and stuns for 25 frames.',              super: 'E — Holy Nova: AoE burst, heals self and deals 40 dmg to nearby foes.', how: 'Block with S key to absorb bullets. Bash enemies away. PALADIN CLASS REQUIRED.' },
  scythe:       { title: 'Scythe',         what: 'Wide-arc melee with splash damage. Heals on ability kills. Damage: 20.',        ability: 'Q — Reaping Sweep: 360° sweep, heals 5 HP per target hit.',    super: 'E — Death\'s Toll: massive 40 dmg AoE sweep with lifesteal.',    how:  'Fight multiple enemies at once. Sweep into crowds for healing.' },
  fryingpan:    { title: 'Frying Pan',     what: 'Slow but punishing melee. High knockback and a 0.7s stun on ability. Damage: 20.', ability: 'Q — Pan Slam: heavy strike stuns for 40 frames.',              super: 'E — Mega Smack: shockwave stun for 55 dmg.',                     how:  'Patience is key. Land Pan Slam then follow up while they\'re stunned.' },
  broomstick:   { title: 'Broomstick',     what: 'Long-reach melee. Low damage but pushes enemies away. Damage: 10.',               ability: 'Q — Sweep: dash forward, huge push to enemy.',                 super: 'E — Tornado Spin: spin push that hits all directions.',           how:  'Keep pressure with the long reach. Sweep enemies off platforms.' },
  boxinggloves: { title: 'Boxing Gloves',  what: 'Very fast punches. Low damage per hit but combos build up. Damage: 7.',           ability: 'Q — Rapid Combo: 5-hit burst at close range.',                 super: 'E — KO Punch: massive single hit for 60 dmg.',                   how:  'Stay in close. The rapid combo ability is your main damage tool.' },
  peashooter:   { title: 'Pea Shooter',    what: 'Rapid-fire ranged weapon. Very low damage per pea (2-3). High fire rate.',        ability: 'Q — Pea Storm: 10 rapid shots.',                               super: 'E — Giant Pea: one huge pea for 40 dmg and big knockback.',      how:  'Annoy and whittle down enemies. Storm ability surprises up close.' },
  slingshot:    { title: 'Slingshot',      what: 'Ranged weapon with arc trajectory. Moderate damage (12-17). Slow fire rate.',     ability: 'Q — Power Stone: big stone with 60px splash for 24 dmg.',     super: 'E — Boulder Shot: massive arc shot for 55 dmg.',                 how:  'Aim ahead of moving targets. Arc makes it tricky but rewarding.' },
  paperairplane:{ title: 'Paper Airplane', what: 'Very slow curving projectile. Low damage (6-9) but unpredictable arc.',           ability: 'Q — Barrage: 4 airplanes at staggered angles.',               super: 'E — Paper Swarm: 8 planes in all directions.',                   how:  'Confuse enemies with the curving path. Barrage at close range.' },
};

const CLASS_DESCS = {
  none:      { title: 'No Class',   what: 'No class modifier. Full freedom of weapon choice. HP: 100.',                                                                    perk: null,                                                                                                                              how:  'Choose any weapon — pure skill matters.' },
  thor:      { title: 'Thor',       what: 'Hammer master. Slower movement but powerful strikes. Forces Hammer. HP: 115.',                                                   perk: 'Lightning Storm (≤20% HP, once): Summons 3 lightning bolts — 8 dmg + stun each. Activates automatically.',                        how:  'Tank hits to trigger the lightning perk when low. Then finish with your super.' },
  kratos:    { title: 'Kratos',     what: 'Axe specialist. More HP, builds rage when hit. Forces Axe. HP: 125.',                                                            perk: 'Spartan Rage (≤15% HP, once): Auto-heals to 30% HP and boosts damage by +30% for 5 seconds.',                                     how:  'Survive the threat threshold — let the rage save you. Strike hard in the buff window.' },
  ninja:     { title: 'Ninja',      what: 'Extremely fast sword fighter. Fragile but elusive. Forces Sword. HP: 80.',                                                       perk: 'Shadow Step (≤25% HP, once): 2 seconds of full invincibility and all cooldowns reset instantly.',                                  how:  'Use your speed advantage to dodge. The perk buys time to escape and counter.' },
  gunner:    { title: 'Gunner',     what: 'Dual-shot gunslinger — fires 2 bullets every shot. Forces Gun. HP: 95.',                                                         perk: 'Last Stand (≤20% HP, once): Fires 8 bullets in all directions for 3–5 dmg each.',                                                 how:  'Keep distance at all times. The burst perk punishes enemies who close in when you\'re low.' },
  archer:    { title: 'Archer',     what: 'Long-range bow fighter. Fast movement, low HP. Forces Bow. HP: 85.',                                                              perk: 'Back-Step (≤20% HP): Auto-dash backward and reset double jump when threatened.',                                                  how:  'Stay at range. The auto-backstep keeps you alive when pressured.' },
  paladin:   { title: 'Paladin',    what: 'Tanky shield warrior. Slower movement, high HP. Forces Shield. HP: 130.',                                                         perk: 'Holy Light (≤25% HP): AoE healing pulse — heals self 20 HP, deals 15 dmg to nearby enemies.',                                    how:  'Block and bash. The perk punishes opponents who rush you when you\'re low.' },
  berserker: { title: 'Berserker',  what: 'Any-weapon brawler. Strong and sturdy. HP: 120.',                                                                                 perk: 'Blood Frenzy (≤15% HP): 3 seconds of +50% damage and ×1.4 speed.',                                                              how:  'Play aggressively and stack risk — the frenzy perk rewards surviving near death.' },
};

// ============================================================
// HELPERS
// ============================================================
function randChoice(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
function lerp(a, b, t)   { return a + (b - a) * t; }
function clamp(v, mn, mx){ return Math.max(mn, Math.min(mx, v)); }
function dist(a, b)      { return Math.hypot(a.cx() - b.cx(), (a.y + a.h/2) - (b.y + b.h/2)); }

function dealDamage(attacker, target, dmg, kbForce, stunMult = 1.0, isSplash = false) {
  if (target.invincible > 0 || target.health <= 0) return;
  if (target.godmode) return; // godmode: no hitbox — all damage blocked
  let actualDmg = (attacker && attacker.dmgMult !== undefined) ? Math.max(1, Math.round(dmg * attacker.dmgMult)) : dmg;
  // Kratos rage bonus
  if (attacker && attacker.charClass === 'kratos' && attacker.rageStacks > 0) {
    actualDmg = Math.round(actualDmg * (1 + Math.min(attacker.rageStacks, 30) * 0.015));
  }
  // Kratos: Spartan Rage active — +30% damage
  if (attacker && attacker.spartanRageTimer > 0) {
    actualDmg = Math.round(actualDmg * 1.3);
  }
  // Map perk: power buff
  if (attacker && attacker._powerBuff > 0) actualDmg = Math.round(actualDmg * 1.35);
  // Curse: attacker has curse_weak — deal 50% damage
  if (attacker && attacker.curses && attacker.curses.some(c => c.type === 'curse_weak'))
    actualDmg = Math.max(1, Math.round(actualDmg * 0.5));
  // Paladin passive: 15% damage reduction on incoming hits
  if (target && target.charClass === 'paladin')
    actualDmg = Math.max(1, Math.floor(actualDmg * 0.85));
  // Kratos: target being hit builds rage stacks
  if (target && target.charClass === 'kratos') {
    target.rageStacks = Math.min(30, (target.rageStacks || 0) + 1);
  }
  let actualKb  = kbForce;
  // Curse: target has curse_fragile — 1.5× KB received
  if (target && target.curses && target.curses.some(c => c.type === 'curse_fragile'))
    actualKb = actualKb * 1.5;
  // Post-teleport critical hit window — boss attacks player: crit bonus
  if (attacker && attacker.isBoss && attacker.postTeleportCrit > 0) {
    if (Math.random() < 0.65) {
      actualDmg = Math.round(actualDmg * 2.2);
      spawnParticles(target.cx(), target.cy(), '#ff8800', 18);
      spawnParticles(target.cx(), target.cy(), '#ffff00', 10);
    }
  }
  // Post-teleport crit — player hits boss during crit window: double dmg + stun
  if (attacker && !attacker.isBoss && target && target.isBoss && target.postTeleportCrit > 0) {
    actualDmg = Math.round(actualDmg * 2.0);
    target.stunTimer = Math.max(target.stunTimer || 0, 60);
    target.postTeleportCrit = 0; // consume the crit window on first hit
    spawnParticles(target.cx(), target.cy(), '#ffff00', 20);
    spawnParticles(target.cx(), target.cy(), '#00ffff', 12);
  }
  if (target.shielding) {
    actualDmg = Math.max(1, Math.floor(dmg * 0.08));
    actualKb  = Math.floor(kbForce * 0.15);
    spawnParticles(target.cx(), target.cy(), '#88ddff', 6);
  } else {
    target.hurtTimer = 8;
    // Hitstop: strong hits feel punchy
    if (actualDmg >= 18 && !target.isBoss) hitStopFrames = Math.min(5, Math.floor(actualDmg / 12));
    else if (actualDmg >= 30 && target.isBoss) hitStopFrames = Math.min(3, Math.floor(actualDmg / 25));
  }
  // Boss modifier: deals double KB, takes half KB
  if (attacker.kbBonus) actualKb = Math.round(actualKb * attacker.kbBonus);
  if (target.kbResist)  actualKb = Math.round(actualKb * target.kbResist);

  // One-punch mode: training only — instantly kills on hit
  if (trainingMode && attacker && attacker.onePunchMode && !target.shielding) {
    actualDmg = target.health; // always lethal
  } else {
    // Class perk protection: can't be one-shot before their passive triggers
    if (!target.shielding && target.charClass !== 'none' && !target.classPerkUsed && target.health > 1) {
      actualDmg = Math.min(actualDmg, target.health - 1);
    }
  }
  target.health    = Math.max(0, target.health - actualDmg);
  target.invincible = 16;
  // True Form combo damage tracking
  if (attacker && attacker.isTrueForm && !target.isBoss) {
    attacker._comboDamage = (attacker._comboDamage || 0) + actualDmg;
  }
  const dir        = target.cx() > attacker.cx() ? 1 : -1;
  target.vx        = dir * actualKb;
  target.vy        = -actualKb * 0.55;
  if (currentArena && currentArena.isLowGravity)  target.vy = -actualKb * 0.25;
  if (currentArena && currentArena.isHeavyGravity) target.vy = -actualKb * 0.75;
  if (settings.screenShake) screenShake = Math.max(screenShake, target.shielding ? 3 : 9);
  // Sound feedback
  if (target.shielding) SoundManager.clang();
  else if (actualDmg >= 30) SoundManager.heavyHit();
  else SoundManager.hit();

  // Achievement tracking
  if (!target.shielding) {
    // Track damage taken by human players
    if (!target.isAI && !target.isBoss) _achStats.damageTaken += actualDmg;
    // Track ranged damage dealt by human players
    if (attacker && !attacker.isAI && attacker.weapon && attacker.weapon.type === 'ranged')
      _achStats.rangedDmg += actualDmg;
    // Consecutive hit tracking
    if (attacker && !attacker.isAI) {
      _achStats.consecutiveHits++;
      if (_achStats.consecutiveHits >= 5) unlockAchievement('combo_king');
    }
    if (target && !target.isAI) _achStats.consecutiveHits = 0; // enemy hit resets human combo
  }
  if (!target.shielding && gameMode === 'minigames' && currentChaosModifiers.has('explosive')) {
    spawnParticles(target.cx(), target.cy(), '#ff8800', 16);
    spawnParticles(target.cx(), target.cy(), '#ffdd44', 10);
    // Chain explosion: small AoE to nearby fighters
    for (const f of [...players, ...minions]) {
      if (f !== target && f !== attacker && f.health > 0 && dist(f, target) < 90) {
        dealDamage(attacker, f, Math.floor(actualDmg * 0.3), Math.floor(actualKb * 0.4), 1.0, true);
      }
    }
    SoundManager.explosion();
  }
  if (!target.shielding) {
    spawnParticles(target.cx(), target.cy(), target.color, 12);
    // Chance-based stun / ragdoll (not guaranteed; boss is harder to ragdoll)
    const ragdollChance = target.kbResist ? 0.30 * target.kbResist : 0.30;
    const MAX_STUN = 90; // cap at 1.5s
    if (actualKb >= 16 && Math.random() < ragdollChance) {
      target.ragdollTimer = Math.min(70, 26 + Math.floor(actualKb * 1.6));
      target.stunTimer    = Math.min(MAX_STUN, target.ragdollTimer + 16);
      // Assign angular momentum for ragdoll spin
      target.ragdollSpin  = dir * (0.12 + Math.random() * 0.10);
    } else if (actualKb >= 8 && Math.random() < 0.45) {
      target.stunTimer    = Math.min(MAX_STUN, 18 + Math.floor(actualKb * 1.1));
    }
  }
  // Super charges for the attacker; gun charges faster via superRateBonus
  // Super move itself doesn't charge the next super (prevents instant refill)
  if (!attacker.superActive) {
    const superRate = (attacker.superChargeRate || 1) * (attacker.weapon && attacker.weapon.superRateBonus || 1);
    const prev = attacker.superReady;
    attacker.superMeter = Math.min(100, attacker.superMeter + Math.floor(actualDmg * 0.70 * superRate));
    if (!prev && attacker.superMeter >= 100) {
      attacker.superReady      = true;
      attacker.superFlashTimer = 90;
    }
  }
  if (settings.dmgNumbers) damageTexts.push(new DamageText(target.cx(), target.y, actualDmg, target.shielding ? '#88ddff' : '#ffdd00'));
  // Weapon splash — axe (large) and gun (small) deal AoE to nearby targets
  if (!isSplash && !target.shielding && attacker.weapon && attacker.weapon.splashRange) {
    handleSplash(attacker, target, actualDmg);
  }
}

function handleSplash(attacker, hitTarget, originalDmg, splashX, splashY) {
  const w = attacker.weapon;
  if (!w || !w.splashRange) return;
  const sx  = splashX !== undefined ? splashX : hitTarget.cx();
  const sy  = splashY !== undefined ? splashY : (hitTarget.y + hitTarget.h / 2);
  const sdmg = Math.max(1, Math.floor(originalDmg * w.splashDmgPct));
  const skb  = Math.floor((w.kb || 8) * 0.35);
  const all  = [...players, ...minions, ...trainingDummies];
  for (const t of all) {
    if (t === hitTarget || t === attacker || t.health <= 0 || t.invincible > 0) continue;
    if (Math.hypot(t.cx() - sx, (t.y + t.h / 2) - sy) < w.splashRange) {
      dealDamage(attacker, t, sdmg, skb, 1.0, true);
      if (settings.particles) spawnParticles(t.cx(), t.cy(), w.color || '#ffaa44', 6);
    }
  }
}

function spawnParticles(x, y, color, count) {
  if (!settings.particles) return;
  for (let i = 0; i < count; i++) {
    const a = Math.random() * Math.PI * 2;
    const s = 1.5 + Math.random() * 5;
    particles.push({ x, y, vx: Math.cos(a)*s, vy: Math.sin(a)*s,
      color, size: 1.5 + Math.random()*2.5, life: 18 + Math.random()*22, maxLife: 40 });
  }
}

function spawnRing(x, y) {
  if (!settings.particles) return;
  for (let i = 0; i < 18; i++) {
    const a = (i / 18) * Math.PI * 2;
    particles.push({ x, y, vx: Math.cos(a)*7, vy: Math.sin(a)*3.5,
      color: '#ff8800', size: 3, life: 14, maxLife: 14 });
  }
}

function checkWeaponSparks() {
  if (!settings.particles) return;
  const all = [...players, ...minions, ...(trainingDummies || [])].filter(f => f.health > 0 && f._weaponTip && f._weaponTip.attacking);
  for (let i = 0; i < all.length; i++) {
    for (let j = i + 1; j < all.length; j++) {
      const a = all[i], b = all[j];
      if (!a._weaponTip || !b._weaponTip) continue;
      if ((a._weaponClashCd || 0) > 0 || (b._weaponClashCd || 0) > 0) continue;
      const dx = a._weaponTip.x - b._weaponTip.x;
      const dy = a._weaponTip.y - b._weaponTip.y;
      if (dx * dx + dy * dy < 28 * 28) {
        const mx = (a._weaponTip.x + b._weaponTip.x) / 2;
        const my = (a._weaponTip.y + b._weaponTip.y) / 2;
        for (let s = 0; s < 10; s++) {
          const sa = Math.random() * Math.PI * 2;
          const sv = 2 + Math.random() * 5;
          particles.push({ x: mx, y: my, vx: Math.cos(sa) * sv, vy: Math.sin(sa) * sv - 1,
            color: s < 5 ? '#ffffff' : '#ffdd44', size: 1.5 + Math.random() * 2, life: 8, maxLife: 8 });
        }
        screenShake = Math.max(screenShake, 3);
        // brief recoil on both fighters
        const nx = dx === 0 ? 1 : dx / Math.sqrt(dx * dx + dy * dy);
        a.vx += nx * 2; b.vx -= nx * 2;
        a._weaponClashCd = 20; b._weaponClashCd = 20;
        if (!a.isAI || !b.isAI) unlockAchievement('clash_master');
      }
    }
  }
  // decrement clash cooldowns
  [...players, ...minions, ...(trainingDummies || [])].forEach(f => { if (f._weaponClashCd > 0) f._weaponClashCd--; });
}

function _achCheckYetiDead()  { unlockAchievement('yeti_hunter'); }
function _achCheckBeastDead() { unlockAchievement('beast_tamer'); }

function spawnBullet(user, speed, color, overrideDmg = null) {
  SoundManager.shoot();
  const dmg = overrideDmg !== null ? overrideDmg : (user.weapon.damageFunc ? user.weapon.damageFunc() : user.weapon.damage);
  projectiles.push(new Projectile(
    user.cx() + user.facing * 12, user.y + 22,
    user.facing * speed, 0, user, dmg, color
  ));
  // Gunner class: fire a second bullet at slight angle
  if (user.charClass === 'gunner') {
    const dmg2 = user.weapon.damageFunc ? user.weapon.damageFunc() : user.weapon.damage;
    projectiles.push(new Projectile(
      user.cx() + user.facing * 12, user.y + 26,
      user.facing * speed * 0.92, -0.8, user, dmg2, color
    ));
  }
}

// ============================================================
// PROJECTILE
// ============================================================
class Projectile {
  constructor(x, y, vx, vy, owner, damage, color) {
    this.x = x; this.y = y;
    this.vx = vx; this.vy = vy;
    this.owner  = owner;
    this.damage = damage;
    this.color  = color;
    this.life   = 90;
    this.active = true;
  }
  update() {
    this.x += this.vx;
    this.y += this.vy;
    this.vy += 0.08;
    if (--this.life <= 0) { this.active = false; return; }
    // platform collision
    for (const pl of currentArena.platforms) {
      if (this.x > pl.x && this.x < pl.x+pl.w && this.y > pl.y && this.y < pl.y+pl.h) {
        this.active = false;
        spawnParticles(this.x, this.y, this.color, 4);
        return;
      }
    }
    // player collision
    for (const p of players) {
      if (p === this.owner || p.health <= 0) continue;
      // Block friendly fire unless survival competitive mode explicitly enables it
      const _survFF = gameMode === 'minigames' && minigameType === 'survival' && survivalFriendlyFire;
      if (!_survFF && gameMode === 'boss' && !this.owner.isBoss && !p.isBoss) continue;
      if (!_survFF && gameMode === 'minigames' && !this.owner.isBoss && !p.isBoss && !p.isAI) continue;
      if (this.x > p.x && this.x < p.x+p.w && this.y > p.y && this.y < p.y+p.h) {
        dealDamage(this.owner, p, this.damage, 7);
        handleSplash(this.owner, p, this.damage, this.x, this.y);
        this.active = false;
        spawnParticles(this.x, this.y, this.color, 6);
        return;
      }
    }
    // minion collision — player/non-minion projectiles can kill minions
    if (!this.owner.isMinion && !(this.owner instanceof Boss)) {
      for (const mn of minions) {
        if (mn.health <= 0) continue;
        if (this.x > mn.x && this.x < mn.x+mn.w && this.y > mn.y && this.y < mn.y+mn.h) {
          dealDamage(this.owner, mn, this.damage, 9);
          handleSplash(this.owner, mn, this.damage, this.x, this.y);
          this.active = false;
          spawnParticles(this.x, this.y, this.color, 6);
          return;
        }
      }
    }
    // training dummy collision
    if (!this.owner.isDummy) {
      for (const dum of trainingDummies) {
        if (dum.health <= 0) continue;
        if (this.x > dum.x && this.x < dum.x+dum.w && this.y > dum.y && this.y < dum.y+dum.h) {
          dealDamage(this.owner, dum, this.damage, 9);
          handleSplash(this.owner, dum, this.damage, this.x, this.y);
          this.active = false;
          spawnParticles(this.x, this.y, this.color, 6);
          return;
        }
      }
    }
  }
  draw() {
    ctx.save();
    ctx.shadowColor = this.color;
    ctx.shadowBlur  = 8;
    ctx.fillStyle   = this.color;
    ctx.beginPath();
    ctx.ellipse(this.x, this.y, 7, 3, 0, 0, Math.PI * 2);
    ctx.fill();
    // trail
    ctx.globalAlpha = 0.35;
    ctx.beginPath();
    ctx.ellipse(this.x - this.vx * 2.5, this.y, 5, 2, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}

// ============================================================
// DAMAGE TEXT
// ============================================================
class DamageText {
  constructor(x, y, amount, color) {
    this.x = x; this.y = y;
    this.amount = amount;
    this.color  = color;
    this.life   = 52;
    this.vx     = (Math.random() - 0.5) * 1.5;
  }
  update() { this.y -= 1.1; this.x += this.vx; this.life--; }
  draw() {
    const a = Math.min(1, this.life / 20);
    ctx.save();
    ctx.globalAlpha   = a;
    ctx.textAlign     = 'center';
    ctx.font          = `bold ${13 + Math.min(8, Math.floor(this.amount / 10))}px Arial`;
    ctx.strokeStyle   = 'rgba(0,0,0,0.85)';
    ctx.lineWidth     = 3;
    ctx.strokeText('-' + this.amount, this.x, this.y);
    ctx.fillStyle     = this.color;
    ctx.fillText('-'  + this.amount, this.x, this.y);
    ctx.restore();
  }
}

// ============================================================
// FIGHTER
// ============================================================
class Fighter {
  constructor(x, y, color, weaponKey, controls, isAI, aiDifficulty) {
    this.x = x; this.y = y;
    this.w = 22; this.h = 60;
    this.vx = 0; this.vy = 0;
    this.color       = color;
    this.weaponKey   = weaponKey;
    this.weapon      = WEAPONS[weaponKey];
    this.controls    = controls;
    this.isAI        = isAI || false;
    this.aiDiff      = aiDifficulty || 'medium';
    this.health      = 100;
    this.maxHealth   = 100;
    this.lives       = chosenLives;
    this.kills       = 0;
    this.onGround    = false;
    this.cooldown    = 0;
    this.cooldown2   = 0;
    this.abilityCooldown  = 0;
    this.abilityCooldown2 = 0;
    this.invincible  = 0;
    this.shielding   = false;
    this.spinning    = 0;
    this.facing      = 1;
    this.state       = 'idle';
    this.attackTimer = 0;
    this.attackDuration = 12;
    this.hurtTimer    = 0;
    this.stunTimer    = 0;   // frames unable to act (stars spin overhead)
    this.ragdollTimer = 0;   // frames of limp physics (flailing limbs)
    this.weaponHit    = false; // has weapon tip dealt damage this swing?
    this.boostCooldown   = 0;  // dash / super-jump cooldown
    this.shieldCooldown  = 0;  // 30-s boost-shield cooldown
    this.shieldHoldTimer = 0;  // frames S is held this activation
    this.canDoubleJump   = false; // allows one double-jump after leaving ground
    this.superMeter      = 0;    // 0-100 super charge
    this.superReady      = false; // true when super is fully charged
    this.superFlashTimer = 0;    // countdown for "SUPER!" text above player
    this.superChargeRate = 0.5;  // halved from default — boss overrides to 3
    this.charClass      = 'none';
    this.classSpeedMult = 1.0;
    this.rageStacks     = 0;
    this.godmode        = false;
    this.backstageHiding = false;
    this.classPerkUsed   = false;  // one-time class passive; resets each life
    this.spartanRageTimer = 0;     // Kratos: frames of +50% damage boost
    this.noCooldownsActive = false;
    this.lavaBurnTimer = 0;
    this.contactDamageCooldown = 0; // frames between passive weapon contact hits
    this.ragdollAngle    = 0;    // accumulated spin angle during ragdoll
    this.ragdollSpin     = 0;    // angular velocity (rad/frame) for ragdoll tumble
    this.animTimer    = 0;
    this._speedBuff   = 0;
    this._powerBuff   = 0;
    this._maxLives       = chosenLives; // for correct heart display
    this.onePunchMode    = false;       // training: kills anything in one hit
    this.swingHitTargets = new Set();   // tracks targets hit in current swing (multi-hit)
    this._lastTapLeft    = -999;        // frame of last left-key tap (double-tap dash)
    this._lastTapRight   = -999;
    this._lastTapUp      = -999;
    this.target          = null;
    this.aiState     = 'chase';
    this.aiReact     = 0;
    this.squashTimer   = 0;  // frames of landing squash animation
    this.aiNoHitTimer  = 0;  // frames bot has been attacking without landing a hit
    this._wanderDir    = 1;  // direction for wander state
    this._wanderTimer  = 0;  // frames left in wander state
    this.spawnX      = x;
    this.spawnY      = y;
    this.name        = '';
    this.playerNum   = 1;
  }

  cx() { return this.x + this.w / 2; }
  cy() { return this.y + this.h / 2; }

  respawn() {
    this.x  = this.spawnX;
    this.y  = this.spawnY - 60;
    this.vx = 0; this.vy = 0;
    this.health          = this.maxHealth; // always restore to full on respawn
    this.shielding       = false;
    this.spinning        = 0;
    this.ragdollTimer    = 0;
    this.stunTimer       = 0;
    this.weaponHit       = false;
    this.boostCooldown   = 0;
    this.shieldHoldTimer = 0;
    this.canDoubleJump   = false;
    // superMeter / superReady intentionally NOT reset — supers carry over between lives
    this.contactDamageCooldown = 0;
    this.ragdollAngle    = 0;
    this.ragdollSpin     = 0;
    this.lavaBurnTimer   = 0;
    this._speedBuff      = 0;
    this._powerBuff      = 0;
    this.classPerkUsed    = false;
    this.spartanRageTimer = 0;
    this.invincible      = 100;
    spawnParticles(this.cx(), this.cy(), this.color, 22);
  }

  // ---- UPDATE ----
  update() {
    if (this.cooldown > 0)         this.cooldown--;
    if (this.cooldown2 > 0)        this.cooldown2--;
    if (this.abilityCooldown > 0)  this.abilityCooldown--;
    if (this.abilityCooldown2 > 0) this.abilityCooldown2--;
    if (this.invincible > 0)      this.invincible--;
    if (this.attackTimer > 0)     this.attackTimer--;
    if (this.hurtTimer > 0)       this.hurtTimer--;
    if (this.stunTimer > 0)       this.stunTimer--;
    if (this.ragdollTimer > 0)    this.ragdollTimer--;
    if (this.spinning > 0)        this.spinning--;
    if (this.boostCooldown > 0)        this.boostCooldown--;
    if (this.shieldCooldown > 0)       this.shieldCooldown--;
    if (this.contactDamageCooldown > 0) this.contactDamageCooldown--;
    if (this.superFlashTimer > 0)      this.superFlashTimer--;
    if (this.spartanRageTimer > 0) this.spartanRageTimer--;
    this.animTimer++;

    if (this.noCooldownsActive) {
      this.cooldown = 0; this.cooldown2 = 0;
      this.abilityCooldown = 0; this.abilityCooldown2 = 0;
      this.shieldCooldown = 0; this.boostCooldown = 0;
    }

    // ---- RAGDOLL SPIN PHYSICS ----
    if (this.ragdollTimer > 0) {
      this.ragdollAngle += this.ragdollSpin;
      this.ragdollSpin  *= 0.97; // gradually decelerate spin
    } else {
      this.ragdollAngle = 0;
      this.ragdollSpin  = 0;
    }

    // ---- WEAPON TIP HITBOX (melee only) — hits ALL targets in range ----
    if (this.attackTimer > 0 && this.weapon.type === 'melee') {
      const tip = this.getWeaponTipPos();
      if (tip) {
        const hitPad = this.isAI ? 16 : 10;
        // All players in range (multi-target — not locked to primary target)
        for (const tgt of players) {
          if (tgt === this || !tgt || tgt.health <= 0) continue;
          // Block friendly fire unless survival competitive mode explicitly enables it
          const _survFFM = gameMode === 'minigames' && minigameType === 'survival' && survivalFriendlyFire;
          if (!_survFFM && gameMode === 'boss' && !this.isBoss && !tgt.isBoss) continue;
          if (!_survFFM && gameMode === 'minigames' && !this.isBoss && !tgt.isBoss && !tgt.isAI && !this.isAI) continue;
          if (!this.swingHitTargets.has(tgt) &&
              tip.x > tgt.x - hitPad && tip.x < tgt.x + tgt.w + hitPad &&
              tip.y > tgt.y - 8      && tip.y < tgt.y + tgt.h + 8) {
            dealDamage(this, tgt, this.weapon.damage, this.weapon.kb);
            this.swingHitTargets.add(tgt);
            this.weaponHit = true;
          }
        }
        // All minions in range (multi-hit — no break)
        if (!this.isMinion && !(this instanceof Boss)) {
          for (const mn of minions) {
            if (!this.swingHitTargets.has(mn) && mn.health > 0 &&
                tip.x > mn.x - 12 && tip.x < mn.x + mn.w + 12 &&
                tip.y > mn.y      && tip.y < mn.y + mn.h) {
              dealDamage(this, mn, this.weapon.damage, this.weapon.kb);
              this.swingHitTargets.add(mn);
              this.weaponHit = true;
            }
          }
        }
        // All training dummies in range (multi-hit — no break)
        if (!this.isDummy) {
          for (const dum of trainingDummies) {
            if (!this.swingHitTargets.has(dum) && dum.health > 0 &&
                tip.x > dum.x - 8 && tip.x < dum.x + dum.w + 8 &&
                tip.y > dum.y     && tip.y < dum.y + dum.h) {
              dealDamage(this, dum, this.weapon.damage, this.weapon.kb);
              this.swingHitTargets.add(dum);
              this.weaponHit = true;
            }
          }
        }
        // Weapon bounces off platform surfaces → sparks + recoil
        if (!this.weaponHit) {
          for (const pl of currentArena.platforms) {
            if (tip.x > pl.x && tip.x < pl.x + pl.w &&
                tip.y > pl.y && tip.y < pl.y + pl.h) {
              spawnParticles(tip.x, tip.y, '#ffee88', 5);
              spawnParticles(tip.x, tip.y, '#ffffff', 3);
              screenShake = Math.max(screenShake, 5);
              this.attackTimer = Math.min(this.attackTimer, 4); // cut swing short
              this.weaponHit   = true;
              break;
            }
          }
        }
      }
    }

    // ---- PASSIVE WEAPON CONTACT (melee only, while not mid-swing) ----
    if (this.weapon && this.weapon.type === 'melee' && this.attackTimer === 0 &&
        this.contactDamageCooldown === 0 && this.target) {
      const tgt = this.target;
      if (tgt.health > 0 && dist(this, tgt) < this.weapon.range * 0.62) {
        const movingToward = (tgt.cx() > this.cx() && this.vx > 0.8) ||
                             (tgt.cx() < this.cx() && this.vx < -0.8);
        if (movingToward) {
          const contactMult = this.weapon.contactDmgMult !== undefined ? this.weapon.contactDmgMult : 0.25;
          dealDamage(this, tgt, Math.max(1, Math.floor(this.weapon.damage * contactMult)),
                                Math.floor(this.weapon.kb * 0.35));
          this.contactDamageCooldown = 32;
        }
      }
    }

    if (this.isAI && this.target) this.updateAI();

      // ── Standard game physics ──
      const _chaosMoon = gameMode === 'minigames' && currentChaosModifiers.has('moon');
      const arenaGravity = _chaosMoon ? 0.18 : (currentArena.isLowGravity ? 0.28 : (currentArena.isHeavyGravity ? 0.95 : 0.65));
      const gravDir = (gameMode === 'trueform' && tfGravityInverted && !this.isBoss) ? -1 : 1;
      this.vy += arenaGravity * gravDir;
      this.x  += this.vx;
      this.y  += this.vy;
      const _chaosSlip = gameMode === 'minigames' && currentChaosModifiers.has('slippery');
      const friction = (this.onGround && (currentArena.isIcy || _chaosSlip)) ? 0.975 : (this.onGround ? 0.78 : 0.94);
      this.vx *= friction;
      this.vx  = clamp(this.vx, -13, 13);
      const vyMax = currentArena.isLowGravity ? 10 : 19;
      this.vy  = clamp(this.vy, -20, vyMax);
      this.onGround = false;
      // Inverted gravity ceiling bounce
      if (gameMode === 'trueform' && tfGravityInverted && !this.isBoss && this.y < 0) {
        this.y = 0; this.vy = Math.abs(this.vy) * 0.4;
      }
      for (const pl of currentArena.platforms) this.checkPlatform(pl);

    // Horizontal clamp — boss arena has hard walls; other arenas allow slight off-screen
    if (currentArena.isBossArena) {
      if (this.x < 0) {
        this.x = 0; this.vx = Math.abs(this.vx) * 0.25;
      }
      if (this.x + this.w > GAME_W) {
        this.x = GAME_W - this.w; this.vx = -Math.abs(this.vx) * 0.25;
      }
    } else {
      this.x = clamp(this.x, -80, GAME_W + 60);
    }

    // Death by falling / lava
    const dyY = currentArena.deathY;
    // Lava burn: damage + bounce when feet touch lava surface
    if (currentArena.hasLava && !this.isBoss && this.y + this.h > currentArena.lavaY && this.health > 0) {
      this.lavaBurnTimer++;
      if (this.vy > 0) {
        this.vy = -16; // lava bounce
        this.canDoubleJump = true; // refill double jump on lava bounce
      }
      this.vx *= 0.88;
      // Apply immediate damage on first contact and every 6 frames thereafter
      if (this.lavaBurnTimer === 1 || this.lavaBurnTimer % 6 === 0) {
        this.health = Math.max(0, this.health - 8);
        this.hurtTimer = 8;
        if (settings.particles) spawnParticles(this.cx(), this.cy(), '#ff6600', 8);
        if (settings.particles) spawnParticles(this.cx(), this.cy(), '#ffaa00', 5);
        if (settings.screenShake) screenShake = Math.max(screenShake, 4);
      }
    } else {
      this.lavaBurnTimer = 0;
    }
    // Hard death (fell off screen or health ran out from lava)
    if (this.y > dyY && this.health > 0) {
      if (this.isBoss) bossTeleport(this, true);
      else this.health = 0;
    }

    this.updateState();

    // Auto-face target
    if (this.target) this.facing = this.target.cx() > this.cx() ? 1 : -1;
    else if (Math.abs(this.vx) > 0.5) this.facing = this.vx > 0 ? 1 : -1;

    // godmode visual: keep HP bar full for clarity
    if (this.godmode) this.health = this.maxHealth;

    // Apply speed/power buffs from map perks
    if (this._speedBuff > 0) this._speedBuff--;
    if (this._powerBuff > 0) this._powerBuff--;

    // Tick down active curses
    if (this.curses && this.curses.length > 0) {
      this.curses = this.curses.filter(c => {
        c.timer--;
        return c.timer > 0;
      });
    }

    // ---- CLASS PASSIVE PERK (fires once per life at HP threshold) ----
    if (!this.classPerkUsed && this.charClass !== 'none' && this.health > 0 && this.target) {
      const pct = this.health / this.maxHealth;

      // THOR: Lightning Storm at ≤20% HP — 3 lightning strikes on opponent
      if (this.charClass === 'thor' && pct <= 0.20) {
        this.classPerkUsed = true;
        screenShake = Math.max(screenShake, 22);
        spawnParticles(this.cx(), this.cy(), '#ffff00', 28);
        spawnParticles(this.cx(), this.cy(), '#88ddff', 14);
        const _t = this.target;
        for (let _i = 0; _i < 3; _i++) {
          setTimeout(() => {
            if (!gameRunning || _t.health <= 0) return;
            spawnParticles(_t.cx(), _t.cy(), '#ffff00', 22);
            spawnParticles(_t.cx(), _t.cy(), '#ffffff', 12);
            if (settings.screenShake) screenShake = Math.max(screenShake, 12);
            _t.health = Math.max(0, _t.health - 8);
            _t.hurtTimer = 10;
            _t.stunTimer = Math.max(_t.stunTimer, 45);
            if (settings.dmgNumbers) damageTexts.push(new DamageText(_t.cx(), _t.y, 8, '#ffff00'));
          }, _i * 350);
        }
      }

      // KRATOS: Spartan Rage at ≤15% HP — heals to 30% max HP + 5s damage boost
      if (this.charClass === 'kratos' && pct <= 0.15) {
        this.classPerkUsed = true;
        const healTarget = Math.floor(this.maxHealth * 0.30);
        const healAmt    = Math.max(0, healTarget - this.health);
        this.health       = Math.max(this.health, healTarget);
        this.spartanRageTimer = 300;
        screenShake = Math.max(screenShake, 24);
        spawnParticles(this.cx(), this.cy(), '#ff4400', 30);
        spawnParticles(this.cx(), this.cy(), '#ff8800', 18);
        spawnParticles(this.cx(), this.cy(), '#ffffff',  8);
        if (healAmt > 0 && settings.dmgNumbers)
          damageTexts.push(new DamageText(this.cx(), this.y - 20, healAmt, '#44ff44'));
      }

      // NINJA: Shadow Step at ≤25% HP — 2s invincibility + all cooldowns reset
      if (this.charClass === 'ninja' && pct <= 0.25) {
        this.classPerkUsed = true;
        this.invincible = 120;
        this.cooldown = 0; this.abilityCooldown = 0; this.shieldCooldown = 0; this.boostCooldown = 0;
        screenShake = Math.max(screenShake, 14);
        spawnParticles(this.cx(), this.cy(), '#44ff88', 30);
        spawnParticles(this.cx(), this.cy(), '#ffffff', 14);
      }

      // GUNNER: Last Stand at ≤20% HP — 8 bullets burst in all directions
      if (this.charClass === 'gunner' && pct <= 0.20) {
        this.classPerkUsed = true;
        screenShake = Math.max(screenShake, 26);
        spawnParticles(this.cx(), this.cy(), '#ff6600', 28);
        spawnParticles(this.cx(), this.cy(), '#ffaa00', 14);
        for (let _j = 0; _j < 8; _j++) {
          const _ang = (_j / 8) * Math.PI * 2;
          const _spd = 11 + Math.random() * 3;
          const _dmg = Math.floor(Math.random() * 3) + 3;
          projectiles.push(new Projectile(
            this.cx(), this.cy(),
            Math.cos(_ang) * _spd, Math.sin(_ang) * _spd,
            this, _dmg, '#ff4400'
          ));
        }
      }

      // ARCHER: Back-Step at ≤20% HP — auto-dash backward + reset double jump
      if (this.charClass === 'archer' && pct <= 0.20 && this.onGround) {
        this.classPerkUsed = true;
        this.vx = -this.facing * 20;
        this.canDoubleJump = true;
        spawnParticles(this.cx(), this.cy(), '#aad47a', 16);
      }

      // PALADIN: Holy Light at ≤25% HP — AoE heal pulse
      if (this.charClass === 'paladin' && pct <= 0.25) {
        this.classPerkUsed = true;
        this.health = Math.min(this.maxHealth, this.health + 20);
        screenShake = Math.max(screenShake, 14);
        spawnParticles(this.cx(), this.cy(), '#ffffaa', 28);
        spawnParticles(this.cx(), this.cy(), '#88aaff', 14);
        for (const p of players) {
          if (p === this || p.health <= 0) continue;
          if (dist(this, p) < 130) dealDamage(this, p, 15, 8);
        }
      }

      // BERSERKER: Blood Frenzy at ≤15% HP — 3s damage boost + speed boost
      if (this.charClass === 'berserker' && pct <= 0.15) {
        this.classPerkUsed = true;
        this._powerBuff   = 180; // 3s damage boost via existing power buff
        this._speedBuff   = 180; // also speed boost
        screenShake = Math.max(screenShake, 20);
        spawnParticles(this.cx(), this.cy(), '#ff2200', 24);
        spawnParticles(this.cx(), this.cy(), '#880000', 12);
      }
    }
  }

  checkPlatform(pl) {
    if (pl.isFloorDisabled) return;
    // Broad-phase: skip if no overlap at all
    if (this.x + this.w <= pl.x || this.x >= pl.x + pl.w ||
        this.y + this.h <= pl.y || this.y >= pl.y + pl.h) return;

    // Penetration depth on each side
    const dTop    = (this.y + this.h) - pl.y;      // player bottom into platform top
    const dBottom = (pl.y + pl.h)    - this.y;     // player top  into platform bottom
    const dLeft   = (this.x + this.w) - pl.x;      // player right into platform left
    const dRight  = (pl.x + pl.w)    - this.x;     // player left  into platform right

    const minPen = Math.min(dTop, dBottom, dLeft, dRight);

    if (minPen === dTop && this.vy >= 0) {
      // Fell onto top surface
      const landVy = this.vy;
      this.y           = pl.y - this.h;
      this.vy          = 0;
      this.onGround    = true;
      this.canDoubleJump = false; // reset on landing; re-enabled by jumping
      // Bouncy platform sink on landing
      if (pl.isBouncy && landVy > 1) {
        pl.sinkOffset = (pl.sinkOffset || 0) + Math.min(landVy * 0.5, 22);
      }
      // Landing squash animation trigger
      if (!this.isBoss && landVy > 5) this.squashTimer = 4;
      // Landing dust — harder landing = more particles
      if (settings.landingDust && landVy > 4) {
        spawnParticles(this.cx(), pl.y, 'rgba(200,200,200,0.9)', Math.min(14, Math.floor(landVy * 1.2)));
        if (!this.isAI && landVy > 6) SoundManager.land();
      }
      // Stop ragdoll spin on landing
      if (this.ragdollTimer > 0 && landVy > 2) {
        spawnParticles(this.cx(), pl.y, this.color, 10);
        this.ragdollSpin = 0;
      }
    } else if (minPen === dBottom && this.vy <= 0) {
      // Bumped head on underside
      this.y  = pl.y + pl.h;
      this.vy = Math.abs(this.vy) * 0.1; // small bounce so gravity takes over
    } else if (minPen === dLeft) {
      // Hit right face of platform (player moving right)
      this.x  = pl.x - this.w;
      this.vx = Math.min(this.vx, 0);
    } else if (minPen === dRight) {
      // Hit left face of platform (player moving left)
      this.x  = pl.x + pl.w;
      this.vx = Math.max(this.vx, 0);
    }
  }

  updateState() {
    if (this.ragdollTimer > 0)         this.state = 'ragdoll';
    else if (this.hurtTimer > 0)       this.state = 'hurt';
    else if (this.stunTimer > 0)       this.state = 'stunned';
    else if (this.attackTimer > 0)     this.state = 'attacking';
    else if (this.shielding)           this.state = 'shielding';
    else if (!this.onGround)           this.state = this.vy < 0 ? 'jumping' : 'falling';
    else if (Math.abs(this.vx) > 0.7)  this.state = 'walking';
    else                               this.state = 'idle';
  }

  // Returns weapon-tip world position during a melee swing, or null if not attacking.
  getWeaponTipPos() {
    if (this.attackTimer <= 0) return null;
    const cx         = this.cx();
    const shoulderY  = this.y + 24; // matches draw() layout: headR+1+headR+1+4
    const armLen     = 20;
    const atkP       = 1 - this.attackTimer / this.attackDuration;
    const ang = this.facing > 0
      ? lerp(-0.45, 1.1,          atkP)
      : lerp(Math.PI + 0.45, Math.PI - 1.1, atkP);
    const tipLens = { sword: 26, hammer: 30, axe: 22, spear: 38, gauntlet: 24 };
    const wLen    = tipLens[this.weaponKey] || 22;
    const reach   = armLen + wLen;
    return {
      x: cx         + Math.cos(ang) * reach,
      y: shoulderY  + Math.sin(ang) * reach
    };
  }

  // ---- ATTACK ----
  attack(target) {
    if (this.backstageHiding) return;
    if (this.cooldown > 0 || this.health <= 0 || this.stunTimer > 0 || this.ragdollTimer > 0) return;
    if (this.weapon.type === 'melee') {
      // Damage is delivered via weapon-tip hitbox in update() — just start the swing
      if (dist(this, target) < this.weapon.range * 1.4) {
        this.weaponHit = false;
        this.swingHitTargets.clear(); // reset multi-target tracking
        if (!this.isAI) SoundManager.swing();
      }
    } else {
      if (!this.isAI) SoundManager.shoot();
      const bSpd = this.weapon.bulletSpeed || 13;
      const bClr = this.weapon.bulletColor || '#ffdd00';
      const bVy  = this.weapon.bulletVy  || 0;
      const dmg  = this.weapon.damageFunc ? this.weapon.damageFunc() : this.weapon.damage;
      projectiles.push(new Projectile(
        this.cx() + this.facing * 12, this.y + 22,
        this.facing * bSpd, bVy, this, dmg, bClr
      ));
      // Gunner class: fire a second bullet
      if (this.charClass === 'gunner') {
        const dmg2 = this.weapon.damageFunc ? this.weapon.damageFunc() : this.weapon.damage;
        projectiles.push(new Projectile(this.cx() + this.facing * 12, this.y + 28, this.facing * bSpd * 0.92, bVy - 0.8, this, dmg2, bClr));
      }
    }
    this.cooldown    = this.weapon.cooldown;
    this.attackTimer = this.attackDuration;
  }

  ability(target) {
    if (this.backstageHiding) return;
    if (this.abilityCooldown > 0 || this.health <= 0 || this.stunTimer > 0 || this.ragdollTimer > 0) return;
    this.weapon.ability(this, target);
    this.abilityCooldown = this.weapon.abilityCooldown;
    this.attackTimer     = this.attackDuration * 2;
    abilityFlashTimer = 14; abilityFlashPlayer = this;
  }

  // Dedicated super / ultimate activation (separate button from Q)
  useSuper(target) {
    if (this.health <= 0 || this.stunTimer > 0 || this.ragdollTimer > 0) return;
    if (!this.superReady) return;
    this.activateSuper(target);
  }

  activateSuper(target) {
    // Boss heals 5% of max HP (no max HP increase); players gain +20 max HP and heal 20
    if (this.isBoss) {
      // Boss no longer heals on super — super is purely offensive
    } else {
      this.maxHealth = Math.min(200, this.maxHealth + 20);
      this.health    = Math.min(this.maxHealth, this.health + 20);
    }
    this.superMeter  = 0;
    this.superReady  = false;
    this.superActive = true; // block super-meter charging during this move
    setTimeout(() => { this.superActive = false; }, 2000); // clear after 2s
    screenShake      = Math.max(screenShake, 24);
    SoundManager.superActivate();
    if (!this.isAI && !this.isBoss) { _achStats.superCount++; if (_achStats.superCount >= 10) unlockAchievement('super_saver'); }
    spawnParticles(this.cx(), this.cy(), this.color,   36);
    spawnParticles(this.cx(), this.cy(), '#ffffff',    18);
    spawnParticles(this.cx(), this.cy(), '#ffd700',    12);
    this.attackTimer = this.attackDuration * 3;
    this.weaponHit   = false;
    if (!this.isBoss) this.invincible = Math.max(this.invincible, 90); // 1.5s i-frames on super
    const superMoves = {
      sword:  () => {
        this.vx = this.facing * 24;
        if (dist(this, target) < 210) dealDamage(this, target, 60, 30);
      },
      hammer: () => {
        screenShake = Math.max(screenShake, 48);
        spawnRing(this.cx(), this.y + this.h);
        spawnRing(this.cx(), this.y + this.h);
        if (dist(this, target) < 230) dealDamage(this, target, 58, 38);
      },
      gun: () => {
        for (let i = 0; i < 14; i++) {
          setTimeout(() => {
            if (!gameRunning || this.health <= 0) return;
            spawnBullet(this, 14 + (Math.random() - 0.5) * 4, '#ff8800', Math.floor(Math.random() * 4) + 9);
          }, i * 50);
        }
      },
      axe:   () => {
        this.spinning = 75;
        if (dist(this, target) < 175) dealDamage(this, target, 52, 26);
      },
      spear: () => {
        this.vx = this.facing * 22;
        this.vy = -10;
        if (dist(this, target) < 230) dealDamage(this, target, 50, 24);
      },
      gauntlet: () => {
        screenShake = Math.max(screenShake, 60);
        spawnRing(this.cx(), this.cy());
        spawnRing(this.cx(), this.cy());
        spawnRing(this.cx(), this.cy());
        for (const p of players) {
          if (p === this || p.health <= 0) continue;
          if (dist(this, p) < 280) dealDamage(this, p, 15, 50);
        }
        for (const d of trainingDummies) {
          if (d.health <= 0) continue;
          if (dist(this, d) < 280) dealDamage(this, d, 15, 50);
        }
        if (this.isBoss) this.postSpecialPause = 90; // 1.5s pause after super
      }
    };
    (superMoves[this.weaponKey] || superMoves.sword)();
  }

  // ---- AI ----

  // Returns true if moving in 'dir' (±1) would walk the AI off a platform
  // with no safe ground beneath within the next 40px.
  isEdgeDanger(dir) {
    if (!this.onGround) return false;
    const lookX = dir > 0 ? this.x + this.w + 36 : this.x - 36;
    const footY = this.y + this.h;
    for (const pl of currentArena.platforms) {
      if (pl.isFloorDisabled) continue;
      if (lookX > pl.x && lookX < pl.x + pl.w &&
          footY <= pl.y + 22 && footY >= pl.y - 8) return false; // ground ahead
    }
    // On lava map stepping off any platform is immediately fatal — always dangerous
    if (currentArena.hasLava) return true;
    // Normal maps: only flag as dangerous close to the kill boundary
    return this.y + this.h < GAME_H + 40;
  }

  // Finds any reachable platform above (for jumping pathing).
  platformAbove() {
    for (const pl of currentArena.platforms) {
      if (pl.y < this.y - 20 &&
          pl.x < this.cx() + 130 && pl.x + pl.w > this.cx() - 130) return pl;
    }
    return null;
  }

  updateAI() {
    if (this.aiReact > 0) { this.aiReact--; return; }
    if (this.ragdollTimer > 0 || this.stunTimer > 0) return;

    // ---- STUCK DETECTION: if attacking with no hits for 1s, wander away ----
    if (this.isAI && this.state === 'attacking') {
      if (this.weaponHit) {
        this.aiNoHitTimer = 0;
      } else {
        this.aiNoHitTimer++;
        if (this.aiNoHitTimer > 60) {
          this.aiNoHitTimer = 0;
          this.aiState = 'chase';
          this._wanderDir = (Math.random() < 0.5 ? -1 : 1);
          this._wanderTimer = 45;
        }
      }
    } else {
      this.aiNoHitTimer = 0;
    }
    // ---- WANDER STATE: move in random direction briefly ----
    if (this._wanderTimer > 0) {
      this._wanderTimer--;
      const spd0 = this.aiDiff === 'easy' ? 2.6 : this.aiDiff === 'medium' ? 4.2 : 5.8;
      if (!this.isEdgeDanger(this._wanderDir)) {
        this.vx = this._wanderDir * spd0 * 1.2;
      } else {
        this._wanderDir = -this._wanderDir; // flip if edge
      }
      if (this.onGround && Math.random() < 0.04) this.vy = -18;
      return;
    }

    // ---- KOTH: bots rush the zone; only fight if an enemy is also in the zone ----
    if (gameMode === 'minigames' && minigameType === 'koth' && !this.isBoss) {
      const kothSpd     = this.aiDiff === 'easy' ? 2.6 : this.aiDiff === 'medium' ? 4.2 : 5.8;
      const kothAtkFreq = this.aiDiff === 'easy' ? 0.04 : this.aiDiff === 'medium' ? 0.16 : 0.28;
      const kothAbiFreq = this.aiDiff === 'easy' ? 0.004 : this.aiDiff === 'medium' ? 0.022 : 0.04;
      const zoneLeft  = kothZoneX - 100;
      const zoneRight = kothZoneX + 100;
      const selfInZone = this.cx() > zoneLeft && this.cx() < zoneRight && this.onGround;
      const enemyInZone = players.some(p => p !== this && !p.isBoss && p.health > 0 &&
                                            p.cx() > zoneLeft && p.cx() < zoneRight && p.onGround);
      if (!selfInZone) {
        // Rush the zone: move directly toward kothZoneX, no hesitation
        const kdir = kothZoneX > this.cx() ? 1 : -1;
        this.vx = kdir * kothSpd * 1.1;
        // Jump onto the zone if it's above current position or there's a platform in the way
        if (this.onGround && Math.random() < 0.05) this.vy = -18;
        else if (this.canDoubleJump && this.vy > 1 && Math.random() < 0.08) { this.vy = -14; this.canDoubleJump = false; }
        return; // never leave zone logic — skip all other AI this frame
      }
      // Inside zone: attack any enemy also in zone, otherwise hold ground
      if (enemyInZone && t && t.cx() > zoneLeft && t.cx() < zoneRight) {
        const zd = Math.abs(t.cx() - this.cx());
        if (zd < this.weapon.range + 20) {
          this.vx *= 0.72;
          if (Math.random() < kothAtkFreq) this.attack(t);
          if (Math.random() < kothAbiFreq) this.ability(t);
          if (this.superReady && Math.random() < 0.12) this.useSuper(t);
        } else {
          this.vx = (t.cx() > this.cx() ? 1 : -1) * kothSpd;
        }
      } else {
        // No enemy in zone — hold center, small idle drift
        const centerDiff = kothZoneX - this.cx();
        this.vx = Math.abs(centerDiff) > 20 ? Math.sign(centerDiff) * kothSpd * 0.5 : 0;
      }
      return; // KotH bots never leave the zone
    }

    // Chaos mode: all entities attack nearest other entity
    if (trainingChaosMode && trainingMode) {
      const allEntities = [...players, ...trainingDummies, ...minions];
      let nearDist = Infinity, nearEnt = null;
      for (const e of allEntities) {
        if (e === this || e.health <= 0) continue;
        const dd = dist(this, e);
        if (dd < nearDist) { nearDist = dd; nearEnt = e; }
      }
      if (nearEnt) this.target = nearEnt;
    }

    const t  = this.target;
    const dx = t.cx() - this.cx();
    const d  = Math.abs(dx);
    const dir = dx > 0 ? 1 : -1;

    const spd     = this.aiDiff === 'easy' ? 2.6 : this.aiDiff === 'medium' ? 4.2 : 5.8;
    const atkFreq = this.aiDiff === 'easy' ? 0.04 : this.aiDiff === 'medium' ? 0.16 : 0.28;
    const abiFreq = this.aiDiff === 'easy' ? 0.004 : this.aiDiff === 'medium' ? 0.022 : 0.04;

    // ---- RUINS: prioritize artifacts unless player is very close ----
    if (currentArenaKey === 'ruins' && mapItems && mapItems.length > 0 && !this.isBoss) {
      const uncollected = mapItems.filter(it => !it.collected);
      if (uncollected.length > 0) {
        const nearest = uncollected.reduce((best, it) => {
          const da = Math.hypot(it.x - this.cx(), it.y - this.cy());
          const db = Math.hypot(best.x - this.cx(), best.y - this.cy());
          return da < db ? it : best;
        });
        const da = Math.hypot(nearest.x - this.cx(), nearest.y - this.cy());
        if (d > 200 || da < 80) {
          const adir = nearest.x > this.cx() ? 1 : -1;
          if (!this.isEdgeDanger(adir)) this.vx = adir * spd;
          if (this.onGround && nearest.y < this.y - 30 && Math.random() < 0.05) this.vy = -18;
          return;
        }
      }
    }

    // ---- DANGER: lava / death zone ----
    if (currentArena.hasLava) {
      const distToLava = currentArena.lavaY - (this.y + this.h);
      if (distToLava < 130) {
        if (this.onGround && distToLava < 85) {
          this.vy = -20; // lava escape jump
          this.vx = this.cx() < GAME_W / 2 ? spd * 2.2 : -spd * 2.2;
        } else if (!this.onGround && distToLava < 110) {
          let nearestX = GAME_W / 2;
          let nearestDist = Infinity;
          for (const pl of currentArena.platforms) {
            if (pl.y < this.y) {
              const pdx2 = Math.abs(pl.x + pl.w / 2 - this.cx());
              if (pdx2 < nearestDist) { nearestDist = pdx2; nearestX = pl.x + pl.w / 2; }
            }
          }
          this.vx = nearestX > this.cx() ? spd * 2.2 : -spd * 2.2;
        }
        return;
      }
    }

    // ---- DANGER: boss void floor (when boss floor hazard is void) ----
    if (currentArena.isBossArena && bossFloorState === 'hazard' && bossFloorType === 'void') {
      const floorPl = currentArena.platforms.find(p => p.isFloor);
      if (floorPl && floorPl.isFloorDisabled && this.y + this.h > GAME_H - 140) {
        // Void floor active — flee upward toward nearest platform
        let nearestX = GAME_W / 2, nearestY = 0, nearestDist = Infinity;
        for (const pl of currentArena.platforms) {
          if (pl.isFloor) continue;
          const pdx3 = Math.abs(pl.x + pl.w / 2 - this.cx());
          if (pdx3 < nearestDist) { nearestDist = pdx3; nearestX = pl.x + pl.w / 2; nearestY = pl.y; }
        }
        this.vx = nearestX > this.cx() ? spd * 1.8 : -spd * 1.8;
        if (this.onGround && Math.random() < 0.25) this.vy = -20;
        else if (this.canDoubleJump && this.vy > 0 && Math.random() < 0.35) { this.vy = -17; this.canDoubleJump = false; }
        return;
      }
    }

    // ---- DANGER: map screen edges (avoid falling off) ----
    const nearLeftEdge  = this.x < 100 && !this.isBoss;
    const nearRightEdge = this.x + this.w > GAME_W - 100 && !this.isBoss;
    if (this.onGround) {
      if (nearLeftEdge  && dir < 0) { this.vx = 0; if (Math.random() < 0.25) this.vy = -18; return; }
      if (nearRightEdge && dir > 0) { this.vx = 0; if (Math.random() < 0.25) this.vy = -18; return; }
    }
    // In-air edge danger: brake horizontal velocity when flying toward screen edge
    if (!this.onGround && !this.isBoss) {
      if (nearLeftEdge  && this.vx < 0) this.vx *= 0.6;
      if (nearRightEdge && this.vx > 0) this.vx *= 0.6;
    }

    // Use super immediately when health is critical and super is ready
    if (this.health < 40 && this.superReady) { this.useSuper(t); }

    // Better platform recovery — steer toward nearest platform when falling off-screen
    if (this.y > 350 && !this.onGround) {
      let nearestX = GAME_W / 2;
      let nearestDist = Infinity;
      for (const pl of currentArena.platforms) {
        if (pl.isFloorDisabled) continue;
        const pdx = Math.abs(pl.x + pl.w / 2 - this.cx());
        if (pdx < nearestDist) { nearestDist = pdx; nearestX = pl.x + pl.w / 2; }
      }
      this.vx = nearestX > this.cx() ? spd * 1.8 : -spd * 1.8;
    }

    // ---- STATE MACHINE ----
    if (this.health < 30 && d > 100 && Math.random() < 0.012) this.aiState = 'evade';
    else if (d < this.weapon.range + 20) this.aiState = 'attack';
    else                                  this.aiState = 'chase';

    // React to incoming attack (medium+): raise shield — respects cooldown
    if (this.aiDiff !== 'easy' && t.attackTimer > 0 && d < 110 &&
        this.shieldCooldown === 0 && Math.random() < 0.22) {
      this.shielding = true;
      this.shieldCooldown = SHIELD_CD;
      setTimeout(() => { this.shielding = false; }, 320);
    }

    // ---- EDGE CHECK ----
    const edgeDanger  = this.isEdgeDanger(dir);
    // Safe to chase: no edge danger, OR bot is airborne but not near screen edge
    const safeToChase = !edgeDanger || (!this.onGround && !nearLeftEdge && !nearRightEdge);

    switch (this.aiState) {
      case 'chase':
        if (safeToChase) {
          this.vx = dir * spd;
        } else {
          // At cliff edge — stop and try to reach target via a platform above
          this.vx = 0;
          if (this.onGround && this.platformAbove() && Math.random() < 0.05) this.vy = -18;
        }
        // Jump to chase target on a higher platform — extra conservative on lava
        if (this.onGround && t.y + t.h < this.y - 50 && Math.random() < 0.04 &&
            !edgeDanger && (!currentArena.hasLava || this.platformAbove()))
          this.vy = -18;
        // Jump to chase airborne target more often — only if not near screen edge
        if (this.onGround && !t.onGround && Math.random() < 0.06 && !edgeDanger && !nearLeftEdge && !nearRightEdge)
          this.vy = -18;
        break;

      case 'attack':
        this.vx *= 0.72;
        // 8% chance: bot faces wrong way briefly (missed swing)
        if (Math.random() < 0.08) this.facing = -this.facing;
        if (Math.random() < atkFreq) this.attack(t);
        if (Math.random() < abiFreq) this.ability(t);
        if (this.superReady && Math.random() < 0.12) this.useSuper(t);
        // Small hop to stay on target's level
        if (this.onGround && t.y + t.h < this.y - 30 && !edgeDanger && Math.random() < 0.02)
          this.vy = -16;
        break;

      case 'evade': {
        const evadeDir  = -dir;
        const evadeEdge = this.isEdgeDanger(evadeDir);
        if (!evadeEdge) {
          this.vx = evadeDir * spd;
        } else {
          // Trapped — fight back instead of walking off
          if (Math.random() < atkFreq * 0.8) this.attack(t);
          this.vx = 0;
        }
        if (this.onGround && !evadeEdge && Math.random() < 0.03) this.vy = -18;
        if (Math.random() < atkFreq * 0.35) this.attack(t);
        break;
      }
    }

    // Dodge bullets (medium+) — 1.3x jump
    if (this.aiDiff !== 'easy') {
      for (const pr of projectiles) {
        if (pr.owner !== this) {
          const pd = Math.hypot(pr.x - this.cx(), pr.y - this.cy());
          if (pd < 130 && !this.isEdgeDanger(pr.vx > 0 ? -1 : 1) && Math.random() < 0.30) {
            if (this.onGround) this.vy = -17;
            else if (this.canDoubleJump) { this.vy = -13; this.canDoubleJump = false; }
          }
        }
      }
    }

    // Reaction lag — more human-like with wider random range
    if (this.aiDiff === 'easy'   && Math.random() < 0.10) this.aiReact = 8 + Math.floor(Math.random() * 6);  // 8-13
    if (this.aiDiff === 'medium' && Math.random() < 0.04) this.aiReact = 4 + Math.floor(Math.random() * 5);  // 4-8
    if (this.aiDiff === 'hard'   && Math.random() < 0.02) this.aiReact = 2 + Math.floor(Math.random() * 3);  // 2-4
  }

  // ---- DRAW ----
  draw() {
    if (this.backstageHiding) return;
    if (this.health <= 0 && !this.isBoss) return; // MJS ragdolls handle dead fighter visuals

    ctx.save();

    // Scale transform for oversized fighters (e.g., boss)
    if (this.drawScale && this.drawScale !== 1) {
      const pivX = this.cx();
      const pivY = this.y;
      ctx.translate(pivX, pivY);
      ctx.scale(this.drawScale, this.drawScale);
      ctx.translate(-pivX, -pivY);
    }

    // Invincibility blink
    if (this.invincible > 0 && Math.floor(this.invincible / 5) % 2 === 1) {
      ctx.globalAlpha = 0.35;
    }

    const cx = this.cx();
    const ty = this.y;
    const f  = this.facing;
    const s  = this.state;
    const t  = this.animTimer;

    // ---- Scripted animation ----

    // Boss phase aura glow (phase 2+)
    if (this.isBoss && settings.bossAura) {
      const bPhase = this.getPhase ? this.getPhase() : 0;
      if (bPhase >= 2) {
        ctx.save();
        const pulse = 0.10 + Math.sin(t * 0.09) * 0.05;
        ctx.globalAlpha = pulse;
        ctx.fillStyle   = bPhase >= 3 ? '#ff2200' : '#9900cc';
        ctx.shadowColor = bPhase >= 3 ? '#ff6600' : '#cc00ff';
        ctx.shadowBlur  = 40;
        ctx.beginPath();
        ctx.ellipse(cx, ty + this.h * 0.5, this.w * 2.0, this.h * 0.75, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
    }

    // Ragdoll body rotation — use accumulated angular momentum
    if (this.ragdollTimer > 0) {
      ctx.translate(cx, ty + this.h * 0.45);
      ctx.rotate(this.ragdollAngle);
      ctx.translate(-cx, -(ty + this.h * 0.45));
    }

    // Squash / stretch / idle breath
    let animScaleX = 1, animScaleY = 1, animOffY = 0;
    if (!this.isBoss) {
      if (this.squashTimer > 0) {
        // Landing squash: compress vertically
        const sq = this.squashTimer / 4;
        animScaleX = 1 + sq * 0.15;
        animScaleY = 1 - sq * 0.15;
        this.squashTimer--;
      } else if (!this.onGround && this.vy < -8) {
        // Jump stretch: elongate vertically
        animScaleY = 1.12; animScaleX = 0.92;
      } else if (this.onGround && s === 'idle') {
        // Idle breath
        animOffY = Math.sin(t * 0.04) * 1;
      }
      if (animScaleX !== 1 || animScaleY !== 1) {
        ctx.translate(cx, ty + this.h);
        ctx.scale(animScaleX, animScaleY);
        ctx.translate(-cx, -(ty + this.h));
      }
    }

    const headR     = 9;
    const headCY    = ty + headR + 1 + animOffY;
    const neckY     = headCY + headR + 1;
    const shoulderY = neckY + 4;
    const hipY      = shoulderY + 24;
    const armLen    = 20;
    const legLen    = 22;

    ctx.strokeStyle = this.color;
    ctx.lineWidth   = 2.5;
    ctx.lineCap     = 'round';
    ctx.lineJoin    = 'round';

    // HEAD
    ctx.beginPath();
    ctx.arc(cx, headCY, headR, 0, Math.PI * 2);
    ctx.fillStyle = this.color;
    ctx.fill();

    // Eyes
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(cx + f * 3, headCY - 2, 2.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = s === 'hurt' ? '#ff0000' : '#111';
    ctx.beginPath();
    ctx.arc(cx + f * 4.2, headCY - 2, 1.3, 0, Math.PI * 2);
    ctx.fill();

    // Expression (mouth)
    ctx.strokeStyle = s === 'hurt' || s === 'attacking' ? '#ff3333' : 'rgba(0,0,0,0.6)';
    ctx.lineWidth   = 1.2;
    ctx.beginPath();
    if (s === 'hurt') {
      ctx.arc(cx + f * 3, headCY + 3, 3, 0, Math.PI);
    } else {
      ctx.arc(cx + f * 3, headCY + 2, 3, 0, Math.PI, true);
    }
    ctx.stroke();

    // ACCESSORIES (hat, cape)
    drawAccessory(this, cx, headCY, shoulderY, hipY, f, headR);

    // BODY
    ctx.strokeStyle = this.color;
    ctx.lineWidth   = 2.5;
    ctx.beginPath();
    ctx.moveTo(cx, neckY);
    ctx.lineTo(cx, hipY);
    ctx.stroke();

    // ARM ANGLES
    const atkProgress = this.attackDuration > 0 ? 1 - this.attackTimer / this.attackDuration : 0;
    let rAng, lAng;

    if (s === 'ragdoll') {
      // Limbs trail behind the body's angular momentum
      const flail = Math.sin(t * 0.38) * 1.4;
      rAng = this.ragdollAngle * 1.2 + flail;
      lAng = this.ragdollAngle * 1.2 + Math.PI - flail;
    } else if (s === 'stunned') {
      // Limp arms hanging
      rAng = Math.PI * 0.75 + Math.sin(t * 0.1) * 0.08;
      lAng = Math.PI * 0.25 - Math.sin(t * 0.1) * 0.08;
    } else if (this.spinning > 0) {
      const spinA = (this.spinning / 24) * Math.PI * 4;
      rAng = spinA;
      lAng = spinA + Math.PI;
    } else if (s === 'attacking') {
      if (f > 0) { rAng = lerp(-0.45, 1.1, atkProgress); lAng = lerp(Math.PI*0.8, Math.PI*0.55, atkProgress); }
      else       { rAng = lerp(Math.PI+0.45, Math.PI-1.1, atkProgress); lAng = lerp(Math.PI*0.2, Math.PI*0.45, atkProgress); }
    } else if (s === 'walking') {
      const sw = Math.sin(t * 0.24) * 0.52;
      rAng = Math.PI * 0.58 + sw;
      lAng = Math.PI * 0.42 - sw;
    } else if (s === 'jumping' || s === 'falling') {
      rAng = -0.25; lAng = Math.PI + 0.25;
    } else if (s === 'shielding') {
      rAng = f > 0 ? -0.25 : Math.PI + 0.25;
      lAng = f > 0 ? -0.55 : Math.PI + 0.55;
    } else {
      const b = Math.sin(t * 0.045) * 0.045;
      rAng = Math.PI * 0.58 + b;
      lAng = Math.PI * 0.42 - b;
    }

    const rEx = cx + Math.cos(rAng) * armLen;
    const rEy = shoulderY + Math.sin(rAng) * armLen;
    const lEx = cx + Math.cos(lAng) * armLen;
    const lEy = shoulderY + Math.sin(lAng) * armLen;

    ctx.strokeStyle = this.color;
    ctx.lineWidth   = 2.5;
    ctx.beginPath(); ctx.moveTo(cx, shoulderY); ctx.lineTo(rEx, rEy); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(cx, shoulderY); ctx.lineTo(lEx, lEy); ctx.stroke();

    // WEAPON in right hand (boss draws gauntlet on both hands for visual flair)
    const weapScale = this.isBoss ? 1.0 : 1.5;
    this.drawWeapon(rEx, rEy, rAng, s === 'attacking', null, weapScale);
    if (this.isBoss && this.weaponKey === 'gauntlet') {
      this.drawWeapon(lEx, lEy, lAng + Math.PI, s === 'attacking', 'gauntlet', weapScale);
    }

    // LEGS
    let rLeg, lLeg;
    if (s === 'ragdoll') {
      const legFlail = Math.sin(t * 0.35) * 1.1 + this.ragdollAngle * 0.8;
      rLeg = Math.PI * 0.5 + legFlail;
      lLeg = Math.PI * 0.5 - legFlail + this.ragdollAngle * 0.5;
    } else if (s === 'stunned') {
      rLeg = Math.PI * 0.6; lLeg = Math.PI * 0.4;
    } else if (s === 'jumping')      { rLeg = Math.PI*0.65; lLeg = Math.PI*0.35; }
    else if (s === 'falling') { rLeg = Math.PI*0.56; lLeg = Math.PI*0.44; }
    else if (s === 'walking') {
      const sw = Math.sin(t * 0.24) * 0.44;
      rLeg = Math.PI * 0.5 + sw;
      lLeg = Math.PI * 0.5 - sw;
    } else { rLeg = Math.PI*0.62; lLeg = Math.PI*0.38; }

    ctx.beginPath(); ctx.moveTo(cx, hipY); ctx.lineTo(cx + Math.cos(rLeg)*legLen, hipY + Math.sin(rLeg)*legLen); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(cx, hipY); ctx.lineTo(cx + Math.cos(lLeg)*legLen, hipY + Math.sin(lLeg)*legLen); ctx.stroke();

    // SHIELD bubble
    if (this.shielding) {
      ctx.beginPath();
      ctx.arc(cx + f * 15, shoulderY + 12, 23, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(100,210,255,0.88)';
      ctx.lineWidth   = 3;
      ctx.stroke();
      ctx.fillStyle   = 'rgba(100,210,255,0.14)';
      ctx.fill();
    }

    // Stun stars orbiting head
    if (this.stunTimer > 0) {
      ctx.save();
      ctx.globalAlpha = Math.min(1, this.stunTimer / 15);
      for (let i = 0; i < 3; i++) {
        const starA  = t * 0.14 + (i * Math.PI * 2 / 3);
        const starX  = cx  + Math.cos(starA) * 15;
        const starY  = ty  - 4 + Math.sin(starA * 2) * 5;
        ctx.fillStyle   = i % 2 === 0 ? '#ffdd00' : '#ffffff';
        ctx.font        = '10px Arial';
        ctx.textAlign   = 'center';
        ctx.fillText('★', starX, starY);
      }
      ctx.restore();
    }

    // SUPER READY flash
    if (this.superFlashTimer > 0) {
      const pulse = Math.abs(Math.sin(this.superFlashTimer * 0.18));
      ctx.save();
      ctx.globalAlpha = Math.min(1, this.superFlashTimer / 20);
      ctx.font        = `bold ${12 + Math.floor(pulse * 4)}px Arial`;
      ctx.fillStyle   = '#ffd700';
      ctx.textAlign   = 'center';
      ctx.shadowColor = '#ff8800';
      ctx.shadowBlur  = 10 + pulse * 8;
      ctx.fillText('SUPER!', cx, ty - 20);
      ctx.restore();
    }

    // Name tag
    ctx.globalAlpha  = 1;
    ctx.font         = 'bold 10px Arial';
    ctx.fillStyle    = this.color;
    ctx.textAlign    = 'center';
    ctx.shadowColor  = 'rgba(0,0,0,0.8)';
    ctx.shadowBlur   = 4;
    ctx.fillText(this.name, cx, ty - 5);
    ctx.shadowBlur   = 0;

    ctx.restore();
  }

  drawWeapon(hx, hy, angle, attacking, overrideKey = null, scale = 1) {
    ctx.save();
    ctx.translate(hx, hy);
    ctx.rotate(angle + (attacking ? 0.6 : 0));
    if (scale !== 1) ctx.scale(scale, scale);
    ctx.lineCap   = 'round';

    const k = overrideKey || this.weaponKey;

    // Store world-space weapon tip for clash detection
    const _tipAngle = angle + (attacking ? 0.6 : 0);
    const _tipRange = this.weapon ? (this.weapon.range || 30) : 30;
    this._weaponTip = { x: hx + Math.cos(_tipAngle) * _tipRange * 0.85,
                        y: hy + Math.sin(_tipAngle) * _tipRange * 0.85,
                        attacking };

    // --- Weapon glow (pulsing) ---
    const _glowColors = {
      sword: '#c8e8ff', hammer: '#ffaa44', gun: '#ff4444', axe: '#ff6633',
      spear: '#8888ff', bow: '#aadd88', shield: '#4488ff', scythe: '#aabbcc',
      fryingpan: '#ffcc44', broomstick: '#ddbb44', boxinggloves: '#ff3333',
      peashooter: '#44ff66', slingshot: '#cc8844', paperairplane: '#aaccff',
    };
    if (k !== 'gauntlet' && _glowColors[k]) {
      const pulse = 0.5 + 0.5 * Math.sin(frameCount * 0.12 + (this.playerNum || 0));
      ctx.shadowColor = _glowColors[k];
      ctx.shadowBlur  = attacking ? 14 + pulse * 10 : 5 + pulse * 5;
    }

    if (k === 'sword') {
      ctx.strokeStyle = '#cccccc';
      ctx.lineWidth   = 3;
      ctx.beginPath(); ctx.moveTo(0,0); ctx.lineTo(26,-3); ctx.stroke();
      ctx.strokeStyle = '#ffee99';
      ctx.lineWidth   = 1.5;
      ctx.beginPath(); ctx.moveTo(-5,0); ctx.lineTo(5,0); ctx.stroke();

    } else if (k === 'hammer') {
      ctx.strokeStyle = '#888';
      ctx.lineWidth   = 3;
      ctx.beginPath(); ctx.moveTo(0,0); ctx.lineTo(20,0); ctx.stroke();
      ctx.fillStyle   = '#777';
      ctx.fillRect(17, -9, 13, 15);
      ctx.fillStyle   = '#999';
      ctx.fillRect(17, -9, 13, 4);

    } else if (k === 'gun') {
      ctx.fillStyle = '#444';
      ctx.fillRect(0, -4, 18, 8);
      ctx.fillStyle = '#333';
      ctx.fillRect(15, -2, 12, 4);
      ctx.fillStyle = '#555';
      ctx.fillRect(4, 4, 6, 5);

    } else if (k === 'axe') {
      ctx.strokeStyle = '#cc4422';
      ctx.lineWidth   = 3;
      ctx.beginPath(); ctx.moveTo(0,0); ctx.lineTo(18,0); ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(14,-11); ctx.lineTo(23,2); ctx.lineTo(13,5);
      ctx.closePath();
      ctx.fillStyle = '#cc4422';
      ctx.fill();

    } else if (k === 'spear') {
      ctx.strokeStyle = '#8888ff';
      ctx.lineWidth   = 2.5;
      ctx.beginPath(); ctx.moveTo(0,0); ctx.lineTo(30,0); ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(27,-7); ctx.lineTo(38,0); ctx.lineTo(27,7);
      ctx.closePath();
      ctx.fillStyle = '#aaaaff';
      ctx.fill();

    } else if (k === 'bow') {
      // Curved bow + arrow nocked
      ctx.strokeStyle = '#8b5e3c'; ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.arc(0, 0, 18, -Math.PI * 0.6, Math.PI * 0.6);
      ctx.stroke();
      // String
      ctx.strokeStyle = '#ddd'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(0, -18 * Math.sin(Math.PI * 0.6)); ctx.lineTo(0, 18 * Math.sin(Math.PI * 0.6)); ctx.stroke();
      // Arrow
      ctx.strokeStyle = '#c8a060'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(-4, 0); ctx.lineTo(22, 0); ctx.stroke();
      ctx.fillStyle = '#888';
      ctx.beginPath(); ctx.moveTo(22, -4); ctx.lineTo(28, 0); ctx.lineTo(22, 4); ctx.fill();

    } else if (k === 'shield') {
      // Kite shield
      ctx.fillStyle = '#4466cc';
      ctx.beginPath();
      ctx.moveTo(-8, -14); ctx.lineTo(8, -14);
      ctx.lineTo(12, 4); ctx.lineTo(0, 16); ctx.lineTo(-12, 4);
      ctx.closePath(); ctx.fill();
      ctx.strokeStyle = '#aabbff'; ctx.lineWidth = 1.5; ctx.stroke();
      // Boss trim
      ctx.strokeStyle = '#ffee88'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(0, -8); ctx.lineTo(0, 10); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(-7, -2); ctx.lineTo(7, -2); ctx.stroke();

    } else if (k === 'scythe') {
      // Long handle
      ctx.strokeStyle = '#5a3a1a'; ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.moveTo(-6, 0); ctx.lineTo(28, 0); ctx.stroke();
      // Curved blade
      ctx.fillStyle = '#778899';
      ctx.beginPath();
      ctx.moveTo(18, -2);
      ctx.quadraticCurveTo(34, -20, 26, -28);
      ctx.quadraticCurveTo(14, -20, 18, -2);
      ctx.fill();
      ctx.strokeStyle = '#aabbcc'; ctx.lineWidth = 1; ctx.stroke();

    } else if (k === 'fryingpan') {
      // Handle
      ctx.strokeStyle = '#6b4c2a'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(-2, 0); ctx.lineTo(16, 0); ctx.stroke();
      // Pan head
      ctx.fillStyle = '#555';
      ctx.beginPath(); ctx.arc(23, 0, 10, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#777'; ctx.lineWidth = 1.5; ctx.stroke();
      // Shine
      ctx.fillStyle = 'rgba(255,255,255,0.18)';
      ctx.beginPath(); ctx.ellipse(20, -4, 5, 3, -0.4, 0, Math.PI * 2); ctx.fill();

    } else if (k === 'broomstick') {
      // Long stick
      ctx.strokeStyle = '#8b6914'; ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.moveTo(-4, 0); ctx.lineTo(32, 0); ctx.stroke();
      // Bristles
      ctx.strokeStyle = '#c8a040'; ctx.lineWidth = 1.5;
      for (let bi = 0; bi < 5; bi++) {
        const bx = 28 + bi * 2;
        ctx.beginPath(); ctx.moveTo(bx, -7 + bi); ctx.lineTo(bx + 3, 7 - bi); ctx.stroke();
      }
      // Binding
      ctx.strokeStyle = '#8b4040'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(26, -5); ctx.lineTo(26, 5); ctx.stroke();

    } else if (k === 'boxinggloves') {
      // Large rounded glove
      ctx.fillStyle = '#cc2222';
      ctx.beginPath(); ctx.roundRect(0, -8, 20, 16, 6); ctx.fill();
      ctx.strokeStyle = '#ff4444'; ctx.lineWidth = 1.5; ctx.stroke();
      // Knuckle line
      ctx.strokeStyle = '#ff8888'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(18, -5); ctx.lineTo(18, 5); ctx.stroke();
      // Wrist band
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, -2, 5, 4);

    } else if (k === 'peashooter') {
      // Tube body
      ctx.fillStyle = '#228833';
      ctx.fillRect(0, -4, 22, 8);
      ctx.strokeStyle = '#44aa44'; ctx.lineWidth = 1; ctx.strokeRect(0, -4, 22, 8);
      // Barrel opening
      ctx.fillStyle = '#0a1a0a';
      ctx.beginPath(); ctx.arc(22, 0, 3.5, 0, Math.PI * 2); ctx.fill();
      // Leaf detail
      ctx.fillStyle = '#33aa33';
      ctx.beginPath(); ctx.ellipse(8, -7, 7, 3, -0.3, 0, Math.PI * 2); ctx.fill();

    } else if (k === 'slingshot') {
      // Y-fork
      ctx.strokeStyle = '#6b3d0a'; ctx.lineWidth = 3; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(14, 0); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(14, 0); ctx.lineTo(20, -10); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(14, 0); ctx.lineTo(20, 10); ctx.stroke();
      // Elastic band
      ctx.strokeStyle = '#cc6622'; ctx.lineWidth = 1.5; ctx.setLineDash([2, 2]);
      ctx.beginPath(); ctx.moveTo(20, -10); ctx.lineTo(8, 0); ctx.lineTo(20, 10); ctx.stroke();
      ctx.setLineDash([]);
      // Stone in band
      ctx.fillStyle = '#888';
      ctx.beginPath(); ctx.arc(8, 0, 3, 0, Math.PI * 2); ctx.fill();

    } else if (k === 'paperairplane') {
      // Paper plane silhouette
      ctx.fillStyle = '#ddeeff';
      ctx.beginPath();
      ctx.moveTo(0, 0); ctx.lineTo(28, -2); ctx.lineTo(0, -10); ctx.closePath(); ctx.fill();
      ctx.beginPath();
      ctx.moveTo(0, 0); ctx.lineTo(28, -2); ctx.lineTo(0, 8); ctx.closePath();
      ctx.fillStyle = '#bbccee'; ctx.fill();
      ctx.strokeStyle = '#7799bb'; ctx.lineWidth = 0.8; ctx.stroke();
      // Fold line
      ctx.strokeStyle = '#aabbdd'; ctx.lineWidth = 0.5;
      ctx.beginPath(); ctx.moveTo(0, -1); ctx.lineTo(20, -2); ctx.stroke();

    } else if (k === 'gauntlet') {
      // Large dark-energy fist/gauntlet around the hand
      ctx.save();
      ctx.shadowColor = '#bb00ff';
      ctx.shadowBlur  = 14;
      // Main gauntlet body
      ctx.fillStyle   = '#7700cc';
      ctx.beginPath();
      ctx.roundRect(-10, -10, 26, 20, 5);
      ctx.fill();
      // Bright outline
      ctx.strokeStyle = '#bb00ff';
      ctx.lineWidth   = 2;
      ctx.stroke();
      // Knuckle arcs
      ctx.fillStyle = '#9900ee';
      for (let ki = 0; ki < 3; ki++) {
        ctx.beginPath();
        ctx.arc(2 + ki * 6, -10, 4, Math.PI, 0);
        ctx.fill();
      }
      // Energy glow core
      ctx.globalAlpha = 0.5;
      ctx.fillStyle   = '#ee88ff';
      ctx.beginPath();
      ctx.arc(5, 0, 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.restore();
    }

    ctx.restore();
  }
}

// ============================================================
// MINION  (lightweight boss-spawned enemy)
// ============================================================
class Minion extends Fighter {
  constructor(x, y) {
    const wKey = Math.random() < 0.5 ? 'axe' : 'sword';
    super(x, y, '#bb00ee', wKey,
      { left:null, right:null, jump:null, attack:null, ability:null, super:null },
      true, 'hard');
    this.name      = 'MINION';
    this.isMinion  = true;
    this.w         = 32;
    this.h         = 62;
    this.health    = 25;
    this.maxHealth = 25;
    this.lives     = 1;
    this.dmgMult   = 0.10; // deals 10% damage
    this.spawnX    = x;
    this.spawnY    = y;
    this.playerNum = 2;
  }

  // Minions never super
  useSuper() {}
  activateSuper() {}

  // Flat respawn override — minions just die, no countdown
  respawn() { this.health = 0; }
}

// ============================================================
// FOREST BEAST  (rare random encounter in forest arena)
// ============================================================
class ForestBeast extends Fighter {
  constructor(x, y) {
    super(x, y, '#1a8a2e', 'axe',
      { left:null, right:null, jump:null, attack:null, ability:null, super:null },
      true, 'hard');
    this.name       = 'BEAST';
    this.isBeast    = true;
    this.isMinion   = true;   // shares minion hit-detection code
    this.w          = 32;
    this.h          = 62;
    this.health     = 300;
    this.maxHealth  = 300;
    this.lives      = 1;
    this.dmgMult    = 1.5;    // deals 150% damage
    this.kbResist   = 0.4;    // absorbs 60% of knockback
    this.kbBonus    = 1.4;    // deals 40% extra knockback
    this.spawnX     = x;
    this.spawnY     = y;
    this.playerNum  = 2;
    this.dashCooldown = 120;  // initial delay before first dash
  }

  update() {
    super.update();
    // Dash attack: charge at target when far away
    if (this.dashCooldown > 0) {
      this.dashCooldown--;
    } else if (this.target && this.target.health > 0 && this.health > 0) {
      const dx = this.target.cx() - this.cx();
      if (Math.abs(dx) > 180) {
        this.vx = Math.sign(dx) * 16;
        spawnParticles(this.cx(), this.cy(), '#1a8a2e', 8);
        this.dashCooldown = 180 + Math.floor(Math.random() * 120);
      }
    }
  }

  useSuper() {}
  activateSuper() {}
  respawn() { this.health = 0; }

  draw() {
    if (this.health <= 0) return;
    ctx.save();
    // Blink when invincible
    if (this.invincible > 0 && Math.floor(this.invincible / 5) % 2 === 1) ctx.globalAlpha = 0.35;

    const cx = this.cx(), ty = this.y, f = this.facing;
    const clr = this.isRaged ? '#cc1100' : '#1a6622';
    const darkClr = this.isRaged ? '#880800' : '#0d3d14';

    // Shadow
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.beginPath(); ctx.ellipse(cx, ty + this.h + 4, this.w * 0.7, 6, 0, 0, Math.PI * 2); ctx.fill();

    // Body — hunched quadruped torso
    ctx.fillStyle = clr;
    ctx.strokeStyle = darkClr;
    ctx.lineWidth = 2;
    // Main body blob (wide, low-slung)
    ctx.beginPath();
    ctx.ellipse(cx, ty + this.h * 0.58, this.w * 0.72, this.h * 0.38, 0, 0, Math.PI * 2);
    ctx.fill(); ctx.stroke();

    // Hump / back
    ctx.beginPath();
    ctx.ellipse(cx - f * 4, ty + this.h * 0.38, this.w * 0.48, this.h * 0.28, 0, 0, Math.PI * 2);
    ctx.fill(); ctx.stroke();

    // Head (large, low, forward-leaning)
    const headX = cx + f * (this.w * 0.38);
    const headY = ty + this.h * 0.3;
    ctx.beginPath();
    ctx.ellipse(headX, headY, this.w * 0.38, this.w * 0.32, f > 0 ? -0.3 : 0.3, 0, Math.PI * 2);
    ctx.fillStyle = clr; ctx.fill(); ctx.stroke();

    // Snout / maw
    ctx.fillStyle = darkClr;
    ctx.beginPath();
    ctx.ellipse(headX + f * (this.w * 0.22), headY + 4, this.w * 0.18, this.w * 0.12, 0, 0, Math.PI * 2);
    ctx.fill();

    // Fangs
    ctx.fillStyle = '#ffffcc';
    ctx.beginPath();
    ctx.moveTo(headX + f * (this.w * 0.26), headY + 7);
    ctx.lineTo(headX + f * (this.w * 0.30), headY + 16);
    ctx.lineTo(headX + f * (this.w * 0.22), headY + 7);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(headX + f * (this.w * 0.34), headY + 6);
    ctx.lineTo(headX + f * (this.w * 0.38), headY + 14);
    ctx.lineTo(headX + f * (this.w * 0.30), headY + 6);
    ctx.fill();

    // Eyes — glowing red
    ctx.fillStyle = this.isRaged ? '#ffff00' : '#ff2200';
    ctx.shadowColor = ctx.fillStyle; ctx.shadowBlur = 8;
    ctx.beginPath(); ctx.arc(headX + f * 8, headY - 4, 4, 0, Math.PI * 2); ctx.fill();
    ctx.shadowBlur = 0;

    // Front claws (arm)
    ctx.strokeStyle = darkClr; ctx.lineWidth = 4;
    const armX = cx + f * (this.w * 0.4);
    ctx.beginPath(); ctx.moveTo(armX, ty + this.h * 0.52); ctx.lineTo(armX + f * 14, ty + this.h * 0.72); ctx.stroke();
    // Claw tips
    ctx.strokeStyle = '#ffddaa'; ctx.lineWidth = 2;
    for (let i = -1; i <= 1; i++) {
      ctx.beginPath();
      ctx.moveTo(armX + f * 14, ty + this.h * 0.72);
      ctx.lineTo(armX + f * 14 + i * 6, ty + this.h * 0.72 + 10);
      ctx.stroke();
    }

    // Back legs
    ctx.strokeStyle = darkClr; ctx.lineWidth = 4;
    const legX = cx - f * (this.w * 0.3);
    ctx.beginPath(); ctx.moveTo(legX, ty + this.h * 0.72); ctx.lineTo(legX - f * 8, ty + this.h + 2); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(cx, ty + this.h * 0.76); ctx.lineTo(cx + f * 4, ty + this.h + 2); ctx.stroke();

    // Fur spikes on back
    ctx.fillStyle = darkClr;
    for (let i = 0; i < 5; i++) {
      const sx = cx - f * 18 + i * f * 9;
      const sy = ty + this.h * 0.25 - i * 2;
      ctx.beginPath();
      ctx.moveTo(sx, sy);
      ctx.lineTo(sx - f * 3, sy - 12);
      ctx.lineTo(sx + f * 3, sy);
      ctx.fill();
    }

    // Raged: fire aura
    if (this.isRaged && settings.particles && this.animTimer % 3 === 0) {
      spawnParticles(cx, ty + this.h * 0.4, '#ff4400', 2);
    }

    // Name tag
    ctx.globalAlpha = 1;
    ctx.fillStyle = this.isRaged ? '#ff6600' : '#aaffaa';
    ctx.font = 'bold 11px Arial';
    ctx.textAlign = 'center';
    ctx.fillText(this.name, cx, ty - 10);

    // HP bar
    const hpPct = Math.max(0, this.health / this.maxHealth);
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fillRect(cx - 24, ty - 22, 48, 5);
    ctx.fillStyle = `hsl(${hpPct * 120},100%,44%)`;
    ctx.fillRect(cx - 24, ty - 22, 48 * hpPct, 5);

    ctx.restore();
  }
}

// ============================================================
// YETI  (rare random encounter in ice arena)
// ============================================================
class Yeti extends Fighter {
  constructor(x, y) {
    super(x, y, '#e8f4ff', 'hammer',
      { left:null, right:null, jump:null, attack:null, ability:null, super:null },
      true, 'hard');
    this.name         = 'YETI';
    this.isYeti       = true;
    this.isMinion     = true;
    this.w            = 40;
    this.h            = 76;
    this.health       = 450;  // 1.5x beast
    this.maxHealth    = 450;
    this.lives        = 1;
    this.dmgMult      = 2.25; // 1.5x beast's 1.5
    this.kbResist     = 0.55;
    this.kbBonus      = 2.1;  // 1.5x beast's 1.4
    this.classSpeedMult = 0.3; // 0.3x speed
    this.spawnX       = x;
    this.spawnY       = y;
    this.playerNum    = 2;
    this.roarCooldown  = 300;  // frames before first roar
    this.spikeCooldown = 200;  // frames before first ice spike
    this.breathCooldown = 400;
    this.iceSpikes     = [];   // {x, y, timer, h} visual ice spikes
  }

  update() {
    // Slow movement — override speed
    this.classSpeedMult = 0.3;
    super.update();
    // Extra friction to keep it slow
    this.vx *= 0.88;

    if (this.health <= 0) return;

    // Roar stun: stuns all nearby players
    if (this.roarCooldown > 0) this.roarCooldown--;
    else if (this.target && this.target.health > 0 && dist(this, this.target) < 220) {
      this.doRoar();
      this.roarCooldown = 420;
    }

    // Ice spikes: erupt from ground under players
    if (this.spikeCooldown > 0) this.spikeCooldown--;
    else if (this.target && this.target.health > 0) {
      this.doIceSpikes();
      this.spikeCooldown = 280;
    }

    // Ice breath: fan of slow projectiles
    if (this.breathCooldown > 0) this.breathCooldown--;
    else if (this.target && this.target.health > 0 && dist(this, this.target) < 300) {
      this.doIceBreath();
      this.breathCooldown = 360;
    }

    // Update visual spikes
    this.iceSpikes = this.iceSpikes.filter(sp => sp.timer > 0);
    for (const sp of this.iceSpikes) sp.timer--;
  }

  doRoar() {
    screenShake = Math.max(screenShake, 18);
    spawnParticles(this.cx(), this.cy(), '#aaddff', 20);
    if (settings.dmgNumbers) damageTexts.push(new DamageText(this.cx(), this.y - 20, 'ROAR!', '#aaddff'));
    for (const p of players) {
      if (p.isBoss || p.health <= 0) continue;
      if (dist(this, p) < 220) {
        p.stunTimer = Math.max(p.stunTimer || 0, 80);
        dealDamage(this, p, 8, 6);
        spawnParticles(p.cx(), p.cy(), '#88bbff', 10);
      }
    }
  }

  doIceSpikes() {
    const target = this.target;
    if (!target) return;
    // Spawn 3 spikes: one under target, two offset
    const offsets = [-60, 0, 60];
    for (const off of offsets) {
      const sx = clamp(target.cx() + off, 30, GAME_W - 30);
      this.iceSpikes.push({ x: sx, y: currentArena.deathY || 520, timer: 60, h: 80 });
      // Delayed damage
      setTimeout(() => {
        if (!gameRunning) return;
        for (const p of players) {
          if (p.isBoss || p.health <= 0) continue;
          if (Math.abs(p.cx() - sx) < 28 && p.y + p.h > (currentArena.deathY || 520) - 90) {
            dealDamage(this, p, 18, 12);
            p.vy = -12;
            spawnParticles(p.cx(), p.cy(), '#aaddff', 10);
          }
        }
      }, 400);
    }
    spawnParticles(target.cx(), target.cy() + 60, '#aaddff', 12);
  }

  doIceBreath() {
    const target = this.target;
    if (!target) return;
    const dx = target.cx() - this.cx();
    const baseAngle = Math.atan2(target.cy() - this.cy(), dx);
    for (let i = -2; i <= 2; i++) {
      const angle = baseAngle + i * 0.18;
      const spd = 5 + Math.random() * 2;
      const proj = new Projectile(
        this.cx() + Math.cos(angle) * 24,
        this.cy(),
        Math.cos(angle) * spd,
        Math.sin(angle) * spd,
        this, 12, '#88ccff'
      );
      proj.isIce = true;
      proj.life  = 70;
      projectiles.push(proj);
    }
    spawnParticles(this.cx() + this.facing * 24, this.cy(), '#aaddff', 10);
  }

  draw() {
    if (this.health <= 0) return;
    ctx.save();
    if (this.invincible > 0 && Math.floor(this.invincible / 5) % 2 === 1) ctx.globalAlpha = 0.35;

    const cx = this.cx(), ty = this.y;
    const clr = '#c8e8ff', dark = '#4477aa';

    // Draw visual ice spikes first (below yeti)
    for (const sp of this.iceSpikes) {
      const prog = Math.min(1, (60 - sp.timer) / 20);
      const hh = sp.h * prog;
      ctx.fillStyle = 'rgba(136,200,255,0.8)';
      ctx.beginPath();
      ctx.moveTo(sp.x - 10, sp.y);
      ctx.lineTo(sp.x, sp.y - hh);
      ctx.lineTo(sp.x + 10, sp.y);
      ctx.fill();
      ctx.fillStyle = 'rgba(200,240,255,0.6)';
      ctx.beginPath();
      ctx.moveTo(sp.x - 5, sp.y);
      ctx.lineTo(sp.x, sp.y - hh * 0.6);
      ctx.lineTo(sp.x + 5, sp.y);
      ctx.fill();
    }

    // Shadow
    ctx.fillStyle = 'rgba(0,0,0,0.22)';
    ctx.beginPath(); ctx.ellipse(cx, ty + this.h + 5, this.w * 0.75, 7, 0, 0, Math.PI * 2); ctx.fill();

    // Body — large bulky torso
    ctx.fillStyle = clr; ctx.strokeStyle = dark; ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.ellipse(cx, ty + this.h * 0.55, this.w * 0.62, this.h * 0.36, 0, 0, Math.PI * 2);
    ctx.fill(); ctx.stroke();

    // Arms — outstretched (idle) or raised
    const armRaise = this.state === 'attacking' ? -20 : 0;
    ctx.strokeStyle = dark; ctx.lineWidth = 7;
    ctx.beginPath(); ctx.moveTo(cx - this.w * 0.44, ty + this.h * 0.38); ctx.lineTo(cx - this.w * 0.7, ty + this.h * 0.52 + armRaise); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(cx + this.w * 0.44, ty + this.h * 0.38); ctx.lineTo(cx + this.w * 0.7, ty + this.h * 0.52 + armRaise); ctx.stroke();

    // Fists / paws
    ctx.fillStyle = clr;
    ctx.beginPath(); ctx.arc(cx - this.w * 0.7, ty + this.h * 0.52 + armRaise, 10, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.arc(cx + this.w * 0.7, ty + this.h * 0.52 + armRaise, 10, 0, Math.PI * 2); ctx.fill(); ctx.stroke();

    // Legs
    ctx.lineWidth = 8;
    ctx.beginPath(); ctx.moveTo(cx - 14, ty + this.h * 0.78); ctx.lineTo(cx - 18, ty + this.h + 2); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(cx + 14, ty + this.h * 0.78); ctx.lineTo(cx + 18, ty + this.h + 2); ctx.stroke();

    // Head — round, prominent
    ctx.lineWidth = 2.5;
    ctx.fillStyle = clr;
    ctx.beginPath(); ctx.arc(cx, ty + this.h * 0.22, this.w * 0.4, 0, Math.PI * 2); ctx.fill(); ctx.stroke();

    // Ears
    ctx.beginPath(); ctx.arc(cx - this.w * 0.32, ty + this.h * 0.08, 8, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.arc(cx + this.w * 0.32, ty + this.h * 0.08, 8, 0, Math.PI * 2); ctx.fill(); ctx.stroke();

    // Glowing blue eyes
    ctx.fillStyle = '#0066ff'; ctx.shadowColor = '#0099ff'; ctx.shadowBlur = 10;
    ctx.beginPath(); ctx.arc(cx - 9, ty + this.h * 0.2, 5, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(cx + 9, ty + this.h * 0.2, 5, 0, Math.PI * 2); ctx.fill();
    ctx.shadowBlur = 0;

    // Mouth (angry)
    ctx.strokeStyle = dark; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(cx, ty + this.h * 0.26, 10, 0.2, Math.PI - 0.2); ctx.stroke();

    // Fur texture lines
    ctx.strokeStyle = 'rgba(100,150,220,0.3)'; ctx.lineWidth = 1;
    for (let i = 0; i < 6; i++) {
      const lx = cx - 18 + i * 7; const ly = ty + this.h * 0.4;
      ctx.beginPath(); ctx.moveTo(lx, ly); ctx.lineTo(lx - 3, ly + 14); ctx.stroke();
    }

    // Name tag
    ctx.globalAlpha = 1; ctx.fillStyle = '#88ccff'; ctx.font = 'bold 12px Arial'; ctx.textAlign = 'center';
    ctx.fillText('YETI', cx, ty - 12);

    // HP bar
    const hpPct = Math.max(0, this.health / this.maxHealth);
    ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.fillRect(cx - 26, ty - 24, 52, 5);
    ctx.fillStyle = `hsl(${hpPct * 120},100%,44%)`; ctx.fillRect(cx - 26, ty - 24, 52 * hpPct, 5);

    ctx.restore();
  }

  useSuper() {}
  activateSuper() {}
  respawn() { this.health = 0; }
}

// ============================================================
// DUMMY  (training-mode target — stands still, auto-heals)
// ============================================================
class Dummy extends Fighter {
  constructor(x, y) {
    super(x, y, '#888888', 'sword',
      { left:null, right:null, jump:null, attack:null, ability:null, super:null },
      false);
    this.name     = 'DUMMY';
    this.isDummy  = true;
    this.health   = 200;
    this.maxHealth = 200;
    this.lives    = 999;
    this.spawnX   = x;
    this.spawnY   = y;
  }

  update() {
    // Timers
    if (this.cooldown > 0)         this.cooldown--;
    if (this.invincible > 0)       this.invincible--;
    if (this.hurtTimer > 0)        this.hurtTimer--;
    if (this.stunTimer > 0)        this.stunTimer--;
    if (this.ragdollTimer > 0) {
      this.ragdollTimer--;
      this.ragdollAngle += this.ragdollSpin;
      this.ragdollSpin  *= 0.97;
    } else {
      this.ragdollAngle = 0;
      this.ragdollSpin  = 0;
    }
    // Gravity + minimal physics
    this.vy += 0.65;
    this.x  += this.vx;
    this.y  += this.vy;
    this.vx *= 0.80;
    this.vy  = clamp(this.vy, -20, 19);
    this.onGround = false;
    for (const pl of currentArena.platforms) this.checkPlatform(pl);
    // Auto-reset if falls off
    if (this.y > 640) { this.x = this.spawnX; this.y = this.spawnY - 60; this.vy = 0; this.health = this.maxHealth; }
    // Auto-heal when health hits 0
    if (this.health <= 0) {
      this.health = this.maxHealth;
      this.invincible = 120;
      spawnParticles(this.cx(), this.cy(), this.color, 12);
    }
    this.animTimer++;
    this.updateState();
  }

  respawn() { this.health = this.maxHealth; }
  useSuper() {}
  activateSuper() {}
  updateAI() {}
}

// ============================================================
// TRAINING COMMANDS
// ============================================================
function trainingCmd(cmd) {
  if (!gameRunning || !trainingMode) return;
  const p = players[0];
  if (!p) return;

  if (cmd === 'giveSuper') {
    const giveTargets = trainingPlayerOnly ? [p] : [p, ...trainingDummies];
    for (const t of giveTargets) { t.superMeter = 100; t.superReady = true; t.superFlashTimer = 90; }
  }
  if (cmd === 'noCooldowns') {
    p.noCooldownsActive = !p.noCooldownsActive;
    if (p.noCooldownsActive) { p.cooldown = 0; p.cooldown2 = 0; p.abilityCooldown = 0; p.abilityCooldown2 = 0; p.shieldCooldown = 0; p.boostCooldown = 0; }
    document.getElementById('tBtnCDs')?.classList.toggle('training-active', p.noCooldownsActive);
  }
  if (cmd === 'fullHealth') {
    if (trainingPlayerOnly) {
      p.health = p.maxHealth;
    } else {
      for (const d of trainingDummies) d.health = d.maxHealth;
      p.health = p.maxHealth;
    }
  }
  if (cmd === 'spawnDummy') {
    const x = 200 + Math.random() * 500;
    trainingDummies.push(new Dummy(x, 300));
  }
  if (cmd === 'spawnBot') {
    const x    = Math.random() < 0.5 ? 160 : 720;
    const wKey = randChoice(WEAPON_KEYS);
    const bot  = new Fighter(x, 300, '#ff8800', wKey,
      { left:null, right:null, jump:null, attack:null, ability:null, super:null },
      true, 'hard');
    bot.name = 'BOT'; bot.lives = 1; bot.spawnX = x; bot.spawnY = 300;
    bot.target = p; bot.playerNum = 2;
    trainingDummies.push(bot);
  }
  if (cmd === 'clearEnemies') {
    trainingDummies = [];
    bossBeams  = [];
    bossSpikes = [];
    minions    = [];
  }
  if (cmd === 'godmode') {
    if (trainingPlayerOnly) {
      p.godmode = !p.godmode;
      document.getElementById('tBtnGod')?.classList.toggle('training-active', p.godmode);
    } else {
      const newVal = !p.godmode;
      p.godmode = newVal;
      for (const d of trainingDummies) d.godmode = newVal;
      document.getElementById('tBtnGod')?.classList.toggle('training-active', newVal);
    }
  }
  if (cmd === 'spawnBoss') {
    // Allow multiple bosses — no filter, just spawn another
    const bossX = 150 + Math.random() * 600;
    const tb = new Boss();
    tb.target    = p;
    tb.spawnX    = bossX; tb.spawnY = 200;
    tb.x         = bossX; tb.y     = 200;
    trainingDummies.push(tb);
  }
  if (cmd === 'spawnBeast') {
    const bx = Math.random() < 0.5 ? 80 : 820;
    const beast = new ForestBeast(bx, 280);
    beast.target = p;
    trainingDummies.push(beast);
  }
  if (cmd === 'onePunch') {
    if (trainingPlayerOnly) {
      p.onePunchMode = !p.onePunchMode;
      document.getElementById('tBtnOnePunch')?.classList.toggle('training-active', p.onePunchMode);
    } else {
      const newVal = !p.onePunchMode;
      p.onePunchMode = newVal;
      for (const d of trainingDummies) d.onePunchMode = newVal;
      document.getElementById('tBtnOnePunch')?.classList.toggle('training-active', newVal);
    }
  }
  if (cmd === 'chaosMode') {
    trainingChaosMode = !trainingChaosMode;
    document.getElementById('tBtnChaos')?.classList.toggle('training-active', trainingChaosMode);
  }
  if (cmd === 'playerOnly') {
    trainingPlayerOnly = !trainingPlayerOnly;
    const btn = document.getElementById('tBtnPlayerOnly');
    if (btn) {
      btn.classList.toggle('training-active', trainingPlayerOnly);
      btn.textContent = trainingPlayerOnly ? 'Player Only' : 'All Entities';
    }
  }
}

function toggleTrainingPanel() {
  const panel = document.getElementById('trainingExpandPanel');
  if (!panel) return;
  panel.style.display = panel.style.display === 'none' ? 'block' : 'none';
}

function applyClass(fighter, classKey) {
  const cls = CLASSES[classKey || 'none'];
  if (!cls || classKey === 'none') return;
  fighter.charClass       = classKey;
  fighter.maxHealth       = cls.hp;
  fighter.health          = cls.hp;
  fighter.classSpeedMult  = cls.speedMult;
  if (cls.weapon) {
    fighter.weaponKey = cls.weapon;
    fighter.weapon    = WEAPONS[cls.weapon];
  }
}

function updateClassWeapon(player) {
  const clsKey = document.getElementById(player + 'Class').value;
  const cls    = CLASSES[clsKey];
  const wEl    = document.getElementById(player + 'Weapon');
  if (cls && cls.weapon) {
    wEl.value    = cls.weapon;
    wEl.disabled = true;
  } else {
    wEl.disabled = false;
  }
  showDesc(player, 'class', clsKey);
}

function showDesc(player, type, key) {
  const data  = type === 'weapon' ? WEAPON_DESCS[key] : CLASS_DESCS[key];
  const panel = document.getElementById(player + 'Desc');
  const title = document.getElementById(player + 'DescTitle');
  const body  = document.getElementById(player + 'DescBody');
  if (!panel || !title || !body) return;
  if (!data || key === 'none' || key === 'random') {
    panel.style.display = 'none';
    return;
  }
  title.textContent = data.title;
  let html = `<span class="desc-what">${data.what}</span>`;
  if (data.ability) html += `<br><span class="desc-ability">${data.ability}</span>`;
  if (data.super)   html += `<br><span class="desc-super">${data.super}</span>`;
  if (data.perk)    html += `<br><span class="desc-perk">${data.perk}</span>`;
  html += `<br><span class="desc-tip">${data.how}</span>`;
  // Randomizer toggle
  const inPool = type === 'weapon'
    ? (!randomWeaponPool || randomWeaponPool.has(key))
    : (!randomClassPool  || randomClassPool.has(key));
  html += `<br><button id="randBtn_${type}_${key}" class="rand-toggle-btn"
    onclick="toggleRandomPool('${type}','${key}')"
    style="margin-top:6px;padding:3px 10px;border-radius:6px;border:1px solid rgba(255,255,255,0.2);cursor:pointer;font-size:11px;background:${inPool ? 'rgba(0,200,100,0.25)' : 'rgba(200,50,50,0.25)'}">
    ${inPool ? '\u2713 In Random Pool' : '\u2717 Excluded'}</button>`;
  body.innerHTML = html;
  panel.style.display = 'block';
}

// ============================================================
// BOSS  (special Fighter — 3× HP, gauntlet weapon, ½ cooldowns)
// ============================================================
class Boss extends Fighter {
  constructor() {
    const noCtrl = { left:null, right:null, jump:null, attack:null, ability:null, super:null };
    super(450, 200, '#cc00ee', 'gauntlet', noCtrl, true, 'hard');
    this.name           = 'CREATOR';
    this.health         = 3000;
    this.maxHealth      = 3000;
    this.w              = 33;   // double Fighter hitbox width
    this.h              = 90;  // double Fighter hitbox height
    this.drawScale      = 1.5;    // visual 2× scale in draw()
    this.isBoss         = true;
    this.lives          = 1;
    this.spawnX         = 450;
    this.spawnY         = 200;
    this.playerNum      = 2;
    // Boss combat modifiers
    this.kbResist       = 0.5;  // takes half knockback
    this.kbBonus        = 1.5;  // deals 1.5x knockback
    this.attackCooldownMult = 0.5;
    this.superChargeRate = 1.7;   // charges super 1.7× faster
    // Gauntlet weapon (single weapon only)
    this.weaponKey      = 'gauntlet';
    this.weapon         = WEAPONS['gauntlet'];
    // Minion spawning
    this.minionCooldown = 600;  // frames until first spawn (~10 s)
    // Beam attacks
    this.beamCooldown   = 900;  // frames until first beam (~15 s)
    // Teleport
    this.teleportCooldown = 0;
    this.teleportMaxCd    = 900;
    this.postTeleportCrit = 0;
    this.forcedTeleportFlash = 0;
    // Spike attacks
    this.spikeCooldown  = 1200; // 20 seconds initial
    // Post-special pause (boss stops attacking for 1.5s after specials)
    this.postSpecialPause = 0;
    // Monologue tracking
    this.phaseDialogueFired = new Set();
    this._maxLives          = 1; // boss shows phase indicator, not hearts
    this._lastPhase         = 1; // track phase transitions for animation triggers
  }

  getPhase() {
    if (this.health > 2000) return 1;   // > 66% HP (>2000 of 3000)
    if (this.health > 1000) return 2;   // 33–66% HP (1000–2000)
    return 3;                            // < 33% HP (<1000)
  }

  // Override attack: gauntlet melee only, half cooldowns
  attack(target) {
    if (this.backstageHiding) return;
    if (this.postPortalAttackBlock > 0) return; // can't attack for 1s after portal exit
    if (this.cooldown > 0 || this.health <= 0 || this.stunTimer > 0 || this.ragdollTimer > 0) return;
    // Gauntlet is melee-only — start swing, damage delivered via weapon-tip hitbox
    if (dist(this, target) < this.weapon.range * 1.4) { this.weaponHit = false; this.swingHitTargets.clear(); }
    this.cooldown    = Math.max(1, Math.ceil(this.weapon.cooldown * (this.attackCooldownMult || 0.5)));
    this.attackTimer = this.attackDuration;
  }

  // Override ability: half cooldown + 1.5s post-special pause
  ability(target) {
    if (this.postPortalAttackBlock > 0) return; // can't use ability for 1s after portal exit
    if (this.abilityCooldown > 0 || this.health <= 0 || this.stunTimer > 0 || this.ragdollTimer > 0) return;
    this.weapon.ability(this, target);
    this.abilityCooldown  = Math.max(1, Math.ceil(this.weapon.abilityCooldown * (this.attackCooldownMult || 0.5)));
    this.attackTimer      = this.attackDuration * 2;
    this.postSpecialPause = 90; // 1.5s pause after void slam ability
  }

  // Override AI: phase-based, more aggressive, respects shield cooldown
  updateAI() {
    if (this.aiReact > 0) { this.aiReact--; return; }
    if (this.ragdollTimer > 0 || this.stunTimer > 0) return;
    // Post-special pause: boss moves but doesn't attack for 1.5s after specials
    if (this.postSpecialPause > 0) this.postSpecialPause--;
    const canAct = this.postSpecialPause <= 0;

    // In 2P boss mode, always target the nearest alive human player
    if (gameMode === 'boss' && bossPlayerCount === 2) {
      let nearDist = Infinity, nearP = null;
      for (const p of players) {
        if (p.isBoss || p.health <= 0) continue;
        const d2 = dist(this, p);
        if (d2 < nearDist) { nearDist = d2; nearP = p; }
      }
      if (nearP) this.target = nearP;
    }

    const phase   = this.getPhase();
    // Phase transition animations
    if (phase > this._lastPhase) {
      this._lastPhase = phase;
      if (settings.screenShake) screenShake = Math.max(screenShake, 20);
      if (settings.phaseFlash)  bossPhaseFlash = 50;
    }
    // Phase-based stats
    const spd     = phase === 3 ? 5.5 : phase === 2 ? 4.5 : 3.8;
    const atkFreq = phase === 3 ? 0.40 : phase === 2 ? 0.20 : 0.13;
    const abiFreq = phase === 3 ? 0.07 : phase === 2 ? 0.035 : 0.018;

    // Count down post-teleport crit window and attack block
    if (this.postTeleportCrit > 0) this.postTeleportCrit--;
    if (this.postPortalAttackBlock > 0) this.postPortalAttackBlock--;
    if (this.forcedTeleportFlash > 0) this.forcedTeleportFlash--;

    const t  = this.target;
    if (!t || t.health <= 0) return;
    const dx  = t.cx() - this.cx();
    const d   = Math.abs(dx);
    const dir = dx > 0 ? 1 : -1;

    // Lava / void floor — flee toward elevated platforms
    if (currentArena.hasLava) {
      const distToLava = currentArena.lavaY - (this.y + this.h);
      if (distToLava < 110) {
        if (this.onGround) {
          this.vy = -19; this.vx = this.cx() < GAME_W/2 ? spd*2.2 : -spd*2.2;
        } else {
          let nearX = GAME_W/2, nearDist = Infinity;
          for (const pl of currentArena.platforms) {
            if (pl.y < this.y && !pl.isFloorDisabled) {
              const pdx = Math.abs(pl.x + pl.w/2 - this.cx());
              if (pdx < nearDist) { nearDist = pdx; nearX = pl.x + pl.w/2; }
            }
          }
          this.vx = nearX > this.cx() ? spd*2 : -spd*2;
        }
        return;
      }
    }

    // Flee floor during void warning/hazard
    const floorDanger = currentArena.isBossArena &&
      (bossFloorState === 'hazard' || (bossFloorState === 'warning' && bossFloorTimer < 90)) &&
      this.y + this.h > 440;
    if (floorDanger && this.onGround) {
      const above = this.platformAbove();
      if (above) { this.vy = -18; this.vx = (above.x + above.w/2 - this.cx()) > 0 ? spd*1.5 : -spd*1.5; }
      return;
    }

    // State machine — boss stays in attack range more aggressively
    if (d < this.weapon.range + 50) this.aiState = 'attack';
    else if (this.health < 100 && d > 160 && Math.random() < 0.008) this.aiState = 'evade';
    else this.aiState = 'chase';

    // Reactive shield (respects cooldown) — responds to both attacks AND incoming bullets
    if (this.shieldCooldown === 0) {
      const incomingBullet = projectiles.some(pr =>
        pr.owner !== this && Math.hypot(pr.x - this.cx(), pr.y - this.cy()) < 160 &&
        ((pr.vx > 0 && pr.x < this.cx()) || (pr.vx < 0 && pr.x > this.cx()))
      );
      if ((t.attackTimer > 0 && d < 150) || incomingBullet) {
        if (Math.random() < (phase === 3 ? 0.55 : 0.35)) {
          this.shielding = true;
          this.shieldCooldown = Math.ceil(SHIELD_CD * 0.5);
          setTimeout(() => { this.shielding = false; }, 350);
        }
      }
    }

    // Dodge bullets by jumping
    for (const pr of projectiles) {
      if (pr.owner === this) continue;
      const pd = Math.hypot(pr.x - this.cx(), pr.y - this.cy());
      if (pd < 130 && this.onGround && Math.random() < (phase >= 2 ? 0.35 : 0.20)) {
        this.vy = -18;
        break;
      }
    }

    const edgeDanger = this.isEdgeDanger(dir);

    switch (this.aiState) {
      case 'chase':
        if (!edgeDanger) this.vx = dir * spd;
        else { this.vx = 0; if (this.onGround && this.platformAbove() && Math.random() < 0.10) this.vy = -18; }
        // Jump toward target on platforms above
        if (this.onGround && t.y + t.h < this.y - 40 && !edgeDanger && Math.random() < 0.07) this.vy = -19;
        break;
      case 'attack':
        this.vx *= 0.75;
        if (canAct && Math.random() < atkFreq)       this.attack(t);
        if (canAct && Math.random() < abiFreq)       this.ability(t);
        if (canAct && this.superReady && Math.random() < (phase === 3 ? 0.15 : 0.10)) this.useSuper(t);
        if (this.onGround && t.y + t.h < this.y - 30 && !edgeDanger && Math.random() < 0.05) this.vy = -17;
        break;
      case 'evade': {
        const eDir  = -dir;
        const eEdge = this.isEdgeDanger(eDir);
        if (!eEdge) this.vx = eDir * spd * 1.2;
        else if (canAct && Math.random() < atkFreq)  this.attack(t);
        if (canAct && Math.random() < atkFreq * 0.5) this.attack(t);
        break;
      }
    }

    // Phase 3 bonus: aggressive jumps + burst attacks
    if (phase === 3) {
      if (this.onGround && !edgeDanger && Math.random() < 0.030) this.vy = -17;
      if (canAct && Math.random() < 0.035) this.attack(t);
    }

    // Teleport (phase 2+) — NOT blocked by postSpecialPause
    if (phase >= 2) {
      if (this.teleportCooldown > 0) {
        this.teleportCooldown--;
      } else {
        if (!this.backstageHiding) bossTeleport(this);
        this.teleportCooldown = phase === 3 ? 420 : 900;
      }
    }

    // Ability more often when target is close
    if (canAct && t && dist(this, t) < 120 && Math.random() < 0.06) this.ability(t);

    // Boss leads attacks when player moves toward it
    if (canAct && t && t.vx !== 0) {
      const playerMovingToward = (t.cx() < this.cx() && t.vx > 0) || (t.cx() > this.cx() && t.vx < 0);
      if (playerMovingToward && dist(this, t) < this.weapon.range * 2 && Math.random() < 0.15) {
        this.attack(t);
      }
    }

    // Spike attacks (blocked by postSpecialPause)
    if (this.spikeCooldown > 0) {
      this.spikeCooldown--;
    } else if (canAct && phase >= 2 && t) {
      const numSpikes = 5;
      for (let i = 0; i < numSpikes; i++) {
        const sx = clamp(t.cx() + (i - 2) * 35, 20, 880);
        bossSpikes.push({ x: sx, maxH: 90 + Math.random() * 50, h: 0, phase: 'rising', stayTimer: 0, done: false });
      }
      this.spikeCooldown = phase === 3 ? 480 : 720;
      this.postSpecialPause = 90; // 1.5s pause after spawning spikes
      showBossDialogue(randChoice(['Rise!', 'The ground betrays you!', 'Watch your feet!']));
    }

    // Minion spawning (up to 2 at a time, every ~15 s, not on phase 1)
    if (this.minionCooldown > 0) {
      this.minionCooldown--;
    } else if (phase >= 2 && minions.filter(m => m.health > 0).length < 2) {
      const spawnX = Math.random() < 0.5 ? 60 : 840;
      const spawnY = 200;
      const mn     = new Minion(spawnX, spawnY);
      mn.target    = players[0];
      minions.push(mn);
      spawnParticles(spawnX, spawnY, '#bb00ee', 24);
      if (settings.screenShake) screenShake = Math.max(screenShake, 12);
      this.minionCooldown = 60 * (phase === 3 ? 7 : 15);
      showBossDialogue(randChoice(['Deal with my guests!', 'MINIONS, arise!', 'Handle this!', 'You\'ll need backup...']));
    }

    // Beam attacks — summons floor beams with 5-second warning (blocked by postSpecialPause)
    if (this.beamCooldown > 0) {
      this.beamCooldown--;
    } else if (canAct && phase >= 2 && t) {
      const numBeams = phase === 3 ? 4 : 2;
      for (let i = 0; i < numBeams; i++) {
        const spread = (i - Math.floor(numBeams / 2)) * 95;
        const bx = clamp(t.cx() + spread + (Math.random() - 0.5) * 70, 40, 860);
        bossBeams.push({ x: bx, warningTimer: 300, activeTimer: 0, phase: 'warning', done: false });
      }
      this.beamCooldown = phase === 3 ? 280 : 560;
      this.postSpecialPause = 90; // 1.5s pause after summoning beams
      showBossDialogue(randChoice(['Nowhere to hide!', 'Feel the void!', 'Dodge THIS!', 'From below!', 'The light will take you!']));
    }

    // HP-threshold monologue (fires once per threshold crossing) — scaled for 3000 HP
    const hpLines = [
      { hp: 2999, text: 'I have taught you everything you know, but not everything I know — bring it on!' },
      { hp: 2600, text: 'Ha. You tickle.' },
      { hp: 2200, text: 'Interesting... you\'re persistent.' },
      { hp: 2000, text: 'Phase two begins. This is where it gets real.' },
      { hp: 1600, text: 'I\'m just warming up.' },
      { hp: 1200, text: 'Fine. No more holding back!' },
      { hp: 1000, text: 'PHASE THREE. Feel my full power!' },
      { hp: 600,  text: 'You\'re stronger than I thought...' },
      { hp: 300,  text: 'Impossible... HOW?!' },
      { hp: 100,  text: 'I... WILL NOT... FALL HERE!' },
    ];
    for (const { hp, text } of hpLines) {
      if (this.health <= hp && !this.phaseDialogueFired.has(hp)) {
        this.phaseDialogueFired.add(hp);
        showBossDialogue(text, 280);
        break; // one at a time
      }
    }

    if (Math.random() < 0.025) this.aiReact = 2; // tighter reaction window than base AI
  }
}

// ============================================================
// BACKSTAGE PORTAL HELPERS
// ============================================================
function openBackstagePortal(cx, cy, type) {
  const words = ['if','for','let','const','function','return','true','false','null',
                 '&&','||','=>','{','}','()','0','1','new','this','class','extends',
                 'import','export','while','switch','break','typeof','void'];
  const chars = [];
  for (let _i = 0; _i < 35; _i++) {
    chars.push({
      x:     (Math.random() * 90) - 45,
      y:     (Math.random() * 160) - 80,
      char:  words[Math.floor(Math.random() * words.length)],
      speed: 0.6 + Math.random() * 1.8,
      alpha: 0.35 + Math.random() * 0.55,
      color: ['#00ff88','#00cc66','#88ffaa','#44ff00','#aaffaa','#ffffff'][Math.floor(Math.random()*6)]
    });
  }
  backstagePortals.push({ x: cx, y: cy, type, phase: 'opening', timer: 0, radius: 0, maxRadius: 58, codeChars: chars, done: false });
}

function drawBackstagePortals() {
  for (const bp of backstagePortals) {
    if (bp.done) continue;
    bp.timer++;
    if (bp.phase === 'opening') {
      bp.radius = bp.maxRadius * Math.min(1, (bp.timer / 35) * (bp.timer / 35) * 2);
      if (bp.timer >= 35) bp.phase = 'open';
    } else if (bp.phase === 'open') {
      bp.radius = bp.maxRadius;
      bp.openTimer = (bp.openTimer || 0) + 1;
      if (bp.openTimer >= 300) bp.phase = 'closing'; // auto-close after 5s
    } else if (bp.phase === 'closing') {
      bp.radius = Math.max(0, bp.radius - 2.8);
      if (bp.radius <= 0) { bp.done = true; continue; }
    }
    const rw = bp.radius * 0.55;
    const rh = bp.radius;
    ctx.save();
    ctx.beginPath();
    ctx.ellipse(bp.x, bp.y, Math.max(0.1, rw), Math.max(0.1, rh), 0, 0, Math.PI * 2);
    ctx.fillStyle = '#000008';
    ctx.fill();
    ctx.save();
    ctx.beginPath();
    ctx.ellipse(bp.x, bp.y, Math.max(0.1, rw - 2), Math.max(0.1, rh - 2), 0, 0, Math.PI * 2);
    ctx.clip();
    ctx.font = '8px monospace';
    ctx.textAlign = 'left';
    for (const c of bp.codeChars) {
      c.y += c.speed;
      if (c.y > rh + 14) c.y = -rh - 14;
      ctx.globalAlpha = c.alpha * (bp.radius / bp.maxRadius);
      ctx.fillStyle   = c.color;
      ctx.fillText(c.char, bp.x + c.x - 28, bp.y + c.y);
    }
    ctx.restore();
    ctx.globalAlpha = bp.radius / bp.maxRadius;
    ctx.strokeStyle = '#cc00ff';
    ctx.lineWidth   = 3.5;
    ctx.shadowColor = '#9900ee';
    ctx.shadowBlur  = 22;
    ctx.beginPath();
    ctx.ellipse(bp.x, bp.y, Math.max(0.1, rw), Math.max(0.1, rh), 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(200,0,255,0.4)';
    ctx.lineWidth   = 1;
    ctx.shadowBlur  = 8;
    for (let _i = 0; _i < 3; _i++) {
      const _sa = (frameCount * 0.04 + _i * 2.1) % (Math.PI * 2);
      ctx.beginPath();
      ctx.arc(bp.x, bp.y, rw * (0.35 + _i * 0.18), _sa, _sa + Math.PI * 1.3);
      ctx.stroke();
    }
    ctx.restore();
  }
  backstagePortals = backstagePortals.filter(bp => !bp.done);
}

// ============================================================
// BOSS TELEPORT
// ============================================================
function bossTeleport(boss, isForced = false) {
  if (!currentArena) return;
  const validPlatforms = currentArena.platforms.filter(pl => !pl.isFloor && !pl.isFloorDisabled);
  let target = validPlatforms.length > 0 ? randChoice(validPlatforms)
    : currentArena.platforms.find(pl => !pl.isFloorDisabled);

  let destX, destY;
  if (target) {
    destX = clamp(target.x + target.w / 2 - boss.w / 2, 0, GAME_W - boss.w);
    destY = target.y - boss.h - 2;
  } else {
    destX = GAME_W / 2 - boss.w / 2;
    destY = 200;
  }

  const oldX = boss.cx();
  const oldY = boss.cy();

  if (!isForced) {
    // === BACKSTAGE PORTAL TELEPORT (3-second animation) ===
    openBackstagePortal(oldX, oldY, 'entry');
    boss.backstageHiding = true;
    boss.invincible      = 9999;
    boss.teleportCooldown = 900;
    boss.vx = 0;
    boss.vy = 0;

    // t=1.5s: open exit portal at destination
    setTimeout(() => {
      if (!gameRunning) return;
      openBackstagePortal(destX + boss.w / 2, destY + boss.h / 2, 'exit');
    }, 1500);

    // t=2.5s: boss reappears
    setTimeout(() => {
      if (!gameRunning) return;
      boss.x = destX;
      boss.y = destY;
      boss.vx = 0;
      boss.vy = 0;
      boss.backstageHiding = false;
      boss.invincible      = 60;
      boss.postTeleportCrit = 120;        // 2s crit window
      boss.postPortalAttackBlock = 60;    // boss can't attack for 1s after portal exit
      showBossDialogue(randChoice(['Now you see me...', 'Try to follow me!', 'Blink!', 'You\'re too slow!']));
      // Close entry portal
      setTimeout(() => {
        for (const bp of backstagePortals) { if (bp.type === 'entry' && bp.phase === 'open') bp.phase = 'closing'; }
      }, 500);
      // Close exit portal
      setTimeout(() => {
        for (const bp of backstagePortals) { if (bp.type === 'exit'  && bp.phase === 'open') bp.phase = 'closing'; }
      }, 1200);
    }, 2500);

  } else {
    // Forced teleport: instant (falling into hazard)
    boss.x = destX;
    boss.y = destY;
    boss.vx = 0;
    boss.vy = 0;
    spawnParticles(oldX, oldY, '#9900ee', 18);
    spawnParticles(oldX, oldY, '#cc00ff', 10);
    spawnParticles(boss.cx(), boss.cy(), '#9900ee', 18);
    spawnParticles(boss.cx(), boss.cy(), '#cc00ff', 10);
    boss.forcedTeleportFlash = 20;
    showBossDialogue('You really thought I would go down that easily?', 300);
  }
}

// ============================================================
// TRUE FORM  (secret final boss — player-sized, void arena only)
// ============================================================
class TrueForm extends Fighter {
  constructor() {
    const noCtrl = { left: null, right: null, jump: null, attack: null, ability: null, super: null };
    super(450, 350, '#000000', 'gauntlet', noCtrl, true, 'hard');
    // Override weapon to use a fist-style profile
    this.weapon = Object.assign({}, WEAPONS.gauntlet, {
      name: 'Fists', damage: 20, range: 48, cooldown: 22, kb: 7,
      contactDmgMult: 0,
      ability() {}
    });
    this.name          = 'TRUE FORM';
    this.health        = 5000;
    this.maxHealth     = 5000;
    this.w             = 18;
    this.h             = 50;
    this.isBoss        = true;
    this.isTrueForm    = true;
    this.lives         = 1;
    this.spawnX        = 450;
    this.spawnY        = 350;
    this.playerNum     = 2;
    this.color         = '#000000';
    this.kbResist      = 0.90;  // nearly no knockback — lowest in game
    this.kbBonus       = 0.55;  // deals low KB for tight combos
    this.attackCooldownMult = 0.45;
    this.superChargeRate    = 0; // no super meter
    this._tfSpeed      = 4.2;   // 1.3× normal fighter speed
    this._attackMode   = 'punch'; // alternates punch/kick
    // Combo tracking (max 4 hits, max 85% maxHP damage per combo)
    this._comboCount   = 0;
    this._comboDamage  = 0;
    this._comboTimer   = 0;
    // Special move cooldowns (in frames)
    this._gravityCd    = 300;
    this._warpCd       = 600;
    this._holeCd       = 300;
    this._floorCd      = 900;
    this._invertCd     = 360;
    this._sizeCd       = 360;
    this._portalCd     = 240;
    this.postSpecialPause = 0;
    this._lastPhase    = 1;
    this._maxLives     = 1;
  }

  getPhase() {
    if (this.health > 3500) return 1;  // >70% HP
    if (this.health > 1500) return 2;  // 30–70% HP
    return 3;                           // <30% HP
  }

  attack(target) {
    if (this.cooldown > 0 || this.health <= 0 || this.stunTimer > 0 || this.ragdollTimer > 0) return;
    if (this.postSpecialPause > 0) return;
    // Combo cap: max 4 hits per combo burst
    if (this._comboCount >= 4) return;
    // Damage cap: combo cannot deal more than 85% of target's maxHP
    if (target && this._comboDamage >= target.maxHealth * 0.85) return;
    // Alternate punch / kick
    this._attackMode = this._attackMode === 'punch' ? 'kick' : 'punch';
    this.weaponHit   = false;
    this.swingHitTargets.clear();
    this.cooldown    = Math.max(1, Math.ceil(this.weapon.cooldown * this.attackCooldownMult));
    this.attackTimer = this.attackDuration;
    this._comboCount++;
    this._comboTimer = 0;
  }

  updateAI() {
    if (this.aiReact > 0) { this.aiReact--; return; }
    if (this.ragdollTimer > 0 || this.stunTimer > 0) return;
    if (this.postSpecialPause > 0) { this.postSpecialPause--; return; }

    const phase = this.getPhase();
    if (phase > this._lastPhase) {
      this._lastPhase = phase;
      if (settings.screenShake) screenShake = Math.max(screenShake, 22);
    }

    // Combo reset: if no new attack for 90 frames, reset combo window
    this._comboTimer++;
    if (this._comboTimer > 90) {
      this._comboCount  = 0;
      this._comboDamage = 0;
    }

    // Tick special cooldowns
    if (this._gravityCd > 0) this._gravityCd--;
    if (this._warpCd    > 0) this._warpCd--;
    if (this._holeCd    > 0) this._holeCd--;
    if (this._floorCd   > 0) this._floorCd--;
    if (this._invertCd  > 0) this._invertCd--;
    if (this._sizeCd    > 0) this._sizeCd--;
    if (this._portalCd  > 0) this._portalCd--;

    // Floor-removal countdown
    if (tfFloorRemoved) {
      tfFloorTimer--;
      if (tfFloorTimer <= 0) {
        tfFloorRemoved = false;
        const floorPl = currentArena.platforms.find(p => p.isFloor);
        if (floorPl) floorPl.isFloorDisabled = false;
        showBossDialogue('Ground restored.', 150);
      }
    }

    const t = this.target;
    if (!t || t.health <= 0) return;

    const dx  = t.cx() - this.cx();
    const d   = Math.abs(dx);
    const dir = dx > 0 ? 1 : -1;
    const spd = phase === 3 ? this._tfSpeed * 1.25 : phase === 2 ? this._tfSpeed * 1.12 : this._tfSpeed;

    this.facing = dir;

    // --- Special move trigger ---
    const specialFreq = phase === 3 ? 0.012 : phase === 2 ? 0.008 : 0.004;
    if (Math.random() < specialFreq) {
      const avail = this._getAvailableSpecials(phase);
      if (avail.length > 0) {
        this._doSpecial(avail[Math.floor(Math.random() * avail.length)], t);
        return; // pause to perform special
      }
    }

    // --- Movement: chase to melee range ---
    // Avoid floor when floor is removed
    if (tfFloorRemoved && !this.onGround) {
      const floorY = 460;
      if (this.y + this.h > floorY - 30 && this.vy > 0) {
        this.vy = -14;
      }
    }

    if (d > 55) {
      this.vx = dir * spd;
    } else if (d < 30) {
      this.vx = -dir * spd * 0.5;
    }

    // Jump to chase if target is above
    if (t.y < this.y - 50 && this.onGround) this.vy = -16;
    // Edge avoidance
    const nearLeft  = this.x < 90;
    const nearRight = this.x + this.w > GAME_W - 90;
    if (nearLeft && dir < 0) this.vx = spd * 0.6;
    if (nearRight && dir > 0) this.vx = -spd * 0.6;

    // --- Attack ---
    const atkFreq = phase === 3 ? 0.060 : phase === 2 ? 0.042 : 0.028;
    if (d < 70 && Math.random() < atkFreq && this.cooldown <= 0) {
      this.attack(t);
    }
  }

  _getAvailableSpecials(phase) {
    const avail = [];
    if (this._portalCd  <= 0)               avail.push('portal');
    if (this._holeCd    <= 0)               avail.push('holes');
    if (this._sizeCd    <= 0)               avail.push('size');
    if (this._invertCd  <= 0)               avail.push('invert');
    if (this._warpCd    <= 0 && phase >= 2) avail.push('warp');
    if (this._gravityCd <= 0 && phase >= 2) avail.push('gravity');
    if (this._floorCd   <= 0 && phase >= 2 && !tfFloorRemoved) avail.push('floor');
    return avail;
  }

  _doSpecial(move, target) {
    this.postSpecialPause = 55;
    this._comboCount  = 0;
    this._comboDamage = 0;
    switch (move) {
      case 'gravity':
        tfGravityInverted = !tfGravityInverted;
        this._gravityCd = 720;
        showBossDialogue(tfGravityInverted ? 'Down is up now.' : 'Gravity returns.', 180);
        spawnParticles(this.cx(), this.cy(), '#ffffff', 22);
        break;
      case 'warp': {
        const warpPool = Object.keys(ARENAS).filter(k => !['creator','void'].includes(k));
        const newKey   = warpPool[Math.floor(Math.random() * warpPool.length)];
        tfWarpArena(newKey);
        this._warpCd = 1200;
        showBossDialogue('A new stage.', 150);
        break;
      }
      case 'holes':
        spawnTFBlackHoles();
        this._holeCd = 540;
        showBossDialogue('Consume.', 110);
        break;
      case 'floor': {
        tfFloorRemoved = true;
        tfFloorTimer   = 1200; // 20 seconds at 60fps
        this._floorCd  = 1800;
        const floorPl = currentArena.platforms.find(p => p.isFloor);
        if (floorPl) floorPl.isFloorDisabled = true;
        showBossDialogue('There is no ground to stand on.', 240);
        spawnParticles(GAME_W / 2, 465, '#000000', 30);
        spawnParticles(GAME_W / 2, 465, '#ffffff', 15);
        break;
      }
      case 'invert':
        tfControlsInverted = !tfControlsInverted;
        this._invertCd = 540;
        showBossDialogue(tfControlsInverted ? 'Your body refuses you.' : 'Control returns.', 180);
        spawnParticles(this.cx(), this.cy(), '#aaaaaa', 16);
        break;
      case 'size': {
        const t = this.target;
        if (t) {
          const scales = [0.4, 0.55, 0.7, 1.0, 1.25, 1.5];
          tfSetSize(t, scales[Math.floor(Math.random() * scales.length)]);
        }
        if (Math.random() < 0.45) {
          tfSetSize(this, clamp(0.5 + Math.random() * 0.9, 0.4, 1.5));
        }
        this._sizeCd = 480;
        showBossDialogue('Size means nothing here.', 180);
        break;
      }
      case 'portal':
        tfPortalTeleport(this, target);
        this._portalCd = 360;
        break;
    }
  }

  draw() {
    if (this.backstageHiding) return;
    if (this.health <= 0 && this.ragdollTimer <= 0) return;
    ctx.save();

    // Invincibility blink
    if (this.invincible > 0 && Math.floor(this.invincible / 5) % 2 === 1) {
      ctx.globalAlpha = 0.35;
    }

    const cx = this.cx();
    const ty = this.y;
    const f  = this.facing;
    const s  = this.state;
    const t  = this.animTimer;

    // Visual size scale
    if (this.tfDrawScale && this.tfDrawScale !== 1) {
      const pivX = cx; const pivY = ty + this.h;
      ctx.translate(pivX, pivY);
      ctx.scale(this.tfDrawScale, this.tfDrawScale);
      ctx.translate(-pivX, -pivY);
    }

    if (this.ragdollTimer > 0) {
      ctx.translate(cx, ty + this.h * 0.45);
      ctx.rotate(this.ragdollAngle);
      ctx.translate(-cx, -(ty + this.h * 0.45));
    }

    const headR     = 9;
    const headCY    = ty + headR + 1;
    const neckY     = headCY + headR + 1;
    const shoulderY = neckY + 4;
    const hipY      = shoulderY + 24;
    const armLen    = 20;
    const legLen    = 22;

    // White outline glow
    ctx.shadowColor = '#ffffff';
    ctx.shadowBlur  = 8;
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth   = 2.5;
    ctx.lineCap     = 'round';
    ctx.lineJoin    = 'round';

    // HEAD — solid black, white outline
    ctx.beginPath();
    ctx.arc(cx, headCY, headR, 0, Math.PI * 2);
    ctx.fillStyle = '#000000';
    ctx.fill();
    ctx.stroke();

    // White eyes (slit / dots)
    ctx.shadowBlur = 0;
    ctx.fillStyle  = '#ffffff';
    ctx.beginPath();
    ctx.arc(cx + f * 3.5, headCY - 1.5, 1.8, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 8;

    // BODY
    ctx.beginPath();
    ctx.moveTo(cx, neckY);
    ctx.lineTo(cx, hipY);
    ctx.stroke();

    // ARM ANGLES — punch vs kick
    const atkP = this.attackDuration > 0 ? 1 - this.attackTimer / this.attackDuration : 0;
    let rAng, lAng;
    if (s === 'ragdoll') {
      const fl = Math.sin(t * 0.38) * 1.4;
      rAng = this.ragdollAngle * 1.2 + fl;
      lAng = this.ragdollAngle * 1.2 + Math.PI - fl;
    } else if (s === 'stunned') {
      rAng = Math.PI * 0.75; lAng = Math.PI * 0.25;
    } else if (s === 'attacking') {
      if (this._attackMode === 'punch') {
        if (f > 0) { rAng = lerp(-0.15, 0.05, atkP); lAng = lerp(Math.PI * 0.8, Math.PI * 0.62, atkP); }
        else       { rAng = lerp(Math.PI + 0.15, Math.PI - 0.05, atkP); lAng = lerp(Math.PI * 0.2, Math.PI * 0.38, atkP); }
      } else {
        // Kick: arms rise slightly, legs extend
        rAng = f > 0 ? -0.55 : Math.PI + 0.55;
        lAng = f > 0 ?  Math.PI * 0.65 : Math.PI * 0.35;
      }
    } else if (s === 'walking') {
      const sw = Math.sin(t * 0.24) * 0.52;
      rAng = Math.PI * 0.58 + sw; lAng = Math.PI * 0.42 - sw;
    } else if (s === 'jumping' || s === 'falling') {
      rAng = -0.25; lAng = Math.PI + 0.25;
    } else {
      rAng = Math.PI * 0.58; lAng = Math.PI * 0.42;
    }

    const rEx = cx + Math.cos(rAng) * armLen;
    const rEy = shoulderY + Math.sin(rAng) * armLen;
    const lEx = cx + Math.cos(lAng) * armLen;
    const lEy = shoulderY + Math.sin(lAng) * armLen;
    ctx.beginPath(); ctx.moveTo(cx, shoulderY); ctx.lineTo(rEx, rEy); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(cx, shoulderY); ctx.lineTo(lEx, lEy); ctx.stroke();

    // Fist indicator at punch impact
    if (s === 'attacking' && this._attackMode === 'punch' && atkP > 0.5) {
      ctx.beginPath();
      ctx.arc(rEx, rEy, 5.5, 0, Math.PI * 2);
      ctx.fillStyle = '#000000'; ctx.fill(); ctx.stroke();
    }

    // LEGS
    let rLeg, lLeg;
    if (s === 'ragdoll') {
      const lf = Math.sin(t * 0.35) * 1.1 + this.ragdollAngle * 0.8;
      rLeg = Math.PI * 0.5 + lf; lLeg = Math.PI * 0.5 - lf + 0.4;
    } else if (s === 'attacking' && this._attackMode === 'kick') {
      rLeg = f > 0 ? lerp(Math.PI * 0.52, Math.PI * 0.12, atkP) : lerp(Math.PI * 0.48, Math.PI * 0.88, atkP);
      lLeg = Math.PI * 0.52;
    } else if (s === 'walking') {
      const sw = Math.sin(t * 0.24) * 0.55;
      rLeg = Math.PI * 0.5 + sw; lLeg = Math.PI * 0.5 - sw;
    } else if (s === 'jumping') {
      rLeg = Math.PI * 0.35; lLeg = Math.PI * 0.65;
    } else {
      rLeg = Math.PI * 0.54; lLeg = Math.PI * 0.46;
    }

    const rLx = cx + Math.cos(rLeg) * legLen;
    const rLy = hipY + Math.sin(rLeg) * legLen;
    const lLx = cx + Math.cos(lLeg) * legLen;
    const lLy = hipY + Math.sin(lLeg) * legLen;
    ctx.beginPath(); ctx.moveTo(cx, hipY); ctx.lineTo(rLx, rLy); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(cx, hipY); ctx.lineTo(lLx, lLy); ctx.stroke();

    // Kick foot indicator
    if (s === 'attacking' && this._attackMode === 'kick' && atkP > 0.5) {
      ctx.beginPath();
      ctx.arc(rLx, rLy, 5.5, 0, Math.PI * 2);
      ctx.fillStyle = '#000000'; ctx.fill(); ctx.stroke();
    }

    ctx.restore();

    // HP bar above head
    ctx.save();
    const barW = 64, barH = 5;
    const barX = cx - barW / 2, barY = this.y - 16;
    ctx.fillStyle = 'rgba(0,0,0,0.8)';
    ctx.fillRect(barX - 1, barY - 1, barW + 2, barH + 2);
    const hpPct = this.health / this.maxHealth;
    ctx.fillStyle = hpPct > 0.5 ? '#ffffff' : hpPct > 0.25 ? '#aaaaaa' : '#666666';
    ctx.fillRect(barX, barY, barW * hpPct, barH);
    ctx.restore();
  }
}

// ---- True Form helper functions ----
function spawnTFBlackHoles() {
  // Spawn 2–3 black holes at random positions across the arena
  const count = 2 + Math.floor(Math.random() * 2);
  for (let i = 0; i < count; i++) {
    tfBlackHoles.push({
      x:        100 + Math.random() * (GAME_W - 200),
      y:        120 + Math.random() * 200,
      r:        28,
      maxTimer: 360, // 6 seconds
      timer:    360,
    });
  }
}

function updateTFBlackHoles() {
  if (!tfBlackHoles.length) return;
  for (let i = tfBlackHoles.length - 1; i >= 0; i--) {
    const bh = tfBlackHoles[i];
    bh.timer--;
    if (bh.timer <= 0) { tfBlackHoles.splice(i, 1); continue; }

    // Pull all non-boss players toward the black hole
    for (const p of players) {
      if (p.isBoss || p.health <= 0) continue;
      const dx = bh.x - p.cx();
      const dy = bh.y - (p.y + p.h / 2);
      const d  = Math.hypot(dx, dy);
      if (d < 160 && d > 0.5) {
        const pull = 0.55 * (1 - d / 160);
        p.vx += (dx / d) * pull;
        p.vy += (dy / d) * pull;
      }
      // Deal damage if very close
      if (d < bh.r + 8 && p.invincible <= 0) {
        dealDamage(players.find(q => q.isTrueForm) || players[1], p, 35, 0);
        spawnParticles(p.cx(), p.cy(), '#000000', 10);
        spawnParticles(p.cx(), p.cy(), '#ffffff', 6);
      }
    }
  }
}

function drawTFBlackHoles() {
  for (const bh of tfBlackHoles) {
    ctx.save();
    const alpha = bh.timer < 60 ? bh.timer / 60 : 1;
    // Outer pull ring
    const outerR = bh.r + 18 + Math.sin(frameCount * 0.12) * 4;
    const gOuter = ctx.createRadialGradient(bh.x, bh.y, bh.r, bh.x, bh.y, outerR);
    gOuter.addColorStop(0, 'rgba(0,0,0,0)');
    gOuter.addColorStop(1, `rgba(255,255,255,${0.08 * alpha})`);
    ctx.fillStyle = gOuter;
    ctx.beginPath(); ctx.arc(bh.x, bh.y, outerR, 0, Math.PI * 2); ctx.fill();
    // Black hole core
    const g = ctx.createRadialGradient(bh.x, bh.y, 0, bh.x, bh.y, bh.r);
    g.addColorStop(0, `rgba(0,0,0,${alpha})`);
    g.addColorStop(0.7, `rgba(10,10,10,${alpha})`);
    g.addColorStop(1, `rgba(40,40,40,0)`);
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(bh.x, bh.y, bh.r, 0, Math.PI * 2); ctx.fill();
    // White outline
    ctx.strokeStyle = `rgba(255,255,255,${0.6 * alpha})`;
    ctx.lineWidth   = 1.2;
    ctx.shadowColor = '#ffffff'; ctx.shadowBlur = 6;
    ctx.beginPath(); ctx.arc(bh.x, bh.y, bh.r, 0, Math.PI * 2); ctx.stroke();
    ctx.restore();
  }
}

function tfWarpArena(key) {
  if (!ARENAS[key]) return;
  currentArenaKey = key;
  currentArena    = ARENAS[key];
  // Randomize layout if safe
  if (key !== 'lava') randomizeArenaLayout(key);
  generateBgElements();
  initMapPerks(key);
  // Reset floor state
  const floorPl = currentArena.platforms.find(p => p.isFloor);
  if (floorPl) floorPl.isFloorDisabled = false;
  tfFloorRemoved = false;
  if (settings.screenShake) screenShake = Math.max(screenShake, 22);
  spawnParticles(GAME_W / 2, GAME_H / 2, '#ffffff', 40);
}

function tfPortalTeleport(tf, target) {
  if (!target || !tf) return;
  const destX = clamp(target.x + target.w / 2 - tf.w / 2, 10, GAME_W - tf.w - 10);
  const destY = target.y - tf.h - 4;
  // Black portal flash
  spawnParticles(tf.cx(), tf.cy(), '#000000', 20);
  spawnParticles(tf.cx(), tf.cy(), '#ffffff', 10);
  setTimeout(() => {
    if (!gameRunning) return;
    tf.x  = destX;
    tf.y  = destY;
    tf.vx = 0; tf.vy = 0;
    spawnParticles(tf.cx(), tf.cy(), '#000000', 20);
    spawnParticles(tf.cx(), tf.cy(), '#ffffff', 10);
    if (settings.screenShake) screenShake = Math.max(screenShake, 12);
  }, 350);
}

function tfSetSize(fighter, scale) {
  if (!fighter) return;
  // Restore original size first
  if (tfSizeTargets.has(fighter)) {
    const orig = tfSizeTargets.get(fighter);
    fighter.w = orig.w; fighter.h = orig.h;
  } else {
    tfSizeTargets.set(fighter, { w: fighter.w, h: fighter.h });
  }
  fighter.w        = Math.round(fighter.w * scale);
  fighter.h        = Math.round(fighter.h * scale);
  fighter.tfDrawScale = scale;
}

function resetTFState() {
  tfGravityInverted  = false;
  tfControlsInverted = false;
  tfFloorRemoved     = false;
  tfFloorTimer       = 0;
  tfBlackHoles       = [];
  tfSizeTargets.clear();
  // Restore void arena floor
  if (ARENAS.void) {
    const floorPl = ARENAS.void.platforms.find(p => p.isFloor);
    if (floorPl) floorPl.isFloorDisabled = false;
  }
}

// ============================================================
// BACKGROUND GENERATION (pre-computed to avoid flicker)
// ============================================================
function generateBgElements() {
  bgStars = Array.from({ length: 110 }, () => ({
    x:       Math.random() * 900,
    y:       Math.random() * 420,
    r:       0.4 + Math.random() * 1.8,
    phase:   Math.random() * Math.PI * 2,
    speed:   0.02 + Math.random() * 0.04
  }));

  bgBuildings = [];
  let bx = 0;
  while (bx < 940) {
    const bw = 55 + Math.random() * 85;
    const bh = 110 + Math.random() * 260;
    const wins = [];
    for (let wy = GAME_H - bh + 14; wy < GAME_H - 18; wy += 17) {
      for (let wx = bx + 8; wx < bx + bw - 8; wx += 14) {
        wins.push({ x: wx, y: wy, on: Math.random() > 0.28 });
      }
    }
    bgBuildings.push({ x: bx, w: bw, h: bh, wins });
    bx += bw + 4;
  }
}

// ============================================================
// DRAWING
// ============================================================
function drawBackground() {
  const a = currentArena;
  const g = ctx.createLinearGradient(0, 0, 0, GAME_H);
  g.addColorStop(0, a.sky[0]);
  g.addColorStop(1, a.sky[1]);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, GAME_W, GAME_H);

  if (currentArenaKey === 'space')   drawStars();
  if (currentArenaKey === 'grass')   drawClouds();
  if (currentArenaKey === 'lava')    drawLava();
  if (currentArenaKey === 'city')    drawCityBuildings();
  if (currentArenaKey === 'creator') drawCreatorArena();
  if (currentArenaKey === 'forest')  drawForest();
  if (currentArenaKey === 'ice')     drawIce();
  if (currentArenaKey === 'ruins')   drawRuins();
  if (currentArenaKey === 'void')    drawVoidArena();
}

function drawVoidArena() {
  // Subtle void distortion rings
  ctx.save();
  for (let i = 0; i < 4; i++) {
    const pulse = (frameCount * 0.008 + i * 1.4) % (Math.PI * 2);
    const r = 90 + i * 60 + Math.sin(pulse) * 20;
    const alpha = 0.04 + Math.sin(pulse) * 0.02;
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(GAME_W / 2, GAME_H / 2, r, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
  ctx.restore();
}

function drawCreatorArena() {
  // Pulsing void portals in the background
  for (let i = 0; i < 6; i++) {
    const bx = (i * 160 + Math.sin(frameCount * 0.007 + i * 1.1) * 55) % 900;
    const by = 80 + Math.sin(frameCount * 0.011 + i * 1.4) * 70;
    const r  = 35 + Math.sin(frameCount * 0.019 + i) * 12;
    const g  = ctx.createRadialGradient(bx, by, 0, bx, by, r);
    g.addColorStop(0, 'rgba(200,0,255,0.14)');
    g.addColorStop(1, 'rgba(80,0,140,0)');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(bx, by, r, 0, Math.PI * 2); ctx.fill();
  }
  // Draw lava on floor if active hazard
  if (bossFloorState === 'hazard' && bossFloorType === 'lava') {
    const ly = 460;
    const lg = ctx.createLinearGradient(0, ly, 0, GAME_H);
    lg.addColorStop(0,   '#ff6600');
    lg.addColorStop(0.3, '#cc2200');
    lg.addColorStop(1,   '#880000');
    ctx.fillStyle = lg;
    ctx.beginPath();
    ctx.moveTo(0, ly);
    for (let x = 0; x <= GAME_W; x += 18) {
      ctx.lineTo(x, ly + Math.sin(x * 0.055 + frameCount * 0.07) * 7);
    }
    ctx.lineTo(GAME_W, GAME_H);
    ctx.lineTo(0, GAME_H);
    ctx.closePath();
    ctx.fill();
    ctx.shadowColor = '#ff4400';
    ctx.shadowBlur  = 20;
    ctx.fillStyle   = 'rgba(255,80,0,0.22)';
    ctx.fillRect(0, ly - 10, GAME_W, 12);
    ctx.shadowBlur  = 0;
  }

  // Invisible walls — glowing neon energy barriers on left and right
  const wallPulse = 0.35 + Math.abs(Math.sin(frameCount * 0.04)) * 0.45;
  ctx.save();
  for (const wallX of [0, GAME_W]) {
    const grad = ctx.createLinearGradient(
      wallX === 0 ? 0 : GAME_W - 14, 0,
      wallX === 0 ? 14 : GAME_W, 0
    );
    grad.addColorStop(0, `rgba(180,0,255,${wallPulse})`);
    grad.addColorStop(1, 'rgba(180,0,255,0)');
    ctx.fillStyle = grad;
    ctx.fillRect(wallX === 0 ? 0 : GAME_W - 14, 0, 14, GAME_H);
  }
  ctx.restore();
}

function drawStars() {
  for (const s of bgStars) {
    const alpha = 0.3 + Math.abs(Math.sin(frameCount * s.speed + s.phase)) * 0.7;
    ctx.globalAlpha = alpha;
    ctx.fillStyle   = s.r < 1 ? '#ffffff' : '#aabbff';
    ctx.beginPath();
    ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

function drawClouds() {
  const offsets = [100, 420, 700];
  const speeds  = [0.18, 0.12, 0.22];
  const sizes   = [30, 24, 36];
  const ys      = [55, 88, 45];
  ctx.fillStyle = 'rgba(255,255,255,0.72)';
  for (let i = 0; i < 3; i++) {
    const cx = ((frameCount * speeds[i] + offsets[i]) % 1000) - 60;
    const cy = ys[i];
    const r  = sizes[i];
    ctx.beginPath();
    ctx.arc(cx,         cy,       r,       0, Math.PI*2);
    ctx.arc(cx + r*0.8, cy - r*0.3, r*0.7, 0, Math.PI*2);
    ctx.arc(cx - r*0.6, cy - r*0.2, r*0.6, 0, Math.PI*2);
    ctx.fill();
  }
}

function drawLava() {
  const ly = currentArena.lavaY;
  const lg = ctx.createLinearGradient(0, ly, 0, GAME_H);
  lg.addColorStop(0,   '#ff6600');
  lg.addColorStop(0.3, '#cc2200');
  lg.addColorStop(1,   '#880000');
  ctx.fillStyle = lg;
  ctx.beginPath();
  ctx.moveTo(0, ly);
  for (let x = 0; x <= GAME_W; x += 18) {
    ctx.lineTo(x, ly + Math.sin(x * 0.055 + frameCount * 0.07) * 7);
  }
  ctx.lineTo(GAME_W, GAME_H);
  ctx.lineTo(0, GAME_H);
  ctx.closePath();
  ctx.fill();
  // glow
  ctx.shadowColor = '#ff4400';
  ctx.shadowBlur  = 22;
  ctx.fillStyle   = 'rgba(255,80,0,0.28)';
  ctx.fillRect(0, ly - 10, GAME_W, 12);
  ctx.shadowBlur  = 0;
}

function drawCityBuildings() {
  for (const b of bgBuildings) {
    const shade = 14 + Math.floor(b.h / 20);
    ctx.fillStyle = `rgb(${shade},${shade},${shade+12})`;
    ctx.fillRect(b.x, GAME_H - b.h, b.w, b.h);
    // windows
    for (const w of b.wins) {
      ctx.fillStyle = w.on ? 'rgba(255,245,160,0.65)' : 'rgba(40,40,60,0.5)';
      ctx.fillRect(w.x, w.y, 7, 9);
    }
  }
}

function drawForest() {
  // Animated trees in background
  const treeXs = [45, 140, 280, 480, 620, 760, 860];
  for (let i = 0; i < treeXs.length; i++) {
    const tx   = treeXs[i];
    const sway = Math.sin(frameCount * 0.008 + i * 1.2) * 3;
    // trunk
    ctx.fillStyle = '#3a2010';
    ctx.fillRect(tx - 5, 400, 10, 80);
    // canopy layers
    const shades = ['rgba(30,90,30,0.7)', 'rgba(45,120,40,0.65)', 'rgba(60,150,50,0.6)'];
    for (let j = 0; j < 3; j++) {
      ctx.fillStyle = shades[j];
      ctx.beginPath();
      ctx.arc(tx + sway, 380 - j * 28, 32 - j * 4, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  // Fireflies / floating particles
  for (let i = 0; i < 6; i++) {
    const fx = (frameCount * (0.4 + i * 0.15) + i * 150) % 920 - 10;
    const fy = 200 + Math.sin(frameCount * 0.02 + i * 2.1) * 80;
    const fa = 0.4 + Math.sin(frameCount * 0.08 + i) * 0.4;
    ctx.globalAlpha = Math.max(0, fa);
    ctx.fillStyle   = '#ccff44';
    ctx.beginPath();
    ctx.arc(fx, fy, 2.5, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

function drawIce() {
  // Snow particles falling
  for (let i = 0; i < 12; i++) {
    const sx = ((frameCount * (0.6 + i * 0.1) + i * 75) % 930) - 15;
    const sy = ((frameCount * (1.2 + i * 0.08) + i * 42) % 520);
    const sa = 0.3 + (i % 3) * 0.2;
    ctx.globalAlpha = sa;
    ctx.fillStyle   = '#ffffff';
    ctx.beginPath();
    ctx.arc(sx, sy, 1.5 + (i % 3), 0, Math.PI * 2);
    ctx.fill();
  }
  // Ice crystals on ground
  ctx.globalAlpha = 0.55;
  ctx.strokeStyle = '#aaddff';
  ctx.lineWidth   = 1.5;
  for (let i = 0; i < 8; i++) {
    const cx2 = 60 + i * 115;
    const cy2 = 455;
    for (let a = 0; a < 3; a++) {
      const ang = (a / 3) * Math.PI;
      ctx.beginPath();
      ctx.moveTo(cx2, cy2);
      ctx.lineTo(cx2 + Math.cos(ang) * 14, cy2 + Math.sin(ang) * 14);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(cx2, cy2);
      ctx.lineTo(cx2 - Math.cos(ang) * 14, cy2 - Math.sin(ang) * 14);
      ctx.stroke();
    }
  }
  ctx.globalAlpha = 1;
  ctx.lineWidth   = 1;
}

function drawRuins() {
  // Stone columns / pillars in background
  const cols = [50, 200, 360, 540, 700, 850];
  for (let i = 0; i < cols.length; i++) {
    const cx2 = cols[i];
    const broken = i % 3 === 0;
    const colH   = broken ? 180 + (i % 2) * 60 : 260;
    // Column body
    ctx.fillStyle = `rgba(80,65,48,0.55)`;
    ctx.fillRect(cx2 - 10, GAME_H - colH, 20, colH);
    // Column cap
    ctx.fillStyle = `rgba(100,82,58,0.65)`;
    ctx.fillRect(cx2 - 14, GAME_H - colH, 28, 12);
    // Column base
    ctx.fillStyle = `rgba(100,82,58,0.65)`;
    ctx.fillRect(cx2 - 14, GAME_H - 16, 28, 16);
  }
  // Ambient dust motes
  for (let i = 0; i < 5; i++) {
    const dx  = ((frameCount * (0.18 + i * 0.06) + i * 180) % 960) - 30;
    const dy  = 200 + ((frameCount * (0.22 + i * 0.04) + i * 90) % 280);
    const da  = 0.08 + Math.sin(frameCount * 0.03 + i) * 0.06;
    ctx.globalAlpha = Math.max(0, da);
    ctx.fillStyle   = '#c8a86a';
    ctx.beginPath();
    ctx.arc(dx, dy, 3, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

function drawPlatforms() {
  const isBoss = !!currentArena.isBossArena;
  const isVoid = !!currentArena.isVoidArena;
  for (const pl of currentArena.platforms) {
    if (pl.isFloorDisabled) continue;

    if (isVoid) {
      // Void arena: solid black with white outline — no shadow, no highlight
      ctx.fillStyle = '#000000';
      ctx.fillRect(pl.x, pl.y, pl.w, pl.h);
      ctx.save();
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1.5;
      ctx.shadowColor = '#fff';
      ctx.shadowBlur  = 4;
      ctx.strokeRect(pl.x, pl.y, pl.w, pl.h);
      ctx.restore();
      continue;
    }

    // shadow (skip for moving boss platforms — cheaper and avoids ghost trails)
    if (!pl.ox && !pl.oy) {
      ctx.fillStyle = 'rgba(0,0,0,0.22)';
      ctx.fillRect(pl.x + 4, pl.y + 4, pl.w, pl.h);
    }
    // body
    ctx.fillStyle = currentArena.platColor;
    ctx.fillRect(pl.x, pl.y, pl.w, pl.h);
    // top highlight
    ctx.fillStyle = 'rgba(255,255,255,0.22)';
    ctx.fillRect(pl.x, pl.y, pl.w, 3);
    // border
    ctx.strokeStyle = currentArena.platEdge;
    ctx.lineWidth   = 1.5;
    ctx.strokeRect(pl.x, pl.y, pl.w, pl.h);

    // Boss arena: purple glow on moving platforms
    if (isBoss && (pl.ox !== undefined || pl.oy !== undefined)) {
      ctx.save();
      ctx.strokeStyle = 'rgba(200,0,255,0.7)';
      ctx.lineWidth   = 2;
      ctx.shadowColor = '#aa00ff';
      ctx.shadowBlur  = 10;
      ctx.strokeRect(pl.x, pl.y, pl.w, pl.h);
      ctx.restore();
    }

    // Floor hazard flash during warning
    if (isBoss && pl.isFloor && bossFloorState === 'warning') {
      const flash = Math.sin(frameCount * 0.35) > 0;
      if (flash) {
        ctx.save();
        ctx.fillStyle = bossFloorType === 'lava' ? 'rgba(255,70,0,0.55)' : 'rgba(20,0,60,0.70)';
        ctx.fillRect(pl.x, pl.y, pl.w, pl.h);
        ctx.restore();
      }
    }
  }

  // Floor hazard countdown banner
  if (isBoss && bossFloorState === 'warning') {
    const secs = Math.ceil(bossFloorTimer / 60);
    const isLava = bossFloorType === 'lava';
    ctx.save();
    ctx.font        = 'bold 20px Arial';
    ctx.fillStyle   = isLava ? '#ff5500' : '#bb88ff';
    ctx.textAlign   = 'center';
    ctx.shadowColor = 'rgba(0,0,0,0.95)';
    ctx.shadowBlur  = 10;
    ctx.fillText(`${isLava ? '🌋 LAVA' : '🌑 VOID'} IN ${secs}s`, GAME_W / 2, 444);
    ctx.restore();
  }
}

// ============================================================
// DEATH / RESPAWN / WIN
// ============================================================
function checkDeaths() {
  for (const p of players) {
    if (p.health <= 0 && p.invincible === 0) {
      // Boss defeat: trigger cinematic scene instead of normal death
      if (p.isBoss && !bossDeathScene) { startBossDeathScene(p); continue; }
      if (p.isBoss && bossDeathScene)  { continue; } // handled by death scene
      SoundManager.death();
      const isMgSurvival = gameMode === 'minigames' && minigameType === 'survival' && !p.isBoss;
      if ((trainingMode || tutorialMode || isMgSurvival) && !p.isBoss) {
        // Training/tutorial/survival minigame: player respawns infinitely, no game-over
        addKillFeed(p);
        spawnParticles(p.cx(), p.cy(), p.color, 20);
        if (!p.ragdollTimer) { p.ragdollTimer = 45; p.ragdollSpin = (Math.random() - 0.5) * 0.25; }
        p.invincible = 999;
        p.vy = -10; p.vx = (Math.random() - 0.5) * 14;
        respawnCountdowns.push({ color: p.color, x: p.spawnX, y: p.spawnY - 80, framesLeft: 66 });
        setTimeout(() => { if (gameRunning) p.respawn(); }, 1100);
      } else if (infiniteMode && !p.isBoss) {
        // Infinite mode: award win to opponent, always respawn
        const other = players.find(q => q !== p);
        if (other) { if (p === players[0]) winsP2++; else winsP1++; }
        addKillFeed(p);
        spawnParticles(p.cx(), p.cy(), p.color, 20);
        if (!p.ragdollTimer) { p.ragdollTimer = 45; p.ragdollSpin = (Math.random() - 0.5) * 0.25; }
        p.invincible = 999;
        respawnCountdowns.push({ color: p.color, x: p.spawnX, y: p.spawnY - 80, framesLeft: 66 });
        setTimeout(() => { if (gameRunning) p.respawn(); }, 1100);
      } else if (p.lives > 0) {
        p.lives--;
        p.invincible = 999; // block re-trigger until respawn clears it
        addKillFeed(p);
        spawnParticles(p.cx(), p.cy(), p.color, 20);
        if (!p.ragdollTimer) { p.ragdollTimer = 45; p.ragdollSpin = (Math.random() - 0.5) * 0.25; }
        if (p.lives > 0) {
          respawnCountdowns.push({ color: p.color, x: p.spawnX, y: p.spawnY - 80, framesLeft: 66 });
          setTimeout(() => { if (gameRunning) p.respawn(); }, 1100);
        } else {
          // Check if boss fake-death should trigger (boss < 33% HP, once per game)
          const boss = players.find(q => q.isBoss);
          if (boss && boss.health < boss.maxHealth * 0.33 && !fakeDeath.triggered && gameMode === 'boss') {
            triggerFakeDeath(p);
          } else if (gameMode === 'boss' && bossPlayerCount === 2) {
            // In 2P boss co-op: only delay end if teammate is still alive
            const otherHumansAlive = players.some(q => !q.isBoss && q !== p && q.lives > 0 && q.health > 0);
            if (otherHumansAlive) {
              p.invincible = 9999; // stay dead, teammate still fighting
            } else {
              setTimeout(endGame, 900);
            }
          } else {
            setTimeout(endGame, 900);
          }
        }
      }
    }
  }
}

function addKillFeed(loser) {
  const killer = players.find(q => q !== loser);
  if (killer) killer.kills++;
  const feed = document.getElementById('killFeed');
  const msg  = document.createElement('div');
  msg.className   = 'kill-msg';
  msg.textContent = `${killer ? killer.name : '?'} KO'd ${loser.name}!`;
  msg.style.color = killer ? killer.color : '#fff';
  feed.prepend(msg);
  setTimeout(() => msg.remove(), 3200);
}

function endGame() {
  gameRunning = false;
  document.getElementById('hud').style.display = 'none';
  const isBossModeEnd = gameMode === 'boss' || gameMode === 'trueform';
  const alive  = players.filter(p => p.lives > 0 && !(isBossModeEnd && p.isBoss));
  const winner = alive.length === 1 ? alive[0]
               : (alive.length === 0 && isBossModeEnd) ? players.find(p => p.isBoss)
               : null;

  // --- Achievement checks on match end ---
  if (winner && !winner.isBoss) {
    _achStats.totalWins++;
    _achStats.winStreak++;
    unlockAchievement('first_blood');
    if (_achStats.totalWins >= 10) unlockAchievement('perfectionist');
    if (_achStats.winStreak >= 3)  unlockAchievement('hat_trick');
    // Win with ≤10 HP
    if (winner.health <= 10) unlockAchievement('survivor');
    // Untouchable: won without taking damage this match
    if (_achStats.damageTaken === 0) unlockAchievement('untouchable');
    // Speedrun: won in under 30 seconds
    if (Date.now() - _achStats.matchStartTime < 30000) unlockAchievement('speedrun');
    // Ranged damage threshold
    if (_achStats.rangedDmg >= 500) unlockAchievement('gunslinger');
    // Super count
    if (_achStats.superCount >= 10) unlockAchievement('super_saver');
    // Hammer-only win
    if (winner.weaponKey === 'hammer') unlockAchievement('hammer_time');
    // Boss slayer
    if (isBossModeEnd && gameMode === 'boss') unlockAchievement('boss_slayer');
    if (isBossModeEnd && gameMode === 'trueform') unlockAchievement('true_form');
    // KotH win
    if (gameMode === 'minigames' && minigameType === 'koth') unlockAchievement('koth_win');
  } else if (winner && winner.isBoss) {
    _achStats.winStreak = 0; // loss resets streak
  } else {
    _achStats.winStreak = 0;
  }
  const wt     = document.getElementById('winnerText');
  if (winner) { wt.textContent = winner.name + ' WINS!'; wt.style.color = winner.color; }
  else        { wt.textContent = 'DRAW!';                wt.style.color = '#ffffff'; }
  let statsHtml = players.map(p => `<div class="stat-row" style="color:${p.color}">${p.name}: ${p.kills} KO${p.kills !== 1 ? 's' : ''}</div>`).join('');
  // Boss defeated hint (only if letters not yet unlocked)
  const defeatedBoss = players.find(p => p.isBoss && p.health <= 0);
  if (defeatedBoss && winner && !winner.isBoss && !unlockedTrueBoss && bossBeaten) {
    statsHtml += '<div class="stat-row" style="color:#cc00ee;margin-top:10px;font-size:11px;letter-spacing:1px">' +
                 '&#x2756; Something stirs... seek clues in the arenas.</div>';
  }
  document.getElementById('statsDisplay').innerHTML = statsHtml;
  document.getElementById('gameOverOverlay').style.display = 'flex';
}

// ============================================================
// SECRET LETTER HUNT SYSTEM
// ============================================================
function syncCodeInput() {
  const inp = document.getElementById('codeInput');
  if (!inp) return;
  inp.readOnly = true;
  if (!bossBeaten) {
    inp.value       = '';
    inp.placeholder = 'Beat the boss to unlock';
    return;
  }
  if (unlockedTrueBoss) {
    inp.value       = '✦ TRUE FORM UNLOCKED ✦';
    inp.placeholder = '';
    return;
  }
  const val = SECRET_ARENAS.map((_, i) => collectedLetterIds.has(i) ? SECRET_LETTERS[i] : '_').join('');
  inp.value       = val;
  inp.placeholder = collectedLetterIds.size < 8 ? 'Find letters with supers...' : '';
}

function unlockTrueForm() {
  if (unlockedTrueBoss) return;
  unlockedTrueBoss = true;
  localStorage.setItem('smc_trueform', '1');
  const card = document.getElementById('modeTrueForm');
  if (card) { card.style.display = ''; }
  const msg = document.getElementById('codeMessage');
  if (msg) { msg.textContent = '✦ True Form unlocked!'; msg.style.color = '#cc00ee'; }
  syncCodeInput();
}

function showBossBeatenScreen() {
  const ov = document.getElementById('bossBeatenOverlay');
  if (!ov) { endGame(); return; }
  ov.style.display = 'flex';
  const txt = document.getElementById('bossBeatenText');
  const btn = document.getElementById('bossBeatenContinue');
  if (txt) { txt.style.opacity = '0'; setTimeout(() => { txt.style.opacity = '1'; }, 200); }
  if (btn) { btn.style.display = 'none'; setTimeout(() => { btn.style.display = 'block'; }, 2400); }
  syncCodeInput();
}

function closeBossBeatenScreen() {
  const ov = document.getElementById('bossBeatenOverlay');
  if (ov) ov.style.display = 'none';
  endGame();
}

function drawSecretLetters() {
  if (!bossBeaten || !currentArenaKey || !gameRunning) return;
  const idx = SECRET_ARENAS.indexOf(currentArenaKey);
  if (idx === -1 || collectedLetterIds.has(idx)) return;
  const pos = SECRET_LETTER_POS[currentArenaKey];
  if (!pos) return;
  const pulse = 0.65 + Math.sin(frameCount * 0.07) * 0.35;
  ctx.save();
  ctx.globalAlpha = pulse;
  ctx.font        = 'bold 22px Arial';
  ctx.textAlign   = 'center';
  ctx.fillStyle   = '#cc00ee';
  ctx.shadowColor = '#cc00ee';
  ctx.shadowBlur  = 20;
  ctx.fillText(SECRET_LETTERS[idx], pos.x, pos.y);
  ctx.restore();
}

function checkSecretLetterCollect(p) {
  if (!bossBeaten || !currentArenaKey) return;
  const idx = SECRET_ARENAS.indexOf(currentArenaKey);
  if (idx === -1 || collectedLetterIds.has(idx)) return;
  const pos = SECRET_LETTER_POS[currentArenaKey];
  if (!pos) return;
  if (Math.hypot(p.cx() - pos.x, p.cy() - pos.y) < 100) {
    collectedLetterIds.add(idx);
    localStorage.setItem('smc_letters', JSON.stringify([...collectedLetterIds]));
    spawnParticles(pos.x, pos.y, '#cc00ee', 18);
    syncCodeInput();
    if (collectedLetterIds.size === 8) unlockTrueForm();
  }
}

function backToMenu() {
  gameRunning  = false;
  paused       = false;
  trainingMode      = false;
  trainingChaosMode = false;
  trainingPlayerOnly = true;
  tutorialMode      = false;
  tutorialStep      = 0;
  tutorialFlags     = {};
  tutStepComplete   = false;
  // After tutorial/trueform, reset mode to 1v1 so P2 config is fully visible
  if (gameMode === 'tutorial' || gameMode === 'trueform') gameMode = '2p';
  clearChaosModifiers();
  resetTFState();
  canvas.style.display = 'block'; // keep visible as animated menu background
  document.getElementById('hud').style.display            = 'none';
  document.getElementById('pauseOverlay').style.display    = 'none';
  document.getElementById('gameOverOverlay').style.display = 'none';
  document.getElementById('menu').style.display            = 'grid';
  const trainingHud = document.getElementById('trainingHud');
  if (trainingHud) trainingHud.style.display = 'none';
  const trainingPanel = document.getElementById('trainingExpandPanel');
  if (trainingPanel) trainingPanel.style.display = 'none';
  // Restore menu UI to match current mode (un-hides P2 rows, arena, etc.)
  selectMode(gameMode);
  resizeGame();
  syncCodeInput();
  if (!menuLoopRunning) {
    menuLoopRunning = true;
    requestAnimationFrame(menuBgLoop);
  }
}

function pauseGame() {
  if (!gameRunning) return;
  paused = !paused;
  document.getElementById('pauseOverlay').style.display = paused ? 'flex' : 'none';
}

function resumeGame() {
  paused = false;
  document.getElementById('pauseOverlay').style.display = 'none';
}

// ============================================================
// HUD
// ============================================================
function updateHUD() {
  // Slot 1 = first non-boss player; Slot 2 = boss (1P boss mode) or second human (2P boss mode)
  const nonBoss = players.filter(p => !p.isBoss);
  const boss    = players.find(p => p.isBoss);
  const hudP1   = nonBoss[0];
  const hudP2   = (gameMode === 'boss' && bossPlayerCount === 2) ? nonBoss[1] : (boss || nonBoss[1]);
  const hudPlayers = [hudP1, hudP2];

  for (let i = 0; i < 2; i++) {
    const p = hudPlayers[i];
    if (!p) continue;
    const n  = i + 1;
    const pct = Math.max(0, p.health / p.maxHealth * 100);
    const hEl  = document.getElementById(`p${n}Health`);
    const lEl  = document.getElementById(`p${n}Lives`);
    const nEl  = document.getElementById(`p${n}HudName`);
    const sEl  = document.getElementById(`p${n}Super`);
    const cdEl = document.getElementById(`p${n}CdBar`);
    if (hEl) {
      hEl.style.width      = pct + '%';
      hEl.style.background = `hsl(${pct * 1.2},100%,44%)`;
    }
    const htEl = document.getElementById(`p${n}HealthText`);
    if (htEl) htEl.textContent = Math.ceil(p.health) + '/' + p.maxHealth;
    if (lEl) {
      if (p.isBoss) {
        // Boss: show a phase indicator instead of hearts
        const phase = p.getPhase ? p.getPhase() : 1;
        lEl.innerHTML = `<span style="font-size:10px;letter-spacing:1px;color:#cc00ee">PHASE ${phase}</span>`;
      } else if (infiniteMode || p.isDummy || p.lives >= 50) {
        lEl.innerHTML = '∞';
      } else {
        const capped    = Math.min(p.lives, 10);
        const cappedMax = Math.min(p._maxLives !== undefined ? p._maxLives : chosenLives, 10);
        const full  = '\u2665'.repeat(Math.max(0, capped));
        const empty = '<span style="opacity:0.18">\u2665</span>'.repeat(Math.max(0, cappedMax - capped));
        lEl.innerHTML = full + empty;
      }
    }
    if (nEl) nEl.style.color = p.color;
    if (sEl) {
      sEl.style.width = p.superMeter + '%';
      if (p.superReady) sEl.classList.add('ready');
      else              sEl.classList.remove('ready');
    }
    if (cdEl) {
      // Show how much of the Q cooldown has recovered (full = ready)
      const maxCd = p.weapon.abilityCooldown;
      const cdPct = maxCd > 0
        ? Math.max(0, 100 - (p.abilityCooldown / maxCd) * 100)
        : 100;
      cdEl.style.width = cdPct + '%';
    }
    const shEl = document.getElementById(`p${n}ShieldBar`);
    if (shEl) {
      const shPct = p.shieldCooldown > 0
        ? Math.max(0, 100 - (p.shieldCooldown / 1800) * 100)
        : 100;
      shEl.style.width = shPct + '%';
      shEl.style.background = p.shieldCooldown > 0
        ? 'linear-gradient(90deg, #4488ff, #88ccff)'
        : 'linear-gradient(90deg, #44ddff, #ffffff)';
    }
    const wEl = document.getElementById(`p${n}WeaponHud`);
    if (wEl) wEl.textContent = p.weapon.name;
  }

  // Boss HP bar (shown in 2P boss mode below HUD center)
  const bossBarEl  = document.getElementById('bossHpBar');
  const bossHpFill = document.getElementById('bossHpFill');
  const bossHpText = document.getElementById('bossHpText');
  if (bossBarEl) {
    if (gameMode === 'boss' && bossPlayerCount === 2 && boss) {
      bossBarEl.style.display = 'flex';
      const bPct = Math.max(0, boss.health / boss.maxHealth * 100);
      if (bossHpFill) bossHpFill.style.width = bPct + '%';
      if (bossHpText) bossHpText.textContent = Math.ceil(boss.health) + ' / ' + boss.maxHealth;
    } else {
      bossBarEl.style.display = 'none';
    }
  }
}

// ============================================================
// MENU BACKGROUND LOOP  (animated arena showcase behind the menu)
// ============================================================
function menuBgLoop() {
  if (!menuLoopRunning) return;

  menuBgTimer++;
  menuBgFrameCount++;

  // Cycle to next arena every ~5 seconds (300 frames)
  if (menuBgTimer >= 300 && menuBgFade === 0) {
    menuBgFade  = 0.01;
    menuBgTimer = 0;
  }
  if (menuBgFade > 0) {
    menuBgFade = Math.min(2, menuBgFade + 0.028);
    if (menuBgFade >= 1 && menuBgFade < 1.03) {
      // Peak darkness: switch to next arena
      menuBgArenaIdx = (menuBgArenaIdx + 1) % ARENA_KEYS_ORDERED.length;
    }
    if (menuBgFade >= 2) menuBgFade = 0;
  }

  // Temporarily borrow arena + frame state for the background draw
  const savedKey   = currentArenaKey;
  const savedArena = currentArena;
  const savedFrame = frameCount;
  currentArenaKey  = ARENA_KEYS_ORDERED[menuBgArenaIdx];
  currentArena     = ARENAS[currentArenaKey];
  frameCount       = menuBgFrameCount;

  const mScX = canvas.width / GAME_W, mScY = canvas.height / GAME_H;
  ctx.setTransform(mScX, 0, 0, mScY, 0, 0);
  drawBackground();

  // Semi-transparent dark overlay so menu text stays readable
  ctx.save();
  ctx.fillStyle = 'rgba(7,7,15,0.55)';
  ctx.fillRect(0, 0, GAME_W, GAME_H);
  ctx.restore();

  // Cross-fade overlay during arena transitions
  if (menuBgFade > 0) {
    const fadeA = menuBgFade <= 1 ? menuBgFade : 2 - menuBgFade;
    ctx.save();
    ctx.globalAlpha = Math.min(1, Math.max(0, fadeA));
    ctx.fillStyle   = '#000';
    ctx.fillRect(0, 0, GAME_W, GAME_H);
    ctx.restore();
  }

  // Restore game state
  currentArenaKey = savedKey;
  currentArena    = savedArena;
  frameCount      = savedFrame;

  requestAnimationFrame(menuBgLoop);
}

// ============================================================
// BOSS DIALOGUE  (speech bubble above boss)
// ============================================================
function showBossDialogue(text, dur = 220) {
  bossDialogue.text  = text;
  bossDialogue.timer = dur;
}

function drawBossDialogue() {
  if (bossDialogue.timer <= 0) return;
  const boss = players.find(p => p.isBoss);
  if (!boss || boss.health <= 0) return;
  bossDialogue.timer--;

  const alpha = Math.min(1, bossDialogue.timer < 45 ? bossDialogue.timer / 45 : 1);
  const text  = bossDialogue.text;
  const bx    = boss.cx();
  const by    = boss.y - 18;

  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.font        = 'bold 13px Arial';
  ctx.textAlign   = 'center';
  const tw  = ctx.measureText(text).width;
  const pad = 11;
  const bw  = tw + pad * 2;
  const bh  = 28;
  const rx  = bx - bw / 2;
  const ry  = by - bh;

  // Bubble background
  ctx.fillStyle   = 'rgba(18,0,32,0.90)';
  ctx.strokeStyle = '#cc00ee';
  ctx.lineWidth   = 1.8;
  ctx.beginPath();
  ctx.roundRect(rx, ry, bw, bh, 7);
  ctx.fill();
  ctx.stroke();

  // Tail pointer
  ctx.beginPath();
  ctx.moveTo(bx - 8, by);
  ctx.lineTo(bx,     by + 12);
  ctx.lineTo(bx + 8, by);
  ctx.closePath();
  ctx.fillStyle = 'rgba(18,0,32,0.90)';
  ctx.fill();
  ctx.strokeStyle = '#cc00ee';
  ctx.lineWidth = 1.8;
  ctx.stroke();

  // Text
  ctx.fillStyle   = '#f0aaff';
  ctx.shadowColor = '#aa00ee';
  ctx.shadowBlur  = 8;
  ctx.fillText(text, bx, ry + bh - 9);
  ctx.restore();
}

// ============================================================
// BOSS BEAMS
// ============================================================
function drawBossBeams() {
  for (const b of bossBeams) {
    ctx.save();
    if (b.phase === 'warning') {
      const progress = 1 - b.warningTimer / 300;
      const flicker  = Math.sin(frameCount * 0.35 + b.x * 0.05) * 0.1;
      ctx.globalAlpha = clamp(0.15 + progress * 0.40 + flicker, 0.05, 0.65);
      ctx.strokeStyle = '#dd77ff';
      ctx.lineWidth   = 5 + progress * 7;
      ctx.shadowColor = '#9900ee';
      ctx.shadowBlur  = 20;
      ctx.setLineDash([22, 14]);
      ctx.beginPath();
      ctx.moveTo(b.x, 462);
      ctx.lineTo(b.x, 0);
      ctx.stroke();
      ctx.setLineDash([]);
      // Pulsing ground indicator
      const pulse = 8 + progress * 14 + Math.sin(frameCount * 0.4) * 4;
      ctx.globalAlpha = 0.75;
      ctx.fillStyle   = '#ff44ff';
      ctx.shadowBlur  = 24;
      ctx.beginPath();
      ctx.arc(b.x, 462, pulse, 0, Math.PI * 2);
      ctx.fill();
      // Countdown text
      const secs = Math.ceil(b.warningTimer / 60);
      ctx.globalAlpha = 0.9;
      ctx.font        = 'bold 11px Arial';
      ctx.fillStyle   = '#ffffff';
      ctx.textAlign   = 'center';
      ctx.shadowBlur  = 6;
      ctx.fillText(secs + 's', b.x, 448);
    } else if (b.phase === 'active') {
      ctx.globalAlpha = 0.9;
      // Outer glow
      ctx.strokeStyle = '#ff00ff';
      ctx.lineWidth   = 24;
      ctx.shadowColor = '#cc00ff';
      ctx.shadowBlur  = 55;
      ctx.beginPath();
      ctx.moveTo(b.x, GAME_H);
      ctx.lineTo(b.x, 0);
      ctx.stroke();
      // Core beam
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth   = 8;
      ctx.shadowBlur  = 20;
      ctx.beginPath();
      ctx.moveTo(b.x, GAME_H);
      ctx.lineTo(b.x, 0);
      ctx.stroke();
    }
    ctx.restore();
  }
}

// ============================================================
// BOSS SPIKES
// ============================================================
function drawBossSpikes() {
  for (const sp of bossSpikes) {
    if (sp.done || sp.h <= 0) continue;
    const baseY = 460;
    const tipY  = baseY - sp.h;
    ctx.save();
    ctx.shadowColor = '#cc00ff';
    ctx.shadowBlur  = 12;
    // Spike body (tapered rectangle, 10px base → 2px tip)
    ctx.beginPath();
    ctx.moveTo(sp.x - 3,   baseY);
    ctx.lineTo(sp.x + 3,   baseY);
    ctx.lineTo(sp.x + 0.5, tipY);
    ctx.lineTo(sp.x - 0.5, tipY);
    ctx.closePath();
    ctx.fillStyle = '#aaaacc';
    ctx.fill();
    ctx.strokeStyle = '#cc00ff';
    ctx.lineWidth   = 1.5;
    ctx.stroke();
    ctx.restore();
  }
}

// ============================================================
// SPARTAN RAGE VISUALS  (Kratos class perk active)
// ============================================================
function drawAccessory(fighter, cx, headCY, shoulderY, hipY, facing, headR) {
  const hat  = fighter.hat  || 'none';
  const cape = fighter.cape || 'none';
  if (hat === 'none' && cape === 'none') return;
  ctx.save();

  // --- CAPE (draw behind body) ---
  if (cape !== 'none') {
    const capeX = cx - facing * 4;
    ctx.lineWidth = 1;
    if (cape === 'short') {
      ctx.fillStyle = 'rgba(180,20,20,0.8)';
      ctx.beginPath();
      ctx.moveTo(cx - 5, shoulderY);
      ctx.lineTo(cx + 5, shoulderY);
      ctx.lineTo(cx - facing * 14, hipY - 6);
      ctx.closePath(); ctx.fill();
    } else if (cape === 'long') {
      const capeGrad = ctx.createLinearGradient(capeX, shoulderY, capeX, hipY + 18);
      capeGrad.addColorStop(0, 'rgba(120,10,10,0.85)');
      capeGrad.addColorStop(1, 'rgba(80,5,5,0)');
      ctx.fillStyle = capeGrad;
      ctx.beginPath();
      ctx.moveTo(cx - 7, shoulderY);
      ctx.lineTo(cx + 7, shoulderY);
      ctx.lineTo(cx - facing * 18, hipY + 18);
      ctx.closePath(); ctx.fill();
    } else if (cape === 'royal') {
      ctx.fillStyle = 'rgba(160,10,10,0.9)';
      ctx.beginPath();
      ctx.moveTo(cx - 7, shoulderY);
      ctx.lineTo(cx + 7, shoulderY);
      ctx.lineTo(cx - facing * 18, hipY + 14);
      ctx.closePath(); ctx.fill();
      ctx.strokeStyle = '#ffcc00'; ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(cx - 6, shoulderY + 2);
      ctx.lineTo(cx - facing * 16, hipY + 10);
      ctx.stroke();
    }
  }

  // --- HAT (draw above head) ---
  if (hat !== 'none') {
    ctx.fillStyle   = '#333';
    ctx.strokeStyle = '#222';
    ctx.lineWidth   = 1;
    const hatTop = headCY - headR;
    if (hat === 'cap') {
      ctx.fillStyle = '#444';
      ctx.beginPath();
      ctx.ellipse(cx, hatTop, headR + 1, 5, 0, Math.PI, 0);
      ctx.fill();
      ctx.fillRect(cx - headR - 1, hatTop - 7, headR * 2 + 2, 8);
      ctx.fillStyle = '#555';
      ctx.fillRect(cx + facing * headR, hatTop - 2, facing * 6, 4);
    } else if (hat === 'crown') {
      ctx.fillStyle = '#ffcc00';
      const bY = hatTop - 2;
      ctx.fillRect(cx - headR + 2, bY - 8, headR * 2 - 4, 8);
      ctx.beginPath();
      ctx.moveTo(cx - headR + 2, bY - 8);
      ctx.lineTo(cx - headR + 2 + 4, bY - 13);
      ctx.lineTo(cx, bY - 10);
      ctx.lineTo(cx + headR - 6, bY - 13);
      ctx.lineTo(cx + headR - 2, bY - 8);
      ctx.closePath(); ctx.fill();
    } else if (hat === 'wizard') {
      ctx.fillStyle = '#660099';
      ctx.beginPath();
      ctx.moveTo(cx - headR + 1, hatTop + 1);
      ctx.lineTo(cx + headR - 1, hatTop + 1);
      ctx.lineTo(cx + facing * 2, hatTop - 22);
      ctx.closePath(); ctx.fill();
      ctx.fillRect(cx - headR - 3, hatTop - 2, headR * 2 + 6, 5);
    } else if (hat === 'headband') {
      ctx.fillStyle = '#cc2200';
      ctx.fillRect(cx - headR, headCY - 4, headR * 2, 4);
    }
  }

  ctx.restore();
}

function drawCurseAuras() {
  const CURSE_COLORS = {
    curse_slow:    '#4488ff',
    curse_weak:    '#222244',
    curse_fragile: '#ff8800',
  };
  for (const p of players) {
    if (!p.curses || p.curses.length === 0 || p.health <= 0) continue;
    ctx.save();
    let ringOffset = 0;
    for (const curse of p.curses) {
      const col = CURSE_COLORS[curse.type];
      if (!col) continue;
      const pulse = 0.3 + Math.abs(Math.sin(frameCount * 0.08 + ringOffset)) * 0.5;
      ctx.globalAlpha = pulse;
      ctx.strokeStyle = col;
      ctx.lineWidth   = 2.5;
      ctx.shadowColor = col;
      ctx.shadowBlur  = 10;
      const r = 22 + ringOffset * 6;
      ctx.beginPath();
      ctx.arc(p.cx(), p.cy() - p.h * 0.1, r, 0, Math.PI * 2);
      ctx.stroke();
      ringOffset++;
    }
    ctx.restore();
  }
}

function drawSpartanRageEffects() {
  let anyRage = false;
  for (const p of players) {
    if (p.spartanRageTimer <= 0) continue;
    anyRage = true;
    const pct = p.spartanRageTimer / 300;
    const pcx = p.cx(), pcy = p.cy();
    ctx.save();
    // Radial aura
    const grad = ctx.createRadialGradient(pcx, pcy, 0, pcx, pcy, 52 + Math.sin(frameCount * 0.12) * 6);
    grad.addColorStop(0,   `rgba(255,100,0,${0.32 * pct})`);
    grad.addColorStop(0.5, `rgba(255,60,0,${0.18 * pct})`);
    grad.addColorStop(1,   'rgba(255,30,0,0)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(pcx, pcy, 58, 0, Math.PI * 2);
    ctx.fill();
    // Pulsing outline ring
    ctx.strokeStyle = `rgba(255,140,0,${0.65 * pct})`;
    ctx.lineWidth   = 2.5;
    ctx.shadowColor = '#ff6600';
    ctx.shadowBlur  = 18;
    ctx.beginPath();
    ctx.arc(pcx, pcy, 34 + Math.sin(frameCount * 0.18) * 4, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
    // Floating ember particles every 3 frames
    if (frameCount % 3 === 0 && settings.particles) {
      const _ang = Math.random() * Math.PI * 2;
      const _r   = 16 + Math.random() * 24;
      particles.push({
        x: pcx + Math.cos(_ang) * _r, y: pcy + Math.sin(_ang) * _r,
        vx: (Math.random() - 0.5) * 1.8, vy: -2.0 - Math.random() * 2.2,
        color: Math.random() < 0.65 ? '#ff6600' : '#ff9900',
        size: 1.6 + Math.random() * 2.2, life: 28 + Math.random() * 22, maxLife: 50
      });
    }
  }
  // Screen orange tint — only once regardless of how many have rage
  if (anyRage) {
    const _tintA = 0.055 + Math.sin(frameCount * 0.09) * 0.025;
    ctx.save();
    ctx.globalAlpha = _tintA;
    ctx.fillStyle   = '#ff5500';
    ctx.fillRect(0, 0, GAME_W, GAME_H);
    ctx.restore();
  }
}

// ============================================================
// CLASS VISUAL EFFECTS (Thor lightning arcs, Ninja shadow trail, etc.)
// ============================================================
const classTrails = []; // {x, y, color, alpha, size, life}

function drawClassEffects() {
  // Update + draw shadow trails
  for (let i = classTrails.length - 1; i >= 0; i--) {
    const t = classTrails[i];
    t.alpha -= 0.04;
    t.life--;
    if (t.life <= 0) { classTrails.splice(i, 1); continue; }
    ctx.save();
    ctx.globalAlpha = Math.max(0, t.alpha);
    ctx.fillStyle   = t.color;
    ctx.beginPath();
    ctx.roundRect(t.x, t.y, 22, 60, 4);
    ctx.fill();
    ctx.restore();
  }

  for (const p of players) {
    if (p.health <= 0 || p.backstageHiding) continue;

    // THOR: Periodic lightning arc toward target + electric sparks on body
    if (p.charClass === 'thor') {
      // Ambient crackling particles
      if (frameCount % 8 === 0 && settings.particles) {
        const a = Math.random() * Math.PI * 2;
        particles.push({
          x: p.cx() + Math.cos(a) * 14, y: p.cy() + Math.sin(a) * 14,
          vx: (Math.random()-0.5)*2, vy: -1.5 - Math.random()*1.5,
          color: Math.random() < 0.6 ? '#ffff44' : '#aaddff',
          size: 1.5 + Math.random()*2, life: 14 + Math.random()*10, maxLife: 24
        });
      }
      // Lightning arc toward target every 55 frames
      if (p.target && p.target.health > 0 && frameCount % 55 === 0) {
        const tx = p.target.cx(), ty = p.target.cy();
        const sx2 = p.cx(), sy2 = p.cy();
        const steps = 7;
        for (let si = 0; si < steps; si++) {
          const prog = si / steps;
          const jx   = sx2 + (tx - sx2) * prog + (Math.random()-0.5)*30;
          const jy   = sy2 + (ty - sy2) * prog + (Math.random()-0.5)*20;
          particles.push({ x: jx, y: jy, vx: 0, vy: 0,
            color: '#ffffaa', size: 2.5, life: 8, maxLife: 8 });
        }
      }
    }

    // NINJA: Shadow trail during fast movement
    if (p.charClass === 'ninja' && Math.abs(p.vx) > 5 && frameCount % 4 === 0) {
      classTrails.push({ x: p.x, y: p.y, color: 'rgba(0,200,80,0.45)', alpha: 0.45, size: 1, life: 14 });
    }

    // KRATOS: Ember sparks when in Spartan Rage (already handled by drawSpartanRageEffects)
    // Extra hit flash crackle when rage is active and hit
    if (p.charClass === 'kratos' && p.spartanRageTimer > 0 && p.hurtTimer > 0) {
      if (settings.particles) {
        for (let k = 0; k < 3; k++) {
          particles.push({ x: p.cx() + (Math.random()-0.5)*20, y: p.cy() + (Math.random()-0.5)*20,
            vx: (Math.random()-0.5)*4, vy: -2-Math.random()*3,
            color: '#ff8800', size: 2+Math.random()*2, life: 12, maxLife: 12 });
        }
      }
    }

    // GUNNER: Muzzle flash lingering glow on weapon arm (cosmetic)
    if (p.charClass === 'gunner' && p.attackTimer > 0 && p.attackTimer === p.attackDuration) {
      if (settings.particles) {
        spawnParticles(p.cx() + p.facing * 28, p.y + 22, '#ffdd00', 5);
      }
    }
  }
}

// ============================================================
// BOSS DEFEAT SCENE
// ============================================================
function startBossDeathScene(boss) {
  bossDeathScene = {
    phase: 'shatter', timer: 0,
    orbX: boss.cx(), orbY: boss.cy(),
    orbR: 0, orbVx: 0, orbVy: 0,
    camZoom: 1.0, camZoomTarget: 1.0,  // cinematic zoom state
  };
  boss.invincible = 9999;
  screenShake     = 65;
  // Remove all other entities — boss takes center stage
  players    = players.filter(p => p.isBoss);
  minions    = [];
  trainingDummies = [];
  projectiles = [];
  bossBeams   = [];
  bossSpikes  = [];
  const deathColors = boss.isTrueForm
    ? ['#000000','#111111','#222222','#ffffff','#cccccc','#888888','#444444']
    : ['#cc00ee','#9900bb','#ff00ff','#000000','#ffffff','#6600aa','#ff88ff'];
  for (let _i = 0; _i < 100; _i++) {
    const _a = Math.random() * Math.PI * 2;
    const _s = 2 + Math.random() * 14;
    particles.push({ x: boss.cx(), y: boss.cy(),
      vx: Math.cos(_a)*_s, vy: Math.sin(_a)*_s,
      color: deathColors[Math.floor(Math.random() * deathColors.length)],
      size: 2 + Math.random() * 8, life: 80 + Math.random() * 100, maxLife: 180 });
  }
  const deathLine = boss.isTrueForm ? '...you cannot kill what has no form.' : 'N-no... this is not over...';
  showBossDialogue(deathLine, 360);
}

function updateBossDeathScene() {
  const sc   = bossDeathScene;
  if (!sc) return;
  sc.timer++;
  // Smooth camera zoom lerp for cinematic effect
  sc.camZoom = lerp(sc.camZoom || 1, sc.camZoomTarget || 1, 0.06);
  const boss = players.find(p => p.isBoss);

  if (sc.phase === 'shatter') {
    // Camera slowly zooms in on boss
    sc.camZoomTarget = 1.5;
    if (boss && sc.timer % 4 === 0) {
      spawnParticles(boss.cx() + (Math.random()-0.5)*50, boss.cy() + (Math.random()-0.5)*50,
        Math.random() < 0.5 ? '#cc00ee' : '#000000', 6);
      screenShake = Math.max(screenShake, 10);
    }
    if (sc.timer >= 120) {
      sc.phase = 'orb_form';
      if (boss) { sc.orbX = boss.cx(); sc.orbY = boss.cy(); boss.backstageHiding = true; }
      sc.camZoomTarget = 2.0; // zoom in further as orb forms
      screenShake = 50;
      spawnParticles(sc.orbX, sc.orbY, '#9900ee', 60);
      spawnParticles(sc.orbX, sc.orbY, '#ff88ff', 30);
      spawnParticles(sc.orbX, sc.orbY, '#000000', 40);
    }
  } else if (sc.phase === 'orb_form') {
    sc.orbR = Math.min(38, sc.orbR + 0.65); // bigger orb
    if (sc.timer >= 180) {
      sc.phase = 'orb_burst';
      // Flash + extra particles as orb fully forms
      screenShake = 40;
      for (let _i = 0; _i < 60; _i++) {
        const _a = Math.random() * Math.PI * 2;
        const _s = 3 + Math.random() * 8;
        particles.push({ x: sc.orbX, y: sc.orbY,
          vx: Math.cos(_a)*_s, vy: Math.sin(_a)*_s,
          color: Math.random() < 0.4 ? '#ffffff' : (Math.random() < 0.5 ? '#cc00ee' : '#ffaaff'),
          size: 2 + Math.random() * 5, life: 60 + Math.random()*60, maxLife: 120 });
      }
    }
  } else if (sc.phase === 'orb_burst') {
    // Brief pause — orb glows at full size
    if (sc.timer >= 220) {
      sc.phase = 'portal_open';
      const _px = clamp(sc.orbX + 240, 80, GAME_W - 80);
      openBackstagePortal(_px, sc.orbY, 'exit');
    }
  } else if (sc.phase === 'portal_open') {
    if (sc.timer >= 260) {
      sc.phase    = 'orb_fly';
      sc.orbVx    = 5;
      sc.orbVy    = -1.0;
      sc.camZoomTarget = 1.2; // zoom back out as orb escapes
    }
  } else if (sc.phase === 'orb_fly') {
    sc.orbX += sc.orbVx;
    sc.orbY += sc.orbVy;
    sc.orbVx  = Math.min(sc.orbVx * 1.12, 28);
    sc.orbR   = Math.max(0, sc.orbR - 0.22);
    // Bright light trail
    if (settings.particles && Math.random() < 0.6) {
      particles.push({ x: sc.orbX, y: sc.orbY,
        vx: (Math.random()-0.5)*2, vy: (Math.random()-0.5)*2,
        color: Math.random() < 0.5 ? '#cc00ee' : '#ffffff',
        size: 2 + Math.random()*4, life: 20 + Math.random()*20, maxLife: 40 });
    }
    if (sc.orbX > GAME_W + 60 || sc.orbR <= 0) {
      sc.phase  = 'portal_close';
      sc.camZoomTarget = 1.0; // zoom all the way back to normal
      for (const bp of backstagePortals) bp.phase = 'closing';
    }
  } else if (sc.phase === 'portal_close') {
    if (sc.timer >= 370) {
      bossDeathScene = null;
      if (!bossBeaten && gameMode === 'boss') {
        bossBeaten = true;
        localStorage.setItem('smc_bossBeaten', '1');
        showBossBeatenScreen();
      } else {
        endGame();
      }
    }
  }
  // Lerp cinematic zoom
  if (sc.camZoom === undefined) sc.camZoom = 1.0;
  sc.camZoom = sc.camZoom + (sc.camZoomTarget - sc.camZoom) * 0.04;
}

function drawBossDeathScene() {
  const sc = bossDeathScene;
  if (!sc || sc.orbR <= 0) return;
  ctx.save();
  // Outer glow (pulsing)
  const pulse = 1 + Math.sin(frameCount * 0.18) * 0.12;
  const glowR = sc.orbR * 3.5 * pulse;
  const glow  = ctx.createRadialGradient(sc.orbX, sc.orbY, 0, sc.orbX, sc.orbY, glowR);
  glow.addColorStop(0,   'rgba(180,0,255,0.35)');
  glow.addColorStop(0.5, 'rgba(80,0,140,0.15)');
  glow.addColorStop(1,   'rgba(0,0,0,0)');
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(sc.orbX, sc.orbY, glowR, 0, Math.PI * 2);
  ctx.fill();
  // Core orb — dark with bright rim
  const _g = ctx.createRadialGradient(sc.orbX, sc.orbY, 0, sc.orbX, sc.orbY, sc.orbR);
  _g.addColorStop(0,   'rgba(0,0,12,1)');
  _g.addColorStop(0.55,'rgba(40,0,70,0.95)');
  _g.addColorStop(0.82,'rgba(160,0,230,0.88)');
  _g.addColorStop(1,   'rgba(255,180,255,0.6)');
  ctx.fillStyle   = _g;
  ctx.shadowColor = '#cc00ff';
  ctx.shadowBlur  = 40;
  ctx.beginPath();
  ctx.arc(sc.orbX, sc.orbY, sc.orbR, 0, Math.PI * 2);
  ctx.fill();
  // Inner bright center
  const inner = ctx.createRadialGradient(sc.orbX, sc.orbY, 0, sc.orbX, sc.orbY, sc.orbR * 0.35);
  inner.addColorStop(0, 'rgba(255,255,255,0.9)');
  inner.addColorStop(1, 'rgba(200,100,255,0)');
  ctx.fillStyle = inner;
  ctx.beginPath();
  ctx.arc(sc.orbX, sc.orbY, sc.orbR * 0.35, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

// ============================================================
// FAKE DEATH SCENE  (boss < 1000 HP + player loses last life)
// ============================================================
function triggerFakeDeath(player) {
  fakeDeath.active    = true;
  fakeDeath.triggered = true;
  fakeDeath.timer     = 0;
  fakeDeath.player    = player;
  player.invincible   = 9999;
  player.ragdollTimer = 80;
  player.ragdollSpin  = (Math.random() > 0.5 ? 1 : -1) * (0.18 + Math.random() * 0.14);
  player.vy           = -12;
  player.vx           = (Math.random() - 0.5) * 14;
  screenShake         = Math.max(screenShake, 20);
  const boss = players.find(p => p.isBoss);
  if (boss) {
    // Force-interrupt any current dialogue after 1.2s
    setTimeout(() => {
      if (gameRunning) {
        bossDialogue = { text: "We aren't finished yet..", timer: 320 };
      }
    }, 1200);
  }
}

function updateFakeDeathScene() {
  if (!fakeDeath.active) return;
  fakeDeath.timer++;
  const p = fakeDeath.player;

  // Phase 1 (t=0–150): dark overlay + boss dialogue
  // Phase 2 (t=150–220): purple light column rises
  if (fakeDeath.timer === 150 && p) {
    screenShake = Math.max(screenShake, 32);
    if (settings.particles) {
      for (let i = 0; i < 60; i++) {
        const angle = -Math.PI/2 + (Math.random()-0.5)*0.4;
        const spd   = 4 + Math.random() * 10;
        particles.push({ x: p.spawnX, y: p.spawnY,
          vx: Math.cos(angle)*spd, vy: Math.sin(angle)*spd,
          color: Math.random() < 0.6 ? '#aa44ff' : '#ffffff',
          size: 2 + Math.random()*5, life: 60 + Math.random()*40, maxLife: 100 });
      }
    }
  }

  // Phase 3 (t=220): revive player with 2 lives
  if (fakeDeath.timer === 220 && p) {
    p.lives        = 2;
    p.invincible   = 150;
    p.ragdollTimer = 0;
    p.ragdollSpin  = 0;
    p.ragdollAngle = 0;
    p.respawn();
    fakeDeath.active = false;
  }
}

function drawFakeDeathScene() {
  if (!fakeDeath.active && fakeDeath.timer === 0) return;
  if (!fakeDeath.active) return; // scene ended
  const t = fakeDeath.timer;
  const p = fakeDeath.player;

  // Dim overlay (builds up in first 60 frames, stays)
  const overlayAlpha = Math.min(0.72, t / 80 * 0.72);
  ctx.save();
  ctx.globalAlpha = overlayAlpha;
  ctx.fillStyle   = '#000';
  ctx.fillRect(0, 0, GAME_W, GAME_H);
  ctx.restore();

  // "DEFEATED" text at top (fades in at t=40)
  if (t > 40) {
    const a = Math.min(1, (t - 40) / 30);
    ctx.save();
    ctx.globalAlpha = a;
    ctx.font        = 'bold 42px Arial';
    ctx.textAlign   = 'center';
    ctx.fillStyle   = '#ff3333';
    ctx.shadowColor = '#ff0000';
    ctx.shadowBlur  = 24;
    ctx.fillText('DEFEATED', GAME_W / 2, GAME_H / 2 - 40);
    ctx.restore();
  }

  // Purple column of light (t=130–220)
  if (t > 130 && p) {
    const colAlpha = Math.min(1, (t - 130) / 40);
    const colPulse = Math.abs(Math.sin((t - 130) * 0.15));
    ctx.save();
    ctx.globalAlpha = colAlpha * (0.7 + colPulse * 0.3);
    const colGrad = ctx.createLinearGradient(p.spawnX, GAME_H, p.spawnX, 0);
    colGrad.addColorStop(0, 'rgba(160,0,255,0.85)');
    colGrad.addColorStop(0.5, 'rgba(200,100,255,0.55)');
    colGrad.addColorStop(1, 'rgba(160,0,255,0)');
    ctx.fillStyle = colGrad;
    ctx.fillRect(p.spawnX - 18, 0, 36, GAME_H);
    // Bright core
    ctx.fillStyle = `rgba(255,200,255,${colAlpha * 0.55})`;
    ctx.fillRect(p.spawnX - 6, 0, 12, GAME_H);
    ctx.restore();
  }

  // "REVIVING..." text (t=160)
  if (t > 160) {
    const a2 = Math.min(1, (t - 160) / 20);
    ctx.save();
    ctx.globalAlpha = a2;
    ctx.font        = 'bold 22px Arial';
    ctx.textAlign   = 'center';
    ctx.fillStyle   = '#dd88ff';
    ctx.shadowColor = '#aa00ff';
    ctx.shadowBlur  = 14;
    ctx.fillText('REVIVING...', GAME_W / 2, GAME_H / 2 + 10);
    ctx.restore();
  }
}

// ============================================================
// GAME LOOP
// ============================================================
function gameLoop() {
  if (!gameRunning) return;
  if (paused) { requestAnimationFrame(gameLoop); return; }
  // Hitstop: freeze gameplay for a few frames on strong hits
  if (hitStopFrames > 0) {
    hitStopFrames--;
    screenShake *= 0.84;
    requestAnimationFrame(gameLoop);
    return;
  }
  frameCount++;

  processInput();

  // ---- BOSS ARENA: oscillating platforms + floor hazard state machine ----
  if (currentArena.isBossArena) {
    // Animate moving platforms — random-lerp targets for unpredictable movement
    // Boss arena: 2x speed (shorter timer range, faster lerp)
    const bossPlSpeed = currentArenaKey === 'creator' ? 2 : 1;
    const bossLerpSpd = currentArenaKey === 'creator' ? 0.14 : 0.07;
    for (const pl of currentArena.platforms) {
      if (pl.ox !== undefined) {
        if (pl.rx === undefined || pl.rTimer <= 0) {
          pl.rx    = pl.ox + (Math.random() - 0.5) * pl.oscX * 2;
          pl.rx    = clamp(pl.rx, pl.ox - pl.oscX, pl.ox + pl.oscX);
          pl.rTimer = Math.floor((30 + Math.floor(Math.random() * 50)) / bossPlSpeed);
        }
        pl.rTimer--;
        pl.x = lerp(pl.x, pl.rx, bossLerpSpd);
      }
      if (pl.oy !== undefined) {
        if (pl.ry === undefined || pl.ryTimer <= 0) {
          pl.ry    = pl.oy + (Math.random() - 0.5) * pl.oscY * 2;
          pl.ry    = clamp(pl.ry, pl.oy - pl.oscY, pl.oy + pl.oscY);
          pl.ryTimer = Math.floor((30 + Math.floor(Math.random() * 50)) / bossPlSpeed);
        }
        pl.ryTimer--;
        pl.y = lerp(pl.y, pl.ry, bossLerpSpd);
      }
    }

    // Floor hazard state machine
    bossFloorTimer--;
    if (bossFloorTimer <= 0) {
      if (bossFloorState === 'normal') {
        bossFloorState = 'warning';
        bossFloorType  = Math.random() < 0.5 ? 'lava' : 'void';
        bossFloorTimer = 300; // 5-second warning
        showBossDialogue(bossFloorType === 'lava'
          ? randChoice(['The floor... will burn!', 'Enjoy the heat!', 'Stand still... I dare you.'])
          : randChoice(['The void... opens below!', 'Nowhere to stand!', 'Fall into darkness!']), 220);
      } else if (bossFloorState === 'warning') {
        bossFloorState = 'hazard';
        bossFloorTimer = 900; // 15-second hazard
        const floorPl  = currentArena.platforms.find(p => p.isFloor);
        if (bossFloorType === 'lava') {
          if (floorPl) { floorPl.isFloorDisabled = true; }
          currentArena.hasLava = true;
          currentArena.lavaY   = 462;
          currentArena.deathY  = 560;
        } else {
          if (floorPl) { floorPl.isFloorDisabled = true; }
          currentArena.deathY = 530;
        }
      } else { // 'hazard' → back to normal
        bossFloorState = 'normal';
        bossFloorTimer = 1200 + Math.floor(Math.random() * 600); // 20–30 s until next
        const floorPl  = currentArena.platforms.find(p => p.isFloor);
        if (floorPl) { floorPl.isFloorDisabled = false; }
        currentArena.hasLava = false;
        currentArena.deathY  = 640;
        mapPerkState.eruptions    = [];
        mapPerkState.eruptCooldown = 0;
      }
    }

    // Boss lava hazard: spawn eruption columns
    if (bossFloorState === 'hazard' && bossFloorType === 'lava') {
      if (!mapPerkState.eruptions)     mapPerkState.eruptions     = [];
      if (!mapPerkState.eruptCooldown) mapPerkState.eruptCooldown = 120;
      mapPerkState.eruptCooldown--;
      if (mapPerkState.eruptCooldown <= 0) {
        const ex = 80 + Math.random() * 740;
        mapPerkState.eruptions.push({ x: ex, timer: 180 });
        mapPerkState.eruptCooldown = 150 + Math.floor(Math.random() * 150);
      }
      // Tick down eruption timers
      for (let ei = mapPerkState.eruptions.length - 1; ei >= 0; ei--) {
        const er = mapPerkState.eruptions[ei];
        er.timer--;
        if (er.timer <= 0) { mapPerkState.eruptions.splice(ei, 1); continue; }
        if (er.timer % 5 === 0 && settings.particles) {
          const upA = -Math.PI/2 + (Math.random()-0.5)*0.5;
          particles.push({ x: er.x, y: currentArena.lavaY || 462,
            vx: Math.cos(upA)*5, vy: Math.sin(upA)*(8+Math.random()*8),
            color: Math.random() < 0.5 ? '#ff4400' : '#ff8800',
            size: 3+Math.random()*4, life: 30+Math.random()*20, maxLife: 50 });
        }
        // Damage players in column
        for (const p of players) {
          if (p.isBoss || p.health <= 0 || p.invincible > 0) continue;
          if (Math.abs(p.cx() - er.x) < 100 && p.y + p.h > (currentArena.lavaY || 462) - 250) {
            if (er.timer % 10 === 0) dealDamage(players.find(q => q.isBoss) || players[1], p, Math.ceil(p.maxHealth * 0.044), 8);
          }
        }
      }
    }
  }

  // ---- Camera system ----
  const baseScaleX = canvas.width  / GAME_W;
  const baseScaleY = canvas.height / GAME_H;

  let camZoom, camCX, camCY;
  if (bossDeathScene) {
    // Cinematic zoom: center on orb
    camZoom = bossDeathScene.camZoom || 1;
    camCX   = bossDeathScene.orbX;
    camCY   = bossDeathScene.orbY;
  } else {
    // Dynamic zoom: keep all active fighters (including minions/enemies) in frame
    const entities = [...players, ...trainingDummies, ...minions].filter(e => e.health > 0);
    if (entities.length >= 2) {
      let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
      for (const e of entities) {
        minX = Math.min(minX, e.x); maxX = Math.max(maxX, e.x + e.w);
        minY = Math.min(minY, e.y); maxY = Math.max(maxY, e.y + e.h);
      }
      const PAD = 150;
      const boxW = Math.max(maxX - minX + PAD * 2, GAME_W * 0.35);
      const boxH = Math.max(maxY - minY + PAD * 2, GAME_H * 0.35);
      const zoomX = GAME_W / boxW;
      const zoomY = GAME_H / boxH;
      camZoomTarget = Math.min(zoomX, zoomY, 1.1); // allow slight zoom-in when close
      camZoomTarget = Math.max(camZoomTarget, 0.45);
      // Fix: when zoomed out past 50%, half-view exceeds half game-world → just center
      const hVW = GAME_W / (2 * camZoomTarget);
      const hVH = GAME_H / (2 * camZoomTarget);
      const rawCX = (minX + maxX) / 2;
      const rawCY = (minY + maxY) / 2;
      camXTarget = hVW >= GAME_W / 2 ? GAME_W / 2 : clamp(rawCX, hVW, GAME_W - hVW);
      camYTarget = hVH >= GAME_H / 2 ? GAME_H / 2 : clamp(rawCY, hVH, GAME_H - hVH);
    } else {
      camZoomTarget = 1;
      camXTarget = GAME_W / 2;
      camYTarget = GAME_H / 2;
    }
    // Dead zone: don't chase tiny movements (reduces jitter)
    if (Math.abs(camXCur - camXTarget) < 1.5) camXTarget = camXCur;
    if (Math.abs(camYCur - camYTarget) < 1.5) camYTarget = camYCur;
    camZoomCur = lerp(camZoomCur, camZoomTarget, 0.06);
    camXCur    = lerp(camXCur,    camXTarget,    0.08);
    camYCur    = lerp(camYCur,    camYTarget,    0.08);
    camZoom = camZoomCur;
    camCX   = camXCur;
    camCY   = camYCur;
  }

  const finalScX = baseScaleX * camZoom;
  const finalScY = baseScaleY * camZoom;

  // Clear canvas: fill with arena sky color so zoomed-out margins don't show black
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  const _skyBg = ctx.createLinearGradient(0, 0, 0, canvas.height);
  _skyBg.addColorStop(0, currentArena?.sky?.[0] || '#000');
  _skyBg.addColorStop(1, currentArena?.sky?.[1] || '#000');
  ctx.fillStyle = _skyBg;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.restore();

  const sx = (Math.random() - 0.5) * screenShake + (canvas.width  / 2 - camCX * finalScX);
  const sy = (Math.random() - 0.5) * screenShake + (canvas.height / 2 - camCY * finalScY);
  ctx.setTransform(finalScX, 0, 0, finalScY, sx, sy);

  drawBackground();
  drawPlatforms();
  drawBackstagePortals();
  drawMapPerks();

  // Boss beams — update logic + draw (also in training mode when boss is present)
  const hasBossActive = currentArena.isBossArena || (trainingMode && trainingDummies.some(d => d.isBoss));
  if (hasBossActive) {
    for (const b of bossBeams) {
      if (b.phase === 'warning') {
        if (--b.warningTimer <= 0) { b.phase = 'active'; b.activeTimer = 110; }
      } else if (b.phase === 'active') {
        if (--b.activeTimer <= 0) { b.done = true; }
        else {
          // Deal damage each frame to players caught in beam
          const boss = players.find(p => p.isBoss) || trainingDummies.find(d => d.isBoss);
          const beamTargets = trainingMode ? players : players.filter(p => !p.isBoss);
          for (const p of beamTargets) {
            if (p.health <= 0 || p.invincible > 0) continue;
            if (Math.abs(p.cx() - b.x) < 24) dealDamage(boss || players[1], p, 12, 5);
          }
        }
      }
    }
    bossBeams = bossBeams.filter(b => !b.done);
    drawBossBeams();

    // Boss spikes — update and draw
    const bossRef = players.find(p => p.isBoss) || trainingDummies.find(d => d.isBoss);
    for (const sp of bossSpikes) {
      if (sp.done) continue;
      if (sp.phase === 'rising') {
        sp.h += 8;
        if (sp.h >= sp.maxH) { sp.h = sp.maxH; sp.phase = 'staying'; sp.stayTimer = 180; }
      } else if (sp.phase === 'staying') {
        sp.stayTimer--;
        if (sp.stayTimer <= 0) sp.phase = 'falling';
      } else if (sp.phase === 'falling') {
        sp.h -= 6;
        if (sp.h <= 0) { sp.h = 0; sp.done = true; }
      }
      // Damage and bounce players caught by spike
      if (sp.phase === 'rising' || sp.phase === 'staying') {
        const spikeTopY = 460 - sp.h;
        const spikeTargets = trainingMode ? players : players.filter(p => !p.isBoss);
        for (const p of spikeTargets) {
          if (p.health <= 0 || p.invincible > 0) continue;
          if (Math.abs(p.cx() - sp.x) < 9 && p.y + p.h > spikeTopY) {
            dealDamage(bossRef || players.find(q => q.isBoss) || players[1], p, 20, 14);
            // Bounce player upward so they can escape
            if (p.vy >= 0) {
              p.vy = -20;
              p.canDoubleJump = true;
            }
          }
        }
      }
    }
    bossSpikes = bossSpikes.filter(sp => !sp.done);
    drawBossSpikes();
    if (bossDeathScene) updateBossDeathScene();
  }

  // Projectiles
  projectiles.forEach(p => p.update());
  projectiles = projectiles.filter(p => p.active);
  projectiles.forEach(p => p.draw());

  // Minions (boss-spawned)
  minions.forEach(m => { if (m.health > 0) m.update(); });
  minions.forEach(m => { if (m.health > 0) m.draw(); });
  minions = minions.filter(m => m.health > 0);

  // Training dummies / bots
  if (trainingMode) {
    trainingDummies.forEach(d => { if (d.isDummy || d.health > 0 || d.invincible > 0) d.update(); });
    trainingDummies.forEach(d => { if (d.isDummy || d.health > 0 || d.invincible > 0) d.draw(); });
    // Remove dead bots (lives=0), keep dummies (they auto-heal)
    trainingDummies = trainingDummies.filter(d => {
      if (d.isDummy) return true; // dummies auto-heal, never remove
      return d.health > 0 || d.invincible > 0 || d.lives > 0;
    });
  }

  // Minigame logic update
  if (gameMode === 'minigames') updateMinigame();
  // True Form special updates
  if (gameMode === 'trueform') updateTFBlackHoles();

  // Players
  players.forEach(p => { if (p.health > 0 || p.invincible > 0) p.update(); });
  players.forEach(p => { if (p.health > 0 || p.invincible > 0) p.draw(); });
  drawSpartanRageEffects();
  drawClassEffects();
  drawCurseAuras();
  if (gameMode === 'trueform') drawTFBlackHoles();
  checkWeaponSparks();

  // Ability activation ring flash
  if (abilityFlashTimer > 0 && abilityFlashPlayer) {
    const fp = abilityFlashPlayer;
    ctx.save();
    ctx.globalAlpha = (abilityFlashTimer / 14) * 0.6;
    ctx.strokeStyle = fp.color;
    ctx.lineWidth   = 3;
    const r = (14 - abilityFlashTimer) * 4 + 8;
    ctx.beginPath(); ctx.arc(fp.cx(), fp.cy(), r, 0, Math.PI * 2); ctx.stroke();
    ctx.restore();
    abilityFlashTimer--;
  }

  drawSecretLetters();
  if (bossDeathScene) drawBossDeathScene();
  updateMapPerks();
  updateFakeDeathScene();
  drawFakeDeathScene();

  // Particles — filter dead ones first so life never goes below 1 during draw
  particles = particles.filter(p => p.life > 0);
  particles.forEach(p => {
    p.x += p.vx; p.y += p.vy;
    p.vy += 0.12; p.vx *= 0.96;
    p.life--;
    if (p.life <= 0) return;
    const a = p.life / p.maxLife;
    ctx.globalAlpha = Math.max(0, a);
    ctx.fillStyle   = p.color;
    ctx.beginPath();
    ctx.arc(p.x, p.y, Math.max(0.01, p.size * a), 0, Math.PI * 2);
    ctx.fill();
  });
  ctx.globalAlpha = 1;

  // Damage texts
  damageTexts.forEach(d => { d.update(); d.draw(); });
  damageTexts = damageTexts.filter(d => d.life > 0);

  // Respawn countdowns
  for (const cd of respawnCountdowns) {
    cd.framesLeft--;
    if (cd.framesLeft <= 0) continue;
    const num = Math.ceil(cd.framesLeft / 22);
    const a   = Math.min(1, cd.framesLeft / 18) * (1 - Math.max(0, (22 - cd.framesLeft % 22) / 22) * 0.3);
    ctx.save();
    ctx.globalAlpha = Math.max(0, a);
    ctx.font        = 'bold 32px Arial';
    ctx.fillStyle   = cd.color;
    ctx.textAlign   = 'center';
    ctx.shadowColor = 'rgba(0,0,0,0.9)';
    ctx.shadowBlur  = 8;
    ctx.fillText(num, cd.x, cd.y);
    ctx.restore();
  }
  respawnCountdowns = respawnCountdowns.filter(cd => cd.framesLeft > 0);

  // Boss speech bubble (drawn last so it's above everything)
  if (currentArena.isBossArena) drawBossDialogue();

  // Boss phase 3: subtle red screen tint
  if (currentArena && currentArena.isBossArena && settings.bossAura) {
    const bossChar = players.find(p => p.isBoss);
    if (bossChar && bossChar.getPhase && bossChar.getPhase() >= 3 && bossChar.health > 0) {
      ctx.save();
      ctx.globalAlpha = 0.03 + Math.sin(frameCount * 0.04) * 0.012;
      ctx.fillStyle   = '#ff0000';
      ctx.fillRect(0, 0, GAME_W, GAME_H);
      ctx.restore();
    }
  }

  // Boss phase transition flash
  if (bossPhaseFlash > 0) {
    ctx.save();
    ctx.globalAlpha = (bossPhaseFlash / 50) * 0.55;
    ctx.fillStyle   = '#ffffff';
    ctx.fillRect(0, 0, GAME_W, GAME_H);
    bossPhaseFlash--;
    ctx.restore();
  }

  screenShake *= 0.84;
  // Reset to non-shake transform (keep scale + camera centering, remove shake)
  ctx.setTransform(finalScX, 0, 0, finalScY,
    canvas.width  / 2 - camCX * finalScX,
    canvas.height / 2 - camCY * finalScY);

  checkDeaths();
  updateHUD();

  // Tutorial overlay (drawn in stable game space after shake reset)
  if (tutorialMode) { updateTutorial(); drawTutorial(); }
  // Minigame HUD overlay
  if (gameMode === 'minigames') drawMinigameHUD();
  // Achievement popups (drawn over everything, in screen space)
  ctx.setTransform(1, 0, 0, 1, 0, 0); // reset transform for screen-space draw
  drawAchievementPopups();
  drawEdgeIndicators(finalScX, finalScY, camCX, camCY);
  // Restore the stable game transform after (remaining draws use it already)
  ctx.setTransform(finalScX, 0, 0, finalScY, canvas.width/2 - camCX*finalScX, canvas.height/2 - camCY*finalScY);

  // Infinite mode: draw win score on canvas (outside shake transform)
  if (infiniteMode && gameRunning) {
    const p1c = players[0] ? players[0].color : '#00d4ff';
    const p2c = players[1] ? players[1].color : '#ff4455';
    ctx.save();
    ctx.textAlign   = 'center';
    ctx.shadowColor = 'rgba(0,0,0,0.95)';
    ctx.shadowBlur  = 14;
    ctx.font        = 'bold 30px Arial';
    ctx.fillStyle   = p1c;
    ctx.fillText(winsP1, GAME_W / 2 - 48, 96);
    ctx.fillStyle   = 'rgba(255,255,255,0.7)';
    ctx.fillText('—', GAME_W / 2, 96);
    ctx.fillStyle   = p2c;
    ctx.fillText(winsP2, GAME_W / 2 + 48, 96);
    ctx.restore();
  }

  requestAnimationFrame(gameLoop);
}

// ============================================================
// INPUT
// ============================================================
const keysDown      = new Set();
const keyHeldFrames = {};   // key → frames held continuously

const SCROLL_BLOCK = new Set([' ', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 's', 'S', '/']);

document.addEventListener('keydown', e => {
  if (e.key === 'Escape' || e.key === 'p' || e.key === 'P') { pauseGame(); return; }
  // Cheat code: type TRUEFORM anywhere in menu to unlock True Form
  if (!gameRunning && e.key.length === 1) {
    _cheatBuffer = ((_cheatBuffer || '') + e.key.toUpperCase()).slice(-8);
    if (_cheatBuffer === 'TRUEFORM') {
      _cheatBuffer = '';
      if (!unlockedTrueBoss) {
        unlockedTrueBoss = true;
        localStorage.setItem('smc_trueform', '1');
        localStorage.setItem('smc_letters', JSON.stringify([0,1,2,3,4,5,6,7]));
        collectedLetterIds = new Set([0,1,2,3,4,5,6,7]);
        syncCodeInput();
        const card = document.getElementById('modeTrueForm');
        if (card) card.style.display = '';
        spawnParticles && spawnParticles(450, 260, '#cc00ff', 30);
        spawnParticles && spawnParticles(450, 260, '#ffffff', 20);
        showBossDialogue && showBossDialogue('True Form Unlocked!', 180);
        // Show a brief notification
        const notif = document.createElement('div');
        notif.textContent = '⚡ TRUE FORM UNLOCKED ⚡';
        notif.style.cssText = 'position:fixed;top:20%;left:50%;transform:translateX(-50%);background:rgba(160,0,255,0.92);color:#fff;padding:16px 32px;border-radius:12px;font-size:1.2rem;font-weight:900;letter-spacing:3px;z-index:9999;pointer-events:none;text-align:center;box-shadow:0 0 40px #cc00ff;';
        document.body.appendChild(notif);
        setTimeout(() => notif.remove(), 3000);
      }
    }
  }
  if (e.key === 'Tab' && tutorialMode) { e.preventDefault(); advanceTutorialStep(); return; }
  if (SCROLL_BLOCK.has(e.key)) e.preventDefault();
  if (keysDown.has(e.key)) return; // already tracked — let held-frame counter run
  keysDown.add(e.key);

  if (!gameRunning || paused) return;

  players.forEach((p, i) => {
    if (p.isAI || p.health <= 0) return;
    const other         = players[i === 0 ? 1 : 0];
    const incapacitated = p.ragdollTimer > 0 || p.stunTimer > 0;
    if (!incapacitated && e.key === p.controls.attack)  { e.preventDefault(); p.attack(other); }
    if (!incapacitated && e.key === p.controls.ability) { e.preventDefault(); p.ability(other); }
    if (!incapacitated && p.controls.super && e.key === p.controls.super) {
      e.preventDefault();
      checkSecretLetterCollect(p);
      p.useSuper(other);
    }
  });
});

document.addEventListener('keyup', e => {
  keysDown.delete(e.key);
  delete keyHeldFrames[e.key];
});

const SHIELD_MAX    = 140;  // max frames shield stays up (~2.3 s)
const SHIELD_CD     = 900; // 30-second cooldown at 60 fps

function processInput() {
  if (!gameRunning || paused) return;

  // Update key-held counters
  for (const k of keysDown) keyHeldFrames[k] = (keyHeldFrames[k] || 0) + 1;

  players.forEach(p => {
    if (p.isAI || p.health <= 0) return;
    if (p.ragdollTimer > 0 || p.stunTimer > 0) { p.shielding = false; return; }

    const hasCurseSlow = p.curses && p.curses.some(c => c.type === 'curse_slow');
    const _chaosSpeed = gameMode === 'minigames' && currentChaosModifiers.has('speedy') ? 1.4 : 1.0;
    const spd  = 5.2 * (p.classSpeedMult || 1.0) * (p._speedBuff > 0 ? 1.35 : 1.0) * (hasCurseSlow ? 0.6 : 1.0) * _chaosSpeed;
    const wHeld = keyHeldFrames[p.controls.jump]  || 0;


    // --- Regular movement ---
    // True Form: inverted controls for human players only
    const _leftKey  = (gameMode === 'trueform' && tfControlsInverted && !p.isAI) ? p.controls.right : p.controls.left;
    const _rightKey = (gameMode === 'trueform' && tfControlsInverted && !p.isAI) ? p.controls.left  : p.controls.right;
    const movingLeft  = keysDown.has(_leftKey);
    const movingRight = keysDown.has(_rightKey);
    if (movingLeft) {
      p.vx = -spd;
    }
    if (movingRight) {
      p.vx =  spd;
    }
    // Decay acceleration ramp when no direction key held

    // --- Jump (ground jump + double jump) ---
    if (wHeld === 1) {
      if (p.onGround) {
        // Ground jump
        p.vy = -17;
        p.canDoubleJump = true; // enable one double-jump after leaving ground
        spawnParticles(p.cx(), p.y + p.h, '#ffffff', 5);
        SoundManager.jump();
      } else if (p.canDoubleJump) {
        // Double jump in air
        p.vy = -13;
        p.canDoubleJump = false;
        spawnParticles(p.cx(), p.cy(), p.color,  8);
        spawnParticles(p.cx(), p.cy(), '#ffffff', 5);
        SoundManager.jump();
      }
    }
    // --- S / ArrowDown = boost shield (30-second cooldown) ---
    const sHeld = keysDown.has(p.controls.shield);
    if (sHeld && p.shieldCooldown === 0) {
      p.shielding       = true;
      p.shieldHoldTimer = (p.shieldHoldTimer || 0) + 1;
      if (p.shieldHoldTimer >= SHIELD_MAX) {
        // Max duration exhausted → forced break and start cooldown
        p.shielding       = false;
        p.shieldCooldown  = SHIELD_CD;
        p.shieldHoldTimer = 0;
      }
    } else {
      if (p.shielding && !sHeld) {
        // Player released S — start cooldown if they used it for more than 3 frames
        if ((p.shieldHoldTimer || 0) > 3) p.shieldCooldown = SHIELD_CD;
        p.shielding       = false;
        p.shieldHoldTimer = 0;
      }
      if (!sHeld) p.shielding = false;
    }
  });
}

// ============================================================
// EXPERIMENTAL CODE SYSTEM
// ============================================================
function applyCode(val) {
  const code  = (val || '').trim().toUpperCase();
  const msgEl = document.getElementById('codeMessage');
  if (code === 'TRUEFORM') {
    unlockedTrueBoss = true;
    if (msgEl) { msgEl.textContent = '\u2713 True Creator unlocked! Start a boss fight.'; msgEl.style.color = '#cc00ee'; }
  } else {
    if (msgEl) { msgEl.textContent = '\u2717 Unknown code.'; msgEl.style.color = '#ff4444'; }
  }
}

// ============================================================
// ============================================================
// TUTORIAL MODE
// ============================================================
const TUTORIAL_STEPS = [
  {
    id: 'move',
    title: 'Step 1 — Move',
    keys: 'A / D',
    desc: ['Walk left and right to move around.', 'Use A (left) and D (right), or arrow keys.'],
    check: (f) => f.moved,
  },
  {
    id: 'jump',
    title: 'Step 2 — Jump',
    keys: 'W',
    desc: ['Press W (or ↑) to jump!'],
    check: (f) => f.jumped,
  },
  {
    id: 'djump',
    title: 'Step 3 — Double Jump',
    keys: 'W + W',
    desc: ['Jump first, then press W again', 'while airborne for a second jump!'],
    check: (f) => f.dblJumped,
  },
  {
    id: 'dash',
    title: 'Step 4 — Dash',
    keys: 'Hold A / D  or  Hold W',
    desc: ['Hold A or D to charge a horizontal dash.', 'Hold W to charge a vertical super-jump.', 'Release when charged to launch!'],
    check: (f) => f.dashed,
  },
  {
    id: 'shield',
    title: 'Step 5 — Shield',
    keys: 'S  (hold)',
    desc: ['Hold S (or ↓) to raise your shield.', 'Blocks incoming attacks. 30-second cooldown.'],
    check: (f) => f.shielded,
  },
  {
    id: 'attack',
    title: 'Step 6 — Attack',
    keys: 'Space',
    desc: ['Press Space (or Enter) to attack!', 'A training dummy appeared — go hit it!'],
    check: (f) => f.attacked,
    onEnter: () => {
      const dummy = new Dummy(640, 300);
      dummy.playerNum = 2; dummy.name = 'DUMMY';
      trainingDummies.push(dummy);
      if (players[0]) { players[0].target = dummy; dummy.target = players[0]; }
    },
  },
  {
    id: 'ability',
    title: 'Step 7 — Weapon Ability',
    keys: 'Q',
    desc: ['Every weapon has a special ability.', 'Press Q (or .) to activate yours!'],
    check: (f) => f.abilityUsed,
  },
  {
    id: 'super',
    title: 'Step 8 — Super Move',
    keys: 'E',
    desc: ['Your super meter is fully charged!', 'Press E (or /) to unleash your super move!'],
    check: (f) => f.superUsed,
    onEnter: () => {
      const p = players[0];
      if (p) { p.superMeter = 100; p.superReady = true; p.superFlashTimer = 90; }
    },
  },
  {
    id: 'weapons',
    title: 'Weapons',
    keys: '',
    desc: ['Each weapon has unique attacks, abilities,', 'and supers. Sword, Hammer, Gun, Axe, Spear,', 'Bow, Shield, and Scythe are all available!'],
    check: null,
    autoAdvance: 320,
  },
  {
    id: 'classes',
    title: 'Classes',
    keys: '',
    desc: ['Classes give passive bonuses and a perk at', 'low HP. Archer forces Bow, Paladin forces Shield.', 'Berserker, Kratos, Ninja — each plays differently!'],
    check: null,
    autoAdvance: 320,
  },
  {
    id: 'modes',
    title: 'Game Modes',
    keys: '',
    desc: ['1v1: Fight a friend or AI bot.', 'Boss Fight: Challenge the Creator.', 'Training: Practice freely with dummies.'],
    check: null,
    autoAdvance: 280,
  },
  {
    id: 'done',
    title: "You're Ready!",
    keys: '',
    desc: ['You know the basics — good luck!', 'Head to Training to practice further,', 'or jump straight into a match!'],
    check: null,
    autoAdvance: 200,
  },
];

function advanceTutorialStep() {
  tutorialStep++;
  tutorialStepTimer = 0;
  tutStepComplete   = false;
  const next = TUTORIAL_STEPS[tutorialStep];
  if (next && next.onEnter) next.onEnter();
  if (tutorialStep >= TUTORIAL_STEPS.length) {
    tutorialMode = false;
    if (typeof markTutorialDone === 'function') markTutorialDone();
    backToMenu();
  }
}

function updateTutorial() {
  if (!tutorialMode || !gameRunning) return;
  const p = players[0];
  if (!p) return;
  const step = TUTORIAL_STEPS[tutorialStep];
  if (!step) return;

  tutorialStepTimer++;

  // Per-step flag detection (only set flags during the relevant step)
  if (step.id === 'move'    && !tutorialFlags.moved      && Math.abs(p.vx) > 1.5) tutorialFlags.moved = true;
  if (step.id === 'jump'    && !tutorialFlags.jumped     && !p.onGround && tutPrevOnGround && p.vy < 0) tutorialFlags.jumped = true;
  if (step.id === 'djump'   && !tutorialFlags.dblJumped  && !p.canDoubleJump && tutPrevCanDblJump && !p.onGround) tutorialFlags.dblJumped = true;
  if (step.id === 'dash'    && !tutorialFlags.dashed     && !p.onGround && (p.vy < -19 || Math.abs(p.vx) > 14)) tutorialFlags.dashed = true;
  if (step.id === 'shield'  && !tutorialFlags.shielded   && p.shielding) tutorialFlags.shielded = true;
  if (step.id === 'attack'  && !tutorialFlags.attacked   && p.state === 'attacking') tutorialFlags.attacked = true;
  if (step.id === 'ability' && !tutorialFlags.abilityUsed && abilityFlashTimer > 0 && abilityFlashPlayer === p) tutorialFlags.abilityUsed = true;
  if (step.id === 'super'   && !tutorialFlags.superUsed  && p.superActive) tutorialFlags.superUsed = true;

  tutPrevOnGround   = p.onGround;
  tutPrevCanDblJump = p.canDoubleJump;

  // Mark step complete (once) and reset timer for the advance delay
  if (!tutStepComplete && step.check && step.check(tutorialFlags)) {
    tutStepComplete   = true;
    tutorialStepTimer = 0;
  }

  const shouldAdvance =
    (tutStepComplete && tutorialStepTimer >= 50) ||
    (step.autoAdvance && tutorialStepTimer >= step.autoAdvance);

  if (shouldAdvance) advanceTutorialStep();
}

function drawTutorial() {
  if (!tutorialMode) return;
  const step = TUTORIAL_STEPS[tutorialStep];
  if (!step) return;

  ctx.save();

  // Push panel below the HTML HUD bar (≈50 game-units from top keeps it clear)
  const PX = 12, PY = 52;
  const PW = GAME_W - 24;
  const keyH = step.keys ? 20 : 0;
  const PH   = 24 + keyH + step.desc.length * 16 + 18;

  // Panel background
  ctx.globalAlpha = 0.92;
  ctx.fillStyle   = '#07071a';
  ctx.fillRect(PX, PY, PW, PH);
  ctx.globalAlpha = 0.75;
  ctx.strokeStyle = tutStepComplete ? '#44ff88' : '#7733bb';
  ctx.lineWidth   = 1.5;
  ctx.strokeRect(PX, PY, PW, PH);
  ctx.globalAlpha = 1;

  // Progress dots (top-right)
  const total   = TUTORIAL_STEPS.length;
  const dotGap  = 13;
  const dotsW   = total * dotGap;
  const dotSX   = PX + PW - dotsW - 8;
  const dotCY   = PY + 10;
  for (let i = 0; i < total; i++) {
    ctx.beginPath();
    const r = (i === tutorialStep) ? 4 : 2.5;
    ctx.arc(dotSX + i * dotGap, dotCY, r, 0, Math.PI * 2);
    ctx.fillStyle = i < tutorialStep
      ? '#7733bb'
      : (i === tutorialStep ? (tutStepComplete ? '#44ff88' : '#ffffff') : '#252540');
    ctx.fill();
  }

  // Title
  ctx.fillStyle = tutStepComplete ? '#44ff88' : '#ffffff';
  ctx.font      = 'bold 14px Arial';
  ctx.textAlign = 'left';
  ctx.fillText(step.title, PX + 14, PY + 17);

  // Key badge
  let descOffsetY = PY + 26;
  if (step.keys) {
    const bx = PX + 14, by = descOffsetY;
    const bw = step.keys.length * 7.5 + 14, bh = 16;
    ctx.fillStyle   = '#1a0933';
    ctx.fillRect(bx, by, bw, bh);
    ctx.strokeStyle = '#6633aa';
    ctx.lineWidth   = 1;
    ctx.strokeRect(bx, by, bw, bh);
    ctx.fillStyle = '#ffcc44';
    ctx.font      = 'bold 11px monospace';
    ctx.fillText(step.keys, bx + 7, by + 11);
    descOffsetY = by + bh + 6;
  }

  // Description lines
  ctx.fillStyle = '#b0b0cc';
  ctx.font      = '12px Arial';
  step.desc.forEach((line, i) => ctx.fillText(line, PX + 14, descOffsetY + i * 16 + 11));

  // Footer
  ctx.textAlign = 'right';
  if (tutStepComplete) {
    ctx.fillStyle = '#44ff88';
    ctx.font      = 'bold 12px Arial';
    ctx.fillText('Done! Advancing...', PX + PW - 10, PY + PH - 5);
  } else if (step.autoAdvance) {
    // progress bar
    const prog = Math.min(tutorialStepTimer / step.autoAdvance, 1);
    ctx.fillStyle = '#1a1a33';
    ctx.fillRect(PX + 14, PY + PH - 7, PW - 28, 4);
    ctx.fillStyle = '#7733bb';
    ctx.fillRect(PX + 14, PY + PH - 7, (PW - 28) * prog, 4);
  } else {
    ctx.fillStyle = '#444466';
    ctx.font      = '10px Arial';
    ctx.fillText('Tab — skip step', PX + PW - 10, PY + PH - 5);
  }

  ctx.restore();
}

// ============================================================
// MENU UI HANDLERS
// ============================================================
function selectMode(mode) {
  // 'bot' is no longer a separate mode — merge into '2p' with bot toggles
  if (mode === 'bot') mode = '2p';
  gameMode = mode;
  document.querySelectorAll('.mode-card').forEach(c => c.classList.remove('active'));
  const modeCard = document.querySelector(`[data-mode="${mode}"]`);
  if (modeCard) modeCard.classList.add('active');
  const isBoss       = mode === 'boss';
  const isTrueForm   = mode === 'trueform';
  const isBoss2p     = isBoss && bossPlayerCount === 2;
  const isTraining   = mode === 'training';
  const isTutorial   = mode === 'tutorial';
  const isMinigames  = mode === 'minigames';
  // Show/hide boss player count toggle
  const bpt = document.getElementById('bossPlayerToggle');
  if (bpt) bpt.style.display = isBoss ? 'flex' : 'none';
  // Show/hide minigame selection panel
  const mgPanel = document.getElementById('minigamePanel');
  if (mgPanel) mgPanel.style.display = isMinigames ? 'block' : 'none';
  // P2 panel title/hint
  document.getElementById('p2Title').textContent = isTrueForm ? 'TRUE FORM' : (isBoss && !isBoss2p) ? 'CREATOR' : (isBoss2p ? 'Player 2' : ((isTraining || isTutorial) ? 'TRAINING' : (p2IsBot ? 'BOT' : 'Player 2')));
  document.getElementById('p2Hint').textContent  = isTrueForm ? 'Secret Final Boss' : (isBoss && !isBoss2p) ? 'Boss — AI Controlled' : (isBoss2p ? '← → ↑ · Enter · . · /' : ((isTraining || isTutorial) ? 'Practice mode' : (p2IsBot ? 'AI Controlled' : '← → ↑ · Enter · . · / · ↓')));
  document.getElementById('p1DifficultyRow').style.display = p1IsBot ? 'flex' : 'none';
  document.getElementById('p2DifficultyRow').style.display = p2IsBot ? 'flex' : 'none';
  // Hide P2 config rows in boss 1P, training, tutorial, trueform
  const hideP2 = (isBoss && !isBoss2p) || isTraining || isTutorial || isTrueForm;
  document.getElementById('p2ColorRow').style.display     = hideP2 ? 'none' : 'flex';
  document.getElementById('p2WeaponRow').style.display    = hideP2 ? 'none' : 'flex';
  document.getElementById('p2ClassRow').style.display     = hideP2 ? 'none' : 'flex';
  // Hide P1 bot toggle in boss modes, tutorial, minigames, trueform (always human-controlled)
  const p1BotToggle = document.getElementById('p1BotToggle');
  if (p1BotToggle) p1BotToggle.style.display = (isBoss || isTutorial || isMinigames || isTrueForm) ? 'none' : '';
  const p2BotToggleEl = document.getElementById('p2BotToggle');
  if (p2BotToggleEl) p2BotToggleEl.style.display = (isBoss2p) ? '' : (isBoss || isTrueForm) ? 'none' : '';
  // Training panel visibility (not in tutorial)
  const trainingPanel = document.getElementById('trainingPanel');
  if (trainingPanel) trainingPanel.style.display = isTraining ? 'block' : 'none';
  // Boss/training/tutorial/minigames/trueform: hide arena picker and ∞ infinite
  document.getElementById('arenaSection').style.display   = (isBoss || isTraining || isTutorial || isMinigames || isTrueForm) ? 'none' : '';
  document.getElementById('infiniteOption').style.display = (isBoss || isTraining || isTutorial || isMinigames || isTrueForm) ? 'none' : '';
  if ((isBoss || isTraining || isTutorial || isMinigames || isTrueForm) && infiniteMode) {
    infiniteMode = false;
    selectLives(3);
  }
}

const SKIN_COLORS = {
  default: null, // uses player's selected color
  fire:    '#ff4400',
  ice:     '#44aaff',
  shadow:  '#222233',
  gold:    '#cc8800',
};
let p1Skin = 'default', p2Skin = 'default';

function setSkin(pid, skin, btn) {
  if (pid === 'p1') p1Skin = skin;
  else              p2Skin = skin;
  // Update active state on buttons for this player
  document.querySelectorAll(`.skin-swatch[data-pid="${pid}"]`).forEach(b => b.classList.remove('active'));
  if (btn) btn.classList.add('active');
}

function setBossPlayers(n) {
  bossPlayerCount = n;
  document.getElementById('bpBtn1').classList.toggle('active', n === 1);
  document.getElementById('bpBtn2').classList.toggle('active', n === 2);
  selectMode('boss'); // refresh UI
}

function toggleBot(pid) {
  if (pid === 'p1') {
    p1IsBot = !p1IsBot;
    const btn = document.getElementById('p1BotToggle');
    if (btn) btn.textContent = p1IsBot ? 'Bot' : 'Human';
  } else {
    // Cycle: Human → Bot → None → Human
    if (!p2IsBot && !p2IsNone)      { p2IsBot = true;  p2IsNone = false; }
    else if (p2IsBot && !p2IsNone)  { p2IsBot = false; p2IsNone = true;  }
    else                             { p2IsBot = false; p2IsNone = false; }
    const btn = document.getElementById('p2BotToggle');
    if (btn) btn.textContent = p2IsNone ? 'None' : (p2IsBot ? 'Bot' : 'Human');
  }
  // Refresh mode UI to reflect updated bot state
  selectMode(gameMode);
}

// ============================================================
// WEAPON / CLASS DESCRIPTION PANEL
// ============================================================
function showDesc(pid, type, value) {
  const panel = document.getElementById(pid + 'Desc');
  const titleEl = document.getElementById(pid + 'DescTitle');
  const bodyEl  = document.getElementById(pid + 'DescBody');
  if (!panel || !titleEl || !bodyEl) return;
  const desc = type === 'weapon' ? WEAPON_DESCS[value] : CLASS_DESCS[value];
  if (!desc) { panel.style.display = 'none'; return; }
  panel.style.display = 'block';
  titleEl.textContent = desc.title;
  bodyEl.innerHTML = [
    `<span style="color:#ccc">${desc.what}</span>`,
    desc.ability ? `<br><span style="color:#88ccff">${desc.ability}</span>` : '',
    desc.super   ? `<br><span style="color:#ffaa44">${desc.super}</span>`   : '',
    desc.perk    ? `<br><span style="color:#aaffaa">★ ${desc.perk}</span>`  : '',
    `<br><span style="color:#aaa; font-style:italic">Tip: ${desc.how}</span>`,
  ].join('');
}

// Force-select the weapon required by a class, and disable weapon select for class-locked weapons.
function updateClassWeapon(pid) {
  const classEl  = document.getElementById(pid + 'Class');
  const weaponEl = document.getElementById(pid + 'Weapon');
  if (!classEl || !weaponEl) return;
  const cls = CLASSES[classEl.value];
  if (cls && cls.weapon) {
    // Class forces a specific weapon — lock the selector
    weaponEl.value    = cls.weapon;
    weaponEl.disabled = true;
  } else {
    weaponEl.disabled = false;
  }
  // Show description for the class
  showDesc(pid, 'class', classEl.value);
}

function selectArena(name) {
  selectedArena = name;
  document.querySelectorAll('.arena-card[data-arena]').forEach(c => c.classList.remove('active'));
  document.querySelector(`[data-arena="${name}"]`).classList.add('active');
}

function selectLives(n) {
  infiniteMode = (n === 0);
  chosenLives  = infiniteMode ? 3 : n; // placeholder when infinite
  document.querySelectorAll('.arena-card[data-lives]').forEach(c => c.classList.remove('active'));
  document.querySelector(`[data-lives="${n}"]`).classList.add('active');
}

function toggleSettings() {
  const panel = document.getElementById('settingsPanel');
  panel.style.display = panel.style.display === 'block' ? 'none' : 'block';
}

function toggleCard(id) {
  const card  = document.getElementById(id);
  const arrow = card.querySelector('.expand-arrow');
  card.classList.toggle('expanded');
  if (arrow) arrow.textContent = card.classList.contains('expanded') ? '▾' : '▸';
}

function updateSettings() {
  settings.particles   = document.getElementById('settingParticles').checked;
  settings.screenShake = document.getElementById('settingShake').checked;
  settings.dmgNumbers  = document.getElementById('settingDmgNums').checked;
  settings.landingDust = document.getElementById('settingLandDust').checked;
  const bossAuraEl   = document.getElementById('settingBossAura');
  const botPortalEl  = document.getElementById('settingBotPortal');
  const phaseFlashEl = document.getElementById('settingPhaseFlash');
  if (bossAuraEl)   settings.bossAura   = bossAuraEl.checked;
  if (botPortalEl)  settings.botPortal  = botPortalEl.checked;
  if (phaseFlashEl) settings.phaseFlash = phaseFlashEl.checked;
}

function toggleAdvanced() {
  const panel = document.getElementById('advancedPanel');
  if (panel) panel.style.display = panel.style.display === 'block' ? 'none' : 'block';
}

function toggleStatsLog() {
  const modal   = document.getElementById('statsLogModal');
  const content = document.getElementById('statsLogContent');
  if (!modal) return;
  if (modal.style.display === 'block') { modal.style.display = 'none'; return; }

  // Build HTML tables from game constants
  let html = '<h2 style="color:#cc00ee;margin-bottom:16px;letter-spacing:2px">STATS LOG — Stickman Battles</h2>';

  // Classes
  html += '<h3 style="color:#00d4ff;margin:12px 0 6px">Classes</h3><table style="width:100%;border-collapse:collapse;font-size:12px">';
  html += '<tr style="background:rgba(0,180,255,0.15)"><th>Name</th><th>HP</th><th>Speed</th><th>Weapon</th><th>Perk</th></tr>';
  for (const [key, cls] of Object.entries(CLASSES)) {
    html += `<tr style="border-bottom:1px solid rgba(255,255,255,0.08)"><td>${cls.name}</td><td>${cls.hp}</td><td>${cls.speedMult}x</td><td>${cls.weapon || '—'}</td><td>${cls.perk || '—'}</td></tr>`;
  }
  html += '</table>';

  // Weapons (all, including new)
  html += '<h3 style="color:#ffd700;margin:16px 0 6px">Weapons</h3><table style="width:100%;border-collapse:collapse;font-size:12px">';
  html += '<tr style="background:rgba(255,215,0,0.12)"><th>Name</th><th>Type</th><th>Damage</th><th>Range</th><th>Cooldown</th><th>KB</th><th>Ability</th></tr>';
  for (const [key, w] of Object.entries(WEAPONS)) {
    const dmg = w.damageFunc ? (key === 'gun' ? '5-8' : key === 'bow' ? '12-20' : key === 'peashooter' ? '2-3' : key === 'slingshot' ? '12-17' : key === 'paperairplane' ? '6-9' : 'random') : w.damage;
    html += `<tr style="border-bottom:1px solid rgba(255,255,255,0.08)"><td>${w.name || key}</td><td style="color:#aaa">${w.type}</td><td>${dmg}</td><td>${w.range}px</td><td>${w.cooldown}f</td><td>${w.kb}</td><td style="font-size:11px;color:#ccc">${w.abilityName || '—'}</td></tr>`;
  }
  html += '</table>';

  // Arenas
  html += '<h3 style="color:#aaffaa;margin:16px 0 6px">Arenas &amp; Map Gimmicks</h3><table style="width:100%;border-collapse:collapse;font-size:12px">';
  html += '<tr style="background:rgba(100,255,100,0.10)"><th>Arena</th><th>Gravity</th><th>Gimmick</th><th>Platforms</th></tr>';
  const arenaGimmicks = { grass: 'Floating bouncy platforms', lava: 'Lava floor (high gravity)', space: 'Low gravity + Meteors', city: 'Cars deal damage + Neon', forest: 'Forest Beast (1% chance), Raged (10%)', ice: 'Blizzard gusts + Yeti (0.5%)', ruins: 'Artifact pickups + Curses', creator: 'Boss floor hazards + Moving platforms' };
  for (const [key, ar] of Object.entries(ARENAS)) {
    const grav = ar.isLowGravity ? 'Low (0.22)' : ar.isHeavyGravity ? 'Heavy (0.85)' : 'Normal (0.55)';
    html += `<tr style="border-bottom:1px solid rgba(255,255,255,0.08)"><td style="color:#aaffaa">${key}</td><td>${grav}</td><td style="font-size:11px;color:#ccc">${arenaGimmicks[key] || '—'}</td><td>${ar.platforms.length}</td></tr>`;
  }
  html += '</table>';

  // Entities
  html += '<h3 style="color:#ff9944;margin:16px 0 6px">Special Entities</h3><table style="width:100%;border-collapse:collapse;font-size:12px">';
  html += '<tr style="background:rgba(255,150,50,0.12)"><th>Entity</th><th>HP</th><th>Location</th><th>Special Moves</th></tr>';
  const entities = [
    ['Forest Beast', '300 (Raged: 180)', 'Forest arena (1% chance/sec)', 'Dash charge at high speed'],
    ['Raged Beast', '180', 'Forest arena (1 in 10 beast spawns)', '+dmg, +kb, +speed, red aura'],
    ['Yeti', '450', 'Ice arena (0.5% chance/frame)', 'Roar stun, Ice spikes, Ice breath'],
    ['Boss (Creator)', '3000 (True: 4500)', 'Creator arena', 'Beams, Spikes, Floor hazards, Minions, Teleport'],
    ['Boss Minion', '50', 'Spawned by Boss Phase 2+', 'Hard AI, 50% damage output'],
    ['Dummy', '∞ (auto-heal)', 'Training mode', 'Stands still — for practice'],
  ];
  for (const [name, hp, loc, moves] of entities) {
    html += `<tr style="border-bottom:1px solid rgba(255,255,255,0.08)"><td style="color:#ffaa66">${name}</td><td>${hp}</td><td style="font-size:11px;color:#aaa">${loc}</td><td style="font-size:11px;color:#ccc">${moves}</td></tr>`;
  }
  html += '</table>';

  // Boss
  html += '<h3 style="color:#cc00ee;margin:16px 0 6px">Boss Stats</h3><table style="width:100%;border-collapse:collapse;font-size:12px">';
  html += '<tr style="background:rgba(200,0,238,0.12)"><th>Stat</th><th>Value</th></tr>';
  const bossStats = [
    ['HP', '3000 (True Form: 4500)'], ['Phase 1', '> 2000 HP'], ['Phase 2', '1000–2000 HP'],
    ['Phase 3', '< 1000 HP'], ['KB Resist', '0.5x'], ['KB Bonus', '1.5x (True: 2.5x)'],
    ['Attack CD Mult', '0.5x (True: 0.28x)'], ['Beam CD P2', '560f'], ['Beam CD P3', '400f/280f (P3)'],
    ['Spike Damage', '20 (launch vy=-24)'], ['Beam Damage', '12/frame in 24px'], ['Floor Hazard', '15s active, 5s warning'],
    ['Fake Death', 'Triggers at 33% HP, one per game'], ['Backstage Hide', 'Invincible + 60f attack block on exit'],
  ];
  for (const [k, v] of bossStats) {
    html += `<tr style="border-bottom:1px solid rgba(255,255,255,0.08)"><td>${k}</td><td>${v}</td></tr>`;
  }
  html += '</table>';

  // Training commands
  html += '<h3 style="color:#bb88ff;margin:16px 0 6px">Training Commands</h3><table style="width:100%;border-collapse:collapse;font-size:12px">';
  html += '<tr style="background:rgba(180,120,255,0.12)"><th>Command</th><th>Effect</th></tr>';
  const cmds = [
    ['Full HP', 'Restore health to max (player or all if toggle off)'],
    ['Give Super', 'Fill super meter to 100% instantly'],
    ['No CDs', 'Toggle: all ability/attack cooldowns frozen at 0'],
    ['Spawn Dummy', 'Add a new training dummy to the arena'],
    ['Spawn Bot', 'Spawn an AI fighter targeting you'],
    ['Spawn Boss', 'Spawn a full Boss entity (can spawn multiple)'],
    ['Spawn Beast', 'Spawn a Forest Beast in the arena'],
    ['Godmode', 'Toggle: no hitbox — immune to all damage'],
    ['One Punch', 'Toggle: all attacks deal 9999 damage'],
    ['Chaos', 'Toggle: all entities attack their nearest neighbour'],
    ['Clear All', 'Remove all dummies, bots, bosses, projectiles'],
    ['Player Only', 'Toggle: commands affect only P1 or all entities'],
  ];
  for (const [cmd, effect] of cmds) {
    html += `<tr style="border-bottom:1px solid rgba(255,255,255,0.08)"><td style="color:#cc99ff">${cmd}</td><td style="font-size:11px;color:#ccc">${effect}</td></tr>`;
  }
  html += '</table>';

  content.innerHTML = html;
  modal.style.display = 'block';
}

function getWeaponChoice(id) {
  const v = document.getElementById(id).value;
  return v === 'random' ? getWeaponChoiceFromPool() : v;
}

function getClassChoice(id) {
  const v = document.getElementById(id) ? document.getElementById(id).value : 'none';
  if (v !== 'random') return v;
  const pool = randomClassPool ? [...randomClassPool] : ['none', 'thor', 'kratos', 'ninja', 'gunner'];
  if (pool.length === 0) return 'none';
  return pool[Math.floor(Math.random() * pool.length)];
}

function getWeaponChoiceFromPool() {
  const pool = randomWeaponPool ? [...randomWeaponPool] : WEAPON_KEYS;
  if (pool.length === 0) return WEAPON_KEYS[0];
  return pool[Math.floor(Math.random() * pool.length)];
}

function toggleRandomPool(type, key) {
  if (type === 'weapon') {
    if (!randomWeaponPool) randomWeaponPool = new Set(WEAPON_KEYS);
    if (randomWeaponPool.has(key)) randomWeaponPool.delete(key);
    else randomWeaponPool.add(key);
    // Keep at least 1 weapon
    if (randomWeaponPool.size === 0) randomWeaponPool.add(key);
  } else if (type === 'class') {
    if (!randomClassPool) randomClassPool = new Set(['none', 'thor', 'kratos', 'ninja', 'gunner']);
    if (randomClassPool.has(key)) randomClassPool.delete(key);
    else randomClassPool.add(key);
    if (randomClassPool.size === 0) randomClassPool.add(key);
  }
  // Update button label
  const btn = document.getElementById(`randBtn_${type}_${key}`);
  if (btn) {
    const inPool = type === 'weapon'
      ? (!randomWeaponPool || randomWeaponPool.has(key))
      : (!randomClassPool  || randomClassPool.has(key));
    btn.textContent  = inPool ? '\u2713 In Random Pool' : '\u2717 Excluded';
    btn.style.background = inPool ? 'rgba(0,200,100,0.25)' : 'rgba(200,50,50,0.25)';
  }
}

// ============================================================
// START GAME
// ============================================================
function startGame() {
  const fadeOv  = document.getElementById('fadeOverlay');
  const loadOv  = document.getElementById('loadOverlay');
  if (fadeOv) {
    fadeOv.style.opacity = '1';
    if (loadOv) {
      loadOv.style.display = 'flex';
      // Animate the loading bar
      const bar = loadOv.querySelector('#loadBar');
      if (bar) { bar.style.width = '0%'; requestAnimationFrame(() => { bar.style.transition = 'width 0.32s ease'; bar.style.width = '100%'; }); }
    }
    setTimeout(() => {
      _startGameCore();
      if (loadOv) setTimeout(() => { loadOv.style.display = 'none'; }, 200);
    }, 340);
    setTimeout(() => { if (fadeOv) fadeOv.style.opacity = '0'; }, 440);
  } else {
    _startGameCore();
  }
}

function _startGameCore() {
  document.getElementById('menu').style.display            = 'none';
  document.getElementById('gameOverOverlay').style.display  = 'none';
  document.getElementById('pauseOverlay').style.display     = 'none';
  canvas.style.display = 'block';
  document.getElementById('hud').style.display = 'flex';

  // Resolve arena
  const isBossMode      = gameMode === 'boss';
  const isTrueFormMode  = gameMode === 'trueform';
  const isTrainingMode  = gameMode === 'training';
  const isTutorialMode  = gameMode === 'tutorial';
  const isMinigamesMode = gameMode === 'minigames';
  trainingMode = isTrainingMode;
  tutorialMode = isTutorialMode;
  if (isTutorialMode) {
    tutorialStep      = 0;
    tutorialStepTimer = 0;
    tutorialFlags     = {};
    tutPrevOnGround   = false;
    tutPrevCanDblJump = false;
    tutStepComplete   = false;
  }
  if (isBossMode) {
    currentArenaKey = 'creator';
  } else if (isTrueFormMode) {
    currentArenaKey = 'void';
    resetTFState();
  } else if (isTutorialMode) {
    currentArenaKey = 'grass';
  } else if (isMinigamesMode) {
    // Pick a random non-boss arena for minigames
    const arenaPool = Object.keys(ARENAS).filter(k => !['creator','void'].includes(k));
    currentArenaKey = randChoice(arenaPool);
  } else {
    const arenaPool = Object.keys(ARENAS).filter(k => !['creator','void'].includes(k));
    currentArenaKey = selectedArena === 'random' ? randChoice(arenaPool) : selectedArena;
  }
  // Lava/void: no randomization
  if (currentArenaKey !== 'creator' && currentArenaKey !== 'lava' && currentArenaKey !== 'void') randomizeArenaLayout(currentArenaKey);
  currentArena = ARENAS[currentArenaKey];
  initMapPerks(currentArenaKey);

  // Resolve weapons & colours
  const w1   = getWeaponChoice('p1Weapon');
  const w2   = getWeaponChoice('p2Weapon');
  const c1   = document.getElementById('p1Color').value;
  const c2   = document.getElementById('p2Color').value;
  const p1Diff = (document.getElementById('p1Difficulty')?.value) || 'medium';
  const p2Diff = (document.getElementById('p2Difficulty')?.value) || 'medium';
  const diff   = p2Diff; // legacy alias used below for p2
  const isBot  = p2IsBot; // bot determined by P2 toggle, not separate mode

  // Generate bg elements fresh each game
  generateBgElements();

  // Reset state — stop menu background loop
  menuLoopRunning    = false;
  frameCount         = 0; // reset per-game frame counter (used for yeti min-spawn delay)
  projectiles        = [];
  particles          = [];
  damageTexts        = [];
  respawnCountdowns  = [];
  minions            = [];
  forestBeast        = null;
  forestBeastCooldown = 0;
  yeti               = null;
  yetiCooldown       = 0;
  bossBeams          = [];
  bossSpikes         = [];
  trainingDummies    = [];
  bossDialogue       = { text: '', timer: 0 };
  backstagePortals   = [];
  bossDeathScene     = null;
  fakeDeath          = { triggered: false, active: false, timer: 0, player: null };
  mapItems           = [];
  mapPerkState       = {};
  winsP1             = 0;
  winsP2             = 0;
  screenShake     = 0;
  frameCount      = 0;
  paused          = false;

  // Reset camera zoom
  camZoomCur = 1; camZoomTarget = 1;
  camXCur = GAME_W / 2; camYCur = GAME_H / 2;
  camXTarget = GAME_W / 2; camYTarget = GAME_H / 2;
  // Reset boss floor state for every game start
  bossFloorState = 'normal';
  bossFloorType  = 'lava';
  bossFloorTimer = 1500;
  bossPhaseFlash = 0;
  // Restore creator arena floor platform in case a previous game left it disabled
  if (ARENAS.creator) {
    const floorPl = ARENAS.creator.platforms.find(p => p.isFloor);
    if (floorPl) floorPl.isFloorDisabled = false;
    ARENAS.creator.hasLava = false;
    ARENAS.creator.deathY  = 640;
  }

  // Player 1  (W/A/D move+boost · S=shield · Space=attack · Q=ability)
  const p1 = new Fighter(160, 300, c1, w1, { left:'a', right:'d', jump:'w', attack:' ', shield:'s', ability:'q', super:'e' }, p1IsBot, p1Diff);
  p1.playerNum = 1; p1.name = p1IsBot ? 'BOT1' : 'P1'; p1.lives = chosenLives;
  p1.spawnX = 160; p1.spawnY = 300;
  p1.hat  = document.getElementById('p1Hat')?.value  || 'none';
  p1.cape = document.getElementById('p1Cape')?.value || 'none';
  if (p1Skin !== 'default' && SKIN_COLORS[p1Skin]) p1.color = SKIN_COLORS[p1Skin];
  applyClass(p1, getClassChoice('p1Class'));

  // Player 2 / Bot / Boss / Training Dummy
  let p2;
  if (isBossMode) {
    const boss = new Boss();
    // True Creator mode: significantly harder boss (requires TRUEFORM code)
    if (unlockedTrueBoss) {
      boss.health            = 4500;
      boss.maxHealth         = 4500;
      boss.attackCooldownMult = 0.28;
      boss.kbBonus           = 2.5;
      boss.kbResist          = 0.25;
      boss.name              = 'TRUE CREATOR';
      boss.color             = '#ff00ee';
    }
    if (bossPlayerCount === 2) {
      // 2P boss: harder boss
      boss.attackCooldownMult = 0.38; // ~1.3x faster attacks than 1P
      boss.kbBonus            = 2.0;  // 1.33x more KB than 1P
      boss.health             *= 1.5; // 1.5x more HP
      boss.maxHealth          = boss.health;
      // Spawn real P2 alongside boss (can be human or bot)
      const w2b  = getWeaponChoice('p2Weapon');
      const c2b  = document.getElementById('p2Color').value;
      const p2h  = new Fighter(720, 300, c2b, w2b, { left:'ArrowLeft', right:'ArrowRight', jump:'ArrowUp', attack:'Enter', shield:'ArrowDown', ability:'.', super:'/' }, p2IsBot, diff);
      p2h.playerNum = 2; p2h.name = p2IsBot ? 'BOT' : 'P2'; p2h.lives = chosenLives;
      p2h.spawnX = 720; p2h.spawnY = 300;
      p2h.hat  = document.getElementById('p2Hat')?.value  || 'none';
      p2h.cape = document.getElementById('p2Cape')?.value || 'none';
      applyClass(p2h, getClassChoice('p2Class'));
      if (p2h.isAI) p2h.target = boss; // bot targets boss
      players = [p1, p2h, boss];
      p1.target  = boss;
      p2h.target = boss;
      boss.target = p1;
      p2 = p2h; // for HUD reference
    } else {
      p2 = boss;
      players = [p1, p2];
      p1.target = p2;
      p2.target = p1;
    }
  } else if (isTrueFormMode) {
    // True Form: solo — P1 vs True Form boss, void arena, no 2P
    p1.isAI = false;
    p1.lives = chosenLives;
    const tf = new TrueForm();
    tf.target = p1;
    p1.target = tf;
    p2 = tf;
    players = [p1, tf];
  } else if (isTrainingMode) {
    // Training: only P1 in players; starter dummy goes into trainingDummies
    const starterDummy = new Dummy(720, 300);
    starterDummy.playerNum = 2; starterDummy.name = 'DUMMY';
    trainingDummies.push(starterDummy);
    players = [p1];
    p1.target = starterDummy; starterDummy.target = p1;
  } else if (isTutorialMode) {
    // Tutorial: only P1, no enemies at start (dummy spawned at step 6)
    players = [p1];
    p1.target = null;
    p1.isAI   = false; // always human-controlled in tutorial
  } else if (isMinigamesMode) {
    // Minigames: P1 always human; survival/koth both support optional P2
    p1.isAI = false;
    p1.lives = 10; // infinite — managed by mode
    if (minigameType === 'koth' || (minigameType === 'survival' && !p2IsNone)) {
      const p2mg = new Fighter(720, 300, c2, w2,
        { left:'ArrowLeft', right:'ArrowRight', jump:'ArrowUp', attack:'Enter',
          shield:'ArrowDown', ability:'.', super:'/' }, p2IsBot, p2Diff);
      p2mg.playerNum = 2; p2mg.name = p2IsBot ? 'BOT' : 'P2'; p2mg.lives = 10;
      p2mg.spawnX = 720; p2mg.spawnY = 300;
      p2mg.hat  = document.getElementById('p2Hat')?.value  || 'none';
      p2mg.cape = document.getElementById('p2Cape')?.value || 'none';
      if (p2Skin !== 'default' && SKIN_COLORS[p2Skin]) p2mg.color = SKIN_COLORS[p2Skin];
      applyClass(p2mg, getClassChoice('p2Class'));
      players = [p1, p2mg];
      if (minigameType === 'koth') { p1.target = p2mg; p2mg.target = p1; }
      else { p1.target = null; p2mg.target = null; } // survival: both target enemies
    } else {
      // Survival solo
      players = [p1];
      p1.target = null;
    }
    initMinigame();
  } else if (p2IsNone) {
    // Solo / None mode — only P1 exists, infinite lives, no opponent
    p1.lives = 9999;
    players = [p1];
    p1.target = null;
  } else {
    p2 = new Fighter(720, 300, c2, w2, { left:'ArrowLeft', right:'ArrowRight', jump:'ArrowUp', attack:'Enter', shield:'ArrowDown', ability:'.', super:'/' }, isBot, diff);
    p2.playerNum = 2; p2.name = p2IsBot ? 'BOT' : 'P2'; p2.lives = chosenLives;
    p2.spawnX = 720; p2.spawnY = 300;
    p2.hat  = document.getElementById('p2Hat')?.value  || 'none';
    p2.cape = document.getElementById('p2Cape')?.value || 'none';
    if (p2Skin !== 'default' && SKIN_COLORS[p2Skin]) p2.color = SKIN_COLORS[p2Skin];
    applyClass(p2, getClassChoice('p2Class'));
    players = [p1, p2];
    p1.target = p2; p2.target = p1;
  }

  // Lava arena: override spawn positions to ensure players land on solid platforms
  if (currentArenaKey === 'lava') {
    p1.spawnX = 236; p1.spawnY = 260; // above upper-left platform (x=178,y=278)
    p1.x = 236; p1.y = 200;
    if (p2 && !p2.isBoss) {
      p2.spawnX = 640; p2.spawnY = 260; // above upper-right platform (x=582,y=278)
      p2.x = 640; p2.y = 200;
    }
  }

  // Training mode: show in-game HUD (not in tutorial)
  const trainingHud = document.getElementById('trainingHud');
  if (trainingHud) trainingHud.style.display = isTrainingMode ? 'flex' : 'none';

  // HUD labels
  document.getElementById('p1HudName').textContent = p1.name;
  if (p2) document.getElementById('p2HudName').textContent = p2.name;
  document.getElementById('killFeed').innerHTML = '';

  updateHUD();
  // Reset per-match achievement stats
  _achStats.damageTaken = 0; _achStats.rangedDmg = 0; _achStats.consecutiveHits = 0;
  _achStats.superCount = 0; _achStats.matchStartTime = Date.now();
  gameRunning = true;
  resizeGame();
  requestAnimationFrame(gameLoop);
}

// ============================================================
// FULLSCREEN / RESIZE
// ============================================================
function resizeGame() {
  const hud  = document.getElementById('hud');
  const hudH = (hud && hud.offsetHeight) || 0;
  const w    = window.innerWidth;
  const h    = window.innerHeight - hudH;

  canvas.style.width      = w + 'px';
  canvas.style.height     = h + 'px';
  canvas.style.marginLeft = '0';
  canvas.style.marginTop  = '0';
}

window.addEventListener('resize', resizeGame);

// ============================================================
// PAGE LOAD — start menu background animation immediately
// ============================================================
currentArenaKey = ARENA_KEYS_ORDERED[menuBgArenaIdx];
currentArena    = ARENAS[currentArenaKey];
generateBgElements();
canvas.style.display = 'block';
resizeGame();
menuLoopRunning = true;
requestAnimationFrame(menuBgLoop);

// Restore secret letter state from localStorage on page load
syncCodeInput();
// Sync sound UI with saved state
(function() {
  const btn = document.getElementById('sfxMuteBtn');
  if (btn && SoundManager.isMuted()) btn.textContent = '🔇 Sound: Off';
  const vol = parseFloat(localStorage.getItem('smc_sfxVol') || '0.35');
  const slider = document.querySelector('input[oninput*="setSfxVolume"]');
  if (slider) slider.value = vol;
})();
if (localStorage.getItem('smc_trueform')) {
  const card = document.getElementById('modeTrueForm');
  if (card) card.style.display = '';
}

// First-time visit: auto-launch tutorial after a brief delay
if (!localStorage.getItem('smc_tutorialDone')) {
  // Mark done immediately so a reload doesn't re-trigger if the user skips
  localStorage.setItem('smc_tutorialDone', '1');
  setTimeout(() => {
    try {
      selectMode('tutorial');
      startGame();
    } catch(e) {
      // If tutorial fails to start, restore menu so user isn't stuck
      document.getElementById('menu').style.display = 'grid';
      selectMode('2p');
    }
  }, 800);
}

// Mark tutorial as done when it completes (called from advanceTutorialStep when steps exhausted)
function markTutorialDone() {
  localStorage.setItem('smc_tutorialDone', '1');
}

// ============================================================
// EDGE PLAYER INDICATORS
// ============================================================
function drawEdgeIndicators(scX, scY, camCX, camCY) {
  if (!gameRunning) return;
  const MARGIN = 40; // px from screen edge before indicator shows
  const ARROW  = 14; // arrow half-size
  const allP   = [...players, ...minions].filter(p => p.health > 0 && !p.isBoss);
  for (const p of allP) {
    // Convert game coords to screen coords
    const sx = (p.cx() - camCX) * scX + canvas.width  / 2;
    const sy = (p.cy() - camCY) * scY + canvas.height / 2;
    const onScreen = sx > -p.w * scX && sx < canvas.width + p.w * scX &&
                     sy > -p.h * scY && sy < canvas.height + p.h * scY;
    if (onScreen) continue;
    // Clamp indicator to screen edge with margin
    const ix = Math.max(MARGIN, Math.min(canvas.width  - MARGIN, sx));
    const iy = Math.max(MARGIN, Math.min(canvas.height - MARGIN, sy));
    const angle = Math.atan2(sy - iy, sx - ix);
    ctx.save();
    ctx.translate(ix, iy);
    ctx.rotate(angle);
    ctx.globalAlpha = 0.85;
    ctx.fillStyle   = p.color || '#ffffff';
    ctx.strokeStyle = '#000';
    ctx.lineWidth   = 2;
    ctx.beginPath();
    ctx.moveTo(ARROW, 0);
    ctx.lineTo(-ARROW * 0.6,  ARROW * 0.55);
    ctx.lineTo(-ARROW * 0.6, -ARROW * 0.55);
    ctx.closePath();
    ctx.stroke();
    ctx.fill();
    // Name label
    ctx.rotate(-angle);
    ctx.fillStyle   = '#fff';
    ctx.font        = 'bold 9px Arial';
    ctx.textAlign   = 'center';
    ctx.shadowColor = '#000';
    ctx.shadowBlur  = 4;
    ctx.fillText(p.name || '?', 0, ARROW + 12);
    ctx.restore();
  }
}

// ============================================================
// MINIGAMES
// ============================================================
let minigameType      = 'survival'; // 'survival' | 'koth'
let survivalWave      = 0;
let survivalEnemies   = [];         // alive enemies this wave
let survivalWaveDelay = 0;          // countdown to next wave
let survivalTeamMode  = true;       // true = co-op team, false = competitive last-standing
let survivalFriendlyFire = false;   // competitive enables friendly fire between players
let survivalWaveGoal  = 10;         // waves to beat in team mode (0 = infinite)
let survivalInfinite  = false;      // infinite waves in team mode
let kothPoints       = [0, 0];     // points for P1, P2
let kothTimer        = 0;          // game timer
let kothZoneX        = GAME_W / 2; // center of hill zone

// --- Chaos modifiers ---
const CHAOS_MODS = [
  { id: 'giant',        label: '👾 GIANT',         desc: 'Players are huge' },
  { id: 'tiny',         label: '🐜 TINY',           desc: 'Players are tiny' },
  { id: 'moon',         label: '🌙 MOON GRAVITY',   desc: 'Low gravity' },
  { id: 'explosive',    label: '💥 EXPLOSIVE',      desc: 'Hits detonate' },
  { id: 'sudden_death', label: '☠ SUDDEN DEATH',   desc: 'Everyone starts at 1 HP' },
  { id: 'speedy',       label: '⚡ SPEEDY',          desc: 'Everyone moves faster' },
  { id: 'slippery',     label: '🧊 SLIPPERY',        desc: 'Ice-like floor friction' },
  { id: 'weapon_swap',  label: '🔀 WEAPON SWAP',    desc: 'Random weapon each wave' },
];
let currentChaosModifiers = new Set(); // active modifier ids this wave

function selectMinigame(type) {
  if (type === 'soccer' || type === 'coins') return; // coming soon
  minigameType = type;
  document.querySelectorAll('#minigamePanel .mode-card').forEach(c => c.classList.remove('active'));
  const card = document.getElementById('mgCard' + type.charAt(0).toUpperCase() + type.slice(1));
  if (card) card.classList.add('active');
  // Show/hide survival sub-options
  const survOpts = document.getElementById('survivalOptions');
  if (survOpts) survOpts.style.display = type === 'survival' ? 'flex' : 'none';
  // Refresh selectMode UI so P2 panel visibility toggles correctly
  selectMode('minigames');
}

function setSurvivalMode(isTeam) {
  survivalTeamMode     = isTeam;
  survivalFriendlyFire = !isTeam;
  document.getElementById('survModeTeam').classList.toggle('active', isTeam);
  document.getElementById('survModeComp').classList.toggle('active', !isTeam);
  document.getElementById('survTeamOptions').style.display  = isTeam ? 'flex' : 'none';
  document.getElementById('survCompOptions').style.display  = isTeam ? 'none' : 'block';
}

function setSurvivalGoal(waves) {
  survivalWaveGoal = waves;
  survivalInfinite = waves === 0;
  ['survWave10','survWave20','survWave30','survWaveInf'].forEach(id => {
    const el = document.getElementById(id); if (el) el.classList.remove('active');
  });
  const map = { 10:'survWave10', 20:'survWave20', 30:'survWave30', 0:'survWaveInf' };
  const btn = document.getElementById(map[waves]); if (btn) btn.classList.add('active');
}

// Chaos Match minigame — modifiers roll every 30s during 1v1
let chaosMatchTimer = 0;
function updateChaosMatch() {
  if (minigameType !== 'chaos') return;
  chaosMatchTimer++;
  if (chaosMatchTimer % 1800 === 0 || chaosMatchTimer === 1) {
    clearChaosModifiers();
    rollChaosModifiers();
  }
}

function rollChaosModifiers() {
  clearChaosModifiers();
  if (survivalWave < 2) return; // no chaos on wave 1
  const count = survivalWave >= 7 ? 3 : survivalWave >= 4 ? 2 : 1;
  const pool = [...CHAOS_MODS];
  for (let i = 0; i < count; i++) {
    if (!pool.length) break;
    const idx = Math.floor(Math.random() * pool.length);
    currentChaosModifiers.add(pool.splice(idx, 1)[0].id);
  }
  applyChaosModifiers();
  // Show modifier banners
  const labels = [...currentChaosModifiers].map(id => CHAOS_MODS.find(m => m.id === id)?.label || id).join('  ');
  if (labels) damageTexts.push(new DamageText(GAME_W / 2, 120, labels, '#ff88ff'));
}

function applyChaosModifiers() {
  const humanPlayers = players.filter(p => !p.isBoss);
  humanPlayers.forEach(p => {
    p._chaosOrigW = p.w; p._chaosOrigH = p.h;
    if (currentChaosModifiers.has('giant'))  { p.w = Math.floor(p.w * 1.55); p.h = Math.floor(p.h * 1.55); }
    if (currentChaosModifiers.has('tiny'))   { p.w = Math.floor(p.w * 0.55); p.h = Math.floor(p.h * 0.55); }
    if (currentChaosModifiers.has('sudden_death')) p.health = 1;
    if (currentChaosModifiers.has('weapon_swap') && WEAPON_KEYS.length) {
      const newKey = randChoice(WEAPON_KEYS);
      p.weaponKey = newKey; p.weapon = Object.assign({}, WEAPONS[newKey]);
    }
  });
}

function clearChaosModifiers() {
  players.filter(p => !p.isBoss).forEach(p => {
    if (p._chaosOrigW !== undefined) { p.w = p._chaosOrigW; p.h = p._chaosOrigH; delete p._chaosOrigW; delete p._chaosOrigH; }
  });
  currentChaosModifiers.clear();
}

function initMinigame() {
  survivalWave      = 0;
  survivalEnemies   = [];
  survivalWaveDelay = 180; // 3s before first wave
  // survivalTeamMode / survivalFriendlyFire / survivalWaveGoal / survivalInfinite keep their menu values
  clearChaosModifiers();
  kothPoints        = [0, 0];
  kothTimer         = 0;
  kothZoneX         = GAME_W / 2;
  chaosMatchTimer = 0;
  if (minigameType === 'chaos') {
    // Reset all players to standard settings, apply first chaos mods immediately
    clearChaosModifiers();
    setTimeout(() => rollChaosModifiers(), 100);
  }
}

function spawnSurvivalWave() {
  survivalWave++;
  // Wave 1 = 1 enemy (easy), scales up to max 5 enemies
  const waveSize = Math.min(1 + Math.floor(survivalWave / 2), 5);
  const diff     = survivalWave <= 3 ? 'easy' : survivalWave <= 6 ? 'medium' : 'hard';
  const targets  = players.filter(p => !p.isBoss && p.health > 0);
  if (!targets.length) return;
  for (let i = 0; i < waveSize; i++) {
    const bx  = i % 2 === 0 ? 60 + Math.random() * 80 : GAME_W - 60 - Math.random() * 80;
    const bot = new Fighter(bx, 200, `hsl(${Math.random()*360},65%,55%)`, randChoice(WEAPON_KEYS),
      { left:null, right:null, jump:null, attack:null, ability:null, super:null }, true, diff);
    bot.name     = `W${survivalWave}#${i + 1}`;
    bot.lives    = 1;
    bot.dmgMult  = Math.min(0.5 + survivalWave * 0.06, 1.0); // starts at 0.56x, scales to 1x by wave 8+
    bot.target   = targets[i % targets.length];
    bot.playerNum = 2;
    minions.push(bot);
    survivalEnemies.push(bot);
  }
  // Survival wave achievements
  if (survivalWave >= 5)  unlockAchievement('wave_5');
  if (survivalWave >= 10) unlockAchievement('wave_10');
  if (currentChaosModifiers.size >= 3) unlockAchievement('chaos_survivor');
  // Give all players brief invincibility at wave start so they aren't immediately hit
  players.forEach(p => { if (!p.isBoss) p.invincible = Math.max(p.invincible, 90); });
  damageTexts.push(new DamageText(GAME_W / 2, 80, `WAVE ${survivalWave}!`, '#ffdd44'));
  screenShake = Math.max(screenShake, 8);
  SoundManager.waveStart();
}

function updateMinigame() {
  if (!gameRunning) return;
  const livePlayers = players.filter(p => !p.isBoss && (p.health > 0 || p.invincible > 0));
  if (!livePlayers.length) return;

  if (minigameType === 'survival') {
    survivalEnemies = survivalEnemies.filter(e => e.health > 0);
    // Keep enemy targets pointed at a living player
    const liveTargets = players.filter(p => !p.isBoss && p.health > 0);
    survivalEnemies.forEach((e, i) => { if (liveTargets.length) e.target = liveTargets[i % liveTargets.length]; });

    // --- Competitive: check if only one human player remains ---
    if (survivalFriendlyFire) {
      const humanAlive = players.filter(p => !p.isBoss && !p.isAI && p.health > 0);
      if (humanAlive.length === 1 && players.filter(p => !p.isBoss && !p.isAI).length > 1) {
        // One survivor wins — clear enemies, award win
        minions.forEach(m => { m.health = 0; });
        survivalEnemies = [];
        damageTexts.push(new DamageText(GAME_W / 2, 120, `${humanAlive[0].name} WINS!`, '#ffdd44'));
        clearChaosModifiers();
        setTimeout(endGame, 2000);
        return;
      }
    }

    if (survivalWaveDelay > 0) {
      survivalWaveDelay--;
      if (survivalWaveDelay === 0) spawnSurvivalWave();
    } else if (survivalEnemies.length === 0 && minions.filter(m => m.health > 0).length === 0) {
      // Wave cleared — heal all players (team mode heals; competitive only heals survivor)
      players.forEach(p => { if (!p.isBoss) p.health = Math.min(p.maxHealth, p.health + 25); });
      survivalWaveDelay = 210;

      const waveGoal = survivalInfinite ? Infinity : survivalWaveGoal;
      if (survivalWave >= waveGoal) {
        // Goal reached!
        const msg = survivalInfinite ? `WAVE ${survivalWave} CLEARED!` : `YOU WIN! ALL ${survivalWaveGoal} WAVES!`;
        damageTexts.push(new DamageText(GAME_W / 2, 120, msg, '#44ff88'));
        clearChaosModifiers();
        if (!survivalInfinite) {
          unlockAchievement('survival_win');
          setTimeout(endGame, 2500);
          return;
        }
        survivalWave = 0; // infinite: keep going
      }
    }
  } else if (minigameType === 'koth') {
    kothTimer++;
    const p1 = players[0], p2 = players[1];
    // Check who's in the zone (200px wide centered on kothZoneX)
    const zoneLeft = kothZoneX - 100, zoneRight = kothZoneX + 100;
    const p1InZone = p1 && p1.health > 0 && p1.cx() > zoneLeft && p1.cx() < zoneRight && p1.onGround;
    const p2InZone = p2 && p2.health > 0 && p2.cx() > zoneLeft && p2.cx() < zoneRight && p2.onGround;
    if (p1InZone && !p2InZone) kothPoints[0]++;
    if (p2InZone && !p1InZone) kothPoints[1]++;
    // Win at 1800 frames (30 seconds of uncontested zone)
    const WIN_FRAMES = 1800;
    if (kothPoints[0] >= WIN_FRAMES || kothPoints[1] >= WIN_FRAMES) {
      const winIdx = kothPoints[0] >= WIN_FRAMES ? 0 : 1;
      // Override lives so endGame() sees a clear winner
      players.forEach((p, i) => { p.lives = i === winIdx ? 1 : 0; });
      setTimeout(endGame, 600);
    }
  } else if (minigameType === 'chaos') {
    updateChaosMatch();
    // Chaos match is just 1v1 — no special logic, just let normal 2P combat happen with modifiers
  }
}

function drawMinigameHUD() {
  if (!gameRunning) return;
  ctx.save();
  if (minigameType === 'survival') {
    ctx.fillStyle = '#ffdd44'; ctx.font = 'bold 14px Arial'; ctx.textAlign = 'center';
    const waveGoalStr = survivalFriendlyFire ? '⚔' : survivalInfinite ? '∞' : `/${survivalWaveGoal}`;
    ctx.fillText(`Wave ${survivalWave}${waveGoalStr} — Enemies: ${survivalEnemies.filter(e=>e.health>0).length}`, GAME_W / 2, GAME_H - 20);
    if (survivalWaveDelay > 0) {
      ctx.fillStyle = '#aaffaa'; ctx.font = 'bold 18px Arial';
      ctx.fillText(`Next wave in ${Math.ceil(survivalWaveDelay / 60)}s`, GAME_W / 2, GAME_H - 44);
    }
    // Chaos modifier badges
    if (currentChaosModifiers.size > 0) {
      const mods = [...currentChaosModifiers].map(id => CHAOS_MODS.find(m => m.id === id)?.label || id);
      ctx.font = 'bold 11px Arial'; ctx.textAlign = 'right';
      mods.forEach((lbl, i) => {
        const pulse = 0.75 + 0.25 * Math.sin(frameCount * 0.1 + i);
        ctx.globalAlpha = pulse;
        ctx.fillStyle = '#ff88ff';
        ctx.shadowColor = '#ff00ff'; ctx.shadowBlur = 8;
        ctx.fillText(lbl, GAME_W - 8, GAME_H - 20 - i * 16);
        ctx.shadowBlur = 0;
      });
      ctx.globalAlpha = 1;
      ctx.textAlign = 'center';
    }
  } else if (minigameType === 'koth') {
    // Draw zone indicator
    const zoneLeft = kothZoneX - 100;
    ctx.fillStyle = 'rgba(255,220,0,0.10)';
    ctx.fillRect(zoneLeft, 0, 200, GAME_H);
    ctx.strokeStyle = 'rgba(255,220,0,0.5)'; ctx.lineWidth = 1.5; ctx.setLineDash([5, 4]);
    ctx.strokeRect(zoneLeft + 1, 0, 198, GAME_H);
    ctx.setLineDash([]);
    // Zone label
    ctx.fillStyle = '#ffdd44'; ctx.font = 'bold 11px Arial'; ctx.textAlign = 'center';
    ctx.shadowColor = '#000'; ctx.shadowBlur = 6;
    ctx.fillText('KING ZONE', kothZoneX, 16);
    ctx.shadowBlur = 0;
    // Top score bar
    const p1 = players[0], p2 = players[1];
    const WIN_FRAMES = 1800;
    [p1, p2].forEach((p, i) => {
      if (!p) return;
      const pts = kothPoints[i];
      const barW = 130, barH = 10;
      const bx = i === 0 ? 20 : GAME_W - 20 - barW;
      const by = 8;
      ctx.fillStyle = 'rgba(0,0,0,0.55)';
      ctx.fillRect(bx, by, barW, barH);
      ctx.fillStyle = p.color;
      ctx.fillRect(bx, by, barW * (pts / WIN_FRAMES), barH);
      ctx.fillStyle = '#fff'; ctx.font = 'bold 9px Arial';
      ctx.textAlign = i === 0 ? 'left' : 'right';
      const tx = i === 0 ? bx : bx + barW;
      ctx.fillText(`${p.name}  ${Math.floor(pts / 60)}s / 30s`, tx, by - 1);
    });
    // Time-in-zone counter ABOVE each player's head
    [p1, p2].forEach((p, i) => {
      if (!p || p.health <= 0) return;
      const t = Math.floor(kothPoints[i] / 60);
      if (t === 0) return;
      ctx.textAlign = 'center';
      ctx.font = 'bold 11px Arial';
      ctx.fillStyle = p.color;
      ctx.shadowColor = '#000'; ctx.shadowBlur = 5;
      ctx.fillText(`${t}s`, p.cx(), p.y - 22);
      ctx.shadowBlur = 0;
    });
  }
  ctx.restore();
}

function confirmResetProgress() {
  localStorage.removeItem('smc_bossBeaten');
  localStorage.removeItem('smc_letters');
  localStorage.removeItem('smc_trueform');
  localStorage.removeItem('smc_tutorialDone');
  bossBeaten         = false;
  collectedLetterIds = new Set();
  unlockedTrueBoss   = false;
  const card = document.getElementById('modeTrueForm');
  if (card) card.style.display = 'none';
  syncCodeInput();
  document.getElementById('resetConfirmRow').style.display = 'none';
  // Flash confirmation
  const msg = document.createElement('div');
  msg.textContent = 'Progress reset!';
  msg.style.cssText = 'position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);background:rgba(0,0,0,0.9);color:#ff4444;padding:16px 28px;border-radius:8px;font-size:1.1rem;font-weight:bold;z-index:9999;pointer-events:none';
  document.body.appendChild(msg);
  setTimeout(() => msg.remove(), 2000);
}
