'use strict';

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
    this.attackEndlag = 0;    // recovery frames after swing; player can't attack or ability
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
    this._rd          = null;    // per-limb ragdoll state (PlayerRagdoll system)
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
    this._megaJumping    = false;
    this._megaJumpLanded = false;
    this._megaSmashing   = false;
    this._spawnFalling   = false; // megaknight: falls from sky on spawn
    this._fallStartY     = null;  // Y when megaknight left ground (for fall-height damage)
    this._wanderDir    = 1;  // direction for wander state
    this._wanderTimer  = 0;  // frames left in wander state
    this.coyoteFrames  = 0;  // frames after walking off a platform where ground jump is still allowed
    this._prevOnGround = false; // previous frame ground state (for coyote time)
    this._stateChangeCd = 0; // frames before AI can switch aiState again (human-like hesitation)
    this.personality    = null; // 'aggressive'|'defensive'|'trickster'|'sniper' — set when spawned as bot
    this._pendingAction    = null;  // { action: string, timer: int } — queued decision pending reaction delay
    this._actionLockFrames = 0;     // frames bot is committed to current action (no re-evaluation)
    this.inputBuffer       = [];    // queued inputs: 'attack'|'jump'|'ability' (drained once per frame)
    this.spawnX      = x;
    this.spawnY      = y;
    this.name        = '';
    this.playerNum   = 1;
  }

  cx() { return this.x + this.w / 2; }
  cy() { return this.y + this.h / 2; }

  respawn() {
    // Re-randomize spawn position on each respawn (safe arenas only)
    if (currentArena && !['creator','void','soccer','lava'].includes(currentArenaKey)) {
      const sideHint = this.playerNum === 2 ? 'right' : 'left';
      const newSpawn = pickSafeSpawn(sideHint);
      if (newSpawn) { this.spawnX = newSpawn.x; this.spawnY = newSpawn.y; }
    }
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
    if (this._rd) PlayerRagdoll.standUp(this);
    this.lavaBurnTimer   = 0;
    this._speedBuff      = 0;
    this._powerBuff      = 0;
    this.classPerkUsed    = false;
    this.spartanRageTimer = 0;
    this.invincible = 100;
    // Megaknight spawn animation: fall from sky
    if (this.charClass === 'megaknight') {
      this.y = -120;
      this.vy = 2;
      this._spawnFalling = true;
      this.invincible = 200;
    }
    spawnParticles(this.cx(), this.cy(), this.color, 22);
    // Online: notify remote that we respawned
    if (onlineMode && !this.isRemote && NetworkManager.connected) {
      NetworkManager.sendGameEvent('respawn', { x: this.x, y: this.y });
    }
  }

  // ---- UPDATE ----
  update() {
    // Remote player in online mode: skip local physics (state driven by network)
    if (this.isRemote && onlineMode) {
      this.updateState();
      return;
    }
    if (this.cooldown > 0)         this.cooldown--;
    if (this.cooldown2 > 0)        this.cooldown2--;
    if (this.abilityCooldown > 0)  this.abilityCooldown--;
    if (this.abilityCooldown2 > 0) this.abilityCooldown2--;
    if (this.invincible > 0)      this.invincible--;
    const _prevAtkTimer = this.attackTimer;
    if (this.attackTimer > 0)     this.attackTimer--;
    // Trigger endlag when swing animation completes (attackTimer just hit 0)
    if (_prevAtkTimer === 1 && this.attackTimer === 0 && !this.isBoss) {
      this.attackEndlag = this.weapon.endlag || 0;
    }
    if (this.attackEndlag > 0) { this.attackEndlag--; this.vx *= 0.72; } // slow during recovery
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

    // ---- PER-LIMB SPRING-DAMPER RAGDOLL ----
    // Lazily init on first update; runs every frame to keep pose smooth.
    if (!this._rd) PlayerRagdoll.createRagdoll(this);
    PlayerRagdoll.updateLimbs(this);
    // Lean torso into movement direction
    if (Math.abs(this.vx) > 0.5) PlayerRagdoll.applyMovement(this);

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
          // Block friendly fire in minigames ONLY for survival team mode
          if (gameMode === 'minigames' && minigameType === 'survival' && !_survFFM && !this.isBoss && !tgt.isBoss && !tgt.isAI && !this.isAI) continue;
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

    // AI: only update every AI_TICK_INTERVAL frames (smoother movement, less CPU)
    if (this.isAI && this.target && !activeCinematic && aiTick % AI_TICK_INTERVAL === 0) this.updateAI();

      // ── Standard game physics ──
      const _chaosMoon = gameMode === 'minigames' && currentChaosModifiers.has('moon');
      const arenaGravity = _chaosMoon ? 0.18 : (currentArena.isLowGravity ? 0.28 : (currentArena.isHeavyGravity ? 0.95 : 0.65));
      const gravDir = (gameMode === 'trueform' && tfGravityInverted && !this.isBoss) ? -1 : 1;
      const _sm = slowMotion; // cinematic slow-motion time scale
      this.vy += arenaGravity * gravDir * _sm;
      this.x  += this.vx * _sm;
      this.y  += this.vy * _sm;
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
      // Invisible ceiling — prevent players from flying off the top of the screen
      // Space arena gets a higher ceiling (more room to jump); all others use standard
      if (!this.isBoss) {
        const ceilY = (currentArena && currentArena.isLowGravity) ? -60 :   // space/low-grav: generous
                      -20;                                                     // standard ceiling
        if (this.y < ceilY) {
          this.y  = ceilY;
          if (this.vy < 0) this.vy = 0; // stop upward momentum
        }
      }
      for (const pl of currentArena.platforms) this.checkPlatform(pl);

    // Coyote time: if player just walked off a platform (was on ground, now isn't),
    // grant 6 frames where a ground jump is still possible
    if (this._prevOnGround && !this.onGround && this.vy > -5 && !this.isBoss) {
      // Walked off edge (vy > -5 means didn't jump off)
      if (this.coyoteFrames === 0) this.coyoteFrames = 6;
    }
    // Megaknight: record Y when leaving ground for fall-height damage
    if (this.charClass === 'megaknight' && this._prevOnGround && !this.onGround) {
      this._fallStartY = this.y;
    }
    // Enable double jump for ALL entities (including AI/Boss/TrueForm) when they jump off ground
    if (this._prevOnGround && !this.onGround && this.vy <= -5) {
      this.canDoubleJump = true;
    }
    if (this.coyoteFrames > 0 && !this.onGround) this.coyoteFrames--;
    this._prevOnGround = this.onGround;

    // Horizontal clamp — boss arena has hard walls; other arenas allow slight off-screen
    if (currentArena.isBossArena) {
      if (this.x < 0) {
        this.x = 0; this.vx = Math.abs(this.vx) * 0.25;
      }
      if (this.x + this.w > GAME_W) {
        this.x = GAME_W - this.w; this.vx = -Math.abs(this.vx) * 0.25;
      }
    } else {
      this.x = clamp(this.x, -250, GAME_W + 250);
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
            if (!gameRunning || !_t || _t.health <= 0) return;
            // Spawn visible lightning bolt from sky to target
            spawnLightningBolt(_t.cx(), _t.y);
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

      // KRATOS: Spartan Rage at ≤15% HP — 5s damage boost; heals 10% of damage dealt during rage
      if (this.charClass === 'kratos' && pct <= 0.15) {
        this.classPerkUsed     = true;
        this.spartanRageTimer  = 300;
        this._spartanRageHealPool = 0; // resets each activation
        screenShake = Math.max(screenShake, 24);
        spawnParticles(this.cx(), this.cy(), '#ff4400', 30);
        spawnParticles(this.cx(), this.cy(), '#ff8800', 18);
        spawnParticles(this.cx(), this.cy(), '#ffffff',  8);
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

      // (Megaknight perk is now the super — no passive HP-threshold trigger)
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
      // Edge grip: if player is within 4px past a platform edge, nudge them back
      // Prevents frustrating slip-offs when barely touching a platform
      if (!this.isBoss) {
        const overLeft  = pl.x - (this.x + this.w);   // +ve = player barely on left edge
        const overRight = this.x - (pl.x + pl.w);     // +ve = player barely on right edge
        if (overLeft  >= 0 && overLeft  < 4) this.x = pl.x - this.w + 1;
        if (overRight >= 0 && overRight < 4) this.x = pl.x + pl.w - 1;
      }
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
      // MEGAKNIGHT: Fall-height landing damage (any normal landing, not just Mega Jump)
      if (this.charClass === 'megaknight' && !this._megaJumping && !this._spawnFalling &&
          this._fallStartY !== null && landVy > 5) {
        const fallHeight = Math.max(0, this.y - this._fallStartY); // positive = fell down
        if (fallHeight > 40) {
          const dmg = Math.max(5, Math.min(40, Math.floor(fallHeight * 0.15)));
          const _allF = [...players, ...minions, ...trainingDummies];
          let hitAny = false;
          for (const f of _allF) {
            if (f === this || f.health <= 0) continue;
            const _d = Math.hypot(f.cx() - this.cx(), f.cy() - this.cy());
            if (_d < 100) {
              dealDamage(this, f, Math.round(dmg * (1 - _d/100)), Math.round(20 * (1 - _d/100)));
              hitAny = true;
            }
          }
          if (hitAny || fallHeight > 80) {
            // Shockwave particle ring
            spawnParticles(this.cx(), pl.y, '#8844ff', Math.min(20, Math.floor(fallHeight * 0.2)));
            spawnParticles(this.cx(), pl.y, '#ffffff', 8);
            if (settings.screenShake) screenShake = Math.max(screenShake, Math.min(fallHeight * 0.1, 14));
          }
        }
        this._fallStartY = null;
      }
      // MEGAKNIGHT: Mega Jump shockwave on landing
      if (this._megaJumping && !this._megaJumpLanded && landVy > 8) {
        this._megaJumping    = false;
        this._megaJumpLanded = true;
        this.invincible      = 0;
        screenShake = Math.max(screenShake, 28);
        spawnParticles(this.cx(), pl.y, '#8844ff', 30);
        spawnParticles(this.cx(), pl.y, '#ffffff', 18);
        const _allF = [...players, ...minions, ...trainingDummies];
        for (const f of _allF) {
          if (f === this || f.health <= 0) continue;
          const _d = Math.hypot(f.cx() - this.cx(), f.cy() - this.cy());
          if (_d < 200) {
            const _pct = 1 - _d / 200;
            dealDamage(this, f, Math.round(45 * _pct), Math.round(55 * _pct));
            f.vy = Math.min(f.vy, -22 * _pct);
            f.vx += Math.sign(f.cx() - this.cx()) * 12 * _pct;
          }
        }
        SoundManager.explosion && SoundManager.explosion();
      }
      // MEGAKNIGHT: spawn-fall landing — deals AoE damage when dropping in from sky
      if (this._spawnFalling && landVy > 6) {
        this._spawnFalling = false;
        this.invincible    = 0;
        screenShake = Math.max(screenShake, 32);
        spawnParticles(this.cx(), pl.y, '#8844ff', 36);
        spawnParticles(this.cx(), pl.y, '#ffffff', 22);
        camHitZoomTimer = 20;
        const _allFS = [...players, ...minions, ...trainingDummies];
        for (const f of _allFS) {
          if (f === this || f.health <= 0) continue;
          const _d = Math.hypot(f.cx() - this.cx(), f.cy() - this.cy());
          if (_d < 200) {
            const _p = 1 - _d / 200;
            dealDamage(this, f, Math.round(35 * _p), 50 * _p);
            f.vy = Math.min(f.vy, -18 * _p);
          }
        }
        SoundManager.explosion && SoundManager.explosion();
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

  // Player state machine: idle | run | jump | fall | attack | stunned | ragdoll | dead
  updateState() {
    if (this.health <= 0)              this.state = 'dead';
    else if (this.ragdollTimer > 0)     this.state = 'ragdoll';
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
    if (this.state === 'dead' || this.state === 'stunned' || this.state === 'ragdoll') return;
    if (this.cooldown > 0 || this.health <= 0 || this.stunTimer > 0 || this.ragdollTimer > 0) return;
    if (!this.isBoss && this.attackEndlag > 0) return; // enforced swing recovery window

    // MEGAKNIGHT: Gauntlet Smash — AoE slam in front, launches enemies outward
    if (this.charClass === 'megaknight') {
      this.cooldown     = this.weapon.cooldown;
      this.attackTimer  = this.attackDuration;
      this.superChargeRate = 2;
      this.weaponHit    = false;
      SoundManager.heavyHit && SoundManager.heavyHit();
      const _allF = [...players, ...minions, ...trainingDummies];
      for (const f of _allF) {
        if (f === this || f.health <= 0) continue;
        const relX = f.cx() - this.cx();
        const relY = f.cy() - this.cy();
        if (Math.hypot(relX, relY) < 140 && (relX * this.facing > -30)) {
          dealDamage(this, f, this.weapon.damage, this.weapon.kb);
          f.vx += this.facing * 10;
          f.vy  = Math.min(f.vy, -6);
        }
      }
      spawnParticles(this.cx() + this.facing * 40, this.cy(), '#8844ff', 12);
      spawnParticles(this.cx() + this.facing * 40, this.cy(), '#cc88ff', 6);
      screenShake = Math.max(screenShake, 8);
      return;
    }

    if (this.weapon.type === 'melee') {
      // Use closest enemy (dummy, minion, or training target) if target is null
      const _atkTarget = target || this.target || trainingDummies[0] || players.find(p => p !== this);
      // Damage is delivered via weapon-tip hitbox in update() — just start the swing
      if (!_atkTarget || dist(this, _atkTarget) < this.weapon.range * 1.4) {
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
    if (this.state === 'dead' || this.state === 'stunned' || this.state === 'ragdoll') return;
    if (this.abilityCooldown > 0 || this.health <= 0 || this.stunTimer > 0 || this.ragdollTimer > 0) return;
    if (!this.isBoss && this.attackEndlag > 0) return; // can't ability during swing recovery
    // MEGAKNIGHT class override: Q = Uppercut — launch nearby enemies skyward
    if (this.charClass === 'megaknight') {
      this.abilityCooldown  = 75;
      this.abilityCooldown2 = 75;
      abilityFlashTimer = 14; abilityFlashPlayer = this;
      const _allF = [...players, ...minions, ...trainingDummies];
      let hitCount = 0;
      for (const f of _allF) {
        if (f === this || f.health <= 0) continue;
        if (Math.hypot(f.cx() - this.cx(), f.cy() - this.cy()) < 130) {
          dealDamage(this, f, 25, 20);
          f.vy = Math.min(f.vy, -28); // strong upward launch
          f.vx += (f.cx() > this.cx() ? 1 : -1) * 6;
          hitCount++;
        }
      }
      spawnParticles(this.cx(), this.y, '#8844ff', 22);
      spawnParticles(this.cx(), this.y, '#ffffff', hitCount > 0 ? 18 : 6);
      screenShake = Math.max(screenShake, hitCount > 0 ? 14 : 6);
      return;
    }
    const _safeTarget = target || this.target || trainingDummies[0] || players.find(p => p !== this && p.health > 0);
    if (!_safeTarget) return; // no valid target — don't fire ability (avoids null crash in weapon ability functions)
    this.weapon.ability(this, _safeTarget);
    this.abilityCooldown = this.weapon.abilityCooldown;
    this.attackTimer     = this.attackDuration * 2;
    abilityFlashTimer = 14; abilityFlashPlayer = this;
  }

  // Dedicated super / ultimate activation (separate button from Q)
  useSuper(target) {
    if (this.state === 'dead' || this.stunTimer > 0 || this.ragdollTimer > 0) return;
    if (!this.superReady) return;
    this.activateSuper(target);
  }

  activateSuper(target) {
    // MEGAKNIGHT super: Mega Jump — massive leap into the sky, shockwave on landing
    if (this.charClass === 'megaknight') {
      this._megaJumping    = true;
      this._megaJumpLanded = false;
      this.vy              = -32;
      this.canDoubleJump   = true;
      this.superMeter      = 0;
      this.superReady      = false;
      this.superActive     = true; // block super meter charging from landing shockwave
      this.invincible      = Math.max(this.invincible, 120);
      screenShake = Math.max(screenShake, 20);
      spawnParticles(this.cx(), this.y + this.h, '#8844ff', 32);
      spawnParticles(this.cx(), this.y + this.h, '#cc88ff', 18);
      spawnParticles(this.cx(), this.y + this.h, '#ffffff', 10);
      SoundManager.explosion && SoundManager.explosion();
      setTimeout(() => { if (this) this.superActive = false; }, 4000);
      return;
    }
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
    setTimeout(() => { if (this) this.superActive = false; }, 4000); // clear after 4s (covers full attackTimer*3 window)
    screenShake      = Math.max(screenShake, 24);
    SoundManager.superActivate();
    if (!this.isAI && !this.isBoss) { _achStats.superCount++; if (_achStats.superCount >= 10) unlockAchievement('super_saver'); }
    spawnParticles(this.cx(), this.cy(), this.color,   36);
    spawnParticles(this.cx(), this.cy(), '#ffffff',    18);
    spawnParticles(this.cx(), this.cy(), '#ffd700',    12);
    this.attackTimer = this.attackDuration * 3;
    this.weaponHit   = false;
    if (!this.isBoss) this.invincible = Math.max(this.invincible, 90); // 1.5s i-frames on super
    // Resolve a safe target — target arg may be undefined in solo/training modes
    const _superTarget = target || this.target || trainingDummies[0] || players.find(p => p !== this && p.health > 0);
    const superMoves = {
      sword:  () => {
        this.vx = this.facing * 24;
        if (_superTarget && dist(this, _superTarget) < 210) dealDamage(this, _superTarget, 60, 30);
      },
      hammer: () => {
        screenShake = Math.max(screenShake, 48);
        spawnRing(this.cx(), this.y + this.h);
        spawnRing(this.cx(), this.y + this.h);
        if (_superTarget && dist(this, _superTarget) < 230) dealDamage(this, _superTarget, 58, 38);
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
        if (_superTarget && dist(this, _superTarget) < 175) dealDamage(this, _superTarget, 52, 26);
      },
      spear: () => {
        this.vx = this.facing * 22;
        this.vy = -10;
        if (_superTarget && dist(this, _superTarget) < 230) dealDamage(this, _superTarget, 50, 24);
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

  // ---- UTILITY AI HELPERS ----

  /**
   * Walk N steps forward (world-space) and sample the heatmap + check for cliffs.
   * @param {number} dir      ±1 direction
   * @param {number} steps    how many probe steps
   * @param {number} stepDist world-units per step
   * @returns {{ heat: number, cliff: boolean }}
   */
  raycastForward(dir, steps = 7, stepDist = 13) {
    let maxHeat = 0;
    let cliffAhead = false;
    for (let i = 1; i <= steps; i++) {
      const wx = this.cx() + dir * i * stepDist;
      const wy = this.y + this.h * 0.5;
      const h  = heatAt(wx, wy);
      if (h > maxHeat) maxHeat = h;
      // Check ground under foot for the first 3 steps (cliff detection)
      if (i <= 3 && this.onGround) {
        const footX = wx;
        const footY = this.y + this.h + 10;
        let groundFound = false;
        for (const pl of currentArena.platforms) {
          if (pl.isFloorDisabled) continue;
          if (footX > pl.x && footX < pl.x + pl.w && footY >= pl.y && footY <= pl.y + 30) {
            groundFound = true; break;
          }
        }
        if (!groundFound) cliffAhead = true;
      }
    }
    return { heat: maxHeat, cliff: cliffAhead };
  }

  /**
   * Score each possible AI action [0–1+] based on current game state.
   * Higher score = more desirable action.
   * Difficulty weights bias the scores toward aggression or caution.
   */
  computeUtility(t) {
    const hpPct    = this.health / this.maxHealth;
    const selfHeat = heatAt(this.cx(), this.cy());
    const d        = t ? Math.abs(t.cx() - this.cx()) : Infinity;
    const dNorm    = Math.min(d / 500, 1);           // 0 = at target, 1 = far away
    const tHpPct   = t ? t.health / t.maxHealth : 1;


    // Difficulty: easy = cautious, hard = aggressive
    const hazardW  = this.aiDiff === 'easy' ? 1.55 : this.aiDiff === 'medium' ? 1.00 : 0.58;
    const aggrW    = this.aiDiff === 'easy' ? 0.70 : this.aiDiff === 'medium' ? 1.10 : 1.55;

    const s = {};

    // Fix 5: clamp danger so heatmap influences movement but never fully disables attacks
    const clampedHeat = Math.min(selfHeat, 0.50);

    // AVOID_HAZARD: proportional to heatmap value at self + low-HP fear bonus
    s.avoid_hazard = clampedHeat * hazardW * (1 + (1 - hpPct) * 0.45);

    // RECOVER: high when falling off-screen (vy > 2, y past 60% of GAME_H)
    s.recover = (!this.onGround && this.vy > 2 && this.y > GAME_H * 0.60) ? 0.96 : 0;

    // RETREAT: low HP + enemy is close and healthy
    s.retreat = (hpPct < 0.35 && d < 320)
      ? (1 - hpPct) * 0.90 * hazardW * (1 - dNorm * 0.35)
      : 0;

    // Fix 2: use <= 0 instead of === 0 for cooldown checks
    // Fix 4: widen attack detection to 90% of weapon reach beyond base range
    const attackRange = this.weapon.range * 0.9 + 25;
    const inRangeExt  = t ? d < attackRange : false;
    s.attack = (inRangeExt && this.cooldown <= 0)
      ? (0.60 + (1 - dNorm) * 0.22 + (1 - tHpPct) * 0.12) * aggrW
      : 0;

    // USE_ABILITY: available + close enough (fix 2: <= 0)
    s.use_ability = (this.abilityCooldown <= 0 && d < 280)
      ? (0.68 + (1 - tHpPct) * 0.14) * aggrW
      : 0;

    // USE_SUPER: very high priority when ready and self not in severe danger
    s.use_super = (this.superReady && clampedHeat < 0.50) ? 0.90 * aggrW : 0;

    // CHASE: baseline — close the gap (always has a positive score so bot never idles)
    s.chase = (0.38 + dNorm * 0.20) * aggrW;

    // ---- TACTICAL POSITIONING MODIFIERS ----
    const tacticW = this.aiDiff === 'hard' ? 1.0 : this.aiDiff === 'medium' ? 0.55 : 0.18;
    if (tacticW > 0 && currentArena) {
      // Corner avoidance: boost reposition when bot is near edge
      const edgeDist = Math.min(this.cx(), GAME_W - this.cx()) / (GAME_W * 0.18);
      const heatBelow = heatAt(this.cx(), this.y + this.h + 20);
      const corner = Math.min(1, (1 - Math.min(edgeDist, 1)) * 0.6 + heatBelow * 0.4);
      if (corner > 0.45) {
        s.reposition = (s.reposition || 0) + corner * 0.55 * tacticW;
        s.chase = Math.max(0, s.chase - corner * 0.30 * tacticW);
      }
      // Hazard push: more aggressive when enemy is near hazard
      if (t) {
        const tEdgeDist = Math.min(t.cx(), GAME_W - t.cx()) / (GAME_W * 0.25);
        const tHazard   = heatAt(t.cx(), t.y + t.h + 10);
        const push = Math.max(0, Math.min(1, (1 - Math.min(tEdgeDist, 1)) * 0.5 + tHazard * 0.5));
        if (push > 0.3) {
          s.attack = Math.min(1.5, s.attack + push * 0.45 * tacticW);
          s.chase  = Math.min(1.2, s.chase  + push * 0.25 * tacticW);
        }
        // Distance control by weapon type
        const optRange = this.weapon?.type === 'ranged' ? 280 : (this.weapon?.range >= 90 ? 90 : 60);
        const rangeDiff = d - optRange;
        if (rangeDiff > 50 && this.weapon?.type !== 'ranged') {
          s.chase = Math.min(1.2, s.chase + 0.22 * tacticW);
        } else if (rangeDiff < -30 && this.weapon?.type === 'ranged') {
          s.reposition = Math.min(1, (s.reposition || 0) + 0.28 * tacticW);
        }
      }
      // Escape routes: reduce aggression when trapped
      let escapes = 0;
      for (const pl of currentArena.platforms) {
        if (pl.isFloorDisabled) continue;
        const pdx = Math.abs((pl.x + pl.w/2) - this.cx());
        const pdy = this.y - pl.y;
        if (pdx < 200 && pdy > -20 && pdy < 320 && heatAt(pl.x + pl.w/2, pl.y) < 0.5) escapes++;
      }
      if (escapes <= 1) {
        s.attack     = Math.max(0, s.attack - 0.22 * tacticW);
        s.reposition = Math.min(1, (s.reposition || 0) + 0.32 * tacticW);
      }
    }

    // ---- PERSONALITY MODIFIERS ----
    // Applied after all base scoring so they additively shift the action distribution.
    if (this.personality) {
      switch (this.personality) {
        case 'aggressive':
          // Relentlessly press attacks — ignore self-preservation when healthy
          s.attack       = Math.min(1.8, (s.attack || 0)       * 1.55);
          s.chase        = Math.min(1.5, (s.chase  || 0)       * 1.40);
          s.use_ability  = Math.min(1.6, (s.use_ability || 0)  * 1.35);
          s.retreat      = Math.max(0,   (s.retreat || 0)      * 0.30);
          s.avoid_hazard = Math.max(0,   (s.avoid_hazard || 0) * 0.55);
          break;

        case 'defensive':
          // Back off when hurt; fight mainly when enemy comes to them
          s.retreat      = Math.min(1.4, (s.retreat      || 0) * 1.60);
          s.avoid_hazard = Math.min(1.4, (s.avoid_hazard || 0) * 1.45);
          s.reposition   = Math.min(1.2, (s.reposition   || 0) + 0.18);
          s.attack       = Math.max(0,   (s.attack || 0)       * 0.65);
          s.chase        = Math.max(0,   (s.chase  || 0)       * 0.55);
          // Counter-punch: spike attack score when enemy swings at us
          if (t && t.attackTimer > 0 && Math.abs(t.cx() - this.cx()) < 120) {
            s.attack = Math.min(1.5, (s.attack || 0) + 0.55);
          }
          break;

        case 'trickster':
          // Chaotic — frequently uses abilities/supers, moves unpredictably
          s.use_ability = Math.min(1.8, (s.use_ability || 0) * 1.70);
          s.use_super   = Math.min(1.6, (s.use_super   || 0) * 1.45);
          s.chase       = Math.min(1.3, (s.chase       || 0) * 1.20);
          // Random noise: shifts scoring each frame for erratic feel
          s.attack      = Math.max(0, (s.attack || 0) + (Math.random() - 0.5) * 0.35);
          s.retreat     = Math.max(0, (s.retreat || 0) + (Math.random() - 0.5) * 0.25);
          break;

        case 'sniper':
          // Stays at range; high attack priority only with ranged weapon
          if (this.weapon?.type === 'ranged') {
            s.attack      = Math.min(1.8, (s.attack || 0) * 1.80);
            s.use_ability = Math.min(1.6, (s.use_ability || 0) * 1.50);
            // Prefer keeping distance — boost reposition when enemy gets close
            if (d < 200) {
              s.retreat    = Math.min(1.4, (s.retreat    || 0) + 0.55);
              s.reposition = Math.min(1.2, (s.reposition || 0) + 0.35);
              s.attack     = Math.max(0,   (s.attack     || 0) * 0.60);
            }
          } else {
            // Melee sniper: still tries to keep optimal range, attacks only when lined up
            s.chase       = Math.max(0,   (s.chase  || 0) * 0.70);
            s.reposition  = Math.min(1.2, (s.reposition || 0) + 0.22);
          }
          break;
      }
    }

    return s;
  }

  /**
   * Execute the highest-scoring utility action.
   * Handles movement, combat, dodging, and reaction lag.
   * Called from updateAI() after special-case overrides.
   */
  executeUtilityAI(t) {
    // Ensure heatmap is current (no-op if already done this frame)
    updateHeatmap();

    const scores = this.computeUtility(t);

    // Fix 1: fallback — if every score is zero or below, default to 'chase' so bot never idles
    const maxScore = Math.max(...Object.values(scores));
    const best = maxScore <= 0
      ? 'chase'
      : Object.keys(scores).reduce((a, b) => scores[a] >= scores[b] ? a : b);

    // Reaction delay system: bot queues decisions and commits after a human-like delay
    const reactFrames  = this.aiDiff === 'easy' ? 15 : this.aiDiff === 'medium' ? 11 : 7;
    const lockFrames   = this.aiDiff === 'easy' ? 24 : this.aiDiff === 'medium' ? 18 : 12;

    if (this._stateChangeCd > 0) this._stateChangeCd--;
    if (this._actionLockFrames > 0) this._actionLockFrames--;

    // Tick pending action countdown; commit when it expires
    if (this._pendingAction) {
      this._pendingAction.timer--;
      if (this._pendingAction.timer <= 0) {
        this.aiState = this._pendingAction.action;
        this._pendingAction = null;
        this._stateChangeCd = 18;
        this._actionLockFrames = lockFrames;
      }
    } else if (best !== this.aiState && this._stateChangeCd === 0 && this._actionLockFrames === 0) {
      // Queue the new decision — bot will execute it after reaction delay
      this._pendingAction = { action: best, timer: reactFrames };
    }

    // Fix 6: debug state display — show current AI state as a small label above bot
    if (this.isAI && !this.isBoss && settings.dmgNumbers) {
      this._debugState = best; // drawn by Fighter.draw() if present
    }

    const dx         = t ? t.cx() - this.cx() : 0;
    const dir        = dx > 0 ? 1 : -1;
    const d          = Math.abs(dx);
    let   spd        = this.aiDiff === 'easy' ? 2.6 : this.aiDiff === 'medium' ? 4.2 : 5.8;
    let   atkFreq    = this.aiDiff === 'easy' ? 0.04 : this.aiDiff === 'medium' ? 0.16 : 0.28;
    let   abiFreq    = this.aiDiff === 'easy' ? 0.004 : this.aiDiff === 'medium' ? 0.022 : 0.04;
    let   missChance = this.aiDiff === 'easy' ? 0.15 : this.aiDiff === 'medium' ? 0.08 : 0.03;
    // Personality execution tweaks
    if (this.personality === 'aggressive') { spd *= 1.20; atkFreq *= 1.45; missChance *= 0.60; }
    if (this.personality === 'defensive')  { spd *= 0.85; atkFreq *= 0.65; }
    if (this.personality === 'trickster')  { abiFreq *= 2.0; missChance *= 0.50; }
    if (this.personality === 'sniper' && this.weapon?.type === 'ranged') { spd *= 1.10; atkFreq *= 1.55; }

    // Raycast: check heat and cliff directly ahead
    const fwd      = this.raycastForward(dir);
    const pathSafe = fwd.heat < 0.55 && !fwd.cliff;

    // Screen-edge guard
    const nearLeftEdge  = this.x < 100 && !this.isBoss;
    const nearRightEdge = this.x + this.w > GAME_W - 100 && !this.isBoss;
    const towardEdge    = (nearLeftEdge && dir < 0) || (nearRightEdge && dir > 0);

    switch (best) {

      // ---- AVOID_HAZARD: flee the most dangerous nearby direction ----
      case 'avoid_hazard': {
        const selfHeat = heatAt(this.cx(), this.cy());
        // Compare danger 60px left vs right; flee toward the safer side
        const heatL  = heatAt(this.cx() - 60, this.cy());
        const heatR  = heatAt(this.cx() + 60, this.cy());
        const fleeDir = heatL < heatR ? -1 : 1;
        if (!this.isEdgeDanger(fleeDir)) {
          this.vx = fleeDir * spd * 1.6;
        } else {
          this.vx = 0; // can't run — jump up instead
        }
        // Jump if heat is high enough
        if (selfHeat > 0.65 && this.onGround) {
          this.vy = -20;
        } else if (selfHeat > 0.50 && this.canDoubleJump && this.vy > 0) {
          this.vy = -16; this.canDoubleJump = false;
        }
        break;
      }

      // ---- RETREAT: back away; weak counter-attack when cornered ----
      case 'retreat': {
        const retDir  = -dir;
        const retEdge = this.isEdgeDanger(retDir);
        if (!retEdge && !towardEdge) {
          this.vx = retDir * spd;
        } else {
          // Cornered — fight back rather than stepping off edge
          if (this.cooldown <= 0 && Math.random() < atkFreq) this.attack(t);
          this.vx = 0;
        }
        if (this.onGround && !retEdge && Math.random() < 0.04) this.vy = -16;
        // Chip damage while retreating (reduced freq)
        if (d < this.weapon.range + 10 && this.cooldown === 0 && Math.random() < atkFreq * 0.45)
          this.attack(t);
        break;
      }

      // ---- RECOVER: steer toward nearest platform when falling ----
      case 'recover': {
        let nearX = GAME_W / 2, nearDist = Infinity;
        for (const pl of currentArena.platforms) {
          if (pl.isFloorDisabled) continue;
          const pdx = Math.abs(pl.x + pl.w / 2 - this.cx());
          if (pdx < nearDist) { nearDist = pdx; nearX = pl.x + pl.w / 2; }
        }
        this.vx = nearX > this.cx() ? spd * 1.8 : -spd * 1.8;
        // Use double jump to reach safety if still falling
        if (this.canDoubleJump && this.vy > 1) { this.vy = -15; this.canDoubleJump = false; }
        break;
      }

      // ---- USE_SUPER: unleash super move ----
      case 'use_super':
        this.useSuper(t);
        break;

      // ---- USE_ABILITY: activate weapon ability; close range if needed ----
      case 'use_ability':
        this.ability(t);
        if (d > this.weapon.range + 5 && pathSafe && !towardEdge)
          this.vx = dir * spd;
        break;

      // ---- ATTACK: hold position and swing ----
      case 'attack':
        this.vx *= 0.72;
        // Occasional missed swing (human-like imperfection)
        if (Math.random() < missChance) this.facing = -this.facing;
        // Fix 2: use <= 0 for cooldown checks
        if (this.cooldown <= 0 && Math.random() < atkFreq) this.attack(t);
        if (this.abilityCooldown <= 0 && Math.random() < abiFreq) this.ability(t);
        if (this.superReady && Math.random() < 0.12) this.useSuper(t);
        // Small hop to reach target on a slightly higher level
        if (this.onGround && t && t.y + t.h < this.y - 30 && !fwd.cliff && Math.random() < 0.02)
          this.vy = -16;
        break;

      // ---- REPOSITION: move toward map center to avoid corner traps ----
      case 'reposition': {
        const toCenter = GAME_W / 2 - this.cx();
        if (Math.abs(toCenter) > 30) {
          const rDir = Math.sign(toCenter);
          if (!this.isEdgeDanger(rDir)) this.vx = rDir * spd;
        }
        if (this.onGround && Math.abs(toCenter) > 80 && Math.random() < 0.03) this.vy = -16;
        // Still attack if target walks into range while repositioning
        if (t && Math.abs(t.cx() - this.cx()) < this.weapon.range + 15 && this.cooldown === 0 && Math.random() < atkFreq * 0.6)
          this.attack(t);
        break;
      }

      // ---- CHASE: close the distance (default) ----
      case 'chase':
      default:
        if (pathSafe && !towardEdge) {
          this.vx = dir * spd;
        } else if (fwd.cliff || towardEdge) {
          // Blocked by edge or cliff — stop, try jumping to a platform above
          this.vx = 0;
          if (this.onGround && this.platformAbove() && Math.random() < 0.05) this.vy = -18;
        }
        // Jump to target on higher platform
        if (this.onGround && t && t.y + t.h < this.y - 50 && !fwd.cliff && Math.random() < 0.04 &&
            (!currentArena.hasLava || this.platformAbove()))
          this.vy = -18;
        // Jump toward airborne target (not if near screen edge)
        if (this.onGround && t && !t.onGround && Math.random() < 0.05 && !fwd.cliff && !towardEdge)
          this.vy = -18;
        // Trickster: random erratic jumps and direction fakes
        if (this.personality === 'trickster' && this.onGround && !towardEdge) {
          if (Math.random() < 0.025) { this.vy = -18; }                        // random jump
          if (Math.random() < 0.012) { this.vx = -this.vx; this.facing *= -1; } // fake-out reverse
        }
        break;
    }

    // Input buffer: queue an attack when opponent steps into range (executes on drain, not immediately)
    if (t && t.health > 0 && this.aiState !== 'retreat' && this.aiState !== 'recover') {
      const bufferRange = this.weapon.range * 0.9 + 20;
      if (d < bufferRange && this.inputBuffer.length === 0) {
        this.inputBuffer.push('attack');
      }
    }
    // Drain input buffer — process one queued input per frame when ready
    if (this.inputBuffer.length > 0 && this._actionLockFrames === 0 && !this._pendingAction) {
      const qi = this.inputBuffer.shift();
      if      (qi === 'attack'  && this.cooldown <= 0 && t && t.health > 0) this.attack(t);
      else if (qi === 'jump'    && this.onGround) this.vy = -18;
      else if (qi === 'ability' && this.abilityCooldown <= 0) this.ability(t);
    }
    // Cap buffer to prevent stale queues
    if (this.inputBuffer.length > 3) this.inputBuffer.length = 3;

    // --- Shield reaction (medium+): block incoming melee swing ---
    if (t && this.aiDiff !== 'easy' && t.attackTimer > 0 && d < 110 &&
        this.shieldCooldown === 0 && Math.random() < 0.22) {
      this.shielding = true;
      this.shieldCooldown = SHIELD_CD;
      setTimeout(() => { this.shielding = false; }, 320);
    }

    // --- Dodge projectiles (medium+) ---
    if (this.aiDiff !== 'easy') {
      for (const pr of projectiles) {
        if (pr.owner === this) continue;
        const pd = Math.hypot(pr.x - this.cx(), pr.y - this.cy());
        if (pd < 130 && !this.isEdgeDanger(pr.vx > 0 ? -1 : 1) && Math.random() < 0.30) {
          if (this.onGround) this.vy = -17;
          else if (this.canDoubleJump) { this.vy = -13; this.canDoubleJump = false; }
        }
      }
    }

    // Reaction lag now handled by _pendingAction system (see above).
    // Rare stun pause for easy bots only (simulates brief confusion)
    if (this.aiDiff === 'easy' && Math.random() < 0.04) this.aiReact = 3 + Math.floor(Math.random() * 4);
  }

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

    // ---- TARGET VALIDATION: reassign if current target is dead/invalid ----
    if (!this.target || this.target.health <= 0) {
      const living = [...players, ...trainingDummies].filter(q => q !== this && q.health > 0 && !q.isBoss === !this.isBoss || (!q.isBoss && !this.isBoss));
      this.target = living.length
        ? living.reduce((a, b) => Math.hypot(b.cx()-this.cx(),b.cy()-this.cy()) < Math.hypot(a.cx()-this.cx(),a.cy()-this.cy()) ? b : a)
        : null;
    }

    // ---- DANGER AVOIDANCE: boss beams ----
    if (bossBeams && bossBeams.length > 0 && !this.isBoss) {
      for (const beam of bossBeams) {
        if (beam.done) continue;
        const beamDx = Math.abs(beam.x - this.cx());
        if (beamDx < 50) {
          // Move away from beam
          const fleeDir = this.cx() < beam.x ? -1 : 1;
          if (!this.isEdgeDanger(fleeDir)) {
            const spd0 = this.aiDiff === 'easy' ? 2.6 : this.aiDiff === 'medium' ? 4.2 : 5.8;
            this.vx = fleeDir * spd0 * 2;
          }
          if (this.onGround) this.vy = -18;
          return; // beam avoidance takes priority
        }
      }
    }

    // ---- DANGER AVOIDANCE: floor hazard ----
    if (!this.isBoss && bossFloorState === 'hazard' && this.y + this.h > 430) {
      // Floor is lethal — jump or move to a platform
      if (this.onGround) {
        const above = this.platformAbove();
        if (above) {
          const toPlat = above.x + above.w/2 - this.cx();
          const spd0 = this.aiDiff === 'easy' ? 2.6 : this.aiDiff === 'medium' ? 4.2 : 5.8;
          this.vx = Math.sign(toPlat) * spd0 * 1.5;
          this.vy = -19;
          return;
        }
        this.vy = -19;
        return;
      }
    }

    // ---- DANGER AVOIDANCE: lava proximity ----
    if (!this.isBoss && currentArena && currentArena.hasLava && currentArena.lavaY) {
      const distToLava = currentArena.lavaY - (this.y + this.h);
      if (distToLava < 80 && this.y + this.h > 380) {
        if (this.onGround) {
          const spd0 = this.aiDiff === 'easy' ? 2.6 : this.aiDiff === 'medium' ? 4.2 : 5.8;
          this.vx = this.cx() < GAME_W/2 ? spd0 * 2 : -spd0 * 2;
          this.vy = -19;
          return;
        }
      }
    }

    // ---- DEADLOCK DETECTION: two bots mirroring each other ----
    if (!this.isBoss && this.target && this.target.isAI) {
      this._stuckFrames  = (this._stuckFrames  || 0);
      this._lastXForStuck = (this._lastXForStuck !== undefined ? this._lastXForStuck : this.x);
      if (Math.abs(this.x - this._lastXForStuck) < 5) {
        this._stuckFrames++;
        if (this._stuckFrames > 180) { // 3 seconds at AI tick rate
          this._stuckFrames = 0;
          this._wanderDir   = (Math.random() < 0.5 ? -1 : 1);
          this._wanderTimer = 40;
          if (this.onGround) this.vy = -18;
        }
      } else {
        this._stuckFrames = 0;
      }
      this._lastXForStuck = this.x;
    }

    // ---- RANDOM NUDGE: prevents long idle stretches ----
    if (!this.isBoss && frameCount % 120 === 0 && Math.abs(this.vx) < 0.5 && this.target) {
      const spd0 = this.aiDiff === 'easy' ? 2.6 : this.aiDiff === 'medium' ? 4.2 : 5.8;
      this._wanderDir   = (Math.random() < 0.5 ? -1 : 1);
      this._wanderTimer = 20;
      this.vx           = this._wanderDir * spd0;
    }

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
      if (enemyInZone && this.target && this.target.cx() > zoneLeft && this.target.cx() < zoneRight) {
        const zd = Math.abs(this.target.cx() - this.cx());
        if (zd < this.weapon.range + 20) {
          this.vx *= 0.72;
          if (Math.random() < kothAtkFreq) this.attack(this.target);
          if (Math.random() < kothAbiFreq) this.ability(this.target);
          if (this.superReady && Math.random() < 0.12) this.useSuper(this.target);
        } else {
          this.vx = (this.target.cx() > this.cx() ? 1 : -1) * kothSpd;
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
    if (!t) return;
    const dx = t.cx() - this.cx();
    const d  = Math.abs(dx);
    const dir = dx > 0 ? 1 : -1;

    const spd = this.aiDiff === 'easy' ? 2.6 : this.aiDiff === 'medium' ? 4.2 : 5.8;

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
        let nearestX = GAME_W / 2, nearestDist = Infinity;
        for (const pl of currentArena.platforms) {
          if (pl.isFloor) continue;
          const pdx3 = Math.abs(pl.x + pl.w / 2 - this.cx());
          if (pdx3 < nearestDist) { nearestDist = pdx3; nearestX = pl.x + pl.w / 2; }
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

    // Emergency super: if critically low health and super is ready, fire immediately
    if (this.health < 40 && this.superReady) { this.useSuper(t); }

    // ---- HARD FREEZE FAILSAFE: force chase if bot hasn't moved in 1.5s ----
    // Guards against edge cases where all state-machine branches return without moving.
    if (!this.isBoss) {
      this._absoluteIdleTimer = (this._absoluteIdleTimer || 0);
      const isMoving = Math.abs(this.vx) > 0.8 || !this.onGround;
      if (isMoving) {
        this._absoluteIdleTimer = 0;
      } else {
        this._absoluteIdleTimer++;
        if (this._absoluteIdleTimer > 8) { // 8 AI ticks × 15 frames = ~120 frames = ~2s
          this._absoluteIdleTimer = 0;
          // Force move directly toward target
          const forceDx = t.cx() - this.cx();
          this.vx = Math.sign(forceDx) * spd * 1.2;
          if (this.onGround) this.vy = -17;
          return; // skip utility AI this tick
        }
      }
    }

    // ---- UTILITY AI: score-based action selection + raycast hazard detection ----
    // Replaces the old state machine; handles movement, combat, dodge, and reaction lag.
    this.executeUtilityAI(t);
  }

  // ---- DRAW ----
  draw() {
    if (this.backstageHiding) return;
    if (this.health <= 0 && !this.isBoss && !this.isDummy) return; // ragdolls handle dead fighter visuals; dummies always draw

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

    if (this._rd && this.spinning <= 0) {
      rAng = this._rd.rArm.angle;
      lAng = this._rd.lArm.angle;
    } else if (this.spinning > 0) {
      // (fall through to spinning block below)
      rAng = 0; lAng = Math.PI; // placeholder; overwritten below
    }

    if (this.spinning > 0) {
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
    if (this._rd && this.spinning <= 0) {
      rLeg = this._rd.rLeg.angle;
      lLeg = this._rd.lLeg.angle;
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
    // Fix 6: debug state label — shown only when dmgNumbers is on (dev toggle)
    if (this._debugState && settings.dmgNumbers) {
      ctx.font      = 'bold 8px monospace';
      ctx.fillStyle = '#ffee55';
      ctx.fillText(this._debugState, cx, ty - 16);
    }

    // Per-limb ragdoll debug overlay
    if (this._rd) PlayerRagdoll.debugDraw(this, cx, shoulderY, hipY);

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

    // --- Weapon glow: stronger when swinging (prevents clipping into background) ---
    const _glowColors = {
      sword: '#c8e8ff', hammer: '#ffaa44', gun: '#ff4444', axe: '#ff6633',
      spear: '#8888ff', bow: '#aadd88', shield: '#4488ff', scythe: '#aabbcc',
      fryingpan: '#ffcc44', broomstick: '#ddbb44', boxinggloves: '#ff3333',
      peashooter: '#44ff66', slingshot: '#cc8844', paperairplane: '#aaccff',
    };
    if (k !== 'gauntlet' && _glowColors[k]) {
      const pulse = 0.5 + 0.5 * Math.sin(frameCount * 0.12 + (this.playerNum || 0));
      ctx.shadowColor = _glowColors[k];
      ctx.shadowBlur  = attacking ? Math.max(15, 18 + pulse * 8) : 5 + pulse * 5;
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

    } else if (k === 'mkgauntlet') {
      // Megaknight gauntlets — gold + purple, larger than boss gauntlet
      ctx.save();
      ctx.shadowColor = '#cc88ff';
      ctx.shadowBlur  = 18;
      // Main body — gold plate
      ctx.fillStyle = '#aa6600';
      ctx.beginPath();
      ctx.roundRect(-12, -12, 30, 22, 6);
      ctx.fill();
      // Purple energy overlay
      ctx.fillStyle   = 'rgba(136,68,255,0.45)';
      ctx.fillRect(-12, -12, 30, 22);
      // Gold outline
      ctx.strokeStyle = '#ffcc44';
      ctx.lineWidth   = 2.5;
      ctx.beginPath();
      ctx.roundRect(-12, -12, 30, 22, 6);
      ctx.stroke();
      // Knuckle spikes
      ctx.fillStyle = '#ffcc44';
      for (let ki = 0; ki < 4; ki++) {
        ctx.beginPath();
        ctx.arc(-6 + ki * 8, -12, 4, Math.PI, 0);
        ctx.fill();
      }
      // Inner glow
      ctx.globalAlpha = 0.6;
      ctx.fillStyle   = '#cc88ff';
      ctx.beginPath();
      ctx.arc(3, 1, 7, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.restore();
    }

    ctx.restore();
  }
}
