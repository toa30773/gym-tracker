"use client";

import { useState, useEffect, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import type { MenuWithExercises, WorkoutSet } from "@/lib/types";

const WEIGHTS = Array.from({ length: 201 }, (_, i) => +(i * 0.5).toFixed(1));
const REPS = Array.from({ length: 20 }, (_, i) => i + 1);

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

export default function MainPage() {
  const supabase = createClient();
  const [menu, setMenu] = useState<MenuWithExercises | null>(null);
  const [updateCounts, setUpdateCounts] = useState<Record<string, number>>({});
  const [modal, setModal] = useState<WeightModal | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchTodayMenu = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const today = DAY_MAP[new Date().getDay()];

    const { data: menus } = await supabase
      .from("menus")
      .select("*, exercises(*, sets(*))")
      .eq("user_id", user.id)
      .contains("days", [today])
      .order("order_index")
      .limit(1);

    if (menus && menus.length > 0) {
      const m = menus[0] as MenuWithExercises;
      m.exercises = m.exercises.map((ex) => ({
        ...ex,
        sets: ex.sets.sort((a: WorkoutSet, b: WorkoutSet) => a.set_number - b.set_number),
      }));
      setMenu(m);

      // 重量更新回数を取得
      const setIds = m.exercises.flatMap((ex) => ex.sets.map((s: WorkoutSet) => s.id));
      if (setIds.length > 0) {
        const { data: updates } = await supabase
          .from("weight_updates")
          .select("set_id")
          .in("set_id", setIds);

        if (updates) {
          const counts: Record<string, number> = {};
          updates.forEach((u) => {
            counts[u.set_id] = (counts[u.set_id] || 0) + 1;
          });
          // 種目ごとの合計を計算
          const exCounts: Record<string, number> = {};
          m.exercises.forEach((ex) => {
            exCounts[ex.id] = ex.sets.reduce((sum: number, s: WorkoutSet) => sum + (counts[s.id] || 0), 0);
          });
          setUpdateCounts(exCounts);
        }
      }
    } else {
      // 今日の曜日に対応するメニューがない場合、最初のメニューを表示
      const { data: allMenus } = await supabase
        .from("menus")
        .select("*, exercises(*, sets(*))")
        .eq("user_id", user.id)
        .order("order_index")
        .limit(1);

      if (allMenus && allMenus.length > 0) {
        const m = allMenus[0] as MenuWithExercises;
        m.exercises = m.exercises.map((ex) => ({
          ...ex,
          sets: ex.sets.sort((a: WorkoutSet, b: WorkoutSet) => a.set_number - b.set_number),
        }));
        setMenu(m);
      }
    }
    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    fetchTodayMenu();
  }, [fetchTodayMenu]);

  async function openWeightModal(s: WorkoutSet, exerciseName: string) {
    setModal({ setId: s.id, oldWeight: s.weight, newWeight: s.weight, exerciseName });
  }

  async function saveWeightUpdate() {
    if (!modal) return;
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    await supabase.from("weight_updates").insert({
      set_id: modal.setId,
      user_id: user.id,
      old_weight: modal.oldWeight,
      new_weight: modal.newWeight,
    });

    await supabase.from("sets").update({ weight: modal.newWeight }).eq("id", modal.setId);

    setModal(null);
    fetchTodayMenu();
  }

  if (loading) {
    return <div className="flex items-center justify-center h-40 text-sm text-gray-500">読み込み中...</div>;
  }

  if (!menu) {
    return (
      <div className="flex flex-col items-center justify-center h-40 gap-2">
        <p className="text-sm text-gray-500">メニューがまだ設定されていません</p>
        <a href="/settings" className="text-xs text-blue-500 underline">設定画面へ</a>
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
      {menu.exercises.map((ex, exIdx) => (
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
            {ex.sets[0]?.memo && (
              <div className="mt-1 pl-4">
                <div className="bg-gray-200 rounded-xl px-3 py-2 text-xs w-[205px]">
                  {ex.sets[0].memo}
                </div>
              </div>
            )}
          </div>

          {exIdx < menu.exercises.length - 1 && (
            <div className="h-px bg-black mx-4 my-1" />
          )}
        </div>
      ))}

      {/* 重量更新モーダル */}
      {modal && (
        <div
          className="fixed inset-0 bg-black/40 z-50 flex items-end"
          onClick={() => setModal(null)}
        >
          <div
            className="w-full bg-white rounded-t-2xl p-4"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="text-center text-sm font-bold mb-1">{modal.exerciseName}</p>
            <p className="text-center text-xs text-gray-500 mb-3">新しい重量を選択（現在: {modal.oldWeight}kg）</p>
            <div className="flex items-center gap-4">
              <div className="flex-1">
                <p className="text-center text-xs mb-1">重量（kg）</p>
                <div className="flex items-center gap-2 justify-center">
                  <button
                    className="w-8 h-8 bg-gray-200 rounded-full text-lg font-bold"
                    onClick={() => setModal((m) => m ? { ...m, newWeight: Math.max(0, +(m.newWeight - 0.5).toFixed(1)) } : m)}
                  >−</button>
                  <span className="text-xl font-bold w-16 text-center">{modal.newWeight}</span>
                  <button
                    className="w-8 h-8 bg-gray-200 rounded-full text-lg font-bold"
                    onClick={() => setModal((m) => m ? { ...m, newWeight: Math.min(100, +(m.newWeight + 0.5).toFixed(1)) } : m)}
                  >＋</button>
                </div>
              </div>
            </div>
            <div className="flex gap-2 mt-4">
              <button
                onClick={() => setModal(null)}
                className="flex-1 py-2 bg-gray-200 rounded-full text-sm font-bold"
              >
                キャンセル
              </button>
              <button
                onClick={saveWeightUpdate}
                className="flex-1 py-2 bg-gray-800 text-white rounded-full text-sm font-bold"
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
