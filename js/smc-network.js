'use strict';

// ============================================================
// NETWORK MANAGER — WebSocket multiplayer via Socket.IO
// ============================================================
const NetworkManager = (function() {
  let _socket = null;
  let _slot   = 0;     // 1 = this client controls p1; 2 = this client controls p2
  let _room   = null;
  let _connected = false;
  let _sendTimer = 0;
  // Interpolation buffer for remote player state
  const _buf = [];  // [ {ts, x, y, vx, vy, health, maxHealth, state, facing, color, weaponKey, charClass, lives, hat, cape, curses} ]
  const MAX_BUF = 12;

  function _pushBuf(state) {
    state.ts = Date.now();
    _buf.push(state);
    while (_buf.length > MAX_BUF) _buf.shift();
  }

  function _lerp(a, b, t) { return a + (b - a) * t; }

  return {
    get connected()   { return _connected; },
    get slot()        { return _slot; },
    get room()        { return _room; },
    get socket()      { return _socket; },

    connect(serverUrl, roomCode, onJoined, onBothConnected, onRemoteState, onRemoteHit, onRemoteEvent, onDisconnect) {
      if (_socket) { _socket.disconnect(); _socket = null; }
      _connected = false;
      _slot = 0; _room = null;
      /* global io */
      if (typeof io === 'undefined') {
        console.error('Socket.IO not loaded');
        return;
      }
      _socket = io(serverUrl, { transports: ['websocket'], reconnectionAttempts: 3 });

      _socket.on('connect', () => {
        _socket.emit('joinRoom', roomCode.trim().toLowerCase());
      });

      _socket.on('joined', (data) => {
        _slot = data.slot;
        _room = data.roomCode;
        _connected = true;
        if (onJoined) onJoined(data.slot);
      });

      _socket.on('bothConnected', () => {
        if (onBothConnected) onBothConnected();
      });

      _socket.on('remoteState', (state) => {
        _pushBuf(state);
        if (onRemoteState) onRemoteState(state);
      });

      _socket.on('remoteHit', (ev) => {
        if (onRemoteHit) onRemoteHit(ev);
      });

      _socket.on('remoteGameEvent', (ev) => {
        if (onRemoteEvent) onRemoteEvent(ev);
      });

      _socket.on('opponentDisconnected', () => {
        _connected = false;
        if (onDisconnect) onDisconnect();
      });

      _socket.on('roomFull', () => {
        _connected = false;
        const el = document.getElementById('onlineStatus');
        if (el) el.textContent = '❌ Room is full — try a different code.';
      });

      _socket.on('connect_error', (err) => {
        _connected = false;
        const el = document.getElementById('onlineStatus');
        if (el) el.textContent = `❌ Cannot connect: ${err.message}`;
      });

      _socket.on('disconnect', () => {
        _connected = false;
        if (onDisconnect) onDisconnect();
      });
    },

    disconnect() {
      if (_socket) { _socket.disconnect(); _socket = null; }
      _connected = false; _slot = 0; _room = null;
      _buf.length = 0;
    },

    // Send local player state to server (call at ~20Hz)
    sendState(p) {
      if (!_socket || !_connected || !p) return;
      _socket.emit('playerState', {
        x: p.x, y: p.y, vx: p.vx, vy: p.vy,
        health: p.health, maxHealth: p.maxHealth,
        state: p.state, facing: p.facing,
        color: p.color, weaponKey: p.weaponKey,
        charClass: p.charClass || 'none',
        lives: p.lives,
        hat: p.hat || 'none', cape: p.cape || 'none',
        name: p.name || (_slot === 1 ? 'P1' : 'P2'),
        curses: (p.curses || []).map(c => ({ type: c.type, timer: c.timer })),
      });
    },

    // Send a hit event (damage dealt by local player to remote)
    sendHit(dmg, kb, kbDir) {
      if (!_socket || !_connected) return;
      _socket.emit('hitEvent', { dmg, kb, kbDir, ts: Date.now() });
    },

    // Send a generic game event
    sendGameEvent(type, data) {
      if (!_socket || !_connected) return;
      _socket.emit('gameEvent', { type, data, ts: Date.now() });
    },

    // Get the interpolated state of the remote player (call each render frame)
    getRemoteState() {
      if (_buf.length === 0) return null;
      if (_buf.length === 1) return _buf[0];
      const now = Date.now() - 130; // 130ms interpolation delay (prevents teleporting)
      let lo = _buf[0], hi = _buf[_buf.length - 1];
      for (let i = 0; i < _buf.length - 1; i++) {
        if (_buf[i].ts <= now && _buf[i + 1].ts >= now) {
          lo = _buf[i]; hi = _buf[i + 1]; break;
        }
      }
      if (lo === hi) return hi;
      const dt = hi.ts - lo.ts;
      const t  = dt > 0 ? Math.min(1, (now - lo.ts) / dt) : 1;
      return {
        x:         _lerp(lo.x,  hi.x,  t),
        y:         _lerp(lo.y,  hi.y,  t),
        vx:        _lerp(lo.vx, hi.vx, t),
        vy:        _lerp(lo.vy, hi.vy, t),
        health:    hi.health, maxHealth: hi.maxHealth,
        state:     hi.state,  facing: hi.facing,
        color:     hi.color,  weaponKey: hi.weaponKey,
        charClass: hi.charClass, lives: hi.lives,
        hat:       hi.hat,    cape: hi.cape,
        name:      hi.name,   curses: hi.curses || [],
      };
    },

    // Called every game frame — sends state at 20Hz (every 3 frames at 60fps)
    tick(localPlayer) {
      _sendTimer++;
      if (_sendTimer >= 3) {
        _sendTimer = 0;
        this.sendState(localPlayer);
      }
    },
  };
})();

// ============================================================
// ONLINE MULTIPLAYER — connection + mode setup
// ============================================================
function networkJoinRoom() {
  const serverUrl  = (document.getElementById('onlineServerUrl')?.value || 'http://localhost:3001').trim();
  const roomCode   = (document.getElementById('onlineRoomCode')?.value || '').trim().toUpperCase();
  const statusEl   = document.getElementById('onlineStatus');
  if (!roomCode) { if (statusEl) statusEl.textContent = '⚠ Enter a room code first.'; return; }
  if (statusEl) statusEl.textContent = '⏳ Connecting…';

  NetworkManager.connect(
    serverUrl,
    roomCode,
    // onJoined
    (slot) => {
      onlineLocalSlot = slot;
      onlineMode = true;
      if (statusEl) statusEl.textContent = slot === 1
        ? `✅ Joined as P1 — waiting for opponent…`
        : `✅ Joined as P2 — waiting for host…`;
      // Show game-mode selector only to host
      const modeRow = document.getElementById('onlineGameModeRow');
      if (modeRow) modeRow.style.display = slot === 1 ? 'flex' : 'none';
      // Show chat immediately for both players
      const chatEl = document.getElementById('onlineChat');
      if (chatEl) chatEl.style.display = 'flex';
    },
    // onBothConnected
    () => {
      if (statusEl) statusEl.textContent = '🎮 Both connected! Starting…';
      onlineReady = true;
      // Guest adopts whatever mode the host selected
      if (onlineLocalSlot !== 1) {
        gameMode = _onlineGameMode;
        selectMode(gameMode);
      }
      setTimeout(() => startGame(), 600);
    },
    // onRemoteState — handled per-frame via getRemoteState()
    null,
    // onRemoteHit
    (ev) => {
      if (!gameRunning || !onlineMode) return;
      // Attacker hit us — apply damage to our local fighter
      const me = players.find(p => !p.isRemote);
      if (me && me.health > 0) {
        me.health    = Math.max(0, me.health - (ev.dmg || 0));
        me.vx       += (ev.kbDir || 1) * (ev.kb || 0);
        me.vy        = Math.min(me.vy, -(ev.kb || 0) * 0.5);
        me.hurtTimer = 14;
        if (settings.screenShake) screenShake = Math.max(screenShake, Math.min(ev.dmg * 0.5, 18));
        if (settings.dmgNumbers)  damageTexts.push({ x: me.cx(), y: me.y, val: ev.dmg, timer: 45, color: '#ff4444' });
        spawnParticles(me.cx(), me.cy(), me.color, Math.min(ev.dmg, 16));
        SoundManager.hit();
      }
    },
    // onRemoteGameEvent
    (ev) => {
      if (!onlineMode) return;
      // Achievement sync — runs even in menu
      if (ev.type === 'achievementUnlocked') {
        if (ev.data?.id && !earnedAchievements.has(ev.data.id)) unlockAchievement(ev.data.id);
        return;
      }
      // Chat message — runs even outside game
      if (ev.type === 'chat') {
        _appendChatMsg(ev.data?.name || 'P2', ev.data?.text || '');
        return;
      }
      // Host broadcasts chosen game mode before start
      if (ev.type === 'gameModeSelected') {
        _onlineGameMode = ev.data?.mode || '2p';
        gameMode = _onlineGameMode;
        selectMode(gameMode);
        return;
      }
      if (!gameRunning) return;
      if (ev.type === 'respawn') {
        const remote = players.find(p => p.isRemote);
        if (remote) {
          remote.health = remote.maxHealth;
          remote.hurtTimer = 0; remote.stunTimer = 0; remote.ragdollTimer = 0;
        }
      }
    },
    // onDisconnect
    () => {
      if (gameRunning && onlineMode) {
        endGame();
        showToast('Opponent disconnected', 3000);
      } else {
        const statusEl = document.getElementById('onlineStatus');
        if (statusEl) statusEl.textContent = '🔌 Disconnected from server.';
      }
    },
  );
}

function setOnlineGameMode(mode) {
  _onlineGameMode = mode;
  gameMode = mode;
  selectMode(mode);
  // Update button active states
  document.querySelectorAll('#onlineGameModeRow .btn').forEach(b => {
    b.classList.toggle('active', b.dataset.mode === mode);
  });
  // Broadcast to guest if connected
  if (NetworkManager.connected) {
    NetworkManager.sendGameEvent('gameModeSelected', { mode });
  }
}

function sendChatMsg() {
  const inp = document.getElementById('chatInput');
  if (!inp) return;
  const text = inp.value.trim();
  if (!text) return;
  inp.value = '';
  const name = onlineLocalSlot === 1 ? 'P1' : 'P2';
  _appendChatMsg(name, text);
  if (NetworkManager.connected) {
    NetworkManager.sendGameEvent('chat', { name, text });
  }
}

function onChatKey(e) {
  if (e.key === 'Enter') { e.preventDefault(); sendChatMsg(); }
}

function _appendChatMsg(name, text) {
  const box = document.getElementById('chatMessages');
  if (!box) return;
  const line = document.createElement('div');
  line.style.cssText = 'font-size:0.72rem;line-height:1.3;word-break:break-word;';
  const nameEl = document.createElement('span');
  nameEl.style.cssText = `color:${name === 'P1' ? '#66aaff' : '#ff8844'};font-weight:bold;margin-right:4px;`;
  nameEl.textContent = name + ':';
  const textEl = document.createElement('span');
  textEl.style.color = '#dde';
  textEl.textContent = text;
  line.appendChild(nameEl);
  line.appendChild(textEl);
  box.appendChild(line);
  box.scrollTop = box.scrollHeight;
}

function showToast(msg, duration) {
  const el = document.createElement('div');
  el.style.cssText = 'position:fixed;top:60px;left:50%;transform:translateX(-50%);background:rgba(0,0,0,0.82);color:#fff;padding:10px 22px;border-radius:22px;font-size:0.9rem;z-index:900;pointer-events:none;';
  el.textContent = msg;
  document.body.appendChild(el);
  setTimeout(() => { el.style.opacity = '0'; el.style.transition = 'opacity 0.5s'; setTimeout(() => el.remove(), 500); }, duration || 2500);
}
