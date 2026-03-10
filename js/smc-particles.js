'use strict';

// ============================================================
// HELPERS
// ============================================================
function randChoice(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
function lerp(a, b, t)   { return a + (b - a) * t; }
function clamp(v, mn, mx){ return Math.max(mn, Math.min(mx, v)); }
function dist(a, b)      { return Math.hypot(a.cx() - b.cx(), (a.y + a.h/2) - (b.y + b.h/2)); }

function dealDamage(attacker, target, dmg, kbForce, stunMult = 1.0, isSplash = false) {
  if (!target || target.invincible > 0 || target.health <= 0) return;
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
    // Brief camera zoom-in on heavy hits
    if (actualDmg >= 18) camHitZoomTimer = 15;
  }
  // Boss modifier: deals double KB, takes half KB
  if (attacker && attacker.kbBonus) actualKb = Math.round(actualKb * attacker.kbBonus);
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
  // Soccer: players take no health damage but still feel KB/stun
  if (gameMode === 'minigames' && minigameType === 'soccer') actualDmg = 0;
  // Online: if attacker is local and target is remote, send hit event to server
  // The remote client will apply the damage to themselves
  if (onlineMode && attacker && !attacker.isRemote && target && target.isRemote) {
    NetworkManager.sendHit(actualDmg, actualKb, actualKb > 0 ? (target.cx() > attacker.cx() ? 1 : -1) : 0);
  }
  target.health    = Math.max(0, target.health - actualDmg);
  target.invincible = 16;
  // True Form combo damage tracking
  if (attacker && attacker.isTrueForm && !target.isBoss) {
    attacker._comboDamage = (attacker._comboDamage || 0) + actualDmg;
  }
  const dir        = attacker ? (target.cx() > attacker.cx() ? 1 : -1) : 1;
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
    // Bot kill / PvP damage tracking
    if (attacker && !attacker.isBoss && !attacker.isAI && gameRunning) {
      if (target.isAI && target.health <= 0) _achStats.botKills = (_achStats.botKills || 0) + 1;
      if (!attacker.isAI && !target.isAI && !attacker.isBoss && !target.isBoss) {
        _achStats.pvpDamageDealt = (_achStats.pvpDamageDealt || 0) + actualDmg;
      }
    }
    if (target && !target.isAI && !target.isBoss && attacker && attacker.isAI && gameRunning) {
      _achStats.pvpDamageReceived = (_achStats.pvpDamageReceived || 0) + actualDmg;
    }
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
    // Per-limb spring reaction
    if (target._rd) {
      const impactX = attacker ? attacker.cx() : target.cx();
      const impactY = attacker ? attacker.cy() : target.cy();
      PlayerRagdoll.applyHit(target, dir * actualKb, -actualKb * 0.55, impactX, impactY);
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

// ============================================================
// PARTICLE POOL — reuses particle objects to reduce GC pressure
// ============================================================
const MAX_PARTICLES = 250;
const _particlePool = [];   // recycled particle objects

function _getParticle() {
  // Recycle from pool first
  if (_particlePool.length > 0) return _particlePool.pop();
  return {};
}

function _recycleParticle(p) {
  if (_particlePool.length < 300) _particlePool.push(p);
}

function spawnParticles(x, y, color, count) {
  if (!settings.particles) return;
  // Enforce cap: if over max, skip new particles
  if (particles.length >= MAX_PARTICLES) return;
  const toSpawn = Math.min(count, MAX_PARTICLES - particles.length);
  for (let i = 0; i < toSpawn; i++) {
    const a = Math.random() * Math.PI * 2;
    const s = 1.5 + Math.random() * 5;
    const p = _getParticle();
    p.x = x; p.y = y;
    p.vx = Math.cos(a) * s; p.vy = Math.sin(a) * s;
    p.color = color;
    p.size = 1.5 + Math.random() * 2.5;
    p.life = 18 + Math.random() * 22;
    p.maxLife = 40;
    particles.push(p);
  }
}

function spawnRing(x, y) {
  if (!settings.particles) return;
  const ringCount = Math.min(18, MAX_PARTICLES - particles.length);
  for (let i = 0; i < ringCount; i++) {
    const a = (i / 18) * Math.PI * 2;
    const _p = _getParticle();
    _p.x = x; _p.y = y; _p.vx = Math.cos(a)*7; _p.vy = Math.sin(a)*3.5;
    _p.color = '#ff8800'; _p.size = 3; _p.life = 14; _p.maxLife = 14;
    particles.push(_p);
  }
}

function checkWeaponSparks() {
  if (!settings.particles) return;
  const pool = [...players, ...minions, ...(trainingDummies || [])].filter(f => f.health > 0 && f.attackTimer > 0 && f.weapon && f.weapon.type === 'melee');
  const all = pool.map(f => {
    const tip = f._weaponTip || (f.getWeaponTipPos && f.getWeaponTipPos());
    return tip ? { f, tip: { x: tip.x, y: tip.y, attacking: true } } : null;
  }).filter(Boolean);
  for (let i = 0; i < all.length; i++) {
    for (let j = i + 1; j < all.length; j++) {
      const a = all[i], b = all[j];
      if (!a.tip.attacking || !b.tip.attacking) continue;
      if ((a.f._weaponClashCd || 0) > 0 || (b.f._weaponClashCd || 0) > 0) continue;
      const dx = a.tip.x - b.tip.x;
      const dy = a.tip.y - b.tip.y;
      if (dx * dx + dy * dy < 28 * 28) {
        const mx = (a.tip.x + b.tip.x) / 2;
        const my = (a.tip.y + b.tip.y) / 2;
        for (let s = 0; s < 10 && particles.length < MAX_PARTICLES; s++) {
          const sa = Math.random() * Math.PI * 2;
          const sv = 2 + Math.random() * 5;
          const _p = _getParticle();
          _p.x = mx; _p.y = my; _p.vx = Math.cos(sa) * sv; _p.vy = Math.sin(sa) * sv - 1;
          _p.color = s < 5 ? '#ffffff' : '#ffdd44'; _p.size = 1.5 + Math.random() * 2; _p.life = 8; _p.maxLife = 8;
          particles.push(_p);
        }
        screenShake = Math.max(screenShake, 3);
        const nx = dx === 0 ? 1 : dx / Math.sqrt(dx * dx + dy * dy);
        a.f.vx += nx * 2; b.f.vx -= nx * 2;
        a.f._weaponClashCd = 20; b.f._weaponClashCd = 20;
        if (!a.f.isAI || !b.f.isAI) unlockAchievement('clash_master');
      }
    }
  }
  // Decrement clash cooldowns
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
// DANGER HEATMAP — grid-based environmental hazard awareness
// Rebuilt once per frame; bots sample it to steer away from danger.
// ============================================================
const HMAP_COLS = 45;   // GAME_W / 20 ≈ 45 columns
const HMAP_ROWS = 26;   // GAME_H / 20 ≈ 26 rows
const HMAP_CELL = 20;   // world-units per cell

let _heatmap   = new Float32Array(HMAP_COLS * HMAP_ROWS);
let _heatFrame = -1;    // last frameCount when heatmap was rebuilt

/** Write danger value into one cell (takes the max of existing value). */
function _heatSet(col, row, val) {
  if (col < 0 || col >= HMAP_COLS || row < 0 || row >= HMAP_ROWS) return;
  const idx = row * HMAP_COLS + col;
  if (val > _heatmap[idx]) _heatmap[idx] = val;
}

/** Radial splat — write danger fading outward from world-point (wx, wy). */
function _heatSplat(wx, wy, radiusPx, peakVal) {
  const cr = Math.ceil(radiusPx / HMAP_CELL);
  const cc = Math.floor(wx / HMAP_CELL);
  const rc = Math.floor(wy / HMAP_CELL);
  for (let dr = -cr; dr <= cr; dr++) {
    for (let dc = -cr; dc <= cr; dc++) {
      const worldDx = dc * HMAP_CELL;
      const worldDy = dr * HMAP_CELL;
      const worldD  = Math.hypot(worldDx, worldDy);
      if (worldD <= radiusPx) {
        _heatSet(cc + dc, rc + dr, peakVal * (1 - worldD / radiusPx));
      }
    }
  }
}

/**
 * Sample danger value [0–1] at a world-space position.
 * Returns 0.95 for positions outside the game world.
 */
function heatAt(wx, wy) {
  const col = Math.floor(wx / HMAP_CELL);
  const row = Math.floor(wy / HMAP_CELL);
  if (col < 0 || col >= HMAP_COLS || row < 0 || row >= HMAP_ROWS) return 0.95;
  return _heatmap[row * HMAP_COLS + col];
}

/**
 * Rebuild the heatmap from current arena hazards.
 * Guard: no-op if already rebuilt this frame (safe to call from multiple bots).
 */
function updateHeatmap() {
  if (_heatFrame === frameCount) return;
  _heatFrame = frameCount;
  _heatmap.fill(0);

  const a = currentArena;
  if (!a) return;

  // --- Screen / map edges: high danger near left & right walls ---
  for (let row = 0; row < HMAP_ROWS; row++) {
    _heatSet(0, row, 0.80); _heatSet(1, row, 0.55); _heatSet(2, row, 0.30);
    _heatSet(HMAP_COLS - 1, row, 0.80);
    _heatSet(HMAP_COLS - 2, row, 0.55);
    _heatSet(HMAP_COLS - 3, row, 0.30);
  }

  // --- Bottom of screen: approaching death boundary ---
  const deathRow = Math.min(HMAP_ROWS - 1, Math.floor(((a.deathY || 640)) / HMAP_CELL));
  for (let col = 0; col < HMAP_COLS; col++) {
    for (let dr = 0; dr <= 5; dr++) {
      const row = Math.max(0, deathRow - dr);
      _heatSet(col, row, Math.min(0.95, 0.18 + dr * 0.16));
    }
  }

  // --- Lava floor (lava arena) ---
  if (a.hasLava && a.lavaY) {
    const lavaRow = Math.floor(a.lavaY / HMAP_CELL);
    for (let col = 0; col < HMAP_COLS; col++) {
      _heatSet(col, lavaRow,     1.00);
      _heatSet(col, lavaRow - 1, 0.88);
      _heatSet(col, lavaRow - 2, 0.68);
      _heatSet(col, lavaRow - 3, 0.44);
      _heatSet(col, lavaRow - 4, 0.24);
      _heatSet(col, lavaRow - 5, 0.10);
    }
  }

  // --- Boss arena floor hazard (lava or void floor removal) ---
  if (a.isBossArena) {
    if (bossFloorState === 'hazard') {
      const floorPl = a.platforms.find(p => p.isFloor);
      if (floorPl && floorPl.isFloorDisabled) {
        const floorRow = Math.floor(floorPl.y / HMAP_CELL);
        for (let col = 0; col < HMAP_COLS; col++) {
          _heatSet(col, floorRow,     1.00);
          _heatSet(col, floorRow + 1, 0.90);
          _heatSet(col, floorRow - 1, 0.72);
          _heatSet(col, floorRow - 2, 0.46);
          _heatSet(col, floorRow - 3, 0.22);
        }
      }
    } else if (bossFloorState === 'warning') {
      // Warning: lower danger but bots should start repositioning
      const floorPl = a.platforms.find(p => p.isFloor);
      if (floorPl) {
        const floorRow = Math.floor(floorPl.y / HMAP_CELL);
        for (let col = 0; col < HMAP_COLS; col++) {
          _heatSet(col, floorRow, 0.38);
          _heatSet(col, floorRow - 1, 0.20);
        }
      }
    }
  }

  // --- Boss beams (warning = moderate, active = very high) ---
  for (const beam of bossBeams) {
    const bCol = Math.floor(beam.x / HMAP_CELL);
    const val  = beam.phase === 'active' ? 1.00 : 0.50;
    const spread = beam.phase === 'active' ? 2 : 1;
    for (let row = 0; row < HMAP_ROWS; row++) {
      for (let dc = -spread; dc <= spread; dc++) {
        const falloff = 1 - Math.abs(dc) / (spread + 1);
        _heatSet(bCol + dc, row, val * falloff);
      }
    }
  }

  // --- TrueForm black holes ---
  for (const bh of tfBlackHoles) {
    _heatSplat(bh.x, bh.y, bh.r * 2.8, 0.92);
  }

  // --- Active projectiles (radial danger bubble) ---
  for (const pr of projectiles) {
    _heatSplat(pr.x, pr.y, 44, 0.45);
  }

  // --- TrueForm gravity: entire arena is lower danger if inverted (bots ignore ceiling-fall risk) ---
  // (no change needed — the bottom death row captures it)
}

// ============================================================
// VERLET RAGDOLL — position-based dynamics for death animation
// ============================================================

class VerletPoint {
  constructor(x, y) {
    this.x = x; this.y = y;
    this.ox = x; this.oy = y; // old position for Verlet
    this.pinned = false;
  }
  // Verlet integration step
  integrate(gravity = 0.55) {
    if (this.pinned) return;
    const vx = (this.x - this.ox) * 0.98; // friction
    const vy = (this.y - this.oy) * 0.98;
    this.ox = this.x; this.oy = this.y;
    this.x += vx;
    this.y += vy + gravity;
  }
  // Apply impulse
  impulse(ix, iy) { this.ox -= ix; this.oy -= iy; }
}

class VerletStick {
  constructor(a, b, len) {
    this.a = a; this.b = b;
    this.len = len ?? Math.hypot(b.x - a.x, b.y - a.y);
  }
  constrain() {
    const dx = this.b.x - this.a.x;
    const dy = this.b.y - this.a.y;
    const dist = Math.hypot(dx, dy) || 0.001;
    const diff = (dist - this.len) / dist * 0.5;
    if (!this.a.pinned) { this.a.x += dx * diff; this.a.y += dy * diff; }
    if (!this.b.pinned) { this.b.x -= dx * diff; this.b.y -= dy * diff; }
  }
}

class VerletRagdoll {
  constructor(fighter) {
    const f = fighter;
    const cx = f.cx(), cy = f.cy();
    const h = f.h;

    // Joint positions relative to fighter center
    this.head     = new VerletPoint(cx, cy - h * 0.38);
    this.neck     = new VerletPoint(cx, cy - h * 0.25);
    this.lShoulder= new VerletPoint(cx - 12, cy - h * 0.18);
    this.rShoulder= new VerletPoint(cx + 12, cy - h * 0.18);
    this.lElbow   = new VerletPoint(cx - 22, cy - h * 0.04);
    this.rElbow   = new VerletPoint(cx + 22, cy - h * 0.04);
    this.lHand    = new VerletPoint(cx - 26, cy + h * 0.10);
    this.rHand    = new VerletPoint(cx + 26, cy + h * 0.10);
    this.lHip     = new VerletPoint(cx - 8,  cy + h * 0.06);
    this.rHip     = new VerletPoint(cx + 8,  cy + h * 0.06);
    this.lKnee    = new VerletPoint(cx - 10, cy + h * 0.25);
    this.rKnee    = new VerletPoint(cx + 10, cy + h * 0.25);
    this.lFoot    = new VerletPoint(cx - 10, cy + h * 0.42);
    this.rFoot    = new VerletPoint(cx + 10, cy + h * 0.42);

    this.points = [
      this.head, this.neck,
      this.lShoulder, this.rShoulder,
      this.lElbow, this.rElbow, this.lHand, this.rHand,
      this.lHip, this.rHip,
      this.lKnee, this.rKnee, this.lFoot, this.rFoot,
    ];

    // Sticks (bones) — each enforces a constant distance
    this.sticks = [
      new VerletStick(this.head,     this.neck),       // spine-neck
      new VerletStick(this.neck,     this.lShoulder),
      new VerletStick(this.neck,     this.rShoulder),
      new VerletStick(this.lShoulder,this.lElbow),
      new VerletStick(this.lElbow,   this.lHand),
      new VerletStick(this.rShoulder,this.rElbow),
      new VerletStick(this.rElbow,   this.rHand),
      new VerletStick(this.lShoulder,this.lHip),       // torso left
      new VerletStick(this.rShoulder,this.rHip),       // torso right
      new VerletStick(this.lHip,     this.rHip),       // pelvis
      new VerletStick(this.lHip,     this.lKnee),
      new VerletStick(this.lKnee,    this.lFoot),
      new VerletStick(this.rHip,     this.rKnee),
      new VerletStick(this.rKnee,    this.rFoot),
      new VerletStick(this.lShoulder,this.rShoulder),  // shoulder girdle
      new VerletStick(this.neck,     this.lHip),       // diagonal stabilizer
      new VerletStick(this.neck,     this.rHip),       // diagonal stabilizer
    ];

    // Apply initial death impulse from the fighter's current velocity
    const ivx = (f.vx || 0) * 0.6;
    const ivy = (f.vy || 0) * 0.5 - 2;
    const spin = (f.ragdollSpin || 0) * 14;
    this.points.forEach(p => {
      p.impulse(-ivx + (Math.random() - 0.5) * 2, -ivy + (Math.random() - 0.5) * 2);
      // Apply spin: offset from center causes rotation
      const rx = p.x - cx, ry = p.y - cy;
      p.impulse(-spin * ry * 0.012, spin * rx * 0.012);
    });

    this.color  = f.color || '#aaaaaa';
    const RAGDOLL_LIFETIME_FRAMES = 240; // despawn after ~4s to prevent accumulation
    this.timer  = RAGDOLL_LIFETIME_FRAMES;
    this.alpha  = 1;
    this.floorY = 460;   // default floor Y; updated from arena
  }

  update() {
    this.timer--;
    if (this.timer < 60) this.alpha = this.timer / 60;

    // Integrate all points
    this.points.forEach(p => p.integrate(0.55));

    // Constraint iterations (7 per frame prevents collapse)
    for (let iter = 0; iter < 7; iter++) {
      this.sticks.forEach(s => s.constrain());
      this._groundCollide();
    }
  }

  _groundCollide() {
    // Use arena platforms for collision
    const plats = currentArena?.platforms || [];
    this.points.forEach(p => {
      // Arena floor fallback
      if (p.y > this.floorY) {
        p.y = this.floorY;
        p.oy = p.y + (p.y - p.oy) * 0.35; // bounce damp
        p.ox = p.ox + (p.x - p.ox) * 0.25; // floor friction
      }
      // Screen sides
      if (p.x < 0)       { p.x = 0;       p.ox = p.x + (p.x - p.ox) * 0.4; }
      if (p.x > GAME_W)  { p.x = GAME_W;  p.ox = p.x + (p.x - p.ox) * 0.4; }
      // Platform surfaces (only top collision)
      for (const pl of plats) {
        if (pl.isFloorDisabled) continue;
        if (p.x > pl.x && p.x < pl.x + pl.w && p.y > pl.y && p.y < pl.y + pl.h + 12) {
          p.y = pl.y;
          p.oy = p.y + (p.y - p.oy) * 0.35;
          p.ox = p.ox + (p.x - p.ox) * 0.25;
        }
      }
    });
  }

  draw() {
    ctx.save();
    ctx.globalAlpha = this.alpha;
    ctx.strokeStyle = this.color;
    ctx.lineCap = 'round';

    // Draw bones (sticks)
    for (const s of this.sticks) {
      ctx.lineWidth = s === this.sticks[0] ? 3.5 : 2;
      ctx.beginPath();
      ctx.moveTo(s.a.x, s.a.y);
      ctx.lineTo(s.b.x, s.b.y);
      ctx.stroke();
    }

    // Head circle
    ctx.beginPath();
    ctx.arc(this.head.x, this.head.y, 7, 0, Math.PI * 2);
    ctx.fillStyle = this.color;
    ctx.fill();

    ctx.restore();
  }

  isDone() { return this.timer <= 0; }
}

// ============================================================
// PLAYER RAGDOLL — per-limb spring-damper physics
//
// Each limb (rArm, lArm, rLeg, lLeg, head, torso) carries:
//   angle (radians) — current draw angle
//   vel   (rad/frame) — angular velocity
//
// Every frame: spring pulls angle toward naturalPose(state),
// damping bleeds energy. Hit reactions apply impulses directly
// to the affected limb + sympathetic limbs.
//
// API:
//   PlayerRagdoll.createRagdoll(f)       — attach ragdoll to fighter
//   PlayerRagdoll.updateLimbs(f)         — spring-step each frame
//   PlayerRagdoll.applyHit(f, fx, fy, ix, iy) — directional hit impulse
//   PlayerRagdoll.applyJump(f)           — jump kick impulse
//   PlayerRagdoll.applyMovement(f)       — lean into movement
//   PlayerRagdoll.collapse(f)            — knockout (max floppiness)
//   PlayerRagdoll.standUp(f)             — respawn recovery ramp
//   PlayerRagdoll.debugDraw(f, cx, sy, hy) — joint overlay (window.rdDebug=true)
// ============================================================
class PlayerRagdoll {

  /** Attach ragdoll state to a fighter (idempotent). */
  static createRagdoll(f) {
    if (f._rd) return f._rd;
    f._rd = {
      rArm:  { angle: Math.PI * 0.58, vel: 0 },
      lArm:  { angle: Math.PI * 0.42, vel: 0 },
      rLeg:  { angle: Math.PI * 0.62, vel: 0 },
      lLeg:  { angle: Math.PI * 0.38, vel: 0 },
      head:  { angle: 0,              vel: 0 },
      torso: { angle: 0,              vel: 0 },
      // State flags
      collapsed:     false,   // knockout — near-zero stiffness
      recovering:    false,   // slowly ramping stiffness back up
      recoveryTimer: 0,       // 0-90 frames
      // Physics constants (overridden by collapse/standUp)
      stiffness: 0.18,        // spring strength toward natural pose
      damping:   0.82,        // velocity decay per frame
    };
    return f._rd;
  }

  // ---- Frame update ----

  /**
   * Advance the spring-damper simulation one frame.
   * Computes the natural pose for the fighter's current state,
   * then pulls each limb angle toward it with spring + damping.
   */
  static updateLimbs(f) {
    const rd = f._rd;
    if (!rd) return;

    // Recovery: ramp stiffness from near-zero back to normal over 90 frames
    if (rd.recovering) {
      rd.recoveryTimer++;
      if (rd.recoveryTimer >= 90) {
        rd.collapsed     = false;
        rd.recovering    = false;
        rd.recoveryTimer = 0;
        rd.stiffness     = 0.18;
        rd.damping       = 0.82;
      }
    }

    // Effective spring constant: collapsed → very loose; recovering → ramping
    const k = rd.collapsed
      ? 0.004
      : rd.recovering
        ? 0.004 + (rd.stiffness - 0.004) * (rd.recoveryTimer / 90)
        : rd.stiffness;
    const d = rd.collapsed ? 0.89 : rd.damping;

    const pose = PlayerRagdoll._naturalPose(f);
    for (const limb of ['rArm', 'lArm', 'rLeg', 'lLeg', 'head', 'torso']) {
      const jt  = rd[limb];
      jt.vel   += (pose[limb] - jt.angle) * k;   // spring force
      jt.vel   *= d;                               // damping
      jt.angle += jt.vel;                          // integrate
    }
  }

  // ---- Natural pose by animation state ----

  /**
   * Returns target { rArm, lArm, rLeg, lLeg, head, torso } angles (radians)
   * for the fighter's current state.  The spring system pulls limbs here.
   */
  static _naturalPose(f) {
    const s    = f.state;
    const t    = f.animTimer;
    const face = f.facing;
    const rd   = f._rd;

    // Collapsed (dead / knocked out): fully limp on the ground
    if (rd && rd.collapsed) {
      return {
        rArm:  Math.PI * 0.88,
        lArm:  Math.PI * 0.12,
        rLeg:  Math.PI * 0.74,
        lLeg:  Math.PI * 0.26,
        head:  0.36 * (face > 0 ? 1 : -1),
        torso: 0.14,
      };
    }

    // Ragdoll hit-flung: limbs trail loosely
    if (s === 'ragdoll') {
      return {
        rArm:  Math.PI * 0.92,
        lArm:  Math.PI * 0.08,
        rLeg:  Math.PI * 0.76,
        lLeg:  Math.PI * 0.24,
        head:  0,
        torso: 0,
      };
    }

    // Stunned: limp arms, slightly open stance
    if (s === 'stunned') {
      const sw = Math.sin(t * 0.06) * 0.05;
      return {
        rArm:  Math.PI * 0.76 + sw,
        lArm:  Math.PI * 0.24 - sw,
        rLeg:  Math.PI * 0.60,
        lLeg:  Math.PI * 0.40,
        head:  Math.sin(t * 0.07) * 0.10,
        torso: 0,
      };
    }

    // Hurt: arms pulled back, cringe
    if (s === 'hurt') {
      return {
        rArm:  Math.PI * 0.72,
        lArm:  Math.PI * 0.28,
        rLeg:  Math.PI * 0.58,
        lLeg:  Math.PI * 0.42,
        head:  -0.12,
        torso: 0,
      };
    }

    // Attacking: forward swing (direction-aware)
    if (s === 'attacking') {
      const p = f.attackDuration > 0 ? 1 - f.attackTimer / f.attackDuration : 0;
      return face > 0
        ? { rArm: lerp(-0.45, 1.1, p), lArm: lerp(Math.PI * 0.80, Math.PI * 0.55, p),
            rLeg: Math.PI * 0.55,      lLeg: Math.PI * 0.45,
            head: -0.08, torso: -0.06 * p }
        : { rArm: lerp(Math.PI + 0.45, Math.PI - 1.1, p), lArm: lerp(Math.PI * 0.20, Math.PI * 0.45, p),
            rLeg: Math.PI * 0.55, lLeg: Math.PI * 0.45,
            head: -0.08, torso: 0.06 * p };
    }

    // Walking: counter-swinging arms and legs
    if (s === 'walking') {
      const sw = Math.sin(t * 0.24) * 0.52;
      return {
        rArm:  Math.PI * 0.58 + sw,
        lArm:  Math.PI * 0.42 - sw,
        rLeg:  Math.PI * 0.50 + sw * 0.85,
        lLeg:  Math.PI * 0.50 - sw * 0.85,
        head:  Math.sin(t * 0.24) * 0.03,
        torso: 0,
      };
    }

    if (s === 'jumping') {
      return { rArm: -0.25, lArm: Math.PI + 0.25, rLeg: Math.PI * 0.65, lLeg: Math.PI * 0.35, head: -0.10, torso: -0.04 };
    }

    if (s === 'falling') {
      return { rArm: -0.10, lArm: Math.PI + 0.10, rLeg: Math.PI * 0.56, lLeg: Math.PI * 0.44, head: 0.06, torso: 0.03 };
    }

    if (s === 'shielding') {
      return {
        rArm: face > 0 ? -0.25 : Math.PI + 0.25,
        lArm: face > 0 ? -0.55 : Math.PI + 0.55,
        rLeg: Math.PI * 0.60, lLeg: Math.PI * 0.40,
        head: 0, torso: 0,
      };
    }

    // Idle (default): gentle breath oscillation
    const b = Math.sin(t * 0.045) * 0.045;
    return {
      rArm:  Math.PI * 0.58 + b,
      lArm:  Math.PI * 0.42 - b,
      rLeg:  Math.PI * 0.62,
      lLeg:  Math.PI * 0.38,
      head:  Math.sin(t * 0.025) * 0.03,
      torso: 0,
    };
  }

  // ---- Hit reactions ----

  /**
   * Apply a directional impulse to the limb at the impact position.
   * Nearby limbs receive smaller sympathetic impulses.
   * @param {Fighter} f
   * @param {number}  forceX  world-space horizontal force (± = direction)
   * @param {number}  forceY  world-space vertical force
   * @param {number}  impactX world-space X of impact
   * @param {number}  impactY world-space Y of impact
   */
  static applyHit(f, forceX, forceY, impactX, impactY) {
    const rd    = PlayerRagdoll.createRagdoll(f);
    const mag   = Math.hypot(forceX, forceY);
    const scale = Math.min(mag * 0.012, 0.55);   // cap: prevents spinning forever
    const sign  = forceX >= 0 ? 1 : -1;

    // Classify impact region (0 = top of fighter, f.h = bottom)
    const relY       = impactY - f.y;
    const headZone   = relY < f.h * 0.22;
    const torsoZone  = relY < f.h * 0.55;
    const rightSide  = impactX > f.cx();

    if (headZone) {
      // Head struck: large head flick, arms snap sympathetically
      rd.head.vel  += sign * scale * 1.55;
      rd.torso.vel += sign * scale * 0.48;
      rd.rArm.vel  += sign * scale * 0.38;
      rd.lArm.vel  -= sign * scale * 0.22;
    } else if (torsoZone) {
      // Torso struck: body rotates, near-side arm flung out
      rd.torso.vel += sign * scale * 0.88;
      if (rightSide) { rd.rArm.vel += scale * 1.30; rd.lArm.vel -= scale * 0.28; }
      else            { rd.lArm.vel += scale * 1.30; rd.rArm.vel -= scale * 0.28; }
      rd.rLeg.vel  += sign * scale * 0.22;
    } else {
      // Leg struck: near-side leg kicked, torso wobbles upward
      if (rightSide) { rd.rLeg.vel += scale * 1.45; rd.lLeg.vel -= scale * 0.18; }
      else            { rd.lLeg.vel += scale * 1.45; rd.rLeg.vel -= scale * 0.18; }
      rd.torso.vel += sign * scale * 0.32;
      rd.head.vel  += sign * scale * 0.16;
    }
  }

  // ---- State transitions ----

  /** Knockout: all joint springs near-zero — fighter flops freely. */
  static collapse(f) {
    const rd = PlayerRagdoll.createRagdoll(f);
    rd.collapsed     = true;
    rd.recovering    = false;
    rd.recoveryTimer = 0;
    rd.stiffness     = 0.003;
    rd.damping       = 0.88;
    // Random tumble impulse to each limb
    for (const limb of ['rArm', 'lArm', 'rLeg', 'lLeg', 'head', 'torso']) {
      rd[limb].vel += (Math.random() - 0.5) * 0.50;
    }
  }

  /** Recovery: ramp stiffness back up over 90 frames — fighter stands up. */
  static standUp(f) {
    const rd = PlayerRagdoll.createRagdoll(f);
    rd.collapsed     = false;
    rd.recovering    = true;
    rd.recoveryTimer = 0;
    rd.stiffness     = 0.20;
    rd.damping       = 0.84;
  }

  /** Lean torso + arms slightly into movement direction. */
  static applyMovement(f) {
    if (!f._rd) return;
    const lean = f.vx > 0.5 ? 0.03 : f.vx < -0.5 ? -0.03 : 0;
    f._rd.torso.vel += lean;
  }

  /** Jump impulse: arms sweep upward, legs kick out. */
  static applyJump(f) {
    const rd = PlayerRagdoll.createRagdoll(f);
    rd.rArm.vel  -= 0.28;
    rd.lArm.vel  -= 0.28;
    rd.rLeg.vel  -= 0.16;
    rd.lLeg.vel  += 0.16;
    rd.torso.vel -= 0.09;
    rd.head.vel  -= 0.06;
  }

  // ---- Debug ----

  /**
   * Draw joint angle vectors + state info over the fighter.
   * Enable: window.rdDebug = true
   */
  static debugDraw(f, cx, shoulderY, hipY) {
    if (!f._rd || !window.rdDebug) return;
    const rd = f._rd;
    ctx.save();
    ctx.globalAlpha = 0.65;
    const R = 11;
    const joints = [
      { j: rd.rArm,  x: cx, y: shoulderY, color: '#ff4488', label: 'rA' },
      { j: rd.lArm,  x: cx, y: shoulderY, color: '#44aaff', label: 'lA' },
      { j: rd.rLeg,  x: cx, y: hipY,      color: '#ff8800', label: 'rL' },
      { j: rd.lLeg,  x: cx, y: hipY,      color: '#88ff00', label: 'lL' },
      { j: rd.torso, x: cx, y: (shoulderY + hipY) / 2, color: '#ffff00', label: 'T' },
      { j: rd.head,  x: cx, y: shoulderY - 14,         color: '#ffffff', label: 'H' },
    ];
    for (const jt of joints) {
      // Arc showing angle range
      ctx.strokeStyle = jt.color;
      ctx.lineWidth   = 1.2;
      ctx.beginPath();
      ctx.arc(jt.x, jt.y, R, jt.j.angle - 0.38, jt.j.angle + 0.38);
      ctx.stroke();
      // Velocity vector
      const vLen = Math.min(Math.abs(jt.j.vel) * 75, 15);
      ctx.beginPath();
      ctx.moveTo(jt.x, jt.y);
      ctx.lineTo(jt.x + Math.cos(jt.j.angle) * vLen, jt.y + Math.sin(jt.j.angle) * vLen);
      ctx.stroke();
      // Label + angle value
      ctx.fillStyle = jt.color;
      ctx.font      = '7px monospace';
      ctx.fillText(`${jt.label}:${jt.j.angle.toFixed(1)}`, jt.x + 14, jt.y + 4);
    }
    // State summary
    ctx.fillStyle = '#cccccc';
    ctx.font      = '8px monospace';
    ctx.fillText(
      `k=${rd.stiffness.toFixed(3)} col=${rd.collapsed ? 'Y' : 'N'} rec=${rd.recovering ? rd.recoveryTimer : 'N'}`,
      cx - 22, shoulderY - 25
    );
    ctx.globalAlpha = 1;
    ctx.restore();
  }
}
