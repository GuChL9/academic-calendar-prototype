/** 所有业务日期都是自然日，使用 UTC 整日序号保证跨时区、跨闰日计算一致。 */
const DAY_MS = 86400000;
export const WEEKDAYS = ['星期一', '星期二', '星期三', '星期四', '星期五', '星期六', '星期日'];
export const TERMS = { autumn: ['秋', '冬'], spring: ['春', '夏'] };
export const NUMERALS = ['一', '二', '三', '四', '五', '六', '七', '八'];

export function serial(date) {
  if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error('日期格式应为 YYYY-MM-DD');
  const milliseconds = Date.parse(date + 'T00:00:00Z');
  if (!Number.isFinite(milliseconds) || new Date(milliseconds).toISOString().slice(0, 10) !== date) {
    throw new Error('日期不存在：' + date);
  }
  return milliseconds / DAY_MS;
}
export function iso(day) { return new Date(day * DAY_MS).toISOString().slice(0, 10); }
export function addDays(date, count) { return iso(serial(date) + count); }
export function weekday(date) { return (new Date(serial(date) * DAY_MS).getUTCDay() + 6) % 7; }
export function mondayOf(date) { return addDays(date, -weekday(date)); }
export function orderedRange(a, b) { return a <= b ? { start: a, end: b } : { start: b, end: a }; }
export function datesBetween(start, end) {
  const first = serial(start), last = serial(end);
  if (last < first) throw new Error('结束日期不能早于开始日期');
  if (last - first > 366) throw new Error('日期范围不能超过 367 天');
  return Array.from({ length: last - first + 1 }, (_, index) => iso(first + index));
}
export function checkDate(value, label = '日期') {
  serial(value);
  if (value < '1900-01-01' || value > '2199-12-31') throw new Error(`${label}应在 1900—2199 年之间`);
  return value;
}
export function baseRange(year, half) {
  if (!Number.isInteger(year) || year < 1900 || year > 2198) throw new Error('学年起始年应为 1900—2198');
  if (!Object.hasOwn(TERMS, half)) throw new Error('学期应为秋冬或春夏');
  return half === 'autumn'
    ? { start: `${year}-07-01`, end: iso(Date.UTC(year + 1, 2, 0) / DAY_MS) }
    : { start: `${year + 1}-01-01`, end: `${year + 1}-08-31` };
}
