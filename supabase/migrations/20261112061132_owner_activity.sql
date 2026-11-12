-- owner_activity: one page of a project's conversations, newest first, each with its
-- first visitor message (cut to 140 characters, null if none) and its message count.
-- The Conversations list (project.md §6.7) reads it with the owner's client, so
-- PostgREST aggregates can stay off (§9).
--
-- SECURITY INVOKER: RLS on conversations and messages scopes every row to the caller's
-- own projects. Another owner's project, an unknown project, or a token without a sub
-- all return no rows rather than an error, the same as a plain SELECT would.
--
-- Paging: p_limit rows (1..100, default 50) after skipping p_offset (>= 0, default 0).
-- Ties on created_at break on id, so pages don't overlap or skip rows.
--
-- Index use: conversations_project_id_created_at_idx (project_id, created_at desc) for
-- the page; messages_conversation_id_created_at_idx (conversation_id, created_at) for
-- each row's preview and count.
--
-- Errors raised:
--   22023 'invalid_page'  p_limit is null or outside 1..100, or p_offset is null or negative

create function public.owner_activity(
  p_project_id uuid,
  p_limit int default 50,
  p_offset int default 0
)
returns table (
  id uuid,
  visitor_id text,
  created_at timestamptz,
  preview text,
  message_count int
)
language plpgsql
stable
security invoker
set search_path = ''
as $$
begin
  if p_limit is null or p_limit < 1 or p_limit > 100
     or p_offset is null or p_offset < 0 then
    raise exception 'invalid_page' using errcode = '22023';
  end if;

  return query
  select
    c.id,
    c.visitor_id,
    c.created_at,
    first_message.preview,
    coalesce(counted.n, 0)
  from public.conversations c
  left join lateral (
    select left(m.body, 140) as preview
    from public.messages m
    where m.conversation_id = c.id
      and m.role = 'visitor'
    order by m.created_at, m.id
    limit 1
  ) first_message on true
  left join lateral (
    select count(*)::int as n
    from public.messages m
    where m.conversation_id = c.id
  ) counted on true
  where c.project_id = p_project_id
  order by c.created_at desc, c.id desc
  limit p_limit
  offset p_offset;
end;
$$;

revoke execute on function public.owner_activity(uuid, int, int)
  from public, anon, authenticated;
grant execute on function public.owner_activity(uuid, int, int) to authenticated, service_role;
