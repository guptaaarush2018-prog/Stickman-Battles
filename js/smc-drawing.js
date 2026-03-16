'use strict';

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
  if (currentArenaKey === 'soccer')  drawSoccerArena();
}

function drawSoccerArena() {
  // Green field with vertical stripe pattern
  ctx.fillStyle = '#2d6b1e';
  ctx.fillRect(0, 0, GAME_W, GAME_H);
  for (let i = 0; i < 9; i++) {
    if (i % 2 === 0) {
      ctx.fillStyle = 'rgba(0,0,0,0.06)';
      ctx.fillRect(i * 100, 0, 100, GAME_H);
    }
  }
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

  // Draw lava on floor if boss floor hazard is active (same as creator arena)
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

  // When floor is removed: orange lava rises from below
  if (tfFloorRemoved) {
    ctx.globalAlpha = 1;
    const ly = 460;
    const lg = ctx.createLinearGradient(0, ly, 0, GAME_H);
    lg.addColorStop(0,   '#ff6600');
    lg.addColorStop(0.3, '#cc2200');
    lg.addColorStop(1,   '#880000');
    ctx.fillStyle = lg;
    ctx.beginPath();
    ctx.moveTo(0, ly);
    for (let x = 0; x <= GAME_W; x += 18) {
      ctx.lineTo(x, ly + Math.sin(x * 0.055 + frameCount * 0.09) * 8);
    }
    ctx.lineTo(GAME_W, GAME_H);
    ctx.lineTo(0, GAME_H);
    ctx.closePath();
    ctx.fill();
    ctx.save();
    ctx.shadowColor = '#ff4400';
    ctx.shadowBlur  = 24;
    ctx.fillStyle   = 'rgba(255,100,0,0.28)';
    ctx.fillRect(0, ly - 12, GAME_W, 14);
    ctx.restore();
  }
}

function drawCreatorArena() {
  // Dramatic purple lightning during phase 2 and 3
  const boss = players.find(p => p.isBoss);
  if (boss && boss.health > 0) {
    const bPhase = boss.health > 2000 ? 1 : boss.health > 1000 ? 2 : 3;
    if (bPhase >= 2) {
      // Each lightning bolt: random jagged line from top to mid-screen
      const boltCount = bPhase === 3 ? 3 : 1;
      for (let b = 0; b < boltCount; b++) {
        // Each bolt uses a slowly cycling seed so it persists a few frames, then jumps
        const seed  = Math.floor(frameCount / 4) * 37 + b * 1731;
        const seededRand = (n) => (Math.sin(seed + n * 127.1) * 43758.5453) % 1;
        const startX = (Math.abs(seededRand(0)) % 1) * GAME_W;
        const alpha  = 0.12 + Math.abs(Math.sin(frameCount * 0.11 + b)) * 0.25;
        if (alpha < 0.06) continue; // occasional off flash
        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.strokeStyle = bPhase === 3 ? '#ff88ff' : '#aa44ff';
        ctx.shadowColor = bPhase === 3 ? '#ff00ff' : '#8800ff';
        ctx.shadowBlur  = 14;
        ctx.lineWidth   = 1.5;
        ctx.beginPath();
        let lx = startX, ly = 0;
        ctx.moveTo(lx, ly);
        const steps = 6 + Math.floor(Math.abs(seededRand(1)) * 4);
        for (let s = 1; s <= steps; s++) {
          lx += (seededRand(s * 3 + 1) - 0.5) * 80;
          ly  = (s / steps) * 260;
          ctx.lineTo(lx, ly);
        }
        ctx.stroke();
        ctx.restore();
      }
    }
  }

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
  // Swaying grass tufts along the ground
  const groundY = 460; // grass floor y
  ctx.strokeStyle = '#4a8c32';
  ctx.lineWidth   = 1.5;
  for (let i = 0; i < 28; i++) {
    const tx   = 12 + i * 32;
    const sway = Math.sin(frameCount * 0.025 + i * 0.9) * 5;
    const h    = 8 + Math.sin(i * 2.7) * 4; // varied height
    ctx.globalAlpha = 0.65;
    ctx.beginPath();
    ctx.moveTo(tx, groundY);
    ctx.quadraticCurveTo(tx + sway * 0.5, groundY - h * 0.6, tx + sway, groundY - h);
    ctx.stroke();
    // Second blade
    const sway2 = Math.sin(frameCount * 0.025 + i * 0.9 + 0.5) * 4;
    ctx.beginPath();
    ctx.moveTo(tx + 4, groundY);
    ctx.quadraticCurveTo(tx + 4 + sway2 * 0.5, groundY - h * 0.5, tx + 4 + sway2, groundY - h * 0.85);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
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
    // Neon sign flicker on top edge of taller buildings
    if (b.h > 120) {
      const neonPhase = Math.sin(frameCount * 0.07 + b.x * 0.03);
      const flicker   = neonPhase > 0.85 ? 0 : (0.5 + neonPhase * 0.5); // occasional off flicker
      const neonAlpha = Math.max(0, flicker);
      // Alternate neon colors per building based on position
      const neonColor = (Math.floor(b.x / 80) % 3 === 0) ? `rgba(255,20,100,${neonAlpha})`
                      : (Math.floor(b.x / 80) % 3 === 1) ? `rgba(0,200,255,${neonAlpha})`
                      :                                     `rgba(180,0,255,${neonAlpha})`;
      ctx.save();
      ctx.shadowColor = neonColor;
      ctx.shadowBlur  = 8;
      ctx.strokeStyle = neonColor;
      ctx.lineWidth   = 2;
      ctx.beginPath();
      ctx.moveTo(b.x + 4, GAME_H - b.h - 1);
      ctx.lineTo(b.x + b.w - 4, GAME_H - b.h - 1);
      ctx.stroke();
      ctx.restore();
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
      const isMgSurvival = gameMode === 'minigames' && (minigameType === 'survival' || minigameType === 'koth') && !p.isBoss;
      if ((trainingMode || tutorialMode || isMgSurvival) && !p.isBoss) {
        // Training/tutorial/survival minigame: player respawns infinitely, no game-over
        addKillFeed(p);
        spawnParticles(p.cx(), p.cy(), p.color, 20);
        if (!p.ragdollTimer) { p.ragdollTimer = 45; p.ragdollSpin = (Math.random() - 0.5) * 0.25; }
        if (typeof VerletRagdoll !== 'undefined') {
          const vr = new VerletRagdoll(p);
          if (currentArena) {
            const floor = currentArena.platforms.find(pl => pl.isFloor && !pl.isFloorDisabled);
            if (floor) vr.floorY = floor.y;
          }
          verletRagdolls.push(vr);
        }
        if (p._rd) PlayerRagdoll.collapse(p);
        p.invincible = 999;
        p.vy = -10; p.vx = (Math.random() - 0.5) * 14;
        respawnCountdowns.push({ color: p.color, x: p.spawnX, y: p.spawnY - 80, framesLeft: 66 });
        setTimeout(() => {
          if (!gameRunning) return;
          if (isRandomMapMode && gameMode !== 'boss' && gameMode !== 'trueform') {
            const arenaPool = Object.keys(ARENAS).filter(k => !['creator','void','soccer'].includes(k));
            switchArena(randChoice(arenaPool));
          }
          p.respawn();
        }, 1100);
      } else if (infiniteMode && !p.isBoss) {
        // Infinite mode: award win to opponent, always respawn
        const other = players.find(q => q !== p);
        if (other) { if (p === players[0]) winsP2++; else winsP1++; }
        addKillFeed(p);
        spawnParticles(p.cx(), p.cy(), p.color, 20);
        if (!p.ragdollTimer) { p.ragdollTimer = 45; p.ragdollSpin = (Math.random() - 0.5) * 0.25; }
        if (typeof VerletRagdoll !== 'undefined') {
          const vr = new VerletRagdoll(p);
          if (currentArena) {
            const floor = currentArena.platforms.find(pl => pl.isFloor && !pl.isFloorDisabled);
            if (floor) vr.floorY = floor.y;
          }
          verletRagdolls.push(vr);
        }
        if (p._rd) PlayerRagdoll.collapse(p);
        p.invincible = 999;
        respawnCountdowns.push({ color: p.color, x: p.spawnX, y: p.spawnY - 80, framesLeft: 66 });
        setTimeout(() => {
          if (!gameRunning) return;
          if (isRandomMapMode && gameMode !== 'boss' && gameMode !== 'trueform') {
            const arenaPool = Object.keys(ARENAS).filter(k => !['creator','void','soccer'].includes(k));
            switchArena(randChoice(arenaPool));
          }
          p.respawn();
        }, 1100);
      } else if (p.lives > 0) {
        p.lives--;
        p.invincible = 999; // block re-trigger until respawn clears it
        addKillFeed(p);
        spawnParticles(p.cx(), p.cy(), p.color, 20);
        if (!p.ragdollTimer) { p.ragdollTimer = 45; p.ragdollSpin = (Math.random() - 0.5) * 0.25; }
        if (typeof VerletRagdoll !== 'undefined') {
          const vr = new VerletRagdoll(p);
          if (currentArena) {
            const floor = currentArena.platforms.find(pl => pl.isFloor && !pl.isFloorDisabled);
            if (floor) vr.floorY = floor.y;
          }
          verletRagdolls.push(vr);
        }
        if (p._rd) PlayerRagdoll.collapse(p);
        if (p.lives > 0) {
          respawnCountdowns.push({ color: p.color, x: p.spawnX, y: p.spawnY - 80, framesLeft: 66 });
          setTimeout(() => {
            if (!gameRunning) return;
            if (isRandomMapMode) {
              const arenaPool = Object.keys(ARENAS).filter(k => !['creator','void','soccer'].includes(k));
              switchArena(randChoice(arenaPool));
            }
            p.respawn();
          }, 1100);
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
            if (gameMode === 'trueform') {
              showBossDialogue('You never stood a chance.', 220);
              setTimeout(endGame, 1400);
            } else {
              setTimeout(endGame, 900);
            }
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
  // Boss death scene removes human players from the array — check health directly to detect victory
  const bossEntity   = players.find(p => p.isBoss);
  const bossDefeated = isBossModeEnd && bossEntity && bossEntity.health <= 0;
  const winner = bossDefeated                    ? null   // human win — handled in bossDefeated block
               : alive.length === 1              ? alive[0]
               : (alive.length === 0 && isBossModeEnd) ? bossEntity
               : null;

  // --- Achievement checks on match end ---
  // Skip all achievements/progression if any non-boss player used a custom weapon
  const _anyCustomWeapon = players.some(p => !p.isBoss && p.weapon && p.weapon._isCustom);
  // For 2P boss co-op win, treat any survivor as the "winner" for achievements
  // alive may be empty after boss death scene (startBossDeathScene strips human players)
  // so use a sentinel achiever object for boss-defeat achievements if no human ref available
  const _bossDefeatedAchiever = bossDefeated ? (alive[0] || { isBoss: false, health: 1, maxHealth: 1, weaponKey: null, kills: 0 }) : null;
  const achievWinner = _anyCustomWeapon ? null : (winner || _bossDefeatedAchiever);
  if (achievWinner && !achievWinner.isBoss) {
    _achStats.totalWins++;
    _achStats.winStreak++;
    // First Blood: only when beating a hard AI bot
    const loser = players.find(p => p !== achievWinner && p.isAI && p.aiDiff === 'hard');
    if (loser) unlockAchievement('first_blood');
    if (_achStats.totalWins >= 10) unlockAchievement('perfectionist');
    if (_achStats.winStreak >= 3)  unlockAchievement('hat_trick');
    // Win with ≤10 HP
    if (achievWinner.health <= 10) unlockAchievement('survivor');
    // Untouchable: won without taking damage this match
    if (_achStats.damageTaken === 0) unlockAchievement('untouchable');
    // Speedrun: won in under 30 seconds
    if (Date.now() - _achStats.matchStartTime < 30000) unlockAchievement('speedrun');
    // Ranged damage threshold
    if (_achStats.rangedDmg >= 500) unlockAchievement('gunslinger');
    // Super count
    if (_achStats.superCount >= 10) unlockAchievement('super_saver');
    // Hammer-only win
    if (achievWinner.weaponKey === 'hammer') unlockAchievement('hammer_time');
    // Boss slayer
    if (isBossModeEnd && gameMode === 'boss') unlockAchievement('boss_slayer');
    if (isBossModeEnd && gameMode === 'trueform') unlockAchievement('true_form');
    // KotH win
    if (gameMode === 'minigames' && minigameType === 'koth') unlockAchievement('koth_win');
    // PvP achievements: require both players dealt ≥40 damage (real fight condition)
    const isRealPvP = _achStats.pvpDamageDealt >= 40 && _achStats.pvpDamageReceived >= 40;
    if (isRealPvP) {
      if (_achStats.winStreak >= 3) unlockAchievement('hat_trick');
      if (achievWinner.health <= 10) unlockAchievement('survivor');
    }
  } else if (winner && winner.isBoss) {
    _achStats.winStreak = 0; // loss resets streak
  } else {
    _achStats.winStreak = 0;
  }
  const wt = document.getElementById('winnerText');
  if (bossDefeated) {
    // Human players beat the boss
    if (gameMode === 'boss' && bossPlayerCount === 2) {
      wt.textContent = 'PLAYERS WIN!';
      wt.style.color = '#00ffaa';
    } else {
      const humanWinner = alive[0];
      wt.textContent = (humanWinner ? humanWinner.name : 'PLAYER') + ' WINS!';
      wt.style.color  = humanWinner ? humanWinner.color : '#ffffff';
    }
  } else if (winner) {
    wt.textContent = winner.name + ' WINS!';
    wt.style.color = winner.color;
  } else {
    wt.textContent = 'DRAW!';
    wt.style.color = '#ffffff';
  }
  let statsHtml = players.map(p => `<div class="stat-row" style="color:${p.color}">${p.name}: ${p.kills} KO${p.kills !== 1 ? 's' : ''}</div>`).join('');
  // Boss defeated hint (only if letters not yet unlocked)
  const defeatedBoss = players.find(p => p.isBoss && p.health <= 0);
  if (defeatedBoss && (winner || bossDefeated) && !(winner && winner.isBoss) && !unlockedTrueBoss && bossBeaten) {
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
  const inp  = document.getElementById('codeInput');
  const hint = document.getElementById('trueFormHint');
  // Hide the homepage hint once True Form is unlocked
  if (hint) hint.style.display = unlockedTrueBoss ? 'none' : '';
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
  MusicManager.stop();
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
  const chatElBTM = document.getElementById('onlineChat');
  if (chatElBTM) chatElBTM.style.display = 'none';
  document.getElementById('pauseOverlay').style.display    = 'none';
  document.getElementById('gameOverOverlay').style.display = 'none';
  document.getElementById('menu').style.display            = 'grid';
  const trainingHud = document.getElementById('trainingHud');
  if (trainingHud) trainingHud.style.display = 'none';
  const trainingCtrl2 = document.getElementById('trainingControls');
  if (trainingCtrl2) trainingCtrl2.style.display = 'none';
  const mapCr = document.getElementById('mapCreatorPanel');
  if (mapCr) mapCr.style.display = 'none';
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
// CINEMATIC OVERLAY — letterbox bars + vignette (drawn in screen space)
// ============================================================
function drawCinematicOverlay() {
  if (!activeCinematic) return;
  const cw = canvas.width, ch = canvas.height;
  const t  = activeCinematic.timer / 60;
  const totalSec  = activeCinematic.durationFrames / 60;
  const inAlpha   = Math.min(1, t / 0.3);
  const outAlpha  = Math.min(1, (totalSec - t) / 0.3);
  const barAlpha  = Math.min(inAlpha, outAlpha);

  // Letterbox bars
  const barH = Math.round(ch * 0.082);
  ctx.globalAlpha = barAlpha;
  ctx.fillStyle = '#000000';
  ctx.fillRect(0, 0,         cw, barH);
  ctx.fillRect(0, ch - barH, cw, barH);

  // Edge vignette
  ctx.globalAlpha = barAlpha * 0.38;
  const vg = ctx.createLinearGradient(0, 0, cw, 0);
  vg.addColorStop(0,    'rgba(0,0,0,0.85)');
  vg.addColorStop(0.13, 'rgba(0,0,0,0)');
  vg.addColorStop(0.87, 'rgba(0,0,0,0)');
  vg.addColorStop(1,    'rgba(0,0,0,0.85)');
  ctx.fillStyle = vg;
  ctx.fillRect(0, barH, cw, ch - barH * 2);

  // Phase label (if set by the cinematic sequence)
  const labelAlpha = Math.max(0,
    Math.min(1, (t - 0.9) / 0.25) * Math.min(1, (totalSec - t - 0.25) / 0.25));
  if (labelAlpha > 0 && activeCinematic._phaseLabel) {
    ctx.globalAlpha = labelAlpha;
    ctx.font        = `bold ${Math.round(ch * 0.042)}px Arial`;
    ctx.textAlign   = 'center';
    ctx.fillStyle   = activeCinematic._phaseLabel.color || '#ffffff';
    ctx.shadowColor = activeCinematic._phaseLabel.color || '#cc00ee';
    ctx.shadowBlur  = 30;
    ctx.fillText(activeCinematic._phaseLabel.text, cw / 2, ch / 2);
    ctx.shadowBlur  = 0;
  }
  // Screen flash (from CinFX.flash)
  if (cinScreenFlash && cinScreenFlash.timer > 0) {
    const fa = (cinScreenFlash.timer / cinScreenFlash.maxTimer) * cinScreenFlash.alpha;
    ctx.globalAlpha = Math.max(0, fa);
    ctx.fillStyle   = cinScreenFlash.color || '#ffffff';
    ctx.fillRect(0, 0, cw, ch);
    cinScreenFlash.timer--;
    if (cinScreenFlash.timer <= 0) cinScreenFlash = null;
  }

  ctx.globalAlpha = 1;
}

// ============================================================
// PHASE TRANSITION RINGS
// ============================================================
function drawPhaseTransitionRings() {
  for (let i = phaseTransitionRings.length - 1; i >= 0; i--) {
    const ring = phaseTransitionRings[i];
    ring.timer--;
    if (ring.timer <= 0) { phaseTransitionRings.splice(i, 1); continue; }
    const prog  = 1 - ring.timer / ring.maxTimer;
    const curR  = ring.r + prog * (ring.maxR - ring.r);
    const alpha = ring.timer < 20 ? ring.timer / 20 : 1 - prog * 0.55;
    ctx.save();
    ctx.globalAlpha = Math.max(0, alpha);
    ctx.strokeStyle = ring.color;
    ctx.lineWidth   = Math.max(0.5, (ring.lineWidth || 3) * (1 - prog * 0.7));
    ctx.shadowColor = ring.color;
    ctx.shadowBlur  = 16;
    ctx.beginPath();
    ctx.arc(ring.cx, ring.cy, Math.max(0.1, curR), 0, Math.PI * 2);
    ctx.stroke();
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
    if (frameCount % 3 === 0 && settings.particles && particles.length < MAX_PARTICLES) {
      const _ang = Math.random() * Math.PI * 2;
      const _r   = 16 + Math.random() * 24;
      const _p = _getParticle();
      _p.x = pcx + Math.cos(_ang) * _r; _p.y = pcy + Math.sin(_ang) * _r;
      _p.vx = (Math.random() - 0.5) * 1.8; _p.vy = -2.0 - Math.random() * 2.2;
      _p.color = Math.random() < 0.65 ? '#ff6600' : '#ff9900';
      _p.size = 1.6 + Math.random() * 2.2; _p.life = 28 + Math.random() * 22; _p.maxLife = 50;
      particles.push(_p);
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
function spawnLightningBolt(x, targetY) {
  // Build a jagged segmented path from top of screen down to target
  const segments = [];
  let cx = x + (Math.random() - 0.5) * 60;
  let cy = 0;
  const steps = 10 + Math.floor(Math.random() * 6);
  for (let i = 0; i <= steps; i++) {
    segments.push({ x: cx, y: cy });
    cy = targetY * (i / steps);
    cx = x + (Math.random() - 0.5) * 40 * (1 - i / steps);
  }
  segments.push({ x, y: targetY });
  lightningBolts.push({ x, y: targetY, timer: 18, segments });
}

function updateAndDrawLightningBolts() {
  for (let i = lightningBolts.length - 1; i >= 0; i--) {
    const bolt = lightningBolts[i];
    bolt.timer--;
    if (bolt.timer <= 0) { lightningBolts.splice(i, 1); continue; }
    const alpha = bolt.timer / 18;
    ctx.save();
    ctx.strokeStyle = `rgba(255,255,120,${alpha})`;
    ctx.lineWidth   = 2.5;
    ctx.shadowColor = '#ffff00';
    ctx.shadowBlur  = 12;
    ctx.beginPath();
    ctx.moveTo(bolt.segments[0].x, bolt.segments[0].y);
    for (let j = 1; j < bolt.segments.length; j++) {
      ctx.lineTo(bolt.segments[j].x, bolt.segments[j].y);
    }
    ctx.stroke();
    // Inner bright core
    ctx.strokeStyle = `rgba(255,255,255,${alpha * 0.8})`;
    ctx.lineWidth   = 1;
    ctx.shadowBlur  = 4;
    ctx.beginPath();
    ctx.moveTo(bolt.segments[0].x, bolt.segments[0].y);
    for (let j = 1; j < bolt.segments.length; j++) {
      ctx.lineTo(bolt.segments[j].x, bolt.segments[j].y);
    }
    ctx.stroke();
    ctx.restore();
  }
}

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
      if (frameCount % 8 === 0 && settings.particles && particles.length < MAX_PARTICLES) {
        const a = Math.random() * Math.PI * 2;
        const _p = _getParticle();
        _p.x = p.cx() + Math.cos(a) * 14; _p.y = p.cy() + Math.sin(a) * 14;
        _p.vx = (Math.random()-0.5)*2; _p.vy = -1.5 - Math.random()*1.5;
        _p.color = Math.random() < 0.6 ? '#ffff44' : '#aaddff';
        _p.size = 1.5 + Math.random()*2; _p.life = 14 + Math.random()*10; _p.maxLife = 24;
        particles.push(_p);
      }
      // Lightning arc toward target every 55 frames
      if (p.target && p.target.health > 0 && frameCount % 55 === 0) {
        const tx = p.target.cx(), ty = p.target.cy();
        const sx2 = p.cx(), sy2 = p.cy();
        const steps = 7;
        for (let si = 0; si < steps && particles.length < MAX_PARTICLES; si++) {
          const prog = si / steps;
          const jx   = sx2 + (tx - sx2) * prog + (Math.random()-0.5)*30;
          const jy   = sy2 + (ty - sy2) * prog + (Math.random()-0.5)*20;
          const _p = _getParticle();
          _p.x = jx; _p.y = jy; _p.vx = 0; _p.vy = 0;
          _p.color = '#ffffaa'; _p.size = 2.5; _p.life = 8; _p.maxLife = 8;
          particles.push(_p);
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
        for (let k = 0; k < 3 && particles.length < MAX_PARTICLES; k++) {
          const _p = _getParticle();
          _p.x = p.cx() + (Math.random()-0.5)*20; _p.y = p.cy() + (Math.random()-0.5)*20;
          _p.vx = (Math.random()-0.5)*4; _p.vy = -2-Math.random()*3;
          _p.color = '#ff8800'; _p.size = 2+Math.random()*2; _p.life = 12; _p.maxLife = 12;
          particles.push(_p);
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
  for (let _i = 0; _i < 100 && particles.length < MAX_PARTICLES; _i++) {
    const _a = Math.random() * Math.PI * 2;
    const _s = 2 + Math.random() * 14;
    const _p = _getParticle();
    _p.x = boss.cx(); _p.y = boss.cy();
    _p.vx = Math.cos(_a)*_s; _p.vy = Math.sin(_a)*_s;
    _p.color = deathColors[Math.floor(Math.random() * deathColors.length)];
    _p.size = 2 + Math.random() * 8; _p.life = 80 + Math.random() * 100; _p.maxLife = 180;
    particles.push(_p);
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
      for (let _i = 0; _i < 60 && particles.length < MAX_PARTICLES; _i++) {
        const _a = Math.random() * Math.PI * 2;
        const _s = 3 + Math.random() * 8;
        const _p = _getParticle();
        _p.x = sc.orbX; _p.y = sc.orbY;
        _p.vx = Math.cos(_a)*_s; _p.vy = Math.sin(_a)*_s;
        _p.color = Math.random() < 0.4 ? '#ffffff' : (Math.random() < 0.5 ? '#cc00ee' : '#ffaaff');
        _p.size = 2 + Math.random() * 5; _p.life = 60 + Math.random()*60; _p.maxLife = 120;
        particles.push(_p);
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
    if (settings.particles && Math.random() < 0.6 && particles.length < MAX_PARTICLES) {
      const _p = _getParticle();
      _p.x = sc.orbX; _p.y = sc.orbY;
      _p.vx = (Math.random()-0.5)*2; _p.vy = (Math.random()-0.5)*2;
      _p.color = Math.random() < 0.5 ? '#cc00ee' : '#ffffff';
      _p.size = 2 + Math.random()*4; _p.life = 20 + Math.random()*20; _p.maxLife = 40;
      particles.push(_p);
    }
    if (sc.orbX > GAME_W + 60 || sc.orbR <= 0) {
      sc.phase  = 'portal_close';
      sc.camZoomTarget = 1.0; // zoom all the way back to normal
      for (const bp of backstagePortals) bp.phase = 'closing';
    }
  } else if (sc.phase === 'portal_close') {
    if (sc.timer >= 370) {
      bossDeathScene = null;
      const _customWpnUsed = players.some(p => !p.isBoss && p.weapon && p.weapon._isCustom);
      if (!bossBeaten && gameMode === 'boss' && !_customWpnUsed) {
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
      for (let i = 0; i < 60 && particles.length < MAX_PARTICLES; i++) {
        const angle = -Math.PI/2 + (Math.random()-0.5)*0.4;
        const spd   = 4 + Math.random() * 10;
        const _p = _getParticle();
        _p.x = p.spawnX; _p.y = p.spawnY;
        _p.vx = Math.cos(angle)*spd; _p.vy = Math.sin(angle)*spd;
        _p.color = Math.random() < 0.6 ? '#aa44ff' : '#ffffff';
        _p.size = 2 + Math.random()*5; _p.life = 60 + Math.random()*40; _p.maxLife = 100;
        particles.push(_p);
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

