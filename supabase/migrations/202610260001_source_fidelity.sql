-- Explicit provenance; old questions are not silently certified as exact copies.
begin;
alter table public.questions add column source_fidelity text not null default 'unverified'
  check (source_fidelity in ('exact','adapted','unverified'));
alter table public.questions add constraint exact_question_source check (
  source_fidelity <> 'exact' or (kind = 'review' and length(btrim(source_id)) > 0
    and length(btrim(source_page)) > 0 and length(btrim(source_question)) > 0));
create or replace function public.import_questions(p_questions jsonb) returns integer
language plpgsql security invoker set search_path = '' as $$
declare item jsonb; existing jsonb; wanted jsonb; row_value public.questions; n integer := 0;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if jsonb_typeof(p_questions) <> 'array' or jsonb_array_length(p_questions) > 2000 then raise exception 'Invalid input'; end if;
  for item in select value from jsonb_array_elements(p_questions) loop
    wanted := jsonb_build_object('choices','[]'::jsonb,'blanks','[]'::jsonb,'source_question','','original_result','unknown','source_fidelity','unverified') || (item - 'user_id' - 'created_at');
    row_value := jsonb_populate_record(null::public.questions, wanted || jsonb_build_object('user_id', auth.uid(), 'created_at', now()));
    insert into public.questions select (row_value).* on conflict do nothing;
    select to_jsonb(q) - 'user_id' - 'created_at' into existing from public.questions q
      where q.user_id = auth.uid() and q.id = row_value.id and q.version = row_value.version;
    if existing is distinct from wanted then raise exception 'Version already exists with different content or invalid fields'; end if;
    n := n + 1;
  end loop;
  return n;
end $$;

commit;
