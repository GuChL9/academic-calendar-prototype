import { createSchoolSource } from './school-source.js';
import { TERMS, normalizeConfig } from '../../core/index.js';
import { escape, formatDisplayRange } from './format.js';

export function mountSchoolImport(apply, currentConfig) {
  const $ = id => document.getElementById(id), dialog = $('school-import'), source = createSchoolSource();
  let catalog = null, selected = 0, active = 0, controller = null, generation = 0, excluded = new Set();
  const shown = date => date.replaceAll('-', '/');
  const listDates = dates => dates.map(shown).join('、');
  const exclusion = (kind, index) => `${catalog.calendars[selected].id}/${active}/${kind}/${index}`;
  function showCandidate(index) {
    active = index;
    const record = catalog.calendars[selected], candidate = record.candidates[index], config = candidate.config, terms = TERMS[config.half];
    $('school-candidates').innerHTML = record.candidates.map((item, i) => `<button type="button" data-candidate="${i}" aria-pressed="${i === index}">${item.config.half === 'autumn' ? '秋冬学期' : '春夏学期'}</button>`).join('');
    const summary = [
      ['制表范围', formatDisplayRange(config.range), candidate.evidence.range],
      ['第一教学周', shown(config.firstMonday) + ' · 周一', '连续 8 + 8 周，与开课说明一致'],
      [terms[0] + '学期考试', config.firstExams.length ? listDates(config.firstExams) : '导入后补选', ''],
      [terms[1] + '学期考试', config.secondExams ? formatDisplayRange(config.secondExams) : '导入后补选', config.secondExams ? '从停课考试开始，到学生寒暑假开始前一天' : '']
    ];
    $('school-summary').innerHTML = summary.map(([label, value, hint]) => `<div><dt>${escape(label)}</dt><dd>${escape(value)}${hint ? `<small>${escape(hint)}</small>` : ''}</dd></div>`).join('');
    const row = (kind, index, label, value) => `<label class="import-record"><input type="checkbox" data-import-kind="${kind}" data-index="${index}" ${excluded.has(exclusion(kind, index)) ? '' : 'checked'}><span><strong>${escape(label)}</strong><small>${escape(value)}</small></span></label>`;
    $('school-arrangements').innerHTML = config.holidays.map((item, i) => row('holidays', i, item.name, listDates(item.dates))).join('') +
      config.adjustments.map((item, i) => row('adjustments', i, item.kind === 'swap' ? '课程对调' : '补课', item.kind === 'swap' ? `${shown(item.date)} ↔ ${shown(item.targetDate)}` : `${shown(item.date)} 补 ${shown(item.targetDate)} 的课`)).join('');
    $('school-arrangements-section').hidden = !config.holidays.length && !config.adjustments.length;
    const warnings = [...catalog.issues, ...candidate.warnings];
    $('school-notices').hidden = !warnings.length;
    $('school-notice-list').innerHTML = warnings.map(text => `<li>${escape(text)}</li>`).join('');
    $('school-origin').innerHTML = `学校发布于 ${escape(record.publishedAt)} · <a href="${escape(record.noticeUrl)}" target="_blank" rel="noopener noreferrer">发布通知</a> · <a href="${escape(record.attachmentUrl)}" target="_blank" rel="noopener noreferrer">原始 Excel</a>`;
    $('school-source').textContent = candidate.notes.join('\n');
    $('school-source-details').open = false;
    $('school-review').hidden = false;
    $('apply-school-import').disabled = !!controller;
  }
  async function refresh() {
    const version = ++generation, selectedId = catalog?.calendars[selected]?.id;
    controller?.abort(); const request = new AbortController(); controller = request;
    const signal = request.signal;
    const timer = setTimeout(() => request.abort(), 95000);
    $('refresh-school').disabled = true;
    $('apply-school-import').disabled = true;
    $('school-import-status').textContent = source.mode === 'live' ? '正在向学校同步校历…' : '正在获取学校校历列表…';
    try {
      const result = await source.load(signal);
      if (version !== generation) return;
      catalog = result.catalog; excluded = new Set();
      const config = currentConfig();
      selected = catalog.calendars.findIndex(item => item.id === selectedId);
      if (selected < 0) selected = catalog.calendars.findIndex(item => item.academicYear === config.academicYear);
      if (selected < 0) selected = 0;
      $('school-year').innerHTML = catalog.calendars.map((item, i) => `<option value="${i}">${item.academicYear}—${item.academicYear + 1}${catalog.calendars.filter(other => other.academicYear === item.academicYear).length > 1 ? ' · ' + escape(item.publishedAt) : ''}</option>`).join('');
      $('school-year').value = String(selected);
      $('school-year-field').hidden = false;
      const stamp = new Date(catalog.checkedAt).toLocaleString('zh-CN', { hour12: false });
      $('school-import-status').textContent = `${result.message ? result.message + ' ' : ''}${catalog.status === 'partial' ? '最近检查' : source.mode === 'live' ? '最近同步' : '数据同步于'} ${stamp}${catalog.status === 'partial' ? '，部分来源未能更新。' : ''}`;
      const index = catalog.calendars[selected].candidates.findIndex(item => item.config.half === config.half);
      showCandidate(Math.max(0, index));
    } catch (error) {
      if (version === generation) {
        $('school-import-status').textContent = signal.aborted ? '同步已超时，请重试。' : '暂时无法读取学校校历，请重试。';
        if (catalog) showCandidate(active);
      }
    } finally {
      clearTimeout(timer);
      if (version === generation) { $('refresh-school').disabled = false; controller = null; $('apply-school-import').disabled = !catalog; }
    }
  }
  function open() { $('more-tools').open = false; dialog.showModal(); refresh(); }
  $('import-school').onclick = open;
  $('import-school-start').onclick = open;
  $('refresh-school').onclick = refresh;
  $('close-school-import').onclick = () => dialog.close();
  dialog.addEventListener('keydown', event => { if (event.key === 'Escape') event.stopPropagation(); });
  dialog.addEventListener('close', () => { generation++; controller?.abort(); controller = null; $('refresh-school').disabled = false; });
  $('school-year').onchange = event => { selected = Number(event.target.value); showCandidate(Math.min(active, catalog.calendars[selected].candidates.length - 1)); };
  $('school-candidates').onclick = event => {
    const button = event.target.closest('[data-candidate]');
    if (button) showCandidate(Number(button.dataset.candidate));
  };
  $('school-arrangements').onchange = event => {
    const input = event.target;
    if (!input.dataset.importKind) return;
    const key = exclusion(input.dataset.importKind, input.dataset.index);
    input.checked ? excluded.delete(key) : excluded.add(key);
  };
  $('apply-school-import').onclick = () => {
    if (!catalog || controller) return;
    try {
      const config = structuredClone(catalog.calendars[selected].candidates[active].config);
      for (const kind of ['holidays', 'adjustments']) config[kind] = config[kind].filter((_, index) => !excluded.has(exclusion(kind, index)));
      apply(normalizeConfig(config)); dialog.close(); $('calendar-title').focus({ preventScroll: true });
    } catch (error) { $('school-import-status').textContent = '未导入：' + error.message; }
  };
}
