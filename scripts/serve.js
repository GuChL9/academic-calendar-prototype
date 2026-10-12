import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { build, root } from './build.js';
import { createSchoolCalendarService } from '../src/adapters/node/school-sync.js';

const mode = process.env.CALENDAR_SOURCE_MODE || 'live';
const directory = build({ sourceMode: mode });
const cachePath = path.join(root, 'work/school-calendar-cache.json');
const initialPath = fs.existsSync(cachePath) ? cachePath : path.join(root, 'data/zju-calendars.json');
const service = createSchoolCalendarService({ initial: JSON.parse(fs.readFileSync(initialPath, 'utf8')), save: async catalog => {
  fs.mkdirSync(path.dirname(cachePath), { recursive: true });
  fs.writeFileSync(cachePath + '.tmp', JSON.stringify(catalog)); fs.renameSync(cachePath + '.tmp', cachePath);
} });
const port = Number(process.env.PORT || 4175);
const types = { '.html': 'text/html; charset=utf-8', '.jpg': 'image/jpeg', '.png': 'image/png', '.json': 'application/json', '.css': 'text/css', '.js': 'text/javascript' };
http.createServer(async (request, response) => {
  let file;
  try {
    const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
    if (pathname === '/api/school-calendars') {
      if (request.method !== 'GET') { response.writeHead(405, { Allow: 'GET' }).end(); return; }
      try {
        const catalog = await service.refresh();
        response.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }).end(JSON.stringify(catalog));
      } catch { response.writeHead(503, { 'Content-Type': 'application/json' }).end(JSON.stringify({ error: '学校校历同步暂不可用' })); }
      return;
    }
    file = path.resolve(directory, '.' + (pathname === '/' ? '/index.html' : pathname));
    if (!file.startsWith(directory + path.sep)) { response.writeHead(403).end(); return; }
  } catch { response.writeHead(400).end(); return; }
  fs.readFile(file, (error, content) => {
    if (error) { response.writeHead(404).end('Not found'); return; }
    response.setHeader('Content-Type', types[path.extname(file)] || 'application/octet-stream');
    response.setHeader('Cache-Control', 'no-store');
    response.end(content);
  });
}).listen(port, '127.0.0.1', () => console.log(`Local: http://127.0.0.1:${port}`));
