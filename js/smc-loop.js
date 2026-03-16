'use strict';

// ============================================================
function updateCamera() {
  const activePlayers = [...players, ...trainingDummies, ...minions].filter(p => p.health > 0 && !p.backstageHiding);

  let targetZoom = 1.0;
  let targetX    = GAME_W / 2;
  let targetY    = GAME_H / 2;

  if (activePlayers.length > 0) {
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const p of activePlayers) {
      minX = Math.min(minX, p.x);
      maxX = Math.max(maxX, p.x + (p.w || 0));
      minY = Math.min(minY, p.y);
      maxY = Math.max(maxY, p.y + (p.h || 0));
    }
    // Only zoom out when a player is genuinely outside the map area
    const anyOut = minX < -10 || maxX > GAME_W + 10 || minY < -50 || maxY > GAME_H + 50;
    if (anyOut) {
      const PAD   = 80;
      const zoomX = GAME_W / ((maxX - minX) + PAD);
      const zoomY = GAME_H / ((maxY - minY) + PAD);
      targetZoom  = Math.max(Math.min(zoomX, zoomY), 0.62);
      targetX     = (minX + maxX) / 2;
      targetY     = (minY + maxY) / 2;
    }
  }

  // Brief zoom-in after a heavy hit (purely cinematic)
  if (camHitZoomTimer > 0) {
    camHitZoomTimer--;
    const hitZoom = 1.0 + 0.22 * (camHitZoomTimer / 15);
    targetZoom    = Math.max(targetZoom, hitZoom);
  }

  // Dynamic combat camera: subtle zoom-in when boss is actively attacking
  if (!cinematicCamOverride && gameRunning) {
    const attackingBoss = players.find(p => p.isBoss && p.attackTimer > 0 && p.health > 0);
    if (attackingBoss) {
      targetZoom = Math.max(targetZoom, 1.08);
      // Bias camera position slightly toward the boss during their attack
      targetX = targetX * 0.6 + attackingBoss.cx() * 0.4;
      targetY = targetY * 0.6 + attackingBoss.cy() * 0.4;
    }
  }

  camZoomTarget = targetZoom;
  const dx = targetX - camXTarget, dy = targetY - camYTarget;
  if (Math.hypot(dx, dy) > CAMERA_DEAD_ZONE) {
    camXTarget = targetX;
    camYTarget = targetY;
  }
  camZoomCur += (camZoomTarget - camZoomCur) * CAMERA_LERP_ZOOM;
  camXCur    += (camXTarget    - camXCur)    * CAMERA_LERP_POS;
  camYCur    += (camYTarget    - camYCur)    * CAMERA_LERP_POS;
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
    screenShake *= 0.9; // decay-based shake
    requestAnimationFrame(gameLoop);
    return;
  }
  // Tick active cinematic (before input and physics)
  updateCinematic();
  frameCount++;
  aiTick++;
  // Approximate real delta-time at 60fps for Director
  if (typeof updateDirector === 'function') updateDirector(1/60);

  // ---------- Phase: updateInput ----------
  // Online: tick network + apply remote player state
  if (onlineMode && gameRunning && NetworkManager.connected) {
    const localP  = players.find(p => !p.isRemote);
    const remoteP = players.find(p =>  p.isRemote);
    NetworkManager.tick(localP);
    if (remoteP) {
      const rs = NetworkManager.getRemoteState();
      if (rs) {
        remoteP.x         = rs.x;
        remoteP.y         = rs.y;
        remoteP.vx        = rs.vx;
        remoteP.vy        = rs.vy;
        remoteP.health    = rs.health;
        remoteP.maxHealth = rs.maxHealth;
        remoteP.state     = rs.state;
        remoteP.facing    = rs.facing;
        remoteP.lives     = rs.lives;
        remoteP.curses    = rs.curses || [];
      }
    }
  }

  processInput(); // updateInput

  // ---------- Phase: updateBossArena (platforms, floor hazard) ----------
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
        if (er.timer % 5 === 0 && settings.particles && particles.length < MAX_PARTICLES) {
          const upA = -Math.PI/2 + (Math.random()-0.5)*0.5;
          const _p = _getParticle();
          _p.x = er.x; _p.y = currentArena.lavaY || 462;
          _p.vx = Math.cos(upA)*5; _p.vy = Math.sin(upA)*(8+Math.random()*8);
          _p.color = Math.random() < 0.5 ? '#ff4400' : '#ff8800';
          _p.size = 3+Math.random()*4; _p.life = 30+Math.random()*20; _p.maxLife = 50;
          particles.push(_p);
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

  // ---------- Phase: updateCamera (bounding box, dead zone, lerp) ----------
  const baseScale = Math.min(canvas.width / GAME_W, canvas.height / GAME_H);
  const baseScaleX = baseScale;
  const baseScaleY = baseScale;

  let camZoom, camCX, camCY;
  if (bossDeathScene) {
    camZoom = bossDeathScene.camZoom || 1;
    camCX   = bossDeathScene.orbX;
    camCY   = bossDeathScene.orbY;
  } else {
    updateCamera();
    camZoom = camZoomCur;
    camCX   = camXCur;
    camCY   = camYCur;
  }

  // Cinematic camera: smoothly zoom in on focal point during cinematic
  if (cinematicCamOverride) {
    camZoom += (cinematicZoomTarget - camZoom) * 0.09;
    camCX   += (cinematicFocusX    - camCX)   * 0.07;
    camCY   += (cinematicFocusY    - camCY)   * 0.07;
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

  // ---------- Phase: render (world, entities, particles, HUD) ----------
  drawBackground();
  drawPlatforms();
  if (gameMode === 'minigames' && minigameType === 'soccer') drawSoccer();
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
            // Skip damage if player is inside a safe zone
            const inSafe = bossMetSafeZones.some(sz =>
              Math.hypot(p.cx() - sz.x, (p.y + p.h * 0.5) - sz.y) < sz.r);
            if (!inSafe && Math.abs(p.cx() - b.x) < 24) dealDamage(boss || players[1], p, 8, 5);
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
            dealDamage(bossRef || players.find(q => q.isBoss) || players[1], p, 14, 14);
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
    // Telegraph system: pending attacks, stagger, desperation, warnings draw
    updateBossPendingAttacks();
    drawBossWarnings();
  }

  // ---------- Phase: updatePhysics/updateCombat (projectiles, minions, players) ----------
  projectiles.forEach(p => p.update());
  projectiles = projectiles.filter(p => p.active); // prevent leak
  projectiles.forEach(p => p.draw());

  // Minions (boss-spawned)
  minions.forEach(m => { if (m.health > 0) m.update(); });
  minions.forEach(m => { if (m.health > 0) m.draw(); });
  minions = minions.filter(m => m.health > 0);

  // Training dummies / bots (also needed in tutorial mode for the tutorial dummy)
  if (trainingMode || tutorialMode) {
    trainingDummies.forEach(d => { if (d.isDummy || d.health > 0 || d.invincible > 0) d.update(); });
    trainingDummies.forEach(d => { if (d.isDummy || d.health > 0 || d.invincible > 0) d.draw(); });
    // Remove dead bots (lives=0), keep dummies (they auto-heal)
    trainingDummies = trainingDummies.filter(d => {
      if (d.isDummy) return true; // dummies auto-heal, never remove
      // Decrement lives for dead bots not yet cleaned up (checkDeaths only handles players[])
      if (d.health <= 0 && d.invincible === 0 && d.lives > 0 && !d.isBoss) {
        d.lives--;
        spawnParticles(d.cx(), d.cy(), d.color, 10);
      }
      return d.health > 0 || d.invincible > 0 || d.lives > 0;
    });
  }

  // Soccer ball physics update
  if (gameMode === 'minigames' && minigameType === 'soccer') updateSoccerBall();
  // Minigame logic update
  if (gameMode === 'minigames') updateMinigame();
  // True Form special updates
  if (gameMode === 'trueform') {
    updateTFBlackHoles();
    updateTFGravityWells();
    updateTFMeteorCrash();
    updateTFClones();
    updateTFChainSlam();
    updateTFGraspSlam();
    updateTFShockwaves();
    updateTFPendingAttacks();
    // Gravity timer: auto-restore after 10 seconds
    if (tfGravityInverted && tfGravityTimer > 0) {
      tfGravityTimer--;
      if (tfGravityTimer <= 0) {
        tfGravityInverted = false;
        showBossDialogue('Gravity returns.', 150);
        spawnParticles(GAME_W / 2, GAME_H / 2, '#ffffff', 16);
      }
    }
  }

  // Verlet death ragdolls — update and remove when lifetime expires (prevent leak)
  verletRagdolls.forEach(vr => vr.update());
  verletRagdolls = verletRagdolls.filter(vr => !vr.isDone());

  // Draw Verlet death ragdolls (behind living players)
  verletRagdolls.forEach(vr => vr.draw());

  // Players
  players.forEach(p => { if (p.health > 0 || p.invincible > 0) p.update(); });
  players.forEach(p => { if (p.health > 0 || p.invincible > 0) p.draw(); });
  drawSpartanRageEffects();
  drawClassEffects();
  drawCurseAuras();
  updateAndDrawLightningBolts();
  if (gameMode === 'trueform') {
    drawTFBlackHoles();
    drawTFGravityWells();
    drawTFMeteorCrash();
    drawTFClones();
    drawTFShockwaves();
    drawBossWarnings();
  }
  drawPhaseTransitionRings();
  drawCinematicWorldEffects(); // ground cracks + world-space cinematic fx
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

  // ---------- Phase: updateParticles (prevent memory leak: remove expired) ----------
  const _liveParticles = [];
  for (let i = 0; i < particles.length; i++) {
    const p = particles[i];
    p.x += p.vx; p.y += p.vy;
    p.vy += 0.12; p.vx *= 0.96;
    p.life--;
    if (p.life > 0) {
      _liveParticles.push(p);
      const a = p.life / p.maxLife;
      ctx.globalAlpha = Math.max(0, a);
      ctx.fillStyle   = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, Math.max(0.01, p.size * a), 0, Math.PI * 2);
      ctx.fill();
    } else {
      _recycleParticle(p);
    }
  }
  particles = _liveParticles; // keep only live (life > 0) to prevent leak
  ctx.globalAlpha = 1;

  // Damage texts — filter expired to prevent leak
  damageTexts.forEach(d => { d.update(); d.draw(); });
  damageTexts = damageTexts.filter(d => d.life > 0);

  // Respawn countdowns — filter expired to prevent leak
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

  screenShake *= 0.9; // decay-based shake (smoother than instant drop)
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
  // New chaos modifier notification
  if (_chaosModNotif && _chaosModNotif.timer > 0) {
    _chaosModNotif.timer--;
    const alpha = Math.min(1, _chaosModNotif.timer / 30);
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.font = 'bold 16px Arial';
    ctx.fillStyle = '#ff88ff';
    ctx.textAlign = 'center';
    ctx.shadowColor = '#ff00ff'; ctx.shadowBlur = 12;
    ctx.fillText('+ ' + _chaosModNotif.label, GAME_W / 2, GAME_H - 60);
    ctx.restore();
  }
  // Achievement popups (drawn over everything, in screen space)
  ctx.setTransform(1, 0, 0, 1, 0, 0); // reset transform for screen-space draw
  drawCinematicOverlay();
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

  // Matter.js ragdoll step (when enabled in settings)
  if (typeof ragdollStep === 'function') ragdollStep();

  // Debug overlay (drawn last, in screen-space)
  if (debugMode) {
    runSanityChecks();
    renderDebugOverlay(ctx);
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
  // Don't intercept keys when typing in chat or the game console input
  const chatFocused    = document.activeElement && document.activeElement.id === 'chatInput';
  const consoleFocused = document.activeElement && document.activeElement.id === 'gameConsoleInput';
  if (consoleFocused) return; // let console input receive all keystrokes unmodified
  if (!chatFocused && (e.key === 'Escape' || e.key === 'p' || e.key === 'P')) { pauseGame(); return; }
  // Cheat code: type TRUEFORM anywhere in menu to unlock True Form
  // GAMECONSOLE works any time (menu or in-game)
  if (e.key.length === 1) {
    _cheatBuffer = ((_cheatBuffer || '') + e.key.toUpperCase()).slice(-20);
    if (_cheatBuffer.endsWith('GAMECONSOLE')) {
      _cheatBuffer = '';
      openGameConsole();
    }
  }
  if (!gameRunning && e.key.length === 1) {
    // _cheatBuffer already updated above — just check for menu-only codes
    if (_cheatBuffer.endsWith('TRUEFORM')) {
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
    // MEGAKNIGHT cheat: type CLASSMEGAKNIGHT in menu
    if (_cheatBuffer.endsWith('CLASSMEGAKNIGHT')) {
      _cheatBuffer = '';
      unlockedMegaknight = true;
      localStorage.setItem('smc_megaknight', '1');
      ['p1Class','p2Class'].forEach(id => {
        const sel = document.getElementById(id);
        if (sel && !sel.querySelector('option[value="megaknight"]')) {
          const opt = document.createElement('option'); opt.value = 'megaknight'; opt.textContent = 'Class: Megaknight ★'; sel.appendChild(opt);
        }
      });
      const notif2 = document.createElement('div');
      notif2.textContent = '★ Class: MEGAKNIGHT UNLOCKED ★';
      notif2.style.cssText = 'position:fixed;top:20%;left:50%;transform:translateX(-50%);background:rgba(80,0,160,0.95);color:#fff;padding:14px 32px;border-radius:12px;font-size:1.2rem;font-weight:900;letter-spacing:2px;z-index:9999;pointer-events:none;text-align:center;box-shadow:0 0 40px #8844ff;';
      document.body.appendChild(notif2);
      setTimeout(() => notif2.remove(), 3000);
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
  if (activeCinematic) return; // freeze player controls during boss cinematics

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
      // Megaknight gets higher jump power
      const jumpPower = p.charClass === 'megaknight' ? -22 : -17;
      const dblPower  = p.charClass === 'megaknight' ? -16 : -13;
      if (p.onGround || (p.coyoteFrames > 0 && !p.canDoubleJump)) {
        // Ground jump (or coyote jump — briefly after walking off a platform)
        p.vy = jumpPower;
        p.canDoubleJump = true; // enable one double-jump after leaving ground
        p.coyoteFrames  = 0;   // consume coyote window
        if (p._rd) PlayerRagdoll.applyJump(p);
        spawnParticles(p.cx(), p.y + p.h, '#ffffff', 5);
        if (p.charClass === 'megaknight') spawnParticles(p.cx(), p.y + p.h, '#8844ff', 5);
        SoundManager.jump();
      } else if (p.canDoubleJump) {
        // Double jump in air
        p.vy = dblPower;
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
  const ok  = (t) => { if (msgEl) { msgEl.textContent = '✓ ' + t; msgEl.style.color = '#44ff88'; msgEl.style.fontSize = ''; } };
  const err = (t) => { if (msgEl) { msgEl.textContent = '✗ ' + t; msgEl.style.color = '#ff4444'; msgEl.style.fontSize = ''; } };

  if (code === 'TRUEFORM') {
    unlockedTrueBoss = true;
    localStorage.setItem('smc_trueform','1');
    const card = document.getElementById('modeTrueForm');
    if (card) card.style.display = '';
    ok('True Creator unlocked! Start a boss fight.');
  } else if (code === 'CLASSMEGAKNIGHT') {
    unlockedMegaknight = true;
    localStorage.setItem('smc_megaknight','1');
    ['p1Class','p2Class'].forEach(id => {
      const sel = document.getElementById(id);
      if (sel && !sel.querySelector('option[value="megaknight"]')) {
        const opt = document.createElement('option'); opt.value = 'megaknight'; opt.textContent = 'Class: Megaknight ★'; sel.appendChild(opt);
      }
    });
    ok('Megaknight class unlocked! Select it in the class dropdown.');
  } else if (code.startsWith('MAP:')) {
    const mapKey = code.slice(4).toLowerCase();
    if (!ARENAS[mapKey]) { err('Unknown arena. Try: grass lava space city forest ice ruins'); return; }
    if (gameRunning) {
      switchArena(mapKey);
      ok('Switched to ' + mapKey + ' arena!');
    } else {
      selectedArena = mapKey;
      document.querySelectorAll('.arena-card').forEach(c => c.classList.toggle('active', c.dataset.arena === mapKey));
      ok('Arena set to ' + mapKey + '!');
    }
  } else if (code.startsWith('WEAPON:')) {
    const wKey = code.slice(7).toLowerCase();
    if (!WEAPONS[wKey]) { err('Unknown weapon. Try: sword hammer gun axe spear bow shield scythe'); return; }
    if (gameRunning) {
      const p = players.find(pl => !pl.isAI && !pl.isBoss);
      if (p) { p.weaponKey = wKey; p.weapon = WEAPONS[wKey]; p.cooldown = 0; p.abilityCooldown = 0; }
      ok('Weapon changed to ' + wKey + '!');
    } else { err('Enter WEAPON: codes while in-game.'); }
  } else if (code.startsWith('CLASS:')) {
    const cKey = code.slice(6).toLowerCase();
    if (!CLASSES[cKey] && cKey !== 'megaknight') { err('Unknown class. Try: none thor kratos ninja gunner archer paladin berserker megaknight'); return; }
    if (gameRunning) {
      const p = players.find(pl => !pl.isAI && !pl.isBoss);
      if (p) applyClass(p, cKey);
      ok('Class changed to ' + cKey + '!');
    } else { err('Enter CLASS: codes while in-game.'); }
  } else if (code === 'GODMODE') {
    if (gameRunning) {
      const p = players.find(pl => !pl.isAI && !pl.isBoss);
      if (p) { p.invincible = 99999; p.health = p.maxHealth; }
      ok('GOD MODE — you cannot be hurt!');
    } else { err('Enter GODMODE while in-game.'); }
  } else if (code === 'FULLHEAL') {
    if (gameRunning) {
      players.filter(pl => !pl.isBoss).forEach(p => { p.health = p.maxHealth; spawnParticles(p.cx(), p.cy(), '#44ff88', 18); });
      ok('All players fully healed!');
    } else { err('Enter FULLHEAL while in-game.'); }
  } else if (code === 'SUPERJUMP') {
    if (gameRunning) {
      const p = players.find(pl => !pl.isAI && !pl.isBoss);
      if (p) { p.vy = -36; p.canDoubleJump = true; }
      ok('SUPER JUMP!');
    } else { err('Enter SUPERJUMP while in-game.'); }
  } else if (code === 'KILLBOSS') {
    if (gameRunning) {
      const boss = players.find(p => p.isBoss);
      if (boss) boss.health = 1;
      ok('Boss is nearly dead!');
    } else { err('Enter KILLBOSS while in-game.'); }
  } else if (code === 'HELP' || code === 'CODES') {
    if (msgEl) {
      msgEl.textContent = 'TRUEFORM · CLASSMEGAKNIGHT · GODMODE · FULLHEAL · SUPERJUMP · KILLBOSS · MAP:<arena> · WEAPON:<key> · CLASS:<key>';
      msgEl.style.color = '#aabbff'; msgEl.style.fontSize = '0.7rem';
    }
  } else {
    err('Unknown code. Type HELP for a list.');
  }
}
