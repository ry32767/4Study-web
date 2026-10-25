begin;
-- Unknown exam dates are preserved, never replaced with scan dates.
alter table public.test_results alter column taken_on drop not null;
commit;
