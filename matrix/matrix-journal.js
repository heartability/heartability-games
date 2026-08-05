/* ══════════════════════════════════════════════════════════════
   matrix-journal.js — shared chat-style journal panel used by the
   on-canvas notes toolbar button in dream/daily/cosmic matrix.
   Replaces the three near-identical copies of buildJournalPanel/
   loadJournalEntries/sendJournalMessage/etc. that used to live in
   each game file. Exposes one global, mirroring matrix-inventory.js:
     window.MatrixJournal.createPanel(deps)

   Each row (one per entry/transit) is addressed differently per
   host page — dream/daily key on a client-minted `id`, cosmic keys
   on (map_id, transit_id) — so identity is entirely deps-driven via
   identityColumns/buildUpsertBase rather than hardcoded here.
   ══════════════════════════════════════════════════════════════ */
(function () {

  function esc(s) { return (s || '').toString().replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c])); }

  function ensureStyles() {
    if (document.getElementById('matrix-journal-styles')) return;
    const style = document.createElement('style');
    style.id = 'matrix-journal-styles';
    style.textContent = `
.jrc-panel { padding:8px; overflow:hidden; justify-content:center; align-items:center; }
.jrc-window {
  width:100%; max-width:640px; height:100%; max-height:600px;
  background:#dfe2ef; border:2px solid var(--blue,#6e83d3);
  display:flex; flex-direction:column; overflow:hidden;
}
.jrc-messages {
  flex:1; overflow-y:auto; padding:14px 16px;
  display:flex; flex-direction:column; gap:9px; scroll-behavior:smooth;
}
.jrc-msg-wrap { display:flex; align-items:flex-start; gap:8px; }
.jrc-msg-wrap.right { flex-direction:row-reverse; align-self:flex-end; }
.jrc-msg-wrap.left  { flex-direction:row; align-self:flex-start; }
.jrc-avatar { flex-shrink:0; width:52px; height:52px; border-radius:50%; overflow:hidden; position:relative; border:1.5px solid #ccc; background:#e5e8f5; }
.jrc-avatar img { position:absolute; inset:0; width:100%; height:100%; object-fit:cover; }
.jrc-msg { display:flex; flex-direction:column; gap:3px; max-width:72%; }
.jrc-msg-wrap.right .jrc-msg { align-items:flex-end; }
.jrc-msg-wrap.left  .jrc-msg { align-items:flex-start; }
.jrc-bubble {
  padding:11px 16px; font-family:var(--font-hand); font-size:clamp(16px,1.6vw,22px);
  line-height:1.5; word-break:break-word; user-select:text;
}
.jrc-msg-wrap.right .jrc-bubble { background:var(--blue); color:#fff; border:1.5px solid #4a5bc4; }
.jrc-msg-wrap.left  .jrc-bubble { background:#fff; color:#222; border:1.5px solid #ccc; }
.jrc-bubble img { display:block; width:210px; max-width:100%; margin-bottom:6px; object-fit:cover; border:3px solid rgba(255,255,255,.6); }
.jrc-msg-wrap.left .jrc-bubble img { border-color:#ccc; }
.jrc-meta { font-size:clamp(13px,1vw,15px); color:#aaa; font-family:var(--font-hand); padding:0 4px; }
.jrc-empty {
  margin:auto; text-align:center; color:#7a86bb; font-style:italic;
  font-size:clamp(15px,1.4vw,18px); line-height:1.6; max-width:84%; padding:24px 0;
}
.jrc-date-divider { display:flex; align-items:center; gap:10px; padding:2px 0; align-self:stretch; }
.jrc-date-divider span { font-size:14px; color:#bbb; font-family:var(--font-hand); white-space:nowrap; }
.jrc-date-divider .divider-location { font-size:15px; color:#7a86bb; font-family:var(--font-hand); white-space:nowrap; }
.jrc-date-divider::before, .jrc-date-divider::after { content:''; flex:1; height:1px; background:#ddd; }
.jrc-input-area {
  flex-shrink:0; border-top:2px solid #ccc; padding:10px 14px;
  display:flex; flex-direction:column; gap:7px; background:#cdd3ec;
}
.jrc-img-chip { position:relative; width:70px; display:none; }
.jrc-img-chip.has-img { display:block; }
.jrc-img-chip img { width:100%; border:1.5px solid var(--blue); display:block; object-fit:cover; aspect-ratio:1; }
.jrc-img-x {
  position:absolute; top:-7px; right:-7px; width:18px; height:18px; padding:0; line-height:1;
  background:#fff; border:1.5px solid #ccc; border-radius:50%; cursor:pointer; font-size:12px; color:#888;
  display:flex; align-items:center; justify-content:center;
}
.jrc-img-x:hover { color:#E8478B; border-color:#E8478B; }
.jrc-msg-row { display:flex; gap:8px; align-items:stretch; }
.jrc-msg-input {
  flex:1; font-family:var(--font-hand); font-size:clamp(14px,1.3vw,17px); color:#222;
  background:#fff; border:1.5px solid var(--blue); padding:8px 11px; outline:none; resize:none;
  height:58px; line-height:1.5;
}
.jrc-msg-input:focus { border-color:var(--blue); }
.jrc-btn-stack { flex-shrink:0; display:flex; flex-direction:column; gap:6px; width:58px; }
.jrc-plus-btn {
  flex:1; background:rgba(255,255,255,.72); border:2px solid var(--blue); box-shadow:2px 2px 0 #3a4aaa;
  font-family:var(--font-game); font-size:23px; color:var(--blue); cursor:pointer; line-height:1; padding:0; transition:all .05s;
}
.jrc-plus-btn:hover  { background:var(--blue); color:#fff; }
.jrc-plus-btn:active { box-shadow:none; transform:translate(2px,2px); }
.jrc-send-btn {
  flex:1; background:var(--blue); border:2px solid #4a5bc4; box-shadow:2px 2px 0 #3a4aaa;
  font-family:var(--font-hand); font-size:clamp(14px,1.3vw,17px); color:#fff; cursor:pointer; padding:0; transition:all .05s;
}
.jrc-send-btn:hover  { background:#4a5bc4; }
.jrc-send-btn:active { box-shadow:none; transform:translate(2px,2px); }
.jrc-send-btn:disabled { opacity:.5; cursor:not-allowed; transform:none; }
.jrc-status { font-size:clamp(10px,.9vw,13px); color:#999; font-family:var(--font-hand); min-height:13px; }
.jrc-status.ok  { color:#6ab86a; }
.jrc-status.err { color:#E8478B; }
`;
    document.head.appendChild(style);
  }

  function createPanel(deps) {
    const sb = deps.sb;
    const state = { entries: [], pendingImage: null };

    function $(id) { return document.getElementById(id); }

    function panelHtml() {
      const photoChip = deps.allowPhoto ? `
        <div class="jrc-img-chip" id="jrc-img-chip">
          <img id="jrc-img-preview" src="" alt="attached">
          <button type="button" class="jrc-img-x" id="jrc-img-x" title="remove photo">&#x2715;</button>
        </div>` : '';
      const plusBtn = deps.allowPhoto
        ? `<button type="button" class="jrc-plus-btn" id="jrc-plus" title="add a photo">+</button>` : '';
      const fileInput = deps.allowPhoto
        ? `<input type="file" id="jr-file" accept="image/*" style="display:none">` : '';
      return `<div class="step-panel jrc-panel">
        <div class="jrc-window">
          <div class="jrc-messages" id="jrc-messages">
            <div class="jrc-empty" id="jrc-empty">${esc(deps.emptyText || 'you have no messages')}</div>
          </div>
          <div class="jrc-input-area">
            ${photoChip}
            <div class="jrc-msg-row">
              <textarea class="jrc-msg-input" id="jrc-msg" placeholder="${esc(deps.placeholder || '')}" maxlength="4000"></textarea>
              <div class="jrc-btn-stack">
                ${plusBtn}
                <button type="button" class="jrc-send-btn" id="jrc-send">send</button>
              </div>
            </div>
            ${fileInput}
            <div class="jrc-status" id="jrc-status"></div>
          </div>
        </div>
      </div>`;
    }

    function jrcTime(iso) { return new Date(iso || Date.now()).toLocaleTimeString('en-US', { hour:'numeric', minute:'2-digit' }); }
    function jrcDay(iso) { return new Date(iso || Date.now()).toLocaleDateString('en-US', { month:'long', day:'numeric', year:'numeric' }); }

    function jrcRowMessages(row) {
      const arr = Array.isArray(row?.journal_messages) ? row.journal_messages : [];
      return arr.slice().sort((a, b) => new Date(a.created_at || 0) - new Date(b.created_at || 0));
    }

    function buildAvatar(charData) {
      if (!charData) return '<div class="jrc-avatar"></div>';
      const assets = deps.charAssets || {};
      const layers = ['body', 'eyes', 'mouth', 'hair'];
      const imgs = layers.map(k => charData[k] && assets[charData[k]]
        ? `<img src="${assets[charData[k]]}" alt="">`
        : '').join('');
      return `<div class="jrc-avatar">${imgs}</div>`;
    }

    function renderJournalMessage(msg, side, charData) {
      const wrap = document.createElement('div');
      wrap.className = 'jrc-msg-wrap ' + (side === 'right' ? 'right' : 'left');
      if (msg.id) wrap.dataset.id = msg.id;
      const img = msg.image_url ? `<img src="${esc(msg.image_url)}" alt="" onerror="this.style.display='none'">` : '';
      const txt = msg.text ? `<span class="jrc-bubble-txt">${esc(msg.text)}</span>` : '';
      const avatar = buildAvatar(charData);
      wrap.innerHTML = `${avatar}<div class="jrc-msg"><div class="jrc-bubble">${img}${txt}</div><div class="jrc-meta">${jrcTime(msg.created_at)}</div></div>`;
      return wrap;
    }

    function jrcScrollBottom() {
      const c = $('jrc-messages');
      if (c) c.scrollTop = c.scrollHeight;
    }

    function jrcMaybeDivider(container, dayLabel, location) {
      const last = [...container.querySelectorAll('.jrc-date-divider span')].pop();
      if (last && last.textContent === dayLabel) return;
      const div = document.createElement('div');
      div.className = 'jrc-date-divider';
      const locHtml = location ? `<span class="divider-location">${esc(location)}</span> · ` : '';
      div.innerHTML = `${locHtml}<span>${dayLabel}</span>`;
      container.appendChild(div);
    }

    function showJournalStatus(msg, ok) {
      const el = $('jrc-status');
      if (!el) return;
      el.textContent = msg;
      el.classList.remove('ok', 'err');
      el.classList.add(ok ? 'ok' : 'err');
      clearTimeout(el._t);
      el._t = setTimeout(() => { el.textContent = ''; el.classList.remove('ok', 'err'); }, 2600);
    }

    async function loadEntries() {
      state.entries = [];
      state.pendingImage = null;
      if (!(deps.getCurrentUser() && deps.isReady())) return;

      let rows = [];
      try { rows = await deps.loadHistoryRows(); } catch (e) { console.error('[journal load]', e); }
      rows = rows.filter(r => deps.rowMatchesActive(r) || jrcRowMessages(r).length);
      state.entries = rows;

      const container = $('jrc-messages');
      const empty = $('jrc-empty');
      if (!container) return;
      container.querySelectorAll('.jrc-msg-wrap, .jrc-date-divider').forEach(e => e.remove());

      let anyMsg = false;
      rows.forEach((row, i) => {
        const side = deps.sideForRow(row, i);
        const charData = deps.charDataForRow(row);
        const location = deps.locationLabelForRow(row);
        jrcRowMessages(row).forEach(msg => {
          jrcMaybeDivider(container, jrcDay(msg.created_at || row.created_at || row.updated_at), location);
          container.appendChild(renderJournalMessage(msg, side, charData));
          anyMsg = true;
        });
      });
      if (empty) empty.style.display = anyMsg ? 'none' : 'block';
      jrcScrollBottom();
    }

    function onImagePicked(e) {
      const file = e.target.files && e.target.files[0];
      if (!file || !file.type.startsWith('image/')) return;
      const reader = new FileReader();
      reader.onload = ev => {
        state.pendingImage = { file, base64: ev.target.result };
        $('jrc-img-preview').src = ev.target.result;
        $('jrc-img-chip').classList.add('has-img');
      };
      reader.readAsDataURL(file);
    }

    function clearPendingImage() {
      state.pendingImage = null;
      const chip = $('jrc-img-chip');
      if (chip) { chip.classList.remove('has-img'); $('jrc-img-preview').src = ''; }
      const f = $('jr-file');
      if (f) f.value = '';
    }

    async function readCurrentRow() {
      const base = deps.buildUpsertBase();
      let q = sb.from(deps.table).select(deps.allowPhoto ? 'journal_messages,matrix_images' : 'journal_messages');
      deps.identityColumns.forEach(col => { q = q.eq(col, base[col]); });
      try {
        const { data } = await q.maybeSingle();
        return data || {};
      } catch (e) { return {}; }
    }

    // Append one message to the active row. Returns true on success.
    async function sendMessage() {
      const msgEl = $('jrc-msg');
      const sendBtn = $('jrc-send');
      const text = (msgEl?.value || '').trim();
      if (!text && !state.pendingImage) return false;
      if (!(deps.getCurrentUser() && deps.isReady())) { HGModal.alert('oops', 'not signed in'); return false; }

      if (sendBtn) sendBtn.disabled = true;

      let imageUrl = null;
      if (deps.allowPhoto && state.pendingImage) {
        try {
          const file = state.pendingImage.file;
          const ext = (file.name.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '') || 'jpg';
          const path = deps.buildPhotoPath(file, ext);
          const { error: upErr } = await sb.storage.from(deps.photoBucket).upload(path, file, { contentType: file.type, upsert: false });
          if (upErr) throw upErr;
          const { data: pub } = sb.storage.from(deps.photoBucket).getPublicUrl(path);
          imageUrl = pub?.publicUrl || null;
        } catch (err) {
          console.error('[journal image]', err);
          HGModal.alert('oops', "couldn't attach photo — try again");
          if (sendBtn) sendBtn.disabled = false;
          return false;
        }
      }

      const message = { id: crypto.randomUUID(), text, ...(deps.allowPhoto ? { image_url: imageUrl } : {}), created_at: new Date().toISOString() };

      const currentRow = await readCurrentRow();
      const messages = (Array.isArray(currentRow.journal_messages) ? currentRow.journal_messages : []).concat([message]);
      const fields = { journal_messages: messages, updated_at: new Date().toISOString() };
      if (deps.allowPhoto && imageUrl) {
        const imgs = Array.isArray(currentRow.matrix_images) ? currentRow.matrix_images : [];
        fields.matrix_images = imgs.concat([{ url: imageUrl, source: 'journal' }]);
      }

      try {
        const { error } = await sb.from(deps.table)
          .upsert({ ...deps.buildUpsertBase(), ...fields }, { onConflict: deps.identityColumns.join(',') });
        if (error) throw error;
      } catch (err) {
        console.error('[journal send]', err);
        HGModal.alert('oops', 'something went wrong — try again');
        if (sendBtn) sendBtn.disabled = false;
        return false;
      }

      const container = $('jrc-messages');
      const empty = $('jrc-empty');
      if (empty) empty.style.display = 'none';
      const idx = state.entries.findIndex(r => deps.rowMatchesActive(r));
      const activeRow = idx >= 0 ? state.entries[idx] : {};
      const side = deps.sideForRow(activeRow, idx >= 0 ? idx : 0);
      const charData = deps.charDataForRow(activeRow);
      const location = deps.locationLabelForRow(activeRow);
      jrcMaybeDivider(container, jrcDay(message.created_at), location);
      container.appendChild(renderJournalMessage(message, side, charData));

      if (msgEl) msgEl.value = '';
      if (deps.allowPhoto) clearPendingImage();
      if (sendBtn) sendBtn.disabled = false;
      showJournalStatus('saved ✓', true);
      jrcScrollBottom();
      if (msgEl) msgEl.focus();
      return true;
    }

    function enter() {
      ensureStyles();
      state.entries = [];
      state.pendingImage = null;
      const sendBtn = $('jrc-send');
      if (sendBtn) sendBtn.addEventListener('click', sendMessage);
      const msgEl = $('jrc-msg');
      // Plain Enter = newline (journaling, not quick chat); Cmd/Ctrl+Enter sends.
      if (msgEl) msgEl.addEventListener('keydown', e => {
        if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); sendMessage(); }
      });
      if (deps.allowPhoto) {
        const plusBtn = $('jrc-plus');
        const fileInput = $('jr-file');
        const removeBtn = $('jrc-img-x');
        if (plusBtn && fileInput) plusBtn.addEventListener('click', () => fileInput.click());
        if (fileInput) fileInput.addEventListener('change', onImagePicked);
        if (removeBtn) removeBtn.addEventListener('click', clearPendingImage);
      }
      loadEntries();
    }

    return { panelHtml, enter };
  }

  window.MatrixJournal = { createPanel };
})();
