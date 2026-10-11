// Server preview lokal: membangun ulang preview dari src/ pada setiap muat ulang halaman.
import http from 'node:http';
import { buildPreview } from './scripts/build-standalone.mjs';

const PORT = Number(process.env.PORT) || 5173;
http
  .createServer(async (req, res) => {
    if (req.url !== '/' && req.url !== '/index.html') {
      res.writeHead(404).end('Not found');
      return;
    }
    try {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
      res.end(buildPreview());
    } catch (e) {
      res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' }).end(String(e.stack || e));
    }
  })
  .listen(PORT, () => console.log(`Preview: http://localhost:${PORT}`));
