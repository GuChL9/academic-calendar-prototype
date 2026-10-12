import { schoolUrl } from '../sources/zju.js';

/** 来源随制表会话保存，保留学校原文；用户编辑后的日期仍以 config 为准。 */
export function schoolReview(input, config) {
  if (!input) return null;
  if (input.academicYear !== config.academicYear || input.half !== config.half) throw new Error('学校来源与当前学期不一致');
  const lines = value => {
    if (!Array.isArray(value) || value.length > 200 || value.some(text => typeof text !== 'string' || text.length > 5000)) throw new Error('学校说明格式无效');
    return [...value];
  };
  if (!Number.isFinite(Date.parse(input.checkedAt)) || !/^\d{4}-\d{2}-\d{2}$/.test(input.publishedAt)) throw new Error('学校来源日期无效');
  return { academicYear: input.academicYear, half: input.half, noticeUrl: schoolUrl(input.noticeUrl),
    attachmentUrl: schoolUrl(input.attachmentUrl), publishedAt: input.publishedAt, checkedAt: input.checkedAt,
    stale: input.stale === true, warnings: lines(input.warnings), notes: lines(input.notes) };
}
