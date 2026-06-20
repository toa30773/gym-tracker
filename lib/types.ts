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

export const WEIGHT_STEPS = [0.25, 0.5, 1, 1.25, 2.5, 5, 10] as const;
export type WeightStep = (typeof WEIGHT_STEPS)[number];

function stepDecimals(step: number): number {
  const s = step.toString();
  const i = s.indexOf(".");
  return i === -1 ? 0 : s.length - i - 1;
}

export function roundToStep(value: number, step: number): number {
  return +value.toFixed(stepDecimals(step));
}

export function buildWeightOptions(step: number, max = 200): number[] {
  const d = stepDecimals(step);
  const factor = Math.pow(10, d);
  const stepN = Math.round(step * factor);
  const maxN = Math.round(max * factor);
  const out: number[] = [];
  for (let n = 0; n <= maxN; n += stepN) {
    out.push(+(n / factor).toFixed(d));
  }
  return out;
}
