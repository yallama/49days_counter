/**
 * 設定：可調整的值放在「專案設定 → 指令碼屬性」，這裡是預設值與固定清單。
 *
 * 指令碼屬性（Script Properties）
 *   LINE_CHANNEL_ID   必填。LIFF 所屬 LINE Login channel 的 Channel ID
 *   SPREADSHEET_ID    選填。未填時使用本腳本綁定的試算表（執行 setup() 會自動寫入）
 *   PERIOD_START      選填。共修起始時間，ISO 格式，預設 2026-09-18T04:44:00+08:00
 *   PERIOD_DAYS       選填。共修天數，預設 49
 *   PERIOD_TITLE      選填。標題，預設「家族四十九日共修」
 *   ALLOWED_USER_IDS  選填。允許使用的 LINE userId（逗號或換行分隔）；留空 = 拿到連結的人都能用
 */

// 項目清單需與前端 web/index.html 相同
const SUTRAS = ['大悲咒', '往生咒', '無常經', '十小咒', '金剛經', '心經', '甘露水真言', '佛說阿彌陀經', '普門品', '藥師經', '藥師咒'];
const BUDDHAS = ['南無阿彌陀佛', '南無大慈大悲觀世音菩薩', '南無大願地藏王菩薩'];
const ITEMS = SUTRAS.concat(BUDDHAS);
const MAX_COUNT_SUTRA = 9999;
const MAX_COUNT_BUDDHA = 100000;

const SHEET_RECORDS = 'Records';
const SHEET_MEMBERS = 'Members';
const UNDO_WINDOW_MS = 15 * 60 * 1000;   // 只能撤銷 15 分鐘內自己的紀錄
const TZ_OFFSET_MS = 8 * 3600 * 1000;    // 台北 UTC+8（無日光節約）
const DAY_MS = 86400 * 1000;

const DEFAULTS = {
  PERIOD_START: '2026-09-18T04:44:00+08:00',
  PERIOD_DAYS: '49',
  PERIOD_TITLE: '家族四十九日共修'
};

function getConfig_() {
  const p = PropertiesService.getScriptProperties().getProperties();
  const start = new Date(p.PERIOD_START || DEFAULTS.PERIOD_START).getTime();
  const days = parseInt(p.PERIOD_DAYS || DEFAULTS.PERIOD_DAYS, 10);
  if (!isFinite(start) || !(days > 0)) throw new AppError('SERVER_MISCONFIG', '共修期間設定有誤，請聯絡管理者');
  return {
    channelId: (p.LINE_CHANNEL_ID || '').trim(),
    spreadsheetId: (p.SPREADSHEET_ID || '').trim(),
    periodStart: start,
    periodDays: days,
    title: p.PERIOD_TITLE || DEFAULTS.PERIOD_TITLE,
    allowed: (p.ALLOWED_USER_IDS || '').split(/[\s,]+/).filter(String)
  };
}

/** 台北日曆日的第幾天（起始日 = 1） */
function dayNo_(t, cfg) {
  const idx = x => Math.floor((x + TZ_OFFSET_MS) / DAY_MS);
  return idx(t) - idx(cfg.periodStart) + 1;
}

function maxCountFor_(item) {
  return BUDDHAS.indexOf(item) >= 0 ? MAX_COUNT_BUDDHA : MAX_COUNT_SUTRA;
}

/** 補登功課用：某天（台北日曆日）中午的時間戳，dayNo_() 對它算出來一定是 day */
function dayMidTs_(day, cfg) {
  const idx0 = Math.floor((cfg.periodStart + TZ_OFFSET_MS) / DAY_MS);
  return (idx0 + day - 1) * DAY_MS - TZ_OFFSET_MS + 12 * 3600 * 1000;
}
