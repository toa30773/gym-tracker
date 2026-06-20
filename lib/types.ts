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

export interface ExerciseWithSets extends Exercise {
  sets: WorkoutSet[];
}

export interface MenuWithExercises extends Menu {
  exercises: ExerciseWithSets[];
}
