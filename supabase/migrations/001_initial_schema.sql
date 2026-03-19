-- Enable UUID generation
create extension if not exists "pgcrypto";

-- profiles
create table profiles (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid references auth.users(id) on delete cascade unique,
  age_bracket         text check (age_bracket in ('under_16', '16_17', '18_plus')),
  sex                 text check (sex in ('male', 'female', 'other')),
  height_cm           integer check (height_cm between 100 and 250),
  weight_kg           numeric(5,1) check (weight_kg between 30 and 300),
  training_age        text check (training_age in ('none', 'under_6mo', '6mo_2yr', 'over_2yr')),
  goal                text check (goal in ('muscle_gain', 'fat_loss', 'recomposition', 'general_fitness')),
  equipment           text check (equipment in ('full_gym', 'dumbbells', 'home', 'bodyweight')),
  days_per_week       integer check (days_per_week between 1 and 7),
  limitations         text,
  onboarding_state    text check (onboarding_state in (
                        'WELCOME', 'AGE_BRACKET', 'GOAL', 'SEX', 'HEIGHT_WEIGHT',
                        'TRAINING_AGE', 'EQUIPMENT', 'SCHEDULE', 'LIMITATIONS',
                        'PHOTO_OFFER', 'SUMMARY', 'PLAN_GENERATION', 'COMPLETE'
                      )) default 'WELCOME',
  onboarding_complete boolean default false,
  created_at          timestamptz default now(),
  updated_at          timestamptz default now()
);

-- conversations
create table conversations (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid references auth.users(id) on delete cascade,
  context_type  text check (context_type in ('onboarding', 'coaching')),
  created_at    timestamptz default now()
);

-- messages
create table messages (
  id               uuid primary key default gen_random_uuid(),
  conversation_id  uuid references conversations(id) on delete cascade,
  role             text check (role in ('user', 'assistant', 'agent')),
  content          text not null,
  agent_name       text,
  agent_input      jsonb,
  agent_output     jsonb,
  created_at       timestamptz default now()
);

-- workouts
create table workouts (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid references auth.users(id) on delete cascade,
  plan_data     jsonb not null,
  generated_at  timestamptz default now(),
  status        text check (status in ('active', 'archived')) default 'active'
);

-- workout_logs
create table workout_logs (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid references auth.users(id) on delete cascade,
  workout_id  uuid references workouts(id),
  date        date not null,
  exercises   jsonb not null,
  notes       text,
  bodyweight  numeric(5,1),
  created_at  timestamptz default now()
);

-- progress_photos
create table progress_photos (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid references auth.users(id) on delete cascade,
  storage_url  text not null,
  taken_at     date not null,
  created_at   timestamptz default now()
);

-- exercises (curated library)
create table exercises (
  id           uuid primary key default gen_random_uuid(),
  name         text not null unique,
  muscle_group text not null,
  equipment    text not null,
  youtube_url  text not null,
  difficulty   text check (difficulty in ('beginner', 'intermediate', 'advanced')),
  notes        text
);

-- Row Level Security
alter table profiles enable row level security;
alter table conversations enable row level security;
alter table messages enable row level security;
alter table workouts enable row level security;
alter table workout_logs enable row level security;
alter table progress_photos enable row level security;
alter table exercises enable row level security;

-- RLS policies: users access only their own rows
create policy "Users own their profile"
  on profiles for all using (auth.uid() = user_id);

create policy "Users own their conversations"
  on conversations for all using (auth.uid() = user_id);

create policy "Users own their messages"
  on messages for all
  using (conversation_id in (
    select id from conversations where user_id = auth.uid()
  ));

create policy "Users own their workouts"
  on workouts for all using (auth.uid() = user_id);

create policy "Users own their workout logs"
  on workout_logs for all using (auth.uid() = user_id);

create policy "Users own their progress photos"
  on progress_photos for all using (auth.uid() = user_id);

create policy "Exercises are readable by authenticated users"
  on exercises for select using (auth.role() = 'authenticated');
