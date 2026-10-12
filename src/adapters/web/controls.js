/** 禁用原因同时进入可访问名，悬停提示作为补充。 */
export function setAvailability(button, issue, label = button.textContent.trim()) {
  button.disabled = Boolean(issue);
  button.title = issue || (label !== button.textContent.trim() ? label : '');
  button.setAttribute('aria-label', label + (issue ? `（${issue}）` : ''));
}

const usable = element => element?.isConnected && !element.disabled && !element.closest('[hidden], [inert]') && element.getClientRects().length > 0;

/** 重绘会替换日期与记录按钮；记录原位置，仅在焦点失效时回退。 */
export function captureFocus() {
  const element = document.activeElement;
  if (!element || element === document.body) return null;
  const key = ['data-holiday-preset', 'data-remove-holiday-date', 'data-remove'].find(name => element.hasAttribute(name));
  return { element, id: element.id, key, value: key && element.getAttribute(key), inSettings: Boolean(element.closest('#settings')) };
}
export function restoreFocus(previous) {
  if (!previous || (document.activeElement !== document.body && usable(document.activeElement))) return;
  const equivalent = previous.id ? document.getElementById(previous.id) : previous.key
    ? [...document.querySelectorAll(`[${previous.key}]`)].find(element => element.getAttribute(previous.key) === previous.value) : previous.element;
  const candidates = [equivalent];
  if (['skip-holiday', 'cancel-holiday', 'save-holiday'].includes(previous.id)) {
    candidates.push(document.getElementById('skip-holiday'), document.querySelector('[data-holiday-preset][aria-pressed="true"]'), document.getElementById('holiday-name'));
  }
  if (previous.inSettings) candidates.push(document.querySelector('.step:not([hidden]) h2'));
  else candidates.push(document.getElementById('calendar-title'));
  candidates.find(usable)?.focus({ preventScroll: true });
}
