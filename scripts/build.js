import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { bundle } from './bundle.js';

export const root = fileURLToPath(new URL('../', import.meta.url));
export function build() {
  const directory = path.join(root, 'dist');
  fs.mkdirSync(path.join(directory, 'assets'), { recursive: true });
  const template = fs.readFileSync(path.join(root, 'web/calendar.html'), 'utf8');
  const styles = ['base', 'themes', 'motion'].map(name => '<style>\n' + fs.readFileSync(path.join(root, `web/styles/${name}.css`), 'utf8') + '\n</style>').join('\n');
  const script = bundle(path.join(root, 'src/adapters/web/main.js'), path.resolve(root));
  for (const theme of ['paper', 'mist']) {
    const html = template.replace('{{theme}}', theme).replace('{{styles}}', () => styles)
      .replace('{{scripts}}', () => '<script>\n' + script.replace(/<\/script/gi, '<\\/script') + '\n</script>');
    fs.writeFileSync(path.join(directory, theme + '.html'), html);
  }
  fs.copyFileSync(path.join(root, 'web/index.html'), path.join(directory, 'index.html'));
  for (const file of fs.readdirSync(path.join(root, 'web/assets'))) fs.copyFileSync(path.join(root, 'web/assets', file), path.join(directory, 'assets', file));
  fs.writeFileSync(path.join(directory, '.nojekyll'), '');
  return directory;
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) console.log('已生成：' + build());
