'use strict';

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
    // Move boss off-screen so it cannot hit players during the portal animation
    boss.x = -2000;
    boss.y = -2000;

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
    // Forced teleport: use portal animation (same as voluntary but faster — 1s total)
    openBackstagePortal(oldX, oldY, 'entry');
    boss.backstageHiding = true;
    boss.invincible      = 9999;
    boss.vx = 0; boss.vy = 0;
    boss.x = -2000; boss.y = -2000; // off-screen while animating
    spawnParticles(oldX, oldY, '#9900ee', 18);
    setTimeout(() => {
      if (!gameRunning) return;
      openBackstagePortal(destX + boss.w / 2, destY + boss.h / 2, 'exit');
    }, 600);
    setTimeout(() => {
      if (!gameRunning) return;
      boss.x = destX; boss.y = destY;
      boss.vx = 0; boss.vy = 0;
      boss.backstageHiding = false;
      boss.invincible = 60;
      boss.forcedTeleportFlash = 20;
      showBossDialogue('You really thought I would go down that easily?', 300);
    }, 1100);
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
      name: 'Fists', damage: 20, range: 48, cooldown: 16, kb: 7,
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
    const atkFreq = phase === 3 ? 0.12 : phase === 2 ? 0.085 : 0.055;
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
        tfGravityTimer    = tfGravityInverted ? 600 : 0; // 10s limit when inverted
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
      r:        52,
      maxTimer: 360, // 6 seconds
      timer:    360,
      spin:     Math.random() * Math.PI * 2,
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
    bh.spin = (bh.spin || 0) + 0.025;

    // Gravitational lensing glow (outermost)
    const lensR = bh.r * 2.6;
    const gLens = ctx.createRadialGradient(bh.x, bh.y, bh.r * 1.1, bh.x, bh.y, lensR);
    gLens.addColorStop(0, `rgba(80,0,140,${0.22 * alpha})`);
    gLens.addColorStop(0.5, `rgba(30,0,60,${0.12 * alpha})`);
    gLens.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = gLens;
    ctx.beginPath(); ctx.arc(bh.x, bh.y, lensR, 0, Math.PI * 2); ctx.fill();

    // Accretion disk (ellipse, rotates)
    ctx.save();
    ctx.translate(bh.x, bh.y);
    ctx.rotate(bh.spin);
    ctx.scale(1, 0.28);
    const diskInner = bh.r * 1.05, diskOuter = bh.r * 1.9;
    const gDisk = ctx.createRadialGradient(0, 0, diskInner, 0, 0, diskOuter);
    gDisk.addColorStop(0, `rgba(255,140,0,${0.85 * alpha})`);
    gDisk.addColorStop(0.4, `rgba(255,60,0,${0.55 * alpha})`);
    gDisk.addColorStop(0.75, `rgba(120,20,180,${0.3 * alpha})`);
    gDisk.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = gDisk;
    ctx.beginPath(); ctx.arc(0, 0, diskOuter, 0, Math.PI * 2); ctx.fill();
    ctx.restore();

    // Photon ring (bright orange/white ring at event horizon)
    ctx.save();
    ctx.shadowColor = '#ff8800'; ctx.shadowBlur = 14;
    ctx.strokeStyle = `rgba(255,180,60,${0.75 * alpha})`;
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(bh.x, bh.y, bh.r * 1.08, 0, Math.PI * 2); ctx.stroke();
    ctx.restore();

    // Black hole core (perfectly dark)
    const g = ctx.createRadialGradient(bh.x, bh.y, 0, bh.x, bh.y, bh.r);
    g.addColorStop(0, `rgba(0,0,0,${alpha})`);
    g.addColorStop(0.85, `rgba(0,0,0,${alpha})`);
    g.addColorStop(1, `rgba(0,0,0,0)`);
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(bh.x, bh.y, bh.r, 0, Math.PI * 2); ctx.fill();

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
  tfGravityTimer     = 0;
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

