import { normalizeCatalog } from '../../sources/catalog.js';

export function createSchoolSource() {
  const settings = JSON.parse(document.getElementById('school-source-settings').textContent);
  const embedded = () => normalizeCatalog(JSON.parse(document.getElementById('school-source-catalog').textContent));
  let cached = embedded();
  return { mode: settings.mode, async load(signal) {
    if (location.protocol === 'file:') return { catalog: embedded(), message: '离线模式，使用随程序保存的校历。' };
    try {
      const response = await fetch(settings.url, { cache: 'no-store', signal, headers: { Accept: 'application/json' } });
      if (!response.ok) throw new Error('同步服务暂不可用');
      const text = await response.text();
      if (text.length > 2 * 1024 * 1024) throw new Error('校历列表过大');
      cached = normalizeCatalog(JSON.parse(text));
      return { catalog: cached, message: '' };
    } catch (error) {
      if (signal.aborted) throw error;
      return { catalog: cached, message: '本次更新失败，显示已保存的校历，可稍后重试。' };
    }
  } };
}
