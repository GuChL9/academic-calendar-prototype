import test from 'node:test';
import assert from 'node:assert/strict';
import { blankConfig, exportData, generateCalendar, normalizeConfig } from '../src/core/index.js';
import { createSession, modeOf, previewConfig } from '../src/application/session.js';
import { examples } from './fixtures.js';

const open = (step, config = examples.autumn) => createSession(config, { currentStep: step });
const act = (session, type, fields = {}) => session.dispatch({ type, ...fields });
const pick = (session, date) => act(session, 'select-date', { date });

test('范围在下一步提交，选日条带保留完整空表', () => {
  const session = open(1), config = session.getState().config;
  pick(session, '2024-01-28');
  assert.throws(() => act(session, 'next'), /制表末日/);
  pick(session, '2023-07-31');
  assert.deepEqual(session.getState().config, config);
  assert.deepEqual(previewConfig(session.getState()).range, config.canvasRange);
  assert.equal(previewConfig(session.getState()).firstMonday, null);
  const next = act(session, 'next');
  assert.deepEqual(next.config.range, { start: '2023-07-31', end: '2024-01-28' });
  assert.equal(next.rangeDraft, null);
  assert.equal(modeOf(next), 'monday');
});

test('范围返回、清除和重新点选分别丢弃未提交端点', () => {
  const session = open(1);
  const config = session.getState().config;
  pick(session, '2023-08-01'); pick(session, '2023-12-31');
  pick(session, '2023-08-02');
  assert.equal(session.getState().rangeDraft, null);
  assert.equal(session.getState().anchor, '2023-08-02');
  act(session, 'clear-selection'); act(session, 'next');
  assert.deepEqual(session.getState().config, config);
  act(session, 'previous'); act(session, 'full-range'); act(session, 'previous');
  assert.equal(session.getState().rangeDraft, null);
  assert.deepEqual(session.getState().config, config);
});

test('学年输入在下一步生效，新配置可撤销', () => {
  const session = open(0), config = session.getState().config;
  act(session, 'year', { value: '2025' });
  act(session, 'half', { value: 'spring' });
  assert.deepEqual(session.getState().config, config);
  const next = act(session, 'next');
  assert.equal(next.config.academicYear, 2025);
  assert.equal(next.config.firstMonday, null);
  assert.deepEqual(next.config.range, { start: '2026-01-01', end: '2026-08-31' });
  act(session, 'undo');
  assert.deepEqual(session.getState().config, config);
});

test('周一起点与考试校验失败时保留全部状态', () => {
  const session = open(2), before = session.getState();
  assert.throws(() => pick(session, '2023-09-19'), /星期一/);
  assert.deepEqual(session.getState(), before);
  assert.throws(() => pick(session, '2023-12-04'), /考试日期/);
  assert.deepEqual(session.getState(), before);
  const blank = open(3, blankConfig(2023));
  assert.throws(() => pick(blank, '2023-11-11'), /第一教学周/);
  assert.deepEqual(blank.getState().config.firstExams, []);
});

test('秋春考试逐日切换，冬夏考试两端点即保存', () => {
  const session = open(3);
  pick(session, '2023-11-11');
  assert.ok(!session.getState().config.firstExams.includes('2023-11-11'));
  pick(session, '2023-11-11');
  act(session, 'next');
  pick(session, '2024-01-08');
  assert.deepEqual(session.getState().config.secondExams, examples.autumn.secondExams);
  pick(session, '2024-01-08');
  assert.deepEqual(session.getState().config.secondExams, { start: '2024-01-08', end: '2024-01-08' });
  pick(session, '2024-01-20'); act(session, 'previous');
  assert.equal(session.getState().anchor, null);
  assert.equal(session.getState().config.secondExams.end, '2024-01-08');
});

test('节假日草稿只用于预览，保存后继续下一预设', () => {
  const session = open(5);
  assert.equal(session.getState().holiday.preset, '中秋节');
  pick(session, '2023-09-29'); pick(session, '2023-10-01');
  assert.equal(exportData(session.getState().config).days.find(d => d.date === '2023-09-29').isHoliday, false);
  const preview = generateCalendar(previewConfig(session.getState()));
  assert.equal(preview.days.find(d => d.date === '2023-09-29').isHoliday, true);
  assert.equal(preview.days.find(d => d.date === '2023-09-30').isHoliday, false);
  assert.throws(() => act(session, 'next'), /先保存放假/);
  act(session, 'previous'); act(session, 'next');
  assert.equal(session.getState().holiday.dates.length, 2);
  act(session, 'holiday-save');
  assert.equal(session.getState().config.holidays.length, 1);
  assert.equal(session.getState().holiday.preset, '国庆节');
  pick(session, '2023-10-02'); act(session, 'holiday-skip');
  assert.equal(session.getState().config.holidays.length, 1);
  assert.equal(session.getState().holiday.preset, '元旦');
});

test('合并节日编辑同一记录，自定义放假保存后准备下一条', () => {
  const session = open(5, { ...examples.autumn, holidays: [{ name: '中秋、国庆', dates: ['2023-10-01'] }] });
  act(session, 'holiday-preset', { name: '国庆节' });
  assert.equal(session.getState().holiday.editing, 0);
  pick(session, '2023-10-02'); act(session, 'holiday-save');
  assert.deepEqual(session.getState().config.holidays[0].dates, ['2023-10-01', '2023-10-02']);
  act(session, 'holiday-custom'); act(session, 'holiday-name', { value: '校庆' });
  pick(session, '2023-10-08'); act(session, 'holiday-save');
  assert.equal(session.getState().holiday.editing, null);
  assert.equal(session.getState().holiday.name, '');
  assert.equal(session.getState().config.holidays.length, 2);
  act(session, 'holiday-edit', { index: 1 }); pick(session, '2023-10-08'); act(session, 'holiday-save');
  assert.equal(session.getState().config.holidays.length, 1);
  act(session, 'undo'); assert.equal(session.getState().config.holidays.length, 2);
});

test('调课方式切换保留两日，保存才生效且保留方式', () => {
  const session = open(6);
  pick(session, '2023-10-07'); pick(session, '2023-10-05');
  assert.throws(() => pick(session, '2023-10-08'), /两个日期/);
  assert.equal(session.getState().config.adjustments.length, 0);
  assert.throws(() => act(session, 'next'), /先保存调课/);
  act(session, 'adjustment-kind', { kind: 'makeup' }); act(session, 'adjustment-save');
  const state = session.getState();
  assert.deepEqual(state.config.adjustments, [{ kind: 'makeup', date: '2023-10-07', targetDate: '2023-10-05' }]);
  assert.equal(state.adjustment.kind, 'makeup');
  assert.deepEqual(state.adjustment.dates, []);
  assert.equal(generateCalendar(state.config).days.find(d => d.date === '2023-10-05').effectiveScheduleDate, null);
});

test('冲突保存保留草稿，取消编辑保留记录', () => {
  const config = { ...examples.autumn, adjustments: [{ kind: 'swap', date: '2023-10-07', targetDate: '2023-10-05' }] };
  const session = open(6, config);
  pick(session, '2023-10-05'); pick(session, '2023-10-08');
  const before = session.getState();
  assert.throws(() => act(session, 'adjustment-save'), /已有调课/);
  assert.deepEqual(session.getState(), before);
  act(session, 'adjustment-cancel'); act(session, 'adjustment-edit', { index: 0 });
  act(session, 'adjustment-clear');
  assert.throws(() => act(session, 'next'), /先保存调课/);
  act(session, 'adjustment-cancel'); act(session, 'next');
  assert.equal(session.getState().finished, true);
  assert.deepEqual(session.getState().config, normalizeConfig(config));
  act(session, 'continue'); assert.equal(modeOf(session.getState()), 'range');
});

test('导入完整替换，保持步骤并清除草稿，可撤销恢复', () => {
  const session = open(5), original = session.getState().config;
  pick(session, '2023-10-01');
  act(session, 'import', { config: examples.spring });
  assert.equal(session.getState().step, 5);
  assert.deepEqual(session.getState().holiday.dates, []);
  assert.equal(session.getState().config.half, 'spring');
  act(session, 'undo'); assert.deepEqual(session.getState().config, original);
  assert.throws(() => act(session, 'import', { config: {} }));
  assert.deepEqual(session.getState().config, original);
});

test('未完整配置允许完成预览，完整性通过导出单独说明', () => {
  const session = open(6, blankConfig(2023));
  act(session, 'next');
  const state = session.getState();
  assert.equal(state.finished, true);
  assert.equal(modeOf(state), 'inspect');
  assert.equal(exportData(state.config).status.complete, false);
  pick(session, '2023-10-01');
  assert.equal(session.getState().selected, '2023-10-01');
  assert.equal(session.getState().config.adjustments.length, 0);
});

test('撤销仅保留最近三十次配置变更，返回快照不可外部改写', () => {
  const session = open(3);
  for (let i = 0; i < 34; i++) pick(session, '2023-11-11');
  assert.equal(session.getState().history.length, 30);
  const snapshot = session.getState(); snapshot.config.firstExams = [];
  assert.equal(session.getState().config.firstExams.length, 4);
  for (let i = 0; i < 31; i++) act(session, 'undo');
  assert.equal(session.getState().history.length, 0);
});

test('补课只引用原日安排且可以共享原课程日', () => {
  const config = { ...examples.autumn, adjustments: [
    { kind: 'makeup', date: '2023-10-07', targetDate: '2023-10-05' },
    { kind: 'makeup', date: '2023-10-05', targetDate: '2023-10-03' },
    { kind: 'makeup', date: '2023-10-08', targetDate: '2023-10-05' }
  ] };
  const days = generateCalendar(config).days;
  assert.equal(days.find(d => d.date === '2023-10-07').effectiveScheduleDate, '2023-10-05');
  assert.equal(days.find(d => d.date === '2023-10-08').effectiveScheduleDate, '2023-10-05');
});


test('新建入口不修改原校历，可返回未保存的草稿', () => {
  const session = open(5);
  pick(session, '2023-10-01');
  const before = session.getState();
  act(session, 'new-calendar'); act(session, 'year', { value: '2026' });
  assert.deepEqual(session.getState().config, before.config);
  const back = act(session, 'cancel-new');
  assert.equal(back.step, 5); assert.deepEqual(back.holiday, before.holiday);
  act(session, 'holiday-cancel'); act(session, 'next'); act(session, 'next');
  act(session, 'new-calendar');
  assert.equal(act(session, 'cancel-new').finished, true);
});

test('同一学期也能新建空表，撤销恢复旧安排', () => {
  const session = open(0), original = session.getState().config;
  const fresh = act(session, 'manual-start');
  assert.equal(fresh.step, 1); assert.equal(fresh.config.academicYear, original.academicYear);
  assert.equal(fresh.config.firstMonday, null); assert.deepEqual(fresh.config.firstExams, []);
  assert.deepEqual(act(session, 'undo').config, original);
});

test('统一核对沿用导入值，未修改的步骤不占用撤销记录', () => {
  const session = createSession(blankConfig(2023)), before = session.getState().config;
  act(session, 'school-import', { config: examples.autumn });
  for (let i = 0; i < 6; i++) act(session, 'next');
  assert.equal(session.getState().finished, true);
  assert.deepEqual(session.getState().config, normalizeConfig(examples.autumn));
  assert.equal(session.getState().history.length, 1);
  assert.deepEqual(act(session, 'undo').config, before);
});

test('考试只选首日时保留已保存区间并阻止继续', () => {
  const session = open(4), before = session.getState().config;
  pick(session, '2024-01-10');
  assert.throws(() => act(session, 'next'), /考试末日/);
  assert.deepEqual(session.getState().config, before);
  act(session, 'clear-selection'); assert.equal(act(session, 'next').step, 5);
});


test('从新建入口打开配置直接进入编辑步骤', () => {
  const session = createSession(blankConfig(2023));
  assert.equal(act(session, 'import', { config: examples.autumn }).step, 1);
});

test('跨步骤直达只改变视图，不提交配置或标记完成', () => {
  const session = open(1), before = session.getState();
  for (const index of [6, 3, 2, 5, 4, 1]) {
    const state = act(session, 'go-to-step', { index });
    assert.equal(state.step, index); assert.equal(state.finished, false);
    assert.deepEqual(state.config, before.config); assert.equal(state.history.length, 0);
  }
  act(session, 'go-to-step', { index: 0 }); act(session, 'year', { value: 2026 });
  assert.deepEqual(session.getState().config, before.config);
  assert.equal(act(session, 'cancel-new').step, 1);
  assert.throws(() => act(session, 'go-to-step', { index: 7 }), /有效的步骤/);
  const fresh = createSession(blankConfig(2023));
  assert.throws(() => act(fresh, 'go-to-step', { index: 6 }), /先选择/);
});

test('直达取消单个端点并提示，新的完整范围需先处理', () => {
  for (const [step, date] of [[1, '2023-08-01'], [4, '2024-01-10']]) {
    const session = open(step), before = session.getState().config;
    pick(session, date);
    const state = act(session, 'go-to-step', { index: 3 });
    assert.equal(state.anchor, null); assert.match(state.message, /已取消未完成/);
    assert.deepEqual(state.config, before);
  }
  const session = open(1);
  pick(session, '2023-08-01'); pick(session, '2024-01-28');
  const before = session.getState();
  assert.throws(() => act(session, 'go-to-step', { index: 5 }), /下一步应用制表范围/);
  assert.deepEqual(session.getState(), before);
  act(session, 'next');
  assert.equal(act(session, 'go-to-step', { index: 5 }).config.range.start, '2023-08-01');
});

test('未保存假期和调课阻止直达，允许返回草稿所在步骤', () => {
  for (const [step, date, cancel, guard] of [[5, '2023-10-01', 'holiday-cancel', /放假日期保存/], [6, '2023-10-07', 'adjustment-cancel', /调课保存/]]) {
    const session = open(step);
    pick(session, date);
    const before = session.getState();
    assert.throws(() => act(session, 'go-to-step', { index: 2 }), guard);
    assert.deepEqual(session.getState(), before);
    act(session, 'previous');
    assert.equal(act(session, 'go-to-step', { index: step }).step, step);
    act(session, cancel);
    assert.equal(act(session, 'go-to-step', { index: 2 }).step, 2);
  }
});

test('导入范围可直接跳转，来源与撤销历史保留', () => {
  const session = createSession(blankConfig(2023));
  act(session, 'school-import', { config: examples.autumn });
  const before = session.getState();
  const state = act(session, 'go-to-step', { index: 5 });
  assert.equal(state.step, 5); assert.equal(state.rangeDraft, null);
  assert.deepEqual(state.config, before.config); assert.deepEqual(state.schoolSource, before.schoolSource);
  assert.deepEqual(state.history, before.history);
});

test('多处草稿均可返回处理，隐藏的假期草稿阻止完成', () => {
  const session = open(6);
  pick(session, '2023-10-07'); act(session, 'previous'); pick(session, '2023-10-01');
  act(session, 'go-to-step', { index: 6 });
  assert.equal(session.getState().adjustment.dates[0], '2023-10-07');
  act(session, 'adjustment-cancel');
  assert.throws(() => act(session, 'next'), /放假日期保存/);
  act(session, 'go-to-step', { index: 5 }); act(session, 'holiday-cancel');
  act(session, 'go-to-step', { index: 6 });
  assert.equal(act(session, 'next').finished, true);
});
