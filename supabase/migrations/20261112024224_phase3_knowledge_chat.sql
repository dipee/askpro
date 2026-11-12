-- Phase 3: the knowledge bucket and the four functions the knowledge and chat routes
-- call (project.md §6.4, §6.6, §7, §9).
--
-- Every function is SECURITY INVOKER with an empty search_path, and only service_role
-- may execute it: the route has already resolved the project (from the owner's session
-- or the widget's public key) and read the plan on the server. Limits are passed in from
-- PLAN_LIMITS (packages/shared); none is hardcoded here.
--
-- Errors raised (the routes map them):
--   P0001 'plan_limit'              reserve_knowledge_source: the project is at p_limit sources
--   P0002 'project_not_found'       no project with p_project_id
--   P0002 'conversation_not_found'  save_chat_turn: p_conversation_id isn't in this project
--   22023 'invalid_limit'           p_limit is null or negative
--   22023 'invalid_source'          reserve_knowledge_source: type/status/storage_key don't fit
--   22023 'invalid_count'           match_chunks: p_count is null or outside 1..50

-- ---------------------------------------------------------------------------
-- Storage: a private bucket with the same size and type limits as the routes
-- (MAX_KNOWLEDGE_FILE_BYTES, UPLOAD_CONTENT_TYPES). No storage.objects policies:
-- anon and authenticated get nothing; only service_role (which bypasses RLS) reads,
-- writes and signs upload URLs.
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'knowledge',
  'knowledge',
  false,
  10485760,
  array['application/pdf', 'text/markdown', 'text/plain']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- ---------------------------------------------------------------------------
-- reserve_knowledge_source: add a source under the project's source limit.
--
-- Locks the project row FOR UPDATE, so concurrent reservations for one project run one
-- after the other. Then, in order:
--   1. deletes this project's sources still 'uploading' after 2 hours (lazy reclaim),
--   2. counts the remaining sources; at p_limit or more it raises plan_limit,
--   3. inserts the new source.
-- Pasted text: type 'text', status 'processing', no storage_key.
-- Files: type 'pdf' | 'md' | 'txt', status 'uploading', a storage_key.
--
-- Returns one row: the new knowledge_sources row plus reclaimed_keys, the storage keys
-- of the reclaimed sources (empty array if none), so the route can remove those files.
-- A plan_limit error rolls the reclaim back too; it runs again on the next call.
-- ---------------------------------------------------------------------------

create function public.reserve_knowledge_source(
  p_project_id uuid,
  p_title text,
  p_type text,
  p_status text,
  p_limit int,
  p_storage_key text default null
)
returns table (
  id uuid,
  project_id uuid,
  title text,
  type text,
  storage_key text,
  status text,
  created_at timestamptz,
  reclaimed_keys text[]
)
language plpgsql
volatile
security invoker
set search_path = ''
as $$
declare
  v_reclaimed text[];
  v_count int;
  v_source public.knowledge_sources;
begin
  -- A null limit would make the comparison below null and skip the check.
  if p_limit is null or p_limit < 0 then
    raise exception 'invalid_limit' using errcode = '22023';
  end if;

  if not (
    (p_type = 'text' and p_status = 'processing' and p_storage_key is null)
    or (p_type in ('pdf', 'md', 'txt') and p_status = 'uploading' and p_storage_key is not null)
  ) then
    raise exception 'invalid_source' using errcode = '22023';
  end if;

  -- Serialize reservations per project. In READ COMMITTED, the statements below run
  -- after the lock is granted and take a fresh snapshot, so they see a concurrent
  -- reservation that committed while we waited.
  perform 1 from public.projects p where p.id = p_project_id for update;
  if not found then
    raise exception 'project_not_found' using errcode = 'P0002';
  end if;

  with reclaimed as (
    delete from public.knowledge_sources s
    where s.project_id = p_project_id
      and s.status = 'uploading'
      and s.created_at < now() - interval '2 hours'
    returning s.storage_key
  )
  select coalesce(array_agg(r.storage_key), '{}') into v_reclaimed from reclaimed r;

  select count(*) into v_count from public.knowledge_sources s where s.project_id = p_project_id;
  if v_count >= p_limit then
    raise exception 'plan_limit' using errcode = 'P0001';
  end if;

  insert into public.knowledge_sources (project_id, title, type, storage_key, status)
  values (p_project_id, p_title, p_type, p_storage_key, p_status)
  returning * into v_source;

  return query select
    v_source.id, v_source.project_id, v_source.title, v_source.type,
    v_source.storage_key, v_source.status, v_source.created_at, v_reclaimed;
end;
$$;

revoke execute on function public.reserve_knowledge_source(uuid, text, text, text, int, text)
  from public, anon, authenticated;
grant execute on function public.reserve_knowledge_source(uuid, text, text, text, int, text)
  to service_role;

-- ---------------------------------------------------------------------------
-- match_chunks: the p_count chunks nearest to p_embedding (cosine distance), from
-- 'ready' sources in this project only. similarity = 1 - cosine distance.
--
-- hnsw.iterative_scan: without it the HNSW index yields its ef_search (40) nearest
-- chunks across all projects before the project filter runs, so a small project could
-- get fewer than p_count rows, or none. relaxed_order keeps scanning until enough rows
-- pass the filter or hnsw.max_scan_tuples (default 20,000) is reached, so results can
-- still be short when other projects' chunks fill that budget. A short result is fine
-- here: the chat just gets less context. The outer ORDER BY restores strict order
-- (`distance + 0`, as pgvector requires on Postgres 17+ for a materialized CTE).
-- ---------------------------------------------------------------------------

create function public.match_chunks(
  p_project_id uuid,
  p_embedding extensions.vector(1536),
  p_count int default 5
)
returns table (
  id uuid,
  source_id uuid,
  content text,
  similarity double precision
)
language plpgsql
stable
security invoker
set search_path = ''
set hnsw.iterative_scan = 'relaxed_order'
as $$
begin
  if p_count is null or p_count < 1 or p_count > 50 then
    raise exception 'invalid_count' using errcode = '22023';
  end if;

  return query
  with nearest as materialized (
    select
      c.id,
      c.source_id,
      c.content,
      c.embedding operator(extensions.<=>) p_embedding as distance
    from public.knowledge_chunks c
    join public.knowledge_sources s
      on s.id = c.source_id and s.project_id = c.project_id
    where c.project_id = p_project_id
      and s.status = 'ready'
    order by c.embedding operator(extensions.<=>) p_embedding
    limit p_count
  )
  select n.id, n.source_id, n.content, 1 - n.distance
  from nearest n
  order by n.distance + 0;
end;
$$;

revoke execute on function public.match_chunks(uuid, extensions.vector, int)
  from public, anon, authenticated;
grant execute on function public.match_chunks(uuid, extensions.vector, int) to service_role;

-- ---------------------------------------------------------------------------
-- consume_message: count one message against the project's monthly quota.
--
-- One UPDATE does the check and the write, so concurrent calls can't both pass: in READ
-- COMMITTED a second UPDATE on the same row waits for the first to commit, then
-- re-checks its WHERE on the new row version. When period_start is before the current
-- UTC month, the count starts again from 0 and period_start moves to this month.
--
-- Returns one row: accepted, messages_used (after this call; this month's count when
-- refused) and message_limit (p_limit, echoed).
-- ---------------------------------------------------------------------------

create function public.consume_message(p_project_id uuid, p_limit int)
returns table (
  accepted boolean,
  messages_used int,
  message_limit int
)
language plpgsql
volatile
security invoker
set search_path = ''
as $$
declare
  -- Start of the current month in UTC, same as projects.period_start's default.
  v_month timestamptz := date_trunc('month', now() at time zone 'utc') at time zone 'utc';
  v_used int;
begin
  if p_limit is null or p_limit < 0 then
    raise exception 'invalid_limit' using errcode = '22023';
  end if;

  update public.projects p
  set
    messages_used = (case when p.period_start < v_month then 0 else p.messages_used end) + 1,
    period_start = case when p.period_start < v_month then v_month else p.period_start end
  where p.id = p_project_id
    and (case when p.period_start < v_month then 0 else p.messages_used end) < p_limit
  returning p.messages_used into v_used;

  if found then
    return query select true, v_used, p_limit;
    return;
  end if;

  select case when p.period_start < v_month then 0 else p.messages_used end
  into v_used
  from public.projects p
  where p.id = p_project_id;
  if not found then
    raise exception 'project_not_found' using errcode = 'P0002';
  end if;

  return query select false, v_used, p_limit;
end;
$$;

revoke execute on function public.consume_message(uuid, int) from public, anon, authenticated;
grant execute on function public.consume_message(uuid, int) to service_role;

-- ---------------------------------------------------------------------------
-- save_chat_turn: save a visitor message and the bot's reply.
--
-- p_conversation_id null (the default): creates the conversation for p_visitor_id. Otherwise the
-- conversation must belong to p_project_id, else conversation_not_found. The visitor
-- message is inserted before the bot message (messages.created_at uses
-- clock_timestamp(), so they sort in that order). Returns the conversation id.
-- ---------------------------------------------------------------------------

create function public.save_chat_turn(
  p_project_id uuid,
  p_visitor_id text,
  p_visitor_body text,
  p_bot_body text,
  p_conversation_id uuid default null
)
returns uuid
language plpgsql
volatile
security invoker
set search_path = ''
as $$
declare
  v_conversation_id uuid;
begin
  if p_conversation_id is null then
    perform 1 from public.projects p where p.id = p_project_id;
    if not found then
      raise exception 'project_not_found' using errcode = 'P0002';
    end if;

    insert into public.conversations (project_id, visitor_id)
    values (p_project_id, p_visitor_id)
    returning id into v_conversation_id;
  else
    select c.id into v_conversation_id
    from public.conversations c
    where c.id = p_conversation_id and c.project_id = p_project_id;
    if not found then
      raise exception 'conversation_not_found' using errcode = 'P0002';
    end if;
  end if;

  insert into public.messages (conversation_id, role, body)
  values (v_conversation_id, 'visitor', p_visitor_body);
  insert into public.messages (conversation_id, role, body)
  values (v_conversation_id, 'bot', p_bot_body);

  return v_conversation_id;
end;
$$;

revoke execute on function public.save_chat_turn(uuid, text, text, text, uuid)
  from public, anon, authenticated;
grant execute on function public.save_chat_turn(uuid, text, text, text, uuid) to service_role;
