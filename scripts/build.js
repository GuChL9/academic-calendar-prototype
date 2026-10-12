import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { bundle } from './bundle.js';
import { normalizeCatalog } from '../src/sources/catalog.js';

export const root = fileURLToPath(new URL('../', import.meta.url));
export function build(options = {}) {
  const directory = path.join(root, 'dist');
  fs.mkdirSync(path.join(directory, 'assets'), { recursive: true });
  const template = fs.readFileSync(path.join(root, 'web/calendar.html'), 'utf8');
  const styles = ['base', 'themes', 'motion', 'import'].map(name => '<style>\n' + fs.readFileSync(path.join(root, `web/styles/${name}.css`), 'utf8') + '\n</style>').join('\n');
  const script = bundle(path.join(root, 'src/adapters/web/main.js'), path.resolve(root));
  const catalog = normalizeCatalog(JSON.parse(fs.readFileSync(path.join(root, 'data/zju-calendars.json'), 'utf8')));
  const mode = options.sourceMode || process.env.CALENDAR_SOURCE_MODE || 'snapshot';
  if (!['snapshot', 'live'].includes(mode)) throw new Error('校历来源模式应为 snapshot 或 live');
  const settings = { mode, url: options.sourceUrl || process.env.CALENDAR_SOURCE_URL || (mode === 'live' ? './api/school-calendars' : './data/zju-calendars.json') };
  const embedded = (id, value) => `<script id="${id}" type="application/json">${JSON.stringify(value).replaceAll('<', '\\u003c')}</script>\n`;
  // 附带最近的有效目录，离线打开或联网失败仍可选择已收录的校历。
  const data = embedded('school-source-settings', settings) + embedded('school-source-catalog', catalog);
  for (const theme of ['paper', 'mist']) {
    const html = template.replace('{{theme}}', theme).replace('{{styles}}', () => styles)
      .replace('{{scripts}}', () => data + '<script>\n' + script.replace(/<\/script/gi, '<\\/script') + '\n</script>');
    fs.writeFileSync(path.join(directory, theme + '.html'), html);
  }
  fs.copyFileSync(path.join(root, 'web/index.html'), path.join(directory, 'index.html'));
  for (const file of fs.readdirSync(path.join(root, 'web/assets'))) fs.copyFileSync(path.join(root, 'web/assets', file), path.join(directory, 'assets', file));
  fs.writeFileSync(path.join(directory, '.nojekyll'), '');
  fs.mkdirSync(path.join(directory, 'data'), { recursive: true });
  fs.writeFileSync(path.join(directory, 'data/zju-calendars.json'), JSON.stringify(catalog) + '\n');
  return directory;
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) console.log('已生成：' + build());
