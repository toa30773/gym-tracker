"use client";

import { useState, useEffect, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import ScrollPicker from "@/components/ScrollPicker";
import type { MenuWithExercises, WorkoutSet } from "@/lib/types";

const BODY_PARTS = ["胸", "背中", "肩", "腕", "脚", "腹", "体幹", "全身"];
const DAYS = ["月", "火", "水", "木", "金", "土", "日"];
const WEIGHTS = Array.from({ length: 201 }, (_, i) => +(i * 0.5).toFixed(1));
const REPS = Array.from({ length: 20 }, (_, i) => i + 1);

interface SetData {
  id?: string;
  set_number: number;
  weight: number;
  reps: number;
  machine_height: string;
}

interface ExerciseData {
  id?: string;
  body_part: string;
  name: string;
  memo: string;
  sets: SetData[];
}

interface MenuData {
  id?: string;
  name: string;
  days: string[];
  exercises: ExerciseData[];
}

type PickerTarget = {
  exIdx: number;
  setIdx: number;
  field: "weight" | "reps" | "body_part";
} | null;

const defaultSet = (n: number): SetData => ({
  set_number: n,
  weight: 20,
  reps: 10,
  machine_height: "",
});

const defaultExercise = (): ExerciseData => ({
  body_part: "胸",
  name: "",
  memo: "",
  sets: [defaultSet(1)],
});

export default function SettingsPage() {
  const supabase = createClient();
  const [menus, setMenus] = useState<MenuWithExercises[]>([]);
  const [currentMenuIdx, setCurrentMenuIdx] = useState(0);
  const [menuData, setMenuData] = useState<MenuData>({
    name: "メニュー",
    days: [],
    exercises: [defaultExercise()],
  });
  const [picker, setPicker] = useState<PickerTarget>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  const fetchMenus = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { data: menusData } = await supabase
      .from("menus")
      .select("*, exercises(*, sets(*))")
      .eq("user_id", user.id)
      .order("order_index");

    if (menusData && menusData.length > 0) {
      setMenus(menusData as MenuWithExercises[]);
      loadMenu(menusData[0] as MenuWithExercises);
    }
  }, [supabase]);

  useEffect(() => {
    fetchMenus();
  }, [fetchMenus]);

  function loadMenu(m: MenuWithExercises) {
    setMenuData({
      id: m.id,
      name: m.name,
      days: m.days || [],
      exercises: m.exercises.map((ex) => ({
        id: ex.id,
        body_part: ex.body_part,
        name: ex.name,
        memo: ex.sets[0]?.memo || "",
        sets: ex.sets
          .sort((a: WorkoutSet, b: WorkoutSet) => a.set_number - b.set_number)
          .map((s: WorkoutSet) => ({
            id: s.id,
            set_number: s.set_number,
            weight: s.weight,
            reps: s.reps,
            machine_height: s.machine_height || "",
          })),
      })),
    });
  }

  function switchMenu(idx: number) {
    setCurrentMenuIdx(idx);
    if (menus[idx]) {
      loadMenu(menus[idx]);
    } else {
      setMenuData({ name: `メニュー${idx + 1}`, days: [], exercises: [defaultExercise()] });
    }
  }

  function toggleDay(day: string) {
    setMenuData((prev) => ({
      ...prev,
      days: prev.days.includes(day)
        ? prev.days.filter((d) => d !== day)
        : [...prev.days, day],
    }));
  }

  function addExercise() {
    setMenuData((prev) => ({
      ...prev,
      exercises: [...prev.exercises, defaultExercise()],
    }));
  }

  function addSet(exIdx: number) {
    setMenuData((prev) => {
      const exercises = [...prev.exercises];
      const ex = { ...exercises[exIdx] };
      ex.sets = [...ex.sets, defaultSet(ex.sets.length + 1)];
      exercises[exIdx] = ex;
      return { ...prev, exercises };
    });
  }

  function updateExercise(exIdx: number, field: keyof ExerciseData, val: string) {
    setMenuData((prev) => {
      const exercises = [...prev.exercises];
      exercises[exIdx] = { ...exercises[exIdx], [field]: val };
      return { ...prev, exercises };
    });
  }

  function updateSet(exIdx: number, setIdx: number, field: keyof SetData, val: number | string) {
    setMenuData((prev) => {
      const exercises = [...prev.exercises];
      const sets = [...exercises[exIdx].sets];
      sets[setIdx] = { ...sets[setIdx], [field]: val };
      exercises[exIdx] = { ...exercises[exIdx], sets };
      return { ...prev, exercises };
    });
  }

  async function save() {
    setSaving(true);
    setMessage("");
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    let menuId = menuData.id;

    if (!menuId) {
      const { data, error } = await supabase
        .from("menus")
        .insert({ user_id: user.id, name: menuData.name, days: menuData.days, order_index: currentMenuIdx })
        .select()
        .single();
      if (error || !data) { setSaving(false); return; }
      menuId = data.id;
    } else {
      await supabase.from("menus").update({ name: menuData.name, days: menuData.days }).eq("id", menuId);
    }

    for (const ex of menuData.exercises) {
      let exId = ex.id;
      if (!exId) {
        const { data } = await supabase
          .from("exercises")
          .insert({ menu_id: menuId!, user_id: user.id, body_part: ex.body_part, name: ex.name, order_index: 0 })
          .select()
          .single();
        exId = data?.id;
      } else {
        await supabase.from("exercises").update({ body_part: ex.body_part, name: ex.name }).eq("id", exId);
      }

      if (!exId) continue;

      for (const s of ex.sets) {
        if (!s.id) {
          await supabase.from("sets").insert({
            exercise_id: exId,
            user_id: user.id,
            set_number: s.set_number,
            weight: s.weight,
            reps: s.reps,
            machine_height: s.machine_height || null,
            memo: ex.memo || null,
          });
        } else {
          await supabase.from("sets").update({
            weight: s.weight,
            reps: s.reps,
            machine_height: s.machine_height || null,
            memo: ex.memo || null,
          }).eq("id", s.id);
        }
      }
    }

    setMessage("保存しました");
    setSaving(false);
    fetchMenus();
  }

  return (
    <div className="pb-2">
      {/* ヘッダー */}
      <div className="flex items-center justify-between px-4 pt-4 pb-2">
        <div className="flex items-center gap-2">
          <div className="flex items-center justify-center w-6 h-5 bg-gray-300 rounded text-xs font-bold">
            {currentMenuIdx + 1}
          </div>
          <span className="text-sm font-bold">{menuData.name}</span>
        </div>
        <button
          className="flex items-center px-3 py-1 bg-gray-300 rounded text-xs"
          onClick={() => {
            const days = DAYS.filter((d) => !menuData.days.includes(d));
            void days;
          }}
        >
          <span>{menuData.days.length > 0 ? menuData.days.join("・") : "設定曜日を入力"}</span>
        </button>
      </div>

      {/* 曜日選択 */}
      <div className="flex gap-1 px-4 pb-2">
        {DAYS.map((d) => (
          <button
            key={d}
            onClick={() => toggleDay(d)}
            className={`px-2 py-0.5 rounded text-xs border ${
              menuData.days.includes(d) ? "bg-gray-700 text-white" : "bg-gray-100 text-gray-700"
            }`}
          >
            {d}
          </button>
        ))}
      </div>

      <div className="h-px bg-black mx-4 mb-3" />

      {/* 種目リスト */}
      {menuData.exercises.map((ex, exIdx) => (
        <div key={exIdx} className="mb-3 px-4">
          {/* 部位 */}
          <button
            onClick={() => setPicker({ exIdx, setIdx: 0, field: "body_part" })}
            className="inline-flex items-center px-3 py-1 bg-white border border-gray-400 rounded-full text-xs mb-2"
          >
            【{ex.body_part}】
          </button>

          <div className="border border-gray-300 rounded-xl p-3 relative">
            {/* 種目名 */}
            <div className="flex items-center gap-2 mb-2">
              <span className="text-sm">●</span>
              <div className="flex-1 flex gap-2">
                <div
                  className="flex-1 bg-gray-200 rounded-full px-3 py-1 text-xs cursor-pointer text-center"
                  onClick={() => {
                    const name = prompt("種目名を入力", ex.name);
                    if (name !== null) updateExercise(exIdx, "name", name);
                  }}
                >
                  {ex.name || "種目を入力"}
                </div>
                <div
                  className="bg-gray-200 rounded-full px-3 py-1 text-xs cursor-pointer"
                  onClick={() => {
                    const h = prompt("椅子の高さを入力", ex.sets[0]?.machine_height);
                    if (h !== null) updateSet(exIdx, 0, "machine_height", h);
                  }}
                >
                  {ex.sets[0]?.machine_height || "椅子の高さ"}
                </div>
              </div>
            </div>

            {/* セットリスト */}
            {ex.sets.map((s, setIdx) => (
              <div key={setIdx} className="flex items-center gap-2 mb-2 pl-4">
                <div className="flex items-center justify-center w-5 h-5 bg-gray-300 rounded text-xs">
                  {s.set_number}
                </div>
                <button
                  className="flex-1 bg-gray-200 rounded-full py-1 text-xs text-center"
                  onClick={() => setPicker({ exIdx, setIdx, field: "weight" })}
                >
                  {s.weight}kg
                </button>
                <button
                  className="flex-1 bg-gray-200 rounded-full py-1 text-xs text-center"
                  onClick={() => setPicker({ exIdx, setIdx, field: "reps" })}
                >
                  {s.reps}回
                </button>
              </div>
            ))}

            {/* セット追加ボタン */}
            <div
              className="flex items-center gap-1 pl-2 mb-2 cursor-pointer"
              onClick={() => addSet(exIdx)}
            >
              <span className="text-sm font-bold">＋</span>
            </div>

            {/* メモ */}
            <textarea
              value={ex.memo}
              onChange={(e) => updateExercise(exIdx, "memo", e.target.value)}
              placeholder="メモ"
              rows={2}
              className="w-full bg-gray-200 rounded-xl px-3 py-2 text-xs resize-none outline-none"
            />
          </div>
        </div>
      ))}

      {/* 種目追加ボタン */}
      <div
        className="flex items-center justify-center py-8 cursor-pointer"
        onClick={addExercise}
      >
        <span className="text-4xl font-light text-gray-400">＋</span>
      </div>

      {/* 保存ボタン */}
      <div className="flex justify-end px-4 pb-2">
        {message && <span className="text-xs text-green-600 mr-3 self-center">{message}</span>}
        <button
          onClick={save}
          disabled={saving}
          className="px-4 py-1 bg-gray-300 rounded-full text-xs font-bold disabled:opacity-50"
        >
          {saving ? "保存中..." : "保存"}
        </button>
      </div>

      {/* メニュー切り替え */}
      <div className="flex gap-2 px-4 pb-2">
        {[...Array(Math.max(menus.length + 1, 3))].map((_, i) => (
          <button
            key={i}
            onClick={() => switchMenu(i)}
            className={`px-3 py-1 rounded-full text-xs border ${currentMenuIdx === i ? "bg-gray-700 text-white" : "bg-gray-200"}`}
          >
            {i + 1}
          </button>
        ))}
      </div>

      {/* スクロールピッカーモーダル */}
      {picker && (
        <div
          className="fixed inset-0 bg-black/40 z-50 flex items-end"
          onClick={() => setPicker(null)}
        >
          <div
            className="w-full bg-white rounded-t-2xl p-4"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="text-center text-xs font-bold mb-2">
              {picker.field === "weight" ? "重量を選択（kg）" : picker.field === "reps" ? "レップ数を選択" : "部位を選択"}
            </p>
            <ScrollPicker
              items={
                picker.field === "weight" ? WEIGHTS :
                picker.field === "reps" ? REPS :
                BODY_PARTS
              }
              value={
                picker.field === "weight" ? menuData.exercises[picker.exIdx].sets[picker.setIdx].weight :
                picker.field === "reps" ? menuData.exercises[picker.exIdx].sets[picker.setIdx].reps :
                menuData.exercises[picker.exIdx].body_part
              }
              onChange={(val) => {
                if (picker.field === "body_part") {
                  updateExercise(picker.exIdx, "body_part", String(val));
                } else {
                  updateSet(picker.exIdx, picker.setIdx, picker.field, val as number);
                }
              }}
            />
            <button
              onClick={() => setPicker(null)}
              className="w-full mt-3 py-2 bg-gray-800 text-white rounded-full text-sm font-bold"
            >
              決定
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
