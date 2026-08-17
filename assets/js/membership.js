/* ── Heartability shared membership tier helpers ──
   Single source of truth for "does this membership_status grant paid
   access" and its display label. Previously this check was copy-pasted
   per-page (and had drifted into two different, non-equivalent versions —
   an allow-list on some pages, a deny-list on others). Load this file
   before any code that reads profile.membership_status. */

window.HeartabilityMembership = (function () {
  const PAID_TIERS = ['dream', 'founding', 'lifetime'];

  function isPaid(status) {
    return PAID_TIERS.includes(status);
  }

  function label(status) {
    if (status === 'founding') return 'founding member';
    if (status === 'dream')    return 'dream member';
    if (status === 'lifetime') return 'lifetime member';
    return 'free member';
  }

  return { isPaid, label };
})();
