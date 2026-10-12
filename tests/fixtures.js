import { readFileSync } from 'node:fs';
export const examples = Object.fromEntries(['autumn','spring'].map(half => [half, JSON.parse(readFileSync(new URL('../examples/' + half + '.json', import.meta.url), 'utf8'))]));
