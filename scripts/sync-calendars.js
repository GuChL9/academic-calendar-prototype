import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { syncSchoolCalendars } from '../src/adapters/node/school-sync.js';

const root = fileURLToPath(new URL('../', import.meta.url));
const target = path.join(root, 'data/zju-calendars.json');
const previous = fs.existsSync(target) ? JSON.parse(fs.readFileSync(target, 'utf8')) : null;
const catalog = await syncSchoolCalendars({ previous });
// 同步时间随部署产物更新；只有校历内容或来源发生变化时才需要提交数据文件。
const content = value => value && JSON.stringify(value.calendars);
const changed = catalog.status === 'ok' && content(previous) !== content(catalog);
fs.mkdirSync(path.dirname(target), { recursive: true });
fs.writeFileSync(target + '.tmp', JSON.stringify(catalog, null, 2) + '\n');
fs.renameSync(target + '.tmp', target);
if (process.env.GITHUB_OUTPUT) fs.appendFileSync(process.env.GITHUB_OUTPUT, `changed=${changed}\n`);
console.log(`已同步 ${catalog.calendars.length} 个学年，${catalog.calendars.reduce((sum, item) => sum + item.candidates.length, 0)} 个学期`);
for (const issue of catalog.issues) console.warn(issue);
