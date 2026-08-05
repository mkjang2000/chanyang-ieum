import { copyFile, rename, writeFile } from 'node:fs/promises';

await copyFile('app/icon.svg', 'dist/client/favicon.svg');

await rename('dist/server/index.js', 'dist/server/app.js');
await writeFile(
  'dist/server/index.js',
  "import handler from './app.js';\n\nexport default { fetch: handler };\n",
);
