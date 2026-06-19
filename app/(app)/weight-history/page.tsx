"use client";

import { useState, useEffect, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Exercise, WorkoutSet, WeightUpdate } from "@/lib/types";

interface SetWithHistory extends WorkoutSet {
  latestUpdate: WeightUpdate | null;
  prevUpdate: WeightUpdate | null;
}

interface ExerciseWithHistory extends Exercise {
  setsWithHistory: SetWithHistory[];
  latestUpdatedAt: string | null;
  prevUpdatedAt: string | null;
}

function formatDate(iso: string | null) {
  if (!iso) return "--/--";
  const d = new Date(iso);
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

export default function WeightHistoryPage() {
  const supabase = createClient();
  const [exercises, setExercises] = useState<ExerciseWithHistory[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchHistory = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { data: exData } = await supabase
      .from("exercises")
      .select("*, sets(*)")
      .eq("user_id", user.id)
      .order("order_index");

    if (!exData) { setLoading(false); return; }

    const results: ExerciseWithHistory[] = [];

    for (const ex of exData) {
      const sortedSets = (ex.sets as WorkoutSet[]).sort((a, b) => a.set_number - b.set_number);
      const setIds = sortedSets.map((s) => s.id);

      if (setIds.length === 0) continue;

      const { data: updates } = await supabase
        .from("weight_updates")
        .select("*")
        .in("set_id", setIds)
        .order("updated_at", { ascending: false });

      const updatesBySet: Record<string, WeightUpdate[]> = {};
      (updates || []).forEach((u) => {
        if (!updatesBySet[u.set_id]) updatesBySet[u.set_id] = [];
        updatesBySet[u.set_id].push(u as WeightUpdate);
      });

      const setsWithHistory: SetWithHistory[] = sortedSets.map((s) => {
        const his = updatesBySet[s.id] || [];
        return {
          ...s,
          latestUpdate: his[0] || null,
          prevUpdate: his[1] || null,
        };
      });

      // 種目全体の最終更新日・前回更新日
      const allUpdates = (updates || []) as WeightUpdate[];
      const latestUpdatedAt = allUpdates[0]?.updated_at || null;
      const prevUpdatedAt = allUpdates.find(
        (u) => u.updated_at !== latestUpdatedAt
      )?.updated_at || null;

      results.push({
        ...(ex as Exercise),
        setsWithHistory,
        latestUpdatedAt,
        prevUpdatedAt,
      });
    }

    setExercises(results.filter((ex) => ex.setsWithHistory.some((s) => s.latestUpdate)));
    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    fetchHistory();
  }, [fetchHistory]);

  if (loading) {
    return <div className="flex items-center justify-center h-40 text-sm text-gray-500">読み込み中...</div>;
  }

  if (exercises.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-40 gap-2">
        <p className="text-sm text-gray-500">重量更新の履歴がありません</p>
        <a href="/main" className="text-xs text-blue-500 underline">メイン画面へ</a>
      </div>
    );
  }

  return (
    <div className="pb-2">
      {/* ヘッダー */}
      <div className="px-4 pt-4 pb-2">
        <h1 className="text-sm font-bold">重量更新頻度表</h1>
      </div>
      <div className="h-px bg-black mx-4 mb-3" />

      {exercises.map((ex, exIdx) => (
        <div key={ex.id}>
          <div className="px-4 py-2">
            {/* 更新日情報 */}
            <p className="text-xs mb-2">
              更新日　{formatDate(ex.latestUpdatedAt)}　前回の更新日　{formatDate(ex.prevUpdatedAt)}
            </p>

            {/* 種目名 */}
            <div className="flex justify-center mb-2">
              <div className="bg-gray-200 rounded-full px-8 py-1 text-xs font-bold">
                {ex.name}
              </div>
            </div>

            {/* セット別重量推移 */}
            {ex.setsWithHistory.map((s) => {
              if (!s.latestUpdate) return null;
              return (
                <div key={s.id} className="flex items-center gap-2 mb-1.5">
                  <div className="flex items-center justify-center w-5 h-5 bg-gray-200 rounded text-xs">
                    {s.set_number}
                  </div>
                  <div className="flex-1 bg-gray-200 rounded-full py-1 text-xs text-center">
                    {s.prevUpdate ? `${s.prevUpdate.new_weight}kg` : `${s.latestUpdate.old_weight ?? "--"}kg`}
                  </div>
                  <span className="text-sm font-bold">→</span>
                  <div className="flex items-center justify-center w-5 h-5 bg-gray-200 rounded text-xs">
                    {s.set_number}
                  </div>
                  <div className="flex-1 bg-gray-200 rounded-full py-1 text-xs text-center">
                    {s.latestUpdate.new_weight}kg
                  </div>
                </div>
              );
            })}
          </div>

          {exIdx < exercises.length - 1 && (
            <div className="h-px bg-black mx-4 my-1" />
          )}
        </div>
      ))}
    </div>
  );
}
