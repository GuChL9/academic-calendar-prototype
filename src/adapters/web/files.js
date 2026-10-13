import { parseConfig, TERMS } from '../../core/index.js';

export function filename(config, suffix) {
  return `${config.academicYear}-${config.academicYear + 1}-${TERMS[config.half].join('')}校历${suffix}`;
}
export function download(contents, type, name) {
  const url = URL.createObjectURL(new Blob([contents], { type }));
  const anchor = document.createElement('a');
  anchor.href = url; anchor.download = name;
  document.body.append(anchor); anchor.click(); anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 15000);
}
export async function readConfiguration(file) {
  if (file.size > 2 * 1024 * 1024) throw new Error('校历文件不能超过 2 MB');
  return parseConfig(await file.text());
}
