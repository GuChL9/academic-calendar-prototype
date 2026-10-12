import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { blankConfig, addDays, exportData, parseConfig, generateCalendar } from '../src/core/index.js';
import { createSession, previewConfig } from '../src/application/session.js';
import { createStorage } from '../src/adapters/web/storage.js';
import { examples } from './fixtures.js';

test('两学期从空表走完七步，草稿、保存、撤销与重新打开保持一致', () => {
  for (const config of Object.values(examples)) {
    const session = createSession(blankConfig(config.academicYear, config.half));
    const act = (type, extra = {}) => session.dispatch({ type, ...extra });
    const pick = date => act('select-date', { date });
    act('manual-start');
    pick(config.range.end); pick(config.range.start);
    assert.equal(previewConfig(session.getState()).range.start, config.canvasRange.start);
    act('next');
    assert.deepEqual(session.getState().config.range, config.range);
    pick(config.firstMonday); act('next');
    for (const date of config.firstExams) pick(date);
    act('next'); pick(config.secondExams.end); pick(config.secondExams.start);
    assert.deepEqual(session.getState().config, config);
    act('next'); act('holiday-custom'); act('holiday-name', { value:'测试假期' });
    const date = addDays(config.firstMonday, 10);
    pick(date);
    assert.equal(generateCalendar(previewConfig(session.getState())).days.find(day => day.date === date).isHoliday, true);
    assert.equal(exportData(session.getState().config).days.find(day => day.date === date).isHoliday, false);
    assert.throws(() => act('next'), /先保存/);
    act('holiday-save'); act('next');
    pick(date); pick(addDays(date, 1)); act('adjustment-save');
    act('adjustment-kind', { kind:'makeup' });
    pick(addDays(date, 2)); pick(addDays(date, 1)); act('adjustment-save');
    const complete = act('next');
    assert.equal(complete.finished, true);
    assert.equal(exportData(complete.config).status.complete, true);
    const at = day => exportData(complete.config).days.find(item => item.date === day);
    assert.equal(at(date).effectiveScheduleDate, addDays(date, 1));
    assert.equal(at(addDays(date, 1)).effectiveScheduleDate, date);
    assert.equal(at(addDays(date, 2)).effectiveScheduleDate, addDays(date, 1));
    assert.equal(at(date).isHoliday, true);
    assert.deepEqual(parseConfig(JSON.stringify(exportData(complete.config))), complete.config);

    const entries = new Map(), storage = createStorage({ getItem:key => entries.get(key), setItem:(key,value) => entries.set(key,value) });
    storage.saveConfig(complete.config); storage.saveView(complete);
    const loaded = storage.load(blankConfig()), reopened = createSession(loaded.config, loaded.view).getState();
    assert.deepEqual(reopened.config, complete.config);
    assert.equal(reopened.finished, true);
    assert.deepEqual(reopened.adjustment.dates, []);
    assert.equal(reopened.history.length, 0);

    act('new-calendar'); act('manual-start');
    const restored = act('undo');
    assert.deepEqual(restored.config, complete.config);
    assert.deepEqual(restored.adjustment.dates, []);
  }
});

test('全部收录学校校历逐步核对与再次导入不改写日期和安排', () => {
  const catalog = JSON.parse(fs.readFileSync(new URL('../data/zju-calendars.json', import.meta.url)));
  for (const record of catalog.calendars) for (const candidate of record.candidates) {
    const config = candidate.config, session = createSession(blankConfig());
    session.dispatch({ type:'school-import', config });
    for (let i = 0; i < 6; i++) session.dispatch({ type:'next' });
    const completed = session.getState();
    assert.equal(completed.finished, true);
    assert.equal(completed.history.length, 1);
    assert.deepEqual(completed.config, config);
    assert.deepEqual(exportData(completed.config), exportData(config));
    session.dispatch({ type:'import', config:parseConfig(JSON.stringify(exportData(config))) });
    assert.equal(session.getState().finished, false);
    assert.equal(session.getState().history.length, 1);
    assert.deepEqual(session.getState().config, config);
  }
});
