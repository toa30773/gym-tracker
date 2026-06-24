"use client";

import { useState } from "react";

// 1セット分の変更内容（source 側）
export interface ChangedSet {
  set_number: number;
  old_weight: number;
  new_weight: number;
  old_reps: number;
  new_reps: number;
  weight_changed: boolean;
  reps_changed: boolean;
}

// 反映候補メニュー
export interface SyncTargetMenu {
  menu_id: string;
  menu_name: string;
  exercise_id: string;
  // 同 set_number にある target 側の現在値（無ければエントリ無し）
  current_by_number: Record<number, { weight: number; reps: number }>;
  // 初期チェック状態（全変更セットの set_number で値が source の old と一致する場合 true）
  initially_checked: boolean;
}

// 1種目分の変更
export interface ExerciseChangeEntry {
  exercise_name: string;
  changed_sets: ChangedSet[];
  target_menus: SyncTargetMenu[];
}

interface Props {
  entries: ExerciseChangeEntry[];
  // 設定画面なら true（重量・レップ両方を反映）、記録画面なら false（重量のみ）
  sync_reps: boolean;
  onConfirm: (selectedByEntry: string[][]) => void;
  onCancel: () => void;
}

export default function CrossMenuSyncDialog({
  entries,
  sync_reps,
  onConfirm,
  onCancel,
}: Props) {
  // entries[i] に対して、チェック中のメニューIDの配列を保持
  const [selected, setSelected] = useState<string[][]>(() =>
    entries.map((e) =>
      e.target_menus.filter((m) => m.initially_checked).map((m) => m.menu_id),
    ),
  );

  function toggle(entryIdx: number, menuId: string) {
    setSelected((prev) =>
      prev.map((arr, i) => {
        if (i !== entryIdx) return arr;
        return arr.includes(menuId)
          ? arr.filter((id) => id !== menuId)
          : [...arr, menuId];
      }),
    );
  }

  return (
    <div
      className="fixed inset-0 bg-black/40 z-50 flex items-end"
      onClick={onCancel}
    >
      <div
        className="w-full max-w-[430px] mx-auto bg-white rounded-t-2xl p-4 pb-8 max-h-[85vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <p className="text-center text-sm font-bold mb-1">
          他のメニューにも反映しますか？
        </p>
        <p className="text-center text-[10px] text-gray-500 mb-3">
          チェックしたメニューの同名種目に同じ値を書き込みます
        </p>

        {entries.map((entry, entryIdx) => (
          <div key={entryIdx} className="mb-4">
            <p className="text-xs font-bold text-gray-800 mb-1.5 pb-1 border-b border-gray-200">
              {entry.exercise_name}
            </p>

            {/* 変更内容 */}
            <div className="mb-2 pl-1 space-y-0.5">
              {entry.changed_sets.map((s) => {
                const parts: string[] = [];
                if (s.weight_changed) {
                  parts.push(`${s.old_weight}kg → ${s.new_weight}kg`);
                }
                if (s.reps_changed && sync_reps) {
                  parts.push(`${s.old_reps}回 → ${s.new_reps}回`);
                }
                if (parts.length === 0) return null;
                return (
                  <div key={s.set_number} className="text-[11px] text-gray-700">
                    セット{s.set_number}: {parts.join(" / ")}
                  </div>
                );
              })}
            </div>

            {/* 反映先候補 */}
            {entry.target_menus.length === 0 ? (
              <p className="text-[10px] text-gray-400 pl-1">
                同名種目を持つ他メニューはありません
              </p>
            ) : (
              <div className="space-y-1">
                {entry.target_menus.map((m) => {
                  const isChecked = selected[entryIdx].includes(m.menu_id);
                  const currentSummary = entry.changed_sets
                    .map((cs) => {
                      const cur = m.current_by_number[cs.set_number];
                      if (!cur) {
                        return `セット${cs.set_number}: なし`;
                      }
                      return sync_reps
                        ? `セット${cs.set_number}: ${cur.weight}kg×${cur.reps}回`
                        : `セット${cs.set_number}: ${cur.weight}kg`;
                    })
                    .join(" / ");
                  return (
                    <label
                      key={m.menu_id}
                      className="flex items-start gap-2 p-2 bg-gray-50 rounded-lg cursor-pointer"
                    >
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={() => toggle(entryIdx, m.menu_id)}
                        className="mt-0.5 accent-gray-800"
                      />
                      <div className="flex-1 min-w-0">
                        <div className="text-xs font-bold truncate">
                          {m.menu_name}
                        </div>
                        <div className="text-[10px] text-gray-500">
                          {currentSummary}
                        </div>
                      </div>
                    </label>
                  );
                })}
              </div>
            )}
          </div>
        ))}

        <div className="flex gap-2 mt-2">
          <button
            onClick={onCancel}
            className="flex-1 py-2.5 bg-gray-200 rounded-full text-sm font-bold"
          >
            キャンセル
          </button>
          <button
            onClick={() => onConfirm(selected)}
            className="flex-1 py-2.5 bg-gray-800 text-white rounded-full text-sm font-bold"
          >
            決定
          </button>
        </div>
      </div>
    </div>
  );
}
