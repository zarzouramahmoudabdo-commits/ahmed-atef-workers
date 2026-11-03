import { build } from 'esbuild';
import { cpSync, mkdirSync, readFileSync } from 'node:fs';

const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
const url = process.env.SUPABASE_URL || '';
const key = process.env.SUPABASE_ANON_KEY || '';
const repo = process.env.GITHUB_REPOSITORY || 'zarzouramahmoudabdo-commits/ahmed-atef-workers';
const version = process.env.APP_VERSION || pkg.version;
if (!url || !key) console.warn('تحذير: SUPABASE_URL / SUPABASE_ANON_KEY غير مضبوطين، الدخول لن يعمل.');

mkdirSync('www', { recursive: true });
cpSync('src/index.html', 'www/index.html');
cpSync('src/style.css', 'www/style.css');
await build({
  entryPoints: ['src/app.js'],
  bundle: true,
  minify: true,
  format: 'iife',
  target: 'es2020',
  outfile: 'www/app.js',
  define: {
    __SUPABASE_URL__: JSON.stringify(url),
    __SUPABASE_ANON_KEY__: JSON.stringify(key),
    __APP_VERSION__: JSON.stringify(version),
    __REPO__: JSON.stringify(repo),
  },
});
console.log('تم البناء في www/ (الإصدار ' + version + ')');
