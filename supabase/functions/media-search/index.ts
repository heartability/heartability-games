import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  const url = new URL(req.url)
  const q = url.searchParams.get('q')?.trim()
  if (!q) {
    return new Response(JSON.stringify({ error: 'missing q param' }), {
      status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }

  try {
    const apiKey = Deno.env.get('OMDB_API_KEY')
    if (!apiKey) {
      return new Response(JSON.stringify({ error: 'OMDB_API_KEY not configured' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // Without a bound here, a slow OMDB response hangs the function until Supabase's own
    // request timeout kicks in, which can take far longer than a client is willing to wait.
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 8000)
    let omdbRes, omdbData
    try {
      omdbRes = await fetch(`https://www.omdbapi.com/?s=${encodeURIComponent(q)}&apikey=${apiKey}`, { signal: controller.signal })
      omdbData = await omdbRes.json()
    } finally {
      clearTimeout(timeout)
    }

    if (omdbData.Response === 'False' || !Array.isArray(omdbData.Search)) {
      return new Response(JSON.stringify([]), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // OMDB returns up to 10 results per page for a search — hand back the full page
    // so the client can show the first 5 and reveal the rest via "see more results".
    const results = omdbData.Search.slice(0, 10).map((item: any) => ({
      title: item.Title,
      year: item.Year,
      poster: item.Poster && item.Poster !== 'N/A' ? item.Poster : null,
      imdb_id: item.imdbID,
      plot: null,
    }))

    return new Response(JSON.stringify(results), {
      status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  } catch (err) {
    console.error('[media-search] failed:', err)
    return new Response(JSON.stringify({ error: 'search failed' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})
