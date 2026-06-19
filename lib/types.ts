export type Json = string | number | boolean | null | { [key: string]: Json } | Json[];

export interface Database {
  public: {
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Tables: {
      menus: {
        Row: {
          id: string;
          user_id: string;
          name: string;
          days: string[];
          interval_days: number | null;
          start_date: string | null;
          order_index: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          name?: string;
          days?: string[];
          interval_days?: number | null;
          start_date?: string | null;
          order_index?: number;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          name?: string;
          days?: string[];
          interval_days?: number | null;
          start_date?: string | null;
          order_index?: number;
          created_at?: string;
        };
      };
      exercises: {
        Row: {
          id: string;
          menu_id: string;
          user_id: string;
          body_part: string;
          name: string;
          order_index: number;
        };
        Insert: {
          id?: string;
          menu_id: string;
          user_id: string;
          body_part: string;
          name: string;
          order_index?: number;
        };
        Update: {
          id?: string;
          menu_id?: string;
          user_id?: string;
          body_part?: string;
          name?: string;
          order_index?: number;
        };
      };
      sets: {
        Row: {
          id: string;
          exercise_id: string;
          user_id: string;
          set_number: number;
          weight: number;
          reps: number;
          machine_height: string | null;
          memo: string | null;
        };
        Insert: {
          id?: string;
          exercise_id: string;
          user_id: string;
          set_number: number;
          weight?: number;
          reps?: number;
          machine_height?: string | null;
          memo?: string | null;
        };
        Update: {
          id?: string;
          exercise_id?: string;
          user_id?: string;
          set_number?: number;
          weight?: number;
          reps?: number;
          machine_height?: string | null;
          memo?: string | null;
        };
      };
      weight_updates: {
        Row: {
          id: string;
          set_id: string;
          user_id: string;
          old_weight: number | null;
          new_weight: number;
          updated_at: string;
        };
        Insert: {
          id?: string;
          set_id: string;
          user_id: string;
          old_weight?: number | null;
          new_weight: number;
          updated_at?: string;
        };
        Update: {
          id?: string;
          set_id?: string;
          user_id?: string;
          old_weight?: number | null;
          new_weight?: number;
          updated_at?: string;
        };
      };
    };
  };
}

export type Menu = Database["public"]["Tables"]["menus"]["Row"];
export type Exercise = Database["public"]["Tables"]["exercises"]["Row"];
export type WorkoutSet = Database["public"]["Tables"]["sets"]["Row"];
export type WeightUpdate = Database["public"]["Tables"]["weight_updates"]["Row"];

export interface ExerciseWithSets extends Exercise {
  sets: WorkoutSet[];
}

export interface MenuWithExercises extends Menu {
  exercises: ExerciseWithSets[];
}
