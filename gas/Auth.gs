/**
 * 以 LINE 官方 API 驗證 LIFF access token，取得可信任的 userId。
 * 絕不信任前端直接傳來的 userId / 顯示名稱。
 */
function authenticate_(token, cfg) {
  if (!cfg.channelId) throw new AppError('SERVER_MISCONFIG', '後端尚未設定 LINE_CHANNEL_ID');
  if (!token || typeof token !== 'string' || token.length > 2000) {
    throw new AppError('UNAUTHORIZED', '登入已失效，請重新開啟');
  }

  const cache = CacheService.getScriptCache();
  const key = 'tok:' + Utilities.base64EncodeWebSafe(
    Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, token, Utilities.Charset.UTF_8));
  let user = null;
  const hit = cache.get(key);
  if (hit) {
    user = JSON.parse(hit);
  } else {
    const v = UrlFetchApp.fetch(
      'https://api.line.me/oauth2/v2.1/verify?access_token=' + encodeURIComponent(token),
      { muteHttpExceptions: true });
    if (v.getResponseCode() !== 200) throw new AppError('UNAUTHORIZED', '登入已失效，請重新開啟');
    const vj = JSON.parse(v.getContentText());
    if (String(vj.client_id) !== String(cfg.channelId) || !(vj.expires_in > 0)) {
      throw new AppError('UNAUTHORIZED', '登入驗證失敗，請重新開啟');
    }

    const p = UrlFetchApp.fetch('https://api.line.me/v2/profile', {
      headers: { Authorization: 'Bearer ' + token },
      muteHttpExceptions: true
    });
    if (p.getResponseCode() !== 200) throw new AppError('UNAUTHORIZED', '無法取得 LINE 身分，請重新開啟');
    const pj = JSON.parse(p.getContentText());
    if (!pj.userId) throw new AppError('UNAUTHORIZED', '無法取得 LINE 身分，請重新開啟');

    user = { userId: pj.userId, displayName: String(pj.displayName || '').slice(0, 100) };
    cache.put(key, JSON.stringify(user), Math.max(1, Math.min(600, Math.floor(vj.expires_in))));
  }

  // 每次都檢查白名單，名單調整後立即生效
  if (cfg.allowed.length && cfg.allowed.indexOf(user.userId) < 0) {
    throw new AppError('FORBIDDEN', '您尚未加入此家族共修，請聯絡管理者開通');
  }
  return user;
}
