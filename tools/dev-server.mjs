// Serves the app at http://localhost:8765. /stub.html runs it against the fake login in tests/ for local testing.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml' };

createServer(async (req, res) => {
  const path = new URL(req.url, 'http://x').pathname;
  try {
    if (path === '/stub.html') {
      const html = (await readFile(join(root, 'public/index.html'), 'utf8'))
        .replace('<script src="/vendor/supabase.js"></script>', '<script src="/tests/supabase-stub.js"></script>')
        .replace('<script src="/config.js"></script>', `<script>window.SYSTEM_CONFIG={supabaseUrl:'http://stub',supabaseAnonKey:'stub',vapidPublicKey:'',googleEnabled:true,aiEnabled:false};</script>`);
      res.writeHead(200, { 'content-type': 'text/html' }); res.end(html); return;
    }
    const file = path.startsWith('/tests/') ? join(root, normalize(path)) : join(root, 'public', normalize(path === '/' ? '/index.html' : path));
    const body = await readFile(file);
    res.writeHead(200, { 'content-type': TYPES[extname(file)] || 'application/octet-stream', 'cache-control': 'no-store' });
    res.end(body);
  } catch { res.writeHead(404); res.end('Not found'); }
}).listen(8765, () => console.log('The System: http://localhost:8765'));
