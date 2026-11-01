/* Storage, login, proof photos and AI all go through this object.
   With no Supabase settings in config.js the app runs in guest mode, saved in this browser only.
   When signed in, every save is copied to this device first, so a gym with bad signal loses nothing. */
const Store = {
  mode: 'local', sb: null, id: null, user: null, cfg: {}, needsLogin: false,
  assets: null, sample: null, readOnly: false,
  dirty: new Map(), flushing: false, timer: null,
  downloads: {
    async save({ filename, data }) {
      const url = URL.createObjectURL(new Blob([data], { type: 'application/json' }));
      const a = document.createElement('a');
      a.href = url; a.download = filename; a.click();
      setTimeout(() => URL.revokeObjectURL(url), 5000);
    }
  },
  async init() {
    this.cfg = window.SYSTEM_CONFIG || {};
    if (!this.cfg.supabaseUrl || !this.cfg.supabaseAnonKey || !window.supabase) return;
    this.sb = window.supabase.createClient(this.cfg.supabaseUrl, this.cfg.supabaseAnonKey);
    const { data } = await this.sb.auth.getSession();
    if (!data.session) { this.needsLogin = true; return; }
    this.user = data.session.user; this.id = this.user.id; this.mode = 'cloud';
    this.assets = {
      upload: async (blob, opts) => {
        const path = `${this.id}/${crypto.randomUUID()}.jpg`;
        const { error } = await this.sb.storage.from('proofs').upload(path, blob, { contentType: opts?.type || 'image/jpeg' });
        if (error) throw error;
        return { id: path };
      }
    };
    if (this.cfg.aiEnabled) this.sample = { json: (prompt, opts) => askServer(prompt, opts) };
    window.addEventListener('online', () => this.retryPending());
    this.retryPending();
  },
  cacheKey(key) { return this.mode === 'cloud' ? `system.${this.id}.${key}` : `system.${key}`; },
  readCache(key) { try { return JSON.parse(localStorage.getItem(this.cacheKey(key)) || 'null'); } catch { return null; } },
  writeCache(key, value) { try { localStorage.setItem(this.cacheKey(key), JSON.stringify(value)); return true; } catch { return false; } },
  pending() { return new Set(this.readCache('pending') || []); },
  setPending(set) { this.writeCache('pending', [...set]); },
  async read(key) {
    if (this.mode !== 'cloud') return this.readCache(key);
    if (this.pending().has(key)) return this.readCache(key);
    try {
      const { data, error } = await this.sb.from('player_docs').select('body').eq('key', key).maybeSingle();
      if (error) throw error;
      const body = data ? data.body : null;
      if (body) this.writeCache(key, body);
      return body;
    } catch (e) {
      const cached = this.readCache(key);
      if (cached) return cached;
      if (key.startsWith('log-') || navigator.onLine === false) { if (key.startsWith('log-')) return null; }
      throw e;
    }
  },
  write(key, value) {
    this.dirty.set(key, value);
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.flush(), 300);
  },
  async flush() {
    if (this.flushing) return;
    this.flushing = true;
    try {
      while (this.dirty.size) {
        const [key, value] = this.dirty.entries().next().value;
        this.dirty.delete(key);
        const body = JSON.parse(JSON.stringify(value));
        if (!this.writeCache(key, body) && this.mode !== 'cloud') toast('[This browser refused to save your progress.]', 5000);
        if (this.mode !== 'cloud') continue;
        const pending = this.pending();
        const { error } = await this.sb.from('player_docs').upsert({ user_id: this.id, key, body, updated_at: new Date().toISOString() });
        if (error) { pending.add(key); if (!this.offlineNoted) { this.offlineNoted = true; toast('[You seem to be offline. Progress is saved here and will sync when you reconnect.]', 5000); } }
        else { pending.delete(key); this.offlineNoted = false; }
        this.setPending(pending);
      }
    } catch { /* A network failure is retried on the next save or reconnect. */ }
    finally { this.flushing = false; }
    if (typeof syncSummary === 'function') syncSummary();
  },
  retryPending() {
    for (const key of this.pending()) { const v = this.readCache(key); if (v) this.dirty.set(key, v); }
    if (this.dirty.size) this.flush();
  }
};

async function askServer(prompt, opts = {}) {
  const body = { prompt, tier: opts.modelTier === 'quick' ? 'quick' : 'default' };
  if (opts.images) {
    body.mediaType = opts.images.type || 'image/jpeg';
    body.image = await new Promise((ok, no) => {
      const r = new FileReader();
      r.onload = () => ok(String(r.result).split(',')[1]);
      r.onerror = no;
      r.readAsDataURL(opts.images);
    });
  }
  const { data, error } = await Store.sb.functions.invoke('ai', { body });
  if (error) {
    const status = error.context?.status;
    throw { code: status === 503 || status === 404 ? 'sampling_disabled' : status === 429 ? 'rate_limited' : status === 422 ? 'refused' : 'upstream_error', message: error.message };
  }
  const text = String(data?.text || '');
  const start = text.search(/[[{]/);
  const end = Math.max(text.lastIndexOf('}'), text.lastIndexOf(']'));
  try { return JSON.parse(text.slice(start, end + 1)); }
  catch { throw { code: 'invalid_json', text }; }
}
