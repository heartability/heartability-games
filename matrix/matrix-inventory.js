/* ══════════════════════════════════════════════════════════════
   matrix-inventory.js — shared "the inventory" panel used by the
   bingo → inventory → journal step in dream/daily/cosmic matrix.
   Replaces the three near-identical copies of buildLibraryPanel/
   loadLibraryEntries/renderLibraryGrid/etc. that used to live in
   each game file. Exposes one global, mirroring matrix-render.js:
     window.MatrixInventory.createPanel(deps)
   ══════════════════════════════════════════════════════════════ */
(function () {

  const CATEGORY_TYPES = {
    books:  ['book', 'essay', 'other'],
    movies: ['movie', 'tv'],
  };

  function esc(s) { return (s || '').toString().replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c])); }

  function ensureStyles() {
    if (document.getElementById('matrix-inventory-styles')) return;
    const style = document.createElement('style');
    style.id = 'matrix-inventory-styles';
    style.textContent = `
.lib-panel { padding:8px; overflow:hidden; justify-content:center; align-items:center; }
.lib-window {
  width:100%; max-width:640px; height:100%; max-height:600px;
  background:#dfe2ef; border:2px solid var(--blue,#6e83d3); display:flex; flex-direction:column; overflow:hidden; min-height:0;
}
.lib-titlebar { flex-shrink:0; background:#cdd3ec; border-bottom:2px solid #bbb; padding:10px 16px; font-family:var(--font-hand); font-size:clamp(18px,1.6vw,22px); color:#333; text-align:center; }
.lib-tabs { flex-shrink:0; display:flex; border-bottom:2px solid #bbb; }
.lib-tab-btn { flex:1; font-family:var(--font-hand); font-size:15px; color:#555; background:#cdd3ec; border:none; border-right:1px solid #bbb; padding:8px 4px; cursor:pointer; }
.lib-tab-btn:last-child { border-right:none; }
.lib-tab-btn.active { background:var(--blue,#6e83d3); color:#fff; }
.lib-body { flex:1; overflow-y:auto; padding:16px 18px; }
.inv-pane { display:none; }
.inv-pane.active { display:block; }
.lib-empty { margin:auto; text-align:center; color:#7a86bb; font-style:italic; font-size:clamp(15px,1.4vw,18px); line-height:1.6; padding:24px 0; }
.lib-grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(84px,1fr)); gap:12px; }
.lib-card { cursor:pointer; position:relative; display:flex; flex-direction:column; gap:3px; }
.lib-card img, .lib-card-noimg { width:100%; aspect-ratio:2/3; object-fit:cover; background:#ccc; border:2px solid var(--blue,#6e83d3); display:block; }
.lib-card-noimg { display:flex; align-items:center; justify-content:center; font-family:var(--font-hand); font-size:11px; color:#555; text-align:center; padding:4px; }
.lib-card-title { font-family:var(--font-hand); font-size:12px; color:#444; text-align:center; line-height:1.25; }
.lib-card.selected img, .lib-card.selected .lib-card-noimg { border-color:#2a6a3a; box-shadow:0 0 0 3px rgba(42,106,58,.35); }
.lib-check { position:absolute; top:3px; right:3px; width:18px; height:18px; border-radius:50%; background:#2a6a3a; color:#fff; font-size:12px; align-items:center; justify-content:center; display:none; }
.lib-card.selected .lib-check { display:flex; }
.lib-card-badge { font-family:var(--font-hand); font-size:10px; color:#7a86bb; text-align:center; text-transform:uppercase; letter-spacing:.3px; }
/* tools tab: square inventory-slot tiles instead of 2:3 cover art */
.lib-grid-tools { grid-template-columns:repeat(auto-fill,minmax(72px,1fr)); }
.lib-tool-slot img, .lib-tool-slot .lib-card-noimg { aspect-ratio:1/1; object-fit:contain; background:#eef0f9; padding:6px; }
.lib-tool-slot .lib-card-title { font-size:11px; }
.lib-footer { flex-shrink:0; border-top:2px solid #ccc; padding:10px 14px; display:flex; justify-content:center; background:#cdd3ec; }
.lib-add-btn {
  padding:8px 18px; background:var(--blue,#6e83d3); border:2px solid #4a5bc4; box-shadow:2px 2px 0 #3a4aaa;
  font-family:var(--font-hand); font-size:15px; color:#fff; cursor:pointer;
}
.lib-add-btn:hover { background:#4a5bc4; }
.lib-add-btn:active { box-shadow:none; transform:translate(2px,2px); }
.lib-footer-msg { font-family:var(--font-hand); font-size:14px; color:#7a86bb; font-style:italic; text-align:center; }
.lib-overlay { position:fixed; inset:0; background:rgba(0,0,0,.55); z-index:900; display:none; align-items:center; justify-content:center; padding:18px; overflow-y:auto; }
.lib-overlay.open { display:flex; }
.lib-overlay-window {
  width:min(94vw,640px); height:min(86dvh,700px); background:#dfe2ef; border:2px solid var(--blue,#6e83d3);
  display:flex; flex-direction:column; overflow:hidden; flex-shrink:0; min-height:0;
}
.lib-overlay-titlebar { flex-shrink:0; position:sticky; top:0; background:#cdd3ec; border-bottom:2px solid #bbb; padding:8px 14px; display:flex; align-items:center; justify-content:space-between; font-family:var(--font-hand); font-size:16px; color:#333; z-index:1; }
/* iOS Safari sizes vh against the toolbar-hidden viewport, so a fixed
   full-screen overlay centered with plain vh can render its titlebar
   (and the only close control) above the visible area, behind the room
   nav, with no way to scroll back to it. dvh + a scrollable backdrop +
   a sticky titlebar keep the close (x) reachable no matter what. */
@media (max-width:768px) {
  .lib-overlay { align-items:flex-start; padding-top:calc(44px + 14px); }
}
.lib-overlay-close { cursor:pointer; font-size:22px; color:#aaa; padding:2px 6px; }
.lib-overlay-close:hover { color:#E8478B; }
.lib-overlay iframe { flex:1; border:none; width:100%; background:#6e83d3; }
`;
    document.head.appendChild(style);
  }

  function createPanel(deps) {
    const sb = deps.sb;

    let mediaSubmissions = [];
    let mediaSaves = [];
    let toolSaves = [];
    let selectedMediaIds = new Set(); // media_submissions.id / media_saves.id, shared by books+movies
    let selectedToolSaveIds = new Set(); // tool_saves.id
    let activeTab = 'books';

    function panelHtml() {
      return `<div class="step-panel lib-panel">
        <div class="lib-window">
          <div class="lib-titlebar">the inventory</div>
          <div class="lib-tabs">
            <button type="button" class="lib-tab-btn active" data-tab="books">books</button>
            <button type="button" class="lib-tab-btn" data-tab="movies">movies</button>
            <button type="button" class="lib-tab-btn" data-tab="tools">tools</button>
          </div>
          <div class="lib-body">
            <div class="inv-pane active" data-pane="books">
              <div class="lib-empty" id="inv-empty-books" style="display:none;">you haven't added any books yet</div>
              <div class="lib-grid" id="inv-grid-books"></div>
            </div>
            <div class="inv-pane" data-pane="movies">
              <div class="lib-empty" id="inv-empty-movies" style="display:none;">you haven't added any movies yet</div>
              <div class="lib-grid" id="inv-grid-movies"></div>
            </div>
            <div class="inv-pane" data-pane="tools">
              <div class="lib-empty" id="inv-empty-tools" style="display:none;">your tool collection is empty</div>
              <div class="lib-grid lib-grid-tools" id="inv-grid-tools"></div>
            </div>
          </div>
          <div class="lib-footer">
            <button type="button" class="lib-add-btn" id="inv-footer-btn">+ add an entry</button>
            <div class="lib-footer-msg" id="inv-footer-msg" style="display:none;">explore the castle to find more items</div>
          </div>
        </div>
        <div class="lib-overlay" id="inv-media-overlay">
          <div class="lib-overlay-window">
            <div class="lib-overlay-titlebar"><span>add to your library</span><span class="lib-overlay-close" id="inv-media-close">&#x2715;</span></div>
            <iframe id="inv-media-iframe" src="about:blank"></iframe>
          </div>
        </div>
      </div>`;
    }

    function $(id) { return document.getElementById(id); }

    function mediaItems() {
      return [
        ...mediaSubmissions.map(r => ({ id: r.id, title: r.media?.title || 'untitled', cover: r.cover_url_override || r.media?.cover_url, badge: 'reviewed', type: r.media?.media_type })),
        ...mediaSaves.map(r => ({ id: r.id, title: r.media?.title || 'untitled', cover: r.media?.cover_url, badge: r.status === 'done' ? 'done reading' : 'to be read', type: r.media?.media_type })),
      ];
    }

    function renderMediaPane(tab) {
      const grid = $('inv-grid-' + tab), emptyEl = $('inv-empty-' + tab);
      if (!grid) return;
      const items = mediaItems().filter(i => CATEGORY_TYPES[tab].includes(i.type));
      emptyEl.style.display = items.length ? 'none' : 'block';
      grid.innerHTML = items.map(item => {
        const selected = selectedMediaIds.has(item.id);
        return `<div class="lib-card${selected ? ' selected' : ''}" data-id="${item.id}">
          <span class="lib-check">&#x2713;</span>
          ${item.cover ? `<img src="${esc(item.cover)}" alt="">` : '<div class="lib-card-noimg"></div>'}
          <div class="lib-card-title">${esc(item.title)}</div>
          <div class="lib-card-badge">${esc(item.badge)}</div>
        </div>`;
      }).join('');
      grid.querySelectorAll('.lib-card').forEach(card => {
        card.addEventListener('click', () => {
          const id = card.dataset.id;
          if (selectedMediaIds.has(id)) selectedMediaIds.delete(id); else selectedMediaIds.add(id);
          card.classList.toggle('selected', selectedMediaIds.has(id));
        });
      });
    }

    function renderToolsPane() {
      const grid = $('inv-grid-tools'), emptyEl = $('inv-empty-tools');
      if (!grid) return;
      emptyEl.style.display = toolSaves.length ? 'none' : 'block';
      grid.innerHTML = toolSaves.map(row => {
        const tool = row.tools || {};
        const selected = selectedToolSaveIds.has(row.id);
        return `<div class="lib-card lib-tool-slot${selected ? ' selected' : ''}" data-id="${row.id}">
          <span class="lib-check">&#x2713;</span>
          ${tool.icon_url ? `<img src="${esc(tool.icon_url)}" alt="">` : '<div class="lib-card-noimg">?</div>'}
          <div class="lib-card-title">${esc(tool.title || 'untitled')}</div>
        </div>`;
      }).join('');
      grid.querySelectorAll('.lib-card').forEach(card => {
        card.addEventListener('click', () => {
          const id = card.dataset.id;
          if (selectedToolSaveIds.has(id)) selectedToolSaveIds.delete(id); else selectedToolSaveIds.add(id);
          card.classList.toggle('selected', selectedToolSaveIds.has(id));
        });
      });
    }

    async function loadMedia() {
      const user = deps.getCurrentUser();
      const [subRes, saveRes] = await Promise.all([
        sb.from('media_submissions')
          .select('id, media_id, cover_url_override, media(title, cover_url, media_type)')
          .eq('submitted_by', user.id).order('created_at', { ascending: false }),
        sb.from('media_saves')
          .select('id, media_id, status, media(title, cover_url, media_type)')
          .eq('user_id', user.id).order('created_at', { ascending: false }),
      ]);
      if (subRes.error) console.error('[inventory] submissions fetch failed:', subRes.error);
      if (saveRes.error) console.error('[inventory] saves fetch failed:', saveRes.error);
      mediaSubmissions = subRes.data || [];
      mediaSaves = saveRes.data || [];
      renderMediaPane('books');
      renderMediaPane('movies');
    }

    async function loadToolSaves() {
      const user = deps.getCurrentUser();
      const { data, error } = await sb.from('tool_saves')
        .select('id, tool_id, tools(*)')
        .eq('user_id', user.id).order('created_at', { ascending: false });
      if (error) { console.error('[inventory] tool_saves fetch failed:', error); toolSaves = []; }
      else toolSaves = data || [];
      renderToolsPane();
    }

    // ── media add-entry overlay ──
    function openMediaAddEntry() {
      $('inv-media-iframe').src = '../matrix/media.html?embed=1';
      $('inv-media-overlay').classList.add('open');
    }
    function closeMediaAddEntry() {
      $('inv-media-overlay').classList.remove('open');
      $('inv-media-iframe').src = 'about:blank';
    }

    function updateFooterButton() {
      const btn = $('inv-footer-btn'), msg = $('inv-footer-msg');
      if (!btn || !msg) return;
      if (activeTab === 'tools') {
        btn.style.display = 'none';
        msg.style.display = 'block';
      } else {
        btn.style.display = '';
        msg.style.display = 'none';
        btn.textContent = '+ add an entry';
        btn.onclick = openMediaAddEntry;
      }
    }

    function switchTab(tab) {
      activeTab = tab;
      document.querySelectorAll('.lib-tab-btn').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
      document.querySelectorAll('.inv-pane').forEach(p => p.classList.toggle('active', p.dataset.pane === tab));
      updateFooterButton();
    }

    function enter() {
      ensureStyles();
      selectedMediaIds = new Set();
      selectedToolSaveIds = new Set();
      activeTab = 'books';
      document.querySelectorAll('.lib-tab-btn').forEach(btn => {
        btn.addEventListener('click', () => switchTab(btn.dataset.tab));
      });
      $('inv-media-close').addEventListener('click', closeMediaAddEntry);
      updateFooterButton();
      loadMedia();
      loadToolSaves();
    }

    // Returns {ok:true} on success (and advances via deps.onContinue), or
    // {ok:false, error} on failure — caller owns its own save-button UI/reset.
    async function save() {
      const reviewIds = mediaSubmissions.filter(r => selectedMediaIds.has(r.id)).map(r => r.id);
      const saveIds   = mediaSaves.filter(r => selectedMediaIds.has(r.id)).map(r => r.id);
      const toolIds   = toolSaves.filter(r => selectedToolSaveIds.has(r.id)).map(r => r.tool_id);
      try {
        await deps.persist({ library_entry_ids: reviewIds, library_save_ids: saveIds, library_tool_ids: toolIds });
      } catch (error) {
        console.error('[inventory] save failed:', error);
        return { ok: false, error };
      }
      if (deps.onContinue) deps.onContinue();
      return { ok: true };
    }

    // Called by the host game's own postMessage listener when media.html
    // (loaded in the add-entry overlay) posts { type: 'media_entry_saved' }.
    function onMediaSaved() {
      closeMediaAddEntry();
      loadMedia();
    }

    return { panelHtml, enter, save, onMediaSaved };
  }

  window.MatrixInventory = { createPanel };
})();
