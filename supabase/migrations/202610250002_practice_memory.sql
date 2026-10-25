-- Additive upgrade: preserve existing question versions and every attempt.
begin;
alter table public.questions
  add column choices jsonb not null default '[]',
  add column blanks jsonb not null default '[]',
  add column source_question text not null default '' check (length(source_question) <= 100),
  add column original_result text not null default 'unknown'
    check (original_result in ('correct','incorrect','partial','ungraded','unknown'));

create function public.validate_question_practice() returns trigger
language plpgsql security invoker set search_path = '' as $$
declare b jsonb; c jsonb;
begin
  if jsonb_typeof(new.choices) <> 'array' or jsonb_array_length(new.choices) not in (0,4)
     or jsonb_typeof(new.blanks) <> 'array' or jsonb_array_length(new.blanks) > 100 then
    raise exception 'Invalid choices or blanks';
  end if;
  for c in select value from jsonb_array_elements(new.choices) loop
    if jsonb_typeof(c) <> 'string' or length(btrim(c #>> '{}')) = 0 or length(c #>> '{}') > 20000 then
      raise exception 'Invalid choice';
    end if;
  end loop;
  if jsonb_array_length(new.choices) = 4 and
    ((select count(distinct value) from jsonb_array_elements(new.choices)) <> 4
      or not new.choices @> jsonb_build_array(new.answer)) then
    raise exception 'Choices must be unique and contain the answer';
  end if;
  for b in select value from jsonb_array_elements(new.blanks) loop
    if jsonb_typeof(b) <> 'object' or not (b ?& array['id','before','answer','after'])
      or jsonb_typeof(b->'id') <> 'string' or (b->>'id') !~ '^[A-Za-z0-9_-]{1,100}$'
      or jsonb_typeof(b->'before') <> 'string' or length(b->>'before') > 20000
      or jsonb_typeof(b->'after') <> 'string' or length(b->>'after') > 20000
      or jsonb_typeof(b->'answer') <> 'string' or length(btrim(b->>'answer')) = 0 or length(b->>'answer') > 20000 then
      raise exception 'Invalid blank';
    end if;
  end loop;
  if (select count(distinct value->>'id') from jsonb_array_elements(new.blanks)) <> jsonb_array_length(new.blanks) then
    raise exception 'Duplicate blank id';
  end if;
  return new;
end $$;
create trigger validate_question_practice before insert on public.questions
for each row execute function public.validate_question_practice();
revoke all on function public.validate_question_practice() from public;

-- Defaults must also apply to old JSON imports; populate_record otherwise inserts null.
create or replace function public.import_questions(p_questions jsonb) returns integer
language plpgsql security invoker set search_path = '' as $$
declare item jsonb; existing jsonb; wanted jsonb; row_value public.questions; n integer := 0;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if jsonb_typeof(p_questions) <> 'array' or jsonb_array_length(p_questions) > 2000 then raise exception 'Invalid input'; end if;
  for item in select value from jsonb_array_elements(p_questions) loop
    wanted := jsonb_build_object('choices','[]'::jsonb,'blanks','[]'::jsonb,'source_question','','original_result','unknown') || (item - 'user_id' - 'created_at');
    row_value := jsonb_populate_record(null::public.questions, wanted || jsonb_build_object('user_id', auth.uid(), 'created_at', now()));
    insert into public.questions select (row_value).* on conflict do nothing;
    select to_jsonb(q) - 'user_id' - 'created_at' into existing from public.questions q
      where q.user_id = auth.uid() and q.id = row_value.id and q.version = row_value.version;
    if existing is distinct from wanted then raise exception 'Version already exists with different content or invalid fields'; end if;
    n := n + 1;
  end loop;
  return n;
end $$;

create table public.recall_events (
  user_id uuid not null default auth.uid() references auth.users(id),
  id uuid not null,
  question_id text not null,
  question_version integer not null,
  blank_id text not null check (blank_id ~ '^[A-Za-z0-9_-]{1,100}$'),
  occurred_at timestamptz not null,
  result text not null check (result in ('wrong','known')),
  primary key (user_id,id),
  foreign key (user_id,question_id,question_version) references public.questions(user_id,id,version)
);
create index recall_events_question on public.recall_events(user_id,question_id,question_version,blank_id);
alter table public.recall_events enable row level security;
grant select, insert on public.recall_events to authenticated;
revoke all on public.recall_events from anon;
create policy recall_read on public.recall_events for select to authenticated using ((select auth.uid()) = user_id);
create policy recall_insert on public.recall_events for insert to authenticated with check ((select auth.uid()) = user_id);
create function public.validate_recall_event() returns trigger
language plpgsql security invoker set search_path = '' as $$
declare q public.questions;
begin
  select * into strict q from public.questions where user_id = new.user_id and id = new.question_id and version = new.question_version;
  if q.status <> 'verified' or new.occurred_at > now() + interval '5 minutes' then
    raise exception 'Unverified question or future recall';
  end if;
  if (jsonb_array_length(q.blanks) = 0 and new.blank_id <> 'answer') or
     (jsonb_array_length(q.blanks) > 0 and not exists
       (select 1 from jsonb_array_elements(q.blanks) b where b->>'id' = new.blank_id)) then
    raise exception 'Unknown blank';
  end if;
  return new;
end $$;
create trigger validate_recall_event before insert on public.recall_events for each row execute function public.validate_recall_event();
revoke all on function public.validate_recall_event() from public;
commit;
