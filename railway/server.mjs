import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { timingSafeEqual } from 'node:crypto';

const root = resolve('dist-railway');
const user = process.env.APP_USER;
const password = process.env.APP_PASSWORD;
if (!user || !password) throw new Error('Configure APP_USER e APP_PASSWORD antes de iniciar.');
const expected = Buffer.from('Basic ' + Buffer.from(`${user}:${password}`).toString('base64'));
const types = { '.html':'text/html; charset=utf-8', '.js':'text/javascript; charset=utf-8', '.css':'text/css; charset=utf-8', '.png':'image/png', '.jpg':'image/jpeg', '.jpeg':'image/jpeg', '.svg':'image/svg+xml', '.woff2':'font/woff2', '.ico':'image/x-icon' };
http.createServer(async (req, res) => {
  if (req.url === '/health') { res.writeHead(200, {'Content-Type':'application/json'}); res.end('{"status":"ok","mode":"demo"}'); return; }
  const given = Buffer.from(req.headers.authorization || '');
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) {
    res.writeHead(401, {'WWW-Authenticate':'Basic realm="CREDITO C149", charset="UTF-8"','Cache-Control':'no-store'}); res.end('Autenticacao necessaria'); return;
  }
  if (!['GET','HEAD'].includes(req.method)) { res.writeHead(405); res.end(); return; }
  try {
    const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    const path = resolve(root, '.' + (pathname === '/' ? '/index.html' : pathname));
    if (!path.startsWith(root + sep)) { res.writeHead(403); res.end(); return; }
    const body = await readFile(path);
    res.writeHead(200, {'Content-Type':types[extname(path)] || 'application/octet-stream', 'X-Content-Type-Options':'nosniff', 'Cache-Control':'no-store'});
    res.end(req.method === 'HEAD' ? undefined : body);
  } catch { res.writeHead(404); res.end('Nao encontrado'); }
}).listen(Number(process.env.PORT || 3000), '0.0.0.0');
