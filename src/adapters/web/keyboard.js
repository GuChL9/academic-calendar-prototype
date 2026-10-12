export function nextDate(cells, date, key) {
  const source = cells.find(cell => cell.date === date);
  const direction = { ArrowLeft: ['column', 'row', -1], ArrowRight: ['column', 'row', 1], ArrowUp: ['row', 'column', -1], ArrowDown: ['row', 'column', 1] }[key];
  if (!source || !direction) return null;
  const [axis, fixed, sign] = direction;
  return cells.filter(cell => !cell.disabled && cell[fixed] === source[fixed] && (cell[axis] - source[axis]) * sign > 0)
    .sort((a, b) => (a[axis] - b[axis]) * sign)[0]?.date || null;
}
export function attachCalendar(calendar) {
  const doc = calendar.ownerDocument;
  let lastDate = null;
  const buttons = () => [...calendar.querySelectorAll('.date-button[data-date]')];
  function choose(button) {
    for (const item of buttons()) item.tabIndex = item === button && !item.disabled ? 0 : -1;
    calendar.tabIndex = button ? -1 : 0;
    if (button) lastDate = button.dataset.date;
    return button;
  }
  // 优先保持当前与上次的有效焦点，起点日期仅作为首次进入或原日期不可选时的兜底。
  function refresh(fallbackDate) {
    const available = buttons().filter(button => !button.disabled);
    const active = available.includes(doc.activeElement) ? doc.activeElement : null;
    return choose(active || available.find(button => button.dataset.date === lastDate)
      || available.find(button => button.dataset.date === fallbackDate)
      || available.sort((a, b) => a.dataset.date.localeCompare(b.dataset.date))[0]);
  }
  function focusDate(date) {
    const button = buttons().find(item => !item.disabled && item.dataset.date === date);
    if (button) choose(button).focus({ preventScroll: true });
    return button;
  }
  calendar.addEventListener('focusin', event => {
    const button = event.target.closest?.('.date-button[data-date]');
    if (button && !button.disabled) choose(button);
  });
  calendar.addEventListener('keydown', event => {
    if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey || !['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return;
    const source = event.target.closest?.('.date-button[data-date]');
    if (!source || source.disabled) return;
    event.preventDefault();
    const cells = buttons().map(button => ({ date: button.dataset.date, disabled: button.disabled,
      row: button.closest('tr').sectionRowIndex, column: button.closest('td').cellIndex }));
    const date = nextDate(cells, source.dataset.date, event.key);
    if (!date) return;
    const button = focusDate(date);
    button.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'auto' });
    // 移动后的焦点保持在固定星期列右侧的可见区域。
    const cell = button.getBoundingClientRect(), viewport = calendar.getBoundingClientRect();
    const weekday = calendar.querySelector('.weekday');
    const left = Math.max(viewport.left, weekday?.getBoundingClientRect().right || viewport.left);
    if (cell.left < left) calendar.scrollLeft -= left - cell.left;
  });
  return { refresh, focusDate };
}
