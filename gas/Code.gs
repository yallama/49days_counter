/**
 * 七七共修計數 — Web App 入口
 *
 * 前端以 POST 傳送 JSON（Content-Type: text/plain，避免 CORS preflight）：
 *   { action: 'bootstrap' | 'add' | 'undo', accessToken: '<LIFF access token>', ... }
 * 回應：{ ok: true, data: {...} } 或 { ok: false, code: 'XXX', message: '給使用者看的訊息' }
 */

class AppError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

function doGet() {
  return json_({ ok: true, data: { service: '49days-counter', time: new Date().toISOString() } });
}

function doPost(e) {
  let body;
  try {
    body = JSON.parse((e && e.postData && e.postData.contents) || '{}');
  } catch (_) {
    return json_({ ok: false, code: 'BAD_REQUEST', message: '請求格式錯誤' });
  }

  try {
    const cfg = getConfig_();
    const user = authenticate_(body.accessToken, cfg);
    switch (body.action) {
      case 'bootstrap':
        touchMember_(cfg, user);
        return json_({ ok: true, data: buildState_(user, cfg, readRecords_(cfg)) });
      case 'add':
        return json_({ ok: true, data: addRecord_(user, cfg, body) });
      case 'undo':
        return json_({ ok: true, data: undoRecord_(user, cfg, body) });
      default:
        throw new AppError('BAD_REQUEST', '未知的操作');
    }
  } catch (ex) {
    if (ex instanceof AppError) return json_({ ok: false, code: ex.code, message: ex.message });
    console.error(ex && ex.stack || ex);
    return json_({ ok: false, code: 'SERVER_ERROR', message: '系統忙碌，請稍後再試' });
  }
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

/**
 * 第一次部署前在編輯器手動執行一次：建立工作表、寫入預設設定。
 */
function setup() {
  const props = PropertiesService.getScriptProperties();
  const bound = SpreadsheetApp.getActiveSpreadsheet();
  if (!props.getProperty('SPREADSHEET_ID') && bound) props.setProperty('SPREADSHEET_ID', bound.getId());
  Object.keys(DEFAULTS).forEach(k => { if (!props.getProperty(k)) props.setProperty(k, DEFAULTS[k]); });
  if (!props.getProperty('LINE_CHANNEL_ID')) props.setProperty('LINE_CHANNEL_ID', '');

  const cfg = getConfig_();
  recordsSheet_(cfg);
  membersSheet_(cfg);
  console.log('setup 完成。試算表：' + ss_(cfg).getUrl());
  if (!cfg.channelId) console.warn('尚未設定 LINE_CHANNEL_ID，請到「專案設定 → 指令碼屬性」填入');
}
