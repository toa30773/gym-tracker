-- ワークアウトメニュー
create table if not exists menus (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users not null,
  name text not null default 'メニュー',
  days text[] default '{}',
  order_index int default 0,
  created_at timestamptz default now()
);

-- 種目（メニュー内）
create table if not exists exercises (
  id uuid primary key default gen_random_uuid(),
  menu_id uuid references menus(id) on delete cascade not null,
  user_id uuid references auth.users not null,
  body_part text not null,
  name text not null,
  order_index int default 0
);

-- セット（種目内）
create table if not exists sets (
  id uuid primary key default gen_random_uuid(),
  exercise_id uuid references exercises(id) on delete cascade not null,
  user_id uuid references auth.users not null,
  set_number int not null,
  weight decimal(5,1) not null default 0,
  reps int not null default 10,
  machine_height text,
  memo text
);

-- 重量更新履歴
create table if not exists weight_updates (
  id uuid primary key default gen_random_uuid(),
  set_id uuid references sets(id) on delete cascade not null,
  user_id uuid references auth.users not null,
  old_weight decimal(5,1),
  new_weight decimal(5,1) not null,
  updated_at timestamptz default now()
);

-- RLS
alter table menus enable row level security;
alter table exercises enable row level security;
alter table sets enable row level security;
alter table weight_updates enable row level security;

create policy "own data" on menus for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own data" on exercises for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own data" on sets for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own data" on weight_updates for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
