import fs from 'node:fs';
import path from 'node:path';

/** 将项目内部的静态 ES 模块按依赖顺序封装，生成可离线打开的单文件脚本。 */
export function bundle(entry, root) {
  const modules = [], visited = new Set(), active = new Set();
  const id = file => path.relative(root, file).replaceAll(path.sep, '/');
  function visit(file) {
    if (active.has(file)) throw new Error('模块循环依赖：' + id(file));
    if (visited.has(file)) return;
    if (!file.startsWith(root + path.sep)) throw new Error('模块必须位于项目中');
    active.add(file);
    let source = fs.readFileSync(file, 'utf8');
    const named = [], spreads = [];
    source = source.replace(/^import (.+?) from ['"](.+?)['"];?$/gm, (_, bindings, specifier) => {
      if (!specifier.startsWith('.')) throw new Error('离线脚本只支持项目内模块');
      const dependency = path.resolve(path.dirname(file), specifier);
      visit(dependency);
      if (bindings.startsWith('* as ')) return `const ${bindings.slice(5)} = modules[${JSON.stringify(id(dependency))}];`;
      return `const ${bindings.replace(/\b(\w+) as (\w+)\b/g, '$1: $2')} = modules[${JSON.stringify(id(dependency))}];`;
    });
    source = source.replace(/^export \* from ['"](.+?)['"];?$/gm, (_, specifier) => {
      const dependency = path.resolve(path.dirname(file), specifier);
      visit(dependency); spreads.push(`...modules[${JSON.stringify(id(dependency))}]`);
      return '';
    });
    source = source.replace(/^export (async )?(function|const|let|class) (\w+)/gm, (_, asyncWord = '', kind, name) => {
      named.push(name); return `${asyncWord}${kind} ${name}`;
    });
    if (/^\s*(?:import|export)\s/m.test(source)) throw new Error('存在未处理的模块语法：' + id(file));
    modules.push(`modules[${JSON.stringify(id(file))}] = (() => {\n${source}\nreturn {${[...spreads, ...named].join(', ')}};\n})();`);
    active.delete(file); visited.add(file);
  }
  visit(entry);
  return `'use strict';\n(() => {\nconst modules = Object.create(null);\n${modules.join('\n\n')}\n})();\n`;
}
