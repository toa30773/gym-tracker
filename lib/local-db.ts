import { openDB, type DBSchema, type IDBPDatabase } from "idb";
import {
  normalizeExerciseName,
  type Menu,
  type Exercise,
  type WorkoutSet,
  type WeightUpdate,
  type SetLog,
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

// 同名種目（normalize 一致）の最新トレセッションを返す。
// 「同じ種目を複数メニューで使い回している」場合、どのメニューで行ったかを問わず
// 直近の実績を「前回」として参照できるようにするための関数。
//
// セッション = (exercise_id, 日付) の組。最新の performed_at で判定。
// 戻り値: そのセッションの set_number → 実重量・実レップ の Map と、TOP の set_number。
// 履歴なしなら null。
export async function getLastSessionForExerciseName(
  userId: string,
  exerciseName: string,
): Promise<{
  bySetNumber: Map<number, { weight: number; reps: number }>;
  topSetNumber: number;
} | null> {
  const normalized = normalizeExerciseName(exerciseName);
  if (!normalized) return null;

  const db = await getDB();
  const allExercises = await db.getAllFromIndex("exercises", "by_user", userId);
  const matchingIds = allExercises
    .filter((e) => normalizeExerciseName(e.name) === normalized)
    .map((e) => e.id);
  if (matchingIds.length === 0) return null;

  // 該当 exercise の全ログを集める
  const allLogs: SetLog[] = [];
  for (const exId of matchingIds) {
    const logs = await db.getAllFromIndex("set_logs", "by_exercise", exId);
    allLogs.push(...logs);
  }
  if (allLogs.length === 0) return null;

  // セッション = (exercise_id, ymd)。最新 performed_at を持つセッションを選ぶ。
  const sessions = new Map<string, SetLog[]>();
  let bestKey = "";
  let bestAt = "";
  for (const l of allLogs) {
    const ymd = l.performed_at.slice(0, 10);
    const key = `${l.exercise_id}|${ymd}`;
    if (!sessions.has(key)) sessions.set(key, []);
    sessions.get(key)!.push(l);
    if (l.performed_at > bestAt) {
      bestAt = l.performed_at;
      bestKey = key;
    }
  }
  if (!bestKey) return null;

  const session = sessions.get(bestKey)!;
  const bySetNumber = new Map<number, { weight: number; reps: number }>();
  let topSetNumber = 0;
  for (const l of session) {
    bySetNumber.set(l.set_number, { weight: l.actual_weight, reps: l.actual_reps });
    if (l.set_number > topSetNumber) topSetNumber = l.set_number;
  }
  return { bySetNumber, topSetNumber };
}

// 指定種目の「全セットの actual_weight が同じ値で記録された日」を抽出し、
// その揃った重量の distinct 値数 - 1 を返す（初期値はカウントしない）。
// 例: セッション履歴 10/10/10, 20/20/20, 30/30/30 → distinct {10,20,30} → 2
// バックオフ＝TOP に揃った重量に新しく到達するたびに +1 されるイメージ。
export async function getEqualWeightMilestones(
  exerciseId: string,
): Promise<number> {
  const db = await getDB();
  const logs = await db.getAllFromIndex("set_logs", "by_exercise", exerciseId);
  // 日付ごとに log を集める（同日複数セッションは同一トレ扱い）
  const byDate = new Map<string, typeof logs>();
  for (const l of logs) {
    const key = l.performed_at.slice(0, 10);
    if (!byDate.has(key)) byDate.set(key, []);
    byDate.get(key)!.push(l);
  }
  const equalWeights = new Set<number>();
  for (const sessionLogs of byDate.values()) {
    if (sessionLogs.length < 2) continue; // 1 セットだけなら "揃った" の対象外
    const weights = sessionLogs.map((l) => l.actual_weight);
    if (weights.every((w) => w === weights[0])) {
      equalWeights.add(weights[0]);
    }
  }
  return Math.max(0, equalWeights.size - 1);
}

