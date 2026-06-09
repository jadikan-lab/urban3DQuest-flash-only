
// ── Init game ────────────────────────────────────────
const _gameCopy = (key, fallback = '') => (window.u3dqCopyText ? window.u3dqCopyText(key, fallback) : fallback);

async function initGame(pendingFoundId) {
  // Flash-only fork: force unique mode every time.
  if (activeGameMode !== 'unique') {
    activeGameMode = 'unique';
  }
  localStorage.setItem('u3dq_game_mode', 'unique');
  updateHeader();
  updateModeUI();
  updateGpsLoadingPanel();
  document.body.classList.toggle('flash-mode', activeGameMode === 'unique');
  document.getElementById('radarBar').style.display = 'block';

  // Load config
  const { data: cfg } = await db.from('config').select('*');
  if (cfg) {
    const c = Object.fromEntries(cfg.map(r => [r.key, r.value]));
    if (c.proximityRadius) proximityR = Number(c.proximityRadius);
    if (c.modeMap !== undefined)     modeMap     = c.modeMap !== 'false';
    if (c.modeCompass !== undefined) modeCompass = c.modeCompass !== 'false';
    if (c.gameActive === 'false') showPause();
    if (c.activeQuests) { try { activeQuests = JSON.parse(c.activeQuests); } catch { activeQuests = []; } }
    else if (c.activeQuest) { activeQuests = c.activeQuest ? [c.activeQuest] : []; }
    if (c.mapCenter) {
      const parts = c.mapCenter.split(',').map(Number);
      if (parts.length === 2 && !isNaN(parts[0])) mapCenter = parts;
    }
    if (c.gameStart) {
      const gs = new Date(c.gameStart);
      if (!isNaN(gs.getTime())) gameStart = gs;
    }
    const requiredVersion = c.minSupportedVersion || c.minAppVersion || '';
    if (!enforceMinSupportedVersion(requiredVersion)) return;
    realtimeEnabled = c.realtimeEnabled === 'true';
    egressEmergencyMode = c.egressEmergency === 'true';
    qrGuideFlashUrl = safeImgUrl(c.qrGuideFlashUrl || '');
    qrGuideGenericUrl = safeImgUrl(c.qrGuideGenericUrl || '');
    // Tutorial example photo
    if (c.examplePhotoUrl) {
      const qtp = document.getElementById('qtExamplePhoto');
      if (qtp) { qtp.src = c.examplePhotoUrl; qtp.style.display = 'block'; }
    }
  }

  // Load treasures & init map
  await loadTreasures();
  initMap();
  if (realtimeEnabled) ensureGameRealtimeSync();
  batterySaverMode = !!localStorage.getItem('u3dq_bsaver');
  if (batterySaverMode) {
    const bso = document.getElementById('batterySaverOverlay');
    if (bso) bso.classList.add('active');
  } else {
    startCompassInterval();
  }

  // Start orientation sensor (Android = no permission; iOS = button shown)
  startOrientationWatch();

  // iOS Safari needs a small delay after page load before watchPosition works reliably
  setTimeout(() => startGeoWatch(), 300);
  const gpsChipEl = document.getElementById('gpsChip');
  if (gpsChipEl && !gpsChipEl.dataset.boundKick) {
    gpsChipEl.dataset.boundKick = '1';
    gpsChipEl.style.cursor = 'pointer';
    gpsChipEl.addEventListener('click', () => requestGpsKick());
  }
  const radarBarEl = document.getElementById('radarBar');
  if (radarBarEl && !radarBarEl.dataset.boundKick) {
    radarBarEl.dataset.boundKick = '1';
    radarBarEl.addEventListener('click', () => {
      if (playerLat === null) requestGpsKick();
    });
  }
  if (isIOSDevice() && !geoGestureKickBound) {
    geoGestureKickBound = true;
    const oneShotKick = () => {
      if (playerLat === null) requestGpsKick();
      document.removeEventListener('touchend', oneShotKick, true);
      document.removeEventListener('click', oneShotKick, true);
    };
    document.addEventListener('touchend', oneShotKick, true);
    document.addEventListener('click', oneShotKick, true);
  }
  updateProgressBar();

  // Clean URL & process pending QR
  if (pendingFoundId) {
    history.replaceState({}, '', location.pathname);
    await processFindById(pendingFoundId);
  }

  maybeOpenQuickTutorial();
  // Welcome back toast for returning players
  if (myPseudo && myFoundCount > 0 && !sessionStorage.getItem('u3dq_welcome_seen')) {
    const remaining = treasures.filter(t => t.type === 'unique' && !(t.found_by && t.found_by.length > 0)).length;
    if (remaining > 0) {
      const wt = document.getElementById('welcomeToast');
      if (wt) {
        const pseudoForToast = myPseudo.length > 20 ? (myPseudo.slice(0, 19) + '…') : myPseudo;
        const copy = (key, fallback = '') => (window.u3dqCopyText ? window.u3dqCopyText(key, fallback) : fallback);
        wt.textContent = copy('RETOUR_MESSAGE_FLASH', 'Bon retour {PSEUDO} ! Il reste {N} flash a capturer.')
          .replace('{PSEUDO}', pseudoForToast)
          .replace('{N}', String(remaining));
        wt.classList.add('show');
        sessionStorage.setItem('u3dq_welcome_seen', '1');
        setTimeout(() => wt.classList.remove('show'), 4000);
      }
    }
  }
}

let _lastCheckinId = null; // pour le bouton Réessayer

function _checkinError(msg, retryId) {
  setFoundIcon('gps', 'warn');
  document.getElementById('foundTitle').textContent = 'Trouvaille';
  document.getElementById('foundDuration').textContent = '';
  document.getElementById('foundDesc').textContent = msg;
  document.getElementById('foundPhotoStrip').style.display = 'none';
  document.getElementById('foundPhoto').style.display = 'none';
  // Bouton Réessayer : visible uniquement si un ID de balise est fourni
  _lastCheckinId = retryId || null;
  const retryBtn = document.getElementById('foundRetryBtn');
  if (retryBtn) retryBtn.style.display = retryId ? 'block' : 'none';
  document.getElementById('foundModal').classList.add('open');
}

function _retryCheckin() {
  closeFound();
  if (_lastCheckinId) {
    openQRScanner(_lastCheckinId);
  }
}

function updateHeader() {
  const chip = document.getElementById('headerPseudo');
  if (!chip) return;
  if (myPseudo) {
    chip.textContent = myPseudo;
    chip.title = '';
  } else {
    chip.textContent = '👤 Se connecter';
    chip.title = 'Cliquer pour rejoindre le jeu';
  }
}

function updateModeUI() {
  const pbLabel = document.querySelector('#progressBar .pb-label span');
  const guideTitle = document.getElementById('modeGuideTitle');
  const guideText = document.getElementById('modeGuideText');
  const miniMap = document.getElementById('miniMap');
  const copy = (key, fallback = '') => (window.u3dqCopyText ? window.u3dqCopyText(key, fallback) : fallback);

  if (pbLabel) {
    pbLabel.textContent = 'Flash';
  }

  if (miniMap) {
    miniMap.classList.remove('mode-fixed');
    miniMap.classList.add('mode-flash');
  }

  if (guideTitle && guideText) {
    guideTitle.textContent = copy('GUIDE_FLASH_TITRE', 'Mode Flash');
    const flashCount = Array.isArray(treasures)
      ? treasures.filter(x => x.type === 'unique' && !(x.found_by && x.found_by.length > 0) && !(myPseudo && (x.found_by || '').split(',').includes(myPseudo))).length
      : 0;
    if (flashCount <= 0) {
      guideText.textContent = copy('GUIDE_FLASH_SOUS_ZERO', 'Aucune miniature disponible pour le moment');
    } else if (flashCount === 1) {
      guideText.textContent = copy('GUIDE_FLASH_SOUS_SOLO', 'Plus qu\'une miniature à trouver');
    } else {
      guideText.textContent = copy('GUIDE_FLASH_SOUS_MULTI', '{N} miniatures à cueillir · sois le premier !').replace('{N}', String(flashCount));
    }
  }
}

function updateTutorialEntryPoints() {
  const bigBtn = document.getElementById('openTutorialBtn');
  const miniBtn = document.getElementById('tutorialMiniBtn');
  const copy = (key, fallback = '') => (window.u3dqCopyText ? window.u3dqCopyText(key, fallback) : fallback);
  if (bigBtn) bigBtn.style.display = 'none';
  if (miniBtn) {
    miniBtn.style.display = 'inline-flex';
    miniBtn.textContent = copy('HEADER_AIDE', 'Aide');
    miniBtn.setAttribute('aria-label', copy('HEADER_AIDE_ARIA', 'Ouvrir l\'aide'));
  }
}

function setGameMode(mode) {
  const nextMode = mode === 'unique' ? 'unique' : 'unique';
  if (activeGameMode === nextMode) return;

  // Hard reset mode-specific UI to avoid stale Flash artifacts when switching.
  const radarBar = document.getElementById('radarBar');
  if (radarBar) {
    radarBar.textContent = '';
    radarBar.className = '';
  }
  const flashFab = document.getElementById('flashFab');
  if (flashFab) flashFab.style.display = 'none';
  if (typeof hideFlashHint === 'function') hideFlashHint();
  nearestUnique = null;
  flashCaptureStickyId = null;

  activeGameMode = nextMode;
  localStorage.setItem('u3dq_game_mode', 'unique');
  document.body.classList.toggle('flash-mode', activeGameMode === 'unique');
  updateModeUI();
  updateRadar();
  updateNearestCard();
  updateProgressBar();
  // Flash-only: never show quest progression block.
  if (activeTab === 'moi') {
    const ps = document.getElementById('parcoursSection');
    if (ps) ps.style.display = 'none';
  }

  lastArrowLat = null;
  lastArrowLng = null;
  lastArrowHeading = null;
  _clearArrows();
  renderMarkers();
  applyExploreMapLock();
  applyMapHeadingRotation();
  updateCompass();
  updateGpsLoadingPanel();
}

// Reconnexion depuis mode invité : rouvre l'écran pseudo
function onHeaderPseudoClick() {
  if (myPseudo) {
    showTabFromMore('moi');
  } else {
    const ps = document.getElementById('pseudoScreen');
    if (ps) ps.style.display = 'flex';
    const inp = document.getElementById('pseudoInput');
    if (inp) { inp.value = ''; inp.focus(); }
  }
}

function openQuickTutorial() {
  const el = document.getElementById('quickTutorial');
  if (!el) return;
  const copy = (key, fallback = '') => (window.u3dqCopyText ? window.u3dqCopyText(key, fallback) : fallback);
  const title = document.getElementById('qtTitle');
  const intro = document.getElementById('qtIntro');
  const cardTitle = document.getElementById('qtCardTitle');
  const cardText = document.getElementById('qtCardText');
  const gpsBtn = document.getElementById('qtGpsBtn');
  const closeBtn = document.getElementById('qtCloseBtn');
  const note = document.getElementById('qtNote');

  if (title) title.textContent = copy('TUTO_MINI_TITRE', 'Mode Flash');
  if (intro) intro.textContent = copy('TUTO_MINI_INTRO', 'Repere une miniature proche puis scanne son QR.');
  if (cardTitle) cardTitle.textContent = copy('TUTO_MINI_CARD_TITRE', 'Rappel rapide');
  if (cardText) cardText.textContent = copy('TUTO_MINI_CARD_TEXTE', 'Approche-toi, ouvre le scan, capture avant les autres.');
  if (gpsBtn) gpsBtn.textContent = copy('TUTO_MINI_GPS_BTN', 'Activer GPS');
  if (closeBtn) closeBtn.textContent = copy('TUTO_MINI_CLOSE_BTN', 'Fermer');
  if (note) note.textContent = copy('TUTO_MINI_NOTE', 'Aide optionnelle.');

  el.classList.add('open');
}

function closeQuickTutorial(evt) {
  const el = document.getElementById('quickTutorial');
  if (!el) return;
  if (evt && evt.target && evt.target.id !== 'quickTutorial') return;
  el.classList.remove('open');
  tutorialSeen = true;
  localStorage.setItem('u3dq_tuto_seen', '1');
  updateTutorialEntryPoints();
}

function tutorialEnableGps() {
  requestGpsKick();
}

function tutorialEnableCompass() {
  requestGpsKick();
}

function maybeOpenQuickTutorial() {
  updateTutorialEntryPoints();
  // Keep tutorial available on demand only (button), no auto-open overlay.
}

async function loadTreasures() {
  // Snapshot available flash treasures before refresh (for "just taken nearby" detection)
  const _prevAvailableFlash = new Set(
    treasures.filter(t => t.type === 'unique' && !(t.found_by && t.found_by.length > 0)).map(t => t.id)
  );
  let data = null;
  let error = null;
  ({ data, error } = await db.from('treasures')
    .select('id,type,lat,lng,label,hint,visible,photo_url,found_by,placed_at,activated_at,quest')
    .eq('visible', true));
  if (error && /activated_at/i.test(error.message || '')) {
    // Backward-compatible fallback for environments where the migration was not applied yet.
    const retry = await db.from('treasures')
      .select('id,type,lat,lng,label,hint,visible,photo_url,found_by,placed_at,quest')
      .eq('visible', true);
    error = retry.error;
    data = (retry.data || []).map(t => ({ ...t, activated_at: null }));
  }
  if (error) {
    console.error('loadTreasures error:', error.message);
    const bar = document.getElementById('radarBar');
    if (bar) { bar.textContent = '⚠️ Erreur réseau — vérifie ta connexion'; bar.className = ''; }
    return;
  }
  if (!data) return;
  // Flash-only fork: keep only unique treasures.
  if (activeQuests.length) {
    treasures = data.filter(t => t.type === 'unique' && (!t.quest || activeQuests.includes(t.quest)));
  } else {
    treasures = data.filter(t => t.type === 'unique');
  }
  // Detect flash treasures taken by someone else while we were nearby
  if (_prevAvailableFlash.size > 0 && playerLat !== null && activeGameMode === 'unique') {
    const newlyTaken = treasures.filter(t =>
      t.type === 'unique' &&
      _prevAvailableFlash.has(t.id) &&
      t.found_by && t.found_by.length > 0 &&
      !(myPseudo && t.found_by.split(',').includes(myPseudo)) &&
      t.lat && t.lng &&
      haversine(playerLat, playerLng, t.lat, t.lng) <= 300
    );
    if (newlyTaken.length > 0) showFlashTakenToast(newlyTaken);
  }
}

function showFlashTakenToast(taken) {
  const el = document.getElementById('flashTakenToast');
  if (!el) return;
  const copy = (key, fallback = '') => (window.u3dqCopyText ? window.u3dqCopyText(key, fallback) : fallback);
  if (taken.length === 1) {
    const who = taken[0].found_by || '?';
    el.textContent = copy('FLASH_TAKEN_TOAST_ONE', '⚡ {PSEUDO} vient de capturer une miniature !').replace('{PSEUDO}', who);
  } else {
    el.textContent = copy('FLASH_TAKEN_TOAST_MULTI', '⚡ {N} miniatures viennent d\'être capturées !').replace('{N}', String(taken.length));
  }
  el.classList.add('show');
  clearTimeout(el._hideTimer);
  el._hideTimer = setTimeout(() => el.classList.remove('show'), 4000);
}

