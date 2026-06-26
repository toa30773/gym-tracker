"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import {
  getMenusWithExercisesForUser,
  getEqualWeightMilestones,
  getLastSessionForExerciseName,
  putSetLog,
  updateSet as updateSetLocal,
  newId,
  nowIso,
} from "@/lib/local-db";
import { getCurrentUserId, runSync } from "@/lib/sync";
import type {
  Menu,
  MenuWithExercises,
  ExerciseWithSets,
  WorkoutSet,
} from "@/lib/types";
import { roundToStep, formatWeight, normalizeExerciseName, bodyPartChipClass } from "@/lib/types";
import { diffDaysLocal, effectiveToday, parseYmdLocal, ymdLocal } from "@/lib/date";
import CrossMenuSyncDialog, {
  type ChangedSet,
  type ExerciseChangeEntry,
  type SyncTargetMenu,
} from "@/components/CrossMenuSyncDialog";
import HeaderMenu from "@/components/HeaderMenu";

interface ActualRow {
  set_id: string;
  set_number: number;
  planned_weight: number;
  planned_reps: number;
  actual_weight: number;
  actual_reps: number;
  // 前回そのセットを記録した時の実レップ数。履歴なしなら null。表示用（前回比較）。
  previous_actual_reps: number | null;
}

interface ActualsModal {
  exerciseId: string;
  exerciseName: string;
  isAssisted: boolean;
  weightStep: number;
  rows: ActualRow[];
}

const DAY_MAP: Record<number, string> = {
  0: "日",
  1: "月",
  2: "火",
  3: "水",
  4: "木",
  5: "金",
  6: "土",
};

const COMPLETED_KEY_PREFIX = "completed-exercises-";

function isMenuActiveToday(menu: Menu): boolean {
  // 0〜4時はカレンダー上の前日として扱う（深夜トレーニング中に日付が切り替わってメニューが消えるのを防ぐ）
  const today = effectiveToday();
  const todayLabel = DAY_MAP[today.getDay()];

  // 間隔モード（起点曜日 + 間隔）：start_date を基準に N 日おきで判定。
  // 起点曜日の合致は条件にしない（毎週その曜日に活性化、にならない）。
  if (menu.interval_days && menu.start_date) {
    // start_date は "YYYY-MM-DD" で保存されているのでローカル 0 時で復元する。
    // new Date(string) は UTC 解釈になり JST だと 09:00 から始まって境界バグの元になる。
    const start = parseYmdLocal(menu.start_date);
    const diffDays = diffDaysLocal(today, start);
    if (diffDays >= 0 && diffDays % menu.interval_days === 0) return true;
    return false;
  }

  // 曜日のみモード：曜日リストに今日が含まれるか
  if (menu.days && menu.days.includes(todayLabel)) return true;

  return false;
}

function todayKey(): string {
  return ymdLocal(effectiveToday());
}

export default function MainPage() {
  const [menu, setMenu] = useState<MenuWithExercises | null>(null);
  // 種目ごとの「バックオフ=TOP に揃った新 weight 到達回数」（初期値を除く）。
  const [milestones, setMilestones] = useState<Record<string, number>>({});
  // セット ID をキーにした「前回の実重量・実レップ」。表示用。
  const [prevActuals, setPrevActuals] = useState<
    Record<string, { weight: number; reps: number } | null>
  >({});
  const [loading, setLoading] = useState(true);
  const [completedIds, setCompletedIds] = useState<Set<string>>(new Set());
  const [revealedId, setRevealedId] = useState<string | null>(null);
  const [actualsModal, setActualsModal] = useState<ActualsModal | null>(null);
  const [savingActuals, setSavingActuals] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  // 記録保存時の反映確認ダイアログ。重量変更があり、同名種目を持つ他メニューが存在する場合に表示。
  // logs と自メニューの計画値更新は既に完了している状態でこのダイアログが開く。
  // 「決定」で選択された他メニューへ反映、「キャンセル」は何もせず閉じる（自メニュー更新は既済）。
  const [syncDialog, setSyncDialog] = useState<{
    entries: ExerciseChangeEntry[];
    changedSets: ChangedSet[];
    normalizedName: string;
  } | null>(null);
  const swipeStartRef = useRef<{ id: string; x: number; y: number } | null>(null);
  const lastDateRef = useRef<string>(todayKey());

  // 今日の完了状態をlocalStorageから復元（過去日のキーは削除）
  const syncDay = useCallback(() => {
    const key = COMPLETED_KEY_PREFIX + todayKey();
    try {
      const stored = localStorage.getItem(key);
      setCompletedIds(stored ? new Set(JSON.parse(stored)) : new Set());
      for (let i = localStorage.length - 1; i >= 0; i--) {
        const k = localStorage.key(i);
        if (k && k.startsWith(COMPLETED_KEY_PREFIX) && k !== key) {
          localStorage.removeItem(k);
        }
      }
    } catch {}
    setRevealedId(null);
  }, []);

  useEffect(() => {
    syncDay();
  }, [syncDay]);

  const fetchTodayMenu = useCallback(async () => {
    const userId = await getCurrentUserId();
    if (!userId) {
      setLoading(false);
      return;
    }

    const allMenus = await getMenusWithExercisesForUser(userId);

    if (!allMenus || allMenus.length === 0) {
      setMenu(null);
      setLoading(false);
      return;
    }

    const todayMenus = allMenus.filter(isMenuActiveToday);

    if (todayMenus.length === 0) {
      setMenu(null);
      setLoading(false);
      return;
    }

    let combinedMenu: MenuWithExercises;
    if (todayMenus.length === 1) {
      const only = todayMenus[0] as MenuWithExercises;
      combinedMenu = {
        ...only,
        exercises: only.exercises.map((ex) => ({
          ...ex,
          sets: [...ex.sets].sort((a, b) => a.set_number - b.set_number),
        })),
      };
    } else {
      // 複数メニューが同日にマッチした場合は合体し、部位ごとにまとめる
      const menuOrder = new Map<string, number>();
      const bodyPartOrder: string[] = [];
      const byBodyPart = new Map<string, ExerciseWithSets[]>();
      todayMenus.forEach((mm, idx) => {
        menuOrder.set(mm.id, idx);
        for (const ex of mm.exercises) {
          if (!byBodyPart.has(ex.body_part)) {
            bodyPartOrder.push(ex.body_part);
            byBodyPart.set(ex.body_part, []);
          }
          byBodyPart.get(ex.body_part)!.push({
            ...ex,
            sets: [...ex.sets].sort((a, b) => a.set_number - b.set_number),
          });
        }
      });
      for (const part of bodyPartOrder) {
        byBodyPart.get(part)!.sort((a, b) => {
          const ma = menuOrder.get(a.menu_id) ?? 0;
          const mb = menuOrder.get(b.menu_id) ?? 0;
          if (ma !== mb) return ma - mb;
          return (a.order_index ?? 0) - (b.order_index ?? 0);
        });
      }
      combinedMenu = {
        ...(todayMenus[0] as MenuWithExercises),
        name: todayMenus.map((mm) => mm.name).join(" + "),
        exercises: bodyPartOrder.flatMap((p) => byBodyPart.get(p)!),
      };
    }

    setMenu(combinedMenu);

    // 各種目の「揃った重量レベル到達数」と、各セットの「前回実績」を並列取得。
    // 前回実績は「同名種目の最新セッション」をメニュー横断で参照する（A案: TOP→TOP マッチ、
    // バックオフは set_number 一致のみ）。
    const [milestoneEntries, prevEntriesNested] = await Promise.all([
      Promise.all(
        combinedMenu.exercises.map(async (ex) => [
          ex.id,
          await getEqualWeightMilestones(ex.id),
        ] as const),
      ),
      Promise.all(
        combinedMenu.exercises.map(async (ex) => {
          const session = await getLastSessionForExerciseName(userId, ex.name);
          const sortedSets = [...ex.sets].sort((a, b) => a.set_number - b.set_number);
          return sortedSets.map((s, i): readonly [string, { weight: number; reps: number } | null] => {
            if (!session) return [s.id, null] as const;
            const isTop = i === sortedSets.length - 1;
            const target = isTop ? session.topSetNumber : s.set_number;
            const log = session.bySetNumber.get(target);
            return [s.id, log ?? null] as const;
          });
        }),
      ),
    ]);
    setMilestones(Object.fromEntries(milestoneEntries));
    setPrevActuals(Object.fromEntries(prevEntriesNested.flat()));

    setLoading(false);
  }, []);

  useEffect(() => {
    fetchTodayMenu();
  }, [fetchTodayMenu]);

  // ページが表面に戻った時に日付が変わっていたらリセット＆再取得
  useEffect(() => {
    function checkDayRollover() {
      if (typeof document !== "undefined" && document.visibilityState !== "visible") return;
      const nowKey = todayKey();
      if (nowKey !== lastDateRef.current) {
        lastDateRef.current = nowKey;
        syncDay();
        fetchTodayMenu();
      }
    }
    document.addEventListener("visibilitychange", checkDayRollover);
    window.addEventListener("focus", checkDayRollover);
    return () => {
      document.removeEventListener("visibilitychange", checkDayRollover);
      window.removeEventListener("focus", checkDayRollover);
    };
  }, [syncDay, fetchTodayMenu]);

  function addCompleted(exerciseId: string) {
    setCompletedIds((prev) => {
      const next = new Set(prev);
      next.add(exerciseId);
      try {
        localStorage.setItem(
          COMPLETED_KEY_PREFIX + todayKey(),
          JSON.stringify([...next])
        );
      } catch {}
      return next;
    });
  }

  async function startComplete(exercise: ExerciseWithSets) {
    const sortedSets = [...exercise.sets].sort((a, b) => a.set_number - b.set_number);
    // 同名種目の最新セッションを1回引いて、TOP→TOP / バックオフ→set_number一致 で割り当て。
    const userId = await getCurrentUserId();
    const session = userId ? await getLastSessionForExerciseName(userId, exercise.name) : null;
    const prevList = sortedSets.map((s, i): { weight: number; reps: number } | null => {
      if (!session) return null;
      const isTop = i === sortedSets.length - 1;
      const target = isTop ? session.topSetNumber : s.set_number;
      return session.bySetNumber.get(target) ?? null;
    });
    setActualsModal({
      exerciseId: exercise.id,
      exerciseName: exercise.name,
      isAssisted: exercise.is_assisted,
      weightStep: exercise.weight_step ?? 2.5,
      rows: sortedSets.map((s, i) => ({
        set_id: s.id,
        set_number: s.set_number,
        planned_weight: s.weight,
        planned_reps: s.reps,
        actual_weight: s.weight,
        actual_reps: s.reps,
        previous_actual_reps: prevList[i]?.reps ?? null,
      })),
    });
    setRevealedId(null);
  }

  function updateActualRow(idx: number, field: "actual_weight" | "actual_reps", val: number) {
    setActualsModal((prev) => {
      if (!prev) return prev;
      const rows = prev.rows.map((r, i) => (i === idx ? { ...r, [field]: val } : r));
      return { ...prev, rows };
    });
  }

  async function saveActuals() {
    if (!actualsModal || savingActuals) return;
    setSavingActuals(true);
    setSaveError(null);
    try {
      const userId = await getCurrentUserId();
      if (!userId) {
        setSaveError("ログイン情報がありません。一度オンラインでログインしてください。");
        return;
      }

      const performedAt = nowIso();
      // Step 1: set_logs 書き込み（履歴は常に残す）
      try {
        await Promise.all(
          actualsModal.rows.map((r) =>
            putSetLog({
              id: newId(),
              set_id: r.set_id,
              exercise_id: actualsModal.exerciseId,
              user_id: userId,
              performed_at: performedAt,
              set_number: r.set_number,
              planned_weight: r.planned_weight,
              planned_reps: r.planned_reps,
              actual_weight: r.actual_weight,
              actual_reps: r.actual_reps,
              is_assisted: actualsModal.isAssisted,
              rir: null,
            }),
          ),
        );
      } catch (e) {
        setSaveError(
          `保存に失敗しました: ${e instanceof Error ? e.message : String(e)}`
        );
        return;
      }

      // Step 2: 重量が実績≠予定のセットを抽出し、自メニューの計画値を実績値に更新（A案）。
      // レップ数は同期しない（前回値として表示するのみ）。
      const weightChangedRows = actualsModal.rows.filter(
        (r) => r.actual_weight !== r.planned_weight,
      );
      const sourceExercise = menu?.exercises.find(
        (e) => e.id === actualsModal.exerciseId,
      );
      if (weightChangedRows.length > 0 && sourceExercise) {
        for (const row of weightChangedRows) {
          const targetSet = sourceExercise.sets.find((s) => s.id === row.set_id);
          if (!targetSet) continue;
          await updateSetLocal({
            ...targetSet,
            weight: row.actual_weight,
          });
        }
      }

      runSync().catch(() => {});
      addCompleted(actualsModal.exerciseId);

      // 次回の "前回" 表示・"更新回数" の即時反映のため、当該種目だけ再取得して上書き。
      // 前回値は「同名種目の最新セッション」を1回引いて TOP→TOP / バックオフ→set_number で割り当て。
      const exId = actualsModal.exerciseId;
      const [newMilestone, newSession] = await Promise.all([
        getEqualWeightMilestones(exId),
        getLastSessionForExerciseName(userId, actualsModal.exerciseName),
      ]);
      setMilestones((m) => ({ ...m, [exId]: newMilestone }));
      setPrevActuals((p) => {
        const next = { ...p };
        actualsModal.rows.forEach((r, i) => {
          if (!newSession) {
            next[r.set_id] = null;
            return;
          }
          const isTop = i === actualsModal.rows.length - 1;
          const target = isTop ? newSession.topSetNumber : r.set_number;
          next[r.set_id] = newSession.bySetNumber.get(target) ?? null;
        });
        return next;
      });

      // Step 3: 同名種目を持つ他メニューを探し、あれば反映確認ダイアログを開く。
      // ダイアログは自メニュー更新の後に開く（A案：自分は常に更新、他は選択）。
      if (weightChangedRows.length > 0 && sourceExercise) {
        const normalizedName = normalizeExerciseName(sourceExercise.name);
        if (normalizedName) {
          const sourceMenuId = sourceExercise.menu_id;
          const allMenus = await getMenusWithExercisesForUser(userId);
          const targetMenus: SyncTargetMenu[] = [];
          for (const m of allMenus) {
            if (m.id === sourceMenuId) continue;
            const matchingEx = m.exercises.find(
              (e) => normalizeExerciseName(e.name) === normalizedName,
            );
            if (!matchingEx) continue;
            const currentByNumber: Record<number, { weight: number; reps: number }> = {};
            for (const s of matchingEx.sets) {
              currentByNumber[s.set_number] = { weight: s.weight, reps: s.reps };
            }
            // 初期チェック: 変更セットの set_number が存在し、target の現在重量 == 変更前の予定重量
            let allMatch = true;
            let hasAny = false;
            for (const row of weightChangedRows) {
              const cur = currentByNumber[row.set_number];
              if (!cur) {
                allMatch = false;
                continue;
              }
              hasAny = true;
              if (cur.weight !== row.planned_weight) allMatch = false;
            }
            targetMenus.push({
              menu_id: m.id,
              menu_name: m.name,
              exercise_id: matchingEx.id,
              current_by_number: currentByNumber,
              initially_checked: hasAny && allMatch,
            });
          }
          if (targetMenus.length > 0) {
            const changedSets: ChangedSet[] = weightChangedRows.map((r) => ({
              set_number: r.set_number,
              old_weight: r.planned_weight,
              new_weight: r.actual_weight,
              old_reps: r.planned_reps,
              new_reps: r.actual_reps,
              weight_changed: true,
              reps_changed: false,
            }));
            // ダイアログ表示中はモーダルは閉じる（背景）
            setActualsModal(null);
            setSyncDialog({
              entries: [
                {
                  exercise_name: sourceExercise.name,
                  changed_sets: changedSets,
                  target_menus: targetMenus,
                },
              ],
              changedSets,
              normalizedName,
            });
            return;
          }
        }
      }

      setActualsModal(null);
    } finally {
      setSavingActuals(false);
    }
  }

  // 反映確認ダイアログ「決定」: 選択された他メニューに対して同名種目の該当 set_number を上書き。
  async function handleSyncConfirm(selectedByEntry: string[][]) {
    if (!syncDialog) return;
    const selectedMenuIds = selectedByEntry[0] ?? [];
    const { entries, changedSets } = syncDialog;
    const targets = entries[0].target_menus;
    setSyncDialog(null);
    if (selectedMenuIds.length === 0) return;
    try {
      const userId = await getCurrentUserId();
      if (!userId) return;
      // savedMenus 相当のスナップショットを再取得して target のセット ID を解決
      const allMenus = await getMenusWithExercisesForUser(userId);
      for (const target of targets) {
        if (!selectedMenuIds.includes(target.menu_id)) continue;
        const targetMenu = allMenus.find((m) => m.id === target.menu_id);
        if (!targetMenu) continue;
        const targetEx = targetMenu.exercises.find(
          (e) => e.id === target.exercise_id,
        );
        if (!targetEx) continue;
        for (const cs of changedSets) {
          const ts = targetEx.sets.find((s) => s.set_number === cs.set_number);
          if (!ts) continue;
          await updateSetLocal({ ...ts, weight: cs.new_weight });
        }
      }
      runSync().catch(() => {});
    } catch (e) {
      console.error("他メニューへの反映に失敗しました", e);
    }
  }

  function handleSyncCancel() {
    setSyncDialog(null);
  }

  function handleSwipeStart(e: React.TouchEvent, exId: string) {
    swipeStartRef.current = {
      id: exId,
      x: e.touches[0].clientX,
      y: e.touches[0].clientY,
    };
  }

  function handleSwipeEnd(e: React.TouchEvent, exId: string) {
    const start = swipeStartRef.current;
    swipeStartRef.current = null;
    if (!start || start.id !== exId) return;
    const dx = e.changedTouches[0].clientX - start.x;
    const dy = e.changedTouches[0].clientY - start.y;
    if (Math.abs(dy) > Math.abs(dx)) return;
    if (dx < -50) {
      setRevealedId(exId);
    } else if (dx > 50) {
      setRevealedId((cur) => (cur === exId ? null : cur));
    }
  }

  // 完了していない種目を部位ごとにグルーピング
  const visibleGroups = useMemo(() => {
    if (!menu) return [];
    const groups: { body_part: string; exercises: ExerciseWithSets[] }[] = [];
    for (const ex of menu.exercises) {
      if (completedIds.has(ex.id)) continue;
      const last = groups[groups.length - 1];
      if (last && last.body_part === ex.body_part) {
        last.exercises.push(ex);
      } else {
        groups.push({ body_part: ex.body_part, exercises: [ex] });
      }
    }
    return groups;
  }, [menu, completedIds]);

  const isComplete =
    menu !== null && menu.exercises.length > 0 && visibleGroups.length === 0;

  if (loading) {
    return (
      <div className="pb-2">
        <div className="flex items-center justify-end px-4 pt-4 pb-2">
          <HeaderMenu />
        </div>
        <div className="flex items-center justify-center h-40 text-sm text-gray-500">読み込み中...</div>
      </div>
    );
  }

  if (!menu) {
    return (
      <div className="pb-2">
        <div className="flex items-center justify-end px-4 pt-4 pb-2">
          <HeaderMenu />
        </div>
        <div className="flex items-center justify-center h-60">
          <span className="text-5xl font-extrabold tracking-widest text-gray-700">
            休み
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className="pb-2">
      {/* ヘッダー */}
      <div className="flex items-center justify-between px-4 pt-4 pb-2 gap-2">
        <span className="text-base font-bold whitespace-nowrap flex-shrink-0">今日の筋トレメニュー</span>
        <div
          className="bg-gray-200 rounded px-3 py-1 text-sm truncate flex-1 min-w-0"
          title={menu.name}
        >
          {menu.name}
        </div>
        <HeaderMenu />
      </div>
      <div className="h-px bg-gray-400 mx-4 mb-3" />

      {isComplete ? (
        <div className="flex flex-col items-center justify-center py-20 gap-3">
          <span className="text-4xl font-extrabold tracking-widest text-gray-800">
            コンプリート
          </span>
          <p className="text-xs text-gray-500">本日のメニューをすべて完了しました</p>
        </div>
      ) : (
        <>
          {visibleGroups.map((group, gIdx) => (
            <div key={`${group.body_part}-${gIdx}`}>
              {group.exercises.map((ex, exIdxInGroup) => {
                  const machineHeight =
                    ex.sets.find((s) => s.machine_height)?.machine_height || "";
                  const isGroupHead = exIdxInGroup === 0;
                  const isRevealed = revealedId === ex.id;
                  const isLast =
                    gIdx === visibleGroups.length - 1 &&
                    exIdxInGroup === group.exercises.length - 1;
                  return (
                    <div key={ex.id}>
                      <div className="relative overflow-hidden">
                        {/* 完了ボタン（背面）→ 実績入力モーダルを開く */}
                        <button
                          onClick={() => startComplete(ex)}
                          className="absolute right-0 top-0 bottom-0 w-20 flex items-center justify-center bg-emerald-500 text-white text-sm font-bold"
                        >
                          完了
                        </button>

                        {/* スワイプ可能な前面 */}
                        <div
                          className="bg-white relative transition-transform duration-200 ease-out"
                          style={{
                            transform: isRevealed ? "translateX(-80px)" : "translateX(0)",
                          }}
                          onTouchStart={(e) => handleSwipeStart(e, ex.id)}
                          onTouchEnd={(e) => handleSwipeEnd(e, ex.id)}
                        >
                          <div className="px-4 py-2">
                            {/* 部位（グループ先頭のみ） + 更新回数（バックオフ=TOP に揃った重量レベル到達数） */}
                            <div className="flex items-center justify-between mb-1">
                              {isGroupHead ? (
                                <div className={`inline-flex px-3 py-1 border rounded-full text-sm font-bold ${bodyPartChipClass(ex.body_part)}`}>
                                  【{ex.body_part}】
                                </div>
                              ) : (
                                <span />
                              )}
                              <span
                                className={`text-xs font-bold ${
                                  (milestones[ex.id] ?? 0) > 0
                                    ? "text-emerald-600"
                                    : "text-gray-500"
                                }`}
                                title="バックオフ重量が TOP と同じ重量に揃った回数"
                              >
                                更新 {milestones[ex.id] ?? 0}回
                              </span>
                            </div>

                            {/* 種目名 + 椅子の高さ */}
                            <div className="flex items-center gap-2 mb-2">
                              <div className="bg-white border border-gray-400 rounded-full px-3 py-1 text-sm font-bold flex-1">
                                {ex.name}
                              </div>
                              {machineHeight && (
                                <div className="bg-gray-100 border border-gray-300 rounded-full px-3 py-1 text-xs text-gray-700 whitespace-nowrap">
                                  椅子: {machineHeight}
                                </div>
                              )}
                            </div>

                            {/* セットリスト（末尾=TOP、その他=バックオフ）。
                                各セットの下に「前回 Xkg ×Y」を表示。 */}
                            {ex.sets.map((s: WorkoutSet, sIdx) => {
                              const isTop = sIdx === ex.sets.length - 1;
                              const prev = prevActuals[s.id];
                              return (
                                <div key={s.id} className="mb-1.5">
                                  <div className="flex items-center gap-2 pl-4">
                                    <div
                                      className={`flex items-center justify-center w-6 h-6 rounded text-xs font-bold ${
                                        isTop
                                          ? "bg-gray-800 text-white"
                                          : "bg-gray-200"
                                      }`}
                                    >
                                      {s.set_number}
                                    </div>
                                    {/* 重量チップ（塗りつぶし）。TOP は amber でアクセント */}
                                    <div
                                      className={`flex-1 rounded-full py-1 text-sm font-bold text-center ${
                                        isTop
                                          ? "bg-amber-100 border border-amber-500 text-amber-900"
                                          : "bg-gray-200"
                                      }`}
                                    >
                                      {formatWeight(s.weight, ex.is_assisted)}
                                      {isTop && (
                                        <span className="ml-1 text-[11px] font-bold">TOP</span>
                                      )}
                                    </div>
                                    {/* レップチップ（白＋枠線で重量と形状を差別化）+ 「×」prefix */}
                                    <div
                                      className={`flex-1 rounded-full py-1 text-sm text-center border ${
                                        isTop
                                          ? "bg-white border-amber-500 text-amber-900 font-bold"
                                          : "bg-white border-gray-300"
                                      }`}
                                    >
                                      × {s.reps}回
                                    </div>
                                  </div>
                                  {prev && (
                                    <div className="pl-11 text-[11px] text-gray-600 mt-0.5">
                                      前回 {formatWeight(prev.weight, ex.is_assisted)} × {prev.reps}回
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      </div>

                      {!isLast && <div className="h-px bg-gray-300 mx-4 my-1" />}
                    </div>
                  );
                })}
            </div>
          ))}

          <p className="text-center text-xs text-gray-500 mt-3">
            ← 種目を左にスワイプで「完了」
          </p>
        </>
      )}

      {/* 実績入力モーダル */}
      {actualsModal && (
        <div
          className="fixed inset-0 bg-black/40 z-50 flex items-end"
          onClick={() => setActualsModal(null)}
        >
          <div
            className="w-full max-w-[430px] mx-auto bg-white rounded-t-2xl p-4 pb-8 max-h-[85vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="text-center text-base font-bold mb-1">
              {actualsModal.exerciseName} の実績
            </p>
            <p className="text-center text-xs text-gray-500 mb-3">
              予定通りなら何もしないで「記録して完了」を押してください
            </p>

            {actualsModal.rows.map((row, idx) => {
              const isTop = idx === actualsModal.rows.length - 1;
              return (
              <div key={row.set_id} className="mb-3 p-2 bg-gray-50 rounded-xl">
                <div className="flex items-center gap-2 mb-1.5">
                  <div
                    className={`flex items-center justify-center w-6 h-6 rounded text-xs font-bold ${
                      isTop ? "bg-gray-800 text-white" : "bg-gray-300"
                    }`}
                  >
                    {row.set_number}
                  </div>
                  <span className="text-xs text-gray-600">
                    予定 {formatWeight(row.planned_weight, actualsModal.isAssisted)} × {row.planned_reps}回
                  </span>
                  {/* 前回値（予定と同じなら非表示）。前回より落とさない動機づけ用 */}
                  {row.previous_actual_reps !== null &&
                    row.previous_actual_reps !== row.planned_reps && (
                      <span
                        className={`text-xs font-bold ${
                          row.previous_actual_reps > row.planned_reps
                            ? "text-emerald-600"
                            : "text-red-500"
                        }`}
                      >
                        前回 {row.previous_actual_reps}回 (
                        {row.previous_actual_reps > row.planned_reps ? "+" : ""}
                        {row.previous_actual_reps - row.planned_reps})
                      </span>
                    )}
                  {isTop && (
                    <span className="text-[11px] font-bold text-gray-800 ml-auto">TOP（限界まで）</span>
                  )}
                </div>
                <div className="flex items-center gap-1.5 pl-7">
                  {/* 実重量 */}
                  <button
                    className="w-8 h-8 bg-gray-200 rounded-full text-base font-bold leading-none"
                    onClick={() =>
                      updateActualRow(
                        idx,
                        "actual_weight",
                        Math.max(0, roundToStep(row.actual_weight - actualsModal.weightStep, actualsModal.weightStep))
                      )
                    }
                  >
                    −
                  </button>
                  <input
                    type="number"
                    inputMode="decimal"
                    min={0}
                    step={actualsModal.weightStep}
                    value={row.actual_weight === 0 ? "" : row.actual_weight}
                    placeholder="0"
                    onChange={(e) => {
                      const str = e.target.value;
                      if (str === "") {
                        updateActualRow(idx, "actual_weight", 0);
                        return;
                      }
                      const v = parseFloat(str);
                      if (Number.isFinite(v) && v >= 0) {
                        updateActualRow(idx, "actual_weight", v);
                      }
                    }}
                    onFocus={(e) => e.currentTarget.select()}
                    className="min-w-[64px] w-16 text-center text-sm font-bold bg-gray-100 border border-gray-300 rounded outline-none"
                  />
                  <button
                    className="w-8 h-8 bg-gray-200 rounded-full text-base font-bold leading-none"
                    onClick={() =>
                      updateActualRow(
                        idx,
                        "actual_weight",
                        roundToStep(row.actual_weight + actualsModal.weightStep, actualsModal.weightStep)
                      )
                    }
                  >
                    ＋
                  </button>
                  <span className="mx-1 text-sm">×</span>
                  {/* 実レップ */}
                  <button
                    className="w-8 h-8 bg-gray-200 rounded-full text-base font-bold leading-none"
                    onClick={() =>
                      updateActualRow(idx, "actual_reps", Math.max(0, row.actual_reps - 1))
                    }
                  >
                    −
                  </button>
                  <span className="min-w-[40px] text-center text-sm font-bold">
                    {row.actual_reps}回
                  </span>
                  <button
                    className="w-8 h-8 bg-gray-200 rounded-full text-base font-bold leading-none"
                    onClick={() =>
                      updateActualRow(idx, "actual_reps", row.actual_reps + 1)
                    }
                  >
                    ＋
                  </button>
                </div>
              </div>
              );
            })}

            {saveError && (
              <div className="mb-3 p-2 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700 whitespace-pre-wrap">
                {saveError}
              </div>
            )}

            <div className="flex gap-2 mt-4">
              <button
                onClick={() => {
                  setActualsModal(null);
                  setSaveError(null);
                }}
                disabled={savingActuals}
                className="flex-1 py-2.5 bg-gray-200 rounded-full text-sm font-bold disabled:opacity-50"
              >
                キャンセル
              </button>
              <button
                onClick={saveActuals}
                disabled={savingActuals}
                className="flex-1 py-2.5 bg-gray-800 text-white rounded-full text-sm font-bold disabled:opacity-50"
              >
                {savingActuals ? "保存中..." : "記録して完了"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* クロスメニュー反映ダイアログ。記録保存で重量変更があった時に開く。
          記録は重量のみ反映する（レップ数は反映しないので sync_reps=false）。 */}
      {syncDialog && (
        <CrossMenuSyncDialog
          entries={syncDialog.entries}
          sync_reps={false}
          onConfirm={handleSyncConfirm}
          onCancel={handleSyncCancel}
        />
      )}

    </div>
  );
}
