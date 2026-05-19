import http from 'http';
import { handler } from './index';
import type { APIGatewayProxyEventV2 } from 'aws-lambda';

const PORT = 3001;

const server = http.createServer(async (req, res) => {
  let body = '';
  req.on('data', (chunk: Buffer) => { body += chunk; });
  req.on('end', async () => {
    const url = new URL(req.url ?? '/', `http://localhost:${PORT}`);

    const event: APIGatewayProxyEventV2 = {
      version: '2.0',
      routeKey: '$default',
      rawPath: url.pathname,
      rawQueryString: url.search.slice(1),
      headers: Object.fromEntries(
        Object.entries(req.headers).map(([k, v]) => [k, Array.isArray(v) ? v[0] : (v ?? '')])
      ),
      queryStringParameters: Object.fromEntries(url.searchParams) || undefined,
      requestContext: {
        accountId: 'local',
        apiId: 'local',
        domainName: 'localhost',
        domainPrefix: 'local',
        http: {
          method: req.method ?? 'GET',
          path: url.pathname,
          protocol: 'HTTP/1.1',
          sourceIp: '127.0.0.1',
          userAgent: req.headers['user-agent'] ?? '',
        },
        requestId: `local-${Date.now()}`,
        routeKey: '$default',
        stage: '$default',
        time: new Date().toISOString(),
        timeEpoch: Date.now(),
      },
      body: body || undefined,
      isBase64Encoded: false,
    };

    if (req.method === 'OPTIONS') {
      res.writeHead(200, {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      });
      res.end();
      return;
    }

    try {
      const result = await handler(event);
      if (typeof result === 'object' && result !== null && 'statusCode' in result) {
        res.writeHead(result.statusCode as number, {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
          ...(result.headers as object ?? {}),
        });
        res.end(result.body ?? '');
      }
    } catch (e: any) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: e.message }));
    }
  });
});

server.listen(PORT, () => {
  console.log(`Golf App API → http://localhost:${PORT}`);
  console.log('Requires AWS credentials with DynamoDB + SSM access.');
});
