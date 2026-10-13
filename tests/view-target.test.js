import test from 'node:test';
import assert from 'node:assert/strict';
import { blankConfig, addDays } from '../src/core/index.js';
import { createSession, previewConfig } from '../src/application/session.js';
import { calendarFocusDate } from '../src/application/view-target.js';
import { examples } from './fixtures.js';

test('两学期阅读位置跟随实际教学与考试日期，查询不改写配置', () => {
  for (const config of Object.values(examples)) {
    const session = createSession(config, { currentStep: 2 });
    assert.equal(calendarFocusDate(session.getState()), config.firstMonday);
    for (const [index, expected] of [[3, config.firstExams[0]], [4, config.secondExams.start]]) {
      const state = session.dispatch({ type: 'go-to-step', index });
      const before = structuredClone(state);
      assert.equal(calendarFocusDate(state), expected);
      assert.deepEqual(state, before);
    }
  }
});

test('未设置日期的校历不生成考试数据，参考位置限制在可见日期范围内', () => {
  const config = { ...examples.autumn, firstExams: [], secondExams: null };
  const state = createSession(config, { currentStep: 3 }).getState();
  assert.equal(calendarFocusDate(state), addDays(config.firstMonday, 49));
  const blank = createSession(blankConfig(2026), { currentStep: 3 }).getState();
  assert.equal(calendarFocusDate(blank), null);
  const short = { ...state, config: { ...state.config, range: { start:'2023-10-01', end:'2023-10-31' } } };
  assert.equal(calendarFocusDate(short), '2023-10-31');
  assert.deepEqual(short.config.firstExams, []);
  assert.equal(calendarFocusDate({ ...state, finished:true }), null);
});

test('假期和调课优先阅读保留的草稿，跨年引用仍落在展开后的日历内', () => {
  const session = createSession(examples.autumn, { currentStep: 5 });
  assert.equal(calendarFocusDate(session.getState()), null);
  session.dispatch({ type:'select-date', date:'2023-10-01' });
  assert.equal(calendarFocusDate(session.getState()), '2023-10-01');
  session.dispatch({ type:'holiday-cancel' });
  session.dispatch({ type:'go-to-step', index:6 });
  session.dispatch({ type:'select-date', date:'2024-02-02' });
  const state = session.getState();
  assert.equal(calendarFocusDate(state), '2024-02-02');
  assert.ok(calendarFocusDate(state) <= previewConfig(state).range.end);
  assert.equal(state.config.range.end, '2024-01-28');
});
