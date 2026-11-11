-- Askwell Phase 1 schema: the 7 tables of project.md §7, their RLS policies and grants.
--
-- Access model (project.md §7, §9):
--   anon           nothing
--   authenticated  SELECT rows in their own projects (accounts: own row), UPDATE projects.name,
--                  DELETE own projects. Owner = auth.jwt()->>'sub' (Clerk user ID).
--   service_role   everything except TRUNCATE (server only, after the route checks ownership)
--
-- Enum-like CHECKs mirror packages/shared: PLANS, KNOWLEDGE_SOURCE_TYPES,
-- KNOWLEDGE_SOURCE_STATUSES, MESSAGE_ROLES, WIDGET_POSITIONS, WIDGET_ANIMATIONS.
-- widget_configs defaults mirror DEFAULT_WIDGET_CONFIG.

-- ---------------------------------------------------------------------------
-- Extensions and schemas
-- ---------------------------------------------------------------------------

create schema if not exists extensions;
create extension if not exists vector with schema extensions;

-- RLS helpers live here: not exposed by the Data API.
create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated;

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

-- One per Clerk user. `plan` is kept in sync by the Clerk webhook.
create table public.accounts (
  clerk_user_id text primary key,
  plan text not null default 'free' check (plan in ('free', 'pro')),
  created_at timestamptz not null default now()
);

create table public.projects (
  id uuid primary key default gen_random_uuid(),
  owner_id text not null references public.accounts (clerk_user_id),
  name text not null check (char_length(name) between 1 and 60),
  public_key text not null unique
    default ('pk_' || replace(gen_random_uuid()::text, '-', ''))
    check (public_key ~ '^pk_[A-Za-z0-9_-]{1,64}$'),
  messages_used integer not null default 0 check (messages_used >= 0),
  -- Start of the current monthly quota period (UTC).
  period_start timestamptz not null default (date_trunc('month', now() at time zone 'utc') at time zone 'utc'),
  created_at timestamptz not null default now()
);

create index projects_owner_id_idx on public.projects (owner_id);

-- One per project.
create table public.widget_configs (
  project_id uuid primary key references public.projects (id) on delete cascade,
  button_color text not null default '#000000' check (button_color ~ '^#[0-9a-fA-F]{6}$'),
  position text not null default 'bottom-right'
    check (position in ('bottom-right', 'bottom-left', 'top-right', 'top-left')),
  label text not null default 'Chat' check (char_length(label) between 1 and 30),
  animation text not null default 'fade' check (animation in ('fade', 'slide', 'scale')),
  header_text text not null default 'How can we help?'
    check (char_length(header_text) between 1 and 60),
  show_badge boolean not null default true
);

create table public.knowledge_sources (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  title text not null check (char_length(title) between 1 and 200),
  type text not null check (type in ('text', 'pdf', 'md', 'txt')),
  -- Storage object key; null for pasted text.
  storage_key text check (type <> 'text' or storage_key is null),
  status text not null check (status in ('uploading', 'processing', 'ready', 'failed')),
  created_at timestamptz not null default now(),
  -- Lets knowledge_chunks require that a chunk's source is in the chunk's project.
  unique (id, project_id)
);

create index knowledge_sources_project_id_idx on public.knowledge_sources (project_id);

create table public.knowledge_chunks (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  source_id uuid not null,
  content text not null,
  embedding extensions.vector(1536) not null,
  -- Deleted with the source; the source must belong to the same project.
  foreign key (source_id, project_id)
    references public.knowledge_sources (id, project_id) on delete cascade
);

create index knowledge_chunks_project_id_idx on public.knowledge_chunks (project_id);
create index knowledge_chunks_source_id_project_id_idx
  on public.knowledge_chunks (source_id, project_id);
create index knowledge_chunks_embedding_idx
  on public.knowledge_chunks using hnsw (embedding extensions.vector_cosine_ops);

create table public.conversations (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  visitor_id text not null check (visitor_id ~ '^[A-Za-z0-9_-]{8,64}$'),
  created_at timestamptz not null default now()
);

-- FK index that also serves "a project's conversations, newest first".
create index conversations_project_id_created_at_idx
  on public.conversations (project_id, created_at desc);

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  role text not null check (role in ('visitor', 'bot')),
  body text not null check (char_length(body) > 0),
  -- clock_timestamp(), not now(): a visitor message and its reply saved in one
  -- transaction must still sort in order.
  created_at timestamptz not null default clock_timestamp()
);

-- FK index that also serves "a conversation's messages, oldest first".
create index messages_conversation_id_created_at_idx
  on public.messages (conversation_id, created_at);

-- ---------------------------------------------------------------------------
-- RLS helpers. SECURITY DEFINER so policies don't recurse through projects' RLS.
-- They only ever return the caller's own IDs.
-- ---------------------------------------------------------------------------

create function private.owned_project_ids()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select p.id
  from public.projects p
  where p.owner_id = (select auth.jwt() ->> 'sub')
$$;

create function private.owned_conversation_ids()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select c.id
  from public.conversations c
  join public.projects p on p.id = c.project_id
  where p.owner_id = (select auth.jwt() ->> 'sub')
$$;

revoke execute on function private.owned_project_ids() from public, anon;
revoke execute on function private.owned_conversation_ids() from public, anon;
grant execute on function private.owned_project_ids() to authenticated;
grant execute on function private.owned_conversation_ids() to authenticated;

-- ---------------------------------------------------------------------------
-- Grants. Supabase's default privileges give anon and authenticated everything
-- on new public tables, so start from nothing and add back what §7 allows.
-- ---------------------------------------------------------------------------

revoke all on
  public.accounts, public.projects, public.widget_configs, public.knowledge_sources,
  public.knowledge_chunks, public.conversations, public.messages
from public, anon, authenticated, service_role;

grant select on
  public.accounts, public.projects, public.widget_configs, public.knowledge_sources,
  public.knowledge_chunks, public.conversations, public.messages
to authenticated;
grant update (name) on public.projects to authenticated;
grant delete on public.projects to authenticated;

grant select, insert, update, delete, references, trigger on
  public.accounts, public.projects, public.widget_configs, public.knowledge_sources,
  public.knowledge_chunks, public.conversations, public.messages
to service_role;

-- ---------------------------------------------------------------------------
-- Row level security. service_role bypasses RLS; these policies are for owners.
-- ---------------------------------------------------------------------------

alter table public.accounts enable row level security;
alter table public.projects enable row level security;
alter table public.widget_configs enable row level security;
alter table public.knowledge_sources enable row level security;
alter table public.knowledge_chunks enable row level security;
alter table public.conversations enable row level security;
alter table public.messages enable row level security;

create policy "Owners read their own account"
  on public.accounts for select to authenticated
  using (clerk_user_id = (select auth.jwt() ->> 'sub'));

create policy "Owners read their own projects"
  on public.projects for select to authenticated
  using (owner_id = (select auth.jwt() ->> 'sub'));

create policy "Owners rename their own projects"
  on public.projects for update to authenticated
  using (owner_id = (select auth.jwt() ->> 'sub'))
  with check (owner_id = (select auth.jwt() ->> 'sub'));

create policy "Owners delete their own projects"
  on public.projects for delete to authenticated
  using (owner_id = (select auth.jwt() ->> 'sub'));

create policy "Owners read their projects' widget config"
  on public.widget_configs for select to authenticated
  using (project_id in (select private.owned_project_ids()));

create policy "Owners read their projects' knowledge sources"
  on public.knowledge_sources for select to authenticated
  using (project_id in (select private.owned_project_ids()));

create policy "Owners read their projects' knowledge chunks"
  on public.knowledge_chunks for select to authenticated
  using (project_id in (select private.owned_project_ids()));

create policy "Owners read their projects' conversations"
  on public.conversations for select to authenticated
  using (project_id in (select private.owned_project_ids()));

create policy "Owners read their conversations' messages"
  on public.messages for select to authenticated
  using (conversation_id in (select private.owned_conversation_ids()));
