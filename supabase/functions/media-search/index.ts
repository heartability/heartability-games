import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
  })
}

// Bounds a fetch so a slow upstream (OMDB / Google Books) fails fast instead of hanging
// the function until Supabase's own request timeout kicks in.
async function fetchWithTimeout(url: string, timeoutMs = 8000) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const res = await fetch(url, { signal: controller.signal })
    return await res.json()
  } finally {
    clearTimeout(timeout)
  }
}

async function searchMovies(q: string) {
  const apiKey = Deno.env.get('OMDB_API_KEY')
  if (!apiKey) return jsonResponse({ error: 'OMDB_API_KEY not configured' }, 500)

  const omdbData = await fetchWithTimeout(`https://www.omdbapi.com/?s=${encodeURIComponent(q)}&apikey=${apiKey}`)

  if (omdbData.Response === 'False' || !Array.isArray(omdbData.Search)) {
    return jsonResponse([])
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
  return jsonResponse(results)
}

async function searchBooks(q: string) {
  const apiKey = Deno.env.get('GOGGLE_BOOKS') // secret name as saved in Supabase (typo, not "GOOGLE_")
  if (!apiKey) return jsonResponse({ error: 'GOGGLE_BOOKS not configured' }, 500)

  // Proxied server-side because the client-side key is restricted by HTTP referrer, and
  // mobile Safari (Private Relay / cross-site tracking prevention) intermittently strips the
  // Referer header on requests to googleapis.com — Google then blocks the request outright in
  // well under a second. Calling from here removes the dependency on that header entirely.
  const url = `https://www.googleapis.com/books/v1/volumes?q=${encodeURIComponent('intitle:' + q)}&maxResults=40&key=${apiKey}`

  // Google Books' backend regularly throws transient 5xx "backendFailed" errors that clear up
  // within a couple seconds — retry server-side (bounded, with a short backoff) instead of
  // pushing that flakiness onto the user as a dead-end "search isn't working" message.
  let data = await fetchWithTimeout(url)
  for (let attempt = 0; data.error?.code >= 500 && attempt < 3; attempt++) {
    await new Promise(r => setTimeout(r, 400))
    data = await fetchWithTimeout(url)
  }
  if (data.error) {
    console.error('[media-search] google books error:', data.error)
    return jsonResponse({ error: 'google books search failed' }, 502)
  }
  return jsonResponse(data)
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  const url = new URL(req.url)
  const q = url.searchParams.get('q')?.trim()
  const type = url.searchParams.get('type') === 'book' ? 'book' : 'movie'
  if (!q) return jsonResponse({ error: 'missing q param' }, 400)

  try {
    return type === 'book' ? await searchBooks(q) : await searchMovies(q)
  } catch (err) {
    console.error('[media-search] failed:', err)
    return jsonResponse({ error: 'search failed' }, 500)
  }
})
