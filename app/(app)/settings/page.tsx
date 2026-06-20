"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import ScrollPicker from "@/components/ScrollPicker";
import type { MenuWithExercises, WorkoutSet } from "@/lib/types";
import { WEIGHT_STEPS, buildWeightOptions } from "@/lib/types";

const BODY_PARTS = ["胸", "背中", "肩", "腕", "脚", "腹", "体幹", "全身"];
const DAYS = ["月", "火", "水", "木", "金", "土", "日"];
const REPS = Array.from({ length: 30 }, (_, i) => i + 1);
const MAX_MENUS = 10;

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
  weight_step: number;
  is_assisted: boolean;
  sets: SetData[];
}

interface MenuData {
  id?: string;
  name: string;
  days: string[];
  interval_days: number | null;
  start_date: string | null;
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
  weight_step: 2.5,
  is_assisted: false,
  sets: [defaultSet(1)],
});

const defaultMenu = (idx: number): MenuData => ({
  name: `メニュー${idx + 1}`,
  days: [],
  interval_days: null,
  start_date: null,
  exercises: [defaultExercise()],
});

export default function SettingsPage() {
  const supabase = createClient();
  const [savedMenus, setSavedMenus] = useState<MenuWithExercises[]>([]);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [menuData, setMenuData] = useState<MenuData>(defaultMenu(0));
  const [picker, setPicker] = useState<PickerTarget>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [showDaySelector, setShowDaySelector] = useState(false);
  const [intervalInput, setIntervalInput] = useState("");
  const [showCopyModal, setShowCopyModal] = useState(false);
  const touchStartX = useRef<number | null>(null);

  const fetchMenus = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { data } = await supabase
      .from("menus")
      .select("*, exercises(*, sets(*))")
      .eq("user_id", user.id)
      .order("order_index");

    const list = (data || []) as MenuWithExercises[];
    setSavedMenus(list);
    return list;
  }, [supabase]);

  function loadMenu(m: MenuWithExercises) {
    setMenuData({
      id: m.id,
      name: m.name,
      days: m.days || [],
      interval_days: m.interval_days ?? null,
      start_date: m.start_date ?? null,
      exercises:
        m.exercises.length > 0
          ? m.exercises.map((ex) => ({
              id: ex.id,
              body_part: ex.body_part,
              name: ex.name,
              memo: ex.sets[0]?.memo || "",
              weight_step: ex.weight_step ?? 2.5,
              is_assisted: ex.is_assisted ?? false,
              sets: ex.sets
                .sort((a, b) => a.set_number - b.set_number)
                .map((s: WorkoutSet) => ({
                  id: s.id,
                  set_number: s.set_number,
                  weight: s.weight,
                  reps: s.reps,
                  machine_height: s.machine_height || "",
                })),
            }))
          : [defaultExercise()],
    });
    setIntervalInput(m.interval_days ? String(m.interval_days) : "");
  }

  useEffect(() => {
    fetchMenus().then((list) => {
      if (list && list.length > 0) {
        loadMenu(list[0]);
        setCurrentIdx(0);
      }
    });
  }, [fetchMenus]);

  // 切替可能なメニュー数 = 保存済み + 次の1つ（最大3）
  const visibleCount = Math.min(savedMenus.length + 1, MAX_MENUS);
  const isNewMenu = currentIdx >= savedMenus.length;

  function switchMenu(newIdx: number) {
    if (newIdx < 0 || newIdx >= visibleCount) return;
    setCurrentIdx(newIdx);
    if (newIdx < savedMenus.length) {
      loadMenu(savedMenus[newIdx]);
    } else {
      setMenuData(defaultMenu(newIdx));
      setIntervalInput("");
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

  function setInterval(days: number | null) {
    setMenuData((prev) => ({
      ...prev,
      interval_days: days,
      start_date: days ? new Date().toISOString().slice(0, 10) : null,
    }));
    setIntervalInput(days ? String(days) : "");
  }

  // 種目行内の＋: 同じ部位グループ内に完全に空の種目を追加（部位は引き継ぐ、UIでは非表示）
  function addExerciseSameGroup(exIdx: number) {
    setMenuData((prev) => {
      const src = prev.exercises[exIdx];
      const copy: ExerciseData = {
        body_part: src.body_part,
        name: "",
        memo: "",
        weight_step: 2.5,
        is_assisted: false,
        sets: [defaultSet(1)],
      };
      const exercises = [...prev.exercises];
      exercises.splice(exIdx + 1, 0, copy);
      return { ...prev, exercises };
    });
  }

  // 画面中央の＋: 新しい部位グループとして空の種目を追加（部位は空欄からスタート）
  function addExerciseNewGroup() {
    setMenuData((prev) => ({
      ...prev,
      exercises: [...prev.exercises, { ...defaultExercise(), body_part: "" }],
    }));
  }

  // 他メニューから種目をコピーして現在のメニューに追加
  function copyExerciseFromOther(srcMenu: MenuWithExercises, srcExId: string) {
    const src = srcMenu.exercises.find((e) => e.id === srcExId);
    if (!src) return;
    const sortedSets = [...src.sets].sort((a, b) => a.set_number - b.set_number);
    const copy: ExerciseData = {
      body_part: src.body_part,
      name: src.name,
      memo: sortedSets[0]?.memo || "",
      weight_step: src.weight_step ?? 2.5,
      is_assisted: src.is_assisted ?? false,
      sets: sortedSets.map((s, i) => ({
        set_number: i + 1,
        weight: s.weight,
        reps: s.reps,
        machine_height: s.machine_height || "",
      })),
    };
    setMenuData((prev) => ({
      ...prev,
      exercises: [...prev.exercises, copy],
    }));
  }

  function removeExercise(exIdx: number) {
    setMenuData((prev) => {
      if (prev.exercises.length <= 1) return prev;
      const exercises = prev.exercises.filter((_, i) => i !== exIdx);
      return { ...prev, exercises };
    });
  }

  function removeSet(exIdx: number, setIdx: number) {
    setMenuData((prev) => {
      const exercises = [...prev.exercises];
      const ex = { ...exercises[exIdx] };
      if (ex.sets.length <= 1) return prev;
      ex.sets = ex.sets
        .filter((_, i) => i !== setIdx)
        .map((s, i) => ({ ...s, set_number: i + 1 }));
      exercises[exIdx] = ex;
      return { ...prev, exercises };
    });
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

  function updateExercise<K extends keyof ExerciseData>(
    exIdx: number,
    field: K,
    val: ExerciseData[K]
  ) {
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
    if (!user) { setSaving(false); return; }

    let menuId = menuData.id;
    const menuPayload = {
      name: menuData.name,
      days: menuData.days,
      interval_days: menuData.interval_days,
      start_date: menuData.start_date,
    };

    if (!menuId) {
      const { data, error } = await supabase
        .from("menus")
        .insert({ user_id: user.id, ...menuPayload, order_index: currentIdx })
        .select()
        .single();
      if (error || !data) {
        setMessage("保存に失敗しました");
        setSaving(false);
        return;
      }
      menuId = data.id;
    } else {
      await supabase.from("menus").update(menuPayload).eq("id", menuId);
    }

    const keepExerciseIds: string[] = [];

    for (let i = 0; i < menuData.exercises.length; i++) {
      const ex = menuData.exercises[i];
      let exId = ex.id;
      const exPayload = {
        body_part: ex.body_part || "胸",
        name: ex.name,
        order_index: i,
        weight_step: ex.weight_step,
        is_assisted: ex.is_assisted,
      };

      if (!exId) {
        const { data } = await supabase
          .from("exercises")
          .insert({ menu_id: menuId!, user_id: user.id, ...exPayload })
          .select()
          .single();
        exId = data?.id;
      } else {
        await supabase.from("exercises").update(exPayload).eq("id", exId);
      }
      if (!exId) continue;
      keepExerciseIds.push(exId);

      // 椅子の高さは set[0] のみUIで編集するので、全セットに伝播させる
      const sharedMachineHeight = ex.sets[0]?.machine_height || null;

      const keepSetIds: string[] = [];
      for (const s of ex.sets) {
        const setPayload = {
          weight: s.weight,
          reps: s.reps,
          machine_height: sharedMachineHeight,
          memo: ex.memo || null,
        };
        if (!s.id) {
          const { data } = await supabase
            .from("sets")
            .insert({
              exercise_id: exId,
              user_id: user.id,
              set_number: s.set_number,
              ...setPayload,
            })
            .select()
            .single();
          if (data?.id) keepSetIds.push(data.id);
        } else {
          await supabase
            .from("sets")
            .update({ set_number: s.set_number, ...setPayload })
            .eq("id", s.id);
          keepSetIds.push(s.id);
        }
      }

      // この種目で不要になったセットを削除
      const { data: existingSets } = await supabase
        .from("sets")
        .select("id")
        .eq("exercise_id", exId);
      const toDeleteSets = (existingSets || [])
        .map((r: { id: string }) => r.id)
        .filter((id: string) => !keepSetIds.includes(id));
      if (toDeleteSets.length > 0) {
        await supabase.from("sets").delete().in("id", toDeleteSets);
      }
    }

    // 削除された種目をDBから消す
    const { data: existingEx } = await supabase
      .from("exercises")
      .select("id")
      .eq("menu_id", menuId!);
    const toDeleteEx = (existingEx || [])
      .map((r: { id: string }) => r.id)
      .filter((id: string) => !keepExerciseIds.includes(id));
    if (toDeleteEx.length > 0) {
      await supabase.from("exercises").delete().in("id", toDeleteEx);
    }

    setMessage("保存しました");
    setSaving(false);

    // 再フェッチして、新メニュー保存時は自動で次の空メニューへ進む
    const list = await fetchMenus();
    if (list) {
      if (isNewMenu && currentIdx + 1 < MAX_MENUS) {
        const nextIdx = currentIdx + 1;
        setCurrentIdx(nextIdx);
        if (nextIdx < list.length) {
          loadMenu(list[nextIdx]);
        } else {
          setMenuData(defaultMenu(nextIdx));
          setIntervalInput("");
        }
      } else {
        const updated = list[currentIdx];
        if (updated) loadMenu(updated);
      }
    }
    setTimeout(() => setMessage(""), 2000);
  }

  // スワイプ
  function onTouchStart(e: React.TouchEvent) {
    touchStartX.current = e.touches[0].clientX;
  }
  function onTouchEnd(e: React.TouchEvent) {
    if (touchStartX.current === null) return;
    const dx = e.changedTouches[0].clientX - touchStartX.current;
    touchStartX.current = null;
    if (Math.abs(dx) < 60) return;
    if (visibleCount < 2) return;
    if (dx < 0 && currentIdx < visibleCount - 1) switchMenu(currentIdx + 1);
    if (dx > 0 && currentIdx > 0) switchMenu(currentIdx - 1);
  }

  return (
    <div
      className="pb-2"
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
    >
      {/* ヘッダー */}
      <div className="flex items-center justify-between px-4 pt-4 pb-2 gap-2">
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <div className="flex items-center justify-center w-6 h-5 bg-gray-300 rounded text-xs font-bold flex-shrink-0">
            {currentIdx + 1}
          </div>
          <input
            type="text"
            value={menuData.name}
            onChange={(e) => setMenuData((p) => ({ ...p, name: e.target.value }))}
            className="text-sm font-bold bg-transparent outline-none border-b border-dashed border-gray-300 flex-1 min-w-0"
            placeholder="メニュー名"
          />
        </div>
        <button
          onClick={() => setShowDaySelector((s) => !s)}
          className="px-3 py-1.5 bg-gray-200 rounded-full text-xs flex-shrink-0"
        >
          {menuData.days.length > 0
            ? menuData.days.join("・")
            : menuData.interval_days
            ? `${menuData.interval_days}日おき`
            : "曜日/間隔を設定"}
        </button>
      </div>

      {/* 曜日/間隔セレクタ */}
      {showDaySelector && (
        <div className="mx-4 mb-3 p-3 bg-gray-50 rounded-xl border border-gray-200">
          <p className="text-xs font-bold mb-2">曜日を選択</p>
          <div className="flex gap-1 mb-3">
            {DAYS.map((d) => (
              <button
                key={d}
                onClick={() => toggleDay(d)}
                className={`flex-1 py-1 rounded text-xs border ${
                  menuData.days.includes(d)
                    ? "bg-gray-700 text-white border-gray-700"
                    : "bg-white text-gray-700 border-gray-300"
                }`}
              >
                {d}
              </button>
            ))}
          </div>

          <p className="text-xs font-bold mb-2">または間隔指定</p>
          <div className="flex items-center gap-2">
            <span className="text-xs">毎</span>
            <input
              type="number"
              min={1}
              max={30}
              value={intervalInput}
              onChange={(e) => {
                setIntervalInput(e.target.value);
                const n = parseInt(e.target.value, 10);
                if (!isNaN(n) && n > 0) {
                  setInterval(n);
                } else if (e.target.value === "") {
                  setInterval(null);
                }
              }}
              className="w-14 px-2 py-1 bg-white border border-gray-300 rounded text-center text-xs"
              placeholder="--"
            />
            <span className="text-xs">日おき</span>
            {menuData.interval_days && (
              <button
                onClick={() => setInterval(null)}
                className="text-xs text-gray-500 underline ml-2"
              >
                クリア
              </button>
            )}
          </div>
          {menuData.interval_days && menuData.start_date && (
            <p className="text-[10px] text-gray-500 mt-2">
              開始日: {menuData.start_date}
            </p>
          )}
        </div>
      )}

      <div className="h-px bg-black mx-4 mb-3" />

      {/* 種目リスト */}
      {menuData.exercises.map((ex, exIdx) => {
        const prevBodyPart = exIdx > 0 ? menuData.exercises[exIdx - 1].body_part : null;
        const isGroupHead = prevBodyPart !== ex.body_part;
        return (
        <div key={exIdx} className={`px-4 ${isGroupHead ? "mt-2 mb-2" : "mb-2"}`}>
          {/* 部位バッジ（同じ部位の連続は最初の1つだけ表示） */}
          {isGroupHead && (
            <div className="mb-2">
              <button
                onClick={() => setPicker({ exIdx, setIdx: 0, field: "body_part" })}
                className="inline-flex items-center px-3 py-1 bg-white border border-gray-400 rounded-full text-xs"
              >
                【{ex.body_part || "部位を入力"}】
              </button>
            </div>
          )}

          <div className="border border-gray-300 rounded-xl p-3 relative">
            {/* 種目名 + ＋ボタン（同じ部位グループに空種目を追加） + −削除ボタン */}
            <div className="flex items-center gap-2 mb-2">
              <span className="text-sm">●</span>
              <input
                type="text"
                value={ex.name}
                onChange={(e) => updateExercise(exIdx, "name", e.target.value)}
                placeholder="種目を入力"
                className="flex-1 bg-gray-200 rounded-full px-3 py-1.5 text-xs outline-none placeholder-gray-500"
              />
              <button
                onClick={() => addExerciseSameGroup(exIdx)}
                className="w-7 h-7 flex items-center justify-center bg-gray-200 rounded-full text-lg font-bold leading-none flex-shrink-0"
                title="同じ部位で空の種目を追加"
              >
                ＋
              </button>
              {menuData.exercises.length > 1 && (
                <button
                  onClick={() => removeExercise(exIdx)}
                  className="w-7 h-7 flex items-center justify-center bg-red-100 text-red-600 rounded-full text-base font-bold leading-none border border-red-300 flex-shrink-0"
                  title="この種目を削除"
                >
                  −
                </button>
              )}
            </div>

            {/* 椅子の高さ */}
            <div className="flex items-center gap-2 mb-2 pl-4">
              <input
                type="text"
                value={ex.sets[0]?.machine_height || ""}
                onChange={(e) => updateSet(exIdx, 0, "machine_height", e.target.value)}
                placeholder="椅子の高さ（任意）"
                className="flex-1 bg-gray-200 rounded-full px-3 py-1.5 text-xs outline-none placeholder-gray-500"
              />
            </div>

            {/* 刻み + アシスト */}
            <div className="flex items-center gap-2 mb-2 pl-4 flex-wrap">
              <span className="text-[10px] text-gray-500">刻み</span>
              {WEIGHT_STEPS.map((step) => (
                <button
                  key={step}
                  onClick={() => updateExercise(exIdx, "weight_step", step)}
                  className={`px-2 py-0.5 rounded-full text-[10px] border ${
                    ex.weight_step === step
                      ? "bg-gray-800 text-white border-gray-800"
                      : "bg-white text-gray-700 border-gray-300"
                  }`}
                >
                  {step}kg
                </button>
              ))}
              <label className="flex items-center gap-1 ml-1 text-[10px] text-gray-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={ex.is_assisted}
                  onChange={(e) =>
                    updateExercise(exIdx, "is_assisted", e.target.checked)
                  }
                  className="accent-gray-800"
                />
                アシスト
              </label>
            </div>

            {/* セットリスト */}
            {ex.sets.map((s, setIdx) => (
              <div key={setIdx} className="flex items-center gap-1.5 mb-2 pl-4">
                <div className="flex items-center justify-center w-5 h-5 bg-gray-300 rounded text-xs flex-shrink-0">
                  {s.set_number}
                </div>
                <button
                  className="flex-1 bg-gray-200 rounded-full py-1.5 text-xs text-center"
                  onClick={() => setPicker({ exIdx, setIdx, field: "weight" })}
                >
                  {s.weight}kg
                </button>
                <button
                  className="flex-1 bg-gray-200 rounded-full py-1.5 text-xs text-center"
                  onClick={() => setPicker({ exIdx, setIdx, field: "reps" })}
                >
                  {s.reps}回
                </button>
                {ex.sets.length > 1 && (
                  <button
                    onClick={() => removeSet(exIdx, setIdx)}
                    className="w-6 h-6 flex items-center justify-center bg-red-100 text-red-600 rounded-full text-sm font-bold leading-none flex-shrink-0 border border-red-300"
                    title="セットを削除"
                  >
                    −
                  </button>
                )}
                {setIdx === ex.sets.length - 1 && (
                  <button
                    onClick={() => addSet(exIdx)}
                    className="w-6 h-6 flex items-center justify-center bg-gray-200 rounded-full text-base font-bold leading-none flex-shrink-0"
                    title="セットを追加"
                  >
                    ＋
                  </button>
                )}
              </div>
            ))}

            {/* メモ */}
            <textarea
              value={ex.memo}
              onChange={(e) => updateExercise(exIdx, "memo", e.target.value)}
              placeholder="メモ"
              rows={2}
              className="w-full bg-gray-200 rounded-xl px-3 py-2 text-xs resize-none outline-none placeholder-gray-500"
            />
          </div>
        </div>
        );
      })}

      {/* 画面中央：新しい部位グループを追加する＋ボタン + 他メニューからコピー */}
      <div className="flex items-center justify-center gap-3 py-4">
        <button
          onClick={addExerciseNewGroup}
          className="w-12 h-12 flex items-center justify-center bg-gray-100 border border-gray-300 rounded-full text-3xl font-light text-gray-500 hover:bg-gray-200 leading-none"
          title="新しい部位グループを追加"
        >
          ＋
        </button>
        {savedMenus.some((m) => m.id !== menuData.id && m.exercises.length > 0) && (
          <button
            onClick={() => setShowCopyModal(true)}
            className="px-4 h-10 flex items-center justify-center bg-white border border-gray-400 rounded-full text-xs font-bold text-gray-700 hover:bg-gray-100"
            title="他のメニューから種目をコピー"
          >
            他のメニューから
          </button>
        )}
      </div>

      {/* 保存ボタン */}
      <div className="flex items-center justify-end px-4 pb-2 gap-2">
        {message && <span className="text-xs text-green-600">{message}</span>}
        <button
          onClick={save}
          disabled={saving}
          className="px-5 py-1.5 bg-gray-800 text-white rounded-full text-xs font-bold disabled:opacity-50"
        >
          {saving ? "保存中..." : "保存"}
        </button>
      </div>

      {/* メニュー切替インジケーター */}
      {visibleCount > 1 && (
        <div className="pb-2 pt-1">
          <div className="flex flex-wrap items-center justify-center gap-1.5 px-2">
            {[...Array(visibleCount)].map((_, i) => (
              <button
                key={i}
                onClick={() => switchMenu(i)}
                className={`flex items-center justify-center w-6 h-6 rounded-full text-[10px] font-bold transition-colors ${
                  currentIdx === i
                    ? "bg-gray-800 text-white"
                    : i < savedMenus.length
                    ? "bg-gray-200 text-gray-700"
                    : "bg-white border border-dashed border-gray-400 text-gray-500"
                }`}
              >
                {i + 1}
              </button>
            ))}
          </div>
          <p className="text-center text-[10px] text-gray-400 mt-1">
            ← スワイプで切替 →
          </p>
        </div>
      )}

      {/* スクロールピッカーモーダル */}
      {picker && (
        <div
          className="fixed inset-0 bg-black/40 z-50 flex items-end"
          onClick={() => setPicker(null)}
        >
          <div
            className="w-full max-w-[430px] mx-auto bg-white rounded-t-2xl p-4 pb-6"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="text-center text-xs font-bold mb-2">
              {picker.field === "weight"
                ? "重量を選択（kg）"
                : picker.field === "reps"
                ? "レップ数を選択"
                : "部位を選択"}
            </p>
            <ScrollPicker
              items={
                picker.field === "weight"
                  ? buildWeightOptions(menuData.exercises[picker.exIdx].weight_step)
                  : picker.field === "reps"
                  ? REPS
                  : BODY_PARTS
              }
              value={
                picker.field === "weight"
                  ? menuData.exercises[picker.exIdx].sets[picker.setIdx].weight
                  : picker.field === "reps"
                  ? menuData.exercises[picker.exIdx].sets[picker.setIdx].reps
                  : menuData.exercises[picker.exIdx].body_part
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
              className="w-full mt-3 py-2.5 bg-gray-800 text-white rounded-full text-sm font-bold"
            >
              決定
            </button>
          </div>
        </div>
      )}

      {/* 他のメニューからコピーモーダル */}
      {showCopyModal && (
        <div
          className="fixed inset-0 bg-black/40 z-50 flex items-end"
          onClick={() => setShowCopyModal(false)}
        >
          <div
            className="w-full max-w-[430px] mx-auto bg-white rounded-t-2xl p-4 pb-8 max-h-[80vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-bold">他のメニューから種目をコピー</h2>
              <button
                onClick={() => setShowCopyModal(false)}
                className="text-xs text-gray-500"
              >
                閉じる
              </button>
            </div>

            {savedMenus
              .filter((m) => m.id !== menuData.id && m.exercises.length > 0)
              .map((m) => (
                <div key={m.id} className="mb-4">
                  <p className="text-xs font-bold text-gray-700 mb-1.5">{m.name}</p>
                  <ul className="space-y-1.5">
                    {[...m.exercises]
                      .sort((a, b) => (a.order_index ?? 0) - (b.order_index ?? 0))
                      .map((ex) => (
                        <li
                          key={ex.id}
                          className="flex items-center justify-between gap-2 bg-gray-100 rounded-lg px-3 py-2"
                        >
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1.5 mb-0.5">
                              <span className="inline-flex px-2 py-0.5 border border-gray-400 rounded-full text-[10px]">
                                {ex.body_part}
                              </span>
                              <span className="text-xs font-bold truncate">
                                {ex.name || "（無題）"}
                              </span>
                            </div>
                            <p className="text-[10px] text-gray-500">
                              {ex.sets.length}セット
                            </p>
                          </div>
                          <button
                            onClick={() => copyExerciseFromOther(m, ex.id)}
                            className="px-3 py-1 bg-gray-800 text-white rounded-full text-[10px] font-bold whitespace-nowrap flex-shrink-0"
                          >
                            コピー
                          </button>
                        </li>
                      ))}
                  </ul>
                </div>
              ))}

            <button
              onClick={() => setShowCopyModal(false)}
              className="w-full mt-2 py-2.5 bg-gray-800 text-white rounded-full text-sm font-bold"
            >
              完了
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
