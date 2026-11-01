// Copies the login library into public/ so the app can open offline.
import { copyFile } from 'node:fs/promises';
await copyFile(new URL('../node_modules/@supabase/supabase-js/dist/umd/supabase.js', import.meta.url), new URL('../public/vendor/supabase.js', import.meta.url));
console.log('Copied supabase.js');
