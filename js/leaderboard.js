// ── Leaderboard global ───────────────────────────────
let _lbShareData = null;
let _leaderboardSnapshot = null;
const SCORE_POINTS_FLASH = 100;
const SCORE_POINTS_SOLO = 100;
const SCORE_POINTS_FIXED = 35;

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
  const [evRes, cfgRes] = await Promise.all([
    evQuery,
    db.from('config').select('key,value')
  ]);
  if (evRes.error) throw new Error('Supabase : ' + evRes.error.message);
  return {
    events: evRes.data || [],
    cfg: Object.fromEntries((cfgRes.data || []).map(r => [r.key, r.value]))
  };
}

function _getSeasonBounds(cfg) {
  const startRaw = String(cfg?.seasonStartAt || cfg?.season_start_at || '').trim();
  const endRaw = String(cfg?.seasonEndAt || cfg?.season_end_at || '').trim();
  const startMs = startRaw ? Date.parse(startRaw) : null;
  const endMs = endRaw ? Date.parse(endRaw) : null;
  return {
    startMs: Number.isFinite(startMs) ? startMs : null,
    endMs: Number.isFinite(endMs) ? endMs : null
  };
}

function _filterEventsForSeason(events, cfg) {
  const { startMs, endMs } = _getSeasonBounds(cfg);
  if (!startMs && !endMs) return events;
  return events.filter(e => {
    const t = Date.parse(e.created_at || '');
    if (!Number.isFinite(t)) return false;
    if (startMs && t < startMs) return false;
    if (endMs && t > endMs) return false;
    return true;
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

function _computeLeaderboardScores(events, cfg) {
  const totalFixed = 0;
  const scopedEvents = _filterEventsForSeason(events, cfg);

  const players = {};
  scopedEvents.forEach(e => {
    if (!e.pseudo) return;
    if (!players[e.pseudo]) {
      players[e.pseudo] = {
        globalScore: 0,
        flashCount: 0,
        soloCount: 0,
        fixedCount: 0,
        totalDurationSec: 0,
        lastCaptureAtMs: Number.POSITIVE_INFINITY
      };
    }

    if (e.treasure_type === 'fixed') {
      players[e.pseudo].fixedCount += 1;
      players[e.pseudo].globalScore += SCORE_POINTS_FIXED;
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

  const rows = Object.entries(players)
    .map(([pseudo, d]) => {
      const flashCount = d.flashCount;
      const soloCount = d.soloCount;
      const fixedCount = d.fixedCount;
      const allFixed = false;
      const globalScore = d.globalScore;
      const lastCaptureAtMs = Number.isFinite(d.lastCaptureAtMs) ? d.lastCaptureAtMs : Number.POSITIVE_INFINITY;
      return {
        pseudo,
        flashCount,
        soloCount,
        fixedCount,
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
  const computed = _computeLeaderboardScores(data.events, data.cfg || {});
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

