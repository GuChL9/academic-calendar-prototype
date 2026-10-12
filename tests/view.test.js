import test from 'node:test';
import assert from 'node:assert/strict';
import * as C from '../src/core/index.js';
import { examples } from './fixtures.js';
import * as P from '../src/application/preferences.js';
import { nextDate } from '../src/adapters/web/keyboard.js';
const V = {...P, nextDate};
const key = 'view';
function memory() {
  const entries = new Map();
  return { getItem: key => entries.get(key) ?? null, setItem: (key, value) => entries.set(key, value) };
}
const config = C.normalizeConfig(examples.autumn);
const defaults = { currentStep: 0, compact: true, finished: false };

test('重新打开规范化配置后恢复步骤、密度和完成预览', () => {
  const storage = memory();
  for (const state of [
    { currentStep: 3, compact: false, finished: false },
    { currentStep: 6, compact: true, finished: true },
    { currentStep: 6, compact: false, finished: false }
  ]) {
    assert.equal(V.saveState(storage, key, config, state), true);
    assert.deepEqual(V.readState(storage, key, C.parseConfig(JSON.stringify(config)), 7), state);
  }
});

test('不同日历单独恢复步骤与完成状态，共用显示密度', () => {
  const storage = memory();
  V.saveState(storage, key, config, { currentStep: 6, compact: false, finished: true });
  assert.deepEqual(V.readState(storage, key, examples.spring, 7), { ...defaults, compact: false });
});

test('无效或不可读取的偏好回退到有效初始状态', () => {
  assert.deepEqual(V.readState(undefined, key, config, 7), defaults);
  for (const value of ['{', 'null', '[]', '{"version":99}', JSON.stringify({ version: 1, calendar: JSON.stringify(config), currentStep: 99, compact: 'false', finished: true })]) {
    assert.deepEqual(V.readState({ getItem: () => value }, key, config, 7), defaults);
  }
  const storage = memory();
  V.saveState(storage, key, config, { currentStep: 3, compact: true, finished: true });
  assert.deepEqual(V.readState(storage, key, config, 7), { ...defaults, currentStep: 3 });
  assert.equal(V.saveState(undefined, key, config, defaults), false);
  assert.equal(V.saveState({ getItem() { return null; }, setItem() { throw Error('full'); } }, key, config, defaults), false);
});

const cells = [
  { date: '2023-09-18', row: 0, column: 1 },
  { date: '2023-09-25', row: 0, column: 2 },
  { date: '2023-10-02', row: 0, column: 3 },
  { date: '2023-09-19', row: 1, column: 1 },
  { date: '2023-09-26', row: 1, column: 2 },
  { date: '2023-10-03', row: 1, column: 3 },
  { date: '2023-09-20', row: 2, column: 1 },
  { date: '2023-09-27', row: 2, column: 2 }
];
test('方向键按实际格子位置移动：左右跨周，上下逐日', () => {
  assert.equal(V.nextDate(cells, '2023-09-26', 'ArrowLeft'), '2023-09-19');
  assert.equal(V.nextDate(cells, '2023-09-26', 'ArrowRight'), '2023-10-03');
  assert.equal(V.nextDate(cells, '2023-09-26', 'ArrowUp'), '2023-09-25');
  assert.equal(V.nextDate(cells, '2023-09-26', 'ArrowDown'), '2023-09-27');
});

test('边缘与空格不换行或跳到其他列，禁用日期不会获得焦点', () => {
  assert.equal(V.nextDate(cells, '2023-09-18', 'ArrowLeft'), null);
  assert.equal(V.nextDate(cells, '2023-09-25', 'ArrowUp'), null);
  assert.equal(V.nextDate(cells, '2023-10-03', 'ArrowDown'), null);
  const mondays = cells.map(cell => ({ ...cell, disabled: cell.row !== 0 }));
  assert.equal(V.nextDate(mondays, '2023-09-25', 'ArrowDown'), null);
  assert.equal(V.nextDate(mondays, '2023-09-25', 'ArrowRight'), '2023-10-02');
  const gap = cells.map(cell => ({ ...cell, disabled: cell.date === '2023-09-25' }));
  assert.equal(V.nextDate(gap, '2023-09-18', 'ArrowRight'), '2023-10-02');
});
