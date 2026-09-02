/* ── Heartability client-side error monitoring (Sentry) ──
   Load right after supabase-init.js — needs `sb` to attach the signed-in
   user's id to captured errors. Inert until SENTRY_LOADER_KEY is filled in:
   create a free project at sentry.io (platform: Browser JavaScript), then
   go to Settings → Projects → <project> → SDK Setup → Loader Script and
   copy the key out of the script src (https://js.sentry-cdn.com/<KEY>.min.js). */

const SENTRY_LOADER_KEY = '806cb092019bf6023671cb471cacceb7';

if (SENTRY_LOADER_KEY !== 'REPLACE_ME') {
  window.sentryOnLoad = function () {
    Sentry.init({
      environment: location.hostname === 'localhost' ? 'development' : 'production',
    });
    sb.auth.getSession().then(({ data }) => {
      const user = data?.session?.user;
      if (user) Sentry.setUser({ id: user.id });
    });
  };
  const s = document.createElement('script');
  s.src = `https://js.sentry-cdn.com/${SENTRY_LOADER_KEY}.min.js`;
  s.crossOrigin = 'anonymous';
  s.setAttribute('data-lazy', 'no');
  document.head.appendChild(s);
}
