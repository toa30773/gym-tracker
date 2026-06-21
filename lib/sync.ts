import { createClient } from "@/lib/supabase/client";
import {
  getPendingMutations,
  deleteMutation,
  replaceAllFromServer,
  setMeta,
  getMeta,
  pendingCount,
  type Mutation,
} from "@/lib/local-db";
import type {
  Menu,
  Exercise,
  WorkoutSet,
  WeightUpdate,
  SetLog,
} from "@/lib/types";

type Listener = (state: SyncState) => void;

export interface SyncState {
  online: boolean;
  syncing: boolean;
  pending: number;
  lastSyncAt: string | null;
  lastError: string | null;
}

const listeners = new Set<Listener>();
let state: SyncState = {
  online: typeof navigator !== "undefined" ? navigator.onLine : true,
  syncing: false,
  pending: 0,
  lastSyncAt: null,
  lastError: null,
};

function emit() {
  for (const l of listeners) l(state);
}

function update(patch: Partial<SyncState>) {
  state = { ...state, ...patch };
  emit();
}

export function subscribeSync(listener: Listener): () => void {
  listeners.add(listener);
  listener(state);
  return () => listeners.delete(listener);
}

async function refreshPending() {
  const n = await pendingCount();
  update({ pending: n });
}

// ──────────────────────────────────────────
// Push: mutations queue を Supabase に流す
// ──────────────────────────────────────────

// 親テーブルから子テーブルへの順序。同じ ms に enqueue された mutation が
// IndexedDB の by_created インデックスで同位になり、UUID 順で並ぶと
// sets が exercises より先に push されて FK 違反になることがある。
// このマップで同 created_at 内の処理順を決めて防ぐ。
const TABLE_PRIORITY: Record<Mutation["table"], number> = {
  menus: 0,
  exercises: 1,
  sets: 2,
  weight_updates: 3,
  set_logs: 4,
};

async function applyMutation(mutation: Mutation): Promise<{ error: string | null }> {
  const supabase = createClient();
  const { table, operation, record_id, payload } = mutation;

  if (operation === "delete") {
    const { error } = await supabase.from(table).delete().eq("id", record_id);
    return { error: error ? error.message : null };
  }

  // insert / update どちらも upsert で吸収する（既に push 済みのキューが残っていても安全）
  const { error } = await supabase.from(table).upsert(payload!);
  return { error: error ? error.message : null };
}

async function pushMutations(): Promise<{ ok: boolean; error?: string }> {
  const mutations = await getPendingMutations();
  if (mutations.length === 0) return { ok: true };

  mutations.sort((a, b) => {
    if (a.created_at !== b.created_at) {
      return a.created_at < b.created_at ? -1 : 1;
    }
    return TABLE_PRIORITY[a.table] - TABLE_PRIORITY[b.table];
  });

  for (const m of mutations) {
    const { error } = await applyMutation(m);
    if (error) {
      // 1件失敗で全停止（順序保持のため）
      return { ok: false, error };
    }
    await deleteMutation(m.id);
    await refreshPending();
  }
  return { ok: true };
}

// ──────────────────────────────────────────
// Pull: Supabase から全データを取得して IndexedDB に置く
// ──────────────────────────────────────────

async function pullAll(): Promise<{ ok: boolean; error?: string }> {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "not logged in" };
  await setMeta("user_id", user.id);

  const [menusRes, exRes, setsRes, wuRes, logsRes] = await Promise.all([
    supabase.from("menus").select("*").eq("user_id", user.id),
    supabase.from("exercises").select("*").eq("user_id", user.id),
    supabase.from("sets").select("*").eq("user_id", user.id),
    supabase.from("weight_updates").select("*").eq("user_id", user.id),
    supabase.from("set_logs").select("*").eq("user_id", user.id),
  ]);

  const firstErr =
    menusRes.error || exRes.error || setsRes.error || wuRes.error || logsRes.error;
  if (firstErr) return { ok: false, error: firstErr.message };

  await replaceAllFromServer({
    userId: user.id,
    menus: (menusRes.data || []) as Menu[],
    exercises: (exRes.data || []) as Exercise[],
    sets: (setsRes.data || []) as WorkoutSet[],
    weight_updates: (wuRes.data || []) as WeightUpdate[],
    set_logs: (logsRes.data || []) as SetLog[],
  });

  return { ok: true };
}

// ──────────────────────────────────────────
// runSync: push → pull の順
// ──────────────────────────────────────────

let syncInFlight: Promise<void> | null = null;

export async function runSync(): Promise<void> {
  if (syncInFlight) return syncInFlight;
  if (!navigator.onLine) {
    update({ online: false });
    await refreshPending();
    return;
  }
  update({ online: true, syncing: true, lastError: null });

  syncInFlight = (async () => {
    try {
      const push = await pushMutations();
      if (!push.ok) {
        update({ lastError: `push 失敗: ${push.error}` });
        return;
      }
      const pull = await pullAll();
      if (!pull.ok) {
        update({ lastError: `pull 失敗: ${pull.error}` });
        return;
      }
      update({ lastSyncAt: new Date().toISOString(), lastError: null });
    } finally {
      await refreshPending();
      update({ syncing: false });
      syncInFlight = null;
    }
  })();

  return syncInFlight;
}

// オフライン時でもページが userId を解決できるようにキャッシュから返す。
// オンラインなら supabase.auth.getUser() でリフレッシュし、結果を meta に保存する。
export async function getCurrentUserId(): Promise<string | null> {
  if (typeof navigator !== "undefined" && navigator.onLine) {
    try {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        await setMeta("user_id", user.id);
        return user.id;
      }
    } catch {
      // network 失敗時は cache へフォールバック
    }
  }
  return await getMeta("user_id");
}

// ──────────────────────────────────────────
// Event wiring
// ──────────────────────────────────────────

let wired = false;
export function wireSyncEvents() {
  if (wired || typeof window === "undefined") return;
  wired = true;

  window.addEventListener("online", () => {
    update({ online: true });
    runSync().catch(() => {});
  });
  window.addEventListener("offline", () => {
    update({ online: false });
  });
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible" && navigator.onLine) {
      runSync().catch(() => {});
    }
  });

  // 起動時の初回同期
  refreshPending().catch(() => {});
  runSync().catch(() => {});
}
