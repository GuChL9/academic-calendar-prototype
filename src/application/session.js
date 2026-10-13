import * as C from '../core/index.js';
import { schoolReview } from './school-review.js';
import { holidayPresets, matchesHoliday, nextUnsetHoliday, nextHolidayPreset } from './holidays.js';

export const STEP_MODES = ['inspect', 'range', 'monday', 'first', 'second', 'holiday', 'adjustment'];
const clone = value => JSON.parse(JSON.stringify(value));
export function modeOf(state) { return state.finished ? 'inspect' : STEP_MODES[state.step]; }
/** 末学期考试端点须在十六周及所有前学期考试之后。 */
export function secondExamEarliest(config) {
  if (!config.firstMonday) return null;
  const endOfTeaching = C.addDays(config.firstMonday, 112), lastFirstExam = config.firstExams.at(-1);
  return lastFirstExam && lastFirstExam >= endOfTeaching ? C.addDays(lastFirstExam, 1) : endOfTeaching;
}
export function stepNames(config) {
  const [first, second] = C.TERMS[config.half];
  return ['新建校历', '制表范围', '第一教学周', `${first}学期考试`, `${second}学期考试`, '放假日期', '课程对调与补课'];
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
function apply(state, input, message = null, source = state.schoolSource) {
  const config = C.normalizeConfig(input), schoolSource = schoolReview(source, config);
  // 核对时沿用原值不会生成空的撤销记录。来源与配置一起恢复。
  if (JSON.stringify([config, schoolSource]) !== JSON.stringify([state.config, state.schoolSource])) {
    state.history.push(clone({ config: state.config, schoolSource: state.schoolSource }));
    if (state.history.length > 30) state.history.shift();
    state.revision++;
  }
  state.schoolSource = schoolSource;
  state.config = config;
  state.yearInput = config.academicYear;
  state.halfInput = config.half;
  state.anchor = null;
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
  if (mode === 'second' && date < secondExamEarliest(state.config)) throw new Error('末学期考试日期应在 16 个教学周及前学期考试结束后');
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
  const { pending, newCalendar } = direction > 0 ? forwardNavigation(state) : { pending: null, newCalendar: false };
  if (pending) apply(state, pending, newCalendar ? '已生成空白日历，可选择制表范围' : '制表范围已应用', newCalendar ? null : state.schoolSource);
  state.entryReturn = next === 0 ? { step: state.step, finished: false } : null;
  // 范围在向前导航时提交；其他导航只保留已应用的配置。
  state.step = next;
  state.selected = null;
  state.anchor = null;
  state.rangeDraft = null;
  if (newCalendar) { resetHoliday(state); resetAdjustment(state); }
}
/** 下一步可能提交范围；其校验与只切换视图的步骤跳转分别表达。 */
function forwardNavigation(state) {
  if (state.step === 1 && state.anchor) throw new Error('请再选择制表末日，或清除本次选择');
  if (state.step === 4 && state.anchor) throw new Error('请再选择考试末日，或清除本次选择');
  const draftIssue = forwardDraftIssue(state, state.step + 1);
  if (draftIssue) throw new Error(draftIssue);
  let pending = state.step === 1 && state.rangeDraft ? { ...state.config, range: state.rangeDraft } : null;
  let newCalendar = false;
  if (state.step === 0) {
    const blank = C.blankConfig(Number(state.yearInput), state.halfInput);
    newCalendar = blank.academicYear !== state.config.academicYear || blank.half !== state.config.half;
    if (newCalendar) pending = blank;
  }
  return { pending: pending && C.normalizeConfig(pending), newCalendar };
}
export function holidayChanged(state) {
  const draft = state.holiday, record = state.config.holidays[draft.editing];
  return record ? draft.name.trim() !== record.name || JSON.stringify(draft.dates) !== JSON.stringify(record.dates) : draft.dates.length > 0;
}
function forwardDraftIssue(state, index) {
  const returningToAdjustment = index === 6 && (state.adjustment.dates.some(Boolean) || state.adjustment.editing !== null);
  if (index > 5 && holidayChanged(state) && !returningToAdjustment) return state.holiday.editing !== null && !state.holiday.dates.length
    ? '请先清除原放假日期，或取消编辑后继续' : '请先保存放假日期，或取消编辑后继续';
  return null;
}
/** 步骤条和会话共用可达性规则；后退保留草稿，前进可返回草稿所在步骤。 */
export function stepNavigationIssue(state, index) {
  if (!Number.isInteger(index) || index < 0 || index >= STEP_MODES.length) return '请选择有效的步骤';
  if (index === state.step) return null;
  if (state.step === 0) return '请先选择导入校历或自行制表';
  if (index < state.step) return null;
  if (state.rangeDraft && (state.rangeDraft.start !== state.config.range.start || state.rangeDraft.end !== state.config.range.end)) {
    return '请点击下一步应用制表范围，或清除本次选择后跳转';
  }
  return forwardDraftIssue(state, index);
}
/** 直达步骤仅切换视图；需要保存的草稿在原步骤处理，单端点可安全取消。 */
function goToStep(state, index) {
  const issue = stepNavigationIssue(state, index);
  if (issue) throw new Error(issue);
  if (index === state.step) return;
  if (state.anchor) state.message = '已取消未完成的日期选择，已保存安排保持不变';
  state.entryReturn = index === 0 ? { step: state.step, finished: state.finished } : null;
  state.step = index; state.finished = false; state.selected = null; state.anchor = null; state.rangeDraft = null;
  state.yearInput = state.config.academicYear; state.halfInput = state.config.half;
}
function checkFinish(state) {
  // 范围草稿和考试锚点已由进入本步的导航提交或清除；跨步骤保留的草稿在此统一检查。
  if (holidayChanged(state)) throw new Error(state.holiday.editing !== null && !state.holiday.dates.length
    ? '请先返回放假日期清除原日期，或取消编辑后完成制表' : '请先返回放假日期保存，或取消编辑后完成制表');
  if (state.adjustment.dates.some(Boolean) || state.adjustment.editing !== null) {
    throw new Error('请先保存调课，或清除选择、取消编辑后完成制表。');
  }
}
function finish(state) {
  checkFinish(state);
  state.finished = true;
  state.selected = null;
  state.anchor = null;
  state.rangeDraft = null;
}
function holidayConfig(state) {
  const draft = state.holiday, records = [...state.config.holidays];
  if (!draft.dates.length && draft.editing === null) throw new Error('请先在日历中选择放假日期');
  let savedIndex = draft.editing;
  if (!draft.dates.length) records.splice(draft.editing, 1);
  else if (savedIndex === null) { savedIndex = records.length; records.push({ name: draft.name, dates: draft.dates }); }
  else records[savedIndex] = { name: draft.name, dates: draft.dates };
  return C.normalizeConfig({ ...state.config, holidays: records });
}
function saveHoliday(state) {
  const draft = state.holiday;
  apply(state, holidayConfig(state), draft.dates.length ? '放假安排已保存' : '已清除此项放假日期，可撤销恢复');
  if (draft.preset) selectHoliday(state, nextUnsetHoliday(state.config, draft.preset) || draft.preset);
  else selectHoliday(state, null);
}
function adjustmentConfig(state) {
  const draft = state.adjustment, [date, targetDate] = draft.dates;
  if (!date || !targetDate) throw new Error('请先在日历中选择两个不同的日期');
  const records = [...state.config.adjustments], item = { kind: draft.kind, date, targetDate };
  if (draft.editing === null) records.push(item); else records[draft.editing] = item;
  return C.normalizeConfig({ ...state.config, adjustments: records });
}
function saveAdjustment(state) {
  apply(state, adjustmentConfig(state), '调课安排已保存');
  resetAdjustment(state, true);
}
/** 按钮可用性与提交使用相同的候选配置和校验，查询不会改变草稿或历史。 */
export function actionIssue(state, type) {
  try {
    if (type === 'holiday-save') holidayConfig(state);
    else if (type === 'adjustment-save') adjustmentConfig(state);
    else if (type === 'next') state.step === 6 ? checkFinish(state) : forwardNavigation(state);
    else throw new Error('不支持的提交操作：' + type);
    return null;
  } catch (error) { return error.message; }
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
    case 'go-to-step': goToStep(state, action.index); break;
    case 'continue': state.finished = false; state.step = 1; state.selected = null; state.entryReturn = null; break;
    case 'new-calendar':
      if (state.step !== 0 || state.finished) state.entryReturn = { step: state.step, finished: state.finished };
      state.step = 0; state.finished = false; state.yearInput = state.config.academicYear; state.halfInput = state.config.half;
      break;
    case 'cancel-new':
      if (state.entryReturn) { Object.assign(state, state.entryReturn); state.entryReturn = null; }
      state.yearInput = state.config.academicYear; state.halfInput = state.config.half;
      break;
    case 'manual-start':
      apply(state, C.blankConfig(Number(state.yearInput), state.halfInput), '已新建空白校历', null);
      state.step = 1; state.finished = false; state.selected = null; state.rangeDraft = null; state.entryReturn = null;
      resetHoliday(state); resetAdjustment(state);
      break;
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
      const next = nextHolidayPreset(state.config, state.holiday.preset);
      if (next) selectHoliday(state, next);
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
      if (modeOf(state) === 'holiday' && holidayChanged(state)) {
        state.message = state.holiday.editing !== null && !state.holiday.dates.length
          ? '放假修改草稿已保留；可清除已保存的放假日期或点击“取消编辑”。'
          : '放假日期尚未保存，草稿已保留；可保存或点击“取消编辑”。';
        break;
      }
      if (modeOf(state) === 'adjustment' && (state.adjustment.dates.some(Boolean) || state.adjustment.editing !== null)) {
        state.message = '调课草稿已保留；可保存、清除选择或取消编辑。';
        break;
      }
      if (state.anchor || state.rangeDraft) state.message = '已取消本次日期选择，已保存安排保持不变';
      state.anchor = null; state.rangeDraft = null;
      break;
    case 'school-import':
    case 'import':
      apply(state, action.config, action.type === 'school-import' ? '已导入校历，可逐步核对' : '已打开校历', action.type === 'school-import' ? action.source ?? null : null);
      state.finished = false; state.selected = null; state.rangeDraft = null;
      state.anchor = null;
      state.entryReturn = null;
      if (action.type === 'school-import') { state.step = 1; state.rangeDraft = { ...state.config.range }; }
      else if (state.step === 0) state.step = 1;
      resetHoliday(state); resetAdjustment(state);
      break;
    case 'undo':
      if (state.history.length) {
        Object.assign(state, state.history.pop()); state.revision++; state.entryReturn = null; state.anchor = null; state.rangeDraft = null; state.selected = null;
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
    schoolSource: schoolReview(view.schoolSource, config), entryReturn: null,
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
