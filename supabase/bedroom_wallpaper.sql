-- Adds bedroom wallpaper/floor pattern choice to user-profiles.
-- Run this once in the Supabase SQL editor.

alter table public."user-profiles"
  add column if not exists bedroom_wall_pattern  text not null default 'dots',
  add column if not exists bedroom_floor_pattern text not null default 'speckle';
