import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { readSchoolWorkbook } from '../src/adapters/node/xlsx.js';
import { recognizeZjuWorkbook } from '../src/import/zju-workbook.js';
import { syncSchoolCalendars, createSchoolCalendarService, createSchoolFetcher } from '../src/adapters/node/school-sync.js';
import { readSchoolListing, schoolUrl, SCHOOL_LIST } from '../src/sources/zju.js';
import { normalizeCatalog } from '../src/sources/catalog.js';
import { blankConfig, exportData, generateCalendar } from '../src/core/index.js';
import { createSession } from '../src/application/session.js';
import { createXlsx } from '../src/export/xlsx.js';

const file = year => fs.readFileSync(new URL(`./fixtures/zju-${year}.xlsx`, import.meta.url));
const sheets = year => readSchoolWorkbook(file(year));
const parsed = year => recognizeZjuWorkbook(sheets(year));
const seed = normalizeCatalog(JSON.parse(fs.readFileSync(new URL('../data/zju-calendars.json', import.meta.url))));
const sources = seed.calendars.filter(item => item.academicYear >= 2023 && item.academicYear <= 2026);

for (const year of [2023, 2024, 2025, 2026]) test(`官网 ${year} Excel 完整识别两个学期并可制表与导出`, () => {
  const { candidates, errors } = parsed(year);
  assert.deepEqual(errors, []); assert.equal(candidates.length, 2);
  for (const candidate of candidates) {
    assert.equal(candidate.config.academicYear, year);
    assert.equal(exportData(candidate.config).days.length, 182);
    assert.equal(exportData(candidate.config).status.complete, true);
    assert.ok(createXlsx(candidate.config).length > 10000);
  }
});

test('准确保留日期表全范围、8+8 开课日和两段考试说明', () => {
  const [a, s] = parsed(2026).candidates.map(item => item.config);
  assert.deepEqual(a.range, { start: '2026-07-27', end: '2027-01-24' });
  assert.deepEqual(s.range, { start: '2027-01-25', end: '2027-07-25' });
  assert.equal(a.firstMonday, '2026-09-14'); assert.equal(s.firstMonday, '2027-02-22');
  assert.deepEqual(a.firstExams, ['2026-11-07', '2026-11-08', '2026-11-14', '2026-11-15']);
  assert.deepEqual(s.secondExams, { start: '2027-06-15', end: '2027-06-26' });
  const days = generateCalendar(a).days;
  assert.equal(days.find(item => item.date === '2026-11-07').teachingLabel, '秋八周');
  assert.equal(days.find(item => item.date === '2026-11-14').teachingLabel, '冬一周');
  assert.deepEqual(parsed(2025).candidates[1].config.firstExams, ['2026-04-25', '2026-04-26', '2026-05-09', '2026-05-10']);
});

test('月日格式的旧序列年份由学年确定，跨年补课和合并假期保留原意', () => {
  const [a, s] = parsed(2023).candidates;
  assert.equal(a.config.holidays.find(item => item.name === '元旦').dates[0], '2024-01-01');
  assert.equal(s.config.holidays.find(item => item.name === '国际劳动节').dates[0], '2024-05-01');
  assert.equal(a.config.holidays[0].dates.length, 8);
  assert.ok(s.warnings.some(item => item.includes('小学期')));
  assert.deepEqual(parsed(2026).candidates[0].config.adjustments.at(-1), { kind: 'makeup', date: '2027-01-04', targetDate: '2026-12-31' });
  assert.equal(parsed(2024).candidates[0].config.adjustments.length, 5);
});

test('破损日期、非 8+8 周、重复版本都不会静默导入', () => {
  const workbook = sheets(2026);
  workbook[0].cells.find(cell => cell.reference === 'B6').value = 28;
  const r = recognizeZjuWorkbook(workbook);
  assert.equal(r.candidates.length, 1); assert.equal(r.candidates[0].config.half, 'spring');
  assert.match(r.errors[0], /周一|日期/);
  const weeks = sheets(2026); weeks[0].cells.find(cell => cell.reference === 'P5').value = '九';
  assert.match(recognizeZjuWorkbook(weeks).errors[0], /8 \+ 8/);
  assert.throws(() => recognizeZjuWorkbook([...sheets(2026), ...sheets(2026)]), /多份/);
  assert.throws(() => readSchoolWorkbook(Buffer.from('not an excel file')), /大小|XLSX/);
  const broken = Buffer.from(file(2026));
  const payload = 30 + broken.readUInt16LE(26) + broken.readUInt16LE(28); broken[payload + 8] ^= 255;
  assert.throws(() => readSchoolWorkbook(broken));
});

test('导入是一次可撤销操作，失败保持原配置', () => {
  const old = blankConfig(2023), session = createSession(old), config = parsed(2026).candidates[0].config;
  const state = session.dispatch({ type: 'school-import', config });
  assert.equal(state.step, 6); assert.equal(state.finished, true); assert.deepEqual(state.config, config);
  const before = session.getState();
  assert.throws(() => session.dispatch({ type: 'school-import', config: { ...config, firstMonday: '2026-09-15' } }));
  assert.deepEqual(session.getState(), before);
  assert.deepEqual(session.dispatch({ type: 'undo' }).config, old);
});

const listing = items => items.map(item => `<li><a href="${item.noticeUrl}">${item.title}</a> ${item.publishedAt}</li>`).join('');
function fakeSource({ broken = false, calls = [] } = {}) {
  return async url => {
    calls.push(url);
    if (url.includes('/zhfw_xzwj/')) return Buffer.from(listing(sources));
    const notice = sources.find(item => item.noticeUrl === url);
    if (notice) return Buffer.from(`<a href="${notice.attachmentUrl}">校历</a>`);
    const attachment = sources.find(item => item.attachmentUrl === url);
    if (!attachment) throw new Error('unexpected source');
    return broken && attachment.academicYear === 2026 ? Buffer.from('broken') : file(attachment.academicYear);
  };
}

test('同步发现新校历并逐份验证，保留官方来源与文件校验码', async () => {
  const previous = { ...seed, calendars: sources.filter(item => item.academicYear === 2023) };
  const actual = await syncSchoolCalendars({ previous, fetchBytes: fakeSource(), now: new Date('2026-10-13T00:00:00Z') });
  assert.equal(actual.calendars.length, 4); assert.equal(actual.status, 'ok');
  assert.equal(actual.checkedAt, '2026-10-13T00:00:00.000Z');
  assert.ok(actual.calendars.every(item => /^[0-9a-f]{64}$/.test(item.sha256)));
});

test('来源暂时失败或新附件损坏时保留已验证版本并说明失败', async () => {
  const previous = { ...seed, calendars: sources };
  const actual = await syncSchoolCalendars({ previous, fetchBytes: fakeSource({ broken: true }) });
  assert.equal(actual.status, 'partial'); assert.ok(actual.issues[0].includes('2026—2027'));
  assert.deepEqual(actual.calendars[0], previous.calendars[0]);
  const offline = await syncSchoolCalendars({ previous, fetchBytes: async () => { throw new Error('offline'); } });
  assert.equal(offline.calendars.length, 4); assert.equal(offline.status, 'partial');
  await assert.rejects(syncSchoolCalendars({ fetchBytes: async () => { throw new Error('offline'); } }), /同步失败/);
});

test('实时服务合并并发同步，短时间重复请求复用结果', async () => {
  const calls = [], service = createSchoolCalendarService({ initial: { ...seed, calendars: sources }, fetchBytes: fakeSource({ calls }) });
  const [a, b] = await Promise.all([service.refresh(), service.refresh()]);
  assert.deepEqual(a, b); const count = calls.length;
  await service.refresh(); assert.equal(calls.length, count);
  assert.equal(calls.filter(url => url.includes('/zhfw_xzwj/')).length, 1);
});

test('来源只允许学校域名，外站普通通知不会触发抓取', async () => {
  const records = readSchoolListing(`<li><a href="http://10.0.0.1/private">其他通知</a> 2026-10-01</li>${listing(sources)}`);
  assert.equal(records[0].noticeUrl, null);
  assert.throws(() => schoolUrl('https://evil.test/x.xlsx'), /不属于/);
  assert.equal(schoolUrl('http://zhfw.zju.edu.cn/a.psp'), 'https://zhfw.zju.edu.cn/a.psp');
  let calls = 0;
  await assert.rejects(createSchoolFetcher(async () => { calls++; return new Response('', { status: 302, headers: { location: 'https://evil.test/x' } }); })(SCHOOL_LIST), /不属于/);
  assert.equal(calls, 1);
  const malformed = structuredClone(seed); malformed.calendars[0].noticeUrl = 'javascript:alert(1)';
  assert.throws(() => normalizeCatalog(malformed));
});
