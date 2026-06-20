"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import {
  getMenusWithExercisesForUser,
  getWeightUpdateCountsForSets,
  getTopSetDeltaHistory,
  getLastActualRepsForSet,
  updateSet as updateSetLocal,
  putSetLog,
  putWeightUpdate,
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
import { roundToStep, formatWeight } from "@/lib/types";

interface ActualRow {
  set_id: string;
  set_number: number;
  planned_weight: number;
  planned_reps: number;
  actual_weight: number;
  actual_reps: number;
  backoff_ratio: number | null;
  // 前回そのセットを記録した時の実レップ。履歴なしなら null。
  previous_actual_reps: number | null;
}

interface ActualsModal {
  exerciseId: string;
  exerciseName: string;
  isAssisted: boolean;
  weightStep: number;
  rows: ActualRow[];
}

interface ProgressionSuggestion {
  exerciseId: string;
  exerciseName: string;
  isAssisted: boolean;
  topPlanned: number;
  topActual: number;
  topDelta: number; // 実 - 予定
  streak: number; // 同じ方向（オーバー / 不足）が連続したセッション数（今回含む）
  // 'up' = TOP のみ kg 加算
  // 'down' = 全セット kg 減算（均一時のみ）
  // 'down-to-match' = TOP のみ、最大バックオフに合わせる（不均一時の DOWN）
  // 'hold' = 提案なし
  action: "up" | "down" | "down-to-match" | "hold";
  step: number;
  // 全セットの重量が同一か。UP は揃ってる時しか提案しない（揃ってないなら upBlocked になる）。
  allEqual: boolean;
  // UP の信号は立ったが全セット未揃いのため現状維持
  upBlocked: boolean;
  // 非 TOP セットの最大重量（down-to-match で TOP を揃える先）
  maxBackoffWeight: number;
  // TOP 以外のセットで「予定回数に届かなかったもの」。重量判断には使わず、情報として表示するだけ。
  backoffShortages: { setNumber: number; planned: number; actual: number }[];
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
  const today = new Date();
  const todayLabel = DAY_MAP[today.getDay()];

  // 間隔モード（起点曜日 + 間隔）：start_date を基準に N 日おきで判定。
  // 起点曜日の合致は条件にしない（毎週その曜日に活性化、にならない）。
  if (menu.interval_days && menu.start_date) {
    const start = new Date(menu.start_date);
    const diffMs = today.setHours(0, 0, 0, 0) - start.setHours(0, 0, 0, 0);
    const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));
    if (diffDays >= 0 && diffDays % menu.interval_days === 0) return true;
    return false;
  }

  // 曜日のみモード：曜日リストに今日が含まれるか
  if (menu.days && menu.days.includes(todayLabel)) return true;

  return false;
}

function todayKey(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export default function MainPage() {
  const [menu, setMenu] = useState<MenuWithExercises | null>(null);
  const [updateCounts, setUpdateCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [noMenuToday, setNoMenuToday] = useState(false);
  const [memoEdits, setMemoEdits] = useState<Record<string, string>>({});
  const [savingMemo, setSavingMemo] = useState<string | null>(null);
  const [completedIds, setCompletedIds] = useState<Set<string>>(new Set());
  const [revealedId, setRevealedId] = useState<string | null>(null);
  const [actualsModal, setActualsModal] = useState<ActualsModal | null>(null);
  const [savingActuals, setSavingActuals] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [progression, setProgression] = useState<ProgressionSuggestion | null>(null);
  // 「計画に反映」で実際に上げ下げする kg（文字列で持っておくと空欄編集中の状態が綺麗）
  const [progressionDeltaInput, setProgressionDeltaInput] = useState<string>("");
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
      setNoMenuToday(false);
      setLoading(false);
      return;
    }

    const todayMenus = allMenus.filter(isMenuActiveToday);

    if (todayMenus.length === 0) {
      setMenu(null);
      setNoMenuToday(true);
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
    setNoMenuToday(false);

    // 重量更新回数を取得
    const setIds = combinedMenu.exercises.flatMap((ex) => ex.sets.map((s) => s.id));
    if (setIds.length > 0) {
      const counts = await getWeightUpdateCountsForSets(setIds);
      const exCounts: Record<string, number> = {};
      combinedMenu.exercises.forEach((ex) => {
        exCounts[ex.id] = ex.sets.reduce(
          (sum: number, s: WorkoutSet) => sum + (counts[s.id] || 0),
          0
        );
      });
      setUpdateCounts(exCounts);
    } else {
      setUpdateCounts({});
    }

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

  async function saveMemo(exerciseId: string, setIds: string[], memo: string) {
    setSavingMemo(exerciseId);
    try {
      const target = menu?.exercises.find((e) => e.id === exerciseId);
      if (target) {
        for (const s of target.sets) {
          if (setIds.includes(s.id)) {
            await updateSetLocal({ ...s, memo: memo || null });
          }
        }
      }
      setMenu((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          exercises: prev.exercises.map((ex) =>
            ex.id === exerciseId
              ? { ...ex, sets: ex.sets.map((s) => ({ ...s, memo: memo || null })) }
              : ex
          ),
        };
      });
      runSync().catch(() => {});
    } catch (e) {
      console.error("メモの保存に失敗しました", e);
    } finally {
      setSavingMemo(null);
    }
  }

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
    // 各セットの前回 actual_reps を並列で取得（履歴なしは null）
    const prevReps = await Promise.all(
      sortedSets.map((s) => getLastActualRepsForSet(exercise.id, s.id)),
    );
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
        // 最終セット（=トップ）は ratio を強制的に null にして UI で TOP として扱う
        backoff_ratio:
          i === sortedSets.length - 1 ? null : s.backoff_ratio ?? null,
        previous_actual_reps: prevReps[i],
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
      try {
        for (const r of actualsModal.rows) {
          await putSetLog({
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
          });
        }
      } catch (e) {
        setSaveError(
          `保存に失敗しました: ${e instanceof Error ? e.message : String(e)}`
        );
        return;
      }
      runSync().catch(() => {});

      addCompleted(actualsModal.exerciseId);

      // 進歩判定：トップセットの実 - 予定 と、同じ方向の連続セッション数 (streak) から決める。
      // 重量を「何 kg 上げる／下げる」は前もって表示せず、提案だけ伝える方針。
      const isAssisted = actualsModal.isAssisted;
      const rows = actualsModal.rows;
      const top = rows[rows.length - 1];
      const topDelta = top.actual_reps - top.planned_reps;
      const sign = topDelta > 0 ? 1 : topDelta < 0 ? -1 : 0;

      // 過去ログ（今回のものは IndexedDB に既に書き込み済み）を新しい順で取り、
      // 同じ方向が続いている連続セッション数を数える。
      const history = await getTopSetDeltaHistory(actualsModal.exerciseId);
      let streak = 0;
      if (sign !== 0) {
        for (const h of history) {
          const s = h.delta > 0 ? 1 : h.delta < 0 ? -1 : 0;
          if (s === sign) streak += 1;
          else break;
        }
      }

      // 大幅（±3 回以上）は 1 回で提案、そうでなければ 2 セッション連続で提案。
      const STREAK_THRESHOLD = 2;
      const BIG_DELTA = 3;
      // 全セットの重量が TOP と揃っているか（=ストレートに整っている）。
      // 揃ってない時は UP 信号を出してもユーザーはまずバックオフを追いつかせるべき。
      const baseWeight = rows[0]?.planned_weight ?? 0;
      const allEqual = rows.every((r) => r.planned_weight === baseWeight);
      let action: ProgressionSuggestion["action"] = "hold";
      let upBlocked = false;
      const upSignal =
        sign > 0 && (Math.abs(topDelta) >= BIG_DELTA || streak >= STREAK_THRESHOLD);
      const downSignal =
        sign < 0 && (Math.abs(topDelta) >= BIG_DELTA || streak >= STREAK_THRESHOLD);
      if (upSignal) {
        if (allEqual) action = "up";
        else upBlocked = true;
      } else if (downSignal) {
        action = allEqual ? "down" : "down-to-match";
      }

      // TOP 以外で予定回数に届かなかったセット（情報表示用）。
      // 進歩判定には使わない。
      const backoffShortages = rows
        .slice(0, -1)
        .filter((r) => r.actual_reps < r.planned_reps)
        .map((r) => ({
          setNumber: r.set_number,
          planned: r.planned_reps,
          actual: r.actual_reps,
        }));

      // バックオフの最大重量（down-to-match の TOP 到達先）
      const maxBackoffWeight = rows
        .slice(0, -1)
        .reduce((m, r) => Math.max(m, r.planned_weight), 0);

      setProgression({
        exerciseId: actualsModal.exerciseId,
        exerciseName: actualsModal.exerciseName,
        isAssisted,
        topPlanned: top.planned_reps,
        topActual: top.actual_reps,
        topDelta,
        streak,
        action,
        step: actualsModal.weightStep,
        allEqual,
        upBlocked,
        maxBackoffWeight,
        backoffShortages,
      });
      setProgressionDeltaInput(String(actualsModal.weightStep));

      setActualsModal(null);
    } finally {
      setSavingActuals(false);
    }
  }

  async function applyProgression() {
    if (!progression) return;
    if (progression.action === "hold") {
      setProgression(null);
      return;
    }
    const userId = await getCurrentUserId();
    if (!userId) return;

    const ex = menu?.exercises.find((e) => e.id === progression.exerciseId);
    if (!ex) {
      setProgression(null);
      return;
    }

    const direction = progression.isAssisted ? -1 : 1;
    const sortedSets = [...ex.sets].sort((a, b) => a.set_number - b.set_number);
    const top = sortedSets[sortedSets.length - 1];

    // 適用対象セットと新重量計算を action ごとに決める。
    let updates: { set: WorkoutSet; newWeight: number }[] = [];
    if (progression.action === "down-to-match") {
      // 不均一 + DOWN: TOP を最大バックオフ重量に揃える。入力 kg は使わない。
      const maxBackoff = sortedSets
        .slice(0, -1)
        .reduce((m, s) => Math.max(m, s.weight), 0);
      updates = [{ set: top, newWeight: maxBackoff }];
    } else {
      // UP / DOWN: 入力 kg を使う。空欄や 0 以下は無効。
      const deltaKg = parseFloat(progressionDeltaInput);
      if (!Number.isFinite(deltaKg) || deltaKg <= 0) {
        setProgression(null);
        return;
      }
      const sign = progression.action === "up" ? 1 : -1;
      const targets = progression.action === "up" ? [top] : sortedSets;
      updates = targets.map((s) => ({
        set: s,
        newWeight: Math.max(
          0,
          roundToStep(s.weight + sign * deltaKg * direction, progression.step),
        ),
      }));
    }

    for (const { set: s, newWeight } of updates) {
      if (newWeight === s.weight) continue;
      try {
        await updateSetLocal({
          ...s,
          weight: newWeight,
          backoff_ratio: s.backoff_ratio ?? null,
        });
        await putWeightUpdate({
          id: newId(),
          set_id: s.id,
          user_id: userId,
          old_weight: s.weight,
          new_weight: newWeight,
          updated_at: nowIso(),
        });
      } catch (e) {
        console.error("重量の更新に失敗しました", e);
      }
    }
    runSync().catch(() => {});
    setProgression(null);
    await fetchTodayMenu();
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
    return <div className="flex items-center justify-center h-40 text-sm text-gray-500">読み込み中...</div>;
  }

  if (!menu) {
    return (
      <div className="flex flex-col items-center justify-center h-40 gap-2 px-6 text-center">
        {noMenuToday ? (
          <>
            <p className="text-sm text-gray-500">今日はメニューがありません</p>
            <p className="text-xs text-gray-400">設定画面で曜日を確認してください</p>
          </>
        ) : (
          <p className="text-sm text-gray-500">メニューがまだ設定されていません</p>
        )}
        <a href="/settings" className="text-xs text-blue-500 underline mt-2">設定画面へ</a>
      </div>
    );
  }

  return (
    <div className="pb-2">
      {/* ヘッダー */}
      <div className="flex items-center justify-between px-4 pt-4 pb-2">
        <span className="text-sm font-bold">今日の筋トレメニュー</span>
        <div className="bg-gray-200 rounded px-3 py-1 text-xs">{menu.name}</div>
      </div>
      <div className="h-px bg-black mx-4 mb-3" />

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
                  const currentMemo = ex.sets[0]?.memo || "";
                  const editedMemo = memoEdits[ex.id] ?? currentMemo;
                  const isDirty = editedMemo !== currentMemo;
                  const isSaving = savingMemo === ex.id;
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
                            {/* 部位（グループ先頭のみ） + 更新回数 */}
                            <div className="flex items-center justify-between mb-1">
                              {isGroupHead ? (
                                <div className="inline-flex px-3 py-1 border border-gray-400 rounded-full text-xs">
                                  【{ex.body_part}】
                                </div>
                              ) : (
                                <span />
                              )}
                              <span className="text-xs text-gray-500">
                                重量更新回数{updateCounts[ex.id] || 0}回
                              </span>
                            </div>

                            {/* 種目名 + 椅子の高さ */}
                            <div className="flex items-center gap-2 mb-2">
                              <span className="text-sm">●</span>
                              <div className="bg-gray-200 rounded-full px-3 py-1 text-xs flex-1">
                                {ex.name}
                              </div>
                              {machineHeight && (
                                <div className="bg-gray-200 rounded-full px-3 py-1 text-xs whitespace-nowrap">
                                  椅子: {machineHeight}
                                </div>
                              )}
                            </div>

                            {/* セットリスト（末尾=トップ、その他=バックオフ） */}
                            {ex.sets.map((s: WorkoutSet, sIdx) => {
                              const isTop = sIdx === ex.sets.length - 1;
                              const ratio = s.backoff_ratio;
                              return (
                                <div key={s.id} className="flex items-center gap-2 mb-1.5 pl-4">
                                  <div
                                    className={`flex items-center justify-center w-5 h-5 rounded text-[10px] font-bold ${
                                      isTop
                                        ? "bg-gray-800 text-white"
                                        : "bg-gray-200"
                                    }`}
                                  >
                                    {s.set_number}
                                  </div>
                                  <div className="flex-1 bg-gray-200 rounded-full py-1 text-xs text-center">
                                    {formatWeight(s.weight, ex.is_assisted)}
                                    {isTop ? (
                                      <span className="ml-1 text-[9px] text-gray-700 font-bold">TOP</span>
                                    ) : ratio !== null && ratio !== undefined && ratio < 1 ? (
                                      <span className="ml-1 text-[9px] text-gray-500">
                                        ({Math.round(ratio * 100)}%)
                                      </span>
                                    ) : null}
                                  </div>
                                  <div className="flex-1 bg-gray-200 rounded-full py-1 text-xs text-center">
                                    {s.reps}回
                                  </div>
                                </div>
                              );
                            })}

                            {/* メモ（編集可能） */}
                            <div className="mt-2 pl-4">
                              <textarea
                                value={editedMemo}
                                onChange={(e) =>
                                  setMemoEdits((prev) => ({ ...prev, [ex.id]: e.target.value }))
                                }
                                placeholder="メモを入力"
                                rows={2}
                                className="w-full bg-gray-200 rounded-xl px-3 py-2 text-xs resize-none outline-none placeholder-gray-500"
                              />
                              {isDirty && (
                                <div className="flex justify-end mt-1 gap-2">
                                  <button
                                    onClick={() =>
                                      setMemoEdits((prev) => {
                                        const next = { ...prev };
                                        delete next[ex.id];
                                        return next;
                                      })
                                    }
                                    className="text-[10px] text-gray-500 underline"
                                  >
                                    キャンセル
                                  </button>
                                  <button
                                    onClick={async () => {
                                      const setIds = ex.sets.map((s) => s.id);
                                      await saveMemo(ex.id, setIds, editedMemo);
                                      setMemoEdits((prev) => {
                                        const next = { ...prev };
                                        delete next[ex.id];
                                        return next;
                                      });
                                    }}
                                    disabled={isSaving}
                                    className="text-[10px] bg-gray-800 text-white px-2 py-0.5 rounded-full font-bold disabled:opacity-50"
                                  >
                                    {isSaving ? "保存中..." : "メモを保存"}
                                  </button>
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>

                      {!isLast && <div className="h-px bg-black mx-4 my-1" />}
                    </div>
                  );
                })}
            </div>
          ))}

          <p className="text-center text-[10px] text-gray-400 mt-3">
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
            <p className="text-center text-sm font-bold mb-1">
              {actualsModal.exerciseName} の実績
            </p>
            <p className="text-center text-[10px] text-gray-500 mb-3">
              予定通りなら何もしないで「記録して完了」を押してください
            </p>

            {actualsModal.rows.map((row, idx) => {
              const isTop = idx === actualsModal.rows.length - 1;
              return (
              <div key={row.set_id} className="mb-3 p-2 bg-gray-50 rounded-xl">
                <div className="flex items-center gap-2 mb-1.5">
                  <div
                    className={`flex items-center justify-center w-5 h-5 rounded text-[10px] font-bold ${
                      isTop ? "bg-gray-800 text-white" : "bg-gray-300"
                    }`}
                  >
                    {row.set_number}
                  </div>
                  <span className="text-[10px] text-gray-500">
                    予定 {formatWeight(row.planned_weight, actualsModal.isAssisted)} × {row.planned_reps}回
                  </span>
                  {/* 前回値（予定と同じなら非表示）。前回より落とさない動機づけ用 */}
                  {row.previous_actual_reps !== null &&
                    row.previous_actual_reps !== row.planned_reps && (
                      <span
                        className={`text-[10px] font-bold ${
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
                  {isTop ? (
                    <span className="text-[9px] font-bold text-gray-800 ml-auto">TOP（限界まで）</span>
                  ) : row.backoff_ratio !== null && row.backoff_ratio !== undefined && row.backoff_ratio < 1 ? (
                    <span className="text-[9px] text-gray-500 ml-auto">
                      バックオフ {Math.round(row.backoff_ratio * 100)}%
                    </span>
                  ) : null}
                </div>
                <div className="flex items-center gap-1.5 pl-7">
                  {/* 実重量 */}
                  <button
                    className="w-7 h-7 bg-gray-200 rounded-full text-base font-bold leading-none"
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
                    className="min-w-[64px] w-16 text-center text-xs font-bold bg-gray-100 rounded outline-none"
                  />
                  <button
                    className="w-7 h-7 bg-gray-200 rounded-full text-base font-bold leading-none"
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
                  <span className="mx-1 text-xs">×</span>
                  {/* 実レップ */}
                  <button
                    className="w-7 h-7 bg-gray-200 rounded-full text-base font-bold leading-none"
                    onClick={() =>
                      updateActualRow(idx, "actual_reps", Math.max(0, row.actual_reps - 1))
                    }
                  >
                    −
                  </button>
                  <span className="min-w-[40px] text-center text-xs font-bold">
                    {row.actual_reps}回
                  </span>
                  <button
                    className="w-7 h-7 bg-gray-200 rounded-full text-base font-bold leading-none"
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
              <div className="mb-3 p-2 bg-red-50 border border-red-200 rounded-lg text-[10px] text-red-700 whitespace-pre-wrap">
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

      {/* 進歩提案モーダル：定量的な kg は出さず、超過 / 不足の回数と連続セッション数だけ伝える。 */}
      {progression && (() => {
        const { topPlanned, topActual, topDelta, streak, action } = progression;
        const sign = topDelta > 0 ? 1 : topDelta < 0 ? -1 : 0;
        const STREAK_NEEDED = 2;
        return (
          <div
            className="fixed inset-0 bg-black/40 z-50 flex items-end"
            onClick={() => setProgression(null)}
          >
            <div
              className="w-full max-w-[430px] mx-auto bg-white rounded-t-2xl p-5 pb-8"
              onClick={(e) => e.stopPropagation()}
            >
              <p className="text-center text-base font-bold mb-3">
                {progression.exerciseName}
              </p>
              <p className="text-center text-sm mb-1">
                トップ 予定 {topPlanned}回 → 実 {topActual}回
                <span
                  className={`ml-2 font-bold ${
                    sign > 0
                      ? "text-emerald-600"
                      : sign < 0
                      ? "text-red-500"
                      : "text-gray-500"
                  }`}
                >
                  ({topDelta > 0 ? "+" : ""}
                  {topDelta}回)
                </span>
              </p>
              {sign !== 0 && (
                <p className="text-center text-xs text-gray-600 mb-3">
                  {sign > 0 ? "+回オーバー" : "-回不足"} が{" "}
                  <span className="font-bold">{streak}</span> セッション連続
                </p>
              )}
              {sign === 0 && (
                <p className="text-center text-xs text-gray-600 mb-3">
                  予定通りピッタリ。今の重量で安定中。
                </p>
              )}

              {/* 重量判定とは独立。バックオフ側で予定回数に届かなかったセットを情報表示。 */}
              {progression.backoffShortages.length > 0 && (
                <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mb-3">
                  <p className="text-[10px] font-bold text-amber-800 mb-1">
                    バックオフで予定回数に届かなかったセット
                  </p>
                  {progression.backoffShortages.map((b) => (
                    <p key={b.setNumber} className="text-[10px] text-amber-900">
                      セット{b.setNumber}：予定 {b.planned}回 / 実 {b.actual}回
                      <span className="ml-1 text-amber-700">
                        (-{b.planned - b.actual})
                      </span>
                    </p>
                  ))}
                  <p className="text-[9px] text-amber-700 mt-1">
                    続くようなら、バックオフの予定回数や％の見直しを検討
                  </p>
                </div>
              )}

              {action === "up" && (
                <div className="mb-4">
                  <p className="text-center text-base font-bold text-emerald-700 mb-2">
                    → {progression.isAssisted
                      ? "補助を減らしましょう"
                      : "重量を上げましょう"}
                  </p>
                  <div className="flex items-center justify-center gap-2 text-xs">
                    <span>TOP に</span>
                    <input
                      type="number"
                      inputMode="decimal"
                      min={0}
                      step={progression.step}
                      value={progressionDeltaInput}
                      placeholder={String(progression.step)}
                      onChange={(e) => setProgressionDeltaInput(e.target.value)}
                      onFocus={(e) => e.currentTarget.select()}
                      className="w-16 text-center text-base font-bold bg-gray-100 rounded outline-none py-1"
                    />
                    <span>kg を加算</span>
                  </div>
                  <p className="text-center text-[10px] text-gray-500 mt-1">
                    他のセットはそのまま。自分の判断で後から追いつかせてください。
                  </p>
                </div>
              )}
              {action === "down" && (
                <div className="mb-4">
                  <p className="text-center text-base font-bold text-red-600 mb-2">
                    → {progression.isAssisted
                      ? "補助を増やしましょう"
                      : "重量を下げましょう"}
                  </p>
                  <div className="flex items-center justify-center gap-2 text-xs">
                    <span>全セットから</span>
                    <input
                      type="number"
                      inputMode="decimal"
                      min={0}
                      step={progression.step}
                      value={progressionDeltaInput}
                      placeholder={String(progression.step)}
                      onChange={(e) => setProgressionDeltaInput(e.target.value)}
                      onFocus={(e) => e.currentTarget.select()}
                      className="w-16 text-center text-base font-bold bg-gray-100 rounded outline-none py-1"
                    />
                    <span>kg を減算</span>
                  </div>
                </div>
              )}
              {action === "down-to-match" && (
                <div className="mb-4">
                  <p className="text-center text-base font-bold text-red-600 mb-2">
                    → TOP の重量を下げましょう
                  </p>
                  <p className="text-center text-xs text-gray-700">
                    TOP をバックオフと同じ{" "}
                    <span className="font-bold">{progression.maxBackoffWeight}kg</span>{" "}
                    に戻します
                  </p>
                  <p className="text-center text-[10px] text-gray-500 mt-1">
                    バックオフはそのまま。揃え直してから次の挑戦を。
                  </p>
                </div>
              )}
              {progression.upBlocked && (
                <p className="text-center text-xs text-gray-600 mb-4 px-2">
                  TOP は調子よいけど、他のセットがまだ TOP の重量に追いついていません。
                  まずバックオフの重量を上げて揃ってから次回の signal を待ちましょう。
                </p>
              )}
              {action === "hold" && !progression.upBlocked && sign !== 0 && (
                <p className="text-center text-xs text-gray-500 mb-4">
                  あと {Math.max(0, STREAK_NEEDED - streak)} セッション同じ調子なら提案します
                </p>
              )}

              <div className="flex gap-2">
                {action !== "hold" ? (
                  <>
                    <button
                      onClick={() => setProgression(null)}
                      className="flex-1 py-2.5 bg-gray-200 rounded-full text-sm font-bold"
                    >
                      現状維持
                    </button>
                    <button
                      onClick={applyProgression}
                      className="flex-1 py-2.5 bg-gray-800 text-white rounded-full text-sm font-bold"
                    >
                      計画に反映
                    </button>
                  </>
                ) : (
                  <button
                    onClick={() => setProgression(null)}
                    className="flex-1 py-2.5 bg-gray-800 text-white rounded-full text-sm font-bold"
                  >
                    OK
                  </button>
                )}
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
