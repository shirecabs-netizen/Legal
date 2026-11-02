-- Run once in Supabase: SQL Editor > New query > paste > Run.
create extension if not exists pgcrypto;

create table if not exists recipients (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  org text,
  email text not null,
  token text not null unique default encode(gen_random_bytes(18), 'hex'),
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists otp (
  id bigserial primary key,
  recipient_id uuid not null references recipients(id) on delete cascade,
  code_hash text not null,
  expires_at timestamptz not null,
  attempts int not null default 0,
  used boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists events (
  id bigserial primary key,
  recipient_id uuid references recipients(id) on delete set null,
  type text not null,
  detail jsonb,
  ip text, country text, city text, ua text,
  created_at timestamptz not null default now()
);
create index if not exists events_recipient_idx on events (recipient_id, created_at desc);

-- Lock everything down: only the server (service-role key) can touch these.
alter table recipients enable row level security;
alter table otp        enable row level security;
alter table events     enable row level security;

create or replace view recipient_status with (security_invoker = true) as
select r.id, r.name, r.org, r.email, r.active,
  min(e.created_at) filter (where e.type='link_opened')   as first_link_open,
  max(e.created_at) filter (where e.type='link_opened')   as last_link_open,
  min(e.created_at) filter (where e.type='code_verified') as first_verified,
  max(e.created_at) filter (where e.type='letter_viewed') as last_viewed,
  count(*) filter (where e.type='letter_viewed')          as views,
  count(*) filter (where e.type='code_failed')            as failed_codes,
  count(*) filter (where e.type='tamper')                 as tamper_attempts,
  coalesce(max((e.detail->>'seconds')::int) filter (where e.type='heartbeat'),0) as max_seconds,
  case
    when count(*) filter (where e.type='letter_viewed') > 0 then 'VIEWED'
    when count(*) filter (where e.type='link_opened')  > 0 then 'OPENED LINK - NOT VERIFIED'
    else 'NOT OPENED' end as status
from recipients r left join events e on e.recipient_id = r.id
group by r.id;

-- Add recipients (each gets a unique link: https://legal.shire.taxi/?r=<token>)
-- insert into recipients (name, org, email) values
--   ('Monitoring Officer', 'Monmouthshire County Council', 'name@monmouthshire.gov.uk');
-- select name, email, 'https://legal.shire.taxi/?r='||token as link from recipients;
