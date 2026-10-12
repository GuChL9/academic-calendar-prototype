import { TERMS, WEEKDAYS, NUMERALS, serial, weekday, mondayOf, addDays, datesBetween } from './dates.js';
import { normalizeConfig, status } from './config.js';

export function generateCalendar(input) {
  const config = normalizeConfig(input), terms = TERMS[config.half], firstExams = new Set(config.firstExams);
  const days = datesBetween(config.range.start, config.range.end).map(date => {
    const naturalWeekday = weekday(date);
    const offset = config.firstMonday ? serial(date) - serial(config.firstMonday) : null;
    let term = null, teachingWeek = null, vacation = null;
    if (offset !== null) {
      if (offset < 0) vacation = config.half === 'autumn' ? '暑假' : '寒假';
      else if (config.secondExams && date > config.secondExams.end) vacation = config.half === 'autumn' ? '寒假' : '暑假';
      else {
        term = terms[offset < 56 ? 0 : 1];
        if (offset < 112) teachingWeek = Math.floor(offset / 7) % 8 + 1;
      }
    }
    const exams = [];
    if (firstExams.has(date)) exams.push(terms[0]);
    if (config.secondExams && date >= config.secondExams.start && date <= config.secondExams.end) exams.push(terms[1]);
    const holidays = config.holidays.filter(item => item.dates.includes(date)).map(({ name }) => ({ name }));
    const scheduleChanges = config.adjustments.flatMap(item => {
      if (item.date === date) return [{ kind: item.kind, targetDate: item.targetDate }];
      if (item.kind === 'swap' && item.targetDate === date) return [{ kind: item.kind, targetDate: item.date }];
      return [];
    });
    return { date, year: Number(date.slice(0, 4)), month: Number(date.slice(5, 7)), day: Number(date.slice(8)),
      weekday: naturalWeekday + 1, weekdayLabel: WEEKDAYS[naturalWeekday], naturalWeekMonday: mondayOf(date),
      term, teachingWeek, teachingLabel: teachingWeek ? `${term}${NUMERALS[teachingWeek - 1]}周` : null,
      exams, vacation, isWeekend: naturalWeekday >= 5, holidays, isHoliday: holidays.length > 0,
      scheduleChanges, effectiveScheduleDate: scheduleChanges[0]?.targetDate || null };
  });
  const byDate = new Map(days.map(day => [day.date, day]));
  const weeks = [];
  for (let monday = mondayOf(config.range.start); monday <= config.range.end; monday = addDays(monday, 7)) {
    const cells = Array.from({ length: 7 }, (_, row) => byDate.get(addDays(monday, row)) || null);
    const first = cells.find(Boolean);
    // 首列缺少可见周一时留空月份表头，使粗线连接真正的周一列。
    weeks.push({ monday, monthKey: cells[0] ? monday.slice(0, 7) : null, cells,
      label: cells.find(day => day?.teachingLabel)?.teachingLabel || (cells.some(day => day?.exams.length) ? '考试' : first.vacation || '—'),
      period: first.vacation || (first.term ? first.term + '学期' : '未设置') });
  }
  return { schemaVersion: 1, config, days, weeks };
}
export function exportData(input) {
  const calendar = generateCalendar(input);
  return { schemaVersion: 1, kind: 'academic-calendar-data', config: calendar.config,
    status: status(calendar.config), days: calendar.days };
}
export function dayMarkers(day) {
  return [day.exams.length ? '考' : '', day.isHoliday ? '休' : '',
    day.scheduleChanges.some(item => item.kind === 'swap') ? '调' : '',
    day.scheduleChanges.some(item => item.kind === 'makeup') ? '补' : ''].join('');
}
