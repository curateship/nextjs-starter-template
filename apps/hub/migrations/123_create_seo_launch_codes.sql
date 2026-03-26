create table if not exists seo_launch_codes (
  code text primary key,
  hub_user_id text not null references users(id) on delete cascade,
  email text not null,
  role text not null,
  seo_access boolean not null,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists seo_launch_codes_hub_user_id_idx
  on seo_launch_codes (hub_user_id);

create index if not exists seo_launch_codes_expires_at_idx
  on seo_launch_codes (expires_at);
