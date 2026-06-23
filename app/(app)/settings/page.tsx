"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { createPortal } from "react-dom";
import {
  getMenusWithExercisesForUser,
  putMenu,
  updateMenu,
  deleteMenuLocal,
  putExercise,
  updateExercise as updateExerciseLocal,
  deleteExerciseLocal,
  putSet,
  updateSet as updateSetLocal,
  deleteSetLocal,
  newId,
  nowIso,
} from "@/lib/local-db";
import { getCurrentUserId, runSync, subscribeSync } from "@/lib/sync";
import { registerGuard, requestNavigation } from "@/lib/nav-guard";
import ScrollPicker from "@/components/ScrollPicker";
import type { Menu, Exercise, WorkoutSet, MenuWithExercises } from "@/lib/types";
import { WEIGHT_STEPS, roundToStep } from "@/lib/types";
import { ymdLocal } from "@/lib/date";

const BODY_PARTS = ["胸", "背中", "肩", "腕", "脚", "腹", "体幹", "全身"];
const DAYS = ["月", "火", "水", "木", "金", "土", "日"];
// Date.getDay() は 0=日, 1=月, ..., 6=土
const DAY_LABEL_BY_INDEX = ["日", "月", "火", "水", "木", "金", "土"];
const DAY_INDEX_BY_LABEL: Record<string, number> = {
  日: 0, 月: 1, 火: 2, 水: 3, 木: 4, 金: 5, 土: 6,
};

// 起点曜日に該当する「今日以降の最初の日付」を YYYY-MM-DD (ローカル) で返す
function nextDateOfDay(label: string): string {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayIdx = today.getDay();
  const targetIdx = DAY_INDEX_BY_LABEL[label] ?? todayIdx;
  const diff = (targetIdx - todayIdx + 7) % 7;
  const target = new Date(today);
  target.setDate(today.getDate() + diff);
  // toISOString() は UTC 基準で 1 日ずれるので、ローカル日付で組み立てる
  return ymdLocal(target);
}
const REPS = Array.from({ length: 30 }, (_, i) => i + 1);
const MAX_MENUS = 10;

interface SetData {
  id?: string;
  set_number: number;
  weight: number;
  reps: number;
  machine_height: string;
  // 0..1 の比率。null = 直接重量指定。最終セット = トップ（比率は無視されて weight が使われる）
  backoff_ratio: number | null;
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

// 新規セットのデフォルト。全セットとも直接 kg 指定（backoff_ratio は使わない）。
const defaultSet = (n: number): SetData => ({
  set_number: n,
  weight: 20,
  reps: 10,
  machine_height: "",
  backoff_ratio: null,
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
  const [savedMenus, setSavedMenus] = useState<MenuWithExercises[]>([]);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [menuData, setMenuData] = useState<MenuData>(defaultMenu(0));
  const [picker, setPicker] = useState<PickerTarget>(null);
  // バックオフ weight ピッカーで「全バックオフに同期」する状態。
  // ON = 1セット触れば他バックオフも同値（規定）／OFF = このセットだけ手入力。
  // picker が開く / 閉じる / 対象が変わるたびに ON に戻す。
  const [syncBackoffs, setSyncBackoffs] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [showDaySelector, setShowDaySelector] = useState(false);
  const [intervalInput, setIntervalInput] = useState("");
  const [showCopyModal, setShowCopyModal] = useState(false);
  // 「コピー」を押した直後に視覚フィードバックを出すための一時記憶（exercise.id の集合）
  const [recentlyCopiedIds, setRecentlyCopiedIds] = useState<Set<string>>(new Set());
  const [confirmDelete, setConfirmDelete] = useState(false);
  // 保存バーを差し込む先（AppLayout の slot）。マウント後にだけ見つかる。
  const [actionBarSlot, setActionBarSlot] = useState<HTMLElement | null>(null);
  useEffect(() => {
    setActionBarSlot(document.getElementById("app-action-bar-slot"));
  }, []);
  // ピッカーが開く / 対象が変わるたびに「同期」既定値 ON に戻す
  useEffect(() => {
    setSyncBackoffs(true);
  }, [picker?.exIdx, picker?.setIdx, picker?.field]);
  const [deleting, setDeleting] = useState(false);
  // 現在の menuData が直近 load した内容と一致するかを判定するための基準値（JSON 文字列）
  const [baseline, setBaseline] = useState<string>(() =>
    JSON.stringify(defaultMenu(0)),
  );
  // 未保存ガード：BottomNav で別ページへ遷移しようとした時にここに proceed が積まれる
  const [pendingProceed, setPendingProceed] = useState<(() => void) | null>(null);

  const fetchMenus = useCallback(async () => {
    const userId = await getCurrentUserId();
    if (!userId) return;

    const list = (await getMenusWithExercisesForUser(userId)) as MenuWithExercises[];
    setSavedMenus(list);
    return list;
  }, []);

  function loadMenu(m: MenuWithExercises) {
    const data: MenuData = {
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
                  // 旧データの ratio は読み捨て、null に正規化（実際の kg は s.weight に入っている）
                  backoff_ratio: null,
                })),
            }))
          : [defaultExercise()],
    };
    setMenuData(data);
    setBaseline(JSON.stringify(data));
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

  // sync の pull で IndexedDB にメニューが入った直後にも一覧を反映させる。
  // 初回マウント時の fetchMenus はローカル DB がまだ空のことがあり、
  // その時 savedMenus = [] のまま固定されて pager / delete が消えたままになる。
  useEffect(() => {
    let lastSeen: string | null = null;
    const unsub = subscribeSync((s) => {
      if (!s.lastSyncAt || s.lastSyncAt === lastSeen) return;
      lastSeen = s.lastSyncAt;
      // 編集中のメニューを上書きしないため、未保存の編集が無さそうな時だけ
      // 最初のメニューにジャンプする。すでに 1 件以上見えていれば一覧だけ更新。
      fetchMenus().then((list) => {
        if (!list) return;
        if (savedMenus.length === 0 && list.length > 0) {
          loadMenu(list[0]);
          setCurrentIdx(0);
        }
      });
    });
    return unsub;
  }, [fetchMenus, savedMenus.length]);

  // 切替可能なメニュー数 = 保存済み + 次の1つ（最大MAX_MENUS）
  const visibleCount = Math.min(savedMenus.length + 1, MAX_MENUS);

  async function deleteMenu() {
    if (!menuData.id || deleting) return;
    setDeleting(true);
    const userId = await getCurrentUserId();
    if (!userId) {
      setDeleting(false);
      return;
    }
    try {
      await deleteMenuLocal(menuData.id, userId);
    } catch (e) {
      console.error("メニュー削除に失敗しました", e);
      setDeleting(false);
      return;
    }
    runSync().catch(() => {});
    const list = await fetchMenus();
    if (list && list.length > 0) {
      setCurrentIdx(0);
      loadMenu(list[0]);
    } else {
      setCurrentIdx(0);
      const d = defaultMenu(0);
      setMenuData(d);
      setBaseline(JSON.stringify(d));
      setIntervalInput("");
    }
    setConfirmDelete(false);
    setDeleting(false);
    setMessage("削除しました");
    setTimeout(() => setMessage(""), 2000);
  }
  const isNewMenu = currentIdx >= savedMenus.length;

  function switchMenu(newIdx: number) {
    if (newIdx < 0 || newIdx >= visibleCount || newIdx === currentIdx) return;
    // メニュー切替も BottomNav と同じガードに通す。
    // 未保存編集ありなら確認モーダル → 保存/破棄 後に切替。
    requestNavigation(() => {
      setCurrentIdx(newIdx);
      if (newIdx < savedMenus.length) {
        loadMenu(savedMenus[newIdx]);
      } else {
        const d = defaultMenu(newIdx);
        setMenuData(d);
        setBaseline(JSON.stringify(d));
        setIntervalInput("");
      }
    });
  }

  function toggleDay(day: string) {
    setMenuData((prev) => {
      // 間隔モード = 起点曜日を 1 日だけ保持。同じ日を再タップで解除し、間隔も同時に解除。
      if (prev.interval_days) {
        if (prev.days.length === 1 && prev.days[0] === day) {
          return { ...prev, days: [], interval_days: null, start_date: null };
        }
        return { ...prev, days: [day], start_date: nextDateOfDay(day) };
      }
      // 通常モード（複数選択トグル）
      return {
        ...prev,
        days: prev.days.includes(day)
          ? prev.days.filter((d) => d !== day)
          : [...prev.days, day],
      };
    });
  }

  function setInterval(days: number | null) {
    setMenuData((prev) => {
      if (!days) {
        return { ...prev, interval_days: null, start_date: null };
      }
      // 間隔を入れる際は起点曜日を必ず確定させる。
      // 未選択なら今日の曜日、複数選択中なら先頭を残す。
      let dayList = prev.days;
      let startLabel: string;
      if (dayList.length === 0) {
        startLabel = DAY_LABEL_BY_INDEX[new Date().getDay()];
        dayList = [startLabel];
      } else {
        startLabel = dayList[0];
        if (dayList.length > 1) dayList = [startLabel];
      }
      return {
        ...prev,
        days: dayList,
        interval_days: days,
        start_date: nextDateOfDay(startLabel),
      };
    });
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
        backoff_ratio: null,
      })),
    };
    setMenuData((prev) => ({
      ...prev,
      exercises: [...prev.exercises, copy],
    }));
    // 押したボタンが「✓ 追加しました」に1.5秒切り替わるようマーク
    setRecentlyCopiedIds((prev) => {
      const next = new Set(prev);
      next.add(srcExId);
      return next;
    });
    setTimeout(() => {
      setRecentlyCopiedIds((prev) => {
        if (!prev.has(srcExId)) return prev;
        const next = new Set(prev);
        next.delete(srcExId);
        return next;
      });
    }, 1500);
  }

  function removeExercise(exIdx: number) {
    setMenuData((prev) => {
      if (prev.exercises.length <= 1) return prev;
      const exercises = prev.exercises.filter((_, i) => i !== exIdx);
      return { ...prev, exercises };
    });
  }

  // 種目を隣と入れ替える。direction=-1 で 1 つ上、+1 で 1 つ下。
  function moveExercise(exIdx: number, direction: -1 | 1) {
    setMenuData((prev) => {
      const target = exIdx + direction;
      if (target < 0 || target >= prev.exercises.length) return prev;
      const exercises = [...prev.exercises];
      [exercises[exIdx], exercises[target]] = [exercises[target], exercises[exIdx]];
      return { ...prev, exercises };
    });
  }

  function removeSet(exIdx: number, setIdx: number) {
    setMenuData((prev) => {
      const exercises = [...prev.exercises];
      const ex = { ...exercises[exIdx] };
      if (ex.sets.length <= 1) return prev;
      const list = ex.sets.filter((_, i) => i !== setIdx);
      ex.sets = list.map((s, i) => ({
        ...s,
        set_number: i + 1,
        backoff_ratio: null,
      }));
      exercises[exIdx] = ex;
      return { ...prev, exercises };
    });
  }

  // 末尾 = トップを保つため、新規セットは「末尾の1つ前」に挿入する。
  // kg の初期値は「既存バックオフがあればその値」（バックオフ群を揃える運用に合わせる）、
  // バックオフがまだ無ければ TOP の kg を複製する。
  function addSet(exIdx: number) {
    setMenuData((prev) => {
      const exercises = [...prev.exercises];
      const ex = { ...exercises[exIdx] };
      const insertAt = Math.max(0, ex.sets.length - 1);
      const top = ex.sets[ex.sets.length - 1];
      const existingBackoff = ex.sets.length > 1 ? ex.sets[0] : null;
      const sharedHeight = ex.sets[0]?.machine_height || "";
      const defaultWeight = existingBackoff
        ? existingBackoff.weight
        : top
        ? top.weight
        : 20;
      const newSet: SetData = {
        set_number: 0,
        weight: defaultWeight,
        reps: top ? top.reps : 10,
        machine_height: sharedHeight,
        backoff_ratio: null,
      };
      const list = [...ex.sets];
      list.splice(insertAt, 0, newSet);
      ex.sets = list.map((s, i) => ({
        ...s,
        set_number: i + 1,
        backoff_ratio: null,
      }));
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

  // バックオフの重量を 1 つ変えたら、他の全バックオフも同じ値に同期する（デフォルト）。
  // TOP（最終セット）は独立。reps と椅子の高さは同期しない。
  // ピッカー側で「全バックオフに同期」を OFF にしているときは solo=true で渡され、
  // 該当セットだけ更新する（ピラミッド型など個別調整したい時用）。
  function updateSet(
    exIdx: number,
    setIdx: number,
    field: keyof SetData,
    val: number | string,
    options: { solo?: boolean } = {},
  ) {
    setMenuData((prev) => {
      const exercises = [...prev.exercises];
      const sets = [...exercises[exIdx].sets];
      const isTop = setIdx === sets.length - 1;
      if (
        field === "weight" &&
        !isTop &&
        sets.length > 2 &&
        !options.solo
      ) {
        // 自分を含むすべてのバックオフを val に揃える
        for (let i = 0; i < sets.length - 1; i++) {
          sets[i] = { ...sets[i], weight: val as number };
        }
      } else {
        sets[setIdx] = { ...sets[setIdx], [field]: val };
      }
      exercises[exIdx] = { ...exercises[exIdx], sets };
      return { ...prev, exercises };
    });
  }

  // 未保存判定。baseline は最後に load / 初期化された snapshot。menuData が編集される
  // たびに JSON が変わるので、不一致 = 未保存編集あり。
  // useMemo で menuData / baseline が変わった時だけ再計算（picker トグル等の再描画では走らない）。
  const isDirty = useMemo(
    () => JSON.stringify(menuData) !== baseline,
    [menuData, baseline],
  );

  // ブラウザのタブを閉じる／リロード時の警告（SPA 内遷移はこれでは捕まらない）
  useEffect(() => {
    if (!isDirty) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [isDirty]);

  // BottomNav からの別ページ遷移を受け止める guard。
  // proceed を pendingProceed に積んで確認モーダルを開く。
  useEffect(() => {
    if (!isDirty) {
      registerGuard(null);
      return;
    }
    registerGuard((proceed) => setPendingProceed(() => proceed));
    return () => registerGuard(null);
  }, [isDirty]);

  async function save() {
    setSaving(true);
    setMessage("");
    const userId = await getCurrentUserId();
    if (!userId) {
      setSaving(false);
      return;
    }

    // 既存メニューの保存前スナップショット（差分削除に使う）
    const existingBeforeSave = savedMenus.find((m) => m.id === menuData.id) || null;

    let menuId = menuData.id;
    const isNewMenuLocal = !menuId;

    const menuRecord: Menu = {
      id: menuId || newId(),
      user_id: userId,
      name: menuData.name,
      days: menuData.days,
      interval_days: menuData.interval_days,
      start_date: menuData.start_date,
      order_index: existingBeforeSave?.order_index ?? currentIdx,
      created_at: existingBeforeSave?.created_at ?? nowIso(),
    };

    try {
      if (isNewMenuLocal) {
        await putMenu(menuRecord, { enqueue: true });
        menuId = menuRecord.id;
      } else {
        await updateMenu(menuRecord);
      }

      const keepExerciseIds: string[] = [];

      for (let i = 0; i < menuData.exercises.length; i++) {
        const ex = menuData.exercises[i];
        const isNewExercise = !ex.id;
        const exerciseRecord: Exercise = {
          id: ex.id || newId(),
          menu_id: menuId!,
          user_id: userId,
          body_part: ex.body_part || "胸",
          name: ex.name,
          order_index: i,
          weight_step: ex.weight_step,
          is_assisted: ex.is_assisted,
        };

        if (isNewExercise) {
          await putExercise(exerciseRecord, { enqueue: true });
        } else {
          await updateExerciseLocal(exerciseRecord);
        }
        keepExerciseIds.push(exerciseRecord.id);

        // 椅子の高さは set[0] のみUIで編集するので、全セットに伝播させる
        const sharedMachineHeight = ex.sets[0]?.machine_height || null;

        // セットは「直接 kg 指定」のみ。backoff_ratio は使わず常に null で書き戻す。
        // セット書き込みは IDB の独立行なので並列化して良い。
        const setRecords: WorkoutSet[] = ex.sets.map((s) => ({
          id: s.id || newId(),
          exercise_id: exerciseRecord.id,
          user_id: userId,
          set_number: s.set_number,
          weight: s.weight,
          reps: s.reps,
          machine_height: sharedMachineHeight,
          memo: ex.memo || null,
          backoff_ratio: null,
        }));
        const isNewSetFlags = ex.sets.map((s) => !s.id);
        await Promise.all(
          setRecords.map((setRecord, idx) =>
            isNewSetFlags[idx]
              ? putSet(setRecord, { enqueue: true })
              : updateSetLocal(setRecord),
          ),
        );
        const keepSetIds = setRecords.map((r) => r.id);

        // 削除されたセットを片付ける（既存種目の場合のみ）
        if (!isNewExercise && existingBeforeSave) {
          const before = existingBeforeSave.exercises.find((e) => e.id === ex.id);
          if (before) {
            const toDelete = before.sets.filter(
              (oldSet) => !keepSetIds.includes(oldSet.id),
            );
            await Promise.all(
              toDelete.map((oldSet) => deleteSetLocal(oldSet.id, userId)),
            );
          }
        }
      }

      // 削除された種目を片付ける
      if (existingBeforeSave) {
        const toDelete = existingBeforeSave.exercises.filter(
          (oldEx) => !keepExerciseIds.includes(oldEx.id),
        );
        await Promise.all(
          toDelete.map((oldEx) => deleteExerciseLocal(oldEx.id, userId)),
        );
      }
    } catch (e) {
      console.error("保存に失敗しました", e);
      setMessage("保存に失敗しました");
      setSaving(false);
      return;
    }

    runSync().catch(() => {});

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
          const d = defaultMenu(nextIdx);
          setMenuData(d);
          setBaseline(JSON.stringify(d));
          setIntervalInput("");
        }
      } else {
        const updated = list[currentIdx];
        if (updated) loadMenu(updated);
      }
    }
    setTimeout(() => setMessage(""), 2000);
  }

  return (
    <div className="pb-2">
      <div key={currentIdx} className="menu-fade-in">
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
        {(() => {
          const startLabel = menuData.days[0] ?? null;
          let chipText: string;
          if (menuData.days.length === 0) chipText = "曜日を設定";
          else if (menuData.interval_days && startLabel)
            chipText = `${startLabel}起点 / ${menuData.interval_days}日`;
          else chipText = menuData.days.join("・");
          return (
            <button
              onClick={() => setShowDaySelector((s) => !s)}
              className="px-3 py-1.5 bg-gray-200 rounded-full text-xs flex-shrink-0"
            >
              {chipText}
            </button>
          );
        })()}
      </div>

      {/* 曜日 / 間隔セレクタ */}
      {showDaySelector && (() => {
        const startLabel = menuData.days[0] ?? null;
        const nextLabel =
          menuData.interval_days && startLabel
            ? DAY_LABEL_BY_INDEX[
                (DAY_INDEX_BY_LABEL[startLabel] + menuData.interval_days) % 7
              ]
            : null;
        const showNextDistinct = nextLabel && nextLabel !== startLabel;
        return (
          <div className="mx-4 mb-3 p-3 bg-gray-50 rounded-xl border border-gray-200">
            <p className="text-xs font-bold mb-2">
              {menuData.interval_days ? "起点曜日（1つ）" : "曜日を選択"}
            </p>
            <div className="flex gap-1 mb-3">
              {DAYS.map((d) => {
                const isStart = menuData.days.includes(d);
                const isNext = showNextDistinct && d === nextLabel;
                const cls = isStart
                  ? "bg-gray-700 text-white border-gray-700"
                  : isNext
                  ? "bg-emerald-100 text-emerald-900 border-emerald-400"
                  : "bg-white text-gray-700 border-gray-300";
                return (
                  <button
                    key={d}
                    onClick={() => toggleDay(d)}
                    className={`flex-1 py-1 rounded text-xs border ${cls}`}
                  >
                    {d}
                  </button>
                );
              })}
            </div>

            {/* 間隔は「曜日が 1 日だけ選択」されているときだけ入力可能 */}
            {menuData.days.length === 1 && (
              <div className="flex items-center gap-2">
                <span className="text-xs">間隔</span>
                <input
                  type="number"
                  min={1}
                  max={30}
                  value={intervalInput}
                  onChange={(e) => {
                    setIntervalInput(e.target.value);
                    const n = parseInt(e.target.value, 10);
                    if (!isNaN(n) && n > 0) setInterval(n);
                    else if (e.target.value === "") setInterval(null);
                  }}
                  className="w-14 px-2 py-1 bg-white border border-gray-300 rounded text-center text-xs"
                  placeholder="--"
                />
                <span className="text-xs">日</span>
                {menuData.interval_days && (
                  <button
                    onClick={() => setInterval(null)}
                    className="text-xs text-gray-500 underline ml-2"
                  >
                    クリア
                  </button>
                )}
              </div>
            )}

            {menuData.interval_days && menuData.start_date && (
              <p className="text-[10px] text-gray-500 mt-2">
                開始 {menuData.start_date}
                {showNextDistinct && (
                  <span className="ml-2">
                    → 次回 <span className="text-emerald-700 font-bold">{nextLabel}</span>
                  </span>
                )}
              </p>
            )}

            {menuData.days.length >= 2 && (
              <p className="text-[10px] text-gray-500 mt-2">
                間隔指定は起点曜日を 1 つだけ選んだ場合に使えます
              </p>
            )}
          </div>
        );
      })()}

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
              {exIdx > 0 && (
                <button
                  onClick={() => moveExercise(exIdx, -1)}
                  className="w-6 h-6 flex items-center justify-center bg-gray-100 rounded-full text-[10px] leading-none flex-shrink-0 border border-gray-300"
                  title="1つ上へ"
                >
                  ▲
                </button>
              )}
              {exIdx < menuData.exercises.length - 1 && (
                <button
                  onClick={() => moveExercise(exIdx, 1)}
                  className="w-6 h-6 flex items-center justify-center bg-gray-100 rounded-full text-[10px] leading-none flex-shrink-0 border border-gray-300"
                  title="1つ下へ"
                >
                  ▼
                </button>
              )}
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

            {/* セットリスト：末尾 = TOP、それ以外 = バックオフ。
                すべて kg を直接入力。バックオフは編集すると他のバックオフも同期される。 */}
            {ex.sets.map((s, setIdx) => {
              const isTop = setIdx === ex.sets.length - 1;
              return (
                <div key={setIdx} className="flex items-center gap-1.5 mb-2 pl-4">
                  <div
                    className={`flex items-center justify-center w-5 h-5 rounded text-[10px] font-bold flex-shrink-0 ${
                      isTop ? "bg-gray-800 text-white" : "bg-gray-300"
                    }`}
                  >
                    {s.set_number}
                  </div>
                  {isTop && (
                    <span className="text-[10px] font-bold text-gray-700 px-1">TOP</span>
                  )}
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
                  {isTop && (
                    <button
                      onClick={() => addSet(exIdx)}
                      className="w-6 h-6 flex items-center justify-center bg-gray-200 rounded-full text-base font-bold leading-none flex-shrink-0"
                      title="バックオフセットを追加"
                    >
                      ＋
                    </button>
                  )}
                </div>
              );
            })}

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

      </div>

      {/* 保存バーは AppLayout のスロットへ Portal 経由で挿入する。
          main の外側に置くので、スクロール状態に関係なく BottomNav の真上に出る。 */}
      {actionBarSlot &&
        createPortal(
          <div className="mx-auto max-w-[430px] bg-white border-t border-gray-200 px-3 py-2 flex items-center gap-2">
            <div className="flex-1 flex items-center min-w-0">
              {menuData.id && (
                <button
                  onClick={() => setConfirmDelete(true)}
                  className="text-[10px] text-red-500 underline whitespace-nowrap"
                >
                  このメニューを削除
                </button>
              )}
            </div>
            <div className="flex items-center justify-center gap-1 flex-wrap max-w-[55%]">
              {[...Array(visibleCount)].map((_, i) => (
                <button
                  key={i}
                  onClick={() => switchMenu(i)}
                  className={`flex items-center justify-center w-6 h-6 rounded-full text-[10px] font-bold transition-colors flex-shrink-0 ${
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
            <div className="flex-1 flex items-center justify-end gap-2">
              {isDirty && (
                <span className="text-[10px] text-red-500 font-bold whitespace-nowrap">
                  未保存
                </span>
              )}
              {message && (
                <span className="text-[10px] text-green-600 whitespace-nowrap">
                  {message}
                </span>
              )}
              <button
                onClick={save}
                disabled={saving}
                className="px-4 py-1.5 bg-gray-800 text-white rounded-full text-xs font-bold disabled:opacity-50 whitespace-nowrap"
              >
                {saving ? "保存中..." : "保存"}
              </button>
            </div>
          </div>,
          actionBarSlot,
        )}

      {/* 重量／レップ／部位 入力モーダル
          weight だけテンキー入力＋±（マシン固有の不規則ステップに対応）。
          他は従来通り ScrollPicker。 */}
      {picker && (() => {
        const isTopPicker =
          picker.field === "weight" &&
          picker.setIdx ===
            menuData.exercises[picker.exIdx].sets.length - 1;
        const showSyncToggle =
          picker.field === "weight" &&
          !isTopPicker &&
          menuData.exercises[picker.exIdx].sets.length > 2;
        // 同期トグルが見えていて OFF のときだけ solo=true で渡す。
        // トグル自体が出ていない場合（TOP / バックオフ1個のみ）は通常更新で問題なし。
        const solo = showSyncToggle && !syncBackoffs;
        return (
        <div
          className="fixed inset-0 bg-black/40 z-50 flex items-end"
          onClick={() => setPicker(null)}
        >
          <div
            className="w-full max-w-[430px] mx-auto bg-white rounded-t-2xl p-4 pb-6"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="text-center text-xs font-bold mb-3">
              {picker.field === "weight"
                ? isTopPicker
                  ? "TOP の重量を入力（kg）"
                  : "バックオフの重量を入力（kg）"
                : picker.field === "reps"
                ? "レップ数を選択"
                : "部位を選択"}
            </p>
            {showSyncToggle && (
              <label className="flex items-center justify-center gap-2 mb-3 text-[11px] text-gray-700">
                <input
                  type="checkbox"
                  checked={syncBackoffs}
                  onChange={(e) => setSyncBackoffs(e.target.checked)}
                  className="accent-gray-800"
                />
                全バックオフに同期
                <span className="text-[10px] text-gray-400">
                  （OFFでこのセットだけ）
                </span>
              </label>
            )}
            {picker.field === "weight" ? (() => {
              const ex = menuData.exercises[picker.exIdx];
              const set = ex.sets[picker.setIdx];
              const step = ex.weight_step;
              return (
                <div className="flex items-center justify-center gap-3 mb-2">
                  <button
                    onClick={() =>
                      updateSet(
                        picker.exIdx,
                        picker.setIdx,
                        "weight",
                        Math.max(0, roundToStep(set.weight - step, step)),
                        { solo },
                      )
                    }
                    className="w-12 h-12 bg-gray-200 rounded-full text-2xl font-bold leading-none"
                  >
                    −
                  </button>
                  <input
                    type="number"
                    inputMode="decimal"
                    min={0}
                    step={step}
                    // 0 のときは空表示 + placeholder="0" にする。
                    // value=0 のままだと iOS で select() が効かず "0" を消せない事故が起きる。
                    value={set.weight === 0 ? "" : set.weight}
                    placeholder="0"
                    onChange={(e) => {
                      const str = e.target.value;
                      if (str === "") {
                        updateSet(picker.exIdx, picker.setIdx, "weight", 0, { solo });
                        return;
                      }
                      const v = parseFloat(str);
                      if (Number.isFinite(v) && v >= 0) {
                        updateSet(picker.exIdx, picker.setIdx, "weight", v, { solo });
                      }
                    }}
                    onFocus={(e) => e.currentTarget.select()}
                    className="w-32 text-center text-2xl font-bold bg-gray-100 rounded-xl py-2 outline-none"
                  />
                  <span className="text-sm">kg</span>
                  <button
                    onClick={() =>
                      updateSet(
                        picker.exIdx,
                        picker.setIdx,
                        "weight",
                        roundToStep(set.weight + step, step),
                        { solo },
                      )
                    }
                    className="w-12 h-12 bg-gray-200 rounded-full text-2xl font-bold leading-none"
                  >
                    ＋
                  </button>
                </div>
              );
            })() : (
              <ScrollPicker
                items={picker.field === "reps" ? REPS : BODY_PARTS}
                value={
                  picker.field === "reps"
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
            )}
            <button
              onClick={() => setPicker(null)}
              className="w-full mt-3 py-2.5 bg-gray-800 text-white rounded-full text-sm font-bold"
            >
              決定
            </button>
          </div>
        </div>
        );
      })()}

      {/* 未保存ガード確認モーダル */}
      {pendingProceed && (
        <div
          className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center px-6"
          onClick={() => setPendingProceed(null)}
        >
          <div
            className="bg-white rounded-2xl p-5 max-w-xs w-full"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="text-sm font-bold mb-1">未保存の変更があります</p>
            <p className="text-[10px] text-gray-600 mb-4">
              保存していない編集を破棄して移動しますか？
            </p>
            <div className="flex flex-col gap-2">
              <button
                onClick={async () => {
                  const proceed = pendingProceed;
                  setPendingProceed(null);
                  await save();
                  proceed();
                }}
                className="py-2 bg-gray-800 text-white rounded-full text-xs font-bold"
              >
                保存して移動
              </button>
              <button
                onClick={() => {
                  const proceed = pendingProceed;
                  setPendingProceed(null);
                  proceed();
                }}
                className="py-2 bg-red-50 text-red-600 border border-red-200 rounded-full text-xs font-bold"
              >
                破棄して移動
              </button>
              <button
                onClick={() => setPendingProceed(null)}
                className="py-2 bg-gray-200 rounded-full text-xs font-bold"
              >
                キャンセル
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 削除確認モーダル */}
      {confirmDelete && (
        <div
          className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center px-6"
          onClick={() => !deleting && setConfirmDelete(false)}
        >
          <div
            className="bg-white rounded-2xl p-5 max-w-xs w-full"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="text-sm font-bold mb-2">
              「{menuData.name || "（無題）"}」を削除しますか？
            </p>
            <p className="text-[10px] text-gray-600 mb-4">
              このメニューの種目・セット・重量更新履歴・実績データもすべて削除されます。元に戻せません。
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setConfirmDelete(false)}
                disabled={deleting}
                className="flex-1 py-2 bg-gray-200 rounded-full text-xs font-bold disabled:opacity-50"
              >
                キャンセル
              </button>
              <button
                onClick={deleteMenu}
                disabled={deleting}
                className="flex-1 py-2 bg-red-500 text-white rounded-full text-xs font-bold disabled:opacity-50"
              >
                {deleting ? "削除中..." : "削除する"}
              </button>
            </div>
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
                          {(() => {
                            const justCopied = recentlyCopiedIds.has(ex.id);
                            return (
                              <button
                                onClick={() => copyExerciseFromOther(m, ex.id)}
                                className={`px-3 py-1 text-white rounded-full text-[10px] font-bold whitespace-nowrap flex-shrink-0 transition-colors ${
                                  justCopied ? "bg-emerald-600" : "bg-gray-800"
                                }`}
                              >
                                {justCopied ? "✓ 追加しました" : "コピー"}
                              </button>
                            );
                          })()}
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
