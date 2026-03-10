'use strict';

// ============================================================
// ACHIEVEMENT SYSTEM
// ============================================================
const ACHIEVEMENTS = [
  // Combat
  { id: 'first_blood',    title: 'First Blood',        desc: 'Win your first match',                icon: '🩸', hint: 'Win a 1v1 match against a bot set to Hard difficulty' },
  { id: 'hat_trick',      title: 'Hat Trick',          desc: 'Win 3 matches in a row',              icon: '🎩', hint: 'Win 3 consecutive matches without losing in between' },
  { id: 'survivor',       title: 'Survivor',            desc: 'Win with 10 HP or less',              icon: '💀', hint: 'Win a match while your HP is at 10 or below' },
  { id: 'untouchable',    title: 'Untouchable',         desc: 'Win without taking any damage',       icon: '✨', hint: 'Win a full match without being hit once' },
  { id: 'combo_king',     title: 'Combo King',          desc: 'Land 5 hits without missing',         icon: '👑', hint: 'Hit an opponent 5 times in a row without whiffing' },
  // Weapons
  { id: 'gunslinger',     title: 'Gunslinger',          desc: 'Deal 500 ranged damage in one match', icon: '🔫', hint: 'Use the Gun weapon and deal 500 total ranged damage in one match' },
  { id: 'hammer_time',    title: 'Hammer Time',         desc: 'Win using only hammer',               icon: '🔨', hint: 'Win a match with the Hammer weapon equipped' },
  { id: 'clash_master',   title: 'Clash Master',        desc: 'Trigger a weapon clash (spark)',       icon: '⚡', hint: 'Get both weapons to collide mid-swing to spark a clash' },
  // Minigames
  { id: 'wave_5',         title: 'Wave Warrior',        desc: 'Survive 5 survival waves',            icon: '🌊' },
  { id: 'wave_10',        title: 'Wave Master',         desc: 'Survive 10 survival waves',           icon: '🌊🌊' },
  { id: 'survival_win',   title: 'Extinction Event',    desc: 'Beat all waves in team survival',     icon: '🏆' },
  { id: 'koth_win',       title: 'King of the Hill',   desc: 'Win a King of the Hill match',        icon: '🏔' },
  // Exploration
  { id: 'boss_slayer',    title: 'Boss Slayer',         desc: 'Defeat the Creator boss',             icon: '👹' },
  { id: 'true_form',      title: 'True Form',           desc: 'Unlock and defeat the True Form',    icon: '🌑' },
  { id: 'yeti_hunter',    title: 'Yeti Hunter',         desc: 'Defeat the Yeti on Ice arena',       icon: '❄' },
  { id: 'beast_tamer',    title: 'Beast Tamer',         desc: 'Defeat the Forest Beast',             icon: '🦴' },
  // Fun
  { id: 'chaos_survivor', title: 'Chaos Agent',         desc: 'Survive a wave with 3 chaos mods',   icon: '🌀' },
  { id: 'super_saver',    title: 'Super Saver',         desc: 'Use your super move 10 times',        icon: '⚡' },
  { id: 'speedrun',       title: 'Speedster',           desc: 'Win a match in under 30 seconds',     icon: '⏱' },
  { id: 'perfectionist',  title: 'Perfectionist',       desc: 'Win 10 total matches',                icon: '🌟' },
];

let earnedAchievements = new Set(JSON.parse(localStorage.getItem('smc_achievements') || '[]'));
let achievementQueue   = []; // pending popup animations
let achievementTimer   = 0;  // frames remaining for current popup

// Per-session stats for achievements
let _achStats = { damageTaken: 0, rangedDmg: 0, consecutiveHits: 0, superCount: 0,
                  winStreak: 0, totalWins: 0, matchStartTime: 0,
                  botKills: 0, pvpDamageDealt: 0, pvpDamageReceived: 0 };

function unlockAchievement(id) {
  if (earnedAchievements.has(id)) return;
  const def = ACHIEVEMENTS.find(a => a.id === id);
  if (!def) return;
  earnedAchievements.add(id);
  localStorage.setItem('smc_achievements', JSON.stringify([...earnedAchievements]));
  // Online: sync achievements between players
  if (onlineMode && NetworkManager.connected) {
    NetworkManager.sendGameEvent('achievementUnlocked', { id });
  }
  achievementQueue.push({ ...def, frame: 0 });
  SoundManager.phaseUp();
  // HTML bottom-right notification
  const existing = document.getElementById('achNotif');
  if (existing) existing.remove();
  const el = document.createElement('div');
  el.id = 'achNotif';
  el.innerHTML = `<span style="font-size:22px;line-height:1">${def.icon}</span><div><div style="font-weight:bold;font-size:11px;color:#ffdd00;letter-spacing:.5px">ACHIEVEMENT UNLOCKED</div><div style="font-size:13px;font-weight:bold">${def.title}</div><div style="font-size:10px;color:#aac;margin-top:2px;">Click to view</div></div>`;
  el.style.cssText = 'position:fixed;bottom:20px;right:20px;background:rgba(10,5,25,0.93);border:1.5px solid #ffcc00;border-radius:10px;padding:10px 16px;display:flex;align-items:center;gap:12px;color:#fff;z-index:2000;font-family:Arial,sans-serif;animation:achSlideIn 0.35s ease;cursor:pointer;';
  el.addEventListener('click', () => {
    el.remove();
    showAchievementsModal();
    // Scroll to the specific achievement card after modal opens
    setTimeout(() => {
      const cards = document.querySelectorAll('.ach-card');
      for (const card of cards) {
        if (card.textContent.includes(def.title)) {
          card.scrollIntoView({ behavior: 'smooth', block: 'center' });
          card.style.outline = '2px solid #ffcc00';
          card.style.boxShadow = '0 0 14px #ffcc00aa';
          setTimeout(() => { card.style.outline = ''; card.style.boxShadow = ''; }, 2000);
          break;
        }
      }
    }, 120);
  });
  document.body.appendChild(el);
  const _autoFade = setTimeout(() => { el.style.transition='opacity 0.5s'; el.style.opacity='0'; setTimeout(() => el.remove(), 500); }, 3500);
  el.addEventListener('mouseenter', () => clearTimeout(_autoFade));  // pause fade on hover
}

function drawAchievementPopups() {
  if (achievementQueue.length === 0) return;
  const ACH_SHOW = 240; // 4 seconds
  const cur = achievementQueue[0];
  cur.frame++;
  if (cur.frame >= ACH_SHOW) { achievementQueue.shift(); return; }

  const t = cur.frame;
  const alpha = t < 20 ? t / 20 : t > ACH_SHOW - 30 ? (ACH_SHOW - t) / 30 : 1;
  const slideX = t < 20 ? (20 - t) * 14 : 0;

  ctx.save();
  ctx.globalAlpha = alpha;
  const bw = 260, bh = 52, bx = GAME_W - bw - 12 + slideX, by = 12;
  // Background
  ctx.fillStyle = 'rgba(20,10,40,0.92)';
  ctx.beginPath(); ctx.roundRect(bx, by, bw, bh, 8); ctx.fill();
  ctx.strokeStyle = '#ffcc00'; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.roundRect(bx, by, bw, bh, 8); ctx.stroke();
  // Icon
  ctx.font = '24px Arial'; ctx.textAlign = 'left';
  ctx.fillText(cur.icon, bx + 10, by + 33);
  // Text
  ctx.fillStyle = '#ffcc00'; ctx.font = 'bold 11px Arial';
  ctx.fillText('ACHIEVEMENT UNLOCKED', bx + 42, by + 16);
  ctx.fillStyle = '#ffffff'; ctx.font = 'bold 13px Arial';
  ctx.fillText(cur.title, bx + 42, by + 30);
  ctx.fillStyle = '#aaaaaa'; ctx.font = '10px Arial';
  ctx.fillText(cur.desc, bx + 42, by + 43);
  ctx.globalAlpha = 1;
  ctx.restore();
}

function showAchievementsModal() {
  const modal = document.getElementById('achievementsModal');
  if (!modal) return;
  const grid = document.getElementById('achievementsGrid');
  if (!grid) return;
  grid.innerHTML = '';
  ACHIEVEMENTS.forEach(a => {
    const earned = earnedAchievements.has(a.id);
    const div = document.createElement('div');
    div.className = 'ach-card' + (earned ? ' ach-earned' : ' ach-locked');
    const hintHtml = a.hint ? `<div class="ach-hint">${earned ? '' : '🔓 ' + a.hint}</div>` : '';
    div.innerHTML = `<div class="ach-icon">${earned ? a.icon : '🔒'}</div>
      <div class="ach-title">${earned ? a.title : '???'}</div>
      <div class="ach-desc">${earned ? a.desc : 'Not yet unlocked'}</div>${hintHtml}`;
    grid.appendChild(div);
  });
  modal.style.display = 'flex';
}
