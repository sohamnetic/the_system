/* A fake Supabase for local testing only, kept in localStorage. It proves the app's login and save paths;
   tests/rls.test.mjs proves the real database rules. Never loaded by the real app. */
(() => {
  const load = k => JSON.parse(localStorage.getItem('stub.' + k) || 'null');
  const keep = (k, v) => localStorage.setItem('stub.' + k, JSON.stringify(v));
  const users = () => load('users') || {};
  const session = () => load('session');
  const uid = () => session()?.user?.id;
  const rows = t => load('t.' + t) || [];
  const KEYS = { player_docs: ['user_id', 'key'], notification_prefs: ['user_id'], push_subscriptions: ['endpoint'] };
  window.stubFail = false;
  const table = t => {
    const filters = [];
    const visible = () => rows(t).filter(r => r.user_id === uid() && filters.every(([f, v]) => r[f] === v));
    const q = {
      select() { return q; },
      eq(f, v) { filters.push([f, v]); return q; },
      async maybeSingle() { if (window.stubFail) return { data: null, error: { message: 'offline' } }; return { data: visible()[0] || null, error: null }; },
      async upsert(row) {
        if (window.stubFail) return { error: { message: 'offline' } };
        if (row.user_id !== uid()) return { error: { message: 'row level security' } };
        const key = KEYS[t];
        keep('t.' + t, [...rows(t).filter(r => !key.every(k => r[k] === row[k])), row]);
        return { error: null };
      }
    };
    return q;
  };
  window.supabase = {
    createClient: () => ({
      from: table,
      auth: {
        getSession: async () => ({ data: { session: session() } }),
        signUp: async ({ email, password }) => {
          const u = users(); if (u[email]) return { data: {}, error: { message: 'That email is already registered.' } };
          u[email] = { password, id: 'user-' + Object.keys(u).length }; keep('users', u);
          const s = { user: { id: u[email].id, email } }; keep('session', s); return { data: { session: s }, error: null };
        },
        signInWithPassword: async ({ email, password }) => {
          const r = users()[email]; if (!r || r.password !== password) return { data: {}, error: { message: 'bad' } };
          const s = { user: { id: r.id, email } }; keep('session', s); return { data: { session: s }, error: null };
        },
        signInWithOtp: async () => ({ error: null }),
        signInWithOAuth: async () => ({ error: null }),
        signOut: async () => { keep('session', null); }
      },
      storage: { from: () => ({ upload: async () => ({ error: null }), createSignedUrls: async () => ({ data: [] }) }) },
      functions: { invoke: async () => ({ error: { context: { status: 503 } } }) }
    })
  };
})();
