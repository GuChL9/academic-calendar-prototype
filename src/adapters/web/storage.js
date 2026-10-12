import { parseConfig } from '../../core/index.js';
import { readState, saveState } from '../../application/preferences.js';

const CONFIG_KEY = 'academic-calendar-visual-v1';
const VIEW_KEY = CONFIG_KEY + '-view';

/** 存储接口集中在适配层，计算与制表流程可使用宿主应用提供的其他存储。 */
export function createStorage(storage) {
  return {
    load(fallback) {
      let config = fallback, restored = false, readable = true;
      try {
        const saved = storage.getItem(CONFIG_KEY);
        if (saved) { config = parseConfig(saved); restored = true; }
      } catch { readable = false; }
      return { config, view: readState(storage, VIEW_KEY, config, 7), restored, readable };
    },
    saveConfig(config) {
      try { storage.setItem(CONFIG_KEY, JSON.stringify(config)); return true; }
      catch { return false; }
    },
    saveView(state) {
      return saveState(storage, VIEW_KEY, state.config, { currentStep: state.step, compact: state.compact, finished: state.finished });
    }
  };
}
