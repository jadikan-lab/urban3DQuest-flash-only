// Urban3DQuest — Google Apps Script Web App
// Colle ce code dans : Extensions > Apps Script > Code.gs
// Puis : Déployer > Nouveau déploiement > Web App
//   - Exécuter en tant que : Moi
//   - Accès : Tout le monde (anonyme)

const SHEET_ID = '1Mv9QvrgZrMUteJVGJ4uSQjiAF4I9Jlipje1JLDPEba8';

function doGet(e) {
  const action = e.parameter.action;
  const ss = SpreadsheetApp.openById(SHEET_ID);

  try {
    if (action === 'getTreasures') {
      return jsonResponse(getTreasures(ss));
    }
    if (action === 'getLeaderboard') {
      return jsonResponse(getLeaderboard(ss));
    }
    if (action === 'getConfig') {
      return jsonResponse(getConfig(ss));
    }
    return jsonResponse({ error: 'Unknown action' });
  } catch (err) {
    return jsonResponse({ error: err.message });
  }
}

function doPost(e) {
  const data = JSON.parse(e.postData.contents);
  const action = data.action;
  const ss = SpreadsheetApp.openById(SHEET_ID);

  try {
    if (action === 'registerPlayer') {
      return jsonResponse(registerPlayer(ss, data));
    }
    if (action === 'foundTreasure') {
      return jsonResponse(foundTreasure(ss, data));
    }
    return jsonResponse({ error: 'Unknown action' });
  } catch (err) {
    return jsonResponse({ error: err.message });
  }
}

// ─── READ ──────────────────────────────────────────────────────────────────

function getTreasures(ss) {
  const sheet = ss.getSheetByName('treasures');
  const rows = sheet.getDataRange().getValues();
  const headers = rows[0];
  const treasures = [];
  for (let i = 1; i < rows.length; i++) {
    const obj = {};
    headers.forEach((h, j) => obj[h] = rows[i][j]);
    // Only send visible ones to players
    if (obj.visible === true || obj.visible === 'TRUE' || obj.visible === 'true') {
      treasures.push(obj);
    }
  }
  return { treasures };
}

function getLeaderboard(ss) {
  const sheet = ss.getSheetByName('players');
  const rows = sheet.getDataRange().getValues();
  const headers = rows[0];
  const players = [];
  for (let i = 1; i < rows.length; i++) {
    if (!rows[i][0]) continue;
    const obj = {};
    headers.forEach((h, j) => obj[h] = rows[i][j]);
    players.push(obj);
  }
  // Sort by foundCount desc, then score (duration) asc
  players.sort((a, b) => {
    if (b.foundCount !== a.foundCount) return b.foundCount - a.foundCount;
    return a.score - b.score;
  });
  return { players };
}

function getConfig(ss) {
  const sheet = ss.getSheetByName('config');
  const rows = sheet.getDataRange().getValues();
  const config = {};
  for (let i = 1; i < rows.length; i++) {
    if (rows[i][0]) config[rows[i][0]] = rows[i][1];
  }
  return { config };
}

// ─── WRITE ─────────────────────────────────────────────────────────────────

function registerPlayer(ss, data) {
  const sheet = ss.getSheetByName('players');
  const rows = sheet.getDataRange().getValues();
  // Check if pseudo already exists
  for (let i = 1; i < rows.length; i++) {
    if (rows[i][0] === data.pseudo) {
      return { ok: true, existing: true };
    }
  }
  sheet.appendRow([data.pseudo, new Date().toISOString(), 0, 0]);
  return { ok: true, existing: false };
}

function foundTreasure(ss, data) {
  // data: { pseudo, treasureId, durationSec }
  const tSheet = ss.getSheetByName('treasures');
  const tRows = tSheet.getDataRange().getValues();
  const tHeaders = tRows[0];
  const idCol = tHeaders.indexOf('id');
  const typeCol = tHeaders.indexOf('type');
  const foundByCol = tHeaders.indexOf('foundBy');
  const foundAtCol = tHeaders.indexOf('foundAt');

  let treasureRow = -1;
  let treasureType = '';
  for (let i = 1; i < tRows.length; i++) {
    if (String(tRows[i][idCol]) === String(data.treasureId)) {
      treasureRow = i + 1; // 1-indexed for Sheets
      treasureType = tRows[i][typeCol];
      // If unique and already found → reject
      if (treasureType === 'unique' && tRows[i][foundByCol]) {
        return { ok: false, reason: 'already_found' };
      }
      break;
    }
  }
  if (treasureRow === -1) return { ok: false, reason: 'not_found' };

  const now = new Date().toISOString();

  // Mark treasure as found
  if (treasureType === 'unique') {
    tSheet.getRange(treasureRow, foundByCol + 1).setValue(data.pseudo);
    tSheet.getRange(treasureRow, foundAtCol + 1).setValue(now);
  } else {
    // Fixed: log in foundBy as comma-separated
    const existing = tSheet.getRange(treasureRow, foundByCol + 1).getValue();
    const updated = existing ? existing + ',' + data.pseudo : data.pseudo;
    tSheet.getRange(treasureRow, foundByCol + 1).setValue(updated);
    tSheet.getRange(treasureRow, foundAtCol + 1).setValue(now);
  }

  // Log event
  const eSheet = ss.getSheetByName('events');
  eSheet.appendRow([now, data.pseudo, data.treasureId, treasureType, data.durationSec]);

  // Update player score
  const pSheet = ss.getSheetByName('players');
  const pRows = pSheet.getDataRange().getValues();
  const pHeaders = pRows[0];
  const pPseudoCol = pHeaders.indexOf('pseudo');
  const pScoreCol = pHeaders.indexOf('score');
  const pCountCol = pHeaders.indexOf('foundCount');

  for (let i = 1; i < pRows.length; i++) {
    if (pRows[i][pPseudoCol] === data.pseudo) {
      const newScore = Number(pRows[i][pScoreCol]) + Number(data.durationSec);
      const newCount = Number(pRows[i][pCountCol]) + 1;
      pSheet.getRange(i + 1, pScoreCol + 1).setValue(newScore);
      pSheet.getRange(i + 1, pCountCol + 1).setValue(newCount);
      break;
    }
  }

  return { ok: true, treasureType };
}

// ─── UTILS ─────────────────────────────────────────────────────────────────

function jsonResponse(data) {
  return ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}
