import { copyFile, mkdir, access } from 'node:fs/promises';
import { constants } from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const dist = path.join(root, 'dist');
const files = ['nilimaoma.mp3', 'nilimaoma.json', 'UX.png'];

await mkdir(dist, { recursive: true });

for (const file of files) {
  const from = path.join(root, file);
  const to = path.join(dist, file);
  try {
    await access(from, constants.R_OK);
    await copyFile(from, to);
    console.log(`copied ${file}`);
  } catch {
    console.warn(`skipped ${file}: source file not found`);
  }
}
