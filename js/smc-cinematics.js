'use strict';

// ============================================================
// CINEMATIC SCRIPTING SYSTEM v2
// ============================================================
// Replaces hand-written update(t) monoliths with a declarative
// step-based API. Fully compatible with existing startCinematic().
//
// QUICK USAGE:
//   startCinematic(cinScript({
//     duration: 4.0,
//     label:    { text: '— TITLE —', color: '#ff0044' },
//     slowMo:   [[0, 1.0], [0.3, 0.05], [3.7, 0.05], [4.0, 1.0]],
//     cam: [
//       [0,   { zoomTo: 1.7, focusOn: () => boss }],
//       [0.5, { zoomTo: 1.1, focusOn: () => target }],
//     ],
//     steps: [
//       { at: 0.3, run: ({ boss, target }) => { /* scripted action */ } },
//       { at: 0.8, dialogue: 'Enough.' },
//       { at: 0.8, fx: { screenShake: 40, shockwave: { color: '#ff0044' } } },
//     ]
//   }));
// ============================================================


// ── World-space cinematic effects ─────────────────────────────────────────
// cinGroundCracks and cinScreenFlash are declared in smc-globals.js

// Called from smc-loop.js in world-space draw pass (after platforms, before fighters)
function drawCinematicWorldEffects() {
  for (let i = cinGroundCracks.length - 1; i >= 0; i--) {
    const c = cinGroundCracks[i];
    c.timer--;
    if (c.timer <= 0) { cinGroundCracks.splice(i, 1); continue; }
    const fadeAlpha = c.timer < 60 ? (c.timer / 60) * c.alpha : c.alpha;
    ctx.save();
    ctx.globalAlpha = Math.max(0, fadeAlpha);
    ctx.strokeStyle = c.color || '#cc3300';
    ctx.lineWidth   = c.width || 2.5;
    ctx.shadowColor = c.color || '#cc3300';
    ctx.shadowBlur  = 10;
    ctx.translate(c.x, c.y);
    ctx.rotate(c.angle);
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(c.length, 0);
    ctx.stroke();
    // Branch cracks
    if (c.branches) {
      for (const b of c.branches) {
        ctx.globalAlpha = Math.max(0, fadeAlpha * 0.55);
        ctx.lineWidth   = (c.width || 2.5) * 0.55;
        ctx.beginPath();
        ctx.moveTo(b.ox, 0);
        ctx.lineTo(b.ox + b.len * Math.cos(b.ang), b.len * Math.sin(b.ang));
        ctx.stroke();
      }
    }
    ctx.restore();
  }
}

// ── CinFX — effect helper (call from step run() callbacks) ────────────────
const CinFX = {

  // Expanding ring shockwave (world-space)
  shockwave(x, y, color, opts = {}) {
    const count = opts.count  || 4;
    const maxR  = opts.maxR   || 290;
    const lw    = opts.lw     || 4.5;
    const dur   = opts.dur    || 72;
    for (let i = 0; i < count; i++) {
      phaseTransitionRings.push({
        cx: x, cy: y,
        r:       4 + i * 16,
        maxR:    maxR + i * 32,
        timer:   dur + i * 13,
        maxTimer: dur + i * 13,
        color,
        lineWidth: Math.max(0.5, lw - i * 0.6),
      });
    }
  },

  // Particle burst (world-space)
  particles(x, y, color, count = 30) {
    spawnParticles(x, y, color, count);
  },

  // Set screen shake (takes the max of current vs new value)
  shake(intensity) {
    if (settings && settings.screenShake !== false) {
      screenShake = Math.max(screenShake, intensity);
    }
  },

  // Brief screen flash (drawn by drawCinematicOverlay in screen-space)
  flash(color = '#ffffff', alpha = 0.65, durationFrames = 14) {
    cinScreenFlash = { color, alpha, timer: durationFrames, maxTimer: durationFrames };
  },

  // Ground crack fan radiating from a point (world-space, floor-level)
  groundCrack(x, groundY, opts = {}) {
    const count = opts.count || 6;
    const color = opts.color || '#cc3300';
    for (let i = 0; i < count; i++) {
      const angle  = (Math.random() - 0.5) * Math.PI * 0.7; // fan spread
      const length = 22 + Math.random() * 65;
      const dur    = 200 + Math.random() * 130;
      const branches = [];
      for (let b = 0; b < Math.floor(Math.random() * 3) + 1; b++) {
        branches.push({
          ox:  Math.random() * length * 0.8,
          len: 8 + Math.random() * 22,
          ang: (Math.random() - 0.5) * 1.3,
        });
      }
      cinGroundCracks.push({
        x:       x + (Math.random() - 0.5) * 28,
        y:       groundY,
        angle,
        length,
        alpha:   0.9,
        timer:   dur,
        maxTimer: dur,
        width:   1.5 + Math.random() * 2.2,
        color,
        branches,
      });
    }
  },

  // Force the nearest arena hazard to trigger soon
  arenaHazardNow() {
    if (typeof directorSpawnHazard === 'function') directorSpawnHazard();
  },
};

// ── CinCam — per-frame camera setter ──────────────────────────────────────
// Call from within step run() callbacks or the cinScript update loop.
const CinCam = {

  // Point camera at a world-space coordinate with a zoom level.
  // The existing smc-loop.js lerp (0.09 zoom, 0.07 pos) handles smoothing automatically.
  setFocus(x, y, zoom) {
    cinematicCamOverride = true;
    if (x    !== undefined) cinematicFocusX    = x;
    if (y    !== undefined) cinematicFocusY    = y;
    if (zoom !== undefined) cinematicZoomTarget = zoom;
  },

  // Orbit camera around a center point (for dramatic circular reveal)
  // angle in radians; call each frame with an incrementing angle value
  orbit(cx, cy, radius, angle, zoom) {
    this.setFocus(
      cx + Math.cos(angle) * radius,
      cy + Math.sin(angle) * radius,
      zoom
    );
  },

  // Convenience: focus midpoint between two entities
  midpoint(a, b, zoom) {
    if (!a || !b) return;
    this.setFocus((a.cx() + b.cx()) * 0.5, (a.cy() + b.cy()) * 0.5, zoom);
  },
};


// ── Keyframe interpolation helpers ────────────────────────────────────────

// Smooth-step easing (s-curve between 0 and 1)
function _cinEase(t) { return t * t * (3 - 2 * t); }

// Linear interpolation along sorted [[t, value], ...] keyframe array
function _cinSampleKeyframes(kf, t) {
  if (!kf || kf.length === 0) return 1.0;
  if (t <= kf[0][0])                  return kf[0][1];
  if (t >= kf[kf.length - 1][0])     return kf[kf.length - 1][1];
  for (let i = 0; i < kf.length - 1; i++) {
    const [t0, v0] = kf[i];
    const [t1, v1] = kf[i + 1];
    if (t >= t0 && t <= t1) {
      return v0 + (v1 - v0) * _cinEase((t - t0) / (t1 - t0));
    }
  }
  return kf[kf.length - 1][1];
}

// Camera keyframes: [[t, { zoomTo, focusOn, focusX, focusY }], ...]
// focusOn: () => entity    — live entity tracking (re-evaluated each frame)
// focusX/Y: number         — static world-space coordinate
function _cinSampleCam(kf, t) {
  if (!kf || kf.length === 0) return null;
  if (t <= kf[0][0])              return kf[0][1];
  if (t >= kf[kf.length - 1][0]) return kf[kf.length - 1][1];
  for (let i = 0; i < kf.length - 1; i++) {
    const [t0, k0] = kf[i];
    const [t1, k1] = kf[i + 1];
    if (t >= t0 && t <= t1) {
      const a    = _cinEase((t - t0) / (t1 - t0));
      const zoom = (k0.zoomTo !== undefined && k1.zoomTo !== undefined)
        ? k0.zoomTo + (k1.zoomTo - k0.zoomTo) * a
        : (k0.zoomTo ?? k1.zoomTo ?? 1.0);
      // focusOn: use the earlier keyframe's tracker (it "owns" this segment)
      const focusOn = k0.focusOn || null;
      const focusX  = k0.focusX !== undefined && k1.focusX !== undefined
        ? k0.focusX + (k1.focusX - k0.focusX) * a : (k0.focusX ?? k1.focusX);
      const focusY  = k0.focusY !== undefined && k1.focusY !== undefined
        ? k0.focusY + (k1.focusY - k0.focusY) * a : (k0.focusY ?? k1.focusY);
      return { zoomTo: zoom, focusOn, focusX, focusY };
    }
  }
  return kf[kf.length - 1][1];
}


// ── cinScript — main factory ───────────────────────────────────────────────
//
// def = {
//   duration:  Number,                                    // total seconds
//   label:     { text, color } | null,                   // phase label shown mid-cinematic
//   slowMo:    [[t0, v0], [t1, v1], ...],                // slowMotion keyframes
//   cam:       [[t0, camKey], [t1, camKey], ...],        // camera keyframes
//   orbit:     { cx, cy, radius, speed, zoom } | null,  // optional constant orbit override
//   steps:     [{ at, run, dialogue, dialogueDur, fx }] // one-time timed steps
// }
//
// step.run receives: { t, boss, target, CinCam, CinFX }
// step.fx: { screenShake, flash:{color,alpha,dur}, particles:{x,y,color,count},
//            shockwave:{x,y,color,...}, groundCrack:{x,y,color,count} }
//
function cinScript(def) {
  const stepsFired = new Array((def.steps || []).length).fill(false);

  return {
    durationFrames: Math.round((def.duration || 3) * 60),
    _phaseLabel:    def.label || null,

    update(t) {
      // ── 1. Slow motion ──────────────────────────────────────
      if (def.slowMo) {
        slowMotion = _cinSampleKeyframes(def.slowMo, t);
      }

      // ── 2. Camera ───────────────────────────────────────────
      if (def.orbit && t >= (def.orbit.start || 0)) {
        const o     = def.orbit;
        const angle = (t - (o.start || 0)) * (o.speed || 0.8);
        CinCam.orbit(o.cx, o.cy, o.radius || 120, angle, o.zoom || 1.4);
      } else if (def.cam) {
        const k = _cinSampleCam(def.cam, t);
        if (k) {
          let fx = k.focusX, fy = k.focusY;
          if (k.focusOn) {
            const ent = typeof k.focusOn === 'function' ? k.focusOn() : k.focusOn;
            if (ent) { fx = ent.cx(); fy = ent.cy(); }
          }
          CinCam.setFocus(fx ?? GAME_W / 2, fy ?? GAME_H / 2, k.zoomTo);
        }
      }

      // ── 3. One-time steps ───────────────────────────────────
      const steps = def.steps || [];
      for (let i = 0; i < steps.length; i++) {
        const step = steps[i];
        if (stepsFired[i] || t < step.at) continue;
        stepsFired[i] = true;

        // Live entity lookup at execution time
        const boss   = players ? players.find(p => p.isBoss && p.health > 0) : null;
        const target = players ? players.find(p => !p.isBoss && p.health > 0) : null;

        // run callback
        if (step.run) step.run({ t, boss, target, CinCam, CinFX });

        // dialogue shorthand
        if (step.dialogue) showBossDialogue(step.dialogue, step.dialogueDur || 180);

        // inline fx shorthand
        if (step.fx) {
          const fx = step.fx;
          if (fx.screenShake)  CinFX.shake(fx.screenShake);
          if (fx.flash)        CinFX.flash(fx.flash.color, fx.flash.alpha, fx.flash.dur || 14);
          if (fx.particles)    CinFX.particles(fx.particles.x, fx.particles.y, fx.particles.color, fx.particles.count || 30);
          if (fx.shockwave) {
            // x/y can be a function (deferred evaluation) or a number
            const sw = fx.shockwave;
            const sx = typeof sw.x === 'function' ? sw.x() : (sw.x ?? GAME_W / 2);
            const sy = typeof sw.y === 'function' ? sw.y() : (sw.y ?? GAME_H / 2);
            CinFX.shockwave(sx, sy, sw.color || '#ffffff', sw);
          }
          if (fx.groundCrack) {
            const gc = fx.groundCrack;
            const gx = typeof gc.x === 'function' ? gc.x() : gc.x;
            const gy = typeof gc.y === 'function' ? gc.y() : gc.y;
            CinFX.groundCrack(gx, gy, gc);
          }
        }
      }
    },

    onEnd() {
      slowMotion           = 1.0;
      cinematicCamOverride = false;
    },
  };
}


// ============================================================
// MID-FIGHT CINEMATICS — Creator Boss (75%, 40%, 10%)
// ============================================================

function _makeBossWarning75Cinematic(boss) {
  return cinScript({
    duration: 3.2,
    label:    { text: '— I MADE THIS WORLD —', color: '#aa44ff' },

    // Slow ramp down → near-freeze through dialogue → ramp back
    slowMo: [[0, 1.0], [0.35, 0.06], [2.8, 0.06], [3.2, 1.0]],

    cam: [
      [0,    { zoomTo: 1.0, focusOn: () => boss }],
      [0.3,  { zoomTo: 1.55, focusOn: () => boss }],
      [1.8,  { zoomTo: 1.3, focusX: GAME_W / 2, focusY: GAME_H / 2 }],
      [2.8,  { zoomTo: 1.0, focusX: GAME_W / 2, focusY: GAME_H / 2 }],
    ],

    steps: [
      // Boss rises off the ground
      { at: 0.3,
        run({ boss }) {
          if (!boss) return;
          boss.vy = -8;
          CinFX.particles(boss.cx(), boss.cy(), '#aa44ff', 25);
          CinFX.particles(boss.cx(), boss.cy(), '#ffffff', 12);
          CinFX.shake(18);
        }
      },
      // Arena hazard triggers (makes the arena feel like it's reacting)
      { at: 0.5,
        fx: { shockwave: { x: () => boss ? boss.cx() : GAME_W/2,
                           y: () => boss ? boss.cy() : GAME_H/2,
                           color: '#aa44ff', count: 3, maxR: 240 } }
      },
      { at: 0.5, run() { CinFX.arenaHazardNow(); } },
      // First dialogue line
      { at: 0.6, dialogue: 'You fight in a world I created.', dialogueDur: 160 },
      // Purple energy rings pulse from arena center
      { at: 1.0,
        fx: { shockwave: { x: GAME_W / 2, y: GAME_H / 2,
                           color: '#cc00ee', count: 2, maxR: 380, dur: 90 } }
      },
      // Second dialogue line
      { at: 1.7, dialogue: 'And I can break it.', dialogueDur: 180 },
      // Screen flash + shake for emphasis
      { at: 1.75,
        fx: { flash: { color: '#aa44ff', alpha: 0.35, dur: 10 },
              screenShake: 22 }
      },
      // Boss lands / resumes
      { at: 2.6,
        run({ boss }) {
          if (boss) CinFX.particles(boss.cx(), boss.cy(), '#cc00ee', 18);
        }
      },
    ],
  });
}


function _makeBossRage40Cinematic(boss) {
  // Capture the thrown target at the moment of the grab so camera can track it
  let _throwTarget = null;

  return cinScript({
    duration: 4.2,
    label: { text: '— ENOUGH. —', color: '#ff0044' },

    // 0–0.4: ramp to freeze; 0.4–1.2: ramp UP so throw is visible; 1.2–1.7: freeze for slam; 1.7+: crawl then resume
    slowMo: [[0, 1.0], [0.4, 0.05], [0.45, 0.05], [1.1, 0.50], [1.7, 0.05], [3.8, 0.06], [4.2, 1.0]],

    cam: [
      // Tight zoom on boss at start
      [0,   { zoomTo: 1.0, focusOn: () => boss }],
      [0.3, { zoomTo: 1.85, focusOn: () => boss }],
      // During throw: track the flying player
      [0.45, { zoomTo: 1.2, focusOn: () => _throwTarget || (players && players.find(p => !p.isBoss && p.health > 0)) }],
      // Zoom out to reveal the slam landing
      [1.0, { zoomTo: 0.95, focusX: GAME_W / 2, focusY: GAME_H / 2 }],
      // Settle back during dialogue
      [1.8, { zoomTo: 1.35, focusOn: () => boss }],
      [3.8, { zoomTo: 1.0,  focusX: GAME_W / 2, focusY: GAME_H / 2 }],
    ],

    steps: [
      // Pre-grab: boss glows red
      { at: 0.25,
        run({ boss }) {
          if (!boss) return;
          CinFX.particles(boss.cx(), boss.cy(), '#ff0044', 20);
          CinFX.shake(14);
        }
      },
      // Teleport boss directly behind the player and hurl them
      { at: 0.42,
        run({ boss, target }) {
          if (!boss || !target) return;
          _throwTarget = target;
          // Teleport boss to just behind the player's back
          const facingRight = target.vx >= 0;
          const behindX     = facingRight ? target.cx() - 52 : target.cx() + 52;
          boss.x  = behindX - boss.w / 2;
          boss.y  = target.y;
          boss.vy = 0;
          // Portal burst at new boss position
          CinFX.particles(boss.cx(), boss.cy(), '#cc00ee', 40);
          CinFX.particles(boss.cx(), boss.cy(), '#ff44ff', 18);
          CinFX.shake(24);
          CinFX.flash('#ff2200', 0.25, 8);
          // Hurl player away — arc across the arena
          const throwDir = facingRight ? 1 : -1;
          target.vx       = throwDir * 20;
          target.vy       = -13;
          target.hurtTimer  = Math.max(target.hurtTimer || 0, 32);
          target.stunTimer  = Math.max(target.stunTimer  || 0, 28);
        }
      },
      // Trail particles chasing the thrown player during flight (two pulses)
      { at: 0.65,
        run() {
          if (_throwTarget) CinFX.particles(_throwTarget.cx(), _throwTarget.cy(), '#ff4400', 22);
        }
      },
      { at: 0.90,
        run() {
          if (_throwTarget) CinFX.particles(_throwTarget.cx(), _throwTarget.cy(), '#ff8800', 15);
        }
      },
      // Boss slam: boss drops hard toward where the player will land
      { at: 1.1,
        run({ boss }) {
          if (!boss) return;
          boss.vy = 30; // hard slam down
          CinFX.flash('#ffffff', 0.45, 10);
          CinFX.shake(52);
        }
      },
      // Shockwave + ground cracks at impact zone
      { at: 1.15,
        fx: {
          shockwave:   { x: () => boss ? boss.cx() : GAME_W/2,
                         y: GAME_H - 60, color: '#ff0044', count: 5, maxR: 320, lw: 5, dur: 80 },
          groundCrack: { x: () => boss ? boss.cx() : GAME_W/2,
                         y: GAME_H - 65, color: '#cc2200', count: 7 },
        }
      },
      // Shockwave knocks the thrown player further
      { at: 1.15,
        run({ boss }) {
          if (!boss) return;
          CinFX.particles(boss.cx(), GAME_H - 60, '#ff0044', 55);
          CinFX.particles(boss.cx(), GAME_H - 60, '#ffffff', 28);
          for (const p of players) {
            if (p.isBoss || p.health <= 0) continue;
            const dir = p.cx() >= boss.cx() ? 1 : -1;
            p.vx += dir * 13;
            p.vy  = Math.min(p.vy || 0, -9);
            p.hurtTimer = Math.max(p.hurtTimer || 0, 18);
          }
        }
      },
      // Dialogue
      { at: 1.55, dialogue: 'Enough.',           dialogueDur: 140 },
      { at: 2.30, dialogue: 'I will ERASE you.', dialogueDur: 220 },
      // Second dramatic shake for the line delivery
      { at: 2.35, fx: { flash: { color: '#ff0044', alpha: 0.3, dur: 8 }, screenShake: 26 } },
    ],
  });
}


function _makeBossDesp10Cinematic(boss) {
  return cinScript({
    duration: 3.5,
    label: { text: '— IMPOSSIBLE —', color: '#ff8800' },

    slowMo: [[0, 1.0], [0.3, 0.05], [3.1, 0.05], [3.5, 1.0]],

    cam: [
      [0,   { zoomTo: 1.0, focusX: GAME_W / 2, focusY: GAME_H / 2 }],
      [0.25, { zoomTo: 1.6, focusOn: () => boss }],
      [2.8,  { zoomTo: 1.0, focusX: GAME_W / 2, focusY: GAME_H / 2 }],
    ],

    steps: [
      // Boss staggers — visual jolt
      { at: 0.3,
        run({ boss }) {
          if (!boss) return;
          boss.vx += (Math.random() - 0.5) * 10;
          boss.vy  = -5;
          boss.hurtTimer = Math.max(boss.hurtTimer || 0, 18);
          CinFX.particles(boss.cx(), boss.cy(), '#ff8800', 30);
          CinFX.particles(boss.cx(), boss.cy(), '#ffff00', 15);
          CinFX.shake(30);
          CinFX.flash('#ff8800', 0.30, 12);
        }
      },
      // Ground cracks radiate from boss impact
      { at: 0.35,
        fx: {
          groundCrack: { x: () => boss ? boss.cx() : GAME_W/2,
                         y: GAME_H - 65, color: '#cc4400', count: 9 },
          shockwave:   { x: () => boss ? boss.cx() : GAME_W/2,
                         y: () => boss ? boss.cy() : GAME_H/2,
                         color: '#ff6600', count: 4, maxR: 260 }
        }
      },
      // Desperation mode activates
      { at: 0.5,
        run() {
          if (typeof bossDesperationMode !== 'undefined') bossDesperationMode = true;
          CinFX.particles(GAME_W / 2, GAME_H / 2, '#ff8800', 40);
          CinFX.shake(20);
        }
      },
      // Red arena tint rings
      { at: 0.6,
        fx: { shockwave: { x: GAME_W / 2, y: GAME_H / 2,
                           color: '#ff4400', count: 3, maxR: 450, dur: 100 } }
      },
      { at: 1.0, dialogue: 'Impossible…',              dialogueDur: 160 },
      { at: 1.85, dialogue: 'You refuse to break!',    dialogueDur: 200 },
      { at: 1.9,
        fx: { flash: { color: '#ff8800', alpha: 0.40, dur: 10 }, screenShake: 32 }
      },
      // Final crack burst
      { at: 2.6,
        fx: { groundCrack: { x: GAME_W / 2, y: GAME_H - 65, color: '#ff4400', count: 6 } }
      },
    ],
  });
}


// ============================================================
// MID-FIGHT CINEMATICS — True Form (entry, 50%, 15%)
// ============================================================

function _makeTFEntryCinematic(tf) {
  return cinScript({
    duration: 4.0,
    label: { text: '— TRUE POWER —', color: '#ffffff' },

    slowMo: [[0, 1.0], [0.4, 0.04], [3.5, 0.04], [4.0, 1.0]],

    cam: [
      [0,    { zoomTo: 1.0, focusX: GAME_W / 2, focusY: GAME_H / 2 }],
      [0.3,  { zoomTo: 1.7, focusOn: () => tf }],
      [2.0,  { zoomTo: 1.1, focusX: GAME_W / 2, focusY: GAME_H / 2 }],
      [3.5,  { zoomTo: 1.0, focusX: GAME_W / 2, focusY: GAME_H / 2 }],
    ],

    steps: [
      // Energy burst from TF
      { at: 0.35,
        run({ boss: tf }) {
          if (!tf) return;
          tf.vy = -10;
          CinFX.particles(tf.cx(), tf.cy(), '#ffffff', 55);
          CinFX.particles(tf.cx(), tf.cy(), '#000000', 30);
          CinFX.shake(35);
          CinFX.flash('#ffffff', 0.55, 16);
        }
      },
      // Expanding black/white rings
      { at: 0.38,
        fx: { shockwave: { x: () => tf ? tf.cx() : GAME_W/2,
                           y: () => tf ? tf.cy() : GAME_H/2,
                           color: '#ffffff', count: 5, maxR: 400, lw: 5, dur: 90 } }
      },
      // Blast wave that pushes human players back
      { at: 0.4,
        run({ boss: tf }) {
          if (!tf) return;
          for (const p of players) {
            if (p.isBoss || p.health <= 0) continue;
            const dir = p.cx() >= tf.cx() ? 1 : -1;
            p.vx      = dir * 22;
            p.vy      = -14;
            p.hurtTimer = Math.max(p.hurtTimer || 0, 20);
          }
        }
      },
      { at: 0.5,
        fx: { shockwave: { x: () => tf ? tf.cx() : GAME_W/2,
                           y: () => tf ? tf.cy() : GAME_H/2,
                           color: '#000000', count: 3, maxR: 320, dur: 70 } }
      },
      { at: 1.0, dialogue: 'You forced my hand.', dialogueDur: 170 },
      // Mid-cinematic second ring burst
      { at: 1.5,
        fx: { shockwave: { x: GAME_W / 2, y: GAME_H / 2,
                           color: '#888888', count: 2, maxR: 500, dur: 110 },
              screenShake: 18 }
      },
      { at: 1.9, dialogue: 'Witness my TRUE POWER.', dialogueDur: 200 },
      { at: 1.95, fx: { flash: { color: '#ffffff', alpha: 0.45, dur: 10 } } },
      // Ground cracks from the void energy
      { at: 2.2,
        fx: { groundCrack: { x: () => tf ? tf.cx() : GAME_W/2,
                             y: GAME_H - 65, color: '#888888', count: 8 } }
      },
    ],
  });
}


function _makeTFReality50Cinematic(tf) {
  return cinScript({
    duration: 4.0,
    label: { text: '— REALITY BENDS —', color: '#8844ff' },

    slowMo: [[0, 1.0], [0.35, 0.05], [3.5, 0.05], [4.0, 1.0]],

    // Orbit camera around the arena during the gravity inversion reveal
    orbit: { cx: GAME_W / 2, cy: GAME_H / 2, radius: 80, speed: 0.55, zoom: 1.3, start: 0.5 },

    cam: [
      // Snap to TF before orbit kicks in
      [0,   { zoomTo: 1.0, focusOn: () => tf }],
      [0.3, { zoomTo: 1.5, focusOn: () => tf }],
    ],

    steps: [
      // TF energy pulse
      { at: 0.3,
        run({ boss: tf }) {
          if (!tf) return;
          CinFX.particles(tf.cx(), tf.cy(), '#8844ff', 35);
          CinFX.particles(tf.cx(), tf.cy(), '#ffffff', 20);
          CinFX.shake(25);
          CinFX.flash('#8844ff', 0.35, 10);
        }
      },
      { at: 0.35,
        fx: { shockwave: { x: () => tf ? tf.cx() : GAME_W/2,
                           y: () => tf ? tf.cy() : GAME_H/2,
                           color: '#8844ff', count: 4, maxR: 300 } }
      },
      { at: 0.8, dialogue: 'Reality…', dialogueDur: 140 },
      // Gravity inverts for 3 seconds
      { at: 1.0,
        run() {
          if (typeof tfGravityInverted !== 'undefined') {
            tfGravityInverted = true;
            // Auto-restore after ~3s (180 frames) — we hijack the TF desperation check
            // TrueForm.updateAI already handles tfGravityInverted duration; just set a timer
            if (typeof mapPerkState !== 'undefined') mapPerkState._cinGravTimer = 240;
          }
          CinFX.shake(38);
          CinFX.flash('#ffffff', 0.40, 14);
        }
      },
      { at: 1.0,
        fx: { shockwave: { x: GAME_W / 2, y: GAME_H / 2,
                           color: '#ffffff', count: 6, maxR: 500, lw: 6, dur: 100 } }
      },
      { at: 1.5, dialogue: '…bends to me.', dialogueDur: 180 },
      // Second arena-wide ring
      { at: 2.0,
        fx: { shockwave: { x: GAME_W / 2, y: GAME_H / 2,
                           color: '#440088', count: 2, maxR: 600, dur: 120 },
              screenShake: 20 }
      },
      // Spawn a black hole for drama
      { at: 2.5,
        run() {
          if (typeof tfBlackHoles !== 'undefined') {
            tfBlackHoles.push({ x: GAME_W / 2, y: GAME_H / 2 - 40,
              radius: 0, maxRadius: 45, timer: 360, pullStrength: 0.6, phase: 'grow' });
          }
        }
      },
    ],
  });
}


function _makeTFDesp15Cinematic(tf) {
  return cinScript({
    duration: 4.2,
    label: { text: '— WE FALL TOGETHER —', color: '#ff0044' },

    // Extreme slow-mo throughout, brief normal-speed flash on impact
    slowMo: [[0, 1.0], [0.3, 0.03], [4.0, 0.03], [4.2, 1.0]],

    cam: [
      [0,    { zoomTo: 1.0, focusX: GAME_W / 2, focusY: GAME_H / 2 }],
      [0.25, { zoomTo: 0.75, focusX: GAME_W / 2, focusY: GAME_H / 2 }], // zoom OUT — show full arena
      [1.5,  { zoomTo: 1.5, focusOn: () => tf }],
      [3.8,  { zoomTo: 1.0, focusX: GAME_W / 2, focusY: GAME_H / 2 }],
    ],

    steps: [
      // TF screams — full-arena energy burst
      { at: 0.3,
        run({ boss: tf }) {
          if (!tf) return;
          CinFX.particles(tf.cx(), tf.cy(), '#ffffff', 60);
          CinFX.particles(tf.cx(), tf.cy(), '#000000', 40);
          CinFX.particles(tf.cx(), tf.cy(), '#ff0044', 30);
          CinFX.shake(55);
          CinFX.flash('#ffffff', 0.70, 18);
        }
      },
      // Massive concentric ring explosion
      { at: 0.3,
        fx: { shockwave: { x: () => tf ? tf.cx() : GAME_W/2,
                           y: () => tf ? tf.cy() : GAME_H/2,
                           color: '#ff0044', count: 6, maxR: 600, lw: 7, dur: 110 } }
      },
      { at: 0.35,
        fx: { shockwave: { x: GAME_W / 2, y: GAME_H / 2,
                           color: '#ffffff', count: 4, maxR: 700, lw: 4, dur: 130 } }
      },
      // Floor removal (10 seconds)
      { at: 0.5,
        run() {
          if (typeof tfFloorRemoved !== 'undefined') {
            tfFloorRemoved  = true;
            tfFloorTimer    = 600; // 10s
          }
          CinFX.groundCrack(GAME_W / 2, GAME_H - 65, { color: '#ff0044', count: 12 });
          CinFX.groundCrack(GAME_W * 0.25, GAME_H - 65, { color: '#ff4400', count: 7 });
          CinFX.groundCrack(GAME_W * 0.75, GAME_H - 65, { color: '#ff4400', count: 7 });
        }
      },
      // Desperation mode
      { at: 0.55,
        run() {
          if (typeof bossDesperationMode !== 'undefined') bossDesperationMode = true;
          CinFX.flash('#ff0044', 0.50, 12);
        }
      },
      // Spawn two black holes flanking the arena
      { at: 0.8,
        run() {
          if (typeof tfBlackHoles !== 'undefined') {
            tfBlackHoles.push({ x: GAME_W * 0.2, y: GAME_H / 2,
              radius: 0, maxRadius: 50, timer: 480, pullStrength: 0.8, phase: 'grow' });
            tfBlackHoles.push({ x: GAME_W * 0.8, y: GAME_H / 2,
              radius: 0, maxRadius: 50, timer: 480, pullStrength: 0.8, phase: 'grow' });
          }
        }
      },
      // Additional crack wave
      { at: 1.0,
        fx: { shockwave: { x: GAME_W / 2, y: GAME_H / 2,
                           color: '#880022', count: 3, maxR: 550, dur: 100 },
              screenShake: 30 }
      },
      { at: 1.4, dialogue: 'Then…',               dialogueDur: 120 },
      { at: 2.0, dialogue: 'we fall TOGETHER!',    dialogueDur: 220 },
      { at: 2.05, fx: { flash: { color: '#ff0044', alpha: 0.55, dur: 12 }, screenShake: 40 } },
      // Final ring sweep
      { at: 3.0,
        fx: { shockwave: { x: GAME_W / 2, y: GAME_H / 2,
                           color: '#ff0044', count: 3, maxR: 700, dur: 140 } }
      },
    ],
  });
}
