-- Adds a dedicated font-size multiplier for bedroom wall text notes, separate
-- from the existing "scale" column (which resizes the whole note, image
-- included, via the drag-resize handle). Run this once in the Supabase SQL editor.

alter table public.bed_wall_items
  add column if not exists text_scale numeric not null default 1;
