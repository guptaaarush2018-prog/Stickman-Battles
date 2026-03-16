'use strict';

// ============================================================
// DEVELOPER DEBUG TOOLKIT
// Toggle with F1 key. Slow motion with F2.
// Hidden activation: type "debugmode" anywhere.
// ============================================================

// ---- FPS tracker ----
let _dbgFpsFrames  = 0;
let _dbgFpsTimer   = 0;
let _dbgFpsCurrent = 0;
let _dbgLastTs     = performance.now();

function _dbgTickFps() {
  const now = performance.now();
  const dt  = now - _dbgLastTs;
  _dbgLastTs = now;
  _dbgFpsFrames++;
  _dbgFpsTimer += dt;
  if (_dbgFpsTimer >= 500) {
    _dbgFpsCurrent = Math.round(_dbgFpsFrames / (_dbgFpsTimer / 1000));
    _dbgFpsFrames  = 0;
    _dbgFpsTimer   = 0;
  }
}

// ---- Sanity checks ----
function runSanityChecks() {
  const all = [...players, ...minions, ...trainingDummies];
  for (const p of all) {
    if (p.health <= 0) continue;
    if (isNaN(p.x) || isNaN(p.y)) {
      console.warn('[DBG] NaN position on', p.name || 'fighter', p);
      p.x = GAME_W / 2; p.y = 200;
    }
    if (isNaN(p.health)) {
      console.warn('[DBG] NaN health on', p.name || 'fighter');
      p.health = p.maxHealth;
    }
    // Bot stuck detection
    if (p.isAI && !p.isBoss) {
      p._dbgStuckTimer = p._dbgStuckTimer || 0;
      p._dbgLastX      = p._dbgLastX !== undefined ? p._dbgLastX : p.x;
      if (Math.abs(p.x - p._dbgLastX) < 2) {
        p._dbgStuckTimer++;
        if (p._dbgStuckTimer > 120) { // 2 seconds
          p.aiState        = 'chase';
          p._wanderDir     = (Math.random() < 0.5 ? -1 : 1);
          p._wanderTimer   = 60;
          p._dbgStuckTimer = 0;
        }
      } else {
        p._dbgStuckTimer = 0;
      }
      p._dbgLastX = p.x;
    }
    // Target revalidation
    if (p.isAI && p.target) {
      if (p.target.health <= 0 || !players.includes(p.target) && !trainingDummies.includes(p.target) && !minions.includes(p.target)) {
        // Re-assign nearest living target
        const living = [...players, ...trainingDummies].filter(q => q !== p && q.health > 0);
        p.target = living.length ? living.reduce((a, b) => Math.hypot(b.cx()-p.cx(),b.cy()-p.cy()) < Math.hypot(a.cx()-p.cx(),a.cy()-p.cy()) ? b : a) : null;
      }
    }
  }
}

// ---- Render debug overlay ----
function renderDebugOverlay(ctx) {
  _dbgTickFps();

  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);

  // Top-left panel
  ctx.fillStyle = 'rgba(0,0,0,0.72)';
  ctx.fillRect(4, 4, 210, 90);
  ctx.strokeStyle = '#0f0';
  ctx.lineWidth   = 1;
  ctx.strokeRect(4, 4, 210, 90);

  ctx.font      = '11px monospace';
  ctx.fillStyle = '#0f0';
  ctx.textAlign = 'left';
  ctx.fillText(`FPS: ${_dbgFpsCurrent}  timeScale: ${timeScale.toFixed(2)}`, 10, 20);
  ctx.fillText(`Players: ${players.length}  Minions: ${minions.length}  Bots: ${[...players,...trainingDummies].filter(p=>p.isAI).length}`, 10, 34);
  ctx.fillText(`Projectiles: ${projectiles.length}  Particles: ${particles.length}`, 10, 48);
  ctx.fillText(`Arena: ${currentArenaKey}  Mode: ${gameMode}`, 10, 62);
  ctx.fillText(`Beams: ${bossBeams.length}  Floor: ${bossFloorState}`, 10, 76);
  ctx.fillText(`hitboxes:${showHitboxes} slowmo:${timeScale<1}`, 10, 90);

  // Per-player state labels
  if (typeof canvas !== 'undefined' && currentArena) {
    const scX = canvas.width  / GAME_W;
    const scY = canvas.height / GAME_H;
    const all = [...players, ...trainingDummies];
    for (const p of all) {
      if (p.health <= 0) continue;
      const sx = (p.cx() - (camXCur - GAME_W/2)) * scX; // approximate screen pos
      const sy = (p.y    - (camYCur - GAME_H/2)) * scY;
      ctx.font      = '9px monospace';
      ctx.fillStyle = p.isAI ? '#ffaa00' : '#00ffaa';
      ctx.textAlign = 'center';
      ctx.fillText(`${p.name||'?'} ${p.aiState||p.state||''} HP:${Math.round(p.health)}`, sx, Math.max(10, sy - 80));
    }
  }
  ctx.restore();

  // Hitbox overlay (drawn in game space)
  if (showHitboxes && gameRunning) {
    ctx.save();
    const all2 = [...players, ...minions, ...trainingDummies];
    for (const p of all2) {
      if (p.health <= 0) continue;
      // Body hitbox — green
      ctx.strokeStyle = 'rgba(0,255,0,0.8)';
      ctx.lineWidth   = 1.5;
      ctx.strokeRect(p.x, p.y, p.w, p.h);
      // Weapon tip — red
      if (p.attackTimer > 0 && typeof p.getWeaponTipPos === 'function') {
        const tip = p.getWeaponTipPos();
        if (tip) {
          ctx.fillStyle = 'rgba(255,0,0,0.9)';
          ctx.beginPath(); ctx.arc(tip.x, tip.y, 6, 0, Math.PI*2); ctx.fill();
        }
      }
    }
    // Beam hazard zones — orange
    ctx.strokeStyle = 'rgba(255,140,0,0.7)';
    ctx.lineWidth   = 2;
    for (const b of bossBeams) {
      if (b.done) continue;
      const bw = b.phase === 'active' ? 24 : 20;
      ctx.strokeRect(b.x - bw/2, 0, bw, GAME_H);
    }
    ctx.restore();
  }
}

// ---- Debug menu UI ----
function openDebugMenu() {
  if (document.getElementById('debugMenuOverlay')) return;
  const ov = document.createElement('div');
  ov.id = 'debugMenuOverlay';
  ov.style.cssText = 'position:fixed;inset:0;z-index:9990;background:rgba(0,0,0,0.75);display:flex;align-items:center;justify-content:center;';

  const panel = document.createElement('div');
  panel.style.cssText = 'background:rgba(10,10,30,0.97);border:1px solid #0f0;border-radius:10px;padding:20px 28px;min-width:300px;font-family:monospace;color:#0f0;';
  panel.innerHTML = `<div style="font-size:1.1rem;font-weight:bold;margin-bottom:14px;letter-spacing:2px;">🛠 DEBUG MENU</div>`;

  const btns = [
    ['Toggle Debug Mode',  () => { debugMode = !debugMode; }],
    ['Slow Motion (F2)',   () => { timeScale = timeScale < 1 ? 1.0 : 0.25; slowMotion = timeScale; }],
    ['Toggle Hitboxes',   () => { showHitboxes = !showHitboxes; }],
    ['Spawn Forest Beast', () => {
      if (gameRunning && typeof ForestBeast !== 'undefined') {
        const fb = new ForestBeast(Math.random() < 0.5 ? 80 : 820, 280);
        if (players[0]) fb.target = players[0];
        trainingDummies.push(fb);
      }
    }],
    ['Spawn Yeti',         () => {
      if (gameRunning && typeof Yeti !== 'undefined') {
        const yt = new Yeti(Math.random() < 0.5 ? 80 : 820, 280);
        if (players[0]) yt.target = players[0];
        trainingDummies.push(yt);
      }
    }],
    ['Reset Bots',         () => {
      for (const p of [...players, ...trainingDummies]) {
        if (!p.isAI) continue;
        p.aiState = 'chase'; p._wanderTimer = 0; p._pendingAction = null;
        p._actionLockFrames = 0; p._dbgStuckTimer = 0;
      }
    }],
    ['Kill All Bots',      () => {
      for (const p of [...players, ...(minions||[]), ...(trainingDummies||[])]) {
        if (p.isAI && !p.godmode && !p._godmode) p.health = 0;
      }
    }],
    ['Refill All HP',      () => {
      for (const p of [...players, ...trainingDummies, ...minions]) {
        p.health = p.maxHealth;
      }
    }],
    ['Close (Esc)',        () => { ov.remove(); }],
  ];

  for (const [label, fn] of btns) {
    const b = document.createElement('button');
    b.textContent = label;
    b.style.cssText = 'display:block;width:100%;margin:4px 0;padding:6px 10px;background:rgba(0,255,0,0.12);border:1px solid #0a0;border-radius:5px;color:#0f0;font-family:monospace;font-size:0.85rem;cursor:pointer;text-align:left;';
    b.onclick = () => { fn(); };
    panel.appendChild(b);
  }

  ov.appendChild(panel);
  document.body.appendChild(ov);

  // Close on Escape
  const close = (e) => { if (e.key === 'Escape') { ov.remove(); document.removeEventListener('keydown', close); } };
  document.addEventListener('keydown', close);
}

// ---- Key hooks (F1/F2 + secret buffer) — patched into the existing keydown handler ----
document.addEventListener('keydown', e => {
  // F1: toggle debug mode
  if (e.key === 'F1') { e.preventDefault(); debugMode = !debugMode; return; }
  // F2: toggle slow motion (only when debug on)
  if (e.key === 'F2' && debugMode) {
    e.preventDefault();
    timeScale  = timeScale < 1 ? 1.0 : 0.25;
    slowMotion = timeScale;
    return;
  }
  // Escape closes game console if open
  if (e.key === 'Escape' && _consoleOpen) { closeGameConsole(); return; }
  // Enter runs console command if console input is focused
  if (e.key === 'Enter' && _consoleOpen && document.activeElement && document.activeElement.id === 'gameConsoleInput') {
    e.preventDefault(); gameConsoleRun(); return;
  }
  // Track "debugmode" secret buffer
  if (e.key.length === 1) {
    _debugKeyBuf = (_debugKeyBuf + e.key.toLowerCase()).slice(-12);
    if (_debugKeyBuf.endsWith('debugmode')) {
      _debugKeyBuf = '';
      openDebugMenu();
    }
  }
});

// ============================================================
// IN-GAME CONSOLE SYSTEM
// Unlock by typing GAMECONSOLE anywhere, or via debug menu.
// Commands mirror the existing slash-command system plus extras.
// ============================================================

let _consoleOpen    = false;
let _consoleHistory = [];  // command history (up/down arrow)
let _consoleHistIdx = -1;

// Intercept native console so game logs appear in the overlay
const _origLog   = console.log.bind(console);
const _origWarn  = console.warn.bind(console);
const _origError = console.error.bind(console);
console.log   = (...a) => { _origLog(...a);   _consoleAppend('[log]',   a.join(' '), '#aaddff'); };
console.warn  = (...a) => { _origWarn(...a);  _consoleAppend('[warn]',  a.join(' '), '#ffdd88'); };
console.error = (...a) => { _origError(...a); _consoleAppend('[error]', a.join(' '), '#ff6666'); };

function _consoleAppend(prefix, text, color) {
  const log = document.getElementById('gameConsoleLog');
  if (!log) return;
  const line = document.createElement('div');
  line.style.color = color || '#ccddff';
  line.textContent = prefix + ' ' + text;
  log.appendChild(line);
  log.scrollTop = log.scrollHeight;
  // Trim old entries to prevent memory bloat
  while (log.children.length > 300) log.removeChild(log.firstChild);
}

function _consolePrint(text, color) { _consoleAppend('>', text, color || '#ccddff'); }
function _consoleOk(text)           { _consoleAppend('✓', text, '#44ff88'); }
function _consoleErr(text)          { _consoleAppend('✗', text, '#ff5555'); }

function openGameConsole() {
  const ov = document.getElementById('gameConsoleOverlay');
  if (!ov) return;
  _consoleOpen = true;
  ov.style.display = 'flex';
  const inp = document.getElementById('gameConsoleInput');
  if (inp) { inp.value = ''; inp.focus(); }
  _consolePrint('Stickman Clash Console — type HELP for commands.', '#88bbff');
  // History navigation
  if (inp) {
    inp.onkeydown = (e) => {
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        if (_consoleHistIdx < _consoleHistory.length - 1) _consoleHistIdx++;
        inp.value = _consoleHistory[_consoleHistory.length - 1 - _consoleHistIdx] || '';
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        if (_consoleHistIdx > 0) _consoleHistIdx--;
        else { _consoleHistIdx = -1; inp.value = ''; }
        inp.value = _consoleHistIdx >= 0 ? (_consoleHistory[_consoleHistory.length - 1 - _consoleHistIdx] || '') : '';
      }
    };
  }
}

function closeGameConsole() {
  const ov = document.getElementById('gameConsoleOverlay');
  if (ov) ov.style.display = 'none';
  _consoleOpen = false;
  _consoleHistIdx = -1;
}

function gameConsoleRun() {
  const inp = document.getElementById('gameConsoleInput');
  if (!inp) return;
  const raw = inp.value.trim();
  inp.value = '';
  if (!raw) return;
  _consoleHistory.push(raw);
  _consoleHistIdx = -1;
  _consolePrint('> ' + raw, '#ffffff');
  _consoleExec(raw);
}

function _consoleExec(raw) {
  const cmd  = raw.toUpperCase().trim();
  const parts = raw.trim().split(/\s+/);
  const sub  = parts[1] ? parts[1].toLowerCase() : '';

  // ---- HELP ----
  if (cmd === 'HELP') {
    const cmds = [
      'help                  — show this list',
      'clear                 — clear console output',
      'status                — show game state',
      'heal [p1|p2|all]      — restore health',
      'kill [p1|p2|boss|all] — set health to 0',
      'spawn [forestbeast|yeti|boss|dummy] — spawn entity',
      'setmap <arena>        — change arena (e.g. setmap lava)',
      'setweapon <key> [p1|p2] — change weapon (e.g. setweapon gun)',
      'setclass <key> [p1|p2]  — change class (e.g. setclass megaknight)',
      'lives <n> [p1|p2|all] — set lives remaining',
      'godmode [p1|p2|on|off] — toggle invincibility',
      'fps                   — show current FPS',
      'bots reset            — reset all bot AI states',
      'bots kill             — kill all bots instantly',
      'debug [on|off]        — toggle debug overlay',
      'slow [on|off]         — toggle slow motion (0.25×)',
      'unlock trueform|megaknight — unlock secret content',
      'eval <js>             — evaluate raw JavaScript (advanced)',
    ];
    cmds.forEach(c => _consolePrint(c, '#88bbff'));
    return;
  }

  // ---- CLEAR ----
  if (cmd === 'CLEAR') {
    const log = document.getElementById('gameConsoleLog');
    if (log) log.innerHTML = '';
    return;
  }

  // ---- STATUS ----
  if (cmd === 'STATUS') {
    _consolePrint('gameMode: ' + (typeof gameMode !== 'undefined' ? gameMode : '?'));
    _consolePrint('gameRunning: ' + (typeof gameRunning !== 'undefined' ? gameRunning : '?'));
    _consolePrint('players: ' + (typeof players !== 'undefined' ? players.length : '?'));
    _consolePrint('FPS: ' + _dbgFpsCurrent);
    if (typeof players !== 'undefined') {
      players.forEach((p, i) => _consolePrint(`  [${i}] ${p.name||'?'} HP:${Math.round(p.health)}/${p.maxHealth} lives:${p.lives}`));
    }
    return;
  }

  // ---- FPS ----
  if (cmd === 'FPS') { _consolePrint('FPS: ' + _dbgFpsCurrent, '#44ff88'); return; }

  // ---- HEAL ----
  if (cmd.startsWith('HEAL')) {
    const who = sub || 'all';
    const _heal = (p) => { p.health = p.maxHealth; p.invincible = 60; };
    if (typeof players === 'undefined') { _consoleErr('No game running.'); return; }
    if (who === 'p1' || who === '1') { if (players[0]) _heal(players[0]); }
    else if (who === 'p2' || who === '2') { if (players[1]) _heal(players[1]); }
    else { players.forEach(_heal); (typeof trainingDummies !== 'undefined') && trainingDummies.forEach(_heal); }
    _consoleOk('Healed ' + who);
    return;
  }

  // ---- KILL ----
  if (cmd.startsWith('KILL')) {
    const who = sub || 'all';
    if (typeof players === 'undefined') { _consoleErr('No game running.'); return; }
    if (who === 'p1' || who === '1') { if (players[0]) players[0].health = 0; }
    else if (who === 'p2' || who === '2') { if (players[1]) players[1].health = 0; }
    else if (who === 'boss') { players.forEach(p => { if (p.isBoss) p.health = 0; }); }
    else {
      // kill all: players + minions + training dummies (including boss)
      const all = [...players, ...(minions||[]), ...(trainingDummies||[])];
      all.forEach(p => { if (!p.godmode && !p._godmode) p.health = 0; });
    }
    _consoleOk('Killed ' + who);
    return;
  }

  // ---- SPAWN ----
  if (cmd.startsWith('SPAWN')) {
    if (!sub) { _consoleErr('Usage: spawn <forestbeast|yeti|boss|dummy>'); return; }
    if (typeof gameRunning === 'undefined' || !gameRunning) { _consoleErr('Start a game first.'); return; }
    if (sub === 'forestbeast' || sub === 'forest') {
      if (typeof ForestBeast !== 'undefined') {
        const fb = new ForestBeast(600, 300);
        minions.push(fb);
        _consoleOk('Spawned ForestBeast');
      } else _consoleErr('ForestBeast not available in this arena.');
    } else if (sub === 'yeti') {
      if (typeof Yeti !== 'undefined') {
        const y = new Yeti(500, 300);
        minions.push(y);
        _consoleOk('Spawned Yeti');
      } else _consoleErr('Yeti not available.');
    } else if (sub === 'dummy') {
      if (typeof Dummy !== 'undefined') {
        const d = new Dummy(450, 300);
        d.playerNum = 9; d.name = 'DUMMY';
        trainingDummies.push(d);
        _consoleOk('Spawned Dummy');
      }
    } else { _consoleErr('Unknown entity: ' + sub); }
    return;
  }

  // ---- SETMAP ----
  if (cmd.startsWith('SETMAP')) {
    const mapKey = sub;
    if (!mapKey || typeof ARENAS === 'undefined' || !ARENAS[mapKey]) {
      _consoleErr('Unknown arena. Try: grass lava space city forest ice ruins'); return;
    }
    if (typeof gameRunning !== 'undefined' && gameRunning) {
      currentArenaKey = mapKey;
      currentArena    = ARENAS[mapKey];
      if (typeof randomizeArenaLayout === 'function') randomizeArenaLayout(mapKey);
      if (typeof generateBgElements   === 'function') generateBgElements();
      _consoleOk('Arena changed to: ' + mapKey);
    } else { _consoleErr('Start a game first.'); }
    return;
  }

  // ---- SETWEAPON ----
  if (cmd.startsWith('SETWEAPON')) {
    const wKey = sub;
    const who  = (parts[2] || 'p1').toLowerCase();
    if (!wKey || typeof WEAPONS === 'undefined' || !WEAPONS[wKey]) { _consoleErr('Unknown weapon key.'); return; }
    if (typeof players === 'undefined') { _consoleErr('No game running.'); return; }
    const p = who === 'p2' || who === '2' ? players[1] : players[0];
    if (p) { p.weapon = WEAPONS[wKey]; _consoleOk(who + ' weapon set to ' + wKey); }
    return;
  }

  // ---- SETCLASS ----
  if (cmd.startsWith('SETCLASS')) {
    const cKey = sub;
    const who  = (parts[2] || 'p1').toLowerCase();
    if (!cKey || typeof CLASSES === 'undefined' || !CLASSES[cKey]) { _consoleErr('Unknown class key.'); return; }
    if (typeof players === 'undefined') { _consoleErr('No game running.'); return; }
    const p = who === 'p2' || who === '2' ? players[1] : players[0];
    if (p && typeof applyClass === 'function') { applyClass(p, cKey); _consoleOk(who + ' class set to ' + cKey); }
    return;
  }

  // ---- LIVES ----
  if (cmd.startsWith('LIVES')) {
    const n   = parseInt(parts[1]);
    const who = (parts[2] || 'all').toLowerCase();
    if (isNaN(n)) { _consoleErr('Usage: lives <number> [p1|p2|all]'); return; }
    if (typeof players === 'undefined') { _consoleErr('No game running.'); return; }
    const _setLives = (p) => { p.lives = n; };
    if (who === 'p1' || who === '1') { if (players[0]) _setLives(players[0]); }
    else if (who === 'p2' || who === '2') { if (players[1]) _setLives(players[1]); }
    else { players.forEach(_setLives); }
    _consoleOk('Lives set to ' + n + ' for ' + who);
    return;
  }

  // ---- GODMODE ----
  if (cmd.startsWith('GODMODE')) {
    if (typeof players === 'undefined') { _consoleErr('No game running.'); return; }
    const who = sub || 'p1';
    const on  = parts[2] ? parts[2].toLowerCase() !== 'off' : true;
    const p   = who === 'p2' || who === '2' ? players[1] : players[0];
    if (p) {
      // Godmode: set invincible to a huge number each frame via flag
      p._godmode = on;
      if (on) p.invincible = 999999;
      _consoleOk('Godmode ' + (on ? 'ON' : 'OFF') + ' for ' + who);
    }
    return;
  }

  // ---- BOTS ----
  if (cmd.startsWith('BOTS')) {
    if (sub === 'reset') {
      if (typeof players !== 'undefined') players.filter(p => p.isAI).forEach(p => { p._aiState = 'approach'; p._stuckFrames = 0; });
      _consoleOk('All bot states reset to approach.');
    } else if (sub === 'kill') {
      if (typeof players !== 'undefined') players.filter(p => p.isAI && !p.isBoss).forEach(p => p.health = 0);
      _consoleOk('All bots killed.');
    } else { _consoleErr('Usage: bots reset|kill'); }
    return;
  }

  // ---- DEBUG ----
  if (cmd.startsWith('DEBUG')) {
    if (typeof debugMode !== 'undefined') {
      debugMode = sub !== 'off';
      _consoleOk('Debug overlay: ' + (debugMode ? 'ON' : 'OFF'));
    }
    return;
  }

  // ---- SLOW ----
  if (cmd.startsWith('SLOW')) {
    if (typeof timeScale !== 'undefined') {
      timeScale  = sub === 'off' ? 1.0 : 0.25;
      slowMotion = timeScale;
      _consoleOk('Slow motion: ' + (timeScale < 1 ? 'ON (0.25×)' : 'OFF'));
    }
    return;
  }

  // ---- UNLOCK ----
  if (cmd.startsWith('UNLOCK')) {
    if (sub === 'trueform') {
      if (typeof unlockedTrueBoss !== 'undefined') {
        unlockedTrueBoss = true; localStorage.setItem('smc_trueform','1');
        const card = document.getElementById('modeTrueForm');
        if (card) card.style.display = '';
        _consoleOk('True Form unlocked!');
      }
    } else if (sub === 'megaknight') {
      if (typeof unlockedMegaknight !== 'undefined') {
        unlockedMegaknight = true; localStorage.setItem('smc_megaknight','1');
        ['p1Class','p2Class'].forEach(id => {
          const sel = document.getElementById(id);
          if (sel && !sel.querySelector('option[value="megaknight"]')) {
            const opt = document.createElement('option'); opt.value='megaknight'; opt.textContent='Class: Megaknight ★'; sel.appendChild(opt);
          }
        });
        _consoleOk('Class: Megaknight unlocked!');
      }
    } else { _consoleErr('Usage: unlock trueform|megaknight'); }
    return;
  }

  // ---- EVAL (raw JS) ----
  if (raw.toLowerCase().startsWith('eval ')) {
    const code = raw.slice(5);
    try {
      // eslint-disable-next-line no-eval
      const result = eval(code); // intentional: developer console feature
      _consoleOk(String(result));
    } catch(err) {
      _consoleErr(err.message);
    }
    return;
  }

  _consoleErr('Unknown command: ' + parts[0] + '  (type HELP for list)');
}
