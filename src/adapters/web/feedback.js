export function mountFeedback() {
  'use strict';
  const calendar = document.getElementById('calendar-container');
  const frame = calendar?.closest('.calendar-frame');
  if (!calendar || !frame) return;
  const leftEdge = frame.querySelector('.calendar-edge-left');
  const rightEdge = frame.querySelector('.calendar-edge-right');
  const preciseHover = window.matchMedia('(hover: hover) and (pointer: fine)');
  let animationFrame = 0;
  let hoverAllowed = preciseHover.matches;
  let suspended = document.hidden;
  let highlighted = new Set();
  let observedTable = null;

  function schedule() {
    if (!animationFrame) animationFrame = requestAnimationFrame(refresh);
  }
  function setHighlighted(next) {
    for (const button of highlighted) if (!next.has(button)) button.classList.remove('schedule-related');
    for (const button of next) if (!highlighted.has(button)) button.classList.add('schedule-related');
    highlighted = next;
  }
  function usable(button) {
    return button && calendar.contains(button) && !button.disabled && button.dataset.linkedDates;
  }
  function refreshRelations() {
    if (suspended || document.hidden) { setHighlighted(new Set()); return; }
    const hover = hoverAllowed && preciseHover.matches ? calendar.querySelector('.date-button:hover') : null;
    const focus = document.activeElement?.matches('.date-button:focus-visible') ? document.activeElement : null;
    const source = usable(hover) ? hover : usable(focus) ? focus : null;
    const next = new Set();
    if (source) {
      const dates = new Set([source.dataset.date, ...source.dataset.linkedDates.split(/\s+/)]);
      for (const button of calendar.querySelectorAll('.date-button[data-date]')) {
        if (!button.disabled && dates.has(button.dataset.date)) next.add(button);
      }
    }
    setHighlighted(next);
  }
  function refreshEdges() {
    if (!leftEdge || !rightEdge) return;
    // 将实际余量连续分配给左侧留白，收窄时自然回到内容区居中，避免阈值处跳动。
    const area = frame.closest('.calendar-area'), table = calendar.querySelector('.calendar-table');
    if (area && table) {
      const legend = area.querySelector('.calendar-legend'), style = getComputedStyle(calendar);
      const available = area.clientWidth - legend.offsetWidth - table.offsetWidth - parseFloat(style.marginLeft) - parseFloat(style.marginRight) - 2;
      const inset = getComputedStyle(area).display === 'grid' ? Math.max(0, Math.min(legend.offsetWidth, available)) : 0;
      const value = inset + 'px';
      if (area.style.getPropertyValue('--calendar-inset') !== value) area.style.setProperty('--calendar-inset', value);
      area.classList.toggle('calendar-centered', inset > 0 && inset === legend.offsetWidth);
    }
    // 实体滚动条占用的高度计入下沿留白，覆盖式滚动条的高度为零。
    const scrollbar = Math.max(0, calendar.offsetHeight - calendar.clientHeight) + 'px';
    if (calendar.style.getPropertyValue('--calendar-scrollbar') !== scrollbar) calendar.style.setProperty('--calendar-scrollbar', scrollbar);
    const viewport = calendar.getBoundingClientRect();
    const bounds = frame.getBoundingClientRect();
    const originX = bounds.left + frame.clientLeft;
    const originY = bounds.top + frame.clientTop;
    const contentLeft = viewport.left + calendar.clientLeft;
    const contentRight = contentLeft + calendar.clientWidth;
    const weekday = calendar.querySelector('.weekday');
    const stickyRight = Math.min(contentRight, Math.max(contentLeft, weekday?.getBoundingClientRect().right || contentLeft));
    const top = viewport.top + calendar.clientTop - originY;
    const height = calendar.clientHeight;
    leftEdge.style.top = rightEdge.style.top = top + 'px';
    leftEdge.style.height = rightEdge.style.height = height + 'px';
    leftEdge.style.left = (stickyRight - originX) + 'px';
    rightEdge.style.right = (frame.clientWidth - (contentRight - originX)) + 'px';
    const overflow = calendar.scrollWidth - calendar.clientWidth;
    const visible = height > 0 && contentRight > stickyRight && overflow > 1;
    leftEdge.hidden = !visible || calendar.scrollLeft <= 1;
    rightEdge.hidden = !visible || overflow - calendar.scrollLeft <= 1;
  }
  function refresh() {
    animationFrame = 0;
    refreshEdges();
    refreshRelations();
  }
  const resize = window.ResizeObserver ? new ResizeObserver(schedule) : null;
  function observeTable() {
    const table = calendar.querySelector('.calendar-table');
    if (table !== observedTable) {
      if (observedTable) resize?.unobserve(observedTable);
      observedTable = table;
      if (table) resize?.observe(table);
    }
  }
  resize?.observe(calendar);
  resize?.observe(frame);
  observeTable();
  new MutationObserver(() => {
    // 重绘后从新节点的真实悬停或焦点重新建立关联提示。
    setHighlighted(new Set());
    observeTable();
    schedule();
  }).observe(calendar, { childList: true });
  // 导航期间隐藏边缘提示，导航完成后重新测量静止位置。
  new MutationObserver(schedule).observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
  calendar.addEventListener('scroll', schedule, { passive: true });
  calendar.addEventListener('pointerover', event => {
    hoverAllowed = preciseHover.matches && event.pointerType !== 'touch';
    schedule();
  });
  calendar.addEventListener('pointerout', schedule);
  calendar.addEventListener('focusin', schedule);
  calendar.addEventListener('focusout', schedule);
  document.addEventListener('pointerdown', event => {
    if (event.pointerType === 'touch') { hoverAllowed = false; setHighlighted(new Set()); }
  }, { passive: true });
  preciseHover.addEventListener('change', () => { hoverAllowed = preciseHover.matches; schedule(); });
  window.addEventListener('resize', schedule, { passive: true });
  window.addEventListener('blur', () => { suspended = true; setHighlighted(new Set()); });
  window.addEventListener('focus', () => { suspended = document.hidden; schedule(); });
  document.addEventListener('visibilitychange', () => {
    suspended = document.hidden;
    if (suspended) setHighlighted(new Set()); else schedule();
  });
  document.fonts?.ready.then(schedule);
  schedule();
  // 导航测量前同步布局，避免居中留白在下一帧才变化。
  return { refreshLayout: refreshEdges };
}
