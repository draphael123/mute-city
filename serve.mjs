import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';

const PORT = process.env.PORT || 5875;
const ROOT = import.meta.dirname;
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.webmanifest': 'application/manifest+json',
};

import { writeFileSync, mkdirSync } from 'node:fs';
http.createServer(async (req, res) => {
  if (req.method === 'POST' && req.url.startsWith('/shot')) { // dev only: save a canvas frame as tools/shots/<name>.jpg
    const name = (new URL(req.url, 'http://x').searchParams.get('name') || 'shot').replace(/[^a-z0-9_-]/gi, '');
    let b = ''; req.on('data', c => b += c); req.on('end', () => { const m = /^data:image\/\w+;base64,(.*)$/s.exec(b); if (!m) { res.writeHead(400).end('bad'); return; } mkdirSync(join(ROOT, 'tools', 'shots'), { recursive: true }); writeFileSync(join(ROOT, 'tools', 'shots', name + '.jpg'), Buffer.from(m[1], 'base64')); res.writeHead(200).end('saved ' + name); }); return;
  }
  try {
    const url = decodeURIComponent(req.url.split('?')[0]);
    let p = normalize(join(ROOT, url === '/' ? 'index.html' : url));
    if (!p.startsWith(ROOT)) { res.writeHead(403).end('forbidden'); return; }
    const s = await stat(p);
    if (s.isDirectory()) p = join(p, 'index.html');
    const body = await readFile(p);
    res.writeHead(200, {
      'Content-Type': TYPES[extname(p).toLowerCase()] || 'application/octet-stream',
      // No caching, ever. A stale cached module is indistinguishable from a
      // logic bug and costs an hour every time.
      'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
      'Pragma': 'no-cache',
    });
    res.end(body);
  } catch {
    res.writeHead(404, { 'Cache-Control': 'no-store' }).end('not found');
  }
}).listen(PORT, () => console.log(`destrier → http://localhost:${PORT}`));
