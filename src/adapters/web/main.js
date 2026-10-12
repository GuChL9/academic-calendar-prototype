import * as C from '../../core/index.js';
import { createSession, modeOf } from '../../application/session.js';
import { createXlsx } from '../../export/xlsx.js';
import { createStorage } from './storage.js';
import { createRenderer } from './render.js';
import { attachCalendar } from './keyboard.js';
import { mountMotion } from './motion.js';
import { mountFeedback } from './feedback.js';
import { filename, download, readConfiguration } from './files.js';

const $ = id => document.getElementById(id);
const now = new Date();
const year = now.getMonth() >= 7 ? now.getFullYear() : now.getFullYear() - 1;
const half = now.getMonth() >= 1 && now.getMonth() < 7 ? 'spring' : 'autumn';
let local;
try { local = window.localStorage; } catch { /* 存储受限时仍可制表和导出文件。 */ }
const repository = createStorage(local);
const restored = repository.load(C.blankConfig(year, half));
const session = createSession(restored.config, restored.view);
const keyboard = attachCalendar($('calendar-container'));
const render = createRenderer(keyboard);
let timer, viewFailed = false;
function toast(message, error = false) {
  clearTimeout(timer);
  $('toast').textContent = message; $('toast').classList.toggle('error', error); $('toast').hidden = false;
  timer = setTimeout(() => { $('toast').hidden = true; }, error ? 6500 : 3600);
}
function remember(state, configChanged) {
  if (configChanged && !repository.saveConfig(state.config)) {
    toast('自动保存失败，请点击“保存配置”保留设置。', true);
    return false;
  }
  const saved = repository.saveView(state);
  if (!saved && !viewFailed) toast('无法保存浏览位置，下次打开可能回到第一步。', true);
  viewFailed = !saved;
  return saved;
}
render(session.getState());
remember(session.getState(), false);
const motion = mountMotion();
mountFeedback();

/** 用户动作只进入一个制表会话；呈现、持久化和焦点处理消费同一结果。 */
function dispatch(action, navigation = false) {
  const update = () => {
    const before = session.getState();
    const state = session.dispatch(action);
    render(state);
    const saved = remember(state, state.revision !== before.revision);
    if (state.message && saved) toast(state.message);
    if (action.type === 'select-date') keyboard.focusDate(action.date);
    if (navigation) {
      $('more-tools').open = false;
      const title = state.finished ? $('calendar-title') : document.querySelector('.step:not([hidden]) h2');
      title.focus({ preventScroll: true });
      if (state.finished) motion.position($('calendar-title'));
      else if (modeOf(state) !== 'inspect') motion.position($('mode-banner'));
    }
    if (['holiday-preset', 'holiday-custom', 'holiday-skip', 'holiday-save', 'holiday-edit', 'holiday-cancel', 'import', 'undo'].includes(action.type)) $('holiday-dates').open = false;
    if (action.type === 'holiday-custom') $('holiday-name').focus();
    if (action.type === 'holiday-edit') $('save-holiday').focus();
    if (action.type === 'adjustment-edit') $('adjustment-kind').querySelector('[aria-pressed="true"]').focus();
  };
  try { navigation ? motion.navigate(update) : update(); }
  catch (error) { toast('未应用：' + error.message, true); }
}
function click(id, type, navigation = false) {
  $(id).addEventListener('click', () => dispatch({ type }, navigation));
}
click('previous-step', 'previous', true);
click('next-step', 'next', true);
click('continue-edit', 'continue', true);
click('exit-mode', 'clear-selection');
click('full-range', 'full-range');
click('clear-second', 'clear-second');
click('save-holiday', 'holiday-save');
click('skip-holiday', 'holiday-skip');
click('custom-holiday', 'holiday-custom');
click('cancel-holiday', 'holiday-cancel');
click('save-adjustment', 'adjustment-save');
click('clear-adjustment', 'adjustment-clear');
click('cancel-adjustment', 'adjustment-cancel');
click('undo', 'undo');
$('fit-view').onclick = () => { $('more-tools').open = false; dispatch({ type: 'density' }); };
$('year').oninput = event => dispatch({ type: 'year', value: event.target.value });
$('half').onchange = event => dispatch({ type: 'half', value: event.target.value });
$('holiday-name').oninput = event => dispatch({ type: 'holiday-name', value: event.target.value });
function delegate(id, attribute, action) {
  $(id).addEventListener('click', event => {
    const button = event.target.closest(`[${attribute}]`);
    if (button && !button.disabled) dispatch(action(button.getAttribute(attribute)));
  });
}
delegate('calendar-container', 'data-date', date => ({ type: 'select-date', date }));
delegate('first-exam-list', 'data-remove', date => ({ type: 'remove-first', date }));
delegate('holiday-date-list', 'data-remove-holiday-date', date => ({ type: 'holiday-remove-date', date }));
delegate('holiday-presets', 'data-holiday-preset', name => ({ type: 'holiday-preset', name }));
delegate('adjustment-kind', 'data-adjustment-kind', kind => ({ type: 'adjustment-kind', kind }));
for (const kind of ['holiday', 'adjustment']) {
  delegate(kind + '-list', 'data-edit-' + kind, index => ({ type: kind + '-edit', index: Number(index) }));
  delegate(kind + '-list', 'data-delete-' + kind, index => ({ type: kind + '-delete', index: Number(index) }));
}
document.addEventListener('click', event => { if (!$('more-tools').contains(event.target)) $('more-tools').open = false; });
document.addEventListener('keydown', event => {
  if (event.key !== 'Escape') return;
  if ($('more-tools').open) { $('more-tools').open = false; $('more-tools').querySelector('summary').focus(); }
  else dispatch({ type: 'escape' });
});
$('save-config').onclick = () => {
  const config = session.getState().config;
  download(JSON.stringify(config, null, 2), 'application/json;charset=utf-8', filename(config, '-配置.json'));
};
$('export-json').onclick = () => {
  $('more-tools').open = false;
  const config = session.getState().config;
  download(JSON.stringify(C.exportData(config), null, 2), 'application/json;charset=utf-8', filename(config, '-数据.json'));
};
$('export-xlsx').onclick = () => {
  try {
    const config = session.getState().config;
    download(createXlsx(config), 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', filename(config, '.xlsx'));
    toast(C.status(config).complete ? '已导出校历与逐日数据' : '已导出草稿，尚未完成的设置已标明');
  } catch (error) { toast(error.message, true); }
};
$('open-config').onclick = () => $('file-input').click();
$('file-input').onchange = async event => {
  const file = event.target.files[0];
  if (!file) return;
  try { dispatch({ type: 'import', config: await readConfiguration(file) }); }
  catch (error) { toast(error.message, true); }
  finally { event.target.value = ''; }
};
if (restored.restored) toast('已恢复上次保存在此设备的设置');
else if (!restored.readable) toast('无法读取本地设置，请打开已保存的配置。', true);
