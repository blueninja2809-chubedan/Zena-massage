import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { URL } from 'node:url';

function readDotEnv() {
  try {
    const raw = readFileSync(new URL('../.env', import.meta.url), 'utf8');
    const values = {};
    for (const line of raw.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eq = trimmed.indexOf('=');
      if (eq <= 0) continue;
      const key = trimmed.slice(0, eq).trim();
      const value = trimmed.slice(eq + 1).trim();
      values[key] = value;
    }
    return values;
  } catch {
    return {};
  }
}

const dotEnv = readDotEnv();

const TARGET_BASE =
  process.env.SUPABASE_TARGET_URL || process.env.EXPO_PUBLIC_SUPABASE_URL || dotEnv.SUPABASE_TARGET_URL || dotEnv.EXPO_PUBLIC_SUPABASE_URL;
const ANON_KEY =
  process.env.SUPABASE_ANON_KEY || process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || dotEnv.SUPABASE_ANON_KEY || dotEnv.EXPO_PUBLIC_SUPABASE_ANON_KEY;
const PORT = Number(process.env.SUPABASE_PROXY_PORT || 54321);

if (!TARGET_BASE) {
  console.error('Missing SUPABASE_TARGET_URL (or EXPO_PUBLIC_SUPABASE_URL).');
  process.exit(1);
}

function shouldHaveBody(method) {
  return !['GET', 'HEAD'].includes(method.toUpperCase());
}

const server = createServer(async (req, res) => {
  try {
    const requestUrl = new URL(req.url || '/', TARGET_BASE);
    const chunks = [];
    for await (const chunk of req) {
      chunks.push(chunk);
    }
    const bodyBuffer = chunks.length > 0 ? Buffer.concat(chunks) : undefined;

    const headers = {};
    for (const [key, value] of Object.entries(req.headers)) {
      if (!value) continue;
      const lowerKey = key.toLowerCase();
      if (['host', 'connection', 'content-length', 'expect'].includes(lowerKey)) continue;
      headers[key] = Array.isArray(value) ? value.join(', ') : value;
    }

    if (ANON_KEY && !headers.apikey) {
      headers.apikey = ANON_KEY;
    }

    const upstream = await fetch(requestUrl, {
      method: req.method,
      headers,
      body: shouldHaveBody(req.method || 'GET') ? bodyBuffer : undefined,
    });

    const responseHeaders = {};
    upstream.headers.forEach((value, key) => {
      if (key.toLowerCase() === 'transfer-encoding') return;
      responseHeaders[key] = value;
    });

    const responseBody = Buffer.from(await upstream.arrayBuffer());
    res.writeHead(upstream.status, responseHeaders);
    res.end(responseBody);
  } catch (error) {
    const message =
      error instanceof Error
        ? `${error.message}${error.cause instanceof Error ? `: ${error.cause.message}` : ''}`
        : 'Unknown proxy error';
    res.writeHead(502, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ error: 'proxy_error', message }));
  }
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Supabase proxy listening at http://0.0.0.0:${PORT}`);
  console.log(`Forwarding to ${TARGET_BASE}`);
});
