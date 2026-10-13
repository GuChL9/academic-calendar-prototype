import { addDays } from '../core/index.js';
import { previewConfig, secondExamEarliest } from './session.js';

/** 进入步骤时的阅读位置；仅提供视图目标，不写入任何日期安排。 */
export function calendarFocusDate(state) {
  if (state.finished || state.step === 0) return null;
  const { config, step } = state;
  const candidates = {
    1: state.rangeDraft?.start || config.range.start,
    2: config.firstMonday || config.range.start,
    3: config.firstExams[0] || (config.firstMonday && addDays(config.firstMonday, 49)),
    4: config.secondExams?.start || secondExamEarliest(config),
    5: state.holiday.dates[0],
    6: state.adjustment.dates.find(Boolean) || config.adjustments[0]?.date || config.firstMonday
  };
  const date = candidates[step];
  if (!date) return null;
  const { range } = previewConfig(state);
  return date < range.start ? range.start : date > range.end ? range.end : date;
}
