const crypto = require('crypto');

function verifyInitData(initData, botToken) {
  if (!initData) return false;
  const url = new URLSearchParams(initData);
  const hash = url.get('hash');
  if (!hash) return false;
  url.delete('hash');

  const dataCheckString = Array.from(url.entries())
    .sort(([a],[b]) => a.localeCompare(b))
    .map(([k,v]) => `${k}=${v}`)
    .join('\n');

  const secretKey = crypto.createHmac('sha256', 'WebAppData')
    .update(botToken).digest();
  const signature = crypto.createHmac('sha256', secretKey)
    .update(dataCheckString).digest('hex');

  return signature === hash;
}

module.exports = { verifyInitData };
