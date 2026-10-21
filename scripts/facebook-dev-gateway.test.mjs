import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import http from 'node:http';
import { once } from 'node:events';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const gatewayScript = fileURLToPath(new URL('./facebook-dev-gateway.mjs', import.meta.url));

async function freePort() {
  const server = http.createServer();
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const port = server.address().port;
  await new Promise((resolve) => server.close(resolve));
  return port;
}

test('gateway forwards webhook challenge and signed bytes, limits routes, and checks API readiness', async () => {
  const upstream = http.createServer(async (req, res) => {
    if (req.url === '/api/v1/health/ready') return res.writeHead(200).end('ready');
    if (req.method === 'GET') return res.writeHead(200).end(new URL(req.url, 'http://localhost').searchParams.get('hub.challenge'));
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ body: Buffer.concat(chunks).toString(), signature: req.headers['x-hub-signature-256'] }));
  });
  upstream.listen(0, '127.0.0.1');
  await once(upstream, 'listening');
  const gatewayPort = await freePort();
  const child = spawn(process.execPath, [gatewayScript], {
    env: {
      ...process.env,
      FACEBOOK_DEV_GATEWAY_PORT: String(gatewayPort),
      FACEBOOK_DEV_API_ORIGIN: `http://127.0.0.1:${upstream.address().port}`,
    },
    stdio: 'ignore',
    windowsHide: true,
  });
  const base = `http://127.0.0.1:${gatewayPort}`;
  try {
    let ready = false;
    for (let attempt = 0; attempt < 30; attempt += 1) {
      try {
        ready = (await fetch(`${base}/_gateway/health`)).status === 200;
        if (ready) break;
      } catch { /* gateway starting */ }
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    assert.equal(ready, true);
    assert.equal((await fetch(`${base}/api/v1/customers`)).status, 404);
    const challenge = await fetch(`${base}/api/v1/webhooks/facebook?hub.challenge=probe`);
    assert.equal(await challenge.text(), 'probe');
    const sent = await fetch(`${base}/api/v1/webhooks/facebook`, {
      method: 'POST',
      headers: { 'x-hub-signature-256': 'sha256=fixture' },
      body: '{"object":"page"}',
    });
    assert.deepEqual(await sent.json(), { body: '{"object":"page"}', signature: 'sha256=fixture' });
  } finally {
    child.kill();
    await new Promise((resolve) => upstream.close(resolve));
  }
});
