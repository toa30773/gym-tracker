export interface Menu {
  id: string;
  user_id: string;
  name: string;
  days: string[];
  interval_days: number | null;
  start_date: string | null;
  order_index: number;
  created_at: string;
}

export interface Exercise {
  id: string;
  menu_id: string;
  user_id: string;
  body_part: string;
  name: string;
  order_index: number;
  weight_step: number;
  is_assisted: boolean;
}

export interface WorkoutSet {
  id: string;
  exercise_id: string;
  user_id: string;
  set_number: number;
  weight: number;
  reps: number;
  machine_height: string | null;
  memo: string | null;
  // null = 独立セット（直接重量指定）。最終セット = トップとして扱う。
  // それ以外 = トップ重量に対する比率（例: 0.85 = トップの85%）。
  backoff_ratio: number | null;
}

export interface WeightUpdate {
  id: string;
  set_id: string;
  user_id: string;
  old_weight: number | null;
  new_weight: number;
  updated_at: string;
}

export interface SetLog {
  id: string;
  set_id: string;
  exercise_id: string;
  user_id: string;
  performed_at: string;
  set_number: number;
  planned_weight: number;
  planned_reps: number;
  actual_weight: number;
  actual_reps: number;
  is_assisted: boolean;
  rir: number | null;
}

export interface ExerciseWithSets extends Exercise {
  sets: WorkoutSet[];
}

export interface MenuWithExercises extends Menu {
  exercises: ExerciseWithSets[];
}

export const WEIGHT_STEPS = [0.25, 0.5, 1, 1.25, 2.5, 5, 7, 10] as const;

// メニュー横断で「同じ種目」と判定するための正規化。
// trim + NFKC で前後空白と全角/半角差を吸収する。空文字はマッチ対象外として呼び出し側で除外する。
export function normalizeExerciseName(name: string): string {
  return name.trim().normalize("NFKC");
}

function stepDecimals(step: number): number {
  const s = step.toString();
  const i = s.indexOf(".");
  return i === -1 ? 0 : s.length - i - 1;
}

export function roundToStep(value: number, step: number): number {
  return +value.toFixed(stepDecimals(step));
}

// アシスト種目で重量0 = 補助なし = 自重表示。
// 通常種目は単純に "{n}kg"。
export function formatWeight(weight: number, isAssisted: boolean): string {
  if (isAssisted) {
    return weight === 0 ? "自重" : `補助 ${weight}kg`;
  }
  return `${weight}kg`;
}

// 部位バッジ用の Tailwind class。視覚的に部位を即識別できるようにする。
// TOPセットの amber と被らないよう、肩は teal を採用。
const BODY_PART_COLOR_CLASS: Record<string, string> = {
  胸: "bg-rose-50 border-rose-300 text-rose-900",
  背中: "bg-blue-50 border-blue-300 text-blue-900",
  肩: "bg-teal-50 border-teal-300 text-teal-900",
  腕: "bg-violet-50 border-violet-300 text-violet-900",
  脚: "bg-green-50 border-green-300 text-green-900",
  腹: "bg-yellow-50 border-yellow-400 text-yellow-900",
  体幹: "bg-cyan-50 border-cyan-300 text-cyan-900",
  全身: "bg-slate-50 border-slate-400 text-slate-900",
};
export function bodyPartChipClass(bodyPart: string): string {
  return BODY_PART_COLOR_CLASS[bodyPart] ?? "bg-white border-gray-400 text-gray-800";
}

