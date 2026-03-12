// Wrapper: change to frontend directory, then launch Vite
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { chdir } from 'process';

const __dirname = dirname(fileURLToPath(import.meta.url));
chdir(join(__dirname, 'frontend'));

await import('./frontend/node_modules/vite/bin/vite.js');
