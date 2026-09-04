/* ══════════════════════════════════════════════════════════════
   matrix-journal-editor.js — shared single-textarea "adventure
   notes" editor, extracted out of matrix-render.js. Used only by
   archive.html today (edits one row's journal_messages as a single
   note, replacing the whole array on save; clearing removes it).
   Distinct from matrix-journal.js's chat-style panel used by the
   on-canvas notes toolbar button in dream/cosmic matrix.

   Exposes one global:  window.MatrixJournalEditor.createEditor(deps)
   deps = { sb, getEntryId(), onChange(), status(msg,color), table }
   ══════════════════════════════════════════════════════════════ */
(function () {

  function ensureStyles() {
    if (document.getElementById('matrix-journal-editor-styles')) return;
    const style = document.createElement('style');
    style.id = 'matrix-journal-editor-styles';
    style.textContent = `
.mr-jr-overlay {
  position:fixed; inset:0; z-index:600;
  background:rgba(40,32,24,.45);
  display:none; align-items:center; justify-content:center; padding:18px;
}
.mr-jr-overlay.open { display:flex; }
.mr-jr-card {
  width:min(440px,94vw); max-height:92vh; overflow-y:auto;
  background:var(--back-wall,#f1ebe4);
  border:2px solid var(--blue,#6e83d3);
  box-shadow:0 0 0 3px var(--blue,#6e83d3), 0 0 0 6px var(--aqua,#83d2e6), 6px 10px 40px rgba(0,0,0,.4);
  padding:18px 20px; font-family:var(--font-hand,"ZoesHandwriting",cursive);
}
.mr-jr-head { display:flex; align-items:baseline; justify-content:space-between; gap:10px; }
.mr-jr-title { font-size:clamp(18px,2.2vw,24px); color:var(--blue,#6e83d3); }
.mr-jr-close { font-size:22px; color:#aaa; cursor:pointer; line-height:1; border:none; background:none; padding:2px 6px; }
.mr-jr-close:hover { color:#E8478B; }
.mr-jr-sub { font-size:13px; color:#7a86bb; margin:2px 0 14px; }
.mr-jr-status { font-size:13px; min-height:18px; margin-bottom:8px; color:#7a86bb; }
.mr-jr-text {
  width:100%; min-height:200px; resize:vertical;
  background:rgba(255,255,255,.7); border:1.5px solid var(--blue);
  font-family:var(--font-hand,"ZoesHandwriting",cursive); font-size:16px; color:#3a2e1e;
  line-height:1.6; padding:12px 14px; margin-bottom:8px; outline:none;
}
.mr-jr-text:focus { border-color:var(--blue,#6e83d3); }
.mr-jr-actions { display:flex; justify-content:flex-end; gap:10px; }
.mr-jr-cancel {
  font-family:var(--font-hand,"ZoesHandwriting",cursive); font-size:15px; color:#888;
  background:none; border:1.5px solid #ccc; padding:8px 16px; cursor:pointer;
}
.mr-jr-cancel:hover { color:var(--blue,#6e83d3); border-color:var(--blue,#6e83d3); }
.mr-jr-save {
  font-family:var(--font-hand,"ZoesHandwriting",cursive); font-size:15px; color:#fff;
  background:var(--blue,#6e83d3); border:2px solid #4a5bc4; box-shadow:2px 2px 0 #3a4aaa;
  padding:8px 18px; cursor:pointer; transition:all .05s;
}
.mr-jr-save:hover  { background:#4a5bc4; }
.mr-jr-save:active { box-shadow:none; transform:translate(2px,2px); }
.mr-jr-save:disabled { opacity:.4; cursor:not-allowed; transform:none !important; }
`;
    document.head.appendChild(style);
  }

  // deps = { sb, getEntryId(), onChange(), status(msg,color), table }
  // Edits <table>.journal_messages (defaults to dream_matrix). Saving replaces
  // with a single message; clearing removes all.
  function createEditor(deps){
    deps = deps || {};
    const status = deps.status || function(){};
    const table  = deps.table || 'dream_matrix';

    ensureStyles();

    const overlay = document.createElement('div');
    overlay.className = 'mr-jr-overlay';
    overlay.innerHTML = `
      <div class="mr-jr-card">
        <div class="mr-jr-head">
          <span class="mr-jr-title">✎ adventure notes</span>
          <button class="mr-jr-close" type="button">×</button>
        </div>
        <div class="mr-jr-sub">edit your notes for this entry. clearing the text removes them.</div>
        <textarea class="mr-jr-text" placeholder="what was this moment like?"></textarea>
        <div class="mr-jr-status"></div>
        <div class="mr-jr-actions">
          <button class="mr-jr-cancel" type="button">cancel</button>
          <button class="mr-jr-save" type="button">save notes</button>
        </div>
      </div>`;
    document.body.appendChild(overlay);

    const textEl   = overlay.querySelector('.mr-jr-text');
    const statusEl = overlay.querySelector('.mr-jr-status');
    const saveEl   = overlay.querySelector('.mr-jr-save');

    function open(currentText){
      textEl.value = currentText || '';
      statusEl.textContent = ''; statusEl.style.color = '';
      saveEl.disabled = false; saveEl.textContent = 'save notes';
      overlay.classList.add('open');
      textEl.focus();
    }
    function close(){ overlay.classList.remove('open'); }

    overlay.querySelector('.mr-jr-close').addEventListener('click', close);
    overlay.querySelector('.mr-jr-cancel').addEventListener('click', close);
    overlay.addEventListener('click', e => { if (e.target === overlay) close(); });

    saveEl.addEventListener('click', async () => {
      const sb = deps.sb, entryId = deps.getEntryId && deps.getEntryId();
      if (!entryId){ statusEl.style.color = '#E8478B'; statusEl.textContent = 'no entry selected'; return; }
      saveEl.disabled = true; saveEl.textContent = 'saving…';
      const trimmed = textEl.value.trim();
      const messages = trimmed.length
        ? [{ id: crypto.randomUUID(), text: trimmed, image_url: null, created_at: new Date().toISOString() }]
        : [];
      try {
        const { error } = await sb.from(table)
          .update({ journal_messages: messages })
          .eq('id', entryId);
        if (error) throw error;
        close();
        status('notes saved ✓', '#6ab86a');
        deps.onChange && deps.onChange();
      } catch (err) {
        console.error('[matrix-journal-editor] journal save failed:', err);
        statusEl.style.color = '#E8478B';
        statusEl.textContent = 'couldn’t save notes — try again';
        saveEl.disabled = false; saveEl.textContent = 'save notes';
      }
    });

    function destroy(){ overlay.remove(); }
    return { open, close, destroy };
  }

  window.MatrixJournalEditor = { createEditor };
})();
