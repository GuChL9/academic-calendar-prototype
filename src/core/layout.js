/** 列对应自然周，行对应星期；月份边界逐格依据真实日期计算。 */
export function monthBorders(calendar, column, row) {
  const day = calendar.weeks[column]?.cells[row];
  if (!day) return { top: false, right: false, bottom: false, left: false };
  const month = day.date.slice(0, 7);
  const same = other => other?.date.slice(0, 7) === month;
  return {
    top: row === 0 ? calendar.weeks[column].monthKey !== month : !same(calendar.weeks[column].cells[row - 1]),
    bottom: row === 6 || !same(calendar.weeks[column].cells[row + 1]),
    left: !same(calendar.weeks[column - 1]?.cells[row]),
    right: !same(calendar.weeks[column + 1]?.cells[row])
  };
}
export function monthHeaderBorders(calendar, column) {
  const month = calendar.weeks[column]?.monthKey;
  return { left: Boolean(month) && calendar.weeks[column - 1]?.monthKey !== month,
    right: Boolean(month) && calendar.weeks[column + 1]?.monthKey !== month };
}
export function groupWeeks(weeks, key) {
  const groups = [];
  weeks.forEach((week, index) => {
    const previous = groups.at(-1), value = week[key];
    if (previous?.value === value) previous.span++;
    else groups.push({ value, start: index, span: 1 });
  });
  return groups;
}
