-- This schema is the final version, including all features.

-- places
create table if not exists places (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  name text not null,
  created_at timestamptz default now(),
  -- Ensure a user can't have two places with the same name
  CONSTRAINT unique_user_place_name UNIQUE(user_id, name)
);

-- categories
create table if not exists categories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  name text not null,
  created_at timestamptz default now(),
  -- Ensure a user can't have two categories with the same name
  CONSTRAINT unique_user_category_name UNIQUE(user_id, name)
);

-- items
create table if not exists items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  name text not null,
  created_at timestamptz default now(),
  
  -- Link to categories (set to NULL if category is deleted)
  category_id uuid references categories(id) on delete set null,
  
  -- Link to places (set to NULL if place is deleted)
  place_id uuid references places(id) on delete set null,
  
  -- Quantity feature
  quantity int not null default 1
);

-- action log (for analysis)
create table if not exists actions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  session_id text,
  action_type text not null,
  item_id uuid,
  item_name text,
  from_place_id uuid,
  to_place_id uuid,
  metadata jsonb,
  created_at timestamptz default now()
);