"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { getAllExercisesForUser, getAllSetLogsForUser } from "@/lib/local-db";
import { getCurrentUserId } from "@/lib/sync";

interface ExerciseInfo {
  id: string;
  name: string;
  body_part: string;
  is_assisted: boolean;
}

interface LogRow {
  exercise_id: string;
  performed_at: string;
  actual_weight: number;
  actual_reps: number;
  set_number: number;
}

interface DatePoint {
  date: string; // YYYY-MM-DD
  weight: number; // 日ごとの max actual_weight
  reps: number; // その max 重量での最大 reps
}

interface ExerciseHistory {
  info: ExerciseInfo;
  points: DatePoint[]; // 日付昇順
}

function dateKey(iso: string): string {
  const d = new Date(iso);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function formatMd(key: string): string {
  const [, m, d] = key.split("-");
  return `${parseInt(m, 10)}/${parseInt(d, 10)}`;
}

function formatWeight(w: number, isAssisted: boolean): string {
  return isAssisted ? `補助 ${w}kg` : `${w}kg`;
}

function MiniLineChart({
  points,
  isAssisted,
}: {
  points: DatePoint[];
  isAssisted: boolean;
}) {
  const W = 320;
  const H = 100;
  const PAD_X = 12;
  const PAD_Y = 16;

  if (points.length === 0) return null;

  const weights = points.map((p) => p.weight);
  const minW = Math.min(...weights);
  const maxW = Math.max(...weights);
  const range = maxW - minW || 1;

  const innerW = W - PAD_X * 2;
  const innerH = H - PAD_Y * 2;
  const xs =
    points.length === 1
      ? [W / 2]
      : points.map(
          (_, i) => PAD_X + (i / (points.length - 1)) * innerW
        );
  // アシスト種目では数値が下がるほど改善なので、表示上は通常と同じ向きで描画（値が小さいほど下）。
  // ユーザーには「右下がり = 改善」が直感的になるよう、is_assisted の場合は y を反転させる。
  const ys = points.map((p) => {
    const t = (p.weight - minW) / range; // 0..1
    const tAdj = isAssisted ? 1 - t : t;
    return H - PAD_Y - tAdj * innerH;
  });

  const path = points
    .map((_, i) => `${i === 0 ? "M" : "L"} ${xs[i].toFixed(1)} ${ys[i].toFixed(1)}`)
    .join(" ");

  return (
    <svg
      width="100%"
      viewBox={`0 0 ${W} ${H}`}
      className="block"
      preserveAspectRatio="none"
    >
      {/* ベースライン */}
      <line
        x1={PAD_X}
        x2={W - PAD_X}
        y1={H - PAD_Y}
        y2={H - PAD_Y}
        stroke="#e5e7eb"
        strokeWidth={1}
      />
      <path d={path} stroke="#111827" strokeWidth={2} fill="none" />
      {points.map((_, i) => (
        <circle
          key={i}
          cx={xs[i]}
          cy={ys[i]}
          r={3}
          fill="#111827"
        />
      ))}
      {/* y軸ラベル: 最小・最大 */}
      <text x={2} y={PAD_Y + 4} fontSize={9} fill="#9ca3af">
        {isAssisted ? minW : maxW}
      </text>
      <text x={2} y={H - PAD_Y + 9} fontSize={9} fill="#9ca3af">
        {isAssisted ? maxW : minW}
      </text>
    </svg>
  );
}

export default function WeightHistoryPage() {
  const [histories, setHistories] = useState<ExerciseHistory[]>([]);
  const [loading, setLoading] = useState(true);
  const [openId, setOpenId] = useState<string | null>(null);

  const fetchHistory = useCallback(async () => {
    const userId = await getCurrentUserId();
    if (!userId) {
      setLoading(false);
      return;
    }

    const [exData, logData] = await Promise.all([
      getAllExercisesForUser(userId),
      getAllSetLogsForUser(userId),
    ]);

    const exercises: ExerciseInfo[] = exData.map((e) => ({
      id: e.id,
      name: e.name,
      body_part: e.body_part,
      is_assisted: e.is_assisted ?? false,
    }));

    const logs: LogRow[] = logData.map((l) => ({
      exercise_id: l.exercise_id,
      performed_at: l.performed_at,
      actual_weight: l.actual_weight,
      actual_reps: l.actual_reps,
      set_number: l.set_number,
    }));

    // exercise_id ごとにグループ化
    const byEx = new Map<string, LogRow[]>();
    for (const log of logs) {
      if (!byEx.has(log.exercise_id)) byEx.set(log.exercise_id, []);
      byEx.get(log.exercise_id)!.push(log);
    }

    const results: ExerciseHistory[] = [];
    for (const ex of exercises) {
      const rows = byEx.get(ex.id);
      if (!rows || rows.length === 0) continue;

      // 日付ごとに max weight、その重量の最大 reps を抽出
      const byDate = new Map<string, { weight: number; reps: number }>();
      for (const r of rows) {
        const key = dateKey(r.performed_at);
        const cur = byDate.get(key);
        if (!cur) {
          byDate.set(key, { weight: r.actual_weight, reps: r.actual_reps });
        } else if (r.actual_weight > cur.weight) {
          byDate.set(key, { weight: r.actual_weight, reps: r.actual_reps });
        } else if (r.actual_weight === cur.weight && r.actual_reps > cur.reps) {
          byDate.set(key, { weight: r.actual_weight, reps: r.actual_reps });
        }
      }

      const points: DatePoint[] = [...byDate.entries()]
        .map(([date, v]) => ({ date, weight: v.weight, reps: v.reps }))
        .sort((a, b) => a.date.localeCompare(b.date));

      results.push({ info: ex, points });
    }

    // 直近のトレーニング日が新しい順
    results.sort((a, b) => {
      const al = a.points[a.points.length - 1]?.date || "";
      const bl = b.points[b.points.length - 1]?.date || "";
      return bl.localeCompare(al);
    });

    setHistories(results);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchHistory();
  }, [fetchHistory]);

  const totalSessions = useMemo(() => {
    const dates = new Set<string>();
    for (const h of histories) {
      for (const p of h.points) dates.add(p.date);
    }
    return dates.size;
  }, [histories]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-40 text-sm text-gray-500">
        読み込み中...
      </div>
    );
  }

  if (histories.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-40 gap-2">
        <p className="text-sm text-gray-500">まだ実績がありません</p>
        <a href="/main" className="text-xs text-blue-500 underline">
          メイン画面へ
        </a>
      </div>
    );
  }

  return (
    <div className="pb-2">
      {/* ヘッダー */}
      <div className="flex items-center justify-between px-4 pt-4 pb-2">
        <h1 className="text-sm font-bold">重量推移</h1>
        <span className="text-[10px] text-gray-500">
          通算 {totalSessions}日
        </span>
      </div>
      <div className="h-px bg-black mx-4 mb-3" />

      {histories.map((h) => {
        const first = h.points[0];
        const last = h.points[h.points.length - 1];
        const change = h.info.is_assisted
          ? first.weight - last.weight
          : last.weight - first.weight;
        const isOpen = openId === h.info.id;
        return (
          <div key={h.info.id} className="px-4 py-3 border-b border-gray-100">
            <div className="flex items-center gap-1.5 mb-1">
              <span className="inline-flex px-2 py-0.5 border border-gray-400 rounded-full text-[10px]">
                {h.info.body_part}
              </span>
              <span className="text-xs font-bold truncate">{h.info.name}</span>
              {h.info.is_assisted && (
                <span className="ml-auto text-[9px] text-gray-500">
                  アシスト
                </span>
              )}
            </div>

            <div className="flex items-baseline justify-between mb-1">
              <span className="text-xs text-gray-500">
                {formatMd(first.date)} → {formatMd(last.date)}
              </span>
              <span className="text-xs">
                <span className="text-gray-500">
                  {formatWeight(first.weight, h.info.is_assisted)}
                </span>
                <span className="mx-1">→</span>
                <span className="font-bold">
                  {formatWeight(last.weight, h.info.is_assisted)}
                </span>
                {change !== 0 && (
                  <span
                    className={`ml-1 text-[10px] ${
                      change > 0 ? "text-emerald-600" : "text-red-500"
                    }`}
                  >
                    ({change > 0 ? "+" : ""}
                    {(+change.toFixed(2)).toString()}kg)
                  </span>
                )}
              </span>
            </div>

            <MiniLineChart points={h.points} isAssisted={h.info.is_assisted} />

            <div className="flex items-center justify-between mt-1">
              <span className="text-[10px] text-gray-400">
                {h.points.length}日分
              </span>
              <button
                onClick={() => setOpenId(isOpen ? null : h.info.id)}
                className="text-[10px] text-gray-600 underline"
              >
                {isOpen ? "閉じる" : "詳細"}
              </button>
            </div>

            {isOpen && (
              <ul className="mt-2 space-y-1">
                {[...h.points].reverse().map((p) => (
                  <li
                    key={p.date}
                    className="flex items-center justify-between bg-gray-100 rounded-lg px-3 py-1.5 text-[10px]"
                  >
                    <span className="text-gray-500">{formatMd(p.date)}</span>
                    <span>
                      <span className="font-bold">
                        {formatWeight(p.weight, h.info.is_assisted)}
                      </span>
                      <span className="ml-2 text-gray-500">× {p.reps}回</span>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        );
      })}
    </div>
  );
}
