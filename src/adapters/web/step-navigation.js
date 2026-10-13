import { stepNames, stepNavigationIssue } from '../../application/session.js';
import { setAvailability } from './controls.js';

/** 步骤条只标识当前位置，填写完成度由配置校验负责。按钮可用键盘直接操作。 */
export function mountStepNavigation(go, currentState) {
  const track = document.getElementById('step-track');
  const buttons = Array.from({ length: 7 }, (_, index) => {
    const button = document.createElement('button'), dot = document.createElement('span'), label = document.createElement('span');
    button.type = 'button'; button.dataset.step = index;
    dot.className = 'step-dot'; dot.textContent = index + 1; dot.setAttribute('aria-hidden', 'true');
    label.className = 'step-label'; label.setAttribute('aria-hidden', 'true');
    button.append(dot, label);
    return button;
  });
  track.replaceChildren(...buttons);
  const narrow = window.matchMedia('(max-width: 600px)');
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)');
  const printing = window.matchMedia('print');
  let current = currentState(), animation = 0, lastWidth = -1;
  function stopScroll() {
    cancelAnimationFrame(animation);
    animation = 0;
  }
  function updateEdges() {
    const remaining = track.scrollWidth - track.clientWidth - track.scrollLeft;
    track.style.setProperty('--step-fade-left', track.scrollLeft > 1 ? '14px' : '0px');
    track.style.setProperty('--step-fade-right', remaining > 1 ? '14px' : '0px');
  }
  function revealCurrent(animate = false) {
    stopScroll();
    if (!track.clientWidth || current.finished) return;
    const button = buttons[current.step];
    const maximum = Math.max(0, track.scrollWidth - track.clientWidth);
    const target = narrow.matches ? Math.max(0, Math.min(maximum, button.offsetLeft + button.offsetWidth / 2 - track.clientWidth / 2)) : 0;
    const start = track.scrollLeft;
    if (!animate || reduce.matches || printing.matches || document.hidden || Math.abs(target - start) < 1) {
      track.scrollLeft = target;
      updateEdges();
      return;
    }
    // 与页面导航使用相同的时间和缓动；连续切换从当前滚动位置接续。
    const began = performance.now(), duration = document.documentElement.dataset.theme === 'mist' ? 360 : 400;
    const tick = now => {
      const progress = Math.min(1, (now - began) / duration);
      const eased = progress * progress * (3 - 2 * progress);
      track.scrollLeft = start + (target - start) * eased;
      updateEdges();
      animation = progress < 1 ? requestAnimationFrame(tick) : 0;
    };
    animation = requestAnimationFrame(tick);
  }
  function update(state) {
    const changed = state.step !== current.step || state.finished !== current.finished;
    current = state;
    const names = stepNames(state.config);
    const labels = ['新建', '范围', '教学周', names[3].replace('学期', ''), names[4].replace('学期', ''), '假期', '调课'];
    buttons.forEach((button, index) => {
      button.querySelector('.step-label').textContent = labels[index];
      const issue = stepNavigationIssue(state, index);
      setAvailability(button, issue, `${index + 1} · ${names[index]}`);
      if (index === state.step) button.setAttribute('aria-current', 'step'); else button.removeAttribute('aria-current');
    });
    // 选日、修改名称等同一步操作不打断用户手动浏览步骤条。
    if (changed) revealCurrent(true);
    else updateEdges();
  }
  track.addEventListener('scroll', updateEdges, { passive: true });
  for (const type of ['pointerdown', 'touchstart', 'wheel']) track.addEventListener(type, stopScroll, { passive: true });
  track.addEventListener('keydown', stopScroll);
  function resize() {
    const width = track.clientWidth;
    if (width === lastWidth) return;
    lastWidth = width;
    revealCurrent();
  }
  if (typeof ResizeObserver !== 'undefined') new ResizeObserver(resize).observe(track);
  else window.addEventListener('resize', resize, { passive: true });
  narrow.addEventListener('change', () => revealCurrent());
  reduce.addEventListener('change', () => { if (reduce.matches) revealCurrent(); });
  printing.addEventListener('change', () => revealCurrent());
  document.addEventListener('visibilitychange', () => { if (document.hidden) stopScroll(); });
  track.addEventListener('click', event => {
    const button = event.target.closest('button[data-step]');
    if (!button || button.disabled) return;
    const index = Number(button.dataset.step);
    if (index !== currentState().step) go(index);
  });
  update(currentState());
  resize();
  return { update };
}
