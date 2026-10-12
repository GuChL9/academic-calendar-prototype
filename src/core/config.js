import { TERMS, baseRange, checkDate, weekday, addDays, datesBetween } from './dates.js';

export function blankConfig(year = 2026, half = 'autumn') {
  return { schemaVersion: 1, academicYear: year, half, range: baseRange(year, half),
    canvasRange: baseRange(year, half), firstMonday: null, firstExams: [], secondExams: null,
    holidays: [], adjustments: [] };
}
function array(value, label, optional = false) {
  if (value === undefined && optional) return [];
  if (!Array.isArray(value) || value.length > 367) throw new Error(`${label}应为数组，最多 367 项`);
  return value;
}
function range(value, label) {
  const start = checkDate(value?.start, label + '开始日期');
  const end = checkDate(value?.end, label + '结束日期');
  if (start > end) throw new Error(label + '结束日期不能早于开始日期');
  return { start, end };
}
function holiday(item) {
  if (!item || typeof item.name !== 'string' || !item.name.trim() || item.name.trim().length > 80) {
    throw new Error('放假名称应为 1—80 个字符');
  }
  // 区间形式的输入逐日展开，每个日期都作为明确的放假选择保留。
  const input = item.dates === undefined
    ? datesBetween(checkDate(item.start, '放假开始日期'), checkDate(item.end, '放假结束日期')) : item.dates;
  const dates = array(input, '放假日期');
  if (!dates.length) throw new Error('每项放假安排应包含 1—367 个日期');
  return { name: item.name.trim(), dates: [...new Set(dates.map(date => checkDate(date, '放假日期')))].sort() };
}
function adjustments(input) {
  const assigned = new Set();
  return array(input, '调课安排', true).map(item => {
    if (!item || !['swap', 'makeup'].includes(item.kind)) throw new Error('调课类型应为课程对调或补课');
    const date = checkDate(item.date, '执行日期');
    const targetDate = checkDate(item.targetDate, '原课程日期');
    if (date === targetDate) throw new Error('调课的两个日期不能相同');
    // 对调占用两个执行日期；补课只占用实际补课日，引用目标可以共享。
    for (const affected of item.kind === 'swap' ? [date, targetDate] : [date]) {
      if (assigned.has(affected)) throw new Error(`${affected} 已有调课安排，请先修改或删除原安排`);
      assigned.add(affected);
    }
    return { kind: item.kind, date, targetDate };
  });
}

/** 返回独立、规范化的配置；验证失败时不修改传入对象。 */
export function normalizeConfig(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('配置应为 JSON 对象');
  if (input.schemaVersion !== 1) throw new Error('不支持的配置版本，请使用 schemaVersion: 1');
  const base = baseRange(input.academicYear, input.half);
  const outputRange = range(input.range, '制表');
  datesBetween(outputRange.start, outputRange.end);
  const blank = range(input.canvasRange || base, '空白日历');
  const canvasRange = {
    start: [blank.start, outputRange.start].sort()[0],
    end: [blank.end, outputRange.end].sort().at(-1)
  };
  datesBetween(canvasRange.start, canvasRange.end);
  const firstMonday = input.firstMonday == null ? null : checkDate(input.firstMonday, '第一教学周周一');
  if (firstMonday && weekday(firstMonday) !== 0) throw new Error('第一教学周的首日必须是周一');
  const firstExams = [...new Set(array(input.firstExams, '第一学期考试日期').map(date => checkDate(date, '考试日期')))].sort();
  const secondExams = input.secondExams == null ? null : range(input.secondExams, '考试');
  if (!firstMonday && (firstExams.length || secondExams)) throw new Error('请先设置第一教学周的周一');
  if (firstMonday && firstExams.some(date => date < firstMonday)) throw new Error('考试日期不能早于第一教学周周一');
  if (firstMonday && secondExams && secondExams.start < addDays(firstMonday, 112)) {
    throw new Error('末学期考试应在两学期共 16 个教学周结束后开始');
  }
  if (secondExams && firstExams.some(date => date >= secondExams.start)) {
    throw new Error('第一学期考试日期应早于末学期考试开始日期');
  }
  return { schemaVersion: 1, academicYear: input.academicYear, half: input.half,
    range: outputRange, canvasRange, firstMonday, firstExams, secondExams,
    holidays: array(input.holidays, '放假安排', true).map(holiday), adjustments: adjustments(input.adjustments) };
}
export function parseConfig(text) {
  let input;
  try { input = JSON.parse(text); } catch { throw new Error('文件不是有效的 JSON'); }
  return normalizeConfig(input?.kind === 'academic-calendar-data' ? input.config : input);
}
export function status(input) {
  const config = normalizeConfig(input), missing = [], terms = TERMS[config.half];
  if (!config.firstMonday) missing.push('设置第一教学周周一');
  if (!config.firstExams.length) missing.push(`选择${terms[0]}学期考试日期`);
  if (!config.secondExams) missing.push(`设置${terms[1]}学期考试区间`);
  return { complete: missing.length === 0, missing };
}
