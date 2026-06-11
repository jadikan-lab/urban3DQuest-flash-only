// ── Find processing & UI feedback ───────────────────
let _processingFind = false;
const _inFlightCaptures = new Set(); // protection double-scan par balise
window._uniqueCaptureShareData = window._uniqueCaptureShareData || null;
let _lastUniqueSuccessModal = { id: null, at: 0 };
const _findCopy = (key, fallback = '') => (window.u3dqCopyText ? window.u3dqCopyText(key, fallback) : fallback);

function _getUniqueDurationFromLastActivationSec(treasure) {
  if (!treasure) return 0;
  const anchorIso = treasure.activated_at || treasure.placed_at;
  if (!anchorIso) return 0;
  const anchor = new Date(anchorIso).getTime();
  if (!Number.isFinite(anchor)) return 0;
  return Math.max(0, Math.round((Date.now() - anchor) / 1000));
}

function _isMissingSecureFindRpcError(error) {
  const code = String(error?.code || '');
  const msg = String(error?.message || '');
  return code === '42883' || /process_find_secure/i.test(msg);
}

function _isTreasureAllowedInActiveScope(treasure) {
  return !!treasure;
}

async function _tryProcessFindSecure(t) {
  const hasGps = Number.isFinite(playerLat) && Number.isFinite(playerLng);
  const payload = {
    p_pseudo: myPseudo,
    p_session_token: myToken || null,
    p_treasure_id: t.id,
    p_player_lat: hasGps ? playerLat : null,
    p_player_lng: hasGps ? playerLng : null,
    p_proximity_m: Math.max(10, Number(proximityR) || 100)
  };

  const { data, error } = await db.rpc('process_find_secure', payload);
  if (error) {
    if (_isMissingSecureFindRpcError(error)) {
      _checkinError('Validation serveur indisponible pour le moment. Réessaie dans quelques secondes.');
      return true;
    }
    _checkinError('Révélation impossible pour le moment. Réessaie dans quelques secondes.');
    return true;
  }
  if (!data || !data.status) {
    _checkinError('Réponse serveur invalide. Réessaie dans quelques secondes.');
    return true;
  }

  if (data.status === 'not_found') { _checkinError('Polaroid introuvable — il a peut-être été retiré.'); return true; }
  if (data.status === 'hidden')   { _checkinError('Ce polaroid n\'est pas encore actif.'); return true; }
  if (data.status === 'no_gps')   { _checkinError('GPS requis pour valider cette capture.'); return true; }
  if (data.status === 'invalid_session') {
    _checkinError('Session expirée — reconnecte-toi puis réessaie.');
    return true;
  }
  if (data.status === 'too_far') {
    const dist = Math.round(Number(data.distance_m || 0));
    _checkinError(`Tu es à ${dist}m de "${tLabel(t)}" — trop loin pour révéler.\nApproche-toi à moins de ${proximityR}m.`, t.id);
    return true;
  }
  if (data.status === 'already') { showFoundResult('already', t); return true; }
  if (data.status === 'taken')   { showFoundResult('taken', t); return true; }
  if (data.status !== 'success') return false;

  const durationSec = _getUniqueDurationFromLastActivationSec(t);

  const { data: pFresh } = await db.from('players').select('score,found_count').eq('pseudo', myPseudo).single();
  if (pFresh) {
    myScore = pFresh.score || 0;
    myFoundCount = pFresh.found_count || 0;
  }

  await loadTreasures();
  renderMarkers();
  updateHeader();
  updateRadar();
  if (typeof updateCollectionProgress === 'function') updateCollectionProgress();
  updateProgressBar();

  haptic([80, 40, 160]);

  showFoundResult('success', t, durationSec, null);
  return true;
}

async function _tryGuestSoloHiddenCapture(t) {
  if (!t || !t.solo_hidden) return false;
  const foundList = (t.found_by || '').split(',').filter(Boolean);
  if (foundList.length > 0) {
    showFoundResult('taken', t);
    return true;
  }

  const payload = {
    found_by: 'AUTRE',
    found_at: new Date().toISOString()
  };
  const { data: updatedRows, error } = await db.from('treasures')
    .update(payload)
    .eq('id', t.id)
    .or('found_by.is.null,found_by.eq.')
    .select('id');
  if (error) {
    _checkinError('Validation serveur indisponible pour le moment. Réessaie dans quelques secondes.');
    return true;
  }
  if (!updatedRows || !updatedRows.length) {
    // Another player may have captured first, or write access is denied.
    showFoundResult('taken', t);
    return true;
  }

  await loadTreasures();
  renderMarkers();
  updateRadar();
  if (typeof updateCollectionProgress === 'function') updateCollectionProgress();
  updateProgressBar();
  showFoundResult('taken', { ...t, found_by: 'AUTRE' });
  return true;
}

async function _trySoloHiddenCaptureNoGps(t) {
  if (!t || !t.solo_hidden) return false;
  const foundList = (t.found_by || '').split(',').filter(Boolean);
  if (foundList.length > 0) {
    showFoundResult('taken', t);
    return true;
  }

  const winner = 'AUTRE';
  const payload = {
    found_by: winner,
    found_at: new Date().toISOString()
  };
  const { data: updatedRows, error } = await db.from('treasures')
    .update(payload)
    .eq('id', t.id)
    .or('found_by.is.null,found_by.eq.')
    .select('id');
  if (error) {
    _checkinError('Validation serveur indisponible pour le moment. Réessaie dans quelques secondes.');
    return true;
  }
  if (!updatedRows || !updatedRows.length) {
    showFoundResult('taken', t);
    return true;
  }

  await loadTreasures();
  renderMarkers();
  updateHeader();
  updateRadar();
  if (typeof updateCollectionProgress === 'function') updateCollectionProgress();
  updateProgressBar();

  showFoundResult('taken', { ...t, found_by: winner });
  return true;
}

async function processFindById(treasureId) {
  if (_processingFind) return;
  if (_inFlightCaptures.has(treasureId)) return;
  _processingFind = true;
  _inFlightCaptures.add(treasureId);
  try {
    await _doProcessFind(treasureId);
  } finally {
    _processingFind = false;
    _inFlightCaptures.delete(treasureId);
  }
}

async function _doProcessFind(treasureId) {
  // Fetch treasure fresh from DB
  const { data: t, error } = await db.from('treasures').select('*').eq('id', treasureId).single();
  if (error || !t) { _checkinError('Polaroid introuvable — il a peut-être été retiré.'); return; }
  if (!t.visible)  { _checkinError('Ce polaroid n\'est pas encore actif.'); return; }
  if (!_isTreasureAllowedInActiveScope(t)) {
    _checkinError('Ce tresor n\'est pas actif dans cette partie.');
    return;
  }
  if (t.type !== 'unique') {
    _checkinError('Seuls les tresors flash/uniques sont actifs dans cette version.');
    return;
  }

  // Solo hidden QR are validated without GPS (first scan wins).
  if (await _trySoloHiddenCaptureNoGps(t)) return;

  if (!myPseudo) {
    if (await _tryGuestSoloHiddenCapture(t)) return;
    _checkinError('Mode invité : connecte-toi pour révéler des polaroids.');
    return;
  }

  // Check if already found by me
  const foundList = (t.found_by || '').split(',').filter(Boolean);
  if (foundList.includes(myPseudo)) { showFoundResult('already', t); return; }

  // Unique: check if taken
  if (t.type === 'unique' && foundList.length > 0) { showFoundResult('taken', t); return; }

  // Secure server path only (fail closed if unavailable).
  if (await _tryProcessFindSecure(t)) return;
  _checkinError('Validation serveur indisponible pour le moment. Réessaie dans quelques secondes.');
}

function showFoundResult(status, t, durationSec) {
  if (t && t.type === 'unique' && status !== 'success') {
    const ageMs = Date.now() - (_lastUniqueSuccessModal.at || 0);
    if (_lastUniqueSuccessModal.id === t.id && ageMs < 8000) return;
  }

  const modal = document.getElementById('foundModal');
  const label  = document.getElementById('foundLabel');
  const title  = document.getElementById('foundTitle');
  const dur    = document.getElementById('foundDuration');
  const desc   = document.getElementById('foundDesc');
  const sharePanel = document.getElementById('foundSharePanel');
  const shareKicker = sharePanel ? sharePanel.querySelector('.found-share-kicker') : null;
  const shareTitle = sharePanel ? sharePanel.querySelector('.found-share-title') : null;
  const shareText = sharePanel ? sharePanel.querySelector('.found-share-text') : null;
  const shareBtn = document.getElementById('foundShareCaptureBtn');
  const inviteBtn = document.getElementById('foundInviteBtn');

  window._uniqueCaptureShareData = null;
  if (sharePanel) sharePanel.classList.add('field-hidden');
  if (shareKicker) {
    const kickerTpl = _findCopy('FLASH_SHARE_KICKER', 'FLASH CAPTURÉ · {PSEUDO}');
    shareKicker.textContent = kickerTpl.replace('{PSEUDO}', myPseudo || 'JOUEUR');
  }
  if (shareTitle) {
    const shareHeadline = _findCopy('FLASH_SHARE_TITLE', '').trim();
    shareTitle.textContent = shareHeadline;
    shareTitle.classList.toggle('field-hidden', !shareHeadline);
  }
  if (shareText) {
    const helper = _findCopy('FLASH_SHARE_TEXT', '').trim();
    shareText.textContent = helper;
    shareText.classList.toggle('field-hidden', !helper);
  }
  if (shareBtn) shareBtn.textContent = _findCopy('FLASH_SHARE_CAPTURE_CTA', 'Partager');
  if (inviteBtn) inviteBtn.textContent = _findCopy('FLASH_SHARE_INVITE_CTA', 'Inviter');

  // Show photos if available and found
  const photoStrip = document.getElementById('foundPhotoStrip');
  const photoSingle = document.getElementById('foundPhoto');
  photoSingle.style.display = 'none';
  if (status === 'success') {
    const photos = getPhotoUrls(t.photo_url);
    if (photos.length) {
      const displayPhotos = t.type === 'unique' ? photos.slice(0, 1) : photos;
      photoStrip.innerHTML = displayPhotos.map(safeImgUrl).filter(Boolean).map(url => `<img src="${escHtml(url)}" style="width:100%;max-height:160px;object-fit:cover;border-radius:10px;margin-bottom:6px;display:block">`).join('');
      photoStrip.style.display = 'block';
    } else { photoStrip.style.display = 'none'; }
  } else { photoStrip.style.display = 'none'; }

  if (status === 'success') {
    setFoundIcon('flash', 'flash');
    label.textContent = _findCopy('FLASH_WIN_LABEL', 'CAPTURE');
    title.textContent = _findCopy('FLASH_WIN_TITRE', 'Tresor unique capture');
    dur.textContent   = formatDuration(durationSec);
    desc.textContent  = _findCopy('FLASH_WIN_DESC', 'Tresor valide. Partage ta capture et continue la chasse.');
    _lastUniqueSuccessModal = { id: t.id, at: Date.now() };
    window._uniqueCaptureShareData = {
      id: t.id,
      label: tLabel(t),
      durationSec: durationSec || 0,
      durationText: durationSec != null ? formatDuration(durationSec) : '',
      shareUrl: location.origin + location.pathname,
      pseudo: myPseudo || '',
      photoUrl: t.photo_url || ''
    };
    if (sharePanel) sharePanel.classList.remove('field-hidden');
  } else if (status === 'already') {
    setFoundIcon('refresh', 'warn');
    label.textContent = _findCopy('FLASH_ALREADY_LABEL', 'DÉJÀ FLASHÉ');
    title.textContent = _findCopy('FLASH_ALREADY_TITRE', 'Tu as déjà flashé ce polaroid.');
    dur.textContent   = '';
    desc.textContent  = '';
  } else {
    setFoundIcon('lock', 'danger');
    label.textContent = _findCopy('FLASH_PRIS_LABEL', 'TROP TARD');
    title.textContent = _findCopy('FLASH_PRIS_TITRE', 'Trop tard !');
    dur.textContent   = '';
    desc.textContent  = _findCopy('FLASH_PRIS_DESC', 'Ce trésor Flash a déjà été pris.');
  }
  modal.classList.add('open');
  // Flash overlay on success
  if (status === 'success') {
    const overlay = document.getElementById('foundFlashOverlay');
    if (overlay) {
      overlay.classList.remove('flash');
      void overlay.offsetWidth; // force reflow
      overlay.classList.add('flash');
    }
  }
}

function closeFound() { document.getElementById('foundModal').classList.remove('open'); }

function openPhotoViewer(url) {
  document.getElementById('photoViewerImg').src = url;
  document.getElementById('photoViewer').classList.add('open');
}
function closePhotoViewer() {
  document.getElementById('photoViewer').classList.remove('open');
  document.getElementById('photoViewerImg').src = '';
}

function uiIconSvg(name) {
  switch (name) {
    case 'camera':  return '<svg viewBox="0 0 22 22"><use href="icons/icons.svg#icon-camera"/></svg>';
    case 'flash':   return '<svg viewBox="0 0 22 22"><use href="icons/icons.svg#icon-flash"/></svg>';
    case 'trophy':  return '<svg viewBox="0 0 22 22"><use href="icons/icons.svg#icon-trophy"/></svg>';
    case 'clock':   return '<svg viewBox="0 0 22 22"><use href="icons/icons.svg#icon-clock"/></svg>';
    case 'check':   return '<svg viewBox="0 0 22 22"><use href="icons/icons.svg#icon-check"/></svg>';
    case 'gps':     return '<svg viewBox="0 0 20 20"><use href="icons/icons.svg#icon-gps"/></svg>';
    case 'refresh': return '<svg viewBox="0 0 22 22"><use href="icons/icons.svg#icon-refresh"/></svg>';
    case 'lock':    return '<svg viewBox="0 0 22 22"><use href="icons/icons.svg#icon-lock"/></svg>';
    default:        return '';
  }
}

function uiIcon(name, className) {
  return `<span class="ui-icon ${className || ''}" aria-hidden="true">${uiIconSvg(name)}</span>`;
}

function setFoundIcon(name, className) {
  const emoji = document.getElementById('foundEmoji');
  if (!emoji) return;
  emoji.innerHTML = uiIcon(name, `lg ${className || ''}`);
}

function formatDuration(sec) {
  if (sec < 60)   return `${sec}s`;
  if (sec < 3600) return `${Math.floor(sec/60)}min ${sec%60}s`;
  if (sec < 86400) return `${Math.floor(sec/3600)}h ${Math.floor((sec%3600)/60)}min`;
  const days = Math.floor(sec / 86400);
  const hours = Math.floor((sec % 86400) / 3600);
  const mins = Math.floor((sec % 3600) / 60);
  return `${days}j ${hours}h ${mins}min`;
}
function pseudoGradient(pseudo) {
  let seed = 0;
  for (let i = 0; i < pseudo.length; i++) seed = (seed * 31 + pseudo.charCodeAt(i)) & 0xffff;
  const palette = ['#ff3d8a','#00e5ff','#ffb020','#a855f7','#4ade80','#60a5fa','#f87171'];
  return `linear-gradient(135deg,${palette[seed % palette.length]},${palette[(seed*7+3) % palette.length]})`;
}

