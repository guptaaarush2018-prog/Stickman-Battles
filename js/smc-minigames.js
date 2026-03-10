'use strict';

// ============================================================
// MINIGAMES
// ============================================================
let minigameType      = 'survival'; // 'survival' | 'koth' | 'chaos' | 'soccer'
let soccerBall   = null;
let soccerScore  = [0, 0];
let soccerScored = 0;

const SOCCER_GOALS = {
  left:  { x: 0,   y: 360, w: 14, h: 100, team: 1 }, // P2 scores here
  right: { x: 886, y: 360, w: 14, h: 100, team: 0 }, // P1 scores here
};
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
  if (type === 'coins') return; // coming soon
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

// Chaos Match minigame — add one modifier every 15s during 1v1
let chaosMatchTimer = 0;
let _chaosModNotif = null; // { label, desc, timer }

function showChaosModNotification(mod) {
  _chaosModNotif = { label: mod.label, desc: mod.desc, timer: 150 };
}

function addOneChaosModifier() {
  // Get IDs not yet active
  const available = CHAOS_MODS.filter(m => !currentChaosModifiers.has(m.id));
  if (!available.length) return; // all already active
  const newMod = available[Math.floor(Math.random() * available.length)];
  // If at cap (10), remove a random existing one
  if (currentChaosModifiers.size >= 10) {
    const existing = [...currentChaosModifiers];
    const toRemove = existing[Math.floor(Math.random() * existing.length)];
    currentChaosModifiers.delete(toRemove);
  }
  currentChaosModifiers.add(newMod.id);
  // Apply modifier effects to current players
  applyChaosModifiers();
  // Show notification
  showChaosModNotification(newMod);
  // Update icon bar
  updateChaosModIcons();
}

function updateChaosMatch() {
  if (minigameType !== 'chaos') return;
  chaosMatchTimer++;
  if (chaosMatchTimer % 900 === 0 || chaosMatchTimer === 1) {
    addOneChaosModifier();
  }
}

function rollChaosModifiers() {
  clearChaosModifiers();
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
  updateChaosModIcons();
}

function updateChaosModIcons() {
  const bar = document.getElementById('chaosModIcons');
  const tip = document.getElementById('chaosModTooltip');
  if (!bar) return;
  if (minigameType !== 'chaos' || !gameRunning) { bar.style.display = 'none'; return; }
  bar.style.display = 'flex';
  bar.innerHTML = '';
  for (const id of currentChaosModifiers) {
    const mod = CHAOS_MODS.find(m => m.id === id);
    if (!mod) continue;
    const icon = document.createElement('div');
    icon.style.cssText = 'width:36px;height:36px;background:rgba(0,0,0,0.7);border:1px solid #ff88ff;border-radius:6px;display:flex;align-items:center;justify-content:center;font-size:18px;cursor:default;';
    icon.textContent = mod.label.split(' ')[0]; // emoji part
    icon.title = mod.desc;
    icon.addEventListener('mouseenter', e => {
      if (!tip) return;
      tip.textContent = `${mod.label}: ${mod.desc}`;
      tip.style.display = 'block';
      tip.style.left = (e.clientX + 10) + 'px';
      tip.style.top  = (e.clientY - 30) + 'px';
    });
    icon.addEventListener('mousemove', e => {
      if (!tip) return;
      tip.style.left = (e.clientX + 10) + 'px';
      tip.style.top  = (e.clientY - 30) + 'px';
    });
    icon.addEventListener('mouseleave', () => { if (tip) tip.style.display = 'none'; });
    bar.appendChild(icon);
  }
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
  soccerBall   = null;
  soccerScore  = [0, 0];
  soccerScored = 0;
  if (minigameType === 'soccer') {
    soccerBall = { x: GAME_W/2 - 15, y: 300, w: 30, h: 30, vx: 0, vy: 0, spin: 0, bounciness: 0.75, lastTouched: null };
  }
  if (minigameType === 'chaos') {
    // Reset all players to standard settings; updateChaosMatch will add first mod on frame 1
    clearChaosModifiers();
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
    // In team mode, bot players also need targets pointing at survival enemies
    if (survivalTeamMode) {
      const liveEnemies = survivalEnemies.filter(e => e.health > 0);
      players.forEach(p => {
        if (p.isAI && !p.isBoss && liveEnemies.length > 0) {
          const nearest = liveEnemies.reduce((best, e) => dist(p, e) < dist(p, best) ? e : best);
          p.target = nearest;
        }
      });
    }

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

function updateSoccerBall() {
  if (!soccerBall || !gameRunning) return;
  if (soccerScored > 0) { soccerScored--; return; }

  const ball  = soccerBall;
  const arena = currentArena;

  // Gravity
  ball.vy += 0.55;
  ball.x  += ball.vx;
  ball.y  += ball.vy;
  ball.spin += ball.vx * 0.04;

  // Floor bounce
  const floor = arena.platforms.find(p => p.isFloor);
  if (floor && ball.y + ball.h > floor.y) {
    ball.y  = floor.y - ball.h;
    ball.vy = -Math.abs(ball.vy) * ball.bounciness;
    ball.vx *= 0.88;
    if (Math.abs(ball.vy) < 1.5) ball.vy = 0;
  }
  // Ceiling
  if (ball.y < 0) { ball.y = 0; ball.vy = Math.abs(ball.vy) * 0.6; }
  // Left/right wall bounces (outside the goal posts)
  if (ball.x < 14) { ball.x = 14; ball.vx = Math.abs(ball.vx) * 0.6; }
  if (ball.x + ball.w > GAME_W - 14) { ball.x = GAME_W - 14 - ball.w; ball.vx = -Math.abs(ball.vx) * 0.6; }

  // Speed cap
  const maxSpd = 22;
  const spd = Math.hypot(ball.vx, ball.vy);
  if (spd > maxSpd) { ball.vx = ball.vx / spd * maxSpd; ball.vy = ball.vy / spd * maxSpd; }

  // Player body collision — push ball away
  for (const p of players) {
    if (!p || p.health <= 0) continue;
    const bCX = ball.x + ball.w / 2;
    const bCY = ball.y + ball.h / 2;
    const overlapX = bCX - p.cx();
    const overlapY = bCY - (p.y + p.h / 2);
    const dist2    = Math.hypot(overlapX, overlapY);
    const minDist  = p.w / 2 + ball.w / 2 + 4;
    if (dist2 < minDist && dist2 > 0.1) {
      const nx = overlapX / dist2;
      const ny = overlapY / dist2;
      const relVx = ball.vx - p.vx;
      const relVy = ball.vy - p.vy;
      const dot    = relVx * -nx + relVy * -ny;
      const impulse = Math.max(dot + 3.5, 1.5);
      ball.vx += -nx * impulse;
      ball.vy += -ny * impulse * 0.85;
      const pen = minDist - dist2;
      ball.x -= nx * pen * 0.55;
      ball.y -= ny * pen * 0.55;
      ball.lastTouched = p;
    }
  }

  // Weapon tip collision — attack gives extra kick
  for (const p of players) {
    if (!p || p.attackTimer <= 0) continue;
    const tip = p._weaponTip;
    if (!tip) continue;
    const bx = ball.x + ball.w / 2, by = ball.y + ball.h / 2;
    const td  = Math.hypot(tip.x - bx, tip.y - by);
    if (td < ball.w / 2 + 10) {
      const nx = (bx - tip.x) / (td || 1);
      const ny = (by - tip.y) / (td || 1);
      const forceMult = 1 + (p.weapon?.damage || 10) / 15;
      ball.vx += nx * 9 * forceMult;
      ball.vy += ny * 7 * forceMult - 2;
      ball.lastTouched = p;
    }
  }

  // Goal detection
  const bx = ball.x, by = ball.y, bw = ball.w, bh = ball.h;
  for (const [side, goal] of Object.entries(SOCCER_GOALS)) {
    if (bx < goal.x + goal.w && bx + bw > goal.x &&
        by < goal.y + goal.h && by + bh > goal.y) {
      const scoringTeam = goal.team; // 0 = P1 scored, 1 = P2 scored
      soccerScore[scoringTeam]++;
      soccerScored = 120;
      ball.x = GAME_W / 2 - ball.w / 2;
      ball.y = 340;
      ball.vx = 0; ball.vy = 0; ball.spin = 0;
      spawnParticles(goal.x + goal.w / 2, goal.y + goal.h / 2, '#ffdd00', 20);
      SoundManager.explosion();
      if (settings.screenShake) screenShake = Math.max(screenShake, 10);
    }
  }
}

function drawSoccer() {
  if (minigameType !== 'soccer') return;

  ctx.save();
  // Field markings
  ctx.strokeStyle = 'rgba(255,255,255,0.35)';
  ctx.lineWidth = 2;
  ctx.setLineDash([8, 6]);
  ctx.beginPath(); ctx.moveTo(GAME_W / 2, 0); ctx.lineTo(GAME_W / 2, 460); ctx.stroke();
  ctx.setLineDash([]);
  ctx.beginPath(); ctx.arc(GAME_W / 2, 300, 60, 0, Math.PI * 2); ctx.stroke();

  // Goals
  for (const [side, goal] of Object.entries(SOCCER_GOALS)) {
    ctx.fillStyle = 'rgba(255,255,255,0.15)';
    ctx.fillRect(goal.x, goal.y, goal.w, goal.h);
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 3;
    ctx.setLineDash([]);
    ctx.strokeRect(goal.x, goal.y, goal.w, goal.h);
    // Net lines
    ctx.strokeStyle = 'rgba(255,255,255,0.3)';
    ctx.lineWidth = 1;
    for (let yy = goal.y; yy < goal.y + goal.h; yy += 12) {
      ctx.beginPath(); ctx.moveTo(goal.x, yy); ctx.lineTo(goal.x + goal.w, yy); ctx.stroke();
    }
  }

  // Ball
  if (soccerBall && soccerScored === 0) {
    const ball = soccerBall;
    ctx.save();
    ctx.translate(ball.x + ball.w / 2, ball.y + ball.h / 2);
    ctx.rotate(ball.spin);
    ctx.beginPath(); ctx.arc(0, 0, ball.w / 2, 0, Math.PI * 2);
    ctx.fillStyle = '#ffffff';
    ctx.shadowColor = '#ffff00'; ctx.shadowBlur = 8;
    ctx.fill();
    ctx.fillStyle = '#222';
    ctx.shadowBlur = 0;
    for (let i = 0; i < 5; i++) {
      const a  = (i / 5) * Math.PI * 2 - Math.PI / 2;
      const px = Math.cos(a) * (ball.w / 2 * 0.55);
      const py = Math.sin(a) * (ball.w / 2 * 0.55);
      ctx.beginPath(); ctx.arc(px, py, ball.w / 2 * 0.22, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
  }

  // "GOAL!" flash
  if (soccerScored > 80) {
    ctx.save();
    ctx.globalAlpha = Math.min(1, (soccerScored - 80) / 30);
    ctx.font = 'bold 72px Arial';
    ctx.textAlign = 'center';
    ctx.fillStyle = '#ffdd00';
    ctx.shadowColor = '#ff8800'; ctx.shadowBlur = 20;
    ctx.fillText('GOAL!', GAME_W / 2, GAME_H / 2 - 40);
    ctx.restore();
  }

  ctx.restore();
}

function drawMinigameHUD() {
  if (!gameRunning) return;
  ctx.save();
  if (minigameType === 'soccer') {
    const p1c = players[0]?.color || '#00d4ff';
    const p2c = players[1]?.color || '#ff4444';
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(GAME_W / 2 - 70, 58, 140, 30);
    ctx.font = 'bold 22px Arial';
    ctx.shadowColor = '#000'; ctx.shadowBlur = 4;
    ctx.fillStyle = p1c;
    ctx.textAlign = 'left';
    ctx.fillText(soccerScore[0], GAME_W / 2 - 60, 80);
    ctx.fillStyle = '#fff';
    ctx.textAlign = 'center';
    ctx.fillText('–', GAME_W / 2, 80);
    ctx.fillStyle = p2c;
    ctx.textAlign = 'right';
    ctx.fillText(soccerScore[1], GAME_W / 2 + 60, 80);
    ctx.shadowBlur = 0;
  } else if (minigameType === 'survival') {
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
    ctx.fillText('KING ZONE', kothZoneX, 62);
    ctx.shadowBlur = 0;
    // Top score bar
    const p1 = players[0], p2 = players[1];
    const WIN_FRAMES = 1800;
    [p1, p2].forEach((p, i) => {
      if (!p) return;
      const pts = kothPoints[i];
      const barW = 130, barH = 10;
      const bx = i === 0 ? 20 : GAME_W - 20 - barW;
      const by = 56;
      ctx.fillStyle = 'rgba(0,0,0,0.55)';
      ctx.fillRect(bx, by, barW, barH);
      ctx.fillStyle = p.color;
      ctx.fillRect(bx, by, barW * (pts / WIN_FRAMES), barH);
      ctx.fillStyle = '#fff'; ctx.font = 'bold 9px Arial';
      ctx.textAlign = i === 0 ? 'left' : 'right';
      const tx = i === 0 ? bx : bx + barW;
      ctx.fillText(`${p.name}  ${Math.floor(pts / 60)}s / 30s`, tx, by - 2);
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
  localStorage.removeItem('smc_achievements');  // also wipe all achievements
  bossBeaten          = false;
  collectedLetterIds  = new Set();
  unlockedTrueBoss    = false;
  earnedAchievements  = new Set();  // clear in-memory achievement set too
  const card = document.getElementById('modeTrueForm');
  if (card) card.style.display = 'none';
  syncCodeInput();
  document.getElementById('resetConfirmRow').style.display = 'none';
  // Flash confirmation
  const msg = document.createElement('div');
  msg.textContent = 'Progress reset! Starting tutorial...';
  msg.style.cssText = 'position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);background:rgba(0,0,0,0.9);color:#ff4444;padding:16px 28px;border-radius:8px;font-size:1.1rem;font-weight:bold;z-index:9999;pointer-events:none';
  document.body.appendChild(msg);
  setTimeout(() => {
    msg.remove();
    selectMode('tutorial');
    startGame();
  }, 1500);
}

