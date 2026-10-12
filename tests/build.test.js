import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { build, root } from '../scripts/build.js';

test('双主题成品可离线运行，首页链接和图片完整', () => {
  const dist = build();
  const pages = ['paper', 'mist'].map(theme => fs.readFileSync(path.join(dist, theme + '.html'), 'utf8'));
  assert.equal(pages[0].replace('data-theme="paper"', 'data-theme="mist"'), pages[1]);
  for (const html of pages) {
    assert.doesNotMatch(html, /\{\{(?:theme|styles|scripts)\}\}/);
    assert.doesNotMatch(html, /<(?:script[^>]+src|link[^>]+rel="stylesheet")/);
    const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)];
    assert.equal(scripts.length, 1);
    assert.doesNotThrow(() => new vm.Script(scripts[0][1]));
    const ids = [...html.split('<script>')[0].matchAll(/\bid="([^"]+)"/g)].map(match => match[1]);
    assert.equal(new Set(ids).size, ids.length);
  }
  const index = fs.readFileSync(path.join(dist, 'index.html'), 'utf8');
  const links = [...index.matchAll(/(?:href|src)="([^"]+)"/g)].map(match => match[1]);
  assert.ok(links.includes('paper.html'));
  assert.ok(links.includes('mist.html'));
  for (const target of links) {
    assert.ok(!/^(?:https?:|file:|[A-Z]:)/i.test(target));
    assert.ok(fs.existsSync(path.join(dist, target)), target);
  }
});

test('业务模块可独立加载且不依赖平台适配', async () => {
  const core = await import('../src/core/index.js');
  const session = await import('../src/application/session.js');
  const state = session.createSession(core.blankConfig(2023)).getState();
  assert.equal(core.exportData(state.config).days.length, 244);
  for (const directory of ['core', 'application']) {
    for (const filename of fs.readdirSync(path.join(root, 'src', directory))) {
      const text = fs.readFileSync(path.join(root, 'src', directory, filename), 'utf8');
      assert.doesNotMatch(text, /\b(?:document|window|localStorage|fetch)\s*[.(]/);
      assert.doesNotMatch(text, /from ['"][^'"]*adapters\//);
    }
  }
});

test('项目文档与样例使用有效的本地链接', () => {
  const files = ['README.md', ...fs.readdirSync(path.join(root, 'docs')).filter(name => name.endsWith('.md')).map(name => 'docs/' + name)];
  for (const file of files) {
    const text = fs.readFileSync(path.join(root, file), 'utf8');
    for (const match of text.matchAll(/\]\(([^)]+)\)/g)) {
      const target = match[1].split('#')[0];
      if (target && !/^https?:/.test(target)) assert.ok(fs.existsSync(path.resolve(root, path.dirname(file), target)), file + ': ' + target);
    }
  }
});
