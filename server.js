'use strict';

// Hania's Health Hub: local static-file server + ChatterMate API proxy.
// Run with: node --env-file=.env server.js
// No npm packages are required. Use Node.js 20.6+ for --env-file support.

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

const HOST = '127.0.0.1';
const PORT = Number(process.env.PORT || 3000);
const ROOT = __dirname;
const MAX_BODY_BYTES = 1_000_000;
const CHATTER_API = 'https://chattermate.ai/api/chat';
const SYSTEM_PROMPT = 'You are a hospital report assistant. Answer only from the report data given. Never invent numbers. If the data does not have the answer, say so. Money is in Taka (Tk). Keep answers short. You cannot change any data; refuse requests to edit or delete.';

// The .env value is the default. A key entered in the Settings screen replaces
// it only in server memory; it is not written to a file or returned to the page.
let activeApiKey = process.env.CHATTERMATE_API_KEY || '';

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.ico': 'image/x-icon'
};

function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff'
  });
  res.end(JSON.stringify(payload));
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    let bytes = 0;

    req.on('data', chunk => {
      bytes += chunk.length;
      if (bytes > MAX_BODY_BYTES) {
        reject(new Error('Request body is too large.'));
        req.destroy();
        return;
      }
      body += chunk.toString('utf8');
    });

    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch {
        reject(new Error('Request body must be valid JSON.'));
      }
    });

    req.on('error', reject);
  });
}

function isSameOrigin(req) {
  const origin = req.headers.origin;
  if (!origin) return true; // Allows local command-line testing.
  try {
    const parsed = new URL(origin);
    return parsed.protocol === 'http:' && parsed.host === req.headers.host;
  } catch {
    return false;
  }
}

async function getDefaultModel(apiKey) {
  const response = await fetch(`${CHATTER_API}/models`, {
    method: 'GET',
    headers: { 'X-API-Key': apiKey, 'Accept': 'application/json' },
    signal: AbortSignal.timeout(20_000)
  });

  const text = await response.text();
  let result;
  try {
    result = JSON.parse(text);
  } catch {
    throw new Error(`Models endpoint returned non-JSON data (HTTP ${response.status}).`);
  }

  if (!response.ok) {
    throw new Error(result.error || result.message || `Models request failed (HTTP ${response.status}).`);
  }

  if (!result.default_model_id) {
    throw new Error('The models response did not include default_model_id.');
  }

  return result.default_model_id;
}

function extractModelChunks(streamText) {
  const chunks = [];
  const events = streamText.split(/\r?\n\r?\n/);

  for (const eventBlock of events) {
    const lines = eventBlock.split(/\r?\n/);
    const eventName = lines.find(line => line.startsWith('event:'))
      ?.slice('event:'.length).trim();

    if (eventName !== 'model_chunk') continue;

    const dataLines = lines
      .filter(line => line.startsWith('data:'))
      .map(line => line.slice('data:'.length).trim());

    for (const dataLine of dataLines) {
      if (!dataLine || dataLine === '[DONE]') continue;
      try {
        const item = JSON.parse(dataLine);
        if (typeof item.content === 'string') chunks.push(item.content);
      } catch {
        // Ignore non-JSON keep-alive or metadata lines in the SSE stream.
      }
    }
  }

  return chunks.join('');
}

async function askChatterMate(question, data) {
  if (!activeApiKey) {
    throw new Error('No API key is configured. Enter one in Supervisor Settings or add it to .env.');
  }

  const modelId = await getDefaultModel(activeApiKey);
  const response = await fetch(`${CHATTER_API}/stream`, {
    method: 'POST',
    headers: {
      'X-API-Key': activeApiKey,
      'Content-Type': 'application/json',
      'Accept': 'text/event-stream'
    },
    body: JSON.stringify({
      models: [modelId],
      system_prompt: SYSTEM_PROMPT,
      prompt: `Report data: ${JSON.stringify(data)} Question: ${question}`
    }),
    signal: AbortSignal.timeout(60_000)
  });

  const streamText = await response.text();
  if (!response.ok) {
    throw new Error(`Chat request failed (HTTP ${response.status}). ${streamText.slice(0, 500)}`);
  }

  const answer = extractModelChunks(streamText).trim();
  if (!answer) throw new Error('ChatterMate returned no answer content.');
  return answer;
}

async function handleRequest(req, res) {
  const url = new URL(req.url, `http://${req.headers.host || `${HOST}:${PORT}`}`);
  const pathname = decodeURIComponent(url.pathname);

  if (req.method === 'POST' && pathname === '/ask') {
    if (!isSameOrigin(req)) return sendJson(res, 403, { error: 'Cross-origin request blocked.' });

    try {
      const body = await readJson(req);
      const question = typeof body.question === 'string' ? body.question.trim() : '';
      if (!question) return sendJson(res, 400, { error: 'A question is required.' });
      if (!Object.prototype.hasOwnProperty.call(body, 'data')) {
        return sendJson(res, 400, { error: 'Report data is required.' });
      }

      const answer = await askChatterMate(question, body.data);
      return sendJson(res, 200, { answer });
    } catch (error) {
      console.error('Chat request error:', error.message);
      return sendJson(res, 502, { error: error.message || 'Chat request failed.' });
    }
  }

  if (req.method === 'POST' && pathname === '/api/settings/key') {
    if (!isSameOrigin(req)) return sendJson(res, 403, { error: 'Cross-origin request blocked.' });

    try {
      const body = await readJson(req);
      const apiKey = typeof body.apiKey === 'string' ? body.apiKey.trim() : '';
      if (!apiKey.startsWith('cm_live_')) {
        return sendJson(res, 400, { error: 'Enter a valid key beginning with cm_live_.' });
      }
      activeApiKey = apiKey;
      return sendJson(res, 200, { success: true });
    } catch (error) {
      return sendJson(res, 400, { error: error.message || 'Could not save the key.' });
    }
  }

  if (req.method === 'GET' && pathname === '/api/settings/test') {
    if (!activeApiKey) {
      return sendJson(res, 400, { success: false, error: 'No API key is configured.' });
    }
    try {
      await getDefaultModel(activeApiKey);
      return sendJson(res, 200, { success: true });
    } catch (error) {
      console.error('API key test error:', error.message);
      return sendJson(res, 502, { success: false, error: error.message });
    }
  }

  if (req.method !== 'GET' && req.method !== 'HEAD') {
    return sendJson(res, 405, { error: 'Method not allowed.' });
  }

  const requestedPath = pathname === '/' ? '/index.html' : pathname;
  const filePath = path.resolve(ROOT, `.${requestedPath}`);
  if (filePath !== ROOT && !filePath.startsWith(ROOT + path.sep)) {
    return sendJson(res, 403, { error: 'Forbidden.' });
  }

  fs.readFile(filePath, (error, content) => {
    if (error) {
      const status = error.code === 'ENOENT' ? 404 : 500;
      return sendJson(res, status, { error: status === 404 ? 'File not found.' : 'Could not read file.' });
    }

    res.writeHead(200, {
      'Content-Type': MIME_TYPES[path.extname(filePath).toLowerCase()] || 'application/octet-stream',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff'
    });
    if (req.method === 'HEAD') return res.end();
    res.end(content);
  });
}

const server = http.createServer((req, res) => {
  handleRequest(req, res).catch(error => {
    console.error('Server error:', error);
    if (!res.headersSent) sendJson(res, 500, { error: 'Internal server error.' });
    else res.end();
  });
});

server.listen(PORT, HOST, () => {
  console.log(`Hania's Health Hub is running at http://${HOST}:${PORT}`);
  console.log(activeApiKey ? 'ChatterMate API key is configured.' : 'No API key loaded yet; enter one in Supervisor Settings or add it to .env.');
});