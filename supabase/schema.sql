-- Run once in Supabase: SQL Editor > New query > paste > Run.
create table if not exists sessions (
  sid text primary key,
  ref text,                       -- link tag, e.g. /?r=MO
  started_at timestamptz,
  last_seen timestamptz,
  unlocked boolean not null default false,
  fails int not null default 0,   -- wrong passwords
  seconds int not null default 0, -- active reading time
  max_scroll int not null default 0,
  tamper jsonb,                   -- print/copy/right-click attempts
  ip text, country text, city text, ua text
);
alter table sessions enable row level security;  -- server-only via service key
