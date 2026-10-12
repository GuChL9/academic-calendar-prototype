/** STORE 模式的 ZIP 编码器，使用端可直接生成完整文件。 */
const enc = new TextEncoder();
export function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) { crc ^= byte; for (let i = 0; i < 8; i++) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1)); }
  return (crc ^ 0xffffffff) >>> 0;
}
export function zip(files) {
  const local = [], directory = []; let offset = 0;
  const header = (size, values) => { const b = new Uint8Array(size), v = new DataView(b.buffer); for (const [i, n, x] of values) n === 4 ? v.setUint32(i, x, true) : v.setUint16(i, x, true); return b; };
  for (const [name, content] of Object.entries(files)) {
    const n = enc.encode(name), b = enc.encode(content), crc = crc32(b);
    const h = header(30, [[0,4,0x04034b50],[4,2,20],[6,2,0x800],[12,2,33],[14,4,crc],[18,4,b.length],[22,4,b.length],[26,2,n.length]]);
    local.push(h, n, b);
    const d = header(46, [[0,4,0x02014b50],[4,2,20],[6,2,20],[8,2,0x800],[14,2,33],[16,4,crc],[20,4,b.length],[24,4,b.length],[28,2,n.length],[42,4,offset]]);
    directory.push(d, n); offset += h.length + n.length + b.length;
  }
  const dirSize = directory.reduce((n, b) => n + b.length, 0), count = Object.keys(files).length;
  const end = header(22, [[0,4,0x06054b50],[8,2,count],[10,2,count],[12,4,dirSize],[16,4,offset]]);
  const all = [...local, ...directory, end], output = new Uint8Array(offset + dirSize + end.length);
  let cursor = 0; for (const b of all) { output.set(b, cursor); cursor += b.length; }
  return output;
}
