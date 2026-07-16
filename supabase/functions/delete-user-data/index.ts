// Deletes all of a user's data (matrix entries, games, journals, photos,
// media submissions) while keeping their profile and login intact.
// Called from users/account-settings.html "delete my data".

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders, handleOptions } from '../_shared/cors.ts'
import { wipeUserData } from '../_shared/wipe-user-data.ts'

serve(async (req) => {
  const options = handleOptions(req)
  if (options) return options

  try {
    // Verify the user is who they say they are using their JWT
    const anonClient = createClient(
      Deno.env.get('SB_URL') ?? '',
      Deno.env.get('SB_ANON_KEY') ?? ''
    )
    const authHeader = req.headers.get('Authorization')
    const token = authHeader?.replace('Bearer ', '')
    const { data: { user }, error: userError } = await anonClient.auth.getUser(token)

    if (userError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // Use service role for all deletions
    const sb = createClient(
      Deno.env.get('SB_URL') ?? '',
      Deno.env.get('SB_SERVICE_ROLE_KEY') ?? ''
    )

    await wipeUserData(sb, user.id)

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })

  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})
