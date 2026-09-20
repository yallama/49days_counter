/**
 * 資料存取（Google 試算表）
 *
 * Records：每次誦念一列。撤銷不刪除，只把 status 改為 undone（保留稽核軌跡）。
 * Members：登入過的家人，方便管理者查 userId 設定白名單。
 */
const REC_HEADERS = ['id', 'clientId', 'createdAt', 'userId', 'displayName', 'item', 'count', 'dayNo', 'status', 'undoneAt'];
const MEM_HEADERS = ['userId', 'displayName', 'firstSeen', 'lastSeen'];
const COL = { status: 9 };  // 1-based

function ss_(cfg) {
  const ss = cfg.spreadsheetId ? SpreadsheetApp.openById(cfg.spreadsheetId) : SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) throw new AppError('SERVER_MISCONFIG', '找不到資料試算表，請聯絡管理者');
  return ss;
}

function ensureSheet_(cfg, name, headers) {
  const ss = ss_(cfg);
  let sh = ss.getSheetByName(name);
  if (!sh) {
    sh = ss.insertSheet(name);
    sh.getRange(1, 1, 1, headers.length).setValues([headers]).setFontWeight('bold');
    sh.setFrozenRows(1);
  }
  return sh;
}
function recordsSheet_(cfg) { return ensureSheet_(cfg, SHEET_RECORDS, REC_HEADERS); }
function membersSheet_(cfg) { return ensureSheet_(cfg, SHEET_MEMBERS, MEM_HEADERS); }

/** 避免使用者名稱被試算表當成公式 */
function safeText_(s) {
  s = String(s || '');
  return /^[=+\-@]/.test(s) ? "'" + s : s;
}

function readRecords_(cfg) {
  const sh = recordsSheet_(cfg);
  const n = sh.getLastRow() - 1;
  if (n < 1) return [];
  return sh.getRange(2, 1, n, REC_HEADERS.length).getValues().map((r, i) => ({
    row: i + 2,
    id: String(r[0]),
    clientId: String(r[1]),
    t: r[2] instanceof Date ? r[2].getTime() : new Date(r[2]).getTime(),
    userId: String(r[3]),
    item: String(r[5]),
    n: Number(r[6]),
    status: String(r[8])
  })).filter(r => r.id && isFinite(r.t));
}

/** 回傳給前端的狀態：只含自己的明細 + 全家各項目合計（不列個人） */
function buildState_(user, cfg, records) {
  const family = {};
  ITEMS.forEach(i => { family[i] = 0; });
  const mine = [];
  records.forEach(r => {
    if (r.status !== 'active' || !(r.item in family) || !(r.n > 0)) return;
    family[r.item] += r.n;
    if (r.userId === user.userId) mine.push({ id: r.id, t: r.t, item: r.item, n: r.n });
  });
  return {
    serverNow: Date.now(),
    user: { displayName: user.displayName },
    period: { title: cfg.title, start: cfg.periodStart, days: cfg.periodDays },
    mine: mine,
    family: family
  };
}

function withLock_(fn) {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(20000)) throw new AppError('BUSY', '目前使用人數較多，請稍後再按一次');
  try {
    return fn();
  } finally {
    lock.releaseLock();
  }
}

function addRecord_(user, cfg, body) {
  const item = String(body.item || '');
  const count = Number(body.count);
  if (ITEMS.indexOf(item) < 0) throw new AppError('BAD_REQUEST', '項目不正確');
  if (!Number.isInteger(count) || count < 1 || count > maxCountFor_(item)) {
    throw new AppError('BAD_REQUEST', '遍數需為 1 到 ' + maxCountFor_(item) + ' 之間的整數');
  }
  const raw = String(body.clientId || '').replace(/[^\w-]/g, '').slice(0, 64);
  const clientId = raw ? 'c_' + raw : '';  // 加前綴，避免試算表把它當數字

  const now = Date.now();
  if (now < cfg.periodStart) throw new AppError('NOT_STARTED', '共修尚未開始');
  const today = dayNo_(now, cfg);
  if (today > cfg.periodDays) throw new AppError('ENDED', '共修已圓滿，無法再新增紀錄');

  // 補登：可指定過去（含今天）的某一天，時間戳改用該天中午
  let day = today, t = now;
  if (body.day !== undefined && body.day !== null && body.day !== '') {
    const d = Number(body.day);
    if (!Number.isInteger(d) || d < 1 || d > today) throw new AppError('BAD_REQUEST', '補登日期不正確');
    day = d;
    if (day !== today) t = dayMidTs_(day, cfg);
  }

  return withLock_(() => {
    const records = readRecords_(cfg);
    // 同一個 clientId 重送（例如網路逾時後重試）不重複記錄
    let rec = clientId && records.find(r => r.clientId === clientId && r.userId === user.userId);
    if (!rec) {
      const id = 'r_' + Utilities.getUuid();
      recordsSheet_(cfg).appendRow([id, clientId, new Date(t), user.userId,
        safeText_(user.displayName), item, count, day, 'active', '']);
      SpreadsheetApp.flush();
      rec = { id: id, clientId: clientId, t: t, userId: user.userId, item: item, n: count, status: 'active' };
      records.push(rec);
    }
    return { record: { id: rec.id, t: rec.t, item: rec.item, n: rec.n }, state: buildState_(user, cfg, records) };
  });
}

function undoRecord_(user, cfg, body) {
  const id = String(body.id || '');
  return withLock_(() => {
    const records = readRecords_(cfg);
    const rec = records.find(r => r.id === id);
    if (!rec || rec.userId !== user.userId) throw new AppError('NOT_FOUND', '找不到這筆紀錄');
    if (rec.status === 'active') {
      if (Date.now() - rec.t > UNDO_WINDOW_MS) throw new AppError('UNDO_EXPIRED', '已超過可撤銷的時間');
      recordsSheet_(cfg).getRange(rec.row, COL.status, 1, 2).setValues([['undone', new Date()]]);
      SpreadsheetApp.flush();
      rec.status = 'undone';
    }
    return { state: buildState_(user, cfg, records) };
  });
}

/** 記錄登入過的家人（失敗不影響主要功能） */
function touchMember_(cfg, user) {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(3000)) return;
  try {
    const sh = membersSheet_(cfg);
    const n = sh.getLastRow() - 1;
    const ids = n > 0 ? sh.getRange(2, 1, n, 1).getValues().map(r => String(r[0])) : [];
    const idx = ids.indexOf(user.userId);
    const now = new Date();
    if (idx >= 0) {
      sh.getRange(idx + 2, 2).setValue(safeText_(user.displayName));
      sh.getRange(idx + 2, 4).setValue(now);
    } else {
      sh.appendRow([user.userId, safeText_(user.displayName), now, now]);
    }
    SpreadsheetApp.flush();
  } catch (ex) {
    console.warn('touchMember_ failed', ex);
  } finally {
    lock.releaseLock();
  }
}
