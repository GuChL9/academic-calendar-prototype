export function readState(storage, key, config, stepCount) {
  const state = { currentStep: 0, compact: true, finished: false };
  try {
    const saved = JSON.parse(storage.getItem(key));
    if (!saved || saved.version !== 1) return state;
    if (typeof saved.compact === 'boolean') state.compact = saved.compact;
    if (saved.calendar !== JSON.stringify(config)) return state;
    if (Number.isInteger(saved.currentStep) && saved.currentStep >= 0 && saved.currentStep < stepCount) {
      state.currentStep = saved.currentStep;
      state.finished = saved.finished === true && state.currentStep === stepCount - 1;
    }
  } catch { /* 无效或不可读取的偏好使用默认状态，保证校历可以继续打开。 */ }
  return state;
}
export function saveState(storage, key, config, state) {
  try {
    const value = JSON.stringify({ version: 1, calendar: JSON.stringify(config), ...state });
    if (storage.getItem(key) !== value) storage.setItem(key, value);
    return true;
  } catch { return false; }
}
