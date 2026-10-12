import { stepNames } from '../../application/session.js';

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
  function update(state) {
    const names = stepNames(state.config);
    const labels = ['新建', '范围', '教学周', names[3].replace('学期', ''), names[4].replace('学期', ''), '假期', '调课'];
    buttons.forEach((button, index) => {
      button.setAttribute('aria-label', `${index + 1} · ${names[index]}`);
      button.querySelector('.step-label').textContent = labels[index];
      button.disabled = state.step === 0 && index !== 0;
      if (index === state.step) button.setAttribute('aria-current', 'step'); else button.removeAttribute('aria-current');
    });
  }
  track.addEventListener('click', event => {
    const button = event.target.closest('button[data-step]');
    if (!button || button.disabled) return;
    const index = Number(button.dataset.step);
    if (index !== currentState().step) go(index);
  });
  update(currentState());
  return { update };
}
