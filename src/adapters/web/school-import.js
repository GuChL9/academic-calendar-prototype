import { createSchoolSource } from './school-source.js';

/** 在新建入口选择学期，读取后进入统一的逐步核对流程。过期请求不覆盖用户当前的选择。 */
export function mountSchoolImport(apply, currentState) {
  const $ = id => document.getElementById(id), source = createSchoolSource();
  let controller = null, generation = 0, offered = null, selection = '';
  const identity = state => `${state.yearInput}/${state.halfInput}`;
  function reset() {
    generation++; controller?.abort(); controller = null; offered = null;
    $('import-school-start').disabled = false;
    $('import-school-start').textContent = '导入浙大校历';
    $('school-import-status').hidden = true;
    $('school-import-feedback').hidden = true;
    $('use-saved-school').hidden = true;
  }
  function update(state) {
    if (state.step !== 0 || state.finished || selection !== identity(state)) reset();
    selection = identity(state);
  }
  function use(result, record, candidate) {
    const catalog = result.catalog;
    const sourceInfo = { academicYear: record.academicYear, half: candidate.config.half, noticeUrl: record.noticeUrl,
      attachmentUrl: record.attachmentUrl, publishedAt: record.publishedAt, checkedAt: catalog.checkedAt,
      stale: catalog.status === 'partial' || result.fallback === true, warnings: candidate.warnings, notes: candidate.notes };
    reset();
    apply(candidate.config, sourceInfo);
  }
  async function start() {
    reset();
    const state = currentState(), year = Number(state.yearInput), half = state.halfInput;
    if (!Number.isInteger(year) || year < 1900 || year > 2198) {
      $('school-import-status').textContent = '请输入 1900—2198 之间的学年起始年。';
      $('school-import-status').hidden = false; return;
    }
    const version = generation, chosen = identity(state), request = new AbortController();
    controller = request;
    const timer = setTimeout(() => request.abort(), 95000);
    $('import-school-start').disabled = true;
    $('import-school-start').textContent = source.mode === 'live' ? '正在同步…' : '正在读取…';
    $('school-import-status').hidden = false;
    $('school-import-status').textContent = source.mode === 'live' ? '正在向学校获取校历…' : '正在读取学校校历…';
    try {
      const result = await source.load(request.signal);
      if (version !== generation || currentState().step !== 0 || identity(currentState()) !== chosen) return;
      const record = result.catalog.calendars.find(item => item.academicYear === year);
      const candidate = record?.candidates.find(item => item.config.half === half);
      if (!candidate) {
        const years = [...new Set(result.catalog.calendars.map(item => item.academicYear))];
        $('school-import-status').textContent = `${year}—${year + 1} 暂无可导入校历，可自行制表。已有学年：${years.join('、')}。`;
        $('school-import-feedback').hidden = false;
      } else if (result.catalog.status === 'partial' || result.fallback) {
        // 同步失败时由用户选择是否采用旧目录，避免把旧版本当成最新结果直接导入。
        offered = { result, record, candidate, chosen };
        $('school-import-status').textContent = '本次同步未完成，可使用已保存的校历。';
        $('school-import-feedback').hidden = false;
        $('use-saved-school').hidden = false;
      } else use(result, record, candidate);
    } catch {
      if (version === generation) {
        $('school-import-status').textContent = request.signal.aborted ? '同步超时，请重试或自行制表。' : '暂时无法读取学校校历，请重试或自行制表。';
        $('school-import-feedback').hidden = false;
      }
    } finally {
      clearTimeout(timer);
      if (version === generation) {
        controller = null; $('import-school-start').disabled = false; $('import-school-start').textContent = '重新同步';
        $('school-import-feedback').hidden = !offered;
      }
    }
  }
  $('import-school-start').onclick = start;
  $('use-saved-school').onclick = () => {
    if (offered && offered.chosen === identity(currentState()) && currentState().step === 0) use(offered.result, offered.record, offered.candidate);
  };
  update(currentState());
  return { update, cancel: reset };
}
