// Shared data-wipe used by delete-user-data (keeps login) and
// delete-account (also removes profile + auth user).
// `sb` must be a service-role client.

import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'

const PHOTO_BUCKET = 'matrix-photos'

// Tables where the user's rows are keyed by user_id.
const USER_ID_TABLES = [
  'dream_matrix',
  'daily_matrix',
  'cosmic_matrix',
  'cosmic_bingo',
  'dreams',
  'character_archetypes',
  'bed_wall_photos',
]

// Recursively collect every file path under a storage folder.
async function listAllFiles(sb: SupabaseClient, bucket: string, prefix: string): Promise<string[]> {
  const { data, error } = await sb.storage.from(bucket).list(prefix, { limit: 1000 })
  if (error || !data) return []
  const files: string[] = []
  for (const entry of data) {
    const path = prefix ? `${prefix}/${entry.name}` : entry.name
    if (entry.id) {
      files.push(path)
    } else {
      files.push(...await listAllFiles(sb, bucket, path))
    }
  }
  return files
}

export async function wipeUserData(sb: SupabaseClient, userId: string): Promise<void> {
  for (const table of USER_ID_TABLES) {
    const { error } = await sb.from(table).delete().eq('user_id', userId)
    if (error) throw error
  }

  const { error: subError } = await sb.from('media_submissions').delete().eq('submitted_by', userId)
  if (subError) throw subError

  const { error: toolsError } = await sb.from('tools').delete().eq('submitted_by', userId)
  if (toolsError) throw toolsError

  const { error: toolCommentsError } = await sb.from('tool_comments').delete().eq('user_id', userId)
  if (toolCommentsError) throw toolCommentsError

  // Uploaded matrix photos live under `${userId}/...` in the photo bucket.
  const photoPaths = await listAllFiles(sb, PHOTO_BUCKET, userId)
  if (photoPaths.length > 0) {
    await sb.storage.from(PHOTO_BUCKET).remove(photoPaths)
  }
}
