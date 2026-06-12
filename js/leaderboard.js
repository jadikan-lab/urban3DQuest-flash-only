// ── Leaderboard global ───────────────────────────────
let _lbShareData = null;
let _leaderboardSnapshot = null;
const SCORE_POINTS_FLASH = 50;
const SCORE_POINTS_SOLO = 50;
const SCORE_POINTS_FIXED = 35;

function _fixedQuestBonus(fixedCount) {
  if (fixedCount >= 4) return 35;
  if (fixedCount >= 3) return 20;
  if (fixedCount >= 2) return 10;
  return 0;
}

function _isSoloTreasureId(treasureId) {
  return /^solo[-_ ]?\d+/i.test(String(treasureId || ''));
}

function _lbIcon(name, className) {
  if (typeof uiIcon === 'function') return uiIcon(name, className);
  const fallback = { camera: '📷', flash: '⚡', trophy: '🏆', clock: '⏱', score: '⭐' };
  return `<span class="ui-icon ${className || ''}" aria-hidden="true">${fallback[name] || ''}</span>`;
}

async function _fetchLeaderboardData() {
  let evQuery = db.from('events')
    .select('pseudo,treasure_id,treasure_type,duration_sec,created_at')
    .order('created_at', { ascending: true });
  if (gameStart) evQuery = evQuery.gte('created_at', gameStart.toISOString());
  const [evRes, cfgRes, trRes] = await Promise.all([
    evQuery,
    db.from('config').select('key,value'),
    db.from('treasures').select('id,quest')
  ]);
  if (evRes.error) throw new Error('Supabase : ' + evRes.error.message);
  if (trRes.error) throw new Error('Supabase : ' + trRes.error.message);
  return {
    events: evRes.data || [],
    cfg: Object.fromEntries((cfgRes.data || []).map(r => [r.key, r.value])),
    treasures: trRes.data || []
  };
}

function _parseActiveQuests(cfg) {
  const fromJson = String(cfg?.activeQuests || '').trim();
  if (fromJson) {
    try {
      const parsed = JSON.parse(fromJson);
      if (Array.isArray(parsed)) return parsed.map(q => String(q || '').trim()).filter(Boolean);
    } catch {
      // ignore malformed config and fallback below
    }
  }
  const single = String(cfg?.activeQuest || '').trim();
  return single ? [single] : [];
}

function _filterEventsForActiveQuests(events, cfg, treasures) {
  const active = _parseActiveQuests(cfg);
  if (!active.length) return events;
  const questByTreasureId = Object.fromEntries((treasures || []).map(t => [String(t.id), String(t.quest || '').trim()]));
  return events.filter(e => {
    const quest = questByTreasureId[String(e.treasure_id)] || '';
    return !!quest && active.includes(quest);
  });
}

function _safeDurationSec(rawValue) {
  const sec = Number(rawValue);
  if (!Number.isFinite(sec)) return 0;
  return Math.max(0, Math.round(sec));
}

function _fmtDurationSec(totalSec) {
  const sec = Math.max(0, Math.round(Number(totalSec) || 0));
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  if (h > 0) return `${h}h ${String(m).padStart(2, '0')}m`;
  return `${m}m ${String(s).padStart(2, '0')}s`;
}

function _computeLeaderboardScores(events, cfg, treasures) {
  const totalFixed = 0;
  const scopedEvents = _filterEventsForActiveQuests(events, cfg, treasures);
  const questByTreasureId = Object.fromEntries((treasures || []).map(t => [String(t.id), String(t.quest || '').trim()]));

  const players = {};
  scopedEvents.forEach(e => {
    if (!e.pseudo) return;
    if (!players[e.pseudo]) {
      players[e.pseudo] = {
        globalScore: 0,
        flashCount: 0,
        soloCount: 0,
        fixedCount: 0,
        fixedQuestBonus: 0,
        totalDurationSec: 0,
        lastCaptureAtMs: Number.POSITIVE_INFINITY,
        fixedQuestTreasures: Object.create(null)
      };
    }

    if (e.treasure_type === 'fixed') {
      players[e.pseudo].fixedCount += 1;
      players[e.pseudo].globalScore += SCORE_POINTS_FIXED;
      const quest = questByTreasureId[String(e.treasure_id)] || '';
      if (quest) {
        const bucket = players[e.pseudo].fixedQuestTreasures;
        if (!bucket[quest]) bucket[quest] = Object.create(null);
        bucket[quest][String(e.treasure_id)] = true;
      }
    } else if (e.treasure_type === 'unique') {
      if (_isSoloTreasureId(e.treasure_id)) {
        players[e.pseudo].soloCount += 1;
        players[e.pseudo].globalScore += SCORE_POINTS_SOLO;
      } else {
        players[e.pseudo].flashCount += 1;
        players[e.pseudo].globalScore += SCORE_POINTS_FLASH;
      }
      players[e.pseudo].totalDurationSec += _safeDurationSec(e.duration_sec);
    } else {
      return;
    }

    const captureMs = Date.parse(e.created_at || '');
    if (Number.isFinite(captureMs) && captureMs < players[e.pseudo].lastCaptureAtMs) {
      players[e.pseudo].lastCaptureAtMs = captureMs;
    }
  });

  Object.values(players).forEach(player => {
    const fixedQuestBonus = Object.values(player.fixedQuestTreasures).reduce((sum, treasureMap) => {
      const fixedInQuest = Object.keys(treasureMap || {}).length;
      return sum + _fixedQuestBonus(fixedInQuest);
    }, 0);
    player.fixedQuestBonus = fixedQuestBonus;
    player.globalScore += fixedQuestBonus;
  });

  const rows = Object.entries(players)
    .map(([pseudo, d]) => {
      const flashCount = d.flashCount;
      const soloCount = d.soloCount;
      const fixedCount = d.fixedCount;
      const allFixed = false;
      const globalScore = d.globalScore;
      const fixedQuestBonus = d.fixedQuestBonus;
      const lastCaptureAtMs = Number.isFinite(d.lastCaptureAtMs) ? d.lastCaptureAtMs : Number.POSITIVE_INFINITY;
      return {
        pseudo,
        flashCount,
        soloCount,
        fixedCount,
        fixedQuestBonus,
        totalDurationSec: d.totalDurationSec,
        lastCaptureAtMs,
        globalScore,
        allFixed
      };
    })
    .filter(r => (r.flashCount + r.soloCount + r.fixedCount) > 0);

  rows.sort((a, b) => {
    if (b.globalScore !== a.globalScore) return b.globalScore - a.globalScore;
    const bCount = b.flashCount + b.soloCount + b.fixedCount;
    const aCount = a.flashCount + a.soloCount + a.fixedCount;
    if (bCount !== aCount) return bCount - aCount;
    if (a.totalDurationSec !== b.totalDurationSec) return a.totalDurationSec - b.totalDurationSec;
    if (a.lastCaptureAtMs !== b.lastCaptureAtMs) return a.lastCaptureAtMs - b.lastCaptureAtMs;
    return a.pseudo.localeCompare(b.pseudo, 'fr', { sensitivity: 'base' });
  });

  const myData = rows.find(p => p.pseudo === myPseudo) || null;
  const myRankNum = myData ? rows.indexOf(myData) + 1 : null;
  return { rows, totalFixed, myData, myRankNum };
}

function _renderLeaderboard({ rows, totalFixed, myData, myRankNum }) {
  const medals = ['🥇', '🥈', '🥉'];

  _lbShareData = {
    hasData: !!myData,
    pseudo: myPseudo || '',
    rank: myRankNum || null,
    totalPlayers: rows.length,
    fixedCount: myData ? myData.fixedCount : 0,
    totalFixed: totalFixed || 0,
    flashCount: myData ? myData.flashCount : 0,
    soloCount: myData ? myData.soloCount : 0,
    totalDurationSec: myData ? myData.totalDurationSec : 0,
    fixedDuration: null,
    allFixed: myData ? !!myData.allFixed : false,
    globalScore: myData ? myData.globalScore : 0
  };

  const myCardEl = document.getElementById('myCard');
  myCardEl.style.display = myPseudo ? 'block' : 'none';
  if (myData) {
    const rankLabel = myRankNum <= 3 ? medals[myRankNum - 1] : `#${myRankNum}`;
    myCardEl.innerHTML = `<div class="my-card">
      <div class="my-card-rank">${rankLabel}</div>
      <div class="my-card-pseudo">${escHtml(myPseudo)}</div>
      <div class="my-card-sub">Classement global</div>
      <div class="my-card-stats">
        <strong>${_lbIcon('score', 'warn')}${myData.globalScore}</strong>
        <span>⚡ ${myData.flashCount} · 🕶 ${myData.soloCount} · 📍 ${myData.fixedCount}</span>
      </div>
      <button class="btn-share" id="scoreShareBtn" style="margin-top:10px;padding:11px 12px;font-size:0.88rem" onclick="shareScoreResult()">📤 Partager mon score</button>
    </div>`;
  } else {
    myCardEl.innerHTML = `<div class="my-card" style="text-align:center;padding:14px">
      <div class="my-card-pseudo">${escHtml(myPseudo)}</div>
      <div class="my-card-sub" style="margin-top:4px">Pas encore de score global. Lance ta chasse !</div>
      <button class="btn-share" id="scoreShareBtn" style="margin-top:10px;padding:11px 12px;font-size:0.88rem" onclick="shareScoreResult()">📤 Inviter mes amis</button>
    </div>`;
  }

  let html = '';
  if (!rows.length) {
    html = '<p style="color:#475569;text-align:center;padding:50px 20px">Pas encore de scores<br><span style="font-size:0.8rem">Sois le premier à marquer des points !</span></p>';
  } else {
    html += `<div class="lb-divider">${_lbIcon('trophy', 'warn')}<span>Classement global · ${rows.length} joueur${rows.length > 1 ? 's' : ''}</span></div>`;
    const myRankInList = rows.findIndex(r => r.pseudo === myPseudo);
    rows.forEach((p, i) => {
      if (i >= 12 && i !== myRankInList) return;
      if (i === 12 && myRankInList >= 12) html += `<div class="lb-you-sep">· · ·</div>`;

      const isMe = p.pseudo === myPseudo;
      const rankIcon = i < 3 ? medals[i] : `<span style="font-size:0.85rem;color:#475569;font-weight:700">${i + 1}</span>`;
      html += `<div class="lb-row${isMe ? ' lb-me' : ''}">
        <div class="lb-rank">${rankIcon}</div>
        <div class="lb-avatar" style="background:${pseudoGradient(p.pseudo)}">${escHtml(p.pseudo[0].toUpperCase())}</div>
        <div class="lb-body">
          <div class="lb-name">${escHtml(p.pseudo)}</div>
          <div class="lb-score">
            <strong>${_lbIcon('score', 'warn')}${p.globalScore}</strong>
            <span>⚡ ${p.flashCount} · 🕶 ${p.soloCount} · 📍 ${p.fixedCount}</span>
          </div>
        </div>
      </div>`;
    });
  }

  const lbList = document.getElementById('lbList');
  if (lbList.innerHTML !== html) lbList.innerHTML = html;
  lbList.dataset.loaded = '1';
  document.getElementById('lbRefresh').textContent = '↻ ' + new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function _toLeaderboardSnapshot(computed) {
  const byPseudo = Object.fromEntries(computed.rows.map((row, idx) => [row.pseudo, { ...row, rank: idx + 1 }]));
  return { ...computed, byPseudo };
}

async function getLeaderboardSnapshot(forceRefresh = false) {
  if (!forceRefresh && _leaderboardSnapshot) return _leaderboardSnapshot;
  const data = await _fetchLeaderboardData();
  const computed = _computeLeaderboardScores(data.events, data.cfg || {}, data.treasures || []);
  _leaderboardSnapshot = _toLeaderboardSnapshot(computed);
  return _leaderboardSnapshot;
}

async function loadLeaderboard() {
  const el = document.getElementById('lbList');
  if (egressEmergencyMode) {
    const myCardEl = document.getElementById('myCard');
    if (myCardEl) {
      myCardEl.style.display = myPseudo ? 'block' : 'none';
      if (myPseudo) {
        myCardEl.innerHTML = `<div class="my-card" style="text-align:center;padding:14px">
          <div class="my-card-pseudo">${escHtml(myPseudo)}</div>
          <div class="my-card-sub" style="margin-top:4px">Classement temporairement en pause (mode egress).</div>
        </div>`;
      }
    }
    el.innerHTML = '<p style="color:#94a3b8;text-align:center;padding:40px">⏸ Classement temporairement désactivé pour réduire l\'egress.</p>';
    const rf = document.getElementById('lbRefresh');
    if (rf) rf.textContent = '↻ mode egress';
    return;
  }
  if (!el.dataset.loaded) el.innerHTML = `<p style="color:var(--ink-3);text-align:center;padding:30px">⏳ Chargement…</p>`;
  try {
    const snapshot = await getLeaderboardSnapshot(true);
    const computed = {
      rows: snapshot.rows,
      totalFixed: snapshot.totalFixed,
      myData: snapshot.myData,
      myRankNum: snapshot.myRankNum
    };
    _renderLeaderboard(computed);
  } catch (err) {
    el.innerHTML = `<p style="color:#f87171;text-align:center;padding:40px">⚠️ ${escHtml(err.message)}</p>`;
    console.error('loadLeaderboard error:', err);
  }
}

function refreshScoresManually() {
  const btn = document.getElementById('lbRefreshBtn');
  if (btn) {
    const original = btn.dataset.originalLabel || btn.textContent;
    btn.dataset.originalLabel = original;
    btn.textContent = '↻ Actualisation…';
  }
  Promise.resolve(loadLeaderboard()).finally(() => {
    if (btn) btn.textContent = btn.dataset.originalLabel || '↻ Actualiser';
  });
}

