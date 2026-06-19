"use client";

import { useState, useEffect, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Menu, MenuWithExercises, WorkoutSet } from "@/lib/types";

const DAY_MAP: Record<number, string> = {
  0: "日",
  1: "月",
  2: "火",
  3: "水",
  4: "木",
  5: "金",
  6: "土",
};

interface WeightModal {
  setId: string;
  oldWeight: number;
  newWeight: number;
  exerciseName: string;
}

function isMenuActiveToday(menu: Menu): boolean {
  const today = new Date();
  const todayLabel = DAY_MAP[today.getDay()];

  if (menu.days && menu.days.includes(todayLabel)) return true;

  if (menu.interval_days && menu.start_date) {
    const start = new Date(menu.start_date);
    const diffMs = today.setHours(0, 0, 0, 0) - start.setHours(0, 0, 0, 0);
    const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));
    if (diffDays >= 0 && diffDays % menu.interval_days === 0) return true;
  }

  return false;
}

export default function MainPage() {
  const supabase = createClient();
  const [menu, setMenu] = useState<MenuWithExercises | null>(null);
  const [updateCounts, setUpdateCounts] = useState<Record<string, number>>({});
  const [modal, setModal] = useState<WeightModal | null>(null);
  const [loading, setLoading] = useState(true);
  const [noMenuToday, setNoMenuToday] = useState(false);

  const fetchTodayMenu = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { data: allMenus } = await supabase
      .from("menus")
      .select("*, exercises(*, sets(*))")
      .eq("user_id", user.id)
      .order("order_index");

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

    const m = todayMenus[0] as MenuWithExercises;
    m.exercises = m.exercises.map((ex) => ({
      ...ex,
      sets: ex.sets.sort((a: WorkoutSet, b: WorkoutSet) => a.set_number - b.set_number),
    }));
    setMenu(m);
    setNoMenuToday(false);

    // 重量更新回数を取得
    const setIds = m.exercises.flatMap((ex) => ex.sets.map((s: WorkoutSet) => s.id));
    if (setIds.length > 0) {
      const { data: updates } = await supabase
        .from("weight_updates")
        .select("set_id")
        .in("set_id", setIds);

      const counts: Record<string, number> = {};
      (updates || []).forEach((u: { set_id: string }) => {
        counts[u.set_id] = (counts[u.set_id] || 0) + 1;
      });
      const exCounts: Record<string, number> = {};
      m.exercises.forEach((ex) => {
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
  }, [supabase]);

  useEffect(() => {
    fetchTodayMenu();
  }, [fetchTodayMenu]);

  function openWeightModal(s: WorkoutSet, exerciseName: string) {
    setModal({
      setId: s.id,
      oldWeight: s.weight,
      newWeight: +(s.weight + 0.5).toFixed(1),
      exerciseName,
    });
  }

  async function saveWeightUpdate() {
    if (!modal) return;
    if (modal.newWeight <= modal.oldWeight) return;

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { error: insertError } = await supabase.from("weight_updates").insert({
      set_id: modal.setId,
      user_id: user.id,
      old_weight: modal.oldWeight,
      new_weight: modal.newWeight,
    });
    if (insertError) {
      console.error("重量更新の保存に失敗しました", insertError);
      return;
    }

    const { error: updateError } = await supabase
      .from("sets")
      .update({ weight: modal.newWeight })
      .eq("id", modal.setId);
    if (updateError) {
      console.error("セットの更新に失敗しました", updateError);
      return;
    }

    setModal(null);
    await fetchTodayMenu();
  }

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

      {/* 種目リスト */}
      {menu.exercises.map((ex, exIdx) => {
        const memos = ex.sets.map((s) => s.memo).filter((m): m is string => !!m && m.length > 0);
        const uniqueMemos = Array.from(new Set(memos));
        return (
          <div key={ex.id}>
            <div className="px-4 py-2">
              {/* 部位 + 更新回数 */}
              <div className="flex items-center justify-between mb-1">
                <div className="inline-flex px-3 py-1 border border-gray-400 rounded-full text-xs">
                  【{ex.body_part}】
                </div>
                <span className="text-xs text-gray-500">
                  重量更新回数{updateCounts[ex.id] || 0}回
                </span>
              </div>

              {/* 種目名 */}
              <div className="flex items-center gap-2 mb-2">
                <span className="text-sm">●</span>
                <div className="bg-gray-200 rounded-full px-3 py-1 text-xs flex-1">
                  {ex.name}
                </div>
              </div>

              {/* セットリスト */}
              {ex.sets.map((s: WorkoutSet) => (
                <div key={s.id} className="flex items-center gap-2 mb-1.5 pl-4">
                  <div className="flex items-center justify-center w-5 h-5 bg-gray-200 rounded text-xs">
                    {s.set_number}
                  </div>
                  <div className="flex-1 bg-gray-200 rounded-full py-1 text-xs text-center">
                    {s.weight}kg
                  </div>
                  <div className="flex-1 bg-gray-200 rounded-full py-1 text-xs text-center">
                    {s.reps}回
                  </div>
                  <button
                    onClick={() => openWeightModal(s, ex.name)}
                    className="px-2 py-1 bg-gray-300 rounded-full text-xs font-bold whitespace-nowrap"
                  >
                    重量更新
                  </button>
                </div>
              ))}

              {/* メモ */}
              {uniqueMemos.length > 0 && (
                <div className="mt-2 pl-4 space-y-1">
                  {uniqueMemos.map((m, i) => (
                    <div key={i} className="bg-gray-200 rounded-xl px-3 py-2 text-xs">
                      {m}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {exIdx < menu.exercises.length - 1 && (
              <div className="h-px bg-black mx-4 my-1" />
            )}
          </div>
        );
      })}

      {/* 重量更新モーダル */}
      {modal && (
        <div
          className="fixed inset-0 bg-black/40 z-50 flex items-end"
          onClick={() => setModal(null)}
        >
          <div
            className="w-full max-w-[430px] mx-auto bg-white rounded-t-2xl p-4 pb-8"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="text-center text-sm font-bold mb-1">{modal.exerciseName}</p>
            <p className="text-center text-xs text-gray-500 mb-3">
              現在: {modal.oldWeight}kg → 新しい重量を選択
            </p>
            <div className="flex items-center gap-4">
              <div className="flex-1">
                <div className="flex items-center gap-2 justify-center">
                  <button
                    className="w-10 h-10 bg-gray-200 rounded-full text-xl font-bold disabled:opacity-30"
                    disabled={modal.newWeight - 0.5 <= modal.oldWeight}
                    onClick={() =>
                      setModal((m) =>
                        m
                          ? {
                              ...m,
                              newWeight: Math.max(
                                +(m.oldWeight + 0.5).toFixed(1),
                                +(m.newWeight - 0.5).toFixed(1)
                              ),
                            }
                          : m
                      )
                    }
                  >
                    −
                  </button>
                  <span className="text-2xl font-bold w-24 text-center">
                    {modal.newWeight}<span className="text-sm ml-1">kg</span>
                  </span>
                  <button
                    className="w-10 h-10 bg-gray-200 rounded-full text-xl font-bold"
                    onClick={() =>
                      setModal((m) =>
                        m ? { ...m, newWeight: +(m.newWeight + 0.5).toFixed(1) } : m
                      )
                    }
                  >
                    ＋
                  </button>
                </div>
                <p className="text-center text-[10px] text-gray-400 mt-2">
                  ※ 現在の重量より大きい値のみ選択可能
                </p>
              </div>
            </div>
            <div className="flex gap-2 mt-4">
              <button
                onClick={() => setModal(null)}
                className="flex-1 py-2.5 bg-gray-200 rounded-full text-sm font-bold"
              >
                キャンセル
              </button>
              <button
                onClick={saveWeightUpdate}
                disabled={modal.newWeight <= modal.oldWeight}
                className="flex-1 py-2.5 bg-gray-800 text-white rounded-full text-sm font-bold disabled:opacity-50"
              >
                更新する
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
