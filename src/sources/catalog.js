import { normalizeConfig } from '../core/index.js';
import { schoolUrl } from './zju.js';

/** 同步结果是跨端接口，页面与其他调用方均在提交配置前验证此边界。 */
export function normalizeCatalog(input) {
  if (!input || input.schemaVersion !== 1 || !Array.isArray(input.calendars) || !input.calendars.length || input.calendars.length > 100 || !Number.isFinite(Date.parse(input.checkedAt))) throw new Error('校历列表格式无效');
  const calendars = input.calendars.map(item => {
    if (!Array.isArray(item.candidates) || !item.candidates.length || item.candidates.length > 2 || typeof item.id !== 'string' || item.id.length > 200 || !/^\d{4}-\d{2}-\d{2}$/.test(item.publishedAt)) throw new Error('学校校历记录无效');
    const strings = value => {
      if (!Array.isArray(value) || value.length > 200 || value.some(text => typeof text !== 'string' || text.length > 5000)) throw new Error('校历说明无效');
      return [...value];
    };
    const candidates = item.candidates.map(candidate => {
      const config = normalizeConfig(candidate.config);
      if (config.academicYear !== item.academicYear || !config.firstMonday) throw new Error('校历学年与配置不一致');
      return { title: String(candidate.title || ''), sheet: String(candidate.sheet || ''), config,
        warnings: strings(candidate.warnings), notes: strings(candidate.notes), evidence: {
          range: String(candidate.evidence?.range || ''), firstMonday: String(candidate.evidence?.firstMonday || ''), secondExams: String(candidate.evidence?.secondExams || '')
        } };
    });
    if (new Set(candidates.map(item => item.config.half)).size !== candidates.length) throw new Error('同一校历存在重复学期');
    return { id: item.id, title: String(item.title || ''), academicYear: item.academicYear, publishedAt: item.publishedAt,
      noticeUrl: schoolUrl(item.noticeUrl), attachmentUrl: schoolUrl(item.attachmentUrl), sha256: String(item.sha256 || ''), candidates };
  });
  if (new Set(calendars.map(item => item.id)).size !== calendars.length) throw new Error('校历列表存在重复记录');
  if (!Array.isArray(input.issues || []) || (input.issues || []).some(value => typeof value !== 'string' || value.length > 5000)) throw new Error('同步提示无效');
  return { schemaVersion: 1, source: schoolUrl(input.source), checkedAt: input.checkedAt,
    status: input.status === 'partial' ? 'partial' : 'ok', issues: [...(input.issues || [])],
    calendars: calendars.sort((a, b) => b.academicYear - a.academicYear || b.publishedAt.localeCompare(a.publishedAt) || a.id.localeCompare(b.id)) };
}
