/* ── Heartability shared Supabase client ──
   Load right after the supabase-js CDN script and before any page script
   that uses sb/SUPABASE_URL/SUPABASE_ANON_KEY. Not deferred — must run
   synchronously in document order. `sb` is `let`, not `const`, because
   matrix/dream.html reassigns it to a second scoped client instance later
   on (see the comment there). */

const SUPABASE_URL = 'https://rrdfltqnrnvmqemyrfaj.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJyZGZsdHFucm52bXFlbXlyZmFqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY5NTYxMjIsImV4cCI6MjA5MjUzMjEyMn0.u2nYIEepQQYr357GlMNPg0-1zermCbWenkjjfaGGZD4';
let sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
