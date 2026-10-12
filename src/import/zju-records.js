import { addDays, blankConfig, checkDate, datesBetween, normalizeConfig, TERMS } from '../core/index.js';

const clean = text => text.normalize('NFKC').replace(/\s/g, '').replace(/[—–－~～至]/g, '-');

export function schoolDate(year, month, day) {
  return checkDate(`${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`);
}
export function schoolYearFor(month, academicYear, half) { return academicYear + (half === 'spring' || month < 7 ? 1 : 0); }
export function parseSchoolDates(text, academicYear, half) {
  const dates = [];
  const pattern = /(?:(\d{4})年)?(\d{1,2})月(\d{1,2})日?(?:-(?:(\d{1,2})月)?(\d{1,2})日?)?/g;
  for (const m of clean(text).matchAll(pattern)) {
    const month = Number(m[2]), year = Number(m[1] || schoolYearFor(month, academicYear, half));
    const start = schoolDate(year, month, Number(m[3]));
    const endMonth = Number(m[4] || month);
    const end = m[5] ? schoolDate(year + (endMonth < month ? 1 : 0), endMonth, Number(m[5])) : start;
    dates.push(...datesBetween(start, end));
  }
  return [...new Set(dates)].sort();
}

const parseDates = parseSchoolDates;

function arrangements(records, academicYear, half, warnings) {
  const holidays = [], adjustments = [];
  const points = text => {
    // 保留文字中的列举顺序，以便“分别与”逐一配对。
    return [...text.matchAll(/(?:(\d{4})年)?\d{1,2}月\d{1,2}日/g)].map(match => parseDates(match[0], academicYear, half)[0]);
  };
  for (const record of records) {
    const text = record.text;
    const holiday = text.match(/^([^()，。]{1,30}?)放假/);
    if (holiday) holidays.push({ name: holiday[1], dates: record.dates });
    let residue = text;
    // 含拟定或待定的说明只展示原文，不将其中的课程映射直接生效。
    if (/暂定|待定|拟定|拟于/.test(text)) { warnings.push(`${record.dateText} ${text}`); continue; }
    const addSwap = (left, right) => {
      const a = points(left), b = points(right);
      if (!a.length || a.length !== b.length) return false;
      a.forEach((value, i) => adjustments.push({ kind: 'swap', date: value, targetDate: b[i] }));
      return true;
    };
    residue = residue.replace(/([^(),，。]*?)分别与([^(),，。]*?)的?课(?:程)?对调/g, (all, a, b) => addSwap(a, b) ? '' : all);
    residue = residue.replace(/([^(),，。]*?)与([^(),，。]*?)的?课(?:程)?对调/g, (all, a, b) => addSwap(a, b) ? '' : all);
    residue = residue.replace(/((?:\d{4}年)?\d{1,2}月\d{1,2}日)补((?:\d{4}年)?\d{1,2}月\d{1,2}日)的?课/g, (all, a, b) => {
      adjustments.push({ kind: 'makeup', date: points(a)[0], targetDate: points(b)[0] }); return '';
    });
    if (/另行通知|待定|以.*为准/.test(text)) warnings.push(`${record.dateText} ${text}`);
    else if (/对调|补.*课|调课/.test(residue)) warnings.push(`调课文字需要手动核对：${record.dateText} ${text}`);
  }
  return { holidays, adjustments };
}


/** 根据明确的日期与安排说明建立配置，并与教学周互相校验。 */
export function candidateFromRecords({ title, academicYear, half, grid, records, warnings = [] }) {
  const [first, second] = TERMS[half];
  const firstCourse = records.filter(record => record.text.startsWith(first + '学期开始上课'));
  const secondCourse = records.filter(record => record.text.startsWith(second + '学期开始上课'));
  if (firstCourse.length !== 1 || firstCourse[0].dates[0] !== grid.firstMonday || firstCourse[0].dates.length !== 1) {
    throw new Error('第一教学周与开课说明不一致');
  }
  if (secondCourse.length !== 1 || secondCourse[0].dates[0] !== addDays(grid.firstMonday, 56)) {
    throw new Error('第二学期开课日不符合连续的 8 + 8 周');
  }
  const config = { ...blankConfig(academicYear, half), range: grid.range, canvasRange: grid.range, firstMonday: grid.firstMonday };
  config.firstExams = [...new Set(records.filter(record => record.text.startsWith(first + '学期考试')).flatMap(record => record.dates))].sort();
  if (!config.firstExams.length) warnings.push(`未识别到${first}学期考试日期，导入后请逐日补选`);
  const finalExam = records.filter(record => /^(全校停课考试|[冬夏]学期考试)/.test(record.text));
  const vacation = records.filter(record => new RegExp('^学生' + (half === 'autumn' ? '寒' : '暑') + '假').test(record.text));
  if (finalExam.length === 1 && vacation.length === 1) {
    const start = finalExam[0].dates[0], end = addDays(vacation[0].dates[0], -1);
    if (start > end || start < addDays(grid.firstMonday, 112)) throw new Error('末学期考试与教学周或假期起点冲突');
    config.secondExams = { start, end };
  } else warnings.push(`未完整识别${second}学期考试与假期起点，导入后请补选考试区间`);
  Object.assign(config, arrangements(records, academicYear, half, warnings));
  for (const value of [...config.firstExams, ...(config.secondExams ? [config.secondExams.start, config.secondExams.end] : [])]) {
    if (value < config.range.start || value > config.range.end) throw new Error('考试日期超出了识别到的日期表');
  }
  const notes = records.map(record => `${record.dateText} ${record.text}`);
  return { title, config: normalizeConfig(config), warnings: [...new Set(warnings)], notes,
    evidence: { range: '日期表的全部日期，已逐格校验', firstMonday: firstCourse[0].dateText + ' ' + firstCourse[0].text,
      secondExams: config.secondExams ? `${finalExam[0].dateText} ${finalExam[0].text}；${vacation[0].dateText} ${vacation[0].text}` : '' } };
}
