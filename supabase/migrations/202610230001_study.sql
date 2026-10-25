-- Run once in a Supabase project. No school material or user data is included.
begin;

create table public.questions (
  user_id uuid not null default auth.uid() references auth.users(id),
  id text not null check (id ~ '^[A-Za-z0-9_-]{1,100}$'),
  version integer not null check (version > 0),
  subject text not null check (length(subject) between 1 and 100),
  course text not null default '' check (length(course) <= 100),
  unit text not null check (length(unit) between 1 and 100),
  batch text not null default '' check (length(batch) <= 200),
  prompt text not null check (length(prompt) between 1 and 20000),
  answer text not null check (length(answer) between 1 and 20000),
  explanation text not null check (length(explanation) <= 20000),
  max_points numeric not null check (max_points > 0 and max_points <= 1000),
  minutes integer not null check (minutes between 1 and 120),
  kind text not null check (kind in ('review', 'variant')),
  status text not null check (status in ('verified', 'needs_review')),
  parent_id text check (parent_id ~ '^[A-Za-z0-9_-]{1,100}$'),
  source_id text not null check (length(source_id) <= 200),
  source_label text not null check (length(source_label) <= 500),
  source_page text not null check (length(source_page) <= 100),
  analysis_id text not null check (length(analysis_id) <= 200),
  weakness_id text not null check (length(weakness_id) <= 200),
  created_at timestamptz not null default now(),
  primary key (user_id, id, version),
  check (kind <> 'variant' or (parent_id is not null and length(weakness_id) > 0))
);

create table public.attempts (
  user_id uuid not null default auth.uid() references auth.users(id),
  id uuid not null,
  question_id text not null,
  question_version integer not null,
  attempted_at timestamptz not null,
  recorded_at timestamptz not null default now(),
  response text not null default '' check (length(response) <= 20000),
  score numeric,
  max_points numeric not null check (max_points > 0 and max_points <= 1000),
  grading text not null check (grading in ('self', 'school', 'ungraded')),
  confidence text not null check (confidence in ('sure', 'unsure', 'unknown')),
  hint boolean not null default false,
  seconds integer not null default 0 check (seconds between 0 and 86400),
  supersedes uuid,
  primary key (user_id, id),
  foreign key (user_id, question_id, question_version) references public.questions(user_id, id, version),
  foreign key (user_id, supersedes) references public.attempts(user_id, id),
  unique (user_id, supersedes),
  check (score is null or (score >= 0 and score <= max_points)),
  check ((grading = 'ungraded') = (score is null)),
  check (supersedes is null or supersedes <> id)
);

create table public.activities (
  user_id uuid not null default auth.uid() references auth.users(id),
  id uuid not null,
  occurred_at timestamptz not null,
  subject text not null check (length(subject) between 1 and 100),
  unit text not null default '' check (length(unit) <= 100),
  kind text not null check (kind in ('reading', 'memorization', 'paper', 'other')),
  minutes integer not null check (minutes between 1 and 1440),
  source_id text not null default '' check (length(source_id) <= 200),
  primary key (user_id, id)
);

create table public.daily_sets (
  user_id uuid not null references auth.users(id),
  day date not null,
  budget integer not null check (budget between 1 and 120),
  algorithm integer not null default 1,
  items jsonb not null check (jsonb_typeof(items) = 'array'),
  created_at timestamptz not null default now(),
  primary key (user_id, day)
);

create index attempts_question_time on public.attempts(user_id, question_id, attempted_at);
create index activities_time on public.activities(user_id, occurred_at);

alter table public.questions enable row level security;
alter table public.attempts enable row level security;
alter table public.activities enable row level security;
alter table public.daily_sets enable row level security;
revoke all on public.questions, public.attempts, public.activities, public.daily_sets from public, anon, authenticated;
grant select, insert on public.questions, public.attempts, public.activities to authenticated;
grant select on public.daily_sets to authenticated;
create policy questions_read on public.questions for select to authenticated using ((select auth.uid()) = user_id);
create policy questions_insert on public.questions for insert to authenticated with check ((select auth.uid()) = user_id);
create policy attempts_read on public.attempts for select to authenticated using ((select auth.uid()) = user_id);
create policy attempts_insert on public.attempts for insert to authenticated with check ((select auth.uid()) = user_id);
create policy activities_read on public.activities for select to authenticated using ((select auth.uid()) = user_id);
create policy activities_insert on public.activities for insert to authenticated with check ((select auth.uid()) = user_id);
create policy sets_read on public.daily_sets for select to authenticated using ((select auth.uid()) = user_id);

-- Immutable question versions / append-only attempts. RLS has no update/delete policy.
create function public.validate_attempt() returns trigger
language plpgsql security invoker set search_path = '' as $$
declare q public.questions; old_attempt public.attempts;
begin
  select * into strict q from public.questions where user_id = new.user_id and id = new.question_id and version = new.question_version;
  if q.status <> 'verified' or new.max_points <> q.max_points then
    raise exception 'Question is unverified or point scale differs';
  end if;
  if new.attempted_at > now() + interval '5 minutes' then raise exception 'Future attempt'; end if;
  if new.supersedes is not null then
    select * into strict old_attempt from public.attempts where user_id = new.user_id and id = new.supersedes;
    if old_attempt.question_id <> new.question_id or old_attempt.question_version <> new.question_version
       or old_attempt.attempted_at <> new.attempted_at then
      raise exception 'Correction must refer to the same question and attempt time';
    end if;
  end if;
  return new;
end $$;
create trigger validate_attempt before insert on public.attempts for each row execute function public.validate_attempt();
revoke all on function public.validate_attempt() from public;

create function public.import_questions(p_questions jsonb) returns integer
language plpgsql security invoker set search_path = '' as $$
declare item jsonb; existing jsonb; wanted jsonb; row_value public.questions; n integer := 0;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if jsonb_typeof(p_questions) <> 'array' or jsonb_array_length(p_questions) > 2000 then raise exception 'Invalid input'; end if;
  for item in select value from jsonb_array_elements(p_questions) loop
    wanted := item - 'user_id' - 'created_at';
    row_value := jsonb_populate_record(null::public.questions, wanted || jsonb_build_object('user_id', auth.uid(), 'created_at', now()));
    insert into public.questions select (row_value).* on conflict do nothing;
    select to_jsonb(q) - 'user_id' - 'created_at' into existing from public.questions q
      where q.user_id = auth.uid() and q.id = row_value.id and q.version = row_value.version;
    if existing is distinct from wanted then raise exception 'Version already exists with different content or invalid fields'; end if;
    n := n + 1;
  end loop;
  return n;
end $$;
revoke all on function public.import_questions(jsonb) from public, anon;
grant execute on function public.import_questions(jsonb) to authenticated;

-- Definer needed only to insert immutable daily_sets, which clients cannot insert directly.
-- User ID is always taken from auth.uid(), never a caller argument.
create function public.get_daily_set(p_budget integer default 20) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  owner_id uuid := auth.uid();
  today date := (now() at time zone 'Asia/Tokyo')::date;
  plan public.daily_sets; candidate record; used integer := 0;
  family text; families text[] := '{}'; selected jsonb := '[]'::jsonb;
begin
  if owner_id is null then raise exception 'Authentication required'; end if;
  if p_budget is null or p_budget < 1 or p_budget > 120 then raise exception 'Invalid budget'; end if;
  -- Serialize competing devices for this user's day. No empty plan is silently replaced.
  perform pg_advisory_xact_lock(hashtextextended(owner_id::text || today::text, 0));
  select * into plan from public.daily_sets where user_id = owner_id and day = today;
  if found then return to_jsonb(plan); end if;
  for candidate in
    with current_questions as (
      select distinct on (id) * from public.questions where user_id = owner_id and status = 'verified' order by id, version desc
    ), effective as (
      select a.* from public.attempts a where a.user_id = owner_id
      and not exists (select 1 from public.attempts b where b.user_id = owner_id and b.supersedes = a.id)
    ), history as (
      select q.*, a.score, a.attempted_at, a.hint,
        (select count(*) from effective e where e.question_id = q.id and e.score = e.max_points and not e.hint
         and e.attempted_at > coalesce((select max(f.attempted_at) from effective f where f.question_id = q.id
           and (f.score is null or f.score < f.max_points or f.hint)), '-infinity'::timestamptz)) as streak
      from current_questions q left join lateral (
        select * from effective e where e.question_id = q.id order by attempted_at desc, id desc limit 1
      ) a on true
    ), due as (
      select h.*, case when attempted_at is null then '1970-01-01'::date
        else (attempted_at at time zone 'Asia/Tokyo')::date + case when streak >= 3 then 14 when streak = 2 then 7 when streak = 1 then 3 else 1 end end as due_date
      from history h
    ), ranked as (
      select d.*, row_number() over (partition by subject order by due_date, id) as subject_rank from due d where due_date <= today
    ) select * from ranked order by subject_rank, due_date, id
  loop
    family := coalesce(candidate.parent_id, candidate.id);
    if used + candidate.minutes > p_budget or family = any(families) then continue; end if;
    selected := selected || jsonb_build_array(jsonb_build_object('question_id', candidate.id, 'question_version', candidate.version,
      'reason', case when candidate.attempted_at is null then 'はじめての確認' when candidate.score is null then '採点の確認'
        when candidate.score < candidate.max_points then '前回のつまずきを復習' else '定着を確認' end));
    families := array_append(families, family); used := used + candidate.minutes;
  end loop;
  insert into public.daily_sets(user_id, day, budget, algorithm, items) values (owner_id, today, p_budget, 1, selected) returning * into plan;
  return to_jsonb(plan);
end $$;
revoke all on function public.get_daily_set(integer) from public, anon;
grant execute on function public.get_daily_set(integer) to authenticated;
commit;
