import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.dirname(fileURLToPath(import.meta.url));
const mime = {'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml','.json':'application/json','.md':'text/plain; charset=utf-8'};
const server = http.createServer(async (req,res) => {
  try {
    const relative = decodeURIComponent(new URL(req.url,'http://localhost').pathname).replace(/^\/HiMCM(?=\/|$)/,'').replace(/^\/+/, '');
    let file = path.resolve(root, relative || 'index.html');
    if (!file.startsWith(root + path.sep) && file !== root) { res.writeHead(403); res.end(); return; }
    if ((await stat(file)).isDirectory()) file = path.join(file,'index.html');
    res.writeHead(200, {'Content-Type':mime[path.extname(file)] || 'application/octet-stream','Cache-Control':'no-store'});
    res.end(await readFile(file));
  } catch { res.writeHead(404,{'Content-Type':'text/plain'}); res.end('Not found'); }
});
server.listen(Number(process.env.PORT || 4173), '127.0.0.1', () => console.log('BeeLab preview: http://127.0.0.1:4173/HiMCM/'));
