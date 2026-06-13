function _onGeoSuccess(pos) {
  geoLastFixAt = Date.now();
  geoLastErrorCode = null;
  geoLastErrorAt = 0;
  geoPreferHighAccuracy = true;
  if (geoNoFixHintTimer) { clearTimeout(geoNoFixHintTimer); geoNoFixHintTimer = null; }
  const gpsKickBtn = document.getElementById('gpsKickBtn');
  if (gpsKickBtn) gpsKickBtn.style.display = 'none';
  const locateBtn = document.getElementById('locateMeBtn');
  if (locateBtn && activeTab === 'explore') locateBtn.style.display = 'block';
  // Smooth GPS: keep last 5 positions, weighted average
  gpsHistory.push({ lat: pos.coords.latitude, lng: pos.coords.longitude, acc: pos.coords.accuracy });
  if (gpsHistory.length > 3) gpsHistory.shift();
  const firstFix = gpsHistory.length === 1;
  const weights = [1, 2, 3].slice(3 - gpsHistory.length);
  const totalW = weights.reduce((a,b) => a+b, 0);
  playerLat = gpsHistory.reduce((s, p, i) => s + p.lat * weights[i], 0) / totalW;
  playerLng = gpsHistory.reduce((s, p, i) => s + p.lng * weights[i], 0) / totalW;
  playerAccuracy = pos.coords.accuracy;

  const now = Date.now();
  const rawHeading = pos && pos.coords ? pos.coords.heading : null;
  const rawSpeed = pos && pos.coords ? pos.coords.speed : null;
  let computedCourse = null;
  let computedSpeed = Number.isFinite(rawSpeed) && rawSpeed >= 0 ? rawSpeed : 0;

  if (Number.isFinite(rawHeading) && rawHeading >= 0) {
    computedCourse = _normHeading(rawHeading);
  } else if (gpsCourseLastPoint) {
    const dtSec = Math.max(0.001, (now - gpsCourseLastPoint.at) / 1000);
    const distM = haversine(gpsCourseLastPoint.lat, gpsCourseLastPoint.lng, playerLat, playerLng);
    if (!Number.isFinite(rawSpeed) || rawSpeed < 0) computedSpeed = distM / dtSec;
    if (dtSec >= 0.8 && distM >= 2.0) {
      computedCourse = bearingTo(gpsCourseLastPoint.lat, gpsCourseLastPoint.lng, playerLat, playerLng);
    }
  }

  gpsCourseSpeed = Number.isFinite(computedSpeed) ? computedSpeed : 0;
  if (Number.isFinite(computedCourse)) {
    gpsCourseHeading = computedCourse;
    gpsCourseLastAt = now;
  }
  gpsCourseLastPoint = { lat: playerLat, lng: playerLng, at: now };
  refreshEffectiveHeading();

  // Update GPS chip in header
  const chip = document.getElementById('gpsChip');
  const lbl  = document.getElementById('gpsLabel');
  const acc  = Math.round(playerAccuracy);
  if (chip && lbl) {
    lbl.textContent = `±${acc}m`;
    chip.className = acc <= 15 ? 'gps-ok' : acc <= 40 ? 'gps-mid' : 'gps-bad';
    chip.title = acc <= 15 ? `GPS précis (±${acc}m)` : acc <= 40 ? `GPS moyen (±${acc}m) — reste à l'air libre` : `GPS faible (±${acc}m) — éloigne-toi des bâtiments`;
  }

  if (gameMap) {
    const pos2 = [playerLat, playerLng];
    const circleColor = acc <= 15 ? '#22c55e' : acc <= 40 ? '#f59e0b' : '#ef4444';
    if (!accuracyCircle) {
      accuracyCircle = L.circle(pos2, { radius: playerAccuracy, color: circleColor, fillColor: circleColor, fillOpacity: 0.08, weight: 1.5, opacity: 0.4 }).addTo(gameMap);
    } else {
      accuracyCircle.setLatLng(pos2).setRadius(playerAccuracy).setStyle({ color: circleColor, fillColor: circleColor });
    }
    if (!playerMarker) {
      const icon = L.divIcon({
        html: `<div class="me-dot"></div>`,
        className: '', iconSize: [16, 16], iconAnchor: [8, 8]
      });
      playerMarker = L.marker(pos2, { icon, zIndexOffset: 1000 }).addTo(gameMap);
    } else {
      playerMarker.setLatLng(pos2);
    }
    if (activeTab === 'explore') {
      if (mapFollowing) gameMap.setView(pos2, gameMap.getZoom(), { animate: true });
    }
  }

  updateRadar();
  applyMapHeadingRotation();
  scheduleCompassRender(firstFix);
  updateGpsLoadingPanel();
}

function _onGeoError(err) {
  geoLastErrorCode = err.code;
  geoLastErrorAt = Date.now();
  const msgs = {
    1: 'Permission GPS refusée — Réglages > Localisation > Autoriser',
    2: 'GPS indisponible — passe en zone dégagée puis relance GPS',
    3: 'GPS trop lent — reste a l\'air libre puis relance GPS'
  };
  const bar = document.getElementById('radarBar');
  bar.textContent = msgs[err.code] || 'Erreur GPS';
  bar.className = '';
  const chip = document.getElementById('gpsChip');
  const lbl  = document.getElementById('gpsLabel');
  if (chip && lbl) { lbl.textContent = 'off'; chip.className = 'gps-bad'; }
  const gpsKickBtn = document.getElementById('gpsKickBtn');
  if (gpsKickBtn && isIOSDevice() && activeTab === 'explore' && playerLat === null) {
    gpsKickBtn.style.display = 'block';
  }

  // iOS can stall geolocation; retry automatically except when permission is denied.
  if (err.code !== 1) {
    geoPreferHighAccuracy = false;
    if (geoWatch !== null) { navigator.geolocation.clearWatch(geoWatch); geoWatch = null; }
    setTimeout(() => startGeoWatch(true, false), 1200);
  }
  updateGpsLoadingPanel();
}

function requestGpsKick() {
  if (!navigator.geolocation) return;
  const bar = document.getElementById('radarBar');
  if (bar) {
    bar.textContent = 'Relance GPS…';
    bar.className = '';
  }
  const gpsKickBtn = document.getElementById('gpsKickBtn');
  if (gpsKickBtn) gpsKickBtn.style.display = 'none';
  geoPreferHighAccuracy = false;
  updateGpsLoadingPanel();
  startGeoWatch(true, false);
  navigator.geolocation.getCurrentPosition(pos => {
    _onGeoSuccess(pos);
  }, err => {
    _onGeoError(err);
  }, { enableHighAccuracy: false, timeout: 12000, maximumAge: 0 });
}

function startGeoWatch(forceRestart, preferredHighAccuracy) {
  if (!navigator.geolocation) {
    document.getElementById('radarBar').textContent = 'GPS non disponible sur cet appareil';
    updateGpsLoadingPanel();
    return;
  }
  if (geoWatch !== null) {
    if (!forceRestart) return; // already watching
    navigator.geolocation.clearWatch(geoWatch);
    geoWatch = null;
  }

  // Show "searching" state immediately so the chip is never stuck grey
  const chip0 = document.getElementById('gpsChip');
  const lbl0  = document.getElementById('gpsLabel');
  if (chip0 && lbl0) { lbl0.textContent = '…'; chip0.className = 'gps-mid'; }
  updateGpsLoadingPanel();

  const useHighAccuracy = preferredHighAccuracy !== undefined ? preferredHighAccuracy : geoPreferHighAccuracy;
  geoLastStartAt = Date.now();

  // Warmup one-shot often helps iOS Safari deliver the first fix reliably.
  navigator.geolocation.getCurrentPosition(pos => {
    _onGeoSuccess(pos);
  }, () => {}, { enableHighAccuracy: useHighAccuracy, timeout: 9000, maximumAge: 0 });

  geoWatch = navigator.geolocation.watchPosition(pos => {
    _onGeoSuccess(pos);
  }, err => {
    _onGeoError(err);
  }, { enableHighAccuracy: useHighAccuracy, maximumAge: 3000, timeout: 9000 });

  if (geoNoFixHintTimer) clearTimeout(geoNoFixHintTimer);
  geoNoFixHintTimer = setTimeout(() => {
    if (playerLat !== null) return;
    const bar = document.getElementById('radarBar');
    const gpsKickBtn = document.getElementById('gpsKickBtn');
    if (bar && isIOSDevice()) {
      bar.textContent = 'GPS lent sur iOS — touche le badge GPS pour relancer';
      bar.className = '';
      if (gpsKickBtn) gpsKickBtn.style.display = 'block';
    }
  }, 8000);

  if (!geoWatchdog) {
    geoWatchdog = setInterval(() => {
      if (document.hidden || !navigator.geolocation) return;
      const now = Date.now();
      const noFirstFix = playerLat === null && geoLastStartAt > 0 && (now - geoLastStartAt > 10000);
      const staleFix = playerLat !== null && geoLastFixAt > 0 && (now - geoLastFixAt > 22000);
      if (noFirstFix || staleFix) {
        const nextHigh = staleFix ? true : false;
        geoPreferHighAccuracy = nextHigh;
        startGeoWatch(true, nextHigh);
      }
    }, 6000);
  }
}

function recenterMap() {
  if (!gameMap || playerLat === null) return;
  mapFollowing = true;
  gameMap.setView([playerLat, playerLng], gameMap.getZoom(), { animate: true });
}

function haversine(lat1, lng1, lat2, lng2) {
  const R = 6371000, toRad = x => x * Math.PI / 180;
  const dLat = toRad(lat2 - lat1), dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat/2)**2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// Returns a point at given distance (meters) and bearing (degrees) from lat/lng
function destinationPoint(lat, lng, bearing, distM) {
  const R = 6371000, d = distM / R, b = bearing * Math.PI / 180;
  const lat1 = lat * Math.PI / 180, lng1 = lng * Math.PI / 180;
  const lat2 = Math.asin(Math.sin(lat1)*Math.cos(d) + Math.cos(lat1)*Math.sin(d)*Math.cos(b));
  const lng2 = lng1 + Math.atan2(Math.sin(b)*Math.sin(d)*Math.cos(lat1), Math.cos(d)-Math.sin(lat1)*Math.sin(lat2));
  return [lat2 * 180/Math.PI, lng2 * 180/Math.PI];
}

function _extractTreasureNumber(t) {
  if (!t) return null;
  const fromId = String(t.id || '').match(/(\d+)(?!.*\d)/);
  if (fromId) return Number(fromId[1]);
  const fromLabel = String(t.label || '').match(/(\d+)(?!.*\d)/);
  if (fromLabel) return Number(fromLabel[1]);
  return null;
}

function _isSoloTreasure(t) {
  if (!t) return false;
  if (t.solo_hidden) return true;
  return /^solo[-_ ]?\d+/i.test(String(t.id || '')) || /^solo[-_ ]?\d+/i.test(String(t.label || ''));
}

// Human-readable label for a treasure (never shows raw ID or generic "sans nom")
function tLabel(t) {
  const num = _extractTreasureNumber(t);
  if (t && t.type === 'fixed' && Number.isFinite(num)) {
    return 'FIX-' + String(Math.max(1, Math.min(99, num))).padStart(2, '0');
  }
  if (t && t.type === 'unique' && Number.isFinite(num)) {
    if (_isSoloTreasure(t)) return 'SOLO-' + String(Math.max(1, Math.min(999, num))).padStart(3, '0');
    return 'FLASH-' + String(Math.max(1, Math.min(999, num))).padStart(3, '0');
  }
  if (t && t.label && t.label.trim()) return t.label.trim();
  return t && t.type === 'fixed' ? 'FIX-00' : 'FLASH-000';
}

function distLabel(d) {
  if (d < 10)   return 'moins de 10m';
  if (d < 50)   return 'moins de 50m';
  if (d < 100)  return 'moins de 100m';
  if (d < 200)  return 'moins de 200m';
  if (d < 500)  return 'moins de 500m';
  if (d < 1000) return 'moins de 1km';
  return 'environ ' + (d / 1000).toFixed(1) + 'km';
}

function haptic(pattern) {
  if (!hapticEnabled) return;
  if (navigator.vibrate) navigator.vibrate(pattern);
}

function _getNearestAvailableUniqueForPlayer() {
  if (!Number.isFinite(playerLat) || !Number.isFinite(playerLng)) {
    return { availableCount: 0, nearest: null };
  }

  let availableCount = 0;
  let nearest = null;
  for (const t of treasures) {
    if (!t || t.type !== 'unique') continue;
    if (t.found_by && t.found_by.length > 0) continue;
    availableCount += 1;

    const zone = getFlashSearchZone(t);
    const centerDist = haversine(playerLat, playerLng, zone.centerLat, zone.centerLng);
    const edgeDist = Math.max(0, centerDist - zone.radiusM);

    if (!nearest || edgeDist < nearest.edgeDist || (edgeDist === nearest.edgeDist && centerDist < nearest.centerDist)) {
      nearest = { t, zone, centerDist, edgeDist };
    }
  }

  return { availableCount, nearest };
}

function updateRadar() {
  if (playerLat === null) return;
  const bar = document.getElementById('radarBar');
  if (activeTab !== 'explore') { bar.style.display = 'none'; return; }
  bar.style.display = 'block';
  const copy = (key, fallback = '') => (window.u3dqCopyText ? window.u3dqCopyText(key, fallback) : fallback);

  const flashFabEl = document.getElementById('flashFab');
  if (!myPseudo) {
    bar.textContent = '👀 Mode invité — carte visible · pas de score · tape en haut pour jouer';
    bar.className = '';
    flashFabEl.style.display = 'none';
    flashCaptureStickyId = null;
    hideFlashHint();
    nearestUnique = null;
    lastHapticZone = null;
    return;
  }

  if (activeGameMode === 'unique') {
    const { availableCount, nearest } = _getNearestAvailableUniqueForPlayer();

    if (!availableCount || !nearest) {
      if (typeof updateCollectionProgress === 'function') updateCollectionProgress();
      bar.textContent = '';
      bar.className = '';
      bar.style.display = 'none';
      flashFabEl.style.display = 'none';
      flashCaptureStickyId = null;
      nearestUnique = null;
      hideFlashHint();
      lastHapticZone = null;
      return;
    }

    const nearestU = nearest;

    if (typeof updateCollectionProgress === 'function') updateCollectionProgress();

    const flashFab = document.getElementById('flashFab');
    const accForFlash = Math.max(0, Math.round(playerAccuracy || 0));
    const trueDistToTreasure = haversine(playerLat, playerLng, nearestU.t.lat, nearestU.t.lng);
    // Keep circle-based guidance, but only unlock scanner when actually close to the real point.
    const flashCaptureInM = Math.max(nearestU.zone.radiusM, FLASH_CAPTURE_M) + Math.min(12, Math.round(accForFlash * 0.35));
    const stickyForSameTarget = flashCaptureStickyId === nearestU.t.id;
    const flashCaptureOutM = flashCaptureInM + 8;
    const inFlashCaptureZone = nearestU.centerDist <= (stickyForSameTarget ? flashCaptureOutM : flashCaptureInM);
    const trueDistInM = FLASH_SCAN_TRUE_DIST_M + Math.min(8, Math.round(accForFlash * 0.25));
    const trueDistOutM = trueDistInM + 6;
    const inTrueCaptureZone = trueDistToTreasure <= (stickyForSameTarget ? trueDistOutM : trueDistInM);
    const gpsAccOk = !Number.isFinite(playerAccuracy) || playerAccuracy <= FLASH_SCAN_MAX_GPS_ACC_M;
    const canUnlockScan = inFlashCaptureZone && inTrueCaptureZone && gpsAccOk;

    if (canUnlockScan) {
      // Two-state UX: inside displayed search circle => scan is available.
      bar.textContent = '';
      bar.className = '';
      bar.style.display = 'none';
      flashCaptureStickyId = nearestU.t.id;
      nearestUnique = nearestU.t;
      flashFab.style.display = 'flex';
      if (nearestU.t.photo_url) showFlashHint(nearestU.t, copy('FLASH_RADAR_SCAN', '📷 Tu peux scanner le QR maintenant.'));
      if (lastHapticZone !== 'unique-capture') { lastHapticZone = 'unique-capture'; haptic([100, 50, 100, 50, 200]); }
    } else {
      // Outside the circle: no radar indication, keep only map/ring guidance.
      bar.textContent = '';
      bar.className = '';
      bar.style.display = 'none';
      flashCaptureStickyId = null;
      nearestUnique = null;
      flashFab.style.display = 'none';
      hideFlashHint();
      if (lastHapticZone !== 'unique-outside') { lastHapticZone = 'unique-outside'; }
    }

    return;
  }
}

function showFlashHint(t, sub) {
  const hint = document.getElementById('flashHint');
  const photoEl = document.getElementById('flashHintPhoto');
  const subEl = document.getElementById('flashHintSub');
  const url = safeImgUrl(getPhotoUrls(t.photo_url)[0]);
  const openPhoto = (ev) => {
    if (ev) ev.stopPropagation();
    if (url) openPhotoViewer(url);
  };
  if (url) {
    photoEl.src = url;
    photoEl.style.display = 'block';
    photoEl.style.pointerEvents = 'auto';
    photoEl.style.cursor = 'zoom-in';
    photoEl.onclick = openPhoto;
    photoEl.alt = `Aperçu de ${tLabel(t)} (toucher pour agrandir)`;
  } else {
    photoEl.style.display = 'none';
    photoEl.style.pointerEvents = 'none';
    photoEl.style.cursor = 'default';
    photoEl.onclick = null;
    photoEl.alt = '';
  }
  subEl.textContent = sub;
  hint.classList.remove('quest-mode');
  hint.classList.add('active');
  hint.style.cursor = url ? 'zoom-in' : 'default';
  hint.onclick = url ? openPhoto : null;
  clearTimeout(hint._autoHide);
}

function hideFlashHint() {
  const hint = document.getElementById('flashHint');
  clearTimeout(hint._autoHide);
  hint.classList.remove('active');
}

async function captureUnique() {
  if (!myPseudo) { _checkinError('Mode invité : connecte-toi pour jouer.'); return; }
  let target = nearestUnique;
  if (!target && playerLat !== null) {
    const accForFlash = Math.max(0, Math.round(playerAccuracy || 0));
    const { nearest } = _getNearestAvailableUniqueForPlayer();
    if (nearest) {
      const trueDistToTreasure = haversine(playerLat, playerLng, nearest.t.lat, nearest.t.lng);
      const flashCaptureInM = Math.max(nearest.zone.radiusM, FLASH_CAPTURE_M) + Math.min(12, Math.round(accForFlash * 0.35));
      const stickyForSameTarget = flashCaptureStickyId === nearest.t.id;
      const flashCaptureOutM = flashCaptureInM + 8;
      const inFlashCaptureZone = nearest.centerDist <= (stickyForSameTarget ? flashCaptureOutM : flashCaptureInM);
      const trueDistInM = FLASH_SCAN_TRUE_DIST_M + Math.min(8, Math.round(accForFlash * 0.25));
      const trueDistOutM = trueDistInM + 6;
      const inTrueCaptureZone = trueDistToTreasure <= (stickyForSameTarget ? trueDistOutM : trueDistInM);
      const gpsAccOk = !Number.isFinite(playerAccuracy) || playerAccuracy <= FLASH_SCAN_MAX_GPS_ACC_M;
      if (inFlashCaptureZone && inTrueCaptureZone && gpsAccOk) target = nearest.t;
    }
  }
  if (!target) {
    _checkinError('Approche-toi davantage pour scanner ce trésor Flash.');
    return;
  }
  if (target.found_by && target.found_by.length > 0) {
    _checkinError('Ce trésor vient d\'être pris — trop tard ! 😅'); return;
  }
  haptic([50, 30, 50]);
  openQRScanner(target.id);
}

// ── Compass orientation ───────────────────────────────
function bearingTo(lat1, lng1, lat2, lng2) {
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const lat1r = lat1 * Math.PI / 180, lat2r = lat2 * Math.PI / 180;
  const y = Math.sin(dLng) * Math.cos(lat2r);
  const x = Math.cos(lat1r) * Math.sin(lat2r) - Math.sin(lat1r) * Math.cos(lat2r) * Math.cos(dLng);
  return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
}

