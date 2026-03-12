// Wrapper: change to backend directory, then launch tsx watch
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { chdir } from 'process';

const __dirname = dirname(fileURLToPath(import.meta.url));
chdir(join(__dirname, 'backend'));

// Pass args: watch src/index.ts
process.argv.push('watch', 'src/index.ts');
await import('./backend/node_modules/tsx/dist/cli.mjs');
