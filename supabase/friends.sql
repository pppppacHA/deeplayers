-- 친구 찾기 + 친구 신청(상대가 수락해야 친구가 된다). 이 파일 전체를 SQL Editor 에서 실행한다 (여러 번 실행해도 안전)
-- 친구 찾기: 다른 대원의 캐릭터 이름을 검색한다 (Supabase → SQL Editor 에서 한 번 실행)
-- 이름·등급·레벨·최근 접속 여부만 돌려주고, '친구 추가 허용'을 끈 대원과 나 자신은 나오지 않는다.
create or replace function public.search_players(p_q text) returns jsonb
language sql security definer set search_path = public as $$
  select coalesce(jsonb_agg(x), '[]'::jsonb) from (
    select user_id as uid, data->'character'->>'name' as name,
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

-- ---------- 친구 신청 ----------
create table if not exists public.friend_reqs (
  id         bigint generated always as identity primary key,
  from_uid   uuid not null references auth.users(id) on delete cascade,
  to_uid     uuid not null references auth.users(id) on delete cascade,
  from_name  text not null,
  to_name    text not null,
  status     text not null default 'pending' check (status in ('pending', 'accepted', 'declined')),
  created_at timestamptz not null default now()
);
create unique index if not exists friend_reqs_pair on public.friend_reqs(from_uid, to_uid);
alter table public.friend_reqs enable row level security;   -- 직접 접근 금지, 아래 함수로만

-- 친구 관계(서로 수락한 사이). 메일·교환은 친구끼리만 가능하다
create table if not exists public.friendships (
  user_id     uuid not null references auth.users(id) on delete cascade,
  friend_uid  uuid not null references auth.users(id) on delete cascade,
  friend_name text not null,
  primary key (user_id, friend_uid)
);
alter table public.friendships enable row level security;

create or replace function public.make_friends(a uuid, b uuid) returns void
language plpgsql security definer set search_path = public as $$
declare an text; bn text;
begin
  select data->'character'->>'name' into an from public.saves where user_id = a;
  select data->'character'->>'name' into bn from public.saves where user_id = b;
  insert into public.friendships(user_id, friend_uid, friend_name) values (a, b, coalesce(bn, '?')), (b, a, coalesce(an, '?'))
    on conflict (user_id, friend_uid) do update set friend_name = excluded.friend_name;
end $$;

-- 신청 보내기. 상대가 이미 나에게 신청해 둔 상태면 바로 친구가 된다 ('auto')
create or replace function public.send_friend_req(p_to uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); my_name text; to_name text; allow text; r public.friend_reqs;
begin
  if me is null then raise exception 'no_auth'; end if;
  if p_to is null or p_to = me then return jsonb_build_object('ok', false, 'msg', 'self'); end if;
  select data->'character'->>'name' into my_name from public.saves where user_id = me;
  select data->'character'->>'name', coalesce(data->'character'->>'allowFriend', 'true') into to_name, allow from public.saves where user_id = p_to;
  if coalesce(my_name, '') = '' or coalesce(to_name, '') = '' or allow = 'false' then return jsonb_build_object('ok', false, 'msg', 'not_found'); end if;
  select * into r from public.friend_reqs where from_uid = p_to and to_uid = me;
  if found then
    if r.status = 'pending' then
      update public.friend_reqs set status = 'accepted' where id = r.id;
      perform public.make_friends(me, p_to);
      return jsonb_build_object('ok', true, 'msg', 'auto', 'name', to_name);
    end if;
    return jsonb_build_object('ok', false, 'msg', 'busy');
  end if;
  if exists (select 1 from public.friend_reqs where from_uid = me and to_uid = p_to) then return jsonb_build_object('ok', false, 'msg', 'dup'); end if;
  if (select count(*) from public.friend_reqs where from_uid = me and status = 'pending') >= 10 then return jsonb_build_object('ok', false, 'msg', 'limit'); end if;
  insert into public.friend_reqs(from_uid, to_uid, from_name, to_name) values (me, p_to, my_name, to_name);
  return jsonb_build_object('ok', true, 'msg', 'sent', 'name', to_name);
end $$;

-- 내게 온 신청(incoming)과 내가 보낸 신청의 결과(results: 수락/거절)
create or replace function public.friend_inbox() returns jsonb
language sql security definer set search_path = public as $$
  select jsonb_build_object(
    'incoming', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'name', from_name) order by id) from public.friend_reqs where to_uid = auth.uid() and status = 'pending'), '[]'::jsonb),
    'results',  coalesce((select jsonb_agg(jsonb_build_object('id', id, 'name', to_name, 'status', status) order by id) from public.friend_reqs where from_uid = auth.uid() and status <> 'pending'), '[]'::jsonb),
    'sent',     coalesce((select jsonb_agg(jsonb_build_object('id', id, 'name', to_name) order by id) from public.friend_reqs where from_uid = auth.uid() and status = 'pending'), '[]'::jsonb));
$$;

-- 보낸 친구 신청 취소 (아직 답이 없을 때만)
create or replace function public.cancel_friend_req(p_id bigint) returns void
language sql security definer set search_path = public as $$
  delete from public.friend_reqs where id = p_id and from_uid = auth.uid() and status = 'pending';
$$;
revoke all on function public.cancel_friend_req(bigint) from public, anon;

create or replace function public.answer_friend_req(p_id bigint, p_accept boolean) returns jsonb
language plpgsql security definer set search_path = public as $$
declare n text; f uuid;
begin
  update public.friend_reqs set status = case when p_accept then 'accepted' else 'declined' end
    where id = p_id and to_uid = auth.uid() and status = 'pending' returning from_name, from_uid into n, f;
  if n is null then return jsonb_build_object('ok', false); end if;
  if p_accept then perform public.make_friends(f, auth.uid()); end if;
  return jsonb_build_object('ok', true, 'name', n);
end $$;

-- 보낸 사람이 결과를 확인하면 기록을 지운다
create or replace function public.ack_friend_req(p_id bigint) returns void
language sql security definer set search_path = public as $$
  delete from public.friend_reqs where id = p_id and from_uid = auth.uid() and status <> 'pending';
$$;

revoke all on function public.search_players(text) from public, anon;
revoke all on function public.send_friend_req(uuid) from public, anon;
revoke all on function public.friend_inbox() from public, anon;
revoke all on function public.answer_friend_req(bigint, boolean) from public, anon;
revoke all on function public.ack_friend_req(bigint) from public, anon;

-- ---------- 친구 목록 / 삭제 ----------
create or replace function public.list_friends() returns jsonb
language sql security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object('uid', f.friend_uid, 'name', coalesce(s.data->'character'->>'name', f.friend_name)) order by f.friend_name), '[]'::jsonb)
  from public.friendships f left join public.saves s on s.user_id = f.friend_uid where f.user_id = auth.uid();
$$;
create or replace function public.remove_friend(p_uid uuid) returns void
language sql security definer set search_path = public as $$
  delete from public.friendships where (user_id = auth.uid() and friend_uid = p_uid) or (user_id = p_uid and friend_uid = auth.uid());
$$;

-- ---------- 메일 (친구에게만) ----------
create table if not exists public.mails (
  id         bigint generated always as identity primary key,
  from_uid   uuid not null references auth.users(id) on delete cascade,
  to_uid     uuid not null references auth.users(id) on delete cascade,
  from_name  text not null,
  subject    text not null,
  body       text not null default '',
  items      jsonb not null default '[]',
  created_at timestamptz not null default now()
);
create index if not exists mails_to on public.mails(to_uid, id);
alter table public.mails enable row level security;

create or replace function public.send_mail(p_to uuid, p_subject text, p_body text, p_items jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); my_name text;
begin
  if me is null then raise exception 'no_auth'; end if;
  if not exists (select 1 from public.friendships where user_id = me and friend_uid = p_to) then return jsonb_build_object('ok', false, 'msg', 'not_friend'); end if;
  if char_length(trim(coalesce(p_subject, ''))) < 1 then return jsonb_build_object('ok', false, 'msg', 'bad'); end if;
  if jsonb_typeof(coalesce(p_items, '[]'::jsonb)) <> 'array' or jsonb_array_length(coalesce(p_items, '[]'::jsonb)) > 5 then return jsonb_build_object('ok', false, 'msg', 'bad'); end if;
  if (select count(*) from public.mails where to_uid = p_to) >= 50 then return jsonb_build_object('ok', false, 'msg', 'full'); end if;
  select data->'character'->>'name' into my_name from public.saves where user_id = me;
  insert into public.mails(from_uid, to_uid, from_name, subject, body, items)
    values (me, p_to, coalesce(my_name, '?'), left(trim(p_subject), 30), left(coalesce(p_body, ''), 300), coalesce(p_items, '[]'::jsonb));
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.fetch_mail() returns jsonb
language sql security definer set search_path = public as $$
  select coalesce(jsonb_agg(to_jsonb(m) order by m.id), '[]'::jsonb) from (
    select id, from_name as name, subject, body, items, created_at as at from public.mails where to_uid = auth.uid() order by id limit 20) m;
$$;
create or replace function public.ack_mail(p_ids bigint[]) returns void
language sql security definer set search_path = public as $$
  delete from public.mails where id = any(p_ids) and to_uid = auth.uid();
$$;

-- ---------- 교환 (친구끼리, 내놓은 물건은 제안 때 맡겨 두고 수락/거절/취소/3일 만료 때 정리) ----------
create table if not exists public.trades (
  id         bigint generated always as identity primary key,
  from_uid   uuid not null references auth.users(id) on delete cascade,
  to_uid     uuid not null references auth.users(id) on delete cascade,
  from_name  text not null,
  to_name    text not null,
  give       jsonb not null,
  want       jsonb not null,
  status     text not null default 'pending' check (status in ('pending', 'accepted', 'declined')),
  created_at timestamptz not null default now()
);
create index if not exists trades_to on public.trades(to_uid, status);
create index if not exists trades_from on public.trades(from_uid, status);
alter table public.trades enable row level security;

create or replace function public.propose_trade(p_to uuid, p_give jsonb, p_want jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); my_name text; to_name text;
begin
  if me is null then raise exception 'no_auth'; end if;
  select friend_name into to_name from public.friendships where user_id = me and friend_uid = p_to;
  if to_name is null then return jsonb_build_object('ok', false, 'msg', 'not_friend'); end if;
  if jsonb_typeof(p_give) <> 'array' or jsonb_typeof(p_want) <> 'array' or jsonb_array_length(p_give) not between 1 and 3 or jsonb_array_length(p_want) not between 1 and 3 then return jsonb_build_object('ok', false, 'msg', 'bad'); end if;
  if (select count(*) from public.trades where from_uid = me and status = 'pending') >= 5 then return jsonb_build_object('ok', false, 'msg', 'limit'); end if;
  if (select count(*) from public.trades where to_uid = p_to and status = 'pending') >= 10 then return jsonb_build_object('ok', false, 'msg', 'busy'); end if;
  select data->'character'->>'name' into my_name from public.saves where user_id = me;
  insert into public.trades(from_uid, to_uid, from_name, to_name, give, want) values (me, p_to, coalesce(my_name, '?'), to_name, p_give, p_want);
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.trade_inbox() returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  update public.trades set status = 'declined' where status = 'pending' and created_at < now() - interval '3 days';
  return jsonb_build_object(
    'incoming', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'name', from_name, 'give', give, 'want', want) order by id) from public.trades where to_uid = auth.uid() and status = 'pending'), '[]'::jsonb),
    'sent',     coalesce((select jsonb_agg(jsonb_build_object('id', id, 'name', to_name, 'give', give, 'want', want) order by id) from public.trades where from_uid = auth.uid() and status = 'pending'), '[]'::jsonb),
    'results',  coalesce((select jsonb_agg(jsonb_build_object('id', id, 'name', to_name, 'status', status, 'give', give, 'want', want) order by id) from public.trades where from_uid = auth.uid() and status <> 'pending'), '[]'::jsonb));
end $$;

create or replace function public.answer_trade(p_id bigint, p_accept boolean) returns jsonb
language plpgsql security definer set search_path = public as $$
declare n text; g jsonb; w jsonb;
begin
  update public.trades set status = case when p_accept then 'accepted' else 'declined' end
    where id = p_id and to_uid = auth.uid() and status = 'pending' returning from_name, give, want into n, g, w;
  if n is null then return jsonb_build_object('ok', false); end if;
  return jsonb_build_object('ok', true, 'name', n, 'give', g, 'want', w);
end $$;

create or replace function public.cancel_trade(p_id bigint) returns jsonb
language plpgsql security definer set search_path = public as $$
declare done bigint;
begin
  update public.trades set status = 'declined' where id = p_id and from_uid = auth.uid() and status = 'pending' returning id into done;
  return jsonb_build_object('ok', done is not null);
end $$;

create or replace function public.ack_trade(p_id bigint) returns void
language sql security definer set search_path = public as $$
  delete from public.trades where id = p_id and from_uid = auth.uid() and status <> 'pending';
$$;

revoke all on function public.make_friends(uuid, uuid) from public, anon, authenticated;
revoke all on function public.list_friends() from public, anon;
revoke all on function public.remove_friend(uuid) from public, anon;
revoke all on function public.send_mail(uuid, text, text, jsonb) from public, anon;
revoke all on function public.fetch_mail() from public, anon;
revoke all on function public.ack_mail(bigint[]) from public, anon;
revoke all on function public.propose_trade(uuid, jsonb, jsonb) from public, anon;
revoke all on function public.trade_inbox() from public, anon;
revoke all on function public.answer_trade(bigint, boolean) from public, anon;
revoke all on function public.cancel_trade(bigint) from public, anon;
revoke all on function public.ack_trade(bigint) from public, anon;

-- ---------- 길드 (초대 → 수락 / 가입 신청 → 길드장 수락) ----------
-- 길드원은 최대 20명(길드장 포함), 길드 이름 2~12자. 한 사람은 길드 하나에만 속할 수 있다.
create table if not exists public.guilds (
  id         bigint generated always as identity primary key,
  name       text not null check (char_length(name) between 2 and 12),
  master_uid uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
create unique index if not exists guilds_name_ci on public.guilds(lower(name));
create table if not exists public.guild_members (
  user_id  uuid primary key references auth.users(id) on delete cascade,
  guild_id bigint not null references public.guilds(id) on delete cascade
);
create index if not exists guild_members_g on public.guild_members(guild_id);
create table if not exists public.guild_reqs (
  id         bigint generated always as identity primary key,
  kind       text not null check (kind in ('invite', 'apply')),
  guild_id   bigint not null references public.guilds(id) on delete cascade,
  from_uid   uuid not null references auth.users(id) on delete cascade,
  to_uid     uuid not null references auth.users(id) on delete cascade,
  from_name  text not null,
  created_at timestamptz not null default now()
);
create unique index if not exists guild_reqs_uniq on public.guild_reqs(kind, guild_id, from_uid, to_uid);
alter table public.guilds enable row level security;
alter table public.guild_members enable row level security;
alter table public.guild_reqs enable row level security;

create or replace function public.guild_create(p_name text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); n text := trim(coalesce(p_name, '')); gid bigint;
begin
  if me is null then raise exception 'no_auth'; end if;
  if char_length(n) not between 2 and 12 then return jsonb_build_object('ok', false, 'msg', 'bad_name'); end if;
  if exists (select 1 from public.guild_members where user_id = me) then return jsonb_build_object('ok', false, 'msg', 'in_guild'); end if;
  if exists (select 1 from public.guilds where lower(name) = lower(n)) then return jsonb_build_object('ok', false, 'msg', 'dup'); end if;
  insert into public.guilds(name, master_uid) values (n, me) returning id into gid;
  insert into public.guild_members(user_id, guild_id) values (me, gid);
  return jsonb_build_object('ok', true);
end $$;

-- 내 길드 + 나와 관련된 신청/초대
create or replace function public.guild_info() returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); g public.guilds;
begin
  select gg.* into g from public.guilds gg join public.guild_members m on m.guild_id = gg.id where m.user_id = me;
  return jsonb_build_object(
    'guild', case when g.id is null then null else jsonb_build_object('id', g.id, 'name', g.name, 'master', g.master_uid = me,
      'members', coalesce((select jsonb_agg(jsonb_build_object('uid', m.user_id, 'name', coalesce(s.data->'character'->>'name', '?'), 'master', m.user_id = g.master_uid) order by (m.user_id = g.master_uid) desc, s.updated_at)
        from public.guild_members m left join public.saves s on s.user_id = m.user_id where m.guild_id = g.id), '[]'::jsonb)) end,
    'incoming', coalesce((select jsonb_agg(jsonb_build_object('id', r.id, 'kind', r.kind, 'guild', gg.name, 'name', r.from_name) order by r.id)
        from public.guild_reqs r join public.guilds gg on gg.id = r.guild_id where r.to_uid = me), '[]'::jsonb),
    'sent', coalesce((select jsonb_agg(jsonb_build_object('id', r.id, 'kind', r.kind, 'guild', gg.name, 'name', coalesce(s.data->'character'->>'name', '?')) order by r.id)
        from public.guild_reqs r join public.guilds gg on gg.id = r.guild_id left join public.saves s on s.user_id = r.to_uid where r.from_uid = me), '[]'::jsonb));
end $$;

create or replace function public.guild_search(p_q text) returns jsonb
language sql security definer set search_path = public as $$
  select coalesce(jsonb_agg(x), '[]'::jsonb) from (
    select g.id, g.name, (select count(*) from public.guild_members m where m.guild_id = g.id) as count,
           coalesce((select s.data->'character'->>'name' from public.saves s where s.user_id = g.master_uid), '?') as master
    from public.guilds g
    where char_length(trim(coalesce(p_q, ''))) >= 1
      and g.name ilike '%' || replace(replace(replace(trim(p_q), '\', '\\'), '%', '\%'), '_', '\_') || '%'
    order by g.id desc limit 8) x;
$$;

-- 길드 초대 대상 검색 ('길드 초대 허용'을 켠, 길드가 없는 대원)
create or replace function public.search_players_guild(p_q text) returns jsonb
language sql security definer set search_path = public as $$
  select coalesce(jsonb_agg(x), '[]'::jsonb) from (
    select s.user_id as uid, s.data->'character'->>'name' as name, s.data->'character'->>'rank' as rank, s.data->'character'->>'level' as level
    from public.saves s
    where s.user_id <> auth.uid()
      and char_length(trim(coalesce(p_q, ''))) >= 1
      and coalesce(s.data->'character'->>'allowGuild', 'true') <> 'false'
      and not exists (select 1 from public.guild_members m where m.user_id = s.user_id)
      and coalesce(s.data->'character'->>'name', '') <> ''
      and s.data->'character'->>'name' ilike '%' || replace(replace(replace(trim(p_q), '\', '\\'), '%', '\%'), '_', '\_') || '%'
    order by s.updated_at desc limit 8) x;
$$;

create or replace function public.guild_invite(p_to uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); g public.guilds; my_name text; allow text;
begin
  if me is null then raise exception 'no_auth'; end if;
  select gg.* into g from public.guilds gg where gg.master_uid = me;
  if g.id is null then return jsonb_build_object('ok', false, 'msg', 'not_master'); end if;
  if p_to = me or exists (select 1 from public.guild_members where user_id = p_to) then return jsonb_build_object('ok', false, 'msg', 'target_in_guild'); end if;
  select coalesce(data->'character'->>'allowGuild', 'true') into allow from public.saves where user_id = p_to;
  if allow is null or allow = 'false' then return jsonb_build_object('ok', false, 'msg', 'not_found'); end if;
  if (select count(*) from public.guild_members where guild_id = g.id) >= 20 then return jsonb_build_object('ok', false, 'msg', 'full'); end if;
  if (select count(*) from public.guild_reqs where from_uid = me and kind = 'invite') >= 10 then return jsonb_build_object('ok', false, 'msg', 'limit'); end if;
  select data->'character'->>'name' into my_name from public.saves where user_id = me;
  insert into public.guild_reqs(kind, guild_id, from_uid, to_uid, from_name) values ('invite', g.id, me, p_to, coalesce(my_name, '?'))
    on conflict do nothing;
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.guild_apply(p_guild bigint) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); g public.guilds; my_name text;
begin
  if me is null then raise exception 'no_auth'; end if;
  if exists (select 1 from public.guild_members where user_id = me) then return jsonb_build_object('ok', false, 'msg', 'in_guild'); end if;
  select * into g from public.guilds where id = p_guild;
  if g.id is null then return jsonb_build_object('ok', false, 'msg', 'not_found'); end if;
  if (select count(*) from public.guild_members where guild_id = g.id) >= 20 then return jsonb_build_object('ok', false, 'msg', 'full'); end if;
  if (select count(*) from public.guild_reqs where from_uid = me and kind = 'apply') >= 5 then return jsonb_build_object('ok', false, 'msg', 'limit'); end if;
  select data->'character'->>'name' into my_name from public.saves where user_id = me;
  insert into public.guild_reqs(kind, guild_id, from_uid, to_uid, from_name) values ('apply', g.id, me, g.master_uid, coalesce(my_name, '?'))
    on conflict do nothing;
  return jsonb_build_object('ok', true);
end $$;

-- 받은 쪽이 답한다: 초대는 초대받은 사람이, 가입 신청은 길드장이 수락/거절
create or replace function public.guild_answer(p_id bigint, p_accept boolean) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); r public.guild_reqs; joiner uuid;
begin
  select * into r from public.guild_reqs where id = p_id and to_uid = me;
  if r.id is null then return jsonb_build_object('ok', false, 'msg', 'gone'); end if;
  delete from public.guild_reqs where id = r.id;
  if not p_accept then return jsonb_build_object('ok', true, 'joined', false); end if;
  joiner := case when r.kind = 'invite' then me else r.from_uid end;
  if exists (select 1 from public.guild_members where user_id = joiner) then return jsonb_build_object('ok', false, 'msg', 'in_guild'); end if;
  if (select count(*) from public.guild_members where guild_id = r.guild_id) >= 20 then return jsonb_build_object('ok', false, 'msg', 'full'); end if;
  insert into public.guild_members(user_id, guild_id) values (joiner, r.guild_id);
  delete from public.guild_reqs where (to_uid = joiner and kind = 'invite') or (from_uid = joiner and kind = 'apply');
  return jsonb_build_object('ok', true, 'joined', true);
end $$;

create or replace function public.guild_cancel(p_id bigint) returns void
language sql security definer set search_path = public as $$
  delete from public.guild_reqs where id = p_id and from_uid = auth.uid();
$$;

-- 길드장이 나가면 길드가 해산된다
create or replace function public.guild_leave() returns void
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid();
begin
  if exists (select 1 from public.guilds where master_uid = me) then delete from public.guilds where master_uid = me;
  else delete from public.guild_members where user_id = me; end if;
end $$;

revoke all on function public.guild_create(text) from public, anon;
revoke all on function public.guild_info() from public, anon;
revoke all on function public.guild_search(text) from public, anon;
revoke all on function public.search_players_guild(text) from public, anon;
revoke all on function public.guild_invite(uuid) from public, anon;
revoke all on function public.guild_apply(bigint) from public, anon;
revoke all on function public.guild_answer(bigint, boolean) from public, anon;
revoke all on function public.guild_cancel(bigint) from public, anon;
revoke all on function public.guild_leave() from public, anon;
