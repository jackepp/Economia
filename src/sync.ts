import { createClient, type User } from '@supabase/supabase-js';
import { SUPABASE_KEY, SUPABASE_URL } from './config';
import { $opt, errMsg, toast } from './dom';
import { rerender } from './nav';
import { loadLegacyLocal, normalize, replaceState, S, setSaveHandler } from './state';
import type { State, Transaction } from './types';

export const sb = createClient(SUPABASE_URL, SUPABASE_KEY);

/** Inloggad användare och om datan är hämtad. */
export const session = { user: null as User | null, ready: false };

interface TxRow {
  user_id: string; id: string; date: string; description: string; kind: string | null; amount: number;
  currency: string; source: string | null; category_id: string | null; manual: boolean; hint: string | null;
  alias: string | null; note: string | null; mark: string | null;
}

// Senast synkade versionen av varje rad – bara ändringar laddas upp
let synced = { tx: new Map<string, string>(), settings: null as string | null };
let syncTimer: ReturnType<typeof setTimeout> | null = null, syncing = false, syncAgain = false;

function settingsOf(): Omit<State, 'transactions' | 'ui'> {
  const { transactions: _t, ui: _u, ...rest } = S;
  return rest;
}
const txRow = (t: Transaction, userId: string): TxRow => ({
  user_id: userId, id: t.id, date: t.date, description: t.description || '', kind: t.kind || null, amount: t.amount,
  currency: t.currency || 'SEK', source: t.source || null, category_id: t.categoryId || null, manual: !!t.manual,
  hint: t.hint || null, alias: t.alias || null, note: t.note || null, mark: t.mark || null,
});
function rowTx(r: TxRow): Transaction {
  const t: Transaction = { id: r.id, date: r.date, description: r.description || '', kind: r.kind || '', amount: Number(r.amount),
    currency: r.currency || 'SEK', source: r.source || '', categoryId: r.category_id || null, manual: !!r.manual, hint: r.hint || null };
  if (r.alias) t.alias = r.alias;
  if (r.note) t.note = r.note;
  if (r.mark) t.mark = r.mark;
  return t;
}

type SyncState = 'loading' | 'pending' | 'ok' | 'error' | '';
export function setSync(state: SyncState, msg?: string): void {
  const el = $opt('#sync');
  if (!el) return;
  el.textContent = { loading: '⟳ Hämtar…', pending: '● Sparar…', ok: '✓ Sparat', error: '⚠ Ej sparat', '': '' }[state];
  el.style.color = state === 'error' ? 'var(--neg)' : '';
  el.title = msg || 'Status för synk med databasen';
}

export function scheduleSync(): void {
  if (!session.user || !session.ready) return;
  setSync('pending');
  if (syncTimer) clearTimeout(syncTimer);
  syncTimer = setTimeout(syncNow, 700);
}
setSaveHandler(scheduleSync);

export async function syncNow(): Promise<void> {
  const user = session.user;
  if (!user) return;
  if (syncing) { syncAgain = true; return; }
  if (syncTimer) clearTimeout(syncTimer);
  syncTimer = null;
  syncing = true;
  try {
    const cur = new Map(S.transactions.map((t) => { const r = txRow(t, user.id); return [t.id, { r, j: JSON.stringify(r) }]; }));
    const up = [...cur.values()].filter((v) => synced.tx.get(v.r.id) !== v.j);
    const del = [...synced.tx.keys()].filter((id) => !cur.has(id));
    for (let i = 0; i < up.length; i += 500) {
      const { error } = await sb.from('transactions').upsert(up.slice(i, i + 500).map((v) => v.r), { onConflict: 'user_id,id' });
      if (error) throw error;
    }
    if (del.length && !cur.size) {
      const { error } = await sb.from('transactions').delete().eq('user_id', user.id);
      if (error) throw error;
    } else {
      for (let i = 0; i < del.length; i += 10) {
        const res = await Promise.all(del.slice(i, i + 10).map((id) => sb.from('transactions').delete().eq('id', id)));
        const bad = res.find((r) => r.error);
        if (bad) throw bad.error;
      }
    }
    const sj = JSON.stringify(settingsOf());
    if (sj !== synced.settings) {
      const { error } = await sb.from('app_settings').upsert({ user_id: user.id, data: JSON.parse(sj), updated_at: new Date().toISOString() });
      if (error) throw error;
      synced.settings = sj;
    }
    for (const v of up) synced.tx.set(v.r.id, v.j);
    for (const id of del) synced.tx.delete(id);
    setSync('ok');
  } catch (e) {
    console.error(e);
    setSync('error', errMsg(e));
    if (syncTimer) clearTimeout(syncTimer);
    syncTimer = setTimeout(syncNow, 10000); // försök igen om 10 s
  } finally {
    syncing = false;
    if (syncAgain) { syncAgain = false; scheduleSync(); }
  }
}

async function loadRemote(): Promise<void> {
  setSync('loading');
  session.ready = false;
  const { data: st, error: e1 } = await sb.from('app_settings').select('data').maybeSingle();
  if (e1) throw e1;
  const rows: TxRow[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await sb.from('transactions').select('*').order('id').range(from, from + 999);
    if (error) throw error;
    rows.push(...(data as TxRow[]));
    if (data.length < 1000) break;
  }
  synced = { tx: new Map(), settings: null };
  if (!st && !rows.length) {
    // Första inloggningen: flytta data som finns sparad i den här webbläsaren
    loadLegacyLocal();
    session.ready = true;
    const n = S.transactions.length;
    await syncNow();
    if (n) toast(`${n} transaktioner flyttades från webbläsaren till databasen`);
  } else {
    replaceState({ ...((st?.data as Partial<State>) || {}), transactions: rows.map(rowTx) });
    for (const t of S.transactions) synced.tx.set(t.id, JSON.stringify(txRow(t, session.user!.id)));
    normalize();
    session.ready = true;
    scheduleSync(); // laddar upp eventuella ändringar från migreringar
    setSync('ok');
  }
}

async function enter(user: User): Promise<void> {
  session.user = user;
  rerender(); // visar laddningsläge
  try {
    await loadRemote();
  } catch (e) {
    console.error(e);
    setSync('error', errMsg(e));
    toast('Kunde inte hämta data: ' + errMsg(e));
  }
  rerender();
}

function reset(): void {
  session.user = null;
  session.ready = false;
  replaceState({});
  synced = { tx: new Map(), settings: null };
  setSync('');
  rerender();
}

/** Returnerar ett felmeddelande, eller null om inloggningen lyckades. */
export async function login(email: string, password: string): Promise<string | null> {
  const { data, error } = await sb.auth.signInWithPassword({ email, password });
  if (error) return error.message === 'Invalid login credentials' ? 'Fel e-post eller lösenord.' : error.message;
  void enter(data.user);
  return null;
}

export async function logout(): Promise<void> {
  await syncNow();
  await sb.auth.signOut();
  reset();
}

export async function startSession(): Promise<void> {
  // Spara direkt när appen läggs i bakgrunden (viktigt på iPhone)
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden' && syncTimer) void syncNow();
  });
  window.addEventListener('beforeunload', (e) => {
    if (syncTimer || syncing) { void syncNow(); e.preventDefault(); e.returnValue = ''; }
  });
  const { data: { session: s } } = await sb.auth.getSession();
  if (s) void enter(s.user);
  else rerender();
  sb.auth.onAuthStateChange((ev) => {
    if (ev === 'SIGNED_OUT' && session.user) reset();
  });
}
