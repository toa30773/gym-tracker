"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { getAllExercisesForUser, getAllSetLogsForUser } from "@/lib/local-db";
import { getCurrentUserId } from "@/lib/sync";
import { formatWeight, bodyPartChipClass } from "@/lib/types";

// 部位の表示順。設定画面の BODY_PARTS と揃える。
// 未定義の部位はこの後ろに alphabetical で並べる。
const BODY_PART_ORDER = ["胸", "背中", "肩", "腕", "脚", "腹", "体幹", "全身"];

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
  // TOP（同日内 set_number 最大）の actual_weight / actual_reps
  topWeight: number;
  topReps: number;
  // バックオフ群（TOP 以外）の代表値。bulk-sync 運用なら全部同じ値、
  // ピラミッドなら最大値を採用（=「揃った」判定は全部 TOP と同値の時のみ）。
  backoffWeight: number | null;
  // その日の全セットの actual_weight が同値だったか（=「ストレート完成」マーク用）
  allEqual: boolean;
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

function MiniLineChart({
  points,
  isAssisted,
}: {
  points: DatePoint[];
  isAssisted: boolean;
}) {
  const W = 320;
  const H = 140;
  const PAD_X = 12;
  const PAD_Y = 18;

  if (points.length === 0) return null;

  // y軸スケールは TOP / バックオフ両方の重量を含めて決める
  const allWeights = points.flatMap((p) =>
    p.backoffWeight !== null ? [p.topWeight, p.backoffWeight] : [p.topWeight],
  );
  const minW = Math.min(...allWeights);
  const maxW = Math.max(...allWeights);
  const range = maxW - minW || 1;

  const innerW = W - PAD_X * 2;
  const innerH = H - PAD_Y * 2;
  const xs =
    points.length === 1
      ? [W / 2]
      : points.map((_, i) => PAD_X + (i / (points.length - 1)) * innerW);

  function yOf(weight: number): number {
    const t = (weight - minW) / range;
    const tAdj = isAssisted ? 1 - t : t;
    return H - PAD_Y - tAdj * innerH;
  }

  const topYs = points.map((p) => yOf(p.topWeight));
  // バックオフが記録なし（=1セット種目だった日）はパスを分断する
  const backoffSegments: { i: number; y: number }[][] = [];
  let cur: { i: number; y: number }[] = [];
  points.forEach((p, i) => {
    if (p.backoffWeight === null) {
      if (cur.length > 0) {
        backoffSegments.push(cur);
        cur = [];
      }
    } else {
      cur.push({ i, y: yOf(p.backoffWeight) });
    }
  });
  if (cur.length > 0) backoffSegments.push(cur);

  const topPath = points
    .map((_, i) => `${i === 0 ? "M" : "L"} ${xs[i].toFixed(1)} ${topYs[i].toFixed(1)}`)
    .join(" ");

  const TOP_COLOR = "#ef4444"; // red-500
  const BACKOFF_COLOR = "#3b82f6"; // blue-500
  const EQUAL_COLOR = "#10b981"; // emerald-500

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

      {/* バックオフ線（青）。記録欠損で分断 */}
      {backoffSegments.map((seg, idx) => {
        const d = seg
          .map((pt, j) => `${j === 0 ? "M" : "L"} ${xs[pt.i].toFixed(1)} ${pt.y.toFixed(1)}`)
          .join(" ");
        return (
          <path
            key={`b${idx}`}
            d={d}
            stroke={BACKOFF_COLOR}
            strokeWidth={1.5}
            fill="none"
          />
        );
      })}

      {/* TOP 線（赤） */}
      <path d={topPath} stroke={TOP_COLOR} strokeWidth={2} fill="none" />

      {/* バックオフ点（青、揃った日は緑） */}
      {points.map((p, i) => {
        if (p.backoffWeight === null) return null;
        return (
          <circle
            key={`bp${i}`}
            cx={xs[i]}
            cy={yOf(p.backoffWeight)}
            r={3}
            fill={p.allEqual ? EQUAL_COLOR : BACKOFF_COLOR}
          />
        );
      })}

      {/* TOP 点（赤、揃った日は緑） */}
      {points.map((p, i) => (
        <circle
          key={`tp${i}`}
          cx={xs[i]}
          cy={topYs[i]}
          r={3}
          fill={p.allEqual ? EQUAL_COLOR : TOP_COLOR}
        />
      ))}

      {/* y軸ラベル: 最小・最大 */}
      <text x={2} y={PAD_Y + 4} fontSize={11} fill="#6b7280">
        {isAssisted ? minW : maxW}
      </text>
      <text x={2} y={H - PAD_Y + 11} fontSize={11} fill="#6b7280">
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

      // 日付ごとに log を集めて、TOP（set_number 最大）とバックオフ群に分解
      const byDate = new Map<string, LogRow[]>();
      for (const r of rows) {
        const key = dateKey(r.performed_at);
        if (!byDate.has(key)) byDate.set(key, []);
        byDate.get(key)!.push(r);
      }

      const points: DatePoint[] = [...byDate.entries()]
        .map(([date, logs]) => {
          const maxSet = Math.max(...logs.map((l) => l.set_number));
          const top = logs.find((l) => l.set_number === maxSet)!;
          const backoffs = logs.filter((l) => l.set_number !== maxSet);
          // バックオフの代表値: 同期運用なら全部同値、ピラミッドなら最大値を採用
          const backoffWeight =
            backoffs.length === 0
              ? null
              : Math.max(...backoffs.map((b) => b.actual_weight));
          // 「全セット同値」判定（=ストレート完成。緑マーカー対象）
          const allEqual =
            logs.length >= 2 && logs.every((l) => l.actual_weight === top.actual_weight);
          return {
            date,
            topWeight: top.actual_weight,
            topReps: top.actual_reps,
            backoffWeight,
            allEqual,
          };
        })
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

  // 部位ごとにグループ化。BODY_PART_ORDER の順、未定義部位は末尾に名前順。
  // 各グループ内は最新トレ日が新しい順（fetchHistory の sort をそのまま活かす）。
  const grouped = useMemo(() => {
    const byPart = new Map<string, ExerciseHistory[]>();
    for (const h of histories) {
      const part = h.info.body_part || "（未分類）";
      if (!byPart.has(part)) byPart.set(part, []);
      byPart.get(part)!.push(h);
    }
    const sortedParts = [...byPart.keys()].sort((a, b) => {
      const ai = BODY_PART_ORDER.indexOf(a);
      const bi = BODY_PART_ORDER.indexOf(b);
      if (ai === -1 && bi === -1) return a.localeCompare(b);
      if (ai === -1) return 1;
      if (bi === -1) return -1;
      return ai - bi;
    });
    return sortedParts.map((part) => ({ part, items: byPart.get(part)! }));
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
      </div>
    );
  }

  return (
    <div className="pb-2">
      {/* ヘッダー */}
      <div className="flex items-center justify-between px-4 pt-4 pb-2">
        <h1 className="text-base font-bold">重量推移</h1>
        <span className="text-xs text-gray-500">
          通算 {totalSessions}日
        </span>
      </div>
      <div className="h-px bg-gray-400 mx-4 mb-3" />

      {grouped.map(({ part, items }) => (
        <section key={part} className="mb-3">
          {/* 部位見出し */}
          <div className="px-4 mb-2">
            <span className={`inline-flex px-3 py-1 border rounded-full text-sm font-bold ${bodyPartChipClass(part)}`}>
              【{part}】 {items.length}種目
            </span>
          </div>

          {items.map((h) => {
            const first = h.points[0];
            const last = h.points[h.points.length - 1];
            // 右上の変化値は「全セットが揃った日」だけを対象にする。
            // 「更新回数」の定義と一致させ、揃ってない TOP の上下に振り回されないようにする。
            const equalPoints = h.points.filter((p) => p.allEqual);
            const firstEqual = equalPoints[0] ?? null;
            const lastEqual = equalPoints[equalPoints.length - 1] ?? null;
            const change =
              firstEqual && lastEqual
                ? h.info.is_assisted
                  ? firstEqual.topWeight - lastEqual.topWeight
                  : lastEqual.topWeight - firstEqual.topWeight
                : null;
            const isOpen = openId === h.info.id;
            return (
              <div key={h.info.id} className="px-4 py-3 border-b border-gray-200">
                <div className="flex items-center gap-1.5 mb-1">
                  <span className="text-sm font-bold truncate">{h.info.name}</span>
                  {h.info.is_assisted && (
                    <span className="ml-auto text-[11px] text-gray-600">
                      アシスト(値小=高負荷)
                    </span>
                  )}
                </div>

                <div className="flex items-baseline justify-between mb-1">
                  <span className="text-xs text-gray-500">
                    {formatMd(first.date)} → {formatMd(last.date)}
                  </span>
                  <span className="text-sm">
                    {firstEqual && lastEqual ? (
                      <>
                        <span className="text-gray-500">
                          {formatWeight(firstEqual.topWeight, h.info.is_assisted)}
                        </span>
                        <span className="mx-1">→</span>
                        <span className="font-bold">
                          {formatWeight(lastEqual.topWeight, h.info.is_assisted)}
                        </span>
                        {change !== null && change !== 0 && (
                          <span
                            className={`ml-1 text-[11px] font-bold ${
                              change > 0 ? "text-emerald-600" : "text-red-500"
                            }`}
                          >
                            ({change > 0 ? "+" : ""}
                            {(+change.toFixed(2)).toString()}kg)
                          </span>
                        )}
                      </>
                    ) : (
                      <span className="text-gray-400">揃った日なし</span>
                    )}
                  </span>
                </div>

                <MiniLineChart points={h.points} isAssisted={h.info.is_assisted} />

                {/* 凡例 */}
                <div className="flex items-center flex-wrap gap-x-3 gap-y-1 mt-1.5 text-[11px] text-gray-600">
                  <span className="flex items-center gap-1">
                    <span className="inline-block w-3 h-0.5 bg-red-500" /> TOP(限界)
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="inline-block w-3 h-0.5 bg-blue-500" />
                    バックオフ
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="inline-block w-2.5 h-2.5 rounded-full bg-emerald-500" />
                    揃った日(全セット同重量)
                  </span>
                </div>

                <div className="flex items-center justify-between mt-2">
                  <span className="text-[11px] text-gray-500">
                    {h.points.length}日分
                  </span>
                  <button
                    onClick={() => setOpenId(isOpen ? null : h.info.id)}
                    className="px-3 py-1 bg-gray-200 rounded-full text-xs font-bold text-gray-700"
                  >
                    {isOpen ? "閉じる" : "詳細"}
                  </button>
                </div>

                {isOpen && (
                  <ul className="mt-2 space-y-1">
                    {[...h.points].reverse().map((p) => (
                      <li
                        key={p.date}
                        className={`flex items-center justify-between rounded-lg px-3 py-1.5 text-xs ${
                          p.allEqual ? "bg-emerald-50 border border-emerald-200" : "bg-gray-100"
                        }`}
                      >
                        <span className="text-gray-600">{formatMd(p.date)}</span>
                        <span className="text-right">
                          <span className="text-red-500 font-bold">
                            TOP {formatWeight(p.topWeight, h.info.is_assisted)} ×{p.topReps}
                          </span>
                          {p.backoffWeight !== null && (
                            <span className="ml-2 text-blue-500">
                              BO {formatWeight(p.backoffWeight, h.info.is_assisted)}
                            </span>
                          )}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            );
          })}
        </section>
      ))}
    </div>
  );
}
