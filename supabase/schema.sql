-- ワークアウトメニュー
create table if not exists menus (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users not null,
  name text not null default 'メニュー',
  days text[] default '{}',
  interval_days int,
  start_date date,
  order_index int default 0,
  created_at timestamptz default now()
);

-- 既存テーブル用のマイグレーション（再実行可）
alter table menus add column if not exists interval_days int;
alter table menus add column if not exists start_date date;

-- 種目（メニュー内）
create table if not exists exercises (
  id uuid primary key default gen_random_uuid(),
  menu_id uuid references menus(id) on delete cascade not null,
  user_id uuid references auth.users not null,
  body_part text not null,
  name text not null,
  order_index int default 0,
  weight_step numeric not null default 2.5,
  is_assisted boolean not null default false
);

-- 既存テーブルへのマイグレーション
alter table exercises add column if not exists weight_step numeric not null default 2.5;
alter table exercises add column if not exists is_assisted boolean not null default false;

-- セット（種目内）
create table if not exists sets (
  id uuid primary key default gen_random_uuid(),
  exercise_id uuid references exercises(id) on delete cascade not null,
  user_id uuid references auth.users not null,
  set_number int not null,
  weight numeric not null default 0,
  reps int not null default 10,
  machine_height text,
  memo text
);

-- 重量カラムを numeric に拡張（0.25 刻みなど対応）
alter table sets alter column weight type numeric;

-- 重量更新履歴
create table if not exists weight_updates (
  id uuid primary key default gen_random_uuid(),
  set_id uuid references sets(id) on delete cascade not null,
  user_id uuid references auth.users not null,
  old_weight numeric,
  new_weight numeric not null,
  updated_at timestamptz default now()
);

alter table weight_updates alter column old_weight type numeric;
alter table weight_updates alter column new_weight type numeric;

-- セット実績ログ（計画値と実績の分離）
create table if not exists set_logs (
  id uuid primary key default gen_random_uuid(),
  set_id uuid references sets(id) on delete cascade not null,
  exercise_id uuid references exercises(id) on delete cascade not null,
  user_id uuid references auth.users not null,
  performed_at timestamptz not null default now(),
  set_number int not null,
  planned_weight numeric not null,
  planned_reps int not null,
  actual_weight numeric not null,
  actual_reps int not null,
  is_assisted boolean not null default false,
  rir int
);

-- 既存テーブルへの追加（再実行可）
alter table set_logs add column if not exists rir int;

create index if not exists set_logs_user_performed_idx on set_logs(user_id, performed_at desc);
create index if not exists set_logs_exercise_id_idx on set_logs(exercise_id);

-- RLS
alter table menus enable row level security;
alter table exercises enable row level security;
alter table sets enable row level security;
alter table weight_updates enable row level security;
alter table set_logs enable row level security;

drop policy if exists "own data" on menus;
drop policy if exists "own data" on exercises;
drop policy if exists "own data" on sets;
drop policy if exists "own data" on weight_updates;
drop policy if exists "own data" on set_logs;

create policy "own data" on menus for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own data" on exercises for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own data" on sets for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own data" on weight_updates for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own data" on set_logs for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
