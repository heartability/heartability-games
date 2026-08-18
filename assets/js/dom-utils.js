/* ── Heartability shared DOM helpers ──
   Load before any page script that calls _escapeHtml. Not deferred — must
   run synchronously in document order. */

function _escapeHtml(s){ return (s||'').replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
