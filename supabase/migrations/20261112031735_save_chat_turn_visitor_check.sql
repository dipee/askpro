-- save_chat_turn: a given conversation must belong to the visitor as well as the project
-- (defense in depth, project.md §9; raised on PR #26). The chat route already checks
-- both before it counts the message. Now the function refuses another visitor's
-- conversation itself, with the same conversation_not_found error as for another
-- project's, so the two cases look the same to a caller.
--
-- Same signature, argument names, defaults and return type as 20261112024224, so
-- `create or replace` keeps the function's OID and grants. The revoke/grant is
-- re-stated anyway so this file shows the full permission state.
--
-- Errors raised (unchanged):
--   P0002 'project_not_found'       no project with p_project_id (new conversation)
--   P0002 'conversation_not_found'  p_conversation_id isn't this project's and this visitor's

create or replace function public.save_chat_turn(
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
    where c.id = p_conversation_id
      and c.project_id = p_project_id
      and c.visitor_id = p_visitor_id;
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
