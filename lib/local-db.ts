import { openDB, type DBSchema, type IDBPDatabase } from "idb";
import type {
  Menu,
  Exercise,
  WorkoutSet,
  WeightUpdate,
  SetLog,
} from "@/lib/types";

const DB_NAME = "gym-tracker-local";
const DB_VERSION = 1;

export interface Mutation {
  id: string;
  user_id: string;
  table: "menus" | "exercises" | "sets" | "weight_updates" | "set_logs";
  operation: "insert" | "update" | "delete";
  record_id: string; // 操作対象の primary key
  payload: Record<string, unknown> | null; // delete のときは null
  created_at: string; // クライアント発生時刻
}

interface GymDB extends DBSchema {
  menus: {
    key: string;
    value: Menu;
    indexes: { by_order: number; by_user: string };
  };
  exercises: {
    key: string;
    value: Exercise;
    indexes: { by_menu: string; by_user: string };
  };
  sets: {
    key: string;
    value: WorkoutSet;
    indexes: { by_exercise: string; by_user: string };
  };
  weight_updates: {
    key: string;
    value: WeightUpdate;
    indexes: { by_set: string; by_user: string };
  };
  set_logs: {
    key: string;
    value: SetLog;
    indexes: { by_exercise: string; by_user: string; by_date: string };
  };
  mutations: {
    key: string;
    value: Mutation;
    indexes: { by_created: string };
  };
  meta: {
    key: string;
    value: { key: string; value: string };
  };
}

let dbPromise: Promise<IDBPDatabase<GymDB>> | null = null;

function getDB(): Promise<IDBPDatabase<GymDB>> {
  if (typeof window === "undefined") {
    throw new Error("local-db is browser-only");
  }
  if (!dbPromise) {
    dbPromise = openDB<GymDB>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains("menus")) {
          const s = db.createObjectStore("menus", { keyPath: "id" });
          s.createIndex("by_order", "order_index");
          s.createIndex("by_user", "user_id");
        }
        if (!db.objectStoreNames.contains("exercises")) {
          const s = db.createObjectStore("exercises", { keyPath: "id" });
          s.createIndex("by_menu", "menu_id");
          s.createIndex("by_user", "user_id");
        }
        if (!db.objectStoreNames.contains("sets")) {
          const s = db.createObjectStore("sets", { keyPath: "id" });
          s.createIndex("by_exercise", "exercise_id");
          s.createIndex("by_user", "user_id");
        }
        if (!db.objectStoreNames.contains("weight_updates")) {
          const s = db.createObjectStore("weight_updates", { keyPath: "id" });
          s.createIndex("by_set", "set_id");
          s.createIndex("by_user", "user_id");
        }
        if (!db.objectStoreNames.contains("set_logs")) {
          const s = db.createObjectStore("set_logs", { keyPath: "id" });
          s.createIndex("by_exercise", "exercise_id");
          s.createIndex("by_user", "user_id");
          s.createIndex("by_date", "performed_at");
        }
        if (!db.objectStoreNames.contains("mutations")) {
          const s = db.createObjectStore("mutations", { keyPath: "id" });
          s.createIndex("by_created", "created_at");
        }
        if (!db.objectStoreNames.contains("meta")) {
          db.createObjectStore("meta", { keyPath: "key" });
        }
      },
    });
  }
  return dbPromise;
}

// ──────────────────────────────────────────
// Read helpers
// ──────────────────────────────────────────

async function getAllMenusForUser(userId: string): Promise<Menu[]> {
  const db = await getDB();
  const all = await db.getAllFromIndex("menus", "by_user", userId);
  return all.sort((a, b) => (a.order_index ?? 0) - (b.order_index ?? 0));
}

async function getExercisesForMenu(menuId: string): Promise<Exercise[]> {
  const db = await getDB();
  const all = await db.getAllFromIndex("exercises", "by_menu", menuId);
  return all.sort((a, b) => (a.order_index ?? 0) - (b.order_index ?? 0));
}

async function getSetsForExercise(exerciseId: string): Promise<WorkoutSet[]> {
  const db = await getDB();
  const all = await db.getAllFromIndex("sets", "by_exercise", exerciseId);
  return all.sort((a, b) => a.set_number - b.set_number);
}

export async function getAllExercisesForUser(userId: string): Promise<Exercise[]> {
  const db = await getDB();
  return db.getAllFromIndex("exercises", "by_user", userId);
}

export async function getAllSetLogsForUser(userId: string): Promise<SetLog[]> {
  const db = await getDB();
  const all = await db.getAllFromIndex("set_logs", "by_user", userId);
  return all.sort((a, b) => a.performed_at.localeCompare(b.performed_at));
}

export async function getWeightUpdateCountsForSets(
  setIds: string[]
): Promise<Record<string, number>> {
  const db = await getDB();
  const counts: Record<string, number> = {};
  for (const setId of setIds) {
    const updates = await db.getAllFromIndex("weight_updates", "by_set", setId);
    counts[setId] = updates.length;
  }
  return counts;
}

// ──────────────────────────────────────────
// Write helpers (mutations queue にも積む)
// ──────────────────────────────────────────

function newId(): string {
  return crypto.randomUUID();
}

function nowIso(): string {
  return new Date().toISOString();
}

async function enqueue(
  userId: string,
  table: Mutation["table"],
  operation: Mutation["operation"],
  recordId: string,
  payload: Mutation["payload"]
): Promise<void> {
  const db = await getDB();
  await db.put("mutations", {
    id: newId(),
    user_id: userId,
    table,
    operation,
    record_id: recordId,
    payload,
    created_at: nowIso(),
  });
}

export async function putMenu(menu: Menu, opts: { enqueue: boolean }) {
  const db = await getDB();
  await db.put("menus", menu);
  if (opts.enqueue) {
    await enqueue(menu.user_id, "menus", "insert", menu.id, menu as unknown as Record<string, unknown>);
  }
}

export async function updateMenu(menu: Menu) {
  const db = await getDB();
  await db.put("menus", menu);
  await enqueue(menu.user_id, "menus", "update", menu.id, menu as unknown as Record<string, unknown>);
}

export async function deleteMenuLocal(menuId: string, userId: string) {
  const db = await getDB();
  // cascading delete: 関連の exercises / sets / weight_updates / set_logs
  const exercises = await db.getAllFromIndex("exercises", "by_menu", menuId);
  for (const ex of exercises) {
    const sets = await db.getAllFromIndex("sets", "by_exercise", ex.id);
    for (const s of sets) {
      const updates = await db.getAllFromIndex("weight_updates", "by_set", s.id);
      for (const u of updates) await db.delete("weight_updates", u.id);
      const logs = await db.getAllFromIndex("set_logs", "by_exercise", ex.id);
      for (const l of logs) await db.delete("set_logs", l.id);
      await db.delete("sets", s.id);
    }
    await db.delete("exercises", ex.id);
  }
  await db.delete("menus", menuId);
  // サーバへは menus の DELETE 1発（DB の on delete cascade に任せる）
  await enqueue(userId, "menus", "delete", menuId, null);
}

export async function putExercise(exercise: Exercise, opts: { enqueue: boolean }) {
  const db = await getDB();
  await db.put("exercises", exercise);
  if (opts.enqueue) {
    await enqueue(
      exercise.user_id,
      "exercises",
      "insert",
      exercise.id,
      exercise as unknown as Record<string, unknown>
    );
  }
}

export async function updateExercise(exercise: Exercise) {
  const db = await getDB();
  await db.put("exercises", exercise);
  await enqueue(
    exercise.user_id,
    "exercises",
    "update",
    exercise.id,
    exercise as unknown as Record<string, unknown>
  );
}

export async function deleteExerciseLocal(exerciseId: string, userId: string) {
  const db = await getDB();
  const sets = await db.getAllFromIndex("sets", "by_exercise", exerciseId);
  for (const s of sets) {
    const updates = await db.getAllFromIndex("weight_updates", "by_set", s.id);
    for (const u of updates) await db.delete("weight_updates", u.id);
    await db.delete("sets", s.id);
  }
  const logs = await db.getAllFromIndex("set_logs", "by_exercise", exerciseId);
  for (const l of logs) await db.delete("set_logs", l.id);
  await db.delete("exercises", exerciseId);
  await enqueue(userId, "exercises", "delete", exerciseId, null);
}

export async function putSet(set: WorkoutSet, opts: { enqueue: boolean }) {
  const db = await getDB();
  await db.put("sets", set);
  if (opts.enqueue) {
    await enqueue(set.user_id, "sets", "insert", set.id, set as unknown as Record<string, unknown>);
  }
}

export async function updateSet(set: WorkoutSet) {
  const db = await getDB();
  await db.put("sets", set);
  await enqueue(set.user_id, "sets", "update", set.id, set as unknown as Record<string, unknown>);
}

export async function deleteSetLocal(setId: string, userId: string) {
  const db = await getDB();
  const updates = await db.getAllFromIndex("weight_updates", "by_set", setId);
  for (const u of updates) await db.delete("weight_updates", u.id);
  await db.delete("sets", setId);
  await enqueue(userId, "sets", "delete", setId, null);
}

export async function putWeightUpdate(update: WeightUpdate) {
  const db = await getDB();
  await db.put("weight_updates", update);
  await enqueue(
    update.user_id,
    "weight_updates",
    "insert",
    update.id,
    update as unknown as Record<string, unknown>
  );
}

export async function putSetLog(log: SetLog) {
  const db = await getDB();
  await db.put("set_logs", log);
  await enqueue(log.user_id, "set_logs", "insert", log.id, log as unknown as Record<string, unknown>);
}

export { newId, nowIso };

// ──────────────────────────────────────────
// Bulk replace helpers (sync 用)
// ──────────────────────────────────────────

export async function replaceAllFromServer(payload: {
  userId: string;
  menus: Menu[];
  exercises: Exercise[];
  sets: WorkoutSet[];
  weight_updates: WeightUpdate[];
  set_logs: SetLog[];
}) {
  const db = await getDB();
  const tx = db.transaction(
    ["menus", "exercises", "sets", "weight_updates", "set_logs"],
    "readwrite"
  );

  // ユーザー分だけを置き換える（他ユーザーが居る想定はないが安全のため）
  for (const store of ["menus", "exercises", "sets", "weight_updates", "set_logs"] as const) {
    const idx = tx.objectStore(store).index("by_user");
    let cursor = await idx.openCursor(payload.userId);
    while (cursor) {
      await cursor.delete();
      cursor = await cursor.continue();
    }
  }

  for (const m of payload.menus) await tx.objectStore("menus").put(m);
  for (const e of payload.exercises) await tx.objectStore("exercises").put(e);
  for (const s of payload.sets) await tx.objectStore("sets").put(s);
  for (const u of payload.weight_updates) await tx.objectStore("weight_updates").put(u);
  for (const l of payload.set_logs) await tx.objectStore("set_logs").put(l);
  await tx.done;
}

// ──────────────────────────────────────────
// Mutation queue
// ──────────────────────────────────────────

export async function getPendingMutations(): Promise<Mutation[]> {
  const db = await getDB();
  const all = await db.getAllFromIndex("mutations", "by_created");
  return all;
}

export async function deleteMutation(id: string) {
  const db = await getDB();
  await db.delete("mutations", id);
}

export async function pendingCount(): Promise<number> {
  const db = await getDB();
  return db.count("mutations");
}

// ──────────────────────────────────────────
// Meta (last sync 時刻など)
// ──────────────────────────────────────────

export async function setMeta(key: string, value: string) {
  const db = await getDB();
  await db.put("meta", { key, value });
}

export async function getMeta(key: string): Promise<string | null> {
  const db = await getDB();
  const r = await db.get("meta", key);
  return r ? r.value : null;
}

// ──────────────────────────────────────────
// Composite reads used by pages
// ──────────────────────────────────────────

export async function getMenusWithExercisesForUser(
  userId: string
): Promise<(Menu & { exercises: (Exercise & { sets: WorkoutSet[] })[] })[]> {
  const menus = await getAllMenusForUser(userId);
  const result: (Menu & { exercises: (Exercise & { sets: WorkoutSet[] })[] })[] = [];
  for (const m of menus) {
    const exercises = await getExercisesForMenu(m.id);
    const enriched: (Exercise & { sets: WorkoutSet[] })[] = [];
    for (const ex of exercises) {
      const sets = await getSetsForExercise(ex.id);
      enriched.push({ ...ex, sets });
    }
    result.push({ ...m, exercises: enriched });
  }
  return result;
}

// 指定セットの「最後に記録された実レップ数」を返す。
// 履歴がなければ null。表示用の「前回 X 回」表示で使う。
export async function getLastActualRepsForSet(
  exerciseId: string,
  setId: string,
): Promise<number | null> {
  const db = await getDB();
  const logs = await db.getAllFromIndex("set_logs", "by_exercise", exerciseId);
  const matching = logs
    .filter((l) => l.set_id === setId)
    .sort((a, b) => (a.performed_at < b.performed_at ? 1 : -1));
  return matching.length > 0 ? matching[0].actual_reps : null;
}

// 指定種目の「日付ごとのトップセットの実レップ - 予定レップ」を新しい順で返す。
// トップセットの判定は set_number が最大のもの。
export async function getTopSetDeltaHistory(
  exerciseId: string,
): Promise<{ date: string; delta: number }[]> {
  const db = await getDB();
  const logs = await db.getAllFromIndex("set_logs", "by_exercise", exerciseId);
  const byDate = new Map<
    string,
    { setNumber: number; planned: number; actual: number }
  >();
  for (const log of logs) {
    const date = log.performed_at.slice(0, 10);
    const cur = byDate.get(date);
    if (!cur || log.set_number > cur.setNumber) {
      byDate.set(date, {
        setNumber: log.set_number,
        planned: log.planned_reps,
        actual: log.actual_reps,
      });
    }
  }
  return [...byDate.entries()]
    .map(([date, { planned, actual }]) => ({ date, delta: actual - planned }))
    .sort((a, b) => (a.date < b.date ? 1 : -1));
}

