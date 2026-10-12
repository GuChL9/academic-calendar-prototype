import { addDays, NUMERALS, TERMS, WEEKDAYS, weekday } from '../core/index.js';
import { candidateFromRecords, parseSchoolDates, schoolDate, schoolYearFor } from './zju-records.js';

const clean = value => String(value).normalize('NFKC').replace(/\s/g, '').replace(/[—–－~～至]/g, '-');
const MONTHS = ['一', '二', '三', '四', '五', '六', '七', '八', '九', '十', '十一', '十二'];

function noteDate(cell, sheet, year, half) {
  if (typeof cell.value === 'number') {
    if (!Number.isInteger(cell.value) || cell.value < 60 || cell.value > 120000) throw new Error(`${cell.reference} 的日期数值无效`);
    const iso = addDays(sheet.date1904 ? '1904-01-01' : '1899-12-30', cell.value);
    const month = Number(iso.slice(5, 7)), day = Number(iso.slice(8));
    // 学校日期列使用“月日”格式，内部序列可能保留模板旧年份；年份来自标题与学期。
    const explicitYear = /y/i.test(cell.format.replace(/"[^"]*"/g, '')) || [14, 15, 17, 22].includes(cell.formatId);
    return explicitYear ? `${iso.slice(0, 4)}年${month}月${day}日` : `${month}月${day}日`;
  }
  return clean(cell.value);
}

/** 输入工作表值、坐标和合并范围，所有制表规则不依赖 Excel 读取库或部署平台。 */
export function recognizeZjuWorkbook(sheets) {
  const candidates = [], errors = [];
  for (const sheet of sheets) {
    const titles = sheet.cells.flatMap(cell => {
      const match = clean(cell.value).match(/^浙江大学(\d{4})-(\d{4})学年(秋冬|春夏)学期校历$/);
      return match ? [{ ...cell, academicYear: Number(match[1]), nextYear: Number(match[2]), half: match[3] === '秋冬' ? 'autumn' : 'spring' }] : [];
    });
    for (const title of titles) {
      try {
        const { academicYear: year, half } = title;
        if (title.nextYear !== year + 1) throw new Error('学年年份不连续');
        const nextColumn = Math.min(...titles.filter(item => item.row === title.row && item.column > title.column).map(item => item.column), Infinity);
        const nextRow = Math.min(...titles.filter(item => item.column === title.column && item.row > title.row).map(item => item.row), Infinity);
        const cells = sheet.cells.filter(cell => cell.column >= title.column && cell.column < nextColumn && cell.row > title.row && cell.row < nextRow);
        const at = (row, column) => cells.find(cell => cell.row === row && cell.column === column);
        const monday = cells.find(cell => clean(cell.value) === WEEKDAYS[0]);
        if (!monday || WEEKDAYS.some((label, i) => clean(at(monday.row + i, monday.column)?.value) !== label)) throw new Error('日期表的七个星期行不完整');
        const firstRow = cells.filter(cell => cell.row === monday.row && cell.column > monday.column).sort((a, b) => a.column - b.column);
        const count = firstRow.length;
        if (count < 16 || count > 52 || firstRow.some((cell, i) => cell.column !== monday.column + i + 1)) throw new Error('日期表的周列不完整');
        const months = cells.filter(cell => cell.row < monday.row && cell.column > monday.column && /^(十一|十二|[一二三四五六七八九十])月$/.test(clean(cell.value))).sort((a, b) => a.column - b.column);
        const month = MONTHS.indexOf(clean(months[0]?.value).replace('月', '')) + 1;
        if (!month) throw new Error('日期表缺少起始月份');
        const start = schoolDate(schoolYearFor(month, year, half), month, Number(firstRow[0].value));
        if (weekday(start) !== 0) throw new Error('日期表起点与周一不一致');
        for (let column = 0; column < count; column++) for (let row = 0; row < 7; row++) {
          const cell = at(monday.row + row, monday.column + 1 + column);
          if (!cell || Number(cell.value) !== Number(addDays(start, column * 7 + row).slice(8))) throw new Error('日期网格不连续或存在缺格');
        }
        const weeks = cells.filter(cell => cell.row === monday.row - 1 && /^[一二三四五六七八九十]+$/.test(clean(cell.value))).sort((a, b) => a.column - b.column);
        if (weeks.map(cell => clean(cell.value)).join('') !== [...NUMERALS, ...NUMERALS].join('') || weeks.some((cell, i) => cell.column !== weeks[0].column + i)) throw new Error('教学周须为连续的 8 + 8 周');
        const firstMonday = addDays(start, (weeks[0].column - monday.column - 1) * 7);
        const course = cells.find(cell => cell.row > monday.row + 6 && clean(cell.value).startsWith(TERMS[half][0] + '学期开始上课'));
        if (!course) throw new Error('缺少学期开课说明');
        const records = [];
        for (const cell of cells.filter(item => item.column === course.column && item.row > monday.row + 6)) {
          const merge = sheet.merges.find(item => item.start.row === cell.row && item.start.column === cell.column);
          const dates = cells.filter(item => item.column === monday.column && item.row >= cell.row && item.row <= (merge?.end.row || cell.row));
          if (!dates.length) continue;
          const dateText = dates.map(item => noteDate(item, sheet, year, half)).join('、');
          const parsed = parseSchoolDates(dateText, year, half);
          if (!parsed.length) throw new Error(`${dates[0].reference} 的安排日期无法读取`);
          records.push({ dateText, text: clean(cell.value), dates: parsed });
        }
        const warnings = cells.filter(cell => cell.row > monday.row + 6 && /以.*为准|院历另行制定/.test(clean(cell.value))).map(cell => clean(cell.value));
        if (cells.some(cell => /小学期/.test(clean(cell.value)))) warnings.push('原表包含小学期，当前校历按寒暑假规则显示这些日期；小学期说明保留在原文中。');
        const candidate = candidateFromRecords({ title: clean(title.value), academicYear: year, half,
          grid: { range: { start, end: addDays(start, count * 7 - 1) }, firstMonday }, records, warnings });
        candidate.sheet = sheet.name;
        candidates.push(candidate);
      } catch (error) { errors.push(`${clean(title.value)}：${error.message}`); }
    }
  }
  if (!candidates.length) throw new Error(errors.join('；') || '附件未包含可识别的浙大校历');
  const keys = candidates.map(item => `${item.config.academicYear}/${item.config.half}`);
  if (new Set(keys).size !== keys.length) throw new Error('附件包含同一学期的多份校历');
  return { candidates, errors };
}
