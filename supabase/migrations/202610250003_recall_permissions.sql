-- Supabase may grant extra table privileges through project-wide defaults.
-- Make the append-only contract explicit regardless of those defaults.
begin;
revoke all on public.recall_events from public, anon, authenticated;
grant select, insert on public.recall_events to authenticated;
commit;
