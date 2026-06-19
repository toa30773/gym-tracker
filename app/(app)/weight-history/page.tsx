"use client";

import { useState, useEffect, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Exercise, WorkoutSet, WeightUpdate } from "@/lib/types";

interface SetWithHistory extends WorkoutSet {
  history: WeightUpdate[];
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

function formatDateTime(iso: string) {
  const d = new Date(iso);
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  const hh = String(d.getHours()).padStart(2, "0");
  const mi = String(d.getMinutes()).padStart(2, "0");
  return `${d.getFullYear()}/${mm}/${dd} ${hh}:${mi}`;
}

export default function WeightHistoryPage() {
  const supabase = createClient();
  const [exercises, setExercises] = useState<ExerciseWithHistory[]>([]);
  const [loading, setLoading] = useState(true);
  const [detail, setDetail] = useState<ExerciseWithHistory | null>(null);

  const fetchHistory = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { data: exData } = await supabase
      .from("exercises")
      .select("*, sets(*)")
      .eq("user_id", user.id)
      .order("order_index");

    if (!exData) {
      setLoading(false);
      return;
    }

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

      const setsWithHistory: SetWithHistory[] = sortedSets.map((s) => ({
        ...s,
        history: updatesBySet[s.id] || [],
      }));

      const allUpdates = (updates || []) as WeightUpdate[];
      const latestUpdatedAt = allUpdates[0]?.updated_at || null;
      const prevUpdatedAt =
        allUpdates.find((u) => u.updated_at !== latestUpdatedAt)?.updated_at || null;

      results.push({
        ...(ex as Exercise),
        setsWithHistory,
        latestUpdatedAt,
        prevUpdatedAt,
      });
    }

    setExercises(results.filter((ex) => ex.setsWithHistory.some((s) => s.history.length > 0)));
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
            {/* 更新日情報 + 履歴ボタン */}
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs">
                更新日　{formatDate(ex.latestUpdatedAt)}　前回　{formatDate(ex.prevUpdatedAt)}
              </p>
              <button
                onClick={() => setDetail(ex)}
                className="px-3 py-1 bg-gray-800 text-white rounded-full text-xs font-bold"
              >
                履歴
              </button>
            </div>

            {/* 種目名 */}
            <div className="flex justify-center mb-2">
              <div className="bg-gray-200 rounded-full px-8 py-1 text-xs font-bold">
                {ex.name}
              </div>
            </div>

            {/* セット別重量推移 */}
            {ex.setsWithHistory.map((s) => {
              const latest = s.history[0];
              const prev = s.history[1];
              if (!latest) return null;
              return (
                <div key={s.id} className="flex items-center gap-2 mb-1.5">
                  <div className="flex items-center justify-center w-5 h-5 bg-gray-200 rounded text-xs">
                    {s.set_number}
                  </div>
                  <div className="flex-1 bg-gray-200 rounded-full py-1 text-xs text-center">
                    {prev ? `${prev.new_weight}kg` : `${latest.old_weight ?? "--"}kg`}
                  </div>
                  <span className="text-sm font-bold">→</span>
                  <div className="flex items-center justify-center w-5 h-5 bg-gray-200 rounded text-xs">
                    {s.set_number}
                  </div>
                  <div className="flex-1 bg-gray-200 rounded-full py-1 text-xs text-center">
                    {latest.new_weight}kg
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

      {/* 履歴詳細モーダル */}
      {detail && (
        <div
          className="fixed inset-0 bg-black/40 z-50 flex items-end"
          onClick={() => setDetail(null)}
        >
          <div
            className="w-full max-w-[430px] mx-auto bg-white rounded-t-2xl p-4 pb-8 max-h-[80vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-bold">{detail.name} の履歴</h2>
              <button
                onClick={() => setDetail(null)}
                className="text-xs text-gray-500"
              >
                閉じる
              </button>
            </div>

            {detail.setsWithHistory.map((s) => (
              <div key={s.id} className="mb-4">
                <p className="text-xs font-bold mb-1.5">セット {s.set_number}</p>
                {s.history.length === 0 ? (
                  <p className="text-[10px] text-gray-400 pl-3">履歴なし</p>
                ) : (
                  <ul className="space-y-1.5">
                    {s.history.map((u) => (
                      <li
                        key={u.id}
                        className="flex items-center justify-between gap-2 bg-gray-100 rounded-lg px-3 py-2"
                      >
                        <span className="text-[10px] text-gray-500">
                          {formatDateTime(u.updated_at)}
                        </span>
                        <div className="flex items-center gap-1.5 text-xs">
                          <span className="text-gray-500">
                            {u.old_weight ?? "--"}kg
                          </span>
                          <span>→</span>
                          <span className="font-bold">{u.new_weight}kg</span>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
