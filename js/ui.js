// ── Page Visibility API — pause timers en arrière-plan ──
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    stopCompassInterval();
    if (geoWatch !== null) { navigator.geolocation.clearWatch(geoWatch); geoWatch = null; }
  } else {
    setTimeout(() => startGeoWatch(true), 300);
    if (activeTab === 'explore') startCompassInterval();
    updateRadar();
    updateGpsLoadingPanel();
  }
});

window.addEventListener('beforeunload', () => {
  if (gameSyncChannel && db && typeof db.removeChannel === 'function') db.removeChannel(gameSyncChannel);
  if (geoWatch !== null) navigator.geolocation.clearWatch(geoWatch);
  if (geoWatchdog) { clearInterval(geoWatchdog); geoWatchdog = null; }
});

// ── Tabs ─────────────────────────────────────────────
function showTab(name, btn) {
  activeTab = name;
  document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('nav button').forEach(b => { b.classList.remove('active'); b.setAttribute('aria-selected', 'false'); });
  document.getElementById('panel' + name.charAt(0).toUpperCase() + name.slice(1)).classList.add('active');
  if (btn) { btn.classList.add('active'); btn.setAttribute('aria-selected', 'true'); }
  if (name !== 'explore') {
    document.getElementById('radarBar').style.display = 'none';
    document.getElementById('progressBar').style.display = 'none';
    const flashFab = document.getElementById('flashFab');
    if (flashFab) flashFab.style.display = 'none';
    if (typeof hideFlashHint === 'function') hideFlashHint();
  }
  const gpsKickBtn = document.getElementById('gpsKickBtn');
  if (gpsKickBtn) gpsKickBtn.style.display = (name === 'explore' && isIOSDevice() && playerLat === null) ? 'block' : 'none';
  updateGpsLoadingPanel();
  if (name === 'explore') {
    setTimeout(() => gameMap && gameMap.invalidateSize(), 60);
    startCompassInterval();
    updateProgressBar();
    updateRadar();
    _updateRadarBg();
    applyExploreMapLock();
    applyMapHeadingRotation();
    updateCompassCorner();
  } else if (name === 'scores') {
    stopCompassInterval();
    _clearArrows();
    _updateRadarBg();
    applyMapHeadingRotation();
    updateCompassCorner();
  } else if (name === 'moi') {
    stopCompassInterval();
    _clearArrows();
    _updateRadarBg();
    applyMapHeadingRotation();
    updateCompassCorner();
    const ps = document.getElementById('parcoursSection');
    if (ps) ps.style.display = 'none';
    loadMoi();
    loadCarnet();
  } else {
    stopCompassInterval();
    _clearArrows();
    _updateRadarBg();
    updateCompassCorner();
  }
}

function toggleMoreMenu() {}
function _fmtDuration(secs) {
  if (!secs || secs < 0) return '—';
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

window._uniqueCaptureShareData = window._uniqueCaptureShareData || null;

function shareScoreResult() {
  const d = _lbShareData;
  if (!d || !myPseudo) return;
  const playUrl = location.origin + location.pathname;
  if (!d.hasData) {
    const text = `🏙 Je joue à Urban3DQuest.fr · Jadikan !\nRejoins-moi pour trouver les miniatures dans la ville.\n\n${playUrl}`;
    if (navigator.share) {
      navigator.share({ title: 'Urban3DQuest.fr · Jadikan — Rejoins la chasse', text, url: playUrl }).catch(() => {});
      return;
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(() => {
        _setShareButtonState('scoreShareBtn', '✓ Lien copié');
      }).catch(() => {});
    }
    return;
  }

  const rankTxt = d.rank && d.totalPlayers ? `#${d.rank}/${d.totalPlayers}` : '—';
  const text = `🏙 Urban3DQuest Flash · Jadikan\n👤 ${d.pseudo}\n🏅 Rang global ${rankTxt}\n⭐ Score ${d.globalScore || 0}\n⚡ Flash ${d.flashCount}\n\nViens jouer : ${playUrl}`;

  const cardModel = {
    kicker: 'SCORE JOUEUR',
    title: d.pseudo,
    subtitle: `Rang global ${rankTxt}`,
    accent: 'score',
    metrics: [
      { label: 'Score', value: String(d.globalScore || 0) },
      { label: 'Flash', value: String(d.flashCount || 0) }
    ],
    footer: 'Mode flash uniquement',
    shareUrl: playUrl
  };

  _shareCaptureCard({
    model: cardModel,
    buttonId: 'scoreShareBtn',
    shareTitle: 'Urban3DQuest.fr · Jadikan — Mon score',
    shareText: text,
    shareUrl: playUrl
  }).catch(() => {});
}

let _html2CanvasLoader = null;
function _ensureHtml2Canvas() {
  if (window.html2canvas) return Promise.resolve(window.html2canvas);
  if (_html2CanvasLoader) return _html2CanvasLoader;
  _html2CanvasLoader = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.min.js';
    script.async = true;
    script.onload = () => resolve(window.html2canvas);
    script.onerror = () => reject(new Error('html2canvas load failed'));
    document.head.appendChild(script);
  });
  return _html2CanvasLoader;
}

function _getShareCaptureStage() {
  let stage = document.getElementById('shareCaptureStage');
  if (stage) return stage;
  stage = document.createElement('div');
  stage.id = 'shareCaptureStage';
  stage.innerHTML = `
    <div class="share-capture-card share-capture-flash">
      <div class="share-capture-kicker"></div>
      <div class="share-capture-title"></div>
      <div class="share-capture-subtitle"></div>
      <div class="share-capture-metrics"></div>
      <div class="share-capture-footer"></div>
      <div class="share-capture-url"></div>
    </div>
  `;
  document.body.appendChild(stage);
  return stage;
}

function _renderShareCaptureCard(model) {
  const stage = _getShareCaptureStage();
  const card = stage.querySelector('.share-capture-card');
  const kicker = stage.querySelector('.share-capture-kicker');
  const title = stage.querySelector('.share-capture-title');
  const subtitle = stage.querySelector('.share-capture-subtitle');
  const metrics = stage.querySelector('.share-capture-metrics');
  const footer = stage.querySelector('.share-capture-footer');
  const shareUrl = stage.querySelector('.share-capture-url');

  card.classList.toggle('share-capture-flash', model.accent !== 'score');
  card.classList.toggle('share-capture-score', model.accent === 'score');
  kicker.textContent = model.kicker || 'URBAN3DQUEST.FR · JADIKAN';
  title.textContent = model.title || 'Urban3DQuest.fr · Jadikan';
  subtitle.textContent = model.subtitle || '';
  footer.textContent = model.footer || '';
  shareUrl.textContent = model.shareUrl || (location.origin + location.pathname);

  metrics.innerHTML = (model.metrics || []).map(m => `
    <div class="share-metric">
      <div class="share-metric-value">${escHtml(String(m.value || '—'))}</div>
      <div class="share-metric-label">${escHtml(String(m.label || ''))}</div>
    </div>
  `).join('');

  return card;
}

async function _captureShareCardBlob(model) {
  const html2canvas = await _ensureHtml2Canvas();
  const card = _renderShareCaptureCard(model);
  const canvas = await html2canvas(card, {
    backgroundColor: null,
    scale: Math.min(3, window.devicePixelRatio ? window.devicePixelRatio * 1.5 : 2),
    useCORS: true
  });
  return new Promise(resolve => canvas.toBlob(resolve, 'image/png', 0.95));
}

async function _shareCaptureCard({ model, buttonId, shareTitle, shareText, shareUrl }) {
  const blob = await _captureShareCardBlob(model).catch(() => null);
  const file = blob ? new File([blob], `urban3dquest-${Date.now()}.png`, { type: 'image/png' }) : null;

  if (file && navigator.canShare && navigator.canShare({ files: [file] }) && navigator.share) {
    try {
      await navigator.share({ title: shareTitle, text: shareText, files: [file] });
      _setShareButtonState(buttonId, '✓ Partage ouvert');
      return;
    } catch {
      // fall through
    }
  }

  if (navigator.share) {
    try {
      await navigator.share({ title: shareTitle, text: shareText, url: shareUrl });
      _setShareButtonState(buttonId, '✓ Partage ouvert');
      return;
    } catch {
      // fall through
    }
  }

  if (blob && navigator.clipboard && window.ClipboardItem) {
    try {
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
      _setShareButtonState(buttonId, '✓ Image copiée');
      return;
    } catch {
      // fall through
    }
  }

  if (navigator.clipboard && navigator.clipboard.writeText) {
    await navigator.clipboard.writeText(shareText);
    _setShareButtonState(buttonId, '✓ Lien copié');
  }
}

function _setShareButtonState(buttonId, label) {
  const btn = document.getElementById(buttonId);
  if (!btn) return;
  const original = btn.dataset.originalLabel || btn.textContent;
  btn.dataset.originalLabel = original;
  btn.textContent = label;
  setTimeout(() => { btn.textContent = btn.dataset.originalLabel || original; }, 2200);
}

async function shareUniqueCapture() {
  const data = window._uniqueCaptureShareData;
  if (!data) return;
  const shareUrl = data.shareUrl || location.origin + location.pathname;
  const shareText = `J'ai capturé "${data.label}" sur Urban 3D Quest. Rejoins la chasse : ${shareUrl}`;
  const cardModel = {
    kicker: 'FLASH CAPTURÉ',
    title: data.label || 'Polaroid unique',
    subtitle: `Par ${data.pseudo || myPseudo || 'Joueur'} · ${data.durationText || ''}`,
    accent: 'flash',
    metrics: [
      { label: 'Durée', value: data.durationText || '—' },
      { label: 'Mode', value: 'Flash' },
      { label: 'Joueur', value: data.pseudo || myPseudo || '—' }
    ],
    footer: 'Capture unique validee',
    shareUrl
  };

  await _shareCaptureCard({
    model: cardModel,
    buttonId: 'foundShareCaptureBtn',
    shareTitle: 'Urban3DQuest.fr · Jadikan — Flash capturé',
    shareText,
    shareUrl
  });
}

async function inviteFriendsFromCapture() {
  const data = window._uniqueCaptureShareData;
  if (!data) return;
  const shareUrl = data.shareUrl || location.origin + location.pathname;
  const text = `J'ai capturé une miniature Flash sur Urban 3D Quest. Rejoins-moi ici : ${shareUrl}`;

  if (navigator.share) {
    try {
      await navigator.share({
        title: 'Urban 3D Quest — Rejoins la chasse',
        text,
        url: shareUrl
      });
      _setShareButtonState('foundInviteBtn', '✓ Invitation ouverte');
      return;
    } catch {
      // fall through
    }
  }

  if (navigator.clipboard && navigator.clipboard.writeText) {
    await navigator.clipboard.writeText(text);
    _setShareButtonState('foundInviteBtn', '✓ Lien copié');
  }
}

function closeMoreMenu() {}
function showTabFromMore(name) { showTab(name, null); }

// ── Pause ────────────────────────────────────────────
function showPause() { document.getElementById('pauseScreen').classList.add('open'); }

// ── Carnet ───────────────────────────────────────────
async function loadCarnet() {
  const el = document.getElementById('carnetList');
  const countEl = document.getElementById('carnetCount');
  if (!myPseudo) {
    el.innerHTML = `<div class="cn-empty"><span class="cn-empty-icon">📖</span><span class="cn-empty-label">Connecte-toi pour voir ton carnet</span></div>`;
    countEl.textContent = '';
    return;
  }
  el.innerHTML = `<p style="color:var(--ink-3);text-align:center;padding:30px;font-family:var(--mono);font-size:0.78rem">⏳ Chargement…</p>`;
  try {
    const { data: evts, error } = await db.from('events')
      .select('treasure_id,treasure_type,duration_sec,created_at')
      .eq('pseudo', myPseudo)
      .order('created_at', { ascending: false });
    if (error) throw error;
    if (!evts || evts.length === 0) {
      el.innerHTML = `<div class="cn-empty"><span class="cn-empty-icon">🌍</span><span class="cn-empty-label">Aucune miniature trouvée pour l'instant</span></div>`;
      countEl.textContent = '';
      return;
    }
    countEl.textContent = `${evts.length} révélé${evts.length > 1 ? 's' : ''}`;
    // Build a quick lookup from treasures already loaded in memory
    const tMap = Object.fromEntries(treasures.map(t => [t.id, t]));
    el.innerHTML = evts.map(ev => {
      const t = tMap[ev.treasure_id];
      const label = t ? escHtml(tLabel(t)) : escHtml(ev.treasure_id);
      const typeLabel = 'Flash';
      const typeClass = 'cn-unique';
      const date = new Date(ev.created_at).toLocaleString('fr-FR', { day:'2-digit', month:'2-digit', hour:'2-digit', minute:'2-digit' });
      const durStr = ev.duration_sec ? `⏱ ${formatDuration(ev.duration_sec)}` : '';
      // Photo
      let photoHtml = '';
      if (t && t.photo_url) {
        const url = safeImgUrl(getPhotoUrls(t.photo_url)[0]);
        if (url) photoHtml = `<img class="cn-thumb" src="${escHtml(url)}" alt="" loading="lazy" onclick="openPhotoViewer('${jsSingleQuoted(url)}')" style="cursor:zoom-in">`;
      }
      if (!photoHtml) photoHtml = `<div class="cn-thumb-placeholder">⚡</div>`;
      const hintHtml = t && t.hint ? `<div class="cn-hint">${escHtml(t.hint)}</div>` : '';
      return `<div class="cn-card ${typeClass}">
        ${photoHtml}
        <div class="cn-body">
          <div class="cn-type">${typeLabel}</div>
          <div class="cn-name">${label}</div>
          <div class="cn-meta"><span>${date}</span>${durStr ? `<span>${durStr}</span>` : ''}</div>
          ${hintHtml}
        </div>
      </div>`;
    }).join('');
  } catch(err) {
    el.innerHTML = `<p style="color:#f87171;text-align:center;padding:40px;font-size:0.85rem">⚠️ ${escHtml(err.message)}</p>`;
  }
}

// ── Offline detection ────────────────────────────────
function _setOfflineBanner(isOffline) {
  const el = document.getElementById('offlineBanner');
  if (el) el.classList.toggle('visible', isOffline);
}
window.addEventListener('online',  () => _setOfflineBanner(false));
window.addEventListener('offline', () => _setOfflineBanner(true));

let gameSyncChannel = null;
let _treasureRefreshTimer = null;
let _leaderboardRefreshTimer = null;

function scheduleTreasureRefresh(delayMs = 0) {
  if (_treasureRefreshTimer) clearTimeout(_treasureRefreshTimer);
  _treasureRefreshTimer = setTimeout(() => {
    _treasureRefreshTimer = null;
    loadTreasures();
  }, delayMs);
}

function scheduleLeaderboardRefresh(delayMs = 0) {
  if (_leaderboardRefreshTimer) clearTimeout(_leaderboardRefreshTimer);
  _leaderboardRefreshTimer = setTimeout(() => {
    _leaderboardRefreshTimer = null;
    loadLeaderboard();
  }, delayMs);
}

function _isTreasureInActiveScope(t) {
  if (!t) return false;
  if (!Array.isArray(activeQuests) || activeQuests.length === 0) return true;
  const quest = String(t.quest || '').trim();
  return !quest || activeQuests.includes(quest);
}

function applyTreasureRealtimePayload(payload) {
  if (!payload || !Array.isArray(treasures)) return false;
  const eventType = String(payload.eventType || '').toUpperCase();
  const newRow = payload.new || null;
  const oldRow = payload.old || null;
  const targetId = (newRow && newRow.id) || (oldRow && oldRow.id);
  if (!targetId) return false;

  const idx = treasures.findIndex(t => t.id === targetId);

  if (eventType === 'DELETE') {
    if (idx >= 0) treasures.splice(idx, 1);
  } else {
    if (!newRow || newRow.visible !== true || !_isTreasureInActiveScope(newRow)) {
      if (idx >= 0) treasures.splice(idx, 1);
    } else if (idx >= 0) {
      treasures[idx] = { ...treasures[idx], ...newRow };
    } else {
      treasures.push(newRow);
    }
  }

  renderMarkers();
  if (activeTab === 'explore') {
    updateRadar();
    updateNearestCard();
  }
  updateProgressBar();
  return true;
}

function ensureGameRealtimeSync() {
  if (!realtimeEnabled) return null;
  if (gameSyncChannel) return gameSyncChannel;
  if (!window.supabase || !db || typeof db.channel !== 'function') return null;

  gameSyncChannel = db.channel('u3dq-game-sync');
  gameSyncChannel
    .on('postgres_changes', { event: '*', schema: 'public', table: 'events' }, () => {
      scheduleLeaderboardRefresh(150);
    })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'treasures' }, (payload) => {
      const applied = applyTreasureRealtimePayload(payload);
      if (!applied) scheduleTreasureRefresh(180);
    })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'config' }, (payload) => {
      const changedKey = String(payload?.new?.key || payload?.old?.key || '');
      if (changedKey === 'realtimeEnabled') {
        realtimeEnabled = String(payload?.new?.value || '').trim() === 'true';
        if (!realtimeEnabled && gameSyncChannel && db && typeof db.removeChannel === 'function') {
          db.removeChannel(gameSyncChannel);
          gameSyncChannel = null;
          return;
        }
      }
      if (!realtimeEnabled) return;
      scheduleTreasureRefresh(150);
      scheduleLeaderboardRefresh(250);
      if (activeTab === 'explore') updateRadar();
      if (activeTab === 'scores') loadLeaderboard();
    })
    .subscribe();

  return gameSyncChannel;
}

function refreshGameStateManually() {
  if (!navigator.onLine) {
    _setOfflineBanner(true);
    return;
  }
  _setOfflineBanner(false);
  loadTreasures();
  if (activeTab === 'scores') loadLeaderboard();
}

// ── Nearest list ─────────────────────────────────────
let _nearestTreasure = null;
function updateNearestCard() {
  const el = document.getElementById('nearestList');
  if (playerLat === null) { el.style.display = 'none'; return; }
  const pool = treasures
    .filter(t => t.type === 'unique')
    .filter(t => t.lat && t.lng)
    .filter(t => !(t.found_by && t.found_by.length > 0))
    .map(t => ({ ...t, _dist: haversine(playerLat, playerLng, t.lat, t.lng) }))
    .sort((a, b) => a._dist - b._dist)
    .slice(0, 4);

  if (!pool.length) { el.style.display = 'none'; return; }

  _nearestTreasure = pool[0];
  const count = pool.length;
  const header = `${count} POLAROID${count > 1 ? 'S' : ''} LES PLUS PROCHES`;

  el.style.display = 'flex';
  el.innerHTML = `<div class="nl-header">${header}</div>` +
    pool.map((t, idx) => {
      const color = '#db2777';
      const dist = t._dist < 1000 ? Math.round(t._dist) + '\u202fm' : (t._dist / 1000).toFixed(1) + '\u202fkm';
      const name = tLabel(t);
      const shortName = name.length > 20 ? name.slice(0, 19) + '\u2026' : name;
      const safeId = t.id.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
      return `<div class="nl-item" onclick="openTreasureSheet(treasures.find(x=>x.id==='${safeId}'))">
        <div class="nl-dot" style="background:${color};box-shadow:0 0 6px ${color}55"></div>
        <div class="nl-name">${escHtml(shortName)}</div>
        <div class="nl-dist">${escHtml(dist)}</div>
      </div>`;
    }).join('');
}
function onNearestCardClick() {
  if (_nearestTreasure) openTreasureSheet(_nearestTreasure);
}

// ── Treasure sheet ───────────────────────────────────
function openTreasureSheet(t) {
  const isMine   = t.found_by && t.found_by.split(',').includes(myPseudo);
  const isTaken  = t.type === 'unique' && t.found_by && t.found_by.length > 0;
  const typeLabel = 'Polaroid · Flash';
  const urls     = getPhotoUrls(t.photo_url);
  const safeUrls = urls.map(safeImgUrl).filter(Boolean);
  const distM = (playerLat !== null && t.lat && t.lng)
    ? haversine(playerLat, playerLng, t.lat, t.lng)
    : null;
  const photoHtml = (() => {
    if (!safeUrls.length) return '';
    if (safeUrls.length === 1) return `<img src="${escHtml(safeUrls[0])}" onclick="openPhotoViewer('${jsSingleQuoted(safeUrls[0])}')" class="ts-photo">`;
    return `<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:4px;margin-bottom:8px">${
      safeUrls.map(u => `<img src="${escHtml(u)}" onclick="openPhotoViewer('${jsSingleQuoted(u)}')" style="width:100%;aspect-ratio:1;object-fit:cover;border-radius:7px;cursor:zoom-in">`).join('')
    }</div>`;
  })();
  const badge = isMine ? '<span class="ts-badge ts-badge-found">✓ Révélé</span>'
    : isTaken ? '<span class="ts-badge ts-badge-taken">🔒 Flash pris</span>'
    : '<span class="ts-badge ts-badge-open">· À révéler</span>';
  const cta = '';
  const backCta = `<button class="ts-cta ts-cta-secondary" onclick="closeTreasureSheet()" aria-label="Retour au jeu">↩ Retour au jeu</button>`;
  const dist = distM !== null
    ? (() => { const d = distM; return d < 1000 ? Math.round(d) + ' m' : (d/1000).toFixed(1) + ' km'; })()
    : '';
  document.getElementById('tsBody').innerHTML = `
    <div class="ts-top-row">${badge}<span class="ts-type">${escHtml(typeLabel)}</span></div>
    ${photoHtml ? `<div class="ts-photos">${photoHtml}</div>` : ''}
    <div class="ts-name">${escHtml(tLabel(t))}</div>
    ${dist ? `<div class="ts-dist">${escHtml(dist)} de moi</div>` : ''}
    ${(t.hint) ? `<div class="ts-hint">💡 ${escHtml(t.hint)}</div>` : ''}
    ${cta}
    ${backCta}
  `;
  document.getElementById('treasureSheet').classList.add('open');
}
function closeTreasureSheet() {
  document.getElementById('treasureSheet').classList.remove('open');
}

// ── Recenter map ─────────────────────────────────────
function recenterOn(lat, lng) {
  closeTreasureSheet();
  const navBtn = document.getElementById('navDeclic');
  showTab('explore', navBtn);
  if (gameMap) gameMap.setView([lat, lng], 16, { animate: true });
}

// ── Moi panel ────────────────────────────────────────
async function loadMoi() {
  const el = document.getElementById('moiContent');
  const actionsEl = document.getElementById('moiActions');
  if (!el) return;
  const unique = treasures.filter(t => t.type === 'unique');
  const myUnique = unique.filter(t => t.found_by && t.found_by.split(',').includes(myPseudo)).length;

  // Fetch rank from leaderboard
  let rank = '—';
  if (myPseudo) {
    const { data } = await db.from('players').select('pseudo,score').order('score', { ascending: true });
    if (data) {
      const idx = data.findIndex(p => p.pseudo === myPseudo);
      if (idx >= 0) rank = '#' + (idx + 1);
    }
  }

  const pseudo = myPseudo || 'Invité';
  const grad = pseudoGradient(pseudo);
  el.innerHTML = `
    <div class="moi-avatar" style="background:${grad}">${escHtml(pseudo.charAt(0))}</div>
    <div class="moi-pseudo">${escHtml(pseudo)}</div>
    <div class="moi-grid">
      <div class="moi-tile"><div class="moi-tile-val">${myUnique}</div><div class="moi-tile-lbl">Flash</div></div>
      <div class="moi-tile"><div class="moi-tile-val">${unique.length}</div><div class="moi-tile-lbl">Disponibles</div></div>
      <div class="moi-tile"><div class="moi-tile-val">${rank}</div><div class="moi-tile-lbl">Classement</div></div>
    </div>
  `;

  if (actionsEl) {
    actionsEl.innerHTML = myPseudo ? `
      <label class="moi-toggle" for="hapticToggleInput">
        <span class="moi-toggle-copy">
          <strong>Haptic buzz</strong>
          <small>Vibrations de feedback</small>
        </span>
        <input id="hapticToggleInput" type="checkbox" ${hapticEnabled ? 'checked' : ''}>
        <span class="moi-toggle-track" aria-hidden="true"></span>
      </label>
      <button class="moi-calib" id="calibBtn" onclick="resetCompassCalibration()">🧭 Recalibrer le compas</button>
      <button class="moi-logout" id="logoutBtn">Se déconnecter</button>
    ` : '';
  }

  const hapticToggle = document.getElementById('hapticToggleInput');
  if (hapticToggle) {
    hapticToggle.addEventListener('change', () => {
      hapticEnabled = !!hapticToggle.checked;
      localStorage.setItem('u3dq_haptic_enabled', hapticEnabled ? '1' : '0');
      if (hapticEnabled) haptic([40]);
    });
  }

  // addEventListener garanti même si le bouton est injecté dynamiquement
  const logoutBtn = document.getElementById('logoutBtn');
  if (logoutBtn) logoutBtn.addEventListener('click', logoutPlayer);
}
