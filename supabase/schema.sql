-- 공중도시 DEEP LAYER · 서버 저장 1단계 (Supabase SQL Editor에 통째로 붙여넣어 실행)
-- 사전 설정: Authentication → Providers → Email 에서 "Confirm email" 을 끈다 (아이디@가짜도메인 으로 가입하기 때문)

create extension if not exists pgcrypto with schema extensions;

-- 초대코드: 코드 원문이 아니라 SHA-256(대문자) 해시만 저장. 클라이언트는 이 표를 읽을 수 없다
create table if not exists public.invites (
  code_hash text primary key,
  max_uses  int  not null default 50,
  used      int  not null default 0
);
alter table public.invites enable row level security;   -- 정책 없음 = 아무도 직접 접근 불가

-- 세이브: 계정당 1행
create table if not exists public.saves (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  rev        int  not null default 1,
  data       jsonb not null,
  updated_at timestamptz not null default now()
);
alter table public.saves enable row level security;      -- 직접 접근 금지, 아래 함수로만 읽고 쓴다

-- 가입할 때 초대코드를 원자적으로 확인·차감한다. 틀리거나 정원이 차면 가입 자체가 거부된다
create or replace function public.check_invite() returns trigger
language plpgsql security definer set search_path = public, extensions as $$
declare h text;
begin
  h := encode(digest(upper(coalesce(new.raw_user_meta_data->>'invite', '')), 'sha256'), 'hex');
  update public.invites set used = used + 1 where code_hash = h and used < max_uses;
  if not found then raise exception 'invalid_invite'; end if;
  return new;
end $$;
drop trigger if exists trg_check_invite on auth.users;
create trigger trg_check_invite before insert on auth.users for each row execute function public.check_invite();

-- 불러오기: 내 세이브 { rev, data } (없으면 null)
create or replace function public.pull_save() returns jsonb
language sql security definer set search_path = public as $$
  select jsonb_build_object('rev', rev, 'data', data, 'at', updated_at) from public.saves where user_id = auth.uid();
$$;

-- 올리기: p_rev 는 내가 마지막으로 본 rev (처음은 0). 다른 기기가 먼저 저장했으면 { ok:false, rev } 로 거절
create or replace function public.push_save(p_rev int, p_data jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare cur int; uid uuid := auth.uid();
begin
  if uid is null then raise exception 'no_auth'; end if;
  if jsonb_typeof(p_data) <> 'object' or octet_length(p_data::text) > 400000 then raise exception 'bad_data'; end if;
  select rev into cur from public.saves where user_id = uid for update;
  if not found then
    insert into public.saves(user_id, rev, data) values (uid, 1, p_data);
    return jsonb_build_object('ok', true, 'rev', 1);
  end if;
  if cur <> p_rev then return jsonb_build_object('ok', false, 'rev', cur); end if;
  update public.saves set rev = cur + 1, data = p_data, updated_at = now() where user_id = uid;
  return jsonb_build_object('ok', true, 'rev', cur + 1);
end $$;

revoke all on function public.pull_save() from public, anon;
revoke all on function public.push_save(int, jsonb) from public, anon;
grant execute on function public.pull_save() to authenticated;
grant execute on function public.push_save(int, jsonb) to authenticated;

-- 초대코드 등록 예 (코드 원문은 대문자로 해시한다). 실제 값으로 바꿔서 실행:
-- insert into public.invites(code_hash, max_uses) values (encode(digest(upper('여기에-초대코드'), 'sha256'), 'hex'), 5);
