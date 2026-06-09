import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // Verify the user is who they say they are using their JWT
    const anonClient = createClient(
      Deno.env.get('SB_URL') ?? '',
      JSON.parse(Deno.env.get('SUPABASE_PUBLISHABLE_KEYS') ?? '{}').anon_key ?? ''
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

    // Anonymize chatroom messages first
    const { data: profileData } = await sb
      .from('user-profiles')
      .select('username')
      .eq('id', user.id)
      .single()

    if (profileData?.username) {
      await sb.from('chatroom').update({ name: 'deleted account' }).eq('name', profileData.username)
    }

    // Delete all user data
    await sb.from('daily_entries').delete().eq('user_id', user.id)
    await sb.from('diary_entries').delete().eq('user_id', user.id)
    await sb.from('games').delete().eq('user_id', user.id)
    await sb.from('user-profiles').delete().eq('id', user.id)

    // Delete the auth user last
    const { error: deleteError } = await sb.auth.admin.deleteUser(user.id)
    if (deleteError) throw deleteError

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })

  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})
