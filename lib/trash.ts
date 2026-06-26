// 「直前に削除したメニュー」を 24 時間だけ復元できるようにするためのローカル保管庫。
// localStorage に 1 スロットだけ持つ（連続削除すると古いほうは上書きで失われる）。
// 復元は新しい ID で put し直すので、他デバイスで同 ID の削除が既に sync されていても衝突しない。

import type { Menu, Exercise, WorkoutSet, MenuWithExercises } from "./types";

const KEY = "gym-tracker-trash-menu";
const TTL_MS = 24 * 60 * 60 * 1000;

export interface TrashedMenu {
  menu: Menu;
  exercises: Array<{ exercise: Exercise; sets: WorkoutSet[] }>;
  deleted_at: string;
}

export function saveMenuToTrash(snapshot: MenuWithExercises): void {
  const { exercises, ...menu } = snapshot;
  const payload: TrashedMenu = {
    menu,
    exercises: exercises.map((ex) => {
      const { sets, ...rest } = ex;
      return { exercise: rest, sets };
    }),
    deleted_at: new Date().toISOString(),
  };
  try {
    localStorage.setItem(KEY, JSON.stringify(payload));
  } catch {}
}

export function getMenuFromTrash(): TrashedMenu | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as TrashedMenu;
    const age = Date.now() - new Date(parsed.deleted_at).getTime();
    if (!Number.isFinite(age) || age < 0 || age > TTL_MS) {
      localStorage.removeItem(KEY);
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function clearTrash(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {}
}

// 残り時間（ms）。期限切れなら 0。表示用。
export function trashRemainingMs(t: TrashedMenu): number {
  const age = Date.now() - new Date(t.deleted_at).getTime();
  return Math.max(0, TTL_MS - age);
}
