import { createHmac, randomBytes } from 'node:crypto';

const rawBase = process.env.FB_CALLBACK_BASE_URL;
const verifyToken = process.env.FACEBOOK_WEBHOOK_VERIFY_TOKEN;
const appSecret = process.env.FACEBOOK_APP_SECRET;
if (!rawBase || !verifyToken || !appSecret) {
  throw new Error('Cần FB_CALLBACK_BASE_URL, FACEBOOK_WEBHOOK_VERIFY_TOKEN và FACEBOOK_APP_SECRET trong môi trường chạy.');
}
const base = new URL(rawBase);
if (base.protocol !== 'https:' || base.pathname !== '/' || base.search || base.hash) {
  throw new Error('FB_CALLBACK_BASE_URL phải là origin HTTPS công khai, không kèm path/query.');
}
if (['localhost', '127.0.0.1', '::1'].includes(base.hostname)) {
  throw new Error('Smoke này chỉ dùng với hostname công khai đã cấp.');
}

const webhook = new URL('/api/v1/webhooks/facebook', base);
const oauth = new URL('/api/v1/integrations/oauth/facebook/callback', base);
const health = new URL('/_gateway/health', base);
const challenge = randomBytes(12).toString('hex');

async function probe(name, url, expectedStatus, options, exactBody) {
  const response = await fetch(url, { ...options, signal: AbortSignal.timeout(12000), redirect: 'manual' });
  const body = await response.text();
  if (response.status !== expectedStatus || (exactBody !== undefined && body !== exactBody)) {
    throw new Error(`${name}: HTTP ${response.status}, không đạt trạng thái/nội dung kỳ vọng.`);
  }
  console.log(`${name}: HTTP ${response.status}`);
}

const verifyUrl = new URL(webhook);
verifyUrl.searchParams.set('hub.mode', 'subscribe');
verifyUrl.searchParams.set('hub.verify_token', verifyToken);
verifyUrl.searchParams.set('hub.challenge', challenge);
await probe('gateway health', health, 200);
await probe('webhook challenge đúng', verifyUrl, 200, undefined, challenge);
verifyUrl.searchParams.set('hub.verify_token', 'invalid-smoke-token');
await probe('webhook challenge sai', verifyUrl, 401);

// Empty signed Page entry proves routing/signature validation without enqueuing a fake customer event.
const body = JSON.stringify({ object: 'page', entry: [] });
const signature = `sha256=${createHmac('sha256', appSecret).update(body).digest('hex')}`;
await probe('webhook POST chữ ký đúng, không có event', webhook, 200, {
  method: 'POST', headers: { 'content-type': 'application/json', 'x-hub-signature-256': signature }, body,
});
await probe('webhook POST chữ ký sai', webhook, 401, {
  method: 'POST', headers: { 'content-type': 'application/json', 'x-hub-signature-256': 'sha256=invalid' }, body,
});

const oauthUrl = new URL(oauth);
oauthUrl.searchParams.set('state', 'invalid-smoke-state');
await probe('OAuth callback state không hợp lệ', oauthUrl, 400);
console.log(`Webhook URL: ${webhook.origin}${webhook.pathname}`);
console.log(`OAuth URL: ${oauth.origin}${oauth.pathname}`);
console.log('Đây chỉ là kiểm HTTPS/route/challenge/signature; OAuth consent và Meta delivery thật vẫn chờ dashboard và tài khoản thử.');
