begin;
create table public.test_results (
  user_id uuid not null default auth.uid() references auth.users(id),
  id uuid not null,
  exam_title text not null check(length(exam_title) between 1 and 200),
  exam_kind text not null check(exam_kind in ('midterm','final','quiz','mock','other')),
  taken_on date not null,
  subject text not null check(length(subject) between 1 and 100),
  course text not null check(length(course) between 1 and 100),
  score numeric,
  max_points numeric not null check(max_points > 0 and max_points <= 10000),
  average numeric,
  rank integer check(rank > 0),
  participants integer check(participants > 0),
  source_id text not null default '' check(length(source_id) <= 200),
  analysis_id text not null default '' check(length(analysis_id) <= 200),
  memo text not null default '' check(length(memo) <= 4000),
  supersedes uuid,
  created_at timestamptz not null default now(),
  primary key(user_id,id),
  foreign key(user_id,supersedes) references public.test_results(user_id,id),
  unique(user_id,supersedes),
  check(score is null or (score >= 0 and score <= max_points)),
  check(average is null or (average >= 0 and average <= max_points)),
  check(rank is null or participants is null or rank <= participants),
  check(supersedes is null or supersedes <> id)
);
alter table public.test_results enable row level security;
revoke all on public.test_results from public, anon, authenticated;
grant select,insert on public.test_results to authenticated;
create policy tests_read on public.test_results for select to authenticated using ((select auth.uid()) = user_id);
create policy tests_insert on public.test_results for insert to authenticated with check((select auth.uid()) = user_id);
create function public.validate_test_result() returns trigger
language plpgsql security invoker set search_path = '' as $$
declare previous public.test_results;
begin
  if new.taken_on > (now() at time zone 'Asia/Tokyo')::date then raise exception 'Future test'; end if;
  if new.supersedes is not null then
    select * into strict previous from public.test_results where user_id = new.user_id and id = new.supersedes;
    if (previous.exam_title,previous.taken_on,previous.subject,previous.course) is distinct from
       (new.exam_title,new.taken_on,new.subject,new.course) then raise exception 'Different test identity'; end if;
  end if;
  return new;
end $$;
create trigger validate_test_result before insert on public.test_results for each row execute function public.validate_test_result();
revoke all on function public.validate_test_result() from public;
commit;
