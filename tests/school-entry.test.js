import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { mountSchoolImport } from '../src/adapters/web/school-import.js';

const catalog = JSON.parse(fs.readFileSync(new URL('../data/zju-calendars.json', import.meta.url)));
function setup(t, fetchResult) {
  const globals = ['document', 'location', 'fetch'].map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]);
  t.after(() => { for (const [key, descriptor] of globals) descriptor ? Object.defineProperty(globalThis, key, descriptor) : delete globalThis[key]; });
  const nodes = Object.fromEntries(['import-school-start', 'school-import-status', 'school-import-feedback', 'use-saved-school', 'school-source-settings', 'school-source-catalog'].map(id => [id, { hidden: true, textContent: '' }]));
  nodes['school-source-settings'].textContent = JSON.stringify({ mode: 'live', url: '/api/school-calendars' });
  nodes['school-source-catalog'].textContent = JSON.stringify(catalog);
  globalThis.document = { getElementById: id => nodes[id] };
  globalThis.location = { protocol: 'https:' };
  globalThis.fetch = fetchResult;
  const state = { step: 0, finished: false, yearInput: 2026, halfInput: 'autumn' }, applied = [];
  const entry = mountSchoolImport((config, source) => applied.push({ config, source }), () => state);
  return { nodes, state, applied, entry };
}

test('导入读取所选学期，来源和预填配置一起交给核对流程', async t => {
  const { nodes, state, applied } = setup(t, async () => new Response(JSON.stringify(catalog)));
  state.halfInput = 'spring';
  await nodes['import-school-start'].onclick();
  assert.equal(applied.length, 1); assert.equal(applied[0].config.half, 'spring');
  assert.equal(applied[0].source.half, 'spring'); assert.ok(applied[0].source.notes.length);
});

test('晚到的同步结果不覆盖已经切换的学期或手工制表', async t => {
  let resolve;
  const { nodes, state, applied, entry } = setup(t, () => new Promise(done => { resolve = done; }));
  const pending = nodes['import-school-start'].onclick();
  state.halfInput = 'spring'; entry.update(state);
  state.step = 1; entry.update(state);
  resolve(new Response(JSON.stringify(catalog))); await pending;
  assert.equal(applied.length, 0); assert.equal(nodes['school-import-status'].hidden, true);
});

test('同步失败保留当前工作，明确选择后才使用保存目录', async t => {
  const { nodes, applied } = setup(t, async () => { throw new Error('offline'); });
  await nodes['import-school-start'].onclick();
  assert.equal(applied.length, 0); assert.equal(nodes['use-saved-school'].hidden, false);
  assert.equal(nodes['import-school-start'].textContent, '重新同步');
  nodes['use-saved-school'].onclick();
  assert.equal(applied.length, 1); assert.equal(applied[0].source.stale, true);
});

test('未收录的学年给出可用选择，不替换当前配置', async t => {
  const { nodes, state, applied } = setup(t, async () => new Response(JSON.stringify(catalog)));
  state.yearInput = 1900;
  await nodes['import-school-start'].onclick();
  assert.equal(applied.length, 0); assert.match(nodes['school-import-status'].textContent, /1900—1901 暂无/);
});
