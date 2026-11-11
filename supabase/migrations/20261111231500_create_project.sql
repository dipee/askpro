-- create_project: create a project and its default widget config under the owner's
-- plan limit (project.md §5, §6.3, §7).
--
-- The limit is passed in by the route from PLAN_LIMITS (packages/shared); it is never
-- hardcoded here. The owner's accounts row is locked FOR UPDATE before counting, so two
-- concurrent calls for the same owner run one after the other and can't both pass.
--
-- Errors (raised to the caller; the route maps them):
--   P0001 'plan_limit'          the owner already has p_max_projects projects
--   P0002 'account_not_found'   no accounts row for p_owner_id
--   22023 'invalid_max_projects' p_max_projects is null or negative
--
-- Only service_role may execute it: the route has already checked the session and
-- read the plan on the server.

create function public.create_project(p_owner_id text, p_name text, p_max_projects int)
returns public.projects
language plpgsql
volatile
security invoker
set search_path = ''
as $$
declare
  v_count int;
  v_project public.projects;
begin
  -- A null limit would make the comparison below null and skip the check.
  if p_max_projects is null or p_max_projects < 0 then
    raise exception 'invalid_max_projects' using errcode = '22023';
  end if;

  -- Serialize creates per owner. In READ COMMITTED, the count below runs after the
  -- lock is granted and takes a fresh snapshot, so it sees a concurrent create that
  -- committed while we waited.
  perform 1 from public.accounts a where a.clerk_user_id = p_owner_id for update;
  if not found then
    raise exception 'account_not_found' using errcode = 'P0002';
  end if;

  select count(*) into v_count from public.projects p where p.owner_id = p_owner_id;
  if v_count >= p_max_projects then
    raise exception 'plan_limit' using errcode = 'P0001';
  end if;

  insert into public.projects (owner_id, name)
  values (p_owner_id, p_name)
  returning * into v_project;

  insert into public.widget_configs (project_id) values (v_project.id);

  return v_project;
end;
$$;

revoke execute on function public.create_project(text, text, int) from public, anon, authenticated;
grant execute on function public.create_project(text, text, int) to service_role;
