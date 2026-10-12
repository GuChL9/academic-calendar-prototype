import { createHash } from 'node:crypto';
import { readSchoolWorkbook } from './xlsx.js';
import { recognizeZjuWorkbook } from '../../import/zju-workbook.js';
import { normalizeCatalog } from '../../sources/catalog.js';
import { schoolUrl, SCHOOL_LIST, SCHOOL_ORIGIN, readSchoolListing, readSchoolAttachments } from '../../sources/zju.js';

export function createSchoolFetcher(fetchImpl = globalThis.fetch) {
  return async (source, signal) => {
    let url = schoolUrl(source);
    const timeout = AbortSignal.timeout(20000), limited = signal ? AbortSignal.any([signal, timeout]) : timeout;
    for (let hop = 0; hop < 4; hop++) {
      const response = await fetchImpl(url, { redirect: 'manual', signal: limited, headers: { 'User-Agent': 'academic-calendar/1.0 (+https://github.com/GuChL9/academic-calendar)' } });
      if ([301, 302, 303, 307, 308].includes(response.status)) {
        const location = response.headers.get('location');
        await response.body?.cancel();
        if (!location) throw new Error('学校来源返回空跳转');
        const target = new URL(location, url);
        try { url = schoolUrl(target.href); }
        catch { throw new Error(`学校来源跳转至 ${target.origin}，不属于已配置的校历来源`); }
        continue;
      }
      if (!response.ok) { await response.body?.cancel(); throw new Error(`学校来源暂不可用 (${response.status})`); }
      if (Number(response.headers.get('content-length')) > 5 * 1024 * 1024) { await response.body?.cancel(); throw new Error('学校附件超出读取大小'); }
      const reader = response.body.getReader(), chunks = []; let size = 0;
      try {
        while (true) {
          const { done, value } = await reader.read(); if (done) break;
          size += value.length;
          if (size > 5 * 1024 * 1024) throw new Error('学校附件超出读取大小');
          chunks.push(value);
        }
      } finally { await reader.cancel(); }
      return Buffer.concat(chunks);
    }
    throw new Error('学校来源跳转次数过多');
  };
}

/** 定时同步、实时服务和命令行共用此流程。单条来源失败时保留已有有效版本并标明问题。 */
export async function syncSchoolCalendars({ previous = null, fetchBytes = createSchoolFetcher(), now = new Date(), signal, maxPages = 50, oldestYear = 2023 } = {}) {
  const prior = previous ? normalizeCatalog(previous) : { calendars: [] };
  const existing = new Map(prior.calendars.map(item => [item.id, item]));
  const notices = new Map(prior.calendars.map(item => [item.noticeUrl.replace(/\.psp$/, '.htm'), item]));
  const issues = [];
  const cutoff = prior.calendars.length ? prior.calendars.map(item => item.publishedAt).sort().at(-1) : `${oldestYear}-01-01`;
  let reached = false;
  try {
    for (let page = 1; page <= maxPages; page++) {
      signal?.throwIfAborted();
      const url = `${SCHOOL_ORIGIN}/zhfw_xzwj/list${page}.htm`;
      const articles = readSchoolListing(new TextDecoder().decode(await fetchBytes(url, signal)), url);
      for (const article of articles.filter(item => item.academicYear >= oldestYear)) notices.set(article.noticeUrl.replace(/\.psp$/, '.htm'), article);
      if (articles.some(item => item.publishedAt <= cutoff)) { reached = true; break; }
    }
    if (!reached) issues.push('已达到列表扫描上限，较早发布记录需要后续同步。');
  } catch (error) {
    if (signal?.aborted) throw error;
    issues.push(`通知列表同步失败：${error.message}`);
  }
  for (const notice of notices.values()) {
    signal?.throwIfAborted();
    try {
      const html = new TextDecoder().decode(await fetchBytes(notice.noticeUrl, signal));
      const attachments = readSchoolAttachments(html, notice.noticeUrl);
      if (attachments.length !== 1) throw new Error(attachments.length ? '通知含多份 Excel 附件，需要核对版本' : '通知未提供 Excel 校历附件');
      const bytes = await fetchBytes(attachments[0], signal), sha256 = createHash('sha256').update(bytes).digest('hex');
      const { candidates, errors } = recognizeZjuWorkbook(readSchoolWorkbook(bytes));
      if (errors.length || candidates.length !== 2 || candidates.some(item => item.config.academicYear !== notice.academicYear)) throw new Error(errors.join('；') || '附件学年或两个学期不完整');
      const id = `zju-${notice.academicYear}-${notice.noticeUrl.match(/a(\d+)\//)?.[1] || sha256.slice(0, 12)}`;
      existing.set(id, { id, title: notice.title, academicYear: notice.academicYear, publishedAt: notice.publishedAt,
        noticeUrl: notice.noticeUrl, attachmentUrl: attachments[0], sha256, candidates });
    } catch (error) {
      if (signal?.aborted) throw error;
      issues.push(`${notice.academicYear}—${notice.academicYear + 1}：${error.message}，已有版本保留。`);
    }
  }
  if (!existing.size) throw new Error(issues.join('；') || '学校暂未提供可导入的校历');
  return normalizeCatalog({ schemaVersion: 1, source: SCHOOL_LIST, checkedAt: now.toISOString(),
    status: issues.length ? 'partial' : 'ok', issues, calendars: [...existing.values()] });
}

/** 服务端调用入口。并发请求合并，短时间重复打开复用刚完成的结果。 */
export function createSchoolCalendarService({ initial, save = async () => {}, minIntervalMs = 60000, ...options } = {}) {
  let catalog = initial ? normalizeCatalog(initial) : null, pending = null, refreshedAt = 0;
  return { async refresh() {
    if (pending) return pending;
    if (catalog && Date.now() - refreshedAt < minIntervalMs) return structuredClone(catalog);
    pending = syncSchoolCalendars({ ...options, previous: catalog, signal: options.signal || AbortSignal.timeout(90000) }).then(async result => {
      await save(result); catalog = result; refreshedAt = Date.now(); return structuredClone(result);
    }).finally(() => { pending = null; });
    return pending;
  } };
}
