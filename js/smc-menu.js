'use strict';


// ============================================================
// ============================================================
// TUTORIAL MODE
// ============================================================
const TUTORIAL_STEPS = [
  {
    id: 'move',
    title: 'Step 1 — Move',
    keys: 'A / D',
    desc: ['Walk left and right to move around.', 'Use A (left) and D (right), or arrow keys.'],
    check: (f) => f.moved,
  },
  {
    id: 'jump',
    title: 'Step 2 — Jump',
    keys: 'W',
    desc: ['Press W (or ↑) to jump!'],
    check: (f) => f.jumped,
  },
  {
    id: 'djump',
    title: 'Step 3 — Double Jump',
    keys: 'W + W',
    desc: ['Jump first, then press W again', 'while airborne for a second jump!'],
    check: (f) => f.dblJumped,
  },
  {
    id: 'shield',
    title: 'Step 4 — Shield',
    keys: 'S  (hold)',
    desc: ['Hold S (or ↓) to raise your shield.', 'Blocks incoming attacks. 30-second cooldown.'],
    check: (f) => f.shielded,
  },
  {
    id: 'attack',
    title: 'Step 5 — Attack',
    keys: 'Space',
    desc: ['Press Space (or Enter) to attack!', 'A training dummy appeared — go hit it!'],
    check: (f) => f.hitDummy,
    onEnter: () => {
      const existing = trainingDummies.find(d => d.health > 0);
      const dummy = existing || new Dummy(640, 300);
      if (!existing) { dummy.playerNum = 2; dummy.name = 'DUMMY'; trainingDummies.push(dummy); }
      if (players[0]) { players[0].target = dummy; dummy.target = players[0]; }
    },
  },
  {
    id: 'ability',
    title: 'Step 6 — Weapon Ability',
    keys: 'Q',
    desc: ['Every weapon has a special ability.', 'Press Q (or .) to activate yours on the dummy!'],
    check: (f) => f.abilityUsed,
    onEnter: () => {
      // Ensure dummy still exists and player has a target
      if (players[0] && (!trainingDummies.length || trainingDummies.every(d => d.health <= 0))) {
        const dummy = new Dummy(640, 300);
        dummy.playerNum = 2; dummy.name = 'DUMMY';
        trainingDummies.push(dummy);
      }
      if (players[0] && trainingDummies[0]) {
        players[0].target = trainingDummies[0];
        trainingDummies[0].target = players[0];
      }
    },
  },
  {
    id: 'super',
    title: 'Step 7 — Super Move',
    keys: 'E',
    desc: ['Your super meter is fully charged!', 'Press E (or /) to unleash your super move!'],
    check: (f) => f.superUsed,
    onEnter: () => {
      const p = players[0];
      if (p) { p.superMeter = 100; p.superReady = true; p.superFlashTimer = 90; }
    },
  },
  {
    id: 'weapons',
    title: 'Weapons',
    keys: '',
    desc: ['Each weapon has unique attacks, abilities,', 'and supers. Sword, Hammer, Gun, Axe, Spear,', 'Bow, Shield, and Scythe are all available!'],
    check: null,
    autoAdvance: 320,
  },
  {
    id: 'classes',
    title: 'Classes',
    keys: '',
    desc: ['Classes give passive bonuses and a perk at', 'low HP. Archer forces Bow, Paladin forces Shield.', 'Berserker, Kratos, Ninja — each plays differently!'],
    check: null,
    autoAdvance: 320,
  },
  {
    id: 'class_ability',
    title: 'Class Perks',
    keys: '',
    desc: ['At low HP, your class activates a special perk.', 'Ninja vanishes, Berserker enters Blood Frenzy,', 'Archer backsteps — use your perk wisely!'],
    check: null,
    autoAdvance: 320,
  },
  {
    id: 'modes',
    title: 'Game Modes',
    keys: '',
    desc: ['1v1: Fight a friend or AI bot.', 'Boss Fight: Challenge the Creator.', 'Training: Practice freely with dummies.'],
    check: null,
    autoAdvance: 280,
  },
  {
    id: 'lore',
    title: 'A Word of Warning...',
    keys: '',
    desc: ['The one who trained you... is the Boss.', 'He built this arena. He knows every move.', 'Defeat him if you dare.'],
    check: null,
    autoAdvance: 360,
  },
  {
    id: 'done',
    title: "You're Ready!",
    keys: '',
    desc: ['You know the basics — good luck!', 'Head to Training to practice further,', 'or jump straight into a match!'],
    check: null,
    autoAdvance: 200,
  },
];

function advanceTutorialStep() {
  tutorialStep++;
  tutorialStepTimer = 0;
  tutStepComplete   = false;
  const next = TUTORIAL_STEPS[tutorialStep];
  if (next && next.onEnter) next.onEnter();
  if (tutorialStep >= TUTORIAL_STEPS.length) {
    tutorialMode = false;
    if (typeof markTutorialDone === 'function') markTutorialDone();
    backToMenu();
  }
}

function updateTutorial() {
  if (!tutorialMode || !gameRunning) return;
  const p = players[0];
  if (!p) return;
  const step = TUTORIAL_STEPS[tutorialStep];
  if (!step) return;

  tutorialStepTimer++;

  // Per-step flag detection (only set flags during the relevant step)
  if (step.id === 'move'    && !tutorialFlags.moved      && Math.abs(p.vx) > 1.5) tutorialFlags.moved = true;
  if (step.id === 'jump'    && !tutorialFlags.jumped     && !p.onGround && tutPrevOnGround && p.vy < 0) tutorialFlags.jumped = true;
  if (step.id === 'djump'   && !tutorialFlags.dblJumped  && !p.canDoubleJump && tutPrevCanDblJump && !p.onGround) tutorialFlags.dblJumped = true;
  if (step.id === 'dash'    && !tutorialFlags.dashed     && !p.onGround && (p.vy < -19 || Math.abs(p.vx) > 14)) tutorialFlags.dashed = true;
  if (step.id === 'shield'  && !tutorialFlags.shielded   && p.shielding) tutorialFlags.shielded = true;
  if (step.id === 'attack'  && !tutorialFlags.hitDummy   && trainingDummies.some(d => d.health < d.maxHealth)) tutorialFlags.hitDummy = true;
  if (step.id === 'ability' && !tutorialFlags.abilityUsed && abilityFlashTimer > 0 && abilityFlashPlayer === p) tutorialFlags.abilityUsed = true;
  if (step.id === 'super'   && !tutorialFlags.superUsed  && p.superActive) tutorialFlags.superUsed = true;

  tutPrevOnGround   = p.onGround;
  tutPrevCanDblJump = p.canDoubleJump;

  // Mark step complete (once) and reset timer for the advance delay
  if (!tutStepComplete && step.check && step.check(tutorialFlags)) {
    tutStepComplete   = true;
    tutorialStepTimer = 0;
  }

  const shouldAdvance =
    (tutStepComplete && tutorialStepTimer >= 50) ||
    (step.autoAdvance && tutorialStepTimer >= step.autoAdvance);

  if (shouldAdvance) advanceTutorialStep();
}

function drawTutorial() {
  if (!tutorialMode) return;
  const step = TUTORIAL_STEPS[tutorialStep];
  if (!step) return;

  ctx.save();

  // Push panel below the HTML HUD bar (≈88 game-units keeps it below HUD)
  const PX = 12, PY = 88;
  const PW = GAME_W - 24;
  const keyH = step.keys ? 20 : 0;
  const PH   = 24 + keyH + step.desc.length * 16 + 18;

  // Panel background
  ctx.globalAlpha = 0.92;
  ctx.fillStyle   = '#07071a';
  ctx.fillRect(PX, PY, PW, PH);
  ctx.globalAlpha = 0.75;
  ctx.strokeStyle = tutStepComplete ? '#44ff88' : '#7733bb';
  ctx.lineWidth   = 1.5;
  ctx.strokeRect(PX, PY, PW, PH);
  ctx.globalAlpha = 1;

  // Progress dots (top-right)
  const total   = TUTORIAL_STEPS.length;
  const dotGap  = 13;
  const dotsW   = total * dotGap;
  const dotSX   = PX + PW - dotsW - 8;
  const dotCY   = PY + 10;
  for (let i = 0; i < total; i++) {
    ctx.beginPath();
    const r = (i === tutorialStep) ? 4 : 2.5;
    ctx.arc(dotSX + i * dotGap, dotCY, r, 0, Math.PI * 2);
    ctx.fillStyle = i < tutorialStep
      ? '#7733bb'
      : (i === tutorialStep ? (tutStepComplete ? '#44ff88' : '#ffffff') : '#252540');
    ctx.fill();
  }

  // Title
  ctx.fillStyle = tutStepComplete ? '#44ff88' : '#ffffff';
  ctx.font      = 'bold 14px Arial';
  ctx.textAlign = 'left';
  ctx.fillText(step.title, PX + 14, PY + 17);

  // Key badge
  let descOffsetY = PY + 26;
  if (step.keys) {
    const bx = PX + 14, by = descOffsetY;
    const bw = step.keys.length * 7.5 + 14, bh = 16;
    ctx.fillStyle   = '#1a0933';
    ctx.fillRect(bx, by, bw, bh);
    ctx.strokeStyle = '#6633aa';
    ctx.lineWidth   = 1;
    ctx.strokeRect(bx, by, bw, bh);
    ctx.fillStyle = '#ffcc44';
    ctx.font      = 'bold 11px monospace';
    ctx.fillText(step.keys, bx + 7, by + 11);
    descOffsetY = by + bh + 6;
  }

  // Description lines
  ctx.fillStyle = '#b0b0cc';
  ctx.font      = '12px Arial';
  step.desc.forEach((line, i) => ctx.fillText(line, PX + 14, descOffsetY + i * 16 + 11));

  // Footer
  ctx.textAlign = 'right';
  if (tutStepComplete) {
    ctx.fillStyle = '#44ff88';
    ctx.font      = 'bold 12px Arial';
    ctx.fillText('Done! Advancing...', PX + PW - 10, PY + PH - 5);
  } else if (step.autoAdvance) {
    // progress bar
    const prog = Math.min(tutorialStepTimer / step.autoAdvance, 1);
    ctx.fillStyle = '#1a1a33';
    ctx.fillRect(PX + 14, PY + PH - 7, PW - 28, 4);
    ctx.fillStyle = '#7733bb';
    ctx.fillRect(PX + 14, PY + PH - 7, (PW - 28) * prog, 4);
  } else {
    ctx.fillStyle = '#444466';
    ctx.font      = '10px Arial';
    ctx.fillText('Tab — skip step', PX + PW - 10, PY + PH - 5);
  }

  ctx.restore();
}

// ============================================================
// MENU UI HANDLERS
// ============================================================
function selectMode(mode) {
  // 'bot' is no longer a separate mode — merge into '2p' with bot toggles
  if (mode === 'bot') mode = '2p';
  gameMode = mode;
  document.querySelectorAll('.mode-card').forEach(c => c.classList.remove('active'));
  const modeCard = document.querySelector(`[data-mode="${mode}"]`);
  if (modeCard) modeCard.classList.add('active');
  const isBoss       = mode === 'boss';
  const isTrueForm   = mode === 'trueform';
  const isBoss2p     = isBoss && bossPlayerCount === 2;
  const isTraining   = mode === 'training';
  const isTutorial   = mode === 'tutorial';
  const isMinigames  = mode === 'minigames';
  const isOnline     = mode === 'online';
  // Only update onlineMode when not already connected (prevents clearing it when host/guest switch game modes)
  if (!NetworkManager.connected) onlineMode = isOnline;
  // Show/hide boss player count toggle
  const bpt = document.getElementById('bossPlayerToggle');
  if (bpt) bpt.style.display = isBoss ? 'flex' : 'none';
  // Show/hide online connection panel
  const onlinePanel = document.getElementById('onlinePanel');
  if (onlinePanel) onlinePanel.style.display = isOnline ? 'flex' : 'none';
  if (isOnline && typeof refreshPublicRooms === 'function') refreshPublicRooms();
  // Show/hide minigame selection panel
  const mgPanel = document.getElementById('minigamePanel');
  if (mgPanel) mgPanel.style.display = isMinigames ? 'block' : 'none';
  // P2 panel title/hint
  document.getElementById('p2Title').textContent = isTrueForm ? 'TRUE FORM' : (isBoss && !isBoss2p) ? 'CREATOR' : (isBoss2p ? 'Player 2' : ((isTraining || isTutorial) ? 'TRAINING' : (p2IsBot ? 'BOT' : 'Player 2')));
  document.getElementById('p2Hint').textContent  = isTrueForm ? 'Secret Final Boss' : (isBoss && !isBoss2p) ? 'Boss — AI Controlled' : (isBoss2p ? '← → ↑ · Enter · . · /' : ((isTraining || isTutorial) ? 'Practice mode' : (p2IsBot ? 'AI Controlled' : '← → ↑ · Enter · . · / · ↓')));
  document.getElementById('p1DifficultyRow').style.display = p1IsBot ? 'flex' : 'none';
  document.getElementById('p2DifficultyRow').style.display = p2IsBot ? 'flex' : 'none';
  // Hide P2 config rows in boss 1P, training, tutorial, trueform
  const hideP2 = (isBoss && !isBoss2p) || isTraining || isTutorial || isTrueForm;
  document.getElementById('p2ColorRow').style.display     = hideP2 ? 'none' : 'flex';
  document.getElementById('p2WeaponRow').style.display    = hideP2 ? 'none' : 'flex';
  document.getElementById('p2ClassRow').style.display     = hideP2 ? 'none' : 'flex';
  // Hide P1 bot toggle in tutorial, minigames, trueform — but allow it in boss modes
  const p1BotToggle = document.getElementById('p1BotToggle');
  if (p1BotToggle) p1BotToggle.style.display = (isTutorial || isMinigames || isTrueForm) ? 'none' : '';
  const p2BotToggleEl = document.getElementById('p2BotToggle');
  if (p2BotToggleEl) p2BotToggleEl.style.display = (isBoss2p) ? '' : (isBoss || isTrueForm) ? 'none' : '';
  // Training panel visibility (not in tutorial)
  const trainingPanel = document.getElementById('trainingPanel');
  if (trainingPanel) trainingPanel.style.display = isTraining ? 'block' : 'none';
  // Boss/training/tutorial/minigames/trueform/online: hide arena picker and ∞ infinite
  document.getElementById('arenaSection').style.display   = (isBoss || isTraining || isTutorial || isMinigames || isTrueForm || isOnline) ? 'none' : '';
  document.getElementById('infiniteOption').style.display = (isBoss || isTraining || isTutorial || isMinigames || isTrueForm || isOnline) ? 'none' : '';
  if ((isBoss || isTraining || isTutorial || isMinigames || isTrueForm || isOnline) && infiniteMode) {
    infiniteMode = false;
    selectLives(3);
  }
  // Custom weapons only allowed in 1v1 and training — hide options in other modes
  const _allowCustomWeapons = mode === '2p' || mode === 'training';
  for (const selId of ['p1Weapon', 'p2Weapon']) {
    const sel = document.getElementById(selId);
    if (!sel) continue;
    sel.querySelectorAll('option[value^="_custom_"]').forEach(opt => {
      opt.hidden = !_allowCustomWeapons;
    });
    // If currently selected value is a custom weapon and mode doesn't allow it, reset to sword
    if (!_allowCustomWeapons && sel.value && sel.value.startsWith('_custom_')) {
      sel.value = 'sword';
    }
  }
}

const SKIN_COLORS = {
  default: null, // uses player's selected color
  fire:    '#ff4400',
  ice:     '#44aaff',
  shadow:  '#222233',
  gold:    '#cc8800',
};
let p1Skin = 'default', p2Skin = 'default';

function setSkin(pid, skin, btn) {
  if (pid === 'p1') p1Skin = skin;
  else              p2Skin = skin;
  // Update active state on buttons for this player
  document.querySelectorAll(`.skin-swatch[data-pid="${pid}"]`).forEach(b => b.classList.remove('active'));
  if (btn) btn.classList.add('active');
}

function setBossPlayers(n) {
  bossPlayerCount = n;
  document.getElementById('bpBtn1').classList.toggle('active', n === 1);
  document.getElementById('bpBtn2').classList.toggle('active', n === 2);
  selectMode('boss'); // refresh UI
}

function toggleBot(pid) {
  if (pid === 'p1') {
    p1IsBot = !p1IsBot;
    const btn = document.getElementById('p1BotToggle');
    if (btn) btn.textContent = p1IsBot ? 'Bot' : 'Human';
  } else {
    // Cycle: Human → Bot → None → Human
    if (!p2IsBot && !p2IsNone)      { p2IsBot = true;  p2IsNone = false; }
    else if (p2IsBot && !p2IsNone)  { p2IsBot = false; p2IsNone = true;  }
    else                             { p2IsBot = false; p2IsNone = false; }
    const btn = document.getElementById('p2BotToggle');
    if (btn) btn.textContent = p2IsNone ? 'None' : (p2IsBot ? 'Bot' : 'Human');
  }
  // Refresh mode UI to reflect updated bot state
  selectMode(gameMode);
}

// ============================================================
// WEAPON / CLASS DESCRIPTION PANEL
// ============================================================
function showDesc(pid, type, value) {
  const panel = document.getElementById(pid + 'Desc');
  const titleEl = document.getElementById(pid + 'DescTitle');
  const bodyEl  = document.getElementById(pid + 'DescBody');
  if (!panel || !titleEl || !bodyEl) return;
  const desc = type === 'weapon' ? WEAPON_DESCS[value] : CLASS_DESCS[value];
  if (!desc) { panel.style.display = 'none'; return; }
  panel.style.display = 'block';
  titleEl.textContent = desc.title;
  bodyEl.innerHTML = [
    `<span style="color:#ccc">${desc.what}</span>`,
    desc.ability ? `<br><span style="color:#88ccff">${desc.ability}</span>` : '',
    desc.super   ? `<br><span style="color:#ffaa44">${desc.super}</span>`   : '',
    desc.perk    ? `<br><span style="color:#aaffaa">★ ${desc.perk}</span>`  : '',
    `<br><span style="color:#aaa; font-style:italic">Tip: ${desc.how}</span>`,
  ].join('');
}

// Map of weapon keys that are exclusive to a specific class
const WEAPON_CLASS_LOCK = { bow: 'archer', shield: 'paladin' };

// Force-select the weapon required by a class, OR force the class required by a weapon.
// Called from both the class selector (onchange) and the weapon selector (onchange).
function updateClassWeapon(pid) {
  const classEl  = document.getElementById(pid + 'Class');
  const weaponEl = document.getElementById(pid + 'Weapon');
  if (!classEl || !weaponEl) return;

  const wKey = weaponEl.value;
  const lockedClass = WEAPON_CLASS_LOCK[wKey];

  if (lockedClass) {
    // Weapon forces a specific class — lock the class selector
    classEl.value    = lockedClass;
    classEl.disabled = true;
    classEl.title    = `${lockedClass.charAt(0).toUpperCase() + lockedClass.slice(1)} is required for this weapon`;
    weaponEl.disabled = false;
    classSel_wasLocked(classEl, true);
    showDesc(pid, 'class', lockedClass);
    return;
  }

  // No weapon lock — check if class forces a weapon
  classSel_wasLocked(classEl, false);
  classEl.disabled = false;
  classEl.title    = '';

  const cls = CLASSES[classEl.value];
  if (cls && cls.weapon) {
    // Class forces a specific weapon — lock the weapon selector
    weaponEl.value    = cls.weapon;
    weaponEl.disabled = true;
  } else {
    weaponEl.disabled = false;
    // Reset class to none only if it was previously locked by a weapon
    if (classEl.dataset.wasLocked === 'true' && !lockedClass) {
      classEl.value = 'none';
    }
  }
  // Show description for the class
  showDesc(pid, 'class', classEl.value);
}

function classSel_wasLocked(el, val) {
  el.dataset.wasLocked = val ? 'true' : 'false';
}

function selectArena(name) {
  selectedArena = name;
  document.querySelectorAll('.arena-card[data-arena]').forEach(c => c.classList.remove('active'));
  document.querySelector(`[data-arena="${name}"]`).classList.add('active');
}

function switchArena(newKey) {
  if (!gameRunning) return;
  const OFFMAP = ['creator', 'void', 'soccer'];
  if (OFFMAP.includes(newKey)) return;
  currentArenaKey = newKey;
  if (currentArenaKey !== 'lava') randomizeArenaLayout(currentArenaKey);
  currentArena = ARENAS[currentArenaKey];
  initMapPerks(currentArenaKey);
  generateBgElements();
  // Reposition all players to safe spawn positions
  const SPAWN_XS = [160, 720, 450];
  players.forEach((p, i) => {
    if (p.isBoss || p.health <= 0) return;
    p.x = SPAWN_XS[i] || 300;
    p.y = 200;
    p.vx = 0; p.vy = 0;
    p.invincible = Math.max(p.invincible, 90);
  });
  trainingDummies.forEach(d => { d.x = 640; d.y = 200; d.vx = 0; d.vy = 0; });
}

function selectLives(n) {
  infiniteMode = (n === 0);
  chosenLives  = infiniteMode ? 3 : n; // placeholder when infinite
  document.querySelectorAll('.arena-card[data-lives]').forEach(c => c.classList.remove('active'));
  document.querySelector(`[data-lives="${n}"]`).classList.add('active');
}

function toggleSettings() {
  const panel = document.getElementById('settingsPanel');
  panel.style.display = panel.style.display === 'block' ? 'none' : 'block';
}

function toggleCard(id) {
  const card  = document.getElementById(id);
  const arrow = card.querySelector('.expand-arrow');
  card.classList.toggle('expanded');
  if (arrow) arrow.textContent = card.classList.contains('expanded') ? '▾' : '▸';
}

function updateSettings() {
  settings.particles   = document.getElementById('settingParticles').checked;
  settings.screenShake = document.getElementById('settingShake').checked;
  settings.dmgNumbers  = document.getElementById('settingDmgNums').checked;
  settings.landingDust = document.getElementById('settingLandDust').checked;
  const bossAuraEl   = document.getElementById('settingBossAura');
  const botPortalEl  = document.getElementById('settingBotPortal');
  const phaseFlashEl = document.getElementById('settingPhaseFlash');
  if (bossAuraEl)   settings.bossAura   = bossAuraEl.checked;
  if (botPortalEl)  settings.botPortal  = botPortalEl.checked;
  if (phaseFlashEl) settings.phaseFlash = phaseFlashEl.checked;
  const ragdollEl = document.getElementById('settingRagdoll');
  if (ragdollEl) {
    settings.ragdollEnabled = ragdollEl.checked;
    localStorage.setItem('smc_ragdoll', settings.ragdollEnabled ? '1' : '0');
  }
}

function toggleAdvanced() {
  const panel = document.getElementById('advancedPanel');
  if (panel) panel.style.display = panel.style.display === 'block' ? 'none' : 'block';
}

function toggleStatsLog() {
  const modal   = document.getElementById('statsLogModal');
  const content = document.getElementById('statsLogContent');
  if (!modal) return;
  if (modal.style.display === 'block') { modal.style.display = 'none'; return; }

  // Build HTML tables from game constants
  let html = '<h2 style="color:#cc00ee;margin-bottom:16px;letter-spacing:2px">STATS LOG — Stickman Battles</h2>';

  // Classes
  html += '<h3 style="color:#00d4ff;margin:12px 0 6px">Classes</h3><table style="width:100%;border-collapse:collapse;font-size:12px">';
  html += '<tr style="background:rgba(0,180,255,0.15)"><th>Name</th><th>HP</th><th>Speed</th><th>Weapon</th><th>Perk</th></tr>';
  for (const [key, cls] of Object.entries(CLASSES)) {
    html += `<tr style="border-bottom:1px solid rgba(255,255,255,0.08)"><td>${cls.name}</td><td>${cls.hp}</td><td>${cls.speedMult}x</td><td>${cls.weapon || '—'}</td><td>${cls.perk || '—'}</td></tr>`;
  }
  html += '</table>';

  // Weapons (all, including new)
  html += '<h3 style="color:#ffd700;margin:16px 0 6px">Weapons</h3><table style="width:100%;border-collapse:collapse;font-size:12px">';
  html += '<tr style="background:rgba(255,215,0,0.12)"><th>Name</th><th>Type</th><th>Damage</th><th>Range</th><th>Cooldown</th><th>KB</th><th>Ability</th></tr>';
  for (const [key, w] of Object.entries(WEAPONS)) {
    const dmg = w.damageFunc ? (key === 'gun' ? '5-8' : key === 'bow' ? '12-20' : key === 'peashooter' ? '2-3' : key === 'slingshot' ? '12-17' : key === 'paperairplane' ? '6-9' : 'random') : w.damage;
    html += `<tr style="border-bottom:1px solid rgba(255,255,255,0.08)"><td>${w.name || key}</td><td style="color:#aaa">${w.type}</td><td>${dmg}</td><td>${w.range}px</td><td>${w.cooldown}f</td><td>${w.kb}</td><td style="font-size:11px;color:#ccc">${w.abilityName || '—'}</td></tr>`;
  }
  html += '</table>';

  // Arenas
  html += '<h3 style="color:#aaffaa;margin:16px 0 6px">Arenas &amp; Map Gimmicks</h3><table style="width:100%;border-collapse:collapse;font-size:12px">';
  html += '<tr style="background:rgba(100,255,100,0.10)"><th>Arena</th><th>Gravity</th><th>Gimmick</th><th>Platforms</th></tr>';
  const arenaGimmicks = { grass: 'Floating bouncy platforms', lava: 'Lava floor (high gravity)', space: 'Low gravity + Meteors', city: 'Cars deal damage + Neon', forest: 'Forest Beast (1% chance), Raged (10%)', ice: 'Blizzard gusts + Yeti (0.5%)', ruins: 'Artifact pickups + Curses', creator: 'Boss floor hazards + Moving platforms' };
  for (const [key, ar] of Object.entries(ARENAS)) {
    const grav = ar.isLowGravity ? 'Low (0.22)' : ar.isHeavyGravity ? 'Heavy (0.85)' : 'Normal (0.55)';
    html += `<tr style="border-bottom:1px solid rgba(255,255,255,0.08)"><td style="color:#aaffaa">${key}</td><td>${grav}</td><td style="font-size:11px;color:#ccc">${arenaGimmicks[key] || '—'}</td><td>${ar.platforms.length}</td></tr>`;
  }
  html += '</table>';

  // Entities
  html += '<h3 style="color:#ff9944;margin:16px 0 6px">Special Entities</h3><table style="width:100%;border-collapse:collapse;font-size:12px">';
  html += '<tr style="background:rgba(255,150,50,0.12)"><th>Entity</th><th>HP</th><th>Location</th><th>Special Moves</th></tr>';
  const entities = [
    ['Forest Beast', '300 (Raged: 180)', 'Forest arena (1% chance/sec)', 'Dash charge at high speed'],
    ['Raged Beast', '180', 'Forest arena (1 in 10 beast spawns)', '+dmg, +kb, +speed, red aura'],
    ['Yeti', '450', 'Ice arena (0.5% chance/frame)', 'Roar stun, Ice spikes, Ice breath'],
    ['Boss (Creator)', '3000 (True: 4500)', 'Creator arena', 'Beams, Spikes, Floor hazards, Minions, Teleport'],
    ['Boss Minion', '50', 'Spawned by Boss Phase 2+', 'Hard AI, 50% damage output'],
    ['Dummy', '∞ (auto-heal)', 'Training mode', 'Stands still — for practice'],
  ];
  for (const [name, hp, loc, moves] of entities) {
    html += `<tr style="border-bottom:1px solid rgba(255,255,255,0.08)"><td style="color:#ffaa66">${name}</td><td>${hp}</td><td style="font-size:11px;color:#aaa">${loc}</td><td style="font-size:11px;color:#ccc">${moves}</td></tr>`;
  }
  html += '</table>';

  // Boss
  html += '<h3 style="color:#cc00ee;margin:16px 0 6px">Boss Stats</h3><table style="width:100%;border-collapse:collapse;font-size:12px">';
  html += '<tr style="background:rgba(200,0,238,0.12)"><th>Stat</th><th>Value</th></tr>';
  const bossStats = [
    ['HP', '3000 (True Form: 4500)'], ['Phase 1', '> 2000 HP'], ['Phase 2', '1000–2000 HP'],
    ['Phase 3', '< 1000 HP'], ['KB Resist', '0.5x'], ['KB Bonus', '1.5x (True: 2.5x)'],
    ['Attack CD Mult', '0.5x (True: 0.28x)'], ['Beam CD P2', '560f'], ['Beam CD P3', '400f/280f (P3)'],
    ['Spike Damage', '20 (launch vy=-24)'], ['Beam Damage', '12/frame in 24px'], ['Floor Hazard', '15s active, 5s warning'],
    ['Fake Death', 'Triggers at 33% HP, one per game'], ['Backstage Hide', 'Invincible + 60f attack block on exit'],
  ];
  for (const [k, v] of bossStats) {
    html += `<tr style="border-bottom:1px solid rgba(255,255,255,0.08)"><td>${k}</td><td>${v}</td></tr>`;
  }
  html += '</table>';

  // Training commands
  html += '<h3 style="color:#bb88ff;margin:16px 0 6px">Training Commands</h3><table style="width:100%;border-collapse:collapse;font-size:12px">';
  html += '<tr style="background:rgba(180,120,255,0.12)"><th>Command</th><th>Effect</th></tr>';
  const cmds = [
    ['Full HP', 'Restore health to max (player or all if toggle off)'],
    ['Give Super', 'Fill super meter to 100% instantly'],
    ['No CDs', 'Toggle: all ability/attack cooldowns frozen at 0'],
    ['Spawn Dummy', 'Add a new training dummy to the arena'],
    ['Spawn Bot', 'Spawn an AI fighter targeting you'],
    ['Spawn Boss', 'Spawn a full Boss entity (can spawn multiple)'],
    ['Spawn Beast', 'Spawn a Forest Beast in the arena'],
    ['Godmode', 'Toggle: no hitbox — immune to all damage'],
    ['One Punch', 'Toggle: all attacks deal 9999 damage'],
    ['Chaos', 'Toggle: all entities attack their nearest neighbour'],
    ['Clear All', 'Remove all dummies, bots, bosses, projectiles'],
    ['Player Only', 'Toggle: commands affect only P1 or all entities'],
  ];
  for (const [cmd, effect] of cmds) {
    html += `<tr style="border-bottom:1px solid rgba(255,255,255,0.08)"><td style="color:#cc99ff">${cmd}</td><td style="font-size:11px;color:#ccc">${effect}</td></tr>`;
  }
  html += '</table>';

  content.innerHTML = html;
  modal.style.display = 'block';
}

function getWeaponChoice(id) {
  const v = document.getElementById(id).value;
  const resolved = v === 'random' ? getWeaponChoiceFromPool() : v;
  // Custom weapons only allowed in 1v1 and training modes
  const _allowedCustomModes = new Set(['2p', 'training']);
  if (resolved && resolved.startsWith('_custom_') && !_allowedCustomModes.has(gameMode)) {
    return 'sword'; // fallback — custom weapons not allowed here
  }
  return resolved;
}

function getClassChoice(id) {
  const v = document.getElementById(id) ? document.getElementById(id).value : 'none';
  if (v !== 'random') return v;
  const pool = randomClassPool ? [...randomClassPool] : ['none', 'thor', 'kratos', 'ninja', 'gunner'];
  if (pool.length === 0) return 'none';
  return pool[Math.floor(Math.random() * pool.length)];
}

function getWeaponChoiceFromPool() {
  const pool = randomWeaponPool ? [...randomWeaponPool] : WEAPON_KEYS;
  if (pool.length === 0) return WEAPON_KEYS[0];
  return pool[Math.floor(Math.random() * pool.length)];
}

function toggleRandomPool(type, key) {
  if (type === 'weapon') {
    if (!randomWeaponPool) randomWeaponPool = new Set(WEAPON_KEYS);
    if (randomWeaponPool.has(key)) randomWeaponPool.delete(key);
    else randomWeaponPool.add(key);
    // Keep at least 1 weapon
    if (randomWeaponPool.size === 0) randomWeaponPool.add(key);
  } else if (type === 'class') {
    if (!randomClassPool) randomClassPool = new Set(['none', 'thor', 'kratos', 'ninja', 'gunner']);
    if (randomClassPool.has(key)) randomClassPool.delete(key);
    else randomClassPool.add(key);
    if (randomClassPool.size === 0) randomClassPool.add(key);
  }
  // Update button label
  const btn = document.getElementById(`randBtn_${type}_${key}`);
  if (btn) {
    const inPool = type === 'weapon'
      ? (!randomWeaponPool || randomWeaponPool.has(key))
      : (!randomClassPool  || randomClassPool.has(key));
    btn.textContent  = inPool ? '\u2713 In Random Pool' : '\u2717 Excluded';
    btn.style.background = inPool ? 'rgba(0,200,100,0.25)' : 'rgba(200,50,50,0.25)';
  }
}

// ============================================================
// START GAME
// ============================================================
function startGame() {
  const fadeOv  = document.getElementById('fadeOverlay');
  const loadOv  = document.getElementById('loadOverlay');
  if (fadeOv) {
    fadeOv.style.opacity = '1';
    if (loadOv) {
      loadOv.style.display = 'flex';
      // Animate the loading bar
      const bar = loadOv.querySelector('#loadBar');
      if (bar) { bar.style.width = '0%'; requestAnimationFrame(() => { bar.style.transition = 'width 0.32s ease'; bar.style.width = '100%'; }); }
    }
    setTimeout(() => {
      _startGameCore();
      if (loadOv) setTimeout(() => { loadOv.style.display = 'none'; }, 200);
    }, 340);
    setTimeout(() => { if (fadeOv) fadeOv.style.opacity = '0'; }, 440);
  } else {
    _startGameCore();
  }
}

// Pick a safe spawn position on a platform in the preferred half of the arena.
// Returns {x, y} or null if the arena handles spawns specially.
function pickSafeSpawn(sideHint) {
  if (!currentArena) return null;
  const skip = ['creator','void','soccer','lava'];
  if (skip.includes(currentArenaKey)) return null;
  const raised = currentArena.platforms.filter(pl => !pl.isFloor && !pl.isFloorDisabled && pl.w > 60);
  const floor  = currentArena.platforms.find(pl => pl.isFloor && !pl.isFloorDisabled);
  if (!raised.length) {
    if (!floor) return null;
    const fx = floor.x + (sideHint === 'right' ? floor.w * 0.65 : floor.w * 0.25);
    return { x: fx, y: floor.y - 60 };
  }
  const preferred = sideHint === 'any' ? raised
    : raised.filter(pl => sideHint === 'right' ? (pl.x + pl.w > GAME_W / 2) : (pl.x < GAME_W / 2));
  const pool = preferred.length ? preferred : raised;
  const pl   = pool[Math.floor(Math.random() * pool.length)];
  const rx   = pl.x + 14 + Math.random() * Math.max(0, pl.w - 28);
  return { x: rx, y: pl.y - 60 };
}

function _startGameCore() {
  document.getElementById('menu').style.display            = 'none';
  document.getElementById('gameOverOverlay').style.display  = 'none';
  document.getElementById('pauseOverlay').style.display     = 'none';
  canvas.style.display = 'block';
  document.getElementById('hud').style.display = 'flex';
  // Show chat widget if online
  const chatEl = document.getElementById('onlineChat');
  if (chatEl) chatEl.style.display = onlineMode ? 'flex' : 'none';

  // Resolve arena
  const isBossMode      = gameMode === 'boss';
  const isTrueFormMode  = gameMode === 'trueform';
  const isTrainingMode  = gameMode === 'training';
  const isTutorialMode  = gameMode === 'tutorial';
  const isMinigamesMode = gameMode === 'minigames';
  trainingMode = isTrainingMode;
  tutorialMode = isTutorialMode;
  if (isTutorialMode) {
    tutorialStep      = 0;
    tutorialStepTimer = 0;
    tutorialFlags     = {};
    tutPrevOnGround   = false;
    tutPrevCanDblJump = false;
    tutStepComplete   = false;
  }
  if (isBossMode) {
    currentArenaKey = 'creator';
  } else if (isTrueFormMode) {
    currentArenaKey = 'void';
    resetTFState();
  } else if (isTutorialMode) {
    currentArenaKey = 'grass';
  } else if (isMinigamesMode) {
    if (minigameType === 'soccer') {
      currentArenaKey = 'soccer';
    } else {
      // Pick a random non-boss arena for minigames
      const arenaPool = Object.keys(ARENAS).filter(k => !['creator','void','soccer'].includes(k));
      currentArenaKey = randChoice(arenaPool);
    }
  } else {
    const arenaPool = Object.keys(ARENAS).filter(k => !['creator','void','soccer'].includes(k));
    currentArenaKey = selectedArena === 'random' ? randChoice(arenaPool) : selectedArena;
  }
  isRandomMapMode = (selectedArena === 'random');
  // Lava/void: no randomization
  if (currentArenaKey !== 'creator' && currentArenaKey !== 'lava' && currentArenaKey !== 'void' && currentArenaKey !== 'soccer') randomizeArenaLayout(currentArenaKey);
  currentArena = ARENAS[currentArenaKey];
  initMapPerks(currentArenaKey);

  // Online host: broadcast authoritative game state to guest BEFORE creating fighters
  if (onlineMode && onlineLocalSlot === 1 && typeof NetworkManager !== 'undefined' && NetworkManager.connected) {
    const syncState = {
      arenaKey:  currentArenaKey,
      gameMode:  gameMode,
      lives:     chosenLives,
      p1Weapon:  document.getElementById('p1Weapon')?.value || 'sword',
      p2Weapon:  document.getElementById('p2Weapon')?.value || 'sword',
      p1Class:   document.getElementById('p1Class')?.value  || 'none',
      p2Class:   document.getElementById('p2Class')?.value  || 'none',
      platforms: (ARENAS[currentArenaKey]?.platforms || []).map(pl => ({ x: pl.x, y: pl.y, w: pl.w })),
    };
    NetworkManager.sendGameStateSync(syncState);
  }

  // Resolve weapons & colours
  const w1   = getWeaponChoice('p1Weapon');
  const w2   = getWeaponChoice('p2Weapon');
  const c1   = document.getElementById('p1Color').value;
  const c2   = document.getElementById('p2Color').value;
  const p1Diff = (document.getElementById('p1Difficulty')?.value) || 'hard';
  const p2Diff = (document.getElementById('p2Difficulty')?.value) || 'hard';
  const diff   = p2Diff; // legacy alias used below for p2
  const isBot  = p2IsBot; // bot determined by P2 toggle, not separate mode

  // Rebuild Matter.js ragdoll bounds when ragdoll is enabled
  if (settings.ragdollEnabled && typeof RagdollSystem !== 'undefined') {
    RagdollSystem.rebuildBounds();
  }

  // Generate bg elements fresh each game
  generateBgElements();

  // Reset state — stop menu background loop
  menuLoopRunning    = false;
  frameCount         = 0; // reset per-game frame counter (used for yeti min-spawn delay)
  projectiles        = [];
  particles          = [];
  verletRagdolls     = [];
  damageTexts        = [];
  respawnCountdowns  = [];
  minions            = [];
  forestBeast        = null;
  forestBeastCooldown = 0;
  yeti               = null;
  yetiCooldown       = 0;
  bossBeams          = [];
  bossSpikes         = [];
  if (typeof resetBossWarnings === 'function') resetBossWarnings();
  trainingDummies    = [];
  bossDialogue       = { text: '', timer: 0 };
  backstagePortals   = [];
  lightningBolts     = [];
  bossDeathScene     = null;
  fakeDeath          = { triggered: false, active: false, timer: 0, player: null };
  mapItems           = [];
  mapPerkState       = {};
  winsP1             = 0;
  winsP2             = 0;
  screenShake     = 0;
  frameCount      = 0;
  paused          = false;
  if (typeof resetDirector === 'function') resetDirector();

  // Reset camera zoom
  camZoomCur = 1; camZoomTarget = 1;
  camXCur = GAME_W / 2; camYCur = GAME_H / 2;
  camXTarget = GAME_W / 2; camYTarget = GAME_H / 2;
  camHitZoomTimer = 0;
  aiTick = 0;
  // Reset boss floor state for every game start
  bossFloorState = 'normal';
  bossFloorType  = 'lava';
  bossFloorTimer = 1500;
  bossPhaseFlash = 0;
  // Restore creator arena floor platform in case a previous game left it disabled
  if (ARENAS.creator) {
    const floorPl = ARENAS.creator.platforms.find(p => p.isFloor);
    if (floorPl) floorPl.isFloorDisabled = false;
    ARENAS.creator.hasLava = false;
    ARENAS.creator.deathY  = 640;
  }

  // Player 1  (W/A/D move+boost · S=shield · Space=attack · Q=ability)
  const p1 = new Fighter(160, 300, c1, w1, { left:'a', right:'d', jump:'w', attack:' ', shield:'s', ability:'q', super:'e' }, p1IsBot, p1Diff);
  p1.playerNum = 1; p1.name = p1IsBot ? 'BOT1' : 'P1'; p1.lives = chosenLives;
  { const _sp = pickSafeSpawn('left') || { x: 160, y: 300 };
    p1.spawnX = _sp.x; p1.spawnY = _sp.y; p1.x = _sp.x; p1.y = _sp.y; }
  p1.hat  = document.getElementById('p1Hat')?.value  || 'none';
  p1.cape = document.getElementById('p1Cape')?.value || 'none';
  if (p1Skin !== 'default' && SKIN_COLORS[p1Skin]) p1.color = SKIN_COLORS[p1Skin];
  applyClass(p1, getClassChoice('p1Class'));
  // Megaknight spawn fall
  if (p1.charClass === 'megaknight') { p1.y = -120; p1.vy = 2; p1._spawnFalling = true; p1.invincible = 200; }

  // Player 2 / Bot / Boss / Training Dummy
  let p2;
  if (isBossMode) {
    const boss = new Boss();
    // True Creator mode: significantly harder boss (requires TRUEFORM code)
    if (unlockedTrueBoss) {
      boss.health            = 4500;
      boss.maxHealth         = 4500;
      boss.attackCooldownMult = 0.28;
      boss.kbBonus           = 2.5;
      boss.kbResist          = 0.25;
      boss.name              = 'CREATOR';
      boss.color             = '#ff00ee';
    }
    if (bossPlayerCount === 2) {
      // 2P boss: harder boss
      boss.attackCooldownMult = 0.38; // ~1.3x faster attacks than 1P
      boss.kbBonus            = 2.0;  // 1.33x more KB than 1P
      boss.health             *= 1.5; // 1.5x more HP
      boss.maxHealth          = boss.health;
      // Spawn real P2 alongside boss (can be human or bot)
      const w2b  = getWeaponChoice('p2Weapon');
      const c2b  = document.getElementById('p2Color').value;
      const p2h  = new Fighter(720, 300, c2b, w2b, { left:'ArrowLeft', right:'ArrowRight', jump:'ArrowUp', attack:'Enter', shield:'ArrowDown', ability:'.', super:'/' }, p2IsBot, diff);
      p2h.playerNum = 2; p2h.name = p2IsBot ? 'BOT' : 'P2'; p2h.lives = chosenLives;
      { const _sp2 = pickSafeSpawn('right') || { x: 720, y: 300 };
        p2h.spawnX = _sp2.x; p2h.spawnY = _sp2.y; p2h.x = _sp2.x; p2h.y = _sp2.y; }
      p2h.hat  = document.getElementById('p2Hat')?.value  || 'none';
      p2h.cape = document.getElementById('p2Cape')?.value || 'none';
      applyClass(p2h, getClassChoice('p2Class'));
      if (p2h.charClass === 'megaknight') { p2h.y = -120; p2h.vy = 2; p2h._spawnFalling = true; p2h.invincible = 200; }
      if (p2h.isAI) p2h.target = boss; // bot targets boss
      players = [p1, p2h, boss];
      p1.target  = boss;
      p2h.target = boss;
      boss.target = p1;
      p2 = p2h; // for HUD reference
    } else {
      p2 = boss;
      players = [p1, p2];
      p1.target = p2;
      p2.target = p1;
    }
  } else if (isTrueFormMode) {
    // True Form: solo — P1 vs True Form boss, void arena, no 2P
    p1.isAI = false;
    p1.lives = chosenLives;
    const tf = new TrueForm();
    tf.target = p1;
    p1.target = tf;
    p2 = tf;
    players = [p1, tf];
  } else if (isTrainingMode) {
    if (training2P) {
      // 2P training: both fighters present, shared dummy
      p2 = new Fighter(720, 300, c2, w2, { left:'ArrowLeft', right:'ArrowRight', jump:'ArrowUp', attack:'Enter', shield:'ArrowDown', ability:'.', super:'/' }, p2IsBot, diff);
      p2.playerNum = 2; p2.name = p2IsBot ? 'BOT' : 'P2'; p2.lives = 999;
      { const _sp2 = pickSafeSpawn('right') || { x: 720, y: 300 };
        p2.spawnX = _sp2.x; p2.spawnY = _sp2.y; p2.x = _sp2.x; p2.y = _sp2.y; }
      applyClass(p2, getClassChoice('p2Class'));
      if (p2.charClass === 'megaknight') { p2.y = -120; p2.vy = 2; p2._spawnFalling = true; p2.invincible = 200; }
      const starterDummy = new Dummy(450, 200);
      starterDummy.playerNum = 3; starterDummy.name = 'DUMMY';
      trainingDummies.push(starterDummy);
      players = [p1, p2];
      p1.target = p2; p2.target = p1;
      p1.lives = 999;
    } else {
      // Standard training: P1 vs dummy
      const starterDummy = new Dummy(720, 300);
      starterDummy.playerNum = 2; starterDummy.name = 'DUMMY';
      trainingDummies.push(starterDummy);
      players = [p1];
      p1.target = starterDummy; starterDummy.target = p1;
    }
  } else if (isTutorialMode) {
    // Tutorial: P1 + a dummy (target for attack steps)
    const tutDummy = new Dummy(640, 300);
    tutDummy.playerNum = 2; tutDummy.name = 'DUMMY';
    trainingDummies.push(tutDummy);
    players = [p1];
    p1.target = tutDummy; tutDummy.target = p1;
    p1.isAI   = false; // always human-controlled in tutorial
  } else if (isMinigamesMode) {
    // Minigames: P1 always human; survival/koth both support optional P2
    p1.isAI = false;
    p1.lives = 10; // infinite — managed by mode
    if (minigameType === 'koth' || minigameType === 'chaos' || minigameType === 'soccer' || (minigameType === 'survival' && !p2IsNone)) {
      const p2mg = new Fighter(720, 300, c2, w2,
        { left:'ArrowLeft', right:'ArrowRight', jump:'ArrowUp', attack:'Enter',
          shield:'ArrowDown', ability:'.', super:'/' }, p2IsBot, p2Diff);
      p2mg.playerNum = 2; p2mg.name = p2IsBot ? 'BOT' : 'P2'; p2mg.lives = 99;
      { const _sp2 = pickSafeSpawn('right') || { x: 720, y: 300 };
        p2mg.spawnX = _sp2.x; p2mg.spawnY = _sp2.y; p2mg.x = _sp2.x; p2mg.y = _sp2.y; }
      p2mg.hat  = document.getElementById('p2Hat')?.value  || 'none';
      p2mg.cape = document.getElementById('p2Cape')?.value || 'none';
      if (p2Skin !== 'default' && SKIN_COLORS[p2Skin]) p2mg.color = SKIN_COLORS[p2Skin];
      applyClass(p2mg, getClassChoice('p2Class'));
      players = [p1, p2mg];
      if (minigameType === 'koth' || minigameType === 'chaos') { p1.target = p2mg; p2mg.target = p1; }
      else if (minigameType === 'soccer') {
        p1.lives = 99; p2mg.lives = 99;
        p1.target = p2mg; p2mg.target = p1;
      } else { p1.target = null; p2mg.target = null; } // survival: both target enemies
    } else {
      // Survival solo
      players = [p1];
      p1.target = null;
    }
    initMinigame();
  } else if (p2IsNone) {
    // Solo / None mode — only P1 exists, infinite lives, no opponent
    p1.lives = 9999;
    players = [p1];
    p1.target = null;
  } else {
    p2 = new Fighter(720, 300, c2, w2, { left:'ArrowLeft', right:'ArrowRight', jump:'ArrowUp', attack:'Enter', shield:'ArrowDown', ability:'.', super:'/' }, isBot, diff);
    p2.playerNum = 2; p2.name = p2IsBot ? 'BOT' : 'P2'; p2.lives = chosenLives;
    { const _sp2 = pickSafeSpawn('right') || { x: 720, y: 300 };
      p2.spawnX = _sp2.x; p2.spawnY = _sp2.y; p2.x = _sp2.x; p2.y = _sp2.y; }
    p2.hat  = document.getElementById('p2Hat')?.value  || 'none';
    p2.cape = document.getElementById('p2Cape')?.value || 'none';
    if (p2Skin !== 'default' && SKIN_COLORS[p2Skin]) p2.color = SKIN_COLORS[p2Skin];
    applyClass(p2, getClassChoice('p2Class'));
    if (p2.charClass === 'megaknight') { p2.y = -120; p2.vy = 2; p2._spawnFalling = true; p2.invincible = 200; }
    players = [p1, p2];
    p1.target = p2; p2.target = p1;
  }

  // Assign bot personalities — each AI fighter gets a random personality
  const PERSONALITIES = ['aggressive', 'defensive', 'trickster', 'sniper'];
  for (const p of players) {
    if (p.isAI && !p.isBoss && !p.isTrueForm && !p.isMinion) {
      p.personality = randChoice(PERSONALITIES);
    }
  }

  // Online mode: mark the remote player and reset network state
  if (onlineMode && NetworkManager.connected) {
    const localIdx  = onlineLocalSlot - 1;  // 0 or 1
    const remoteIdx = 1 - localIdx;
    players[localIdx].isRemote  = false;
    players[remoteIdx].isRemote = true;
    players[remoteIdx].isAI     = false; // remote is not AI
    // Give local player P1 controls regardless of slot
    players[localIdx].controls = {
      left: 'a', right: 'd', jump: 'w', attack: ' ',
      shield: 's', ability: 'q', super: 'e',
    };
    players[remoteIdx].controls = {}; // remote has no local controls
  }

  // Lava arena: override spawn positions to ensure players land on solid platforms
  if (currentArenaKey === 'lava') {
    p1.spawnX = 236; p1.spawnY = 260; // above upper-left platform (x=178,y=278)
    p1.x = 236; p1.y = 200;
    if (p2 && !p2.isBoss) {
      p2.spawnX = 640; p2.spawnY = 260; // above upper-right platform (x=582,y=278)
      p2.x = 640; p2.y = 200;
    }
  }

  // Training mode: show in-game HUD (not in tutorial)
  const trainingHud = document.getElementById('trainingHud');
  if (trainingHud) trainingHud.style.display = isTrainingMode ? 'flex' : 'none';
  const trainingCtrl = document.getElementById('trainingControls');
  if (trainingCtrl) trainingCtrl.style.display = isTrainingMode ? 'flex' : 'none';

  // HUD labels
  document.getElementById('p1HudName').textContent = p1.name;
  if (p2) document.getElementById('p2HudName').textContent = p2.name;
  document.getElementById('killFeed').innerHTML = '';

  updateHUD();
  // Reset per-match achievement stats
  _achStats.damageTaken = 0; _achStats.rangedDmg = 0; _achStats.consecutiveHits = 0;
  _achStats.superCount = 0; _achStats.matchStartTime = Date.now();
  gameRunning = true;
  // Start appropriate background music
  if (gameMode === 'boss' || gameMode === 'trueform') {
    MusicManager.playBoss();
  } else {
    MusicManager.playNormal();
  }
  resizeGame();
  requestAnimationFrame(gameLoop);
}

// ============================================================
// FULLSCREEN / RESIZE
// ============================================================
function resizeGame() {
  const hud  = document.getElementById('hud');
  const hudH = (hud && hud.offsetHeight) || 0;
  const w    = window.innerWidth;
  const h    = window.innerHeight - hudH;

  canvas.style.width      = w + 'px';
  canvas.style.height     = h + 'px';
  canvas.style.marginLeft = '0';
  canvas.style.marginTop  = '0';
}

window.addEventListener('resize', resizeGame);

// ============================================================
// PAGE LOAD — start menu background animation immediately
// ============================================================
currentArenaKey = ARENA_KEYS_ORDERED[menuBgArenaIdx];
currentArena    = ARENAS[currentArenaKey];
generateBgElements();
canvas.style.display = 'block';
resizeGame();
menuLoopRunning = true;
requestAnimationFrame(menuBgLoop);

// Restore secret letter state from localStorage on page load
syncCodeInput();
// Sync sound UI with saved state
(function() {
  const btn = document.getElementById('sfxMuteBtn');
  if (btn && SoundManager.isMuted()) btn.textContent = '🔇 Sound: Off';
  const vol = parseFloat(localStorage.getItem('smc_sfxVol') || '0.35');
  const slider = document.querySelector('input[oninput*="setSfxVolume"]');
  if (slider) slider.value = vol;
})();
if (localStorage.getItem('smc_trueform')) {
  const card = document.getElementById('modeTrueForm');
  if (card) card.style.display = '';
}
// Restore ragdoll setting checkbox
(function() {
  const el = document.getElementById('settingRagdoll');
  if (el) el.checked = settings.ragdollEnabled;
})();
// Init public room browser hidden by default (private is default)
(function() {
  const browser = document.getElementById('publicRoomBrowser');
  if (browser) browser.style.display = 'none'; // hidden until "Public" selected
  // Also auto-refresh room list when Online mode is opened
})();

// First-time visit: auto-launch tutorial after a brief delay
if (!localStorage.getItem('smc_tutorialDone')) {
  // Mark done immediately so a reload doesn't re-trigger if the user skips
  localStorage.setItem('smc_tutorialDone', '1');
  setTimeout(() => {
    try {
      selectMode('tutorial');
      startGame();
    } catch(e) {
      // If tutorial fails to start, restore menu so user isn't stuck
      document.getElementById('menu').style.display = 'grid';
      selectMode('2p');
    }
  }, 800);
}

// Mark tutorial as done when it completes (called from advanceTutorialStep when steps exhausted)
function markTutorialDone() {
  localStorage.setItem('smc_tutorialDone', '1');
}

// ============================================================
// EDGE PLAYER INDICATORS
// ============================================================
function drawEdgeIndicators(scX, scY, camCX, camCY) {
  if (!gameRunning) return;
  const MARGIN = 40; // px from screen edge before indicator shows
  const ARROW  = 14; // arrow half-size
  const allP   = [...players, ...minions].filter(p => p.health > 0 && !p.isBoss);
  for (const p of allP) {
    // Convert game coords to screen coords
    const sx = (p.cx() - camCX) * scX + canvas.width  / 2;
    const sy = (p.cy() - camCY) * scY + canvas.height / 2;
    const onScreen = sx > -p.w * scX && sx < canvas.width + p.w * scX &&
                     sy > -p.h * scY && sy < canvas.height + p.h * scY;
    if (onScreen) continue;
    // Clamp indicator to screen edge with margin
    const ix = Math.max(MARGIN, Math.min(canvas.width  - MARGIN, sx));
    const iy = Math.max(MARGIN, Math.min(canvas.height - MARGIN, sy));
    const angle = Math.atan2(sy - iy, sx - ix);
    ctx.save();
    ctx.translate(ix, iy);
    ctx.rotate(angle);
    ctx.globalAlpha = 0.85;
    ctx.fillStyle   = p.color || '#ffffff';
    ctx.strokeStyle = '#000';
    ctx.lineWidth   = 2;
    ctx.beginPath();
    ctx.moveTo(ARROW, 0);
    ctx.lineTo(-ARROW * 0.6,  ARROW * 0.55);
    ctx.lineTo(-ARROW * 0.6, -ARROW * 0.55);
    ctx.closePath();
    ctx.stroke();
    ctx.fill();
    // Name label
    ctx.rotate(-angle);
    ctx.fillStyle   = '#fff';
    ctx.font        = 'bold 9px Arial';
    ctx.textAlign   = 'center';
    ctx.shadowColor = '#000';
    ctx.shadowBlur  = 4;
    ctx.fillText(p.name || '?', 0, ARROW + 12);
    ctx.restore();
  }
}

