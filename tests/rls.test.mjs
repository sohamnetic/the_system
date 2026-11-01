// Runs the real database rules in a local Postgres and checks that one person can never reach another's data.
import { PGlite } from '@electric-sql/pglite';
import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';

const A = '00000000-0000-0000-0000-00000000000a';
const B = '00000000-0000-0000-0000-00000000000b';
const db = new PGlite();

// The parts of Supabase that the migration builds on.
await db.exec(`
  create role authenticated nologin; create role anon nologin; create role service_role nologin bypassrls;
  alter default privileges in schema public grant execute on functions to anon, authenticated, service_role;
  create schema auth; create schema storage;
  create table auth.users (id uuid primary key);
  create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('test.uid', true), '')::uuid $$;
  create table storage.buckets (id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
  create table storage.objects (id serial primary key, bucket_id text, name text, created_at timestamptz default now());
  alter table storage.objects enable row level security;
  create function storage.foldername(name text) returns text[] language sql immutable as $$ select (string_to_array(name, '/'))[1:array_length(string_to_array(name, '/'), 1) - 1] $$;
  grant usage on schema auth, storage, public to authenticated;
  grant all on storage.objects to authenticated; grant usage on sequence storage.objects_id_seq to authenticated;
  grant execute on function auth.uid() to authenticated;
`);
await db.exec(await readFile(new URL('../supabase/migrations/001_init.sql', import.meta.url), 'utf8'));
await db.query(`insert into auth.users values ($1), ($2)`, [A, B]);

const as = async (uid, fn) => {
  await db.exec(`set test.uid = '${uid}'; set role authenticated;`);
  try { return await fn(); } finally { await db.exec(`reset role; set test.uid = '';`); }
};
const denied = async (promise, label) => { await assert.rejects(promise, /row-level security|permission denied/, label); };
let checks = 0; const ok = (cond, label) => { assert.ok(cond, label); checks++; console.log('  pass:', label); };

await as(A, () => db.query(`insert into player_docs (user_id, key, body) values ($1, 'state', '{"name":"A"}')`, [A]));
await as(B, () => db.query(`insert into player_docs (user_id, key, body) values ($1, 'state', '{"name":"B"}')`, [B]));

let r = await as(A, () => db.query(`select body->>'name' n from player_docs`));
ok(r.rows.length === 1 && r.rows[0].n === 'A', 'A only sees their own progress');
r = await as(B, () => db.query(`update player_docs set body = '{"name":"hacked"}' where user_id = $1`, [A]));
ok(r.affectedRows === 0, 'B cannot overwrite progress belonging to A');
r = await as(B, () => db.query(`delete from player_docs where user_id = $1`, [A]));
ok(r.affectedRows === 0, 'B cannot delete progress belonging to A');
await denied(as(B, () => db.query(`insert into player_docs (user_id, key, body) values ($1, 'x', '{}')`, [A])), 'insert as other');
ok(true, 'B cannot create progress under the account of A');
await denied(as(B, () => db.query(`update player_docs set user_id = $1 where user_id = $2`, [A, B])), 'move row');
ok(true, 'B cannot move a row onto the account of A');
r = await db.query(`select body->>'name' n from player_docs where user_id = $1`, [A]);
ok(r.rows[0].n === 'A', 'progress belonging to A is unchanged');

await as(A, () => db.query(`insert into push_subscriptions (endpoint, user_id, p256dh, auth) values ('https://push/a', $1, 'k', 'a')`, [A]));
r = await as(B, () => db.query(`select * from push_subscriptions`));
ok(r.rows.length === 0, 'B cannot read device subscriptions belonging to A');
await as(A, () => db.query(`insert into notification_prefs (user_id, enabled) values ($1, true)`, [A]));
r = await as(B, () => db.query(`select * from notification_prefs`));
ok(r.rows.length === 0, 'B cannot read reminder settings belonging to A');

await as(A, () => db.query(`insert into storage.objects (bucket_id, name) values ('proofs', $1)`, [`${A}/p.jpg`]));
r = await as(B, () => db.query(`select * from storage.objects`));
ok(r.rows.length === 0, 'B cannot see proof photos belonging to A');
r = await as(A, () => db.query(`select * from storage.objects`));
ok(r.rows.length === 1, 'A can see their own proof photos');
await denied(as(B, () => db.query(`insert into storage.objects (bucket_id, name) values ('proofs', $1)`, [`${A}/evil.jpg`])), 'upload');
ok(true, 'B cannot upload into the folder of A');
r = await db.query(`select public from storage.buckets where id = 'proofs'`);
ok(r.rows[0].public === false, 'the photo bucket is private');

await denied(as(A, () => db.query(`select bump_ai_usage($1, 100)`, [A])), 'bump');
ok(true, 'people cannot reset or raise their own AI allowance');
await denied(as(A, () => db.query(`select * from ai_usage`)), 'usage');
ok(true, 'the AI usage table is closed to the app');
const results = [];
for (let i = 0; i < 3; i++) results.push((await db.query(`select bump_ai_usage($1, 2) ok`, [A])).rows[0].ok);
ok(results.join() === 'true,true,false', 'the daily AI limit stops at the limit');

await denied(as(A, () => db.query(`select expired_proofs(60, 10)`)), 'expired list');
ok(true, 'people cannot list everyone\'s old photos');
await db.query(`insert into storage.objects (bucket_id, name, created_at) values ('proofs', 'old.jpg', now() - interval '61 days')`);
r = await db.query(`select expired_proofs(60, 10) n`);
ok(r.rows.length === 1 && r.rows[0].n === 'old.jpg', 'only photos older than 60 days are listed for deletion');

await db.query(`delete from auth.users where id = $1`, [A]);
r = await db.query(`select count(*)::int c from player_docs where user_id = $1`, [A]);
ok(r.rows[0].c === 0, 'deleting an account deletes its progress');

console.log(`All ${checks} checks passed.`);
await db.close();
