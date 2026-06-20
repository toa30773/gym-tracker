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
}

export interface ExerciseWithSets extends Exercise {
  sets: WorkoutSet[];
}

export interface MenuWithExercises extends Menu {
  exercises: ExerciseWithSets[];
}

export const WEIGHT_STEPS = [0.25, 0.5, 1, 1.25, 2.5, 5] as const;
export type WeightStep = (typeof WEIGHT_STEPS)[number];

export function buildWeightOptions(step: number, max = 200): number[] {
  const out: number[] = [];
  const round = step < 1 ? 2 : 1;
  for (let w = 0; w <= max + 1e-9; w = +(w + step).toFixed(round)) {
    out.push(w);
  }
  return out;
}
