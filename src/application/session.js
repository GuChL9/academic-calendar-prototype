import * as C from '../core/index.js';
import { holidayPresets, matchesHoliday, nextUnsetHoliday } from './holidays.js';

export const STEP_MODES = ['inspect', 'range', 'monday', 'first', 'second', 'holiday', 'adjustment'];
const clone = value => JSON.parse(JSON.stringify(value));
export function modeOf(state) { return state.finished ? 'inspect' : STEP_MODES[state.step]; }
export function stepNames(config) {
  const [first, second] = C.TERMS[config.half];
  return ['学年与学期', '制表范围', '第一教学周', `${first}学期考试`, `${second}学期考试`, '放假日期', '课程对调与补课'];
}
function selectHoliday(state, name, index) {
  const found = index ?? (name ? state.config.holidays.findIndex(item => matchesHoliday(item, name)) : -1);
  const record = state.config.holidays[found];
  state.holiday = { preset: name, editing: record ? found : null, name: record?.name || name || '', dates: record ? [...record.dates] : [] };
  state.selected = null;
  state.anchor = null;
}
function resetHoliday(state) {
  selectHoliday(state, nextUnsetHoliday(state.config) || holidayPresets(state.config.half)[0]);
}
function resetAdjustment(state, keepKind = false) {
  state.adjustment = { kind: keepKind ? state.adjustment.kind : 'swap', dates: [], editing: null };
}
function apply(state, input, message = null) {
  const config = C.normalizeConfig(input);
  state.history.push(clone(state.config));
  if (state.history.length > 30) state.history.shift();
  state.config = config;
  state.yearInput = config.academicYear;
  state.halfInput = config.half;
  state.anchor = null;
  state.revision++;
  state.message = message;
}
function toggle(dates, date) {
  const selected = new Set(dates);
  selected.has(date) ? selected.delete(date) : selected.add(date);
  return [...selected].sort();
}

/** 草稿仅作用于预览，导出始终读取 state.config。 */
export function previewConfig(state) {
  const config = state.config, mode = modeOf(state);
  if (mode === 'range') return { ...config, range: config.canvasRange, firstMonday: null,
    firstExams: [], secondExams: null, holidays: [], adjustments: [] };
  if (mode === 'holiday') {
    const holidays = config.holidays.filter((_, index) => index !== state.holiday.editing);
    if (state.holiday.dates.length) holidays.push({ name: state.holiday.name.trim() || state.holiday.preset || '放假', dates: state.holiday.dates });
    return { ...config, holidays };
  }
  if (mode === 'adjustment') {
    const dates = [config.canvasRange.start, config.canvasRange.end, ...state.adjustment.dates.filter(Boolean)].sort();
    const range = C.serial(dates.at(-1)) - C.serial(dates[0]) <= 366
      ? { start: dates[0], end: dates.at(-1) } : config.canvasRange;
    return { ...config, range };
  }
  return config;
}
function selectDate(state, date) {
  C.checkDate(date);
  const range = previewConfig(state).range, mode = modeOf(state);
  if (date < range.start || date > range.end) throw new Error('请选择当前日历中显示的日期');
  if (['first', 'second'].includes(mode) && !state.config.firstMonday) {
    throw new Error('请先返回“第一教学周”步骤，选择第一周的周一');
  }
  state.selected = date;
  switch (mode) {
    case 'range':
      if (!state.anchor) { state.rangeDraft = null; state.anchor = date; }
      else { state.rangeDraft = C.orderedRange(state.anchor, date); state.anchor = null; }
      break;
    case 'monday':
      if (C.weekday(date) !== 0) throw new Error('请选择星期一');
      apply(state, { ...state.config, firstMonday: date }, '教学周已生成');
      break;
    case 'first':
      apply(state, { ...state.config, firstExams: toggle(state.config.firstExams, date) });
      break;
    case 'second':
      if (!state.anchor) state.anchor = date;
      else apply(state, { ...state.config, secondExams: C.orderedRange(state.anchor, date) }, '考试日期已保存');
      break;
    case 'holiday':
      state.holiday.dates = toggle(state.holiday.dates, date);
      break;
    case 'adjustment': {
      const dates = state.adjustment.dates, index = dates.indexOf(date);
      if (index >= 0) dates[index] = null;
      else if (!dates[0]) dates[0] = date;
      else if (!dates[1]) dates[1] = date;
      else throw new Error('已选好两个日期，请先取消一个已选日期或清除选择');
      break;
    }
  }
}
function navigate(state, direction) {
  const next = state.step + direction;
  if (next < 0 || next >= STEP_MODES.length) return;
  if (state.step === 1 && direction > 0 && state.anchor) throw new Error('请再选择制表末日，或清除本次选择');
  let pending = state.step === 1 && direction > 0 && state.rangeDraft ? { ...state.config, range: state.rangeDraft } : null;
  let newCalendar = false;
  if (state.step === 0 && direction > 0) {
    const blank = C.blankConfig(Number(state.yearInput), state.halfInput);
    newCalendar = blank.academicYear !== state.config.academicYear || blank.half !== state.config.half;
    if (newCalendar) pending = blank;
  }
  if (pending) apply(state, pending, newCalendar ? '已生成空白日历，可选择制表范围' : '制表范围已应用');
  // 范围在向前导航时提交；其他导航只保留已应用的配置。
  state.step = next;
  state.selected = null;
  state.anchor = null;
  state.rangeDraft = null;
  if (newCalendar) { resetHoliday(state); resetAdjustment(state); }
}
function finish(state) {
  if (state.adjustment.dates.some(Boolean) || state.adjustment.editing !== null) {
    throw new Error('请先保存调课，或清除选择、取消编辑后完成制表。');
  }
  state.finished = true;
  state.selected = null;
  state.anchor = null;
  state.rangeDraft = null;
}
function saveHoliday(state) {
  const draft = state.holiday, records = [...state.config.holidays];
  if (!draft.dates.length && draft.editing === null) throw new Error('请先在日历中选择放假日期');
  let savedIndex = draft.editing;
  if (!draft.dates.length) records.splice(draft.editing, 1);
  else if (savedIndex === null) { savedIndex = records.length; records.push({ name: draft.name, dates: draft.dates }); }
  else records[savedIndex] = { name: draft.name, dates: draft.dates };
  apply(state, { ...state.config, holidays: records }, draft.dates.length ? '放假安排已保存' : '已清除此项放假安排');
  if (draft.preset) selectHoliday(state, nextUnsetHoliday(state.config, draft.preset) || draft.preset);
  else selectHoliday(state, null);
}
function saveAdjustment(state) {
  const draft = state.adjustment, [date, targetDate] = draft.dates;
  if (!date || !targetDate) throw new Error('请先在日历中选择两个不同的日期');
  const records = [...state.config.adjustments], item = { kind: draft.kind, date, targetDate };
  if (draft.editing === null) records.push(item); else records[draft.editing] = item;
  apply(state, { ...state.config, adjustments: records }, '调课安排已保存');
  resetAdjustment(state, true);
}
function recordIndex(records, index) {
  if (!Number.isInteger(index) || index < 0 || index >= records.length) throw new Error('请选择存在的记录');
  return index;
}
function reduce(state, action) {
  state.message = null;
  switch (action.type) {
    case 'year': state.yearInput = action.value; break;
    case 'half': state.halfInput = action.value; break;
    case 'select-date': selectDate(state, action.date); break;
    case 'previous': navigate(state, -1); break;
    case 'next': state.step === 6 ? finish(state) : navigate(state, 1); break;
    case 'continue': state.finished = false; state.selected = null; break;
    case 'density': state.compact = !state.compact; break;
    case 'full-range': state.rangeDraft = { ...state.config.canvasRange }; state.anchor = null; break;
    case 'clear-selection': state.anchor = null; state.rangeDraft = null; break;
    case 'remove-first': apply(state, { ...state.config, firstExams: state.config.firstExams.filter(date => date !== action.date) }); break;
    case 'clear-second': apply(state, { ...state.config, secondExams: null }, '已清除末学期考试区间'); break;
    case 'holiday-preset': selectHoliday(state, action.name); break;
    case 'holiday-name': state.holiday.name = action.value; break;
    case 'holiday-remove-date': state.holiday.dates = state.holiday.dates.filter(date => date !== action.date); break;
    case 'holiday-custom': selectHoliday(state, null); break;
    case 'holiday-cancel': resetHoliday(state); break;
    case 'holiday-skip': {
      const names = holidayPresets(state.config.half);
      selectHoliday(state, nextUnsetHoliday(state.config, state.holiday.preset) || names[(names.indexOf(state.holiday.preset) + 1) % names.length]);
      break;
    }
    case 'holiday-save': saveHoliday(state); break;
    case 'holiday-edit': {
      const index = recordIndex(state.config.holidays, action.index);
      const item = state.config.holidays[index];
      selectHoliday(state, holidayPresets(state.config.half).find(name => matchesHoliday(item, name)) || null, index);
      break;
    }
    case 'holiday-delete': {
      const index = recordIndex(state.config.holidays, action.index);
      apply(state, { ...state.config, holidays: state.config.holidays.filter((_, i) => i !== index) }, '已删除，可撤销恢复');
      resetHoliday(state);
      break;
    }
    case 'adjustment-kind':
      if (!['swap', 'makeup'].includes(action.kind)) throw new Error('请选择课程对调或补课');
      state.adjustment.kind = action.kind;
      break;
    case 'adjustment-clear': state.adjustment.dates = []; break;
    case 'adjustment-cancel': resetAdjustment(state); break;
    case 'adjustment-save': saveAdjustment(state); break;
    case 'adjustment-edit': {
      const index = recordIndex(state.config.adjustments, action.index), item = state.config.adjustments[index];
      state.adjustment = { kind: item.kind, dates: [item.date, item.targetDate], editing: index };
      state.selected = item.date;
      break;
    }
    case 'adjustment-delete': {
      const index = recordIndex(state.config.adjustments, action.index);
      apply(state, { ...state.config, adjustments: state.config.adjustments.filter((_, i) => i !== index) }, '已删除，可撤销恢复');
      resetAdjustment(state);
      break;
    }
    case 'escape':
      state.anchor = null; state.rangeDraft = null;
      if (modeOf(state) === 'holiday') resetHoliday(state);
      if (modeOf(state) === 'adjustment') resetAdjustment(state);
      break;
    case 'import':
      apply(state, action.config, '已打开配置');
      state.finished = false; state.selected = null; state.rangeDraft = null;
      resetHoliday(state); resetAdjustment(state);
      break;
    case 'undo':
      if (state.history.length) {
        state.config = state.history.pop(); state.revision++; state.anchor = null; state.rangeDraft = null; state.selected = null;
        state.yearInput = state.config.academicYear; state.halfInput = state.config.half;
        resetHoliday(state); resetAdjustment(state); state.message = '已撤销上一次修改';
      }
      break;
    default: throw new Error('不支持的制表操作：' + action.type);
  }
}

/** 每个动作在独立快照上运行，完整成功后才发布新状态，便于任意界面接入。 */
export function createSession(input = C.blankConfig(), view = {}) {
  const config = C.normalizeConfig(input);
  let state = { config, step: Number.isInteger(view.currentStep) && view.currentStep >= 0 && view.currentStep <= 6 ? view.currentStep : 0,
    compact: typeof view.compact === 'boolean' ? view.compact : true, finished: false,
    yearInput: config.academicYear, halfInput: config.half, selected: null, anchor: null, rangeDraft: null,
    holiday: null, adjustment: { kind: 'swap', dates: [], editing: null }, history: [], revision: 0, message: null };
  state.finished = view.finished === true && state.step === 6;
  resetHoliday(state);
  return {
    getState: () => clone(state),
    dispatch(action) {
      const next = clone(state);
      reduce(next, action);
      state = next;
      return clone(state);
    }
  };
}
