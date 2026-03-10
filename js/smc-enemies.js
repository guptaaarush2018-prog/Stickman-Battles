'use strict';


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

function toggleTraining2P() {
  training2P = !training2P;
  const btn = document.getElementById('training2PBtn');
  if (btn) { btn.textContent = training2P ? '2P: ON' : '2P: OFF'; btn.classList.toggle('active', training2P); }
}

function spawnTrainingYeti() {
  if (!gameRunning || gameMode !== 'training') return;
  if (yeti && yeti.health > 0) return;
  yeti = new Yeti(450, 150);
  if (players[0]) players[0].target = yeti;
}

function spawnTrainingDummy() {
  if (!gameRunning || gameMode !== 'training') return;
  const d = new Dummy(300 + Math.random() * 300, 150);
  d.playerNum = trainingDummies.length + 3;
  d.name = 'DUMMY';
  trainingDummies.push(d);
}

let _creatorPlatforms  = [];
let _creatorHistory    = []; // undo stack: each entry = platforms snapshot before action
let _mcDragPlatform    = null;
let _mcDragOffX        = 0;
let _mcDragOffY        = 0;
let _mcDragOriginX     = 0;
let _mcDragOriginY     = 0;
let _mcEditorOpen      = false;

function toggleMapCreator() {
  const panel = document.getElementById('mapCreatorPanel');
  if (!panel) return;
  _mcEditorOpen = panel.style.display === 'none';
  panel.style.display = _mcEditorOpen ? 'block' : 'none';
}

// Convert client (screen) coords to game-world coords
function _mcScreenToGame(clientX, clientY) {
  const scX = (canvas.width  / GAME_W) * camZoomCur;
  const scY = (canvas.height / GAME_H) * camZoomCur;
  return {
    x: (clientX - canvas.width  / 2) / scX + camXCur,
    y: (clientY - canvas.height / 2) / scY + camYCur
  };
}

// Snapshot current platforms for undo
function _mcSnapshot() {
  if (!currentArena) return;
  _creatorHistory.push(currentArena.platforms.map(p => ({ ...p })));
  if (_creatorHistory.length > 50) _creatorHistory.shift();
}

function _mcRefreshCount() {
  const cnt = document.getElementById('mcCount');
  if (cnt) cnt.textContent = (_creatorPlatforms.length);
}

function addCreatorPlatform() {
  const x       = parseInt(document.getElementById('mcX')?.value)     || 200;
  const y       = parseInt(document.getElementById('mcY')?.value)     || 300;
  const w       = parseInt(document.getElementById('mcW')?.value)     || 150;
  const h       = parseInt(document.getElementById('mcH')?.value)     || 14;
  const color   = document.getElementById('mcColor')?.value           || null;
  const bouncy  = document.getElementById('mcBouncy')?.checked        || false;
  const moving  = document.getElementById('mcMoving')?.checked        || false;
  const oscX    = parseInt(document.getElementById('mcOscX')?.value)  || 60;
  const oscSpd  = parseFloat(document.getElementById('mcOscSpd')?.value) || 0.02;
  const isFloor = document.getElementById('mcFloor')?.checked         || false;
  _mcSnapshot();
  const pl = { x, y, w, h, isFloor, _creator: true };
  if (color && color !== '#888888') pl.color = color;
  if (bouncy) { pl.isBouncy = true; pl.naturalY = y; pl.sinkOffset = 0; pl.floatPhase = Math.random() * Math.PI * 2; }
  if (moving) { pl.ox = x; pl.oscX = oscX; pl.oscSpeed = oscSpd; pl.oscPhase = Math.random() * Math.PI * 2; pl.rx = x; pl.rTimer = 0; }
  _creatorPlatforms.push(pl);
  if (currentArena) currentArena.platforms.push(pl);
  _mcRefreshCount();
}

function clearCreatorPlatforms() {
  _mcSnapshot();
  if (currentArena) currentArena.platforms = currentArena.platforms.filter(p => !p._creator);
  _creatorPlatforms = [];
  _mcRefreshCount();
}

function clearAllPlatforms() {
  if (!confirm('Clear ALL platforms including the floor?')) return;
  _mcSnapshot();
  if (currentArena) currentArena.platforms = [];
  _creatorPlatforms = [];
  _mcRefreshCount();
}

function undoLastPlatform() {
  if (_creatorHistory.length === 0) return;
  const prev = _creatorHistory.pop();
  if (currentArena) currentArena.platforms = prev;
  _creatorPlatforms = prev.filter(p => p._creator);
  _mcRefreshCount();
}

function exportCreatorMap() {
  const all = currentArena ? currentArena.platforms : _creatorPlatforms;
  const json = JSON.stringify({ platforms: all.map(p => ({ x:p.x, y:p.y, w:p.w, h:p.h, isFloor:p.isFloor, color:p.color, isBouncy:p.isBouncy, oscX:p.oscX, oscSpeed:p.oscSpeed })) }, null, 2);
  const ta = document.getElementById('mcJSON');
  if (ta) ta.value = json;
  const blob = new Blob([json], { type:'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = 'sb_map.json'; a.click();
  URL.revokeObjectURL(url);
}

function importCreatorMap() {
  const ta = document.getElementById('mcJSON');
  if (!ta || !ta.value.trim()) return;
  try {
    const data = JSON.parse(ta.value);
    _mcSnapshot();
    clearCreatorPlatforms();
    (data.platforms || []).forEach(p => {
      const pl = { x: p.x, y: p.y, w: p.w || 150, h: p.h || 14, isFloor: !!p.isFloor, _creator: true };
      if (p.color) pl.color = p.color;
      if (p.isBouncy) { pl.isBouncy = true; pl.naturalY = p.y; pl.sinkOffset = 0; pl.floatPhase = 0; }
      if (p.oscX)  { pl.ox = p.x; pl.oscX = p.oscX; pl.oscSpeed = p.oscSpeed || 0.02; pl.oscPhase = 0; pl.rx = p.x; pl.rTimer = 0; }
      _creatorPlatforms.push(pl);
      if (currentArena) currentArena.platforms.push(pl);
    });
    _mcRefreshCount();
  } catch(e) { alert('Invalid JSON: ' + e.message); }
}

// ---- Weapon Creator ----
function createCustomWeapon() {
  const name  = document.getElementById('wcName')?.value?.trim()         || 'Custom';
  const dmg   = parseInt(document.getElementById('wcDmg')?.value)         || 10;
  const range = parseInt(document.getElementById('wcRange')?.value)       || 60;
  const cd    = parseInt(document.getElementById('wcCd')?.value)          || 30;
  const kb    = parseInt(document.getElementById('wcKb')?.value)          || 8;
  const type  = document.getElementById('wcType')?.value                  || 'melee';
  const abilDmg = parseInt(document.getElementById('wcAbilDmg')?.value)   || 20;
  const key   = 'cw_' + name.toLowerCase().replace(/\s+/g,'_') + '_' + Date.now();
  WEAPONS[key] = {
    name, damage: dmg, range, cooldown: cd, kb, type,
    abilityCooldown: 150, abilityName: name + ' Strike',
    ability(user, tgt) {
      if (!tgt || tgt.health <= 0) return;
      if (dist(user, tgt) < range * 1.5) dealDamage(user, tgt, abilDmg, kb * 1.5);
    }
  };
  // Add to all weapon selects
  document.querySelectorAll('select[id$="Weapon"]').forEach(sel => {
    if (!sel.querySelector(`option[value="${key}"]`)) {
      const opt = document.createElement('option');
      opt.value = key; opt.textContent = '★ ' + name;
      sel.appendChild(opt);
    }
  });
  const status = document.getElementById('wcStatus');
  if (status) { status.textContent = `✅ "${name}" added to weapon list!`; setTimeout(() => { status.textContent = ''; }, 3000); }
}

// ---- Drag support for platforms ----
canvas.addEventListener('mousedown', (e) => {
  if (!_mcEditorOpen || !gameRunning || !currentArena) return;
  const gp = _mcScreenToGame(e.clientX, e.clientY);
  // find topmost platform under cursor
  for (let i = currentArena.platforms.length - 1; i >= 0; i--) {
    const pl = currentArena.platforms[i];
    if (gp.x >= pl.x && gp.x <= pl.x + pl.w && gp.y >= pl.y && gp.y <= pl.y + pl.h) {
      _mcSnapshot();
      _mcDragPlatform = pl;
      _mcDragOffX = gp.x - pl.x;
      _mcDragOffY = gp.y - pl.y;
      _mcDragOriginX = pl.x;
      _mcDragOriginY = pl.y;
      e.preventDefault();
      return;
    }
  }
});

canvas.addEventListener('mousemove', (e) => {
  if (!_mcDragPlatform) return;
  const gp = _mcScreenToGame(e.clientX, e.clientY);
  _mcDragPlatform.x = Math.round(gp.x - _mcDragOffX);
  _mcDragPlatform.y = Math.round(gp.y - _mcDragOffY);
  if (_mcDragPlatform.ox !== undefined) _mcDragPlatform.ox = _mcDragPlatform.x;
  if (_mcDragPlatform.naturalY !== undefined) _mcDragPlatform.naturalY = _mcDragPlatform.y;
  // Sync input fields if this is the only selected platform
  const xEl = document.getElementById('mcX'); if (xEl) xEl.value = _mcDragPlatform.x;
  const yEl = document.getElementById('mcY'); if (yEl) yEl.value = _mcDragPlatform.y;
});

canvas.addEventListener('mouseup', () => {
  if (_mcDragPlatform) {
    // If barely moved, pop the snapshot (no meaningful change)
    if (Math.abs(_mcDragPlatform.x - _mcDragOriginX) < 2 && Math.abs(_mcDragPlatform.y - _mcDragOriginY) < 2) {
      _creatorHistory.pop();
    }
    _mcDragPlatform = null;
  }
});

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
