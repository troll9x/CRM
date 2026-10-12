import http from 'node:http';

const listenPort = Number(process.env.FACEBOOK_DEV_GATEWAY_PORT ?? 4100);
const target = new URL(process.env.FACEBOOK_DEV_API_ORIGIN ?? 'http://127.0.0.1:4000');
if (!Number.isInteger(listenPort) || listenPort < 1024 || listenPort > 65535)
  throw new Error('Invalid gateway port.');
if (target.protocol !== 'http:' || !['127.0.0.1', 'localhost'].includes(target.hostname))
  throw new Error('Gateway target must be the local CRM API.');

const routes = new Map([
  ['/api/v1/integrations/oauth/facebook/callback', new Set(['GET'])],
  ['/api/v1/webhooks/facebook', new Set(['GET', 'POST'])],
  ['/api/v1/integrations/oauth/zalo/callback', new Set(['GET'])],
  ['/api/v1/webhooks/zalo', new Set(['POST'])],
]);

http
  .createServer((request, response) => {
    const path = new URL(request.url ?? '/', 'http://localhost').pathname;
    if (!routes.get(path)?.has(request.method ?? '')) {
      response.writeHead(404);
      response.end();
      return;
    }
    const headers = {
      'content-type': request.headers['content-type'] ?? 'application/octet-stream',
      'x-hub-signature-256': request.headers['x-hub-signature-256'] ?? '',
      'x-zevent-signature': request.headers['x-zevent-signature'] ?? '',
    };
    const upstream = http.request(
      {
        hostname: target.hostname,
        port: target.port,
        path: request.url,
        method: request.method,
        headers,
      },
      (upstreamResponse) => {
        response.writeHead(upstreamResponse.statusCode ?? 502, {
          'content-type': upstreamResponse.headers['content-type'] ?? 'text/plain',
          ...(upstreamResponse.headers.location
            ? { location: upstreamResponse.headers.location }
            : {}),
        });
        upstreamResponse.pipe(response);
      },
    );
    upstream.on('error', () => {
      if (!response.headersSent) response.writeHead(502);
      response.end();
    });
    request.pipe(upstream);
  })
  .listen(listenPort, '127.0.0.1', () => {
    process.stdout.write(`Facebook dev gateway listening on 127.0.0.1:${listenPort}\n`);
  });
