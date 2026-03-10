'use strict';

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
