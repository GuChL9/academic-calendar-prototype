import { inflateRawSync } from 'node:zlib';
import path from 'node:path';
import { crc32 } from '../../export/zip.js';

export function xmlText(text) {
  return text.replace(/&#(x[\da-f]+|\d+);|&(amp|lt|gt|quot|apos);/gi, (all, number, name) => number
    ? String.fromCodePoint(number[0].toLowerCase() === 'x' ? parseInt(number.slice(1), 16) : Number(number))
    : ({ amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" })[name.toLowerCase()]);
}
const attrs = text => Object.fromEntries([...text.matchAll(/([\w:]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)].map(m => [m[1], xmlText(m[2] ?? m[3])]));
const strings = xml => [...xml.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)].map(m => xmlText(m[1])).join('');
export function cellAddress(reference) {
  const match = reference.match(/^([A-Z]+)([1-9]\d*)$/);
  if (!match) throw new Error('Excel 单元格地址无效');
  const column = [...match[1]].reduce((n, char) => n * 26 + char.charCodeAt(0) - 64, 0);
  return { row: Number(match[2]), column };
}

/** 读取 XLSX 的数据部分。解压限额与 CRC 校验先于 XML 解析，不执行公式或外部关系。 */
export function readSchoolWorkbook(input) {
  const data = Buffer.from(input);
  if (data.length > 5 * 1024 * 1024 || data.length < 22) throw new Error('学校 Excel 文件大小不符合读取范围');
  let end = -1;
  for (let i = data.length - 22; i >= Math.max(0, data.length - 65557); i--) {
    if (data.readUInt32LE(i) === 0x06054b50 && i + 22 + data.readUInt16LE(i + 20) === data.length) { end = i; break; }
  }
  if (end < 0 || data.readUInt16LE(end + 4) || data.readUInt16LE(end + 6)) throw new Error('附件不是支持的 XLSX 文件');
  const count = data.readUInt16LE(end + 10), files = new Map();
  if (count > 512) throw new Error('Excel 文件条目过多');
  let cursor = data.readUInt32LE(end + 16), total = 0;
  for (let i = 0; i < count; i++) {
    if (cursor + 46 > end || data.readUInt32LE(cursor) !== 0x02014b50) throw new Error('Excel ZIP 目录损坏');
    const flags = data.readUInt16LE(cursor + 8), method = data.readUInt16LE(cursor + 10);
    const crc = data.readUInt32LE(cursor + 16), size = data.readUInt32LE(cursor + 20), length = data.readUInt32LE(cursor + 24);
    const nameLength = data.readUInt16LE(cursor + 28), extra = data.readUInt16LE(cursor + 30), comment = data.readUInt16LE(cursor + 32);
    const offset = data.readUInt32LE(cursor + 42), name = data.subarray(cursor + 46, cursor + 46 + nameLength).toString('utf8');
    total += length;
    if ((flags & 1) || ![0, 8].includes(method) || length > 8 * 1024 * 1024 || total > 30 * 1024 * 1024 || files.has(name)) throw new Error('Excel 压缩内容不符合读取范围');
    if (offset + 30 > cursor || data.readUInt32LE(offset) !== 0x04034b50) throw new Error('Excel ZIP 文件头损坏');
    const start = offset + 30 + data.readUInt16LE(offset + 26) + data.readUInt16LE(offset + 28);
    if (start + size > cursor) throw new Error('Excel ZIP 内容被截断');
    const zipped = data.subarray(start, start + size);
    const content = method === 8 ? inflateRawSync(zipped, { maxOutputLength: 8 * 1024 * 1024 }) : zipped;
    if (content.length !== length || crc32(content) !== crc) throw new Error('Excel 文件校验失败');
    files.set(name, content.toString('utf8'));
    cursor += 46 + nameLength + extra + comment;
  }
  const xml = name => {
    const content = files.get(name);
    if (content === undefined || /<!DOCTYPE|<!ENTITY/i.test(content)) throw new Error('Excel XML 内容不受支持');
    return content;
  };
  const book = xml('xl/workbook.xml'), relationships = xml('xl/_rels/workbook.xml.rels');
  const rels = new Map([...relationships.matchAll(/<Relationship\b([^>]+)\/?\s*>/g)].map(m => { const a = attrs(m[1]); return [a.Id, a]; }));
  const shared = files.has('xl/sharedStrings.xml') ? [...xml('xl/sharedStrings.xml').matchAll(/<si\b[^>]*>([\s\S]*?)<\/si>/g)].map(m => strings(m[1])) : [];
  const styles = files.has('xl/styles.xml') ? xml('xl/styles.xml') : '';
  const formats = new Map([...styles.matchAll(/<numFmt\b([^>]+)\/?\s*>/g)].map(m => { const a = attrs(m[1]); return [a.numFmtId, a.formatCode]; }));
  const xfs = [...(styles.match(/<cellXfs\b[^>]*>([\s\S]*?)<\/cellXfs>/)?.[1] || '').matchAll(/<xf\b([^>]+)>/g)].map(m => attrs(m[1]));
  const date1904 = /<workbookPr\b[^>]*date1904="(?:1|true)"/.test(book);
  return [...book.matchAll(/<sheet\b([^>]+)\/?\s*>/g)].map(match => {
    const sheet = attrs(match[1]), relation = rels.get(sheet['r:id']);
    if (!relation || relation.TargetMode === 'External' || /[\\:]|\.\./.test(relation.Target)) throw new Error('Excel 工作表关系无效');
    const target = relation.Target.startsWith('/') ? relation.Target.slice(1) : path.posix.join('xl', relation.Target);
    const content = xml(target), cells = [];
    for (const match of content.matchAll(/<c\b([^>]*[^/])>([\s\S]*?)<\/c>/g)) {
      const cell = attrs(match[1]), body = match[2], raw = body.match(/<v\b[^>]*>([\s\S]*?)<\/v>/)?.[1];
      if (raw === undefined && cell.t !== 'inlineStr') continue;
      const value = cell.t === 's' ? shared[Number(raw)] : cell.t === 'inlineStr' ? strings(body) : cell.t === 'str' ? xmlText(raw) : Number(raw);
      if (value === undefined || (typeof value === 'number' && !Number.isFinite(value))) throw new Error('Excel 单元格内容无效');
      const formatId = xfs[Number(cell.s || 0)]?.numFmtId || '0';
      cells.push({ ...cellAddress(cell.r), reference: cell.r, value, formatId: Number(formatId), format: formats.get(formatId) || '' });
      if (cells.length > 10000) throw new Error('工作表超出校历规模');
    }
    return { name: sheet.name, date1904, cells, merges: [...content.matchAll(/<mergeCell\b[^>]*ref="([^"]+)"/g)].map(m => {
      const [start, end = start] = m[1].split(':'); return { start: cellAddress(start), end: cellAddress(end) };
    }) };
  });
}
