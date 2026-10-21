-- 관리자 아이디 만들기 (schema.sql 을 먼저 실행한 뒤, Supabase SQL Editor 에서 실행)
-- 1) 게임의 가입 페이지에서 평소처럼 관리자로 쓸 아이디를 가입한다 (초대코드 필요)
-- 2) 아래 마지막 문장의 '관리자아이디' 를 그 아이디로 바꿔 실행한다

create table if not exists public.admins (user_id uuid primary key references auth.users(id) on delete cascade);
alter table public.admins enable row level security;   -- 정책 없음 = 직접 접근 불가

create or replace function public.is_admin() returns boolean
language sql security definer set search_path = public as $$
  select exists (select 1 from public.admins where user_id = auth.uid());
$$;
revoke all on function public.is_admin() from public, anon;
grant execute on function public.is_admin() to authenticated;

-- ▼ 관리자 등록 (아이디만 바꿔서 실행)
insert into public.admins(user_id)
select id from auth.users where email = '관리자아이디@deeplayer.game'
on conflict do nothing;


-- ===== 버그 리포트 (관리자만 읽을 수 있다) =====
create table if not exists public.bug_reports (
  id bigint generated always as identity primary key,
  user_id uuid references auth.users(id) on delete set null,
  uname text,
  body text not null,
  ctx jsonb,
  created_at timestamptz not null default now()
);
alter table public.bug_reports enable row level security;   -- 정책 없음 = 직접 접근 불가

-- 보내기: 로그인한 누구나. 1000자 제한, 1시간에 5건까지
create or replace function public.submit_bug(p_body text, p_ctx jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); nm text;
begin
  if uid is null then raise exception 'no_auth'; end if;
  if p_body is null or char_length(trim(p_body)) < 5 or char_length(p_body) > 1000 then raise exception 'bad_text'; end if;
  if (select count(*) from public.bug_reports where user_id = uid and created_at > now() - interval '1 hour') >= 5 then raise exception 'too_many'; end if;
  select split_part(email, '@', 1) into nm from auth.users where id = uid;
  insert into public.bug_reports(user_id, uname, body, ctx) values (uid, nm, trim(p_body), case when octet_length(coalesce(p_ctx, '{}'::jsonb)::text) < 2000 then p_ctx else null end);
end $$;

-- 읽기·삭제: 관리자만
create or replace function public.list_bugs() returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'forbidden'; end if;
  return coalesce((select jsonb_agg(to_jsonb(b) order by b.id desc) from (select id, uname, body, ctx, created_at from public.bug_reports order by id desc limit 100) b), '[]'::jsonb);
end $$;
create or replace function public.delete_bug(p_id bigint) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'forbidden'; end if;
  delete from public.bug_reports where id = p_id;
end $$;

revoke all on function public.submit_bug(text, jsonb), public.list_bugs(), public.delete_bug(bigint) from public, anon;
grant execute on function public.submit_bug(text, jsonb), public.list_bugs(), public.delete_bug(bigint) to authenticated;


-- ===== 공지 (관리자가 쓰고 모두가 읽는다) =====
create table if not exists public.notices (
  id bigint generated always as identity primary key,
  head text not null,
  body text not null,
  created_at timestamptz not null default now()
);
alter table public.notices enable row level security;   -- 정책 없음 = 직접 접근 불가

create or replace function public.post_notice(p_head text, p_body text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'forbidden'; end if;
  if p_body is null or char_length(trim(p_body)) < 1 or char_length(p_body) > 300 or char_length(coalesce(p_head, '')) > 20 then raise exception 'bad_text'; end if;
  insert into public.notices(head, body) values (coalesce(nullif(trim(p_head), ''), '공지'), trim(p_body));
end $$;

-- 최근 30개 (새것이 먼저)
create or replace function public.list_notices() returns jsonb
language sql security definer set search_path = public as $$
  select coalesce(jsonb_agg(to_jsonb(n) order by n.id desc), '[]'::jsonb)
  from (select id, head, body, created_at from public.notices order by id desc limit 30) n;
$$;

revoke all on function public.post_notice(text, text), public.list_notices() from public, anon;
grant execute on function public.post_notice(text, text), public.list_notices() to authenticated;
