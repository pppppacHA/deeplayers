-- 친구 찾기: 다른 대원의 캐릭터 이름을 검색한다 (Supabase → SQL Editor 에서 한 번 실행)
-- 이름·등급·레벨·최근 접속 여부만 돌려주고, '친구 추가 허용'을 끈 대원과 나 자신은 나오지 않는다.
create or replace function public.search_players(p_q text) returns jsonb
language sql security definer set search_path = public as $$
  select coalesce(jsonb_agg(x), '[]'::jsonb) from (
    select data->'character'->>'name' as name,
           data->'character'->>'rank' as rank,
           data->'character'->>'level' as level,
           (updated_at > now() - interval '30 minutes') as online
    from public.saves
    where user_id <> auth.uid()
      and char_length(trim(coalesce(p_q, ''))) >= 1
      and coalesce(data->'character'->>'allowFriend', 'true') <> 'false'
      and coalesce(data->'character'->>'name', '') <> ''
      and data->'character'->>'name' ilike '%' || replace(replace(replace(trim(p_q), '\', '\\'), '%', '\%'), '_', '\_') || '%'
    order by updated_at desc limit 8
  ) x;
$$;
revoke all on function public.search_players(text) from public, anon;
