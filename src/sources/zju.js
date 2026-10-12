export const SCHOOL_ORIGIN = 'https://zhfw.zju.edu.cn';
export const SCHOOL_LIST = SCHOOL_ORIGIN + '/zhfw_xzwj/list1.htm';

const entities = text => text.replace(/&#(x[\da-f]+|\d+);|&(amp|lt|gt|quot|apos|nbsp);/gi, (all, number, name) => number
  ? String.fromCodePoint(number[0].toLowerCase() === 'x' ? parseInt(number.slice(1), 16) : Number(number))
  : ({ amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' })[name.toLowerCase()]);
const text = html => entities(html.replace(/<[^>]*>/g, '')).replace(/\s+/g, ' ').trim();

export function schoolUrl(value, base = SCHOOL_LIST) {
  const url = new URL(entities(value), base);
  if (url.hostname !== 'zhfw.zju.edu.cn' || url.username || url.password || url.port || !['http:', 'https:'].includes(url.protocol)) throw new Error('来源链接不属于浙大综合服务网');
  url.protocol = 'https:'; url.hash = '';
  return url.href;
}

export function readSchoolListing(html, base = SCHOOL_LIST) {
  const articles = [];
  for (const match of html.matchAll(/<li\b[^>]*>\s*<a\b[^>]*href=['"]([^'"]+)['"][^>]*>([\s\S]*?)<\/a>\s*(\d{4}-\d{2}-\d{2})\s*<\/li>/g)) {
    const title = text(match[2]);
    const year = title.normalize('NFKC').match(/浙江大学(\d{4})[-—－](\d{4})学年校历/);
    const url = year ? schoolUrl(match[1], base) : null;
    articles.push({ title, publishedAt: match[3], noticeUrl: url,
      academicYear: year && Number(year[2]) === Number(year[1]) + 1 ? Number(year[1]) : null });
  }
  if (!articles.length) throw new Error('学校通知列表为空或版式发生变化');
  return articles;
}

export function readSchoolAttachments(html, base) {
  const urls = [...html.matchAll(/<a\b[^>]*href=['"]([^'"]+\.xlsx(?:\?[^'"]*)?)['"][^>]*>/gi)].map(match => schoolUrl(match[1], base));
  return [...new Set(urls)];
}
