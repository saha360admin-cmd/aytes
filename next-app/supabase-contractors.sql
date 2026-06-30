-- Taşeron firma tablosu
create table if not exists contractors (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  description text,
  created_at  timestamptz default now()
);

-- RLS
alter table contractors enable row level security;
create policy "contractors_all" on contractors for all using (true);
