/* ══════════════════════════════════════════════════════════════
   matrix-customize.js — shared "customize" modal: tabbed photo /
   sticker / text tools, styled like matrix-inventory.js's window
   (one shell, tabs across the top). Replaces the old separate
   add-photo / add-sticker / add-text overlays that used to live
   directly inside matrix-render.js's createMatrixEditor(), and is
   also used standalone by rooms/bed.html to pin items to the wall.

   Depends on window.MatrixRender being loaded first — reads its
   PHOTO_FRAMES/PHOTO_FRAME_FILE/PHOTO_FRAME_BASE/NO_FRAME_KEY/
   photoFrameMaskStyle/photoMatteStyle/STATIONERY_ITEMS/
   STATIONERY_FILE/STATIONERY_BASE/STATIONERY_BOX rather than
   duplicating them — those stay in matrix-render.js because it also
   needs them to render items that are already placed.

   Exposes one global:  window.MatrixCustomize.createPanel(deps)
   deps = {
     showAlbum: bool,                 // photo tab: existing-photo album + upload, vs. upload-only
     loadAlbum(): Promise<items>,     // only when showAlbum — items are opaque, passed back to onPickAlbumPhoto
     albumThumb(item): {url,frame,imgPosX,imgPosY,imgScale,label}, // normalizes one album item for display
     onPickAlbumPhoto(item): Promise, // called with the raw item from loadAlbum()
     onUploadPhoto({file,dataUrl,frame,imgScale,imgPosX,imgPosY,imgRot}): Promise,
     onAddSticker(url): Promise,
     onAddText({text,stationery,scale}): Promise,
     addLabel: string,                // button text on the photo tab's "add" action, default 'add to matrix' (text tab's button is always 'add')
     status(msg, color): void,        // optional external status line
   }
   Returns { open(tab), close(), destroy() }.
   ══════════════════════════════════════════════════════════════ */
(function () {

  function esc(s) { return (s || '').toString().replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c])); }

  // ── background removal (client-side, via @imgly/background-removal WASM) ──
  const BG_REMOVAL_CDN = 'https://esm.sh/@imgly/background-removal@1.7.0';
  let _bgRemovalModulePromise = null;
  function loadBackgroundRemoval(){
    if (!_bgRemovalModulePromise) _bgRemovalModulePromise = import(BG_REMOVAL_CDN);
    return _bgRemovalModulePromise;
  }

  // Sticker picker categories — static lists of filenames living in
  // assets/elements/stickers/<category>/ (no server-side directory listing on
  // a static site, so the picker hardcodes them).
  const STICKER_BASE = '../assets/elements/stickers/';
  const STICKER_CATEGORIES = {
    'affirmations': { label: 'affirmations', files: [
      'affirmation-banner-let-it-come-go.png','affirmation-license-plate-meant-for-you.png',
      'affirmation-sticker-taking-time.png','affirmation-ticket-beautiful-life.png','affirmation-ticket-good-things-coming.png',
    ]},
    'angel-numbers': { label: 'angel numbers', files: [
      'angel-number-111-intuition.png','angel-number-222-alignment.png','angel-number-333-support.png',
      'angel-number-444-protection.png','angel-number-555-change.png','angel-number-777-luck.png',
      'angel-number-888-balance.png','angel-number-999-release.png',
    ]},
    'ephemera': { label: 'ephemera', files: [
      'ephemera-butterfly-pink-green.png','ephemera-butterfly-stamp-korea.png','ephemera-butterfly-white-lace.png',
      'ephemera-cloud.png','ephemera-disco-ball.png','ephemera-fish-bottle-green.png','ephemera-key-head-profile.png',
      'ephemera-lace-heart-doily-blue.png','ephemera-locket.png','ephemera-lovers-eye-pearl-brooch.png',
      'ephemera-moon-woman-vintage.png','ephemera-museum-of-everything-ive-loved.png','ephemera-spiral-silver.png',
      'ephemera-star-embroidered-silver.png','ephemera-watercolor-flower-pink.png','ephemera-wax-seal-rose.png',
    ]},
    'fruit-stickers': { label: 'fruit stickers', files: [
      'fruit-sticker-appealing-bananas.png','fruit-sticker-banana-fruit-love-heart.png','fruit-sticker-berry-good-strawberry.png',
      'fruit-sticker-chill-peel-asian-pear.png','fruit-sticker-eat-more-veggies.png','fruit-sticker-eat-squeeze-me-lemon.png',
      'fruit-sticker-extra-fruity.png','fruit-sticker-go-go-mango.png','fruit-sticker-juicy-plantains.png',
      'fruit-sticker-lime-crush.png','fruit-sticker-patience-is-sweet-peach.png','fruit-sticker-pear-fect.png',
      'fruit-sticker-ripe-n-juicy.png','fruit-sticker-take-me-to-lunch-chiquita.png','fruit-sticker-that-a-way-groundhog.png',
      'fruit-sticker-the-best-banana-ecuador.png','fruit-sticker-thumping-good-watermelon-bunny.png',
    ]},
    'fruits': { label: 'fruits', files: [
      'fruit-circle-blood-orange.png','fruit-circle-blueberry.png','fruit-circle-feijoa.png','fruit-circle-guava.png',
      'fruit-circle-kiwi.png','fruit-circle-lime.png','fruit-circle-orange.png','fruit-circle-papaya.png',
      'fruit-circle-peach.png','fruit-circle-pineapple.png','fruit-circle-pomegranate.png','fruit-circle-watermelon.png',
      'fruit-glitter-apple.png','fruit-glitter-cherries.png','fruit-glitter-grapes.png','fruit-glitter-lemon.png',
      'fruit-glitter-strawberry.png','fruit-glitter-watermelon-slice.png',
    ]},
    'gems': { label: 'gems', files: [
      'gem-baguette-blue.png','gem-cabochon-oval-blue.png','gem-cluster-cloud-emerald.png','gem-cluster-crescent-moon-blue.png',
      'gem-cluster-flower-green.png','gem-cluster-flower-pink.png','gem-emerald-cut-pink.png','gem-heart-fuchsia.png',
      'gem-oval-green.png','gem-pear-mint.png','gem-pear-teal.png','gem-rough-blue-green.png','gem-rough-green.png',
      'gem-round-rose.png','gem-sparkle-purple.png','gem-star-gold.png','gem-star-teal.png','gem-trillion-red.png',
    ]},
    'stars': { label: 'stars', files: [
      'star-foil-blue.png','star-foil-gold.png','star-foil-lime.png','star-foil-pink.png','star-foil-rainbow.png',
      'star-foil-red.png','star-foil-silver.png','star-foil-teal.png','star-glitter-blue.png','star-glitter-green.png',
      'star-glitter-hot-pink.png','star-glitter-light-blue.png','star-glitter-navy.png','star-glitter-olive.png',
      'star-glitter-orange.png','star-glitter-purple-pink.png','star-paint-blue.png',
    ]},
  };

  function ensureStyles() {
    if (document.getElementById('matrix-customize-styles')) return;
    const style = document.createElement('style');
    style.id = 'matrix-customize-styles';
    style.textContent = `
.cst-overlay {
  position:fixed; inset:0; z-index:600;
  background:rgba(40,32,24,.45);
  display:none; align-items:center; justify-content:center; padding:18px;
}
.cst-overlay.open { display:flex; }
.cst-shell {
  width:min(94vw,640px); height:min(86dvh,700px); display:flex; flex-direction:column; overflow:hidden;
  background:#dfe2ef;
  box-shadow:0 0 0 4px var(--blue,#6e83d3), 4px 8px 28px rgba(0,0,0,.35);
  font-family:var(--font-hand,"ZoesHandwriting",cursive);
}
.cst-head {
  flex-shrink:0; min-height:44px; background:#cdd3ec; border-bottom:2px solid var(--blue,#6e83d3);
  display:flex; align-items:center; justify-content:space-between; gap:10px; padding:8px 16px;
}
.cst-title { font-family:var(--font-hand,"ZoesHandwriting",cursive); font-size:clamp(20px,2.2vw,23px); color:#333; }
.cst-close { font-size:22px; color:#999; cursor:pointer; line-height:1; border:none; background:none; padding:4px; }
.cst-close:hover { color:var(--blue,#6e83d3); }
.cst-tabs { flex-shrink:0; display:flex; border-bottom:2px solid #bbb; }
.cst-tab-btn { flex:1; font-family:var(--font-hand,"ZoesHandwriting",cursive); font-size:15px; color:#555; background:#cdd3ec; border:none; border-right:1px solid #bbb; padding:8px 4px; cursor:pointer; }
.cst-tab-btn:last-child { border-right:none; }
.cst-tab-btn.active { background:var(--blue,#6e83d3); color:#fff; }
.cst-body { flex:1; overflow-y:auto; padding:18px 20px; min-height:0; }
.cst-pane { display:none; }
.cst-pane.active { display:block; }
.cst-label { font-size:14px; color:#7a86bb; letter-spacing:.4px; margin-bottom:6px; }
.cst-status { font-size:14px; min-height:18px; margin-bottom:8px; color:#7a86bb; }
.cst-add-btn {
  width:100%; padding:12px 18px; background:var(--blue,#6e83d3);
  border:2px solid #4a5bc4; box-shadow:2px 2px 0 #3a4aaa;
  font-family:var(--font-hand,"ZoesHandwriting",cursive); font-size:17px; color:#fff; cursor:pointer; transition:all .05s;
}
.cst-add-btn:hover  { background:#4a5bc4; }
.cst-add-btn:active { box-shadow:none; transform:translate(2px,2px); }
.cst-add-btn:disabled { opacity:.4; cursor:not-allowed; transform:none !important; }

/* photo tab: existing-photo album (bedroom context only) */
.cst-album-grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(84px,1fr)); gap:12px; margin-bottom:14px; }
.cst-album-item { cursor:pointer; border:none; background:none; padding:0; display:flex; flex-direction:column; align-items:center; gap:4px; }
.cst-album-thumb { position:relative; width:100%; aspect-ratio:1; }
.cst-album-thumb img.cst-plain { width:100%; height:100%; object-fit:contain; }
.cst-album-thumb .cst-inner { position:relative; width:100%; height:100%; background:#fff; overflow:hidden; box-shadow:1px 2px 4px rgba(0,0,0,.18); }
.cst-album-thumb .cst-inner img.cst-img { position:absolute; object-fit:cover; }
.cst-album-thumb .cst-frame { position:absolute; inset:0; width:100%; height:100%; }
.cst-album-item:hover .cst-album-thumb { outline:2px solid var(--blue,#6e83d3); }
.cst-album-label { font-family:var(--font-hand,"ZoesHandwriting",cursive); font-size:12px; color:#777; text-align:center; }
.cst-album-empty { text-align:center; color:#7a86bb; font-style:italic; font-size:15px; padding:20px 0; }
.cst-upload-toggle {
  display:block; width:100%; padding:9px 14px; margin-bottom:6px; background:#fff; border:2px solid var(--blue,#6e83d3);
  font-family:var(--font-hand,"ZoesHandwriting",cursive); font-size:15px; color:var(--blue,#6e83d3); cursor:pointer; transition:all .05s;
}
.cst-upload-toggle:hover { background:#eef0f9; }
.cst-back-to-album { display:inline-block; margin-bottom:10px; font-size:14px; color:var(--blue,#6e83d3); background:none; border:none; cursor:pointer; padding:0; }
.cst-back-to-album:hover { text-decoration:underline; }

/* add-photo: drop zone + crop/pan/zoom/rotate preview */
.cst-photo-drop { display:block; cursor:pointer; }
.cst-photo-cutout {
  display:block; width:100%; margin-bottom:14px; padding:8px 14px;
  background:#fff; border:2px solid var(--blue,#6e83d3);
  font-family:var(--font-hand,"ZoesHandwriting",cursive); font-size:15px; color:var(--blue,#6e83d3);
  cursor:pointer; transition:all .05s;
}
.cst-photo-cutout:hover  { background:#eef0f9; }
.cst-photo-cutout:active { transform:translate(1px,1px); }
.cst-photo-cutout:disabled { opacity:.4; cursor:not-allowed; transform:none !important; }
.cst-photo-preview {
  position:relative; width:100%; max-width:260px; margin-left:auto; margin-right:auto;
  aspect-ratio:602/691; background:#fff;
  border:2px dashed var(--blue,#6e83d3); display:flex; align-items:center; justify-content:center;
  overflow:hidden; margin-bottom:14px; transition:border-color .12s;
}
.cst-photo-drop:hover .cst-photo-preview { border-color:var(--blue,#6e83d3); }
.cst-photo-preview-img {
  position:absolute; object-fit:cover; object-position:50% 50%; display:block;
  cursor:grab; touch-action:none;
}
.cst-photo-preview-img.plain { position:static; }
.cst-photo-preview-img:active { cursor:grabbing; }
.cst-photo-preview-frame { position:absolute; inset:0; width:100%; height:100%; pointer-events:none; }
.cst-photo-rotate, .cst-photo-stretch, .cst-photo-clear {
  position:absolute; z-index:5;
  width:26px; height:26px; padding:0; line-height:1;
  background:#fff; border:1.5px solid #ccc; border-radius:50%;
  color:#888; font-size:14px; touch-action:none;
  display:flex; align-items:center; justify-content:center; cursor:pointer;
  transition:color .12s, border-color .12s;
}
.cst-photo-rotate:hover, .cst-photo-stretch:hover { color:var(--blue,#6e83d3); border-color:var(--blue,#6e83d3); }
.cst-photo-clear:hover { color:#E8478B; border-color:#E8478B; }
.cst-photo-rotate  { top:8px; left:8px; cursor:grab; }
.cst-photo-stretch { bottom:8px; right:8px; cursor:nwse-resize; }
.cst-photo-clear   { top:8px; right:8px; }
.cst-photo-preview.no-frame {
  aspect-ratio:auto; min-height:120px; padding:12px;
  background-image:
    linear-gradient(45deg, #ddd 25%, transparent 25%, transparent 75%, #ddd 75%, #ddd),
    linear-gradient(45deg, #ddd 25%, #fff 25%, #fff 75%, #ddd 75%, #ddd);
  background-size:16px 16px; background-position:0 0, 8px 8px;
}
.cst-photo-preview-img.plain {
  width:auto; height:auto; max-width:100%; max-height:280px; object-fit:contain; cursor:default;
}
.cst-photo-hint { color:rgba(122,134,187,.7); font-style:italic; font-size:16px; }

/* frame / stationery picker grid — shared by add-photo and add-text */
.cst-frame-grid { display:grid; grid-template-columns:repeat(3,1fr); gap:8px; margin-bottom:12px; }
.cst-frame-thumb {
  position:relative; aspect-ratio:1; background:#cdd3ec; border:1.5px solid #ccc;
  padding:6px; cursor:pointer; transition:all .1s;
  display:flex; align-items:center; justify-content:center;
}
.cst-frame-thumb img { max-width:100%; max-height:100%; }
.cst-frame-thumb:hover { border-color:var(--blue,#6e83d3); background:#f0edfa; }
.cst-frame-thumb.selected { border-color:var(--blue,#6e83d3); background:var(--blue,#6e83d3); box-shadow:2px 2px 0 #3a4aaa; }
.cst-frame-thumb span {
  position:absolute; bottom:2px; left:0; right:0; text-align:center;
  font-size:10px; color:#7a86bb; background:rgba(253,246,227,.85);
}
.cst-frame-thumb.selected span { color:#fff; background:rgba(74,91,196,.85); }
.cst-frame-none {
  grid-column:3; aspect-ratio:auto; padding:10px 6px;
  font-family:var(--font-hand,"ZoesHandwriting",cursive); font-size:13px; color:#555;
}

/* sticker tab */
.cst-sticker-tabs { display:flex; flex-wrap:wrap; gap:6px; margin-bottom:10px; }
.cst-sticker-tab {
  padding:7px 14px; background:#cdd3ec; border:1.5px solid #ccc;
  font-family:var(--font-hand,"ZoesHandwriting",cursive); font-size:18px; color:#7a86bb; cursor:pointer; transition:all .1s;
}
.cst-sticker-tab:hover { border-color:var(--blue,#6e83d3); color:var(--blue,#6e83d3); }
.cst-sticker-tab.active { border-color:var(--blue,#6e83d3); background:var(--blue,#6e83d3); color:#fff; }
.cst-sticker-grid { display:grid; grid-template-columns:repeat(4,1fr); gap:8px; }
.cst-sticker-thumb {
  background:#cdd3ec; border:1.5px solid #ccc; padding:6px; cursor:pointer; transition:all .1s;
}
.cst-sticker-thumb:hover { border-color:var(--blue,#6e83d3); background:#f0edfa; transform:scale(1.04); }
.cst-sticker-thumb img { width:100%; display:block; }

/* text tab */
.cst-text-add-row { display:flex; justify-content:flex-end; margin-bottom:12px; }
.cst-add-btn-compact { width:auto; flex-shrink:0; padding:9px 18px; }
.cst-text-input {
  width:100%; font-family:var(--font-hand,"ZoesHandwriting",cursive); font-size:18px; color:#222;
  background:#fff; border:1.5px solid var(--blue,#6e83d3); padding:10px 12px;
  outline:none; resize:none; height:90px; line-height:1.5; margin-bottom:12px;
}
.cst-text-input:focus { border-color:var(--blue,#6e83d3); }
.cst-text-size-slider { width:100%; margin:0 0 16px; accent-color:var(--blue,#6e83d3); }
.cst-text-preview { position:relative; width:100%; max-width:260px; margin:0 auto 14px; }
.cst-text-preview-img { width:100%; height:auto; display:block; box-shadow:2px 3px 7px rgba(0,0,0,.18); }
.cst-text-preview-body {
  position:absolute; overflow:hidden; text-align:center; word-break:break-word; white-space:pre-wrap;
  display:flex; align-items:center; justify-content:center;
  font-family:var(--font-hand,"ZoesHandwriting",cursive); color:#3a2e1e; line-height:1.25; font-size:clamp(11px,1.3vw,15px);
}
.cst-stationery-plain-glyph { font-family:var(--font-hand,"ZoesHandwriting",cursive); font-size:28px; color:#3a2e1e; }

/* wallpaper tab (bedroom only) */
.cst-target-toggle { display:flex; gap:8px; margin-bottom:16px; }
.cst-target-btn {
  flex:1; padding:8px 4px; background:#fff; border:1.5px solid #ccc;
  font-family:var(--font-hand,"ZoesHandwriting",cursive); font-size:16px; color:#7a86bb; cursor:pointer; transition:all .1s;
}
.cst-target-btn:hover { border-color:var(--blue,#6e83d3); color:var(--blue,#6e83d3); }
.cst-target-btn.active { border-color:var(--blue,#6e83d3); background:var(--blue,#6e83d3); color:#fff; }
.cst-swatch-grid { display:grid; grid-template-columns:repeat(3,1fr); gap:10px; margin-bottom:20px; }
.cst-swatch {
  aspect-ratio:1; border:2px solid #ccc; padding:0; cursor:pointer; position:relative;
  background-color:#e8e4dc; background-repeat:repeat; transition:border-color .1s;
}
.cst-swatch:hover { border-color:var(--blue,#6e83d3); }
.cst-swatch.selected { border-color:var(--blue,#6e83d3); box-shadow:0 0 0 2px var(--blue,#6e83d3); }
.cst-swatch span {
  position:absolute; left:0; right:0; bottom:0; text-align:center; padding:2px 0;
  font-family:var(--font-hand,"ZoesHandwriting",cursive); font-size:11px; color:#fff;
  background:rgba(0,0,0,.45);
}
`;
    document.head.appendChild(style);
  }

  function createPanel(deps) {
    deps = deps || {};
    ensureStyles();
    const MR = window.MatrixRender || {};
    const status = deps.status || function(){};
    const addLabel = deps.addLabel || 'add to matrix';

    const overlay = document.createElement('div');
    overlay.className = 'cst-overlay';
    overlay.innerHTML = `
      <div class="cst-shell">
        <div class="cst-head">
          <span class="cst-title">${esc(deps.title || 'customize')}</span>
          <button class="cst-close" type="button">×</button>
        </div>
        <div class="cst-tabs">
          <button type="button" class="cst-tab-btn active" data-tab="photo">photo</button>
          <button type="button" class="cst-tab-btn" data-tab="sticker">sticker</button>
          <button type="button" class="cst-tab-btn" data-tab="text">text</button>
          ${deps.showWallpaper ? `<button type="button" class="cst-tab-btn" data-tab="wallpaper">wallpaper</button>` : ''}
        </div>
        <div class="cst-body">
          <div class="cst-pane active" data-pane="photo">
            <div class="cst-photo-album" style="display:none;">
              <div class="cst-album-grid"></div>
              <div class="cst-album-empty" style="display:none;">loading your photos…</div>
              <button type="button" class="cst-upload-toggle">+ upload a new photo</button>
            </div>
            <div class="cst-photo-upload">
              <button type="button" class="cst-back-to-album" style="display:none;">‹ back to your photos</button>
              <input type="file" class="cst-photo-file" accept="image/*" hidden>
              <div class="cst-photo-drop">
                <div class="cst-photo-preview"><span class="cst-photo-hint">tap to choose an image</span></div>
              </div>
              <button class="cst-photo-cutout" type="button" disabled>✂ cut out subject</button>
              <div class="cst-label">which frame?</div>
              <div class="cst-frame-grid"></div>
              <div class="cst-status cst-photo-status"></div>
              <button class="cst-add-btn cst-photo-add" type="button" disabled>${esc(addLabel)}</button>
            </div>
          </div>
          <div class="cst-pane" data-pane="sticker">
            <div class="cst-sticker-tabs"></div>
            <div class="cst-sticker-grid"></div>
          </div>
          <div class="cst-pane" data-pane="text">
            <div class="cst-text-add-row">
              <button class="cst-add-btn cst-text-add cst-add-btn-compact" type="button">add</button>
            </div>
            <div class="cst-text-preview" style="display:none;"></div>
            <textarea class="cst-text-input" maxlength="80" placeholder="write something..."></textarea>
            <div class="cst-label">text size</div>
            <input type="range" class="cst-text-size-slider" min="0.6" max="2" step="0.1" value="1">
            <div class="cst-label">which stationery?</div>
            <div class="cst-frame-grid cst-stationery-grid"></div>
            <div class="cst-status cst-text-status"></div>
          </div>
          ${deps.showWallpaper ? `
          <div class="cst-pane" data-pane="wallpaper">
            <div class="cst-target-toggle">
              <button type="button" class="cst-target-btn active" data-target="wall">wall</button>
              <button type="button" class="cst-target-btn" data-target="floor">floor</button>
            </div>
            <div class="cst-swatch-grid cst-pattern-swatch-grid"></div>
            <div class="cst-status cst-wallpaper-status"></div>
          </div>` : ''}
        </div>
      </div>`;
    document.body.appendChild(overlay);

    let activeTab = 'photo';
    function switchTab(tab) {
      activeTab = tab;
      overlay.querySelectorAll('.cst-tab-btn').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
      overlay.querySelectorAll('.cst-pane').forEach(p => p.classList.toggle('active', p.dataset.pane === tab));
    }
    overlay.querySelectorAll('.cst-tab-btn').forEach(btn => {
      btn.addEventListener('click', () => switchTab(btn.dataset.tab));
    });
    overlay.querySelector('.cst-close').addEventListener('click', close);
    overlay.addEventListener('click', e => { if (e.target === overlay) close(); });

    // ═══ PHOTO TAB ═══
    const albumSection = overlay.querySelector('.cst-photo-album');
    const albumGridEl = overlay.querySelector('.cst-album-grid');
    const albumEmptyEl = overlay.querySelector('.cst-album-empty');
    const uploadSection = overlay.querySelector('.cst-photo-upload');
    const uploadToggleBtn = overlay.querySelector('.cst-upload-toggle');
    const backToAlbumBtn = overlay.querySelector('.cst-back-to-album');
    const photoFileEl = overlay.querySelector('.cst-photo-file');
    const photoDropEl = overlay.querySelector('.cst-photo-drop');
    const photoPreviewEl = overlay.querySelector('.cst-photo-preview');
    const photoFrameGridEl = overlay.querySelector('.cst-pane[data-pane="photo"] .cst-frame-grid');
    const photoStatusEl = overlay.querySelector('.cst-photo-status');
    const photoAddBtn = overlay.querySelector('.cst-photo-add');
    const photoCutoutBtn = overlay.querySelector('.cst-photo-cutout');

    let photoDraft = { file: null, dataUrl: null, frame: 'polaroid', imgScale: 1, imgPosX: 50, imgPosY: 50, imgRot: 0 };

    function showAlbumView() {
      albumSection.style.display = '';
      uploadSection.style.display = 'none';
    }
    function showUploadView() {
      albumSection.style.display = 'none';
      uploadSection.style.display = '';
      backToAlbumBtn.style.display = deps.showAlbum ? '' : 'none';
    }
    uploadToggleBtn.addEventListener('click', showUploadView);
    backToAlbumBtn.addEventListener('click', showAlbumView);

    async function refreshAlbum() {
      if (!deps.showAlbum) return;
      albumGridEl.innerHTML = '';
      albumEmptyEl.style.display = 'block';
      albumEmptyEl.textContent = 'loading your photos…';
      let items = [];
      try { items = (await deps.loadAlbum()) || []; } catch (e) { console.error('[matrix-customize] album load failed:', e); }
      if (!items.length) {
        albumEmptyEl.textContent = 'no saved photos yet — upload one below';
        return;
      }
      albumEmptyEl.style.display = 'none';
      items.forEach(raw => albumGridEl.appendChild(buildAlbumThumb(raw)));
    }

    function buildAlbumThumb(raw) {
      const norm = deps.albumThumb ? deps.albumThumb(raw) : raw;
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'cst-album-item';
      const thumb = document.createElement('div');
      thumb.className = 'cst-album-thumb';
      if (norm.frame === MR.NO_FRAME_KEY) {
        thumb.innerHTML = `<img class="cst-plain" src="${esc(norm.url)}" alt="">`;
      } else {
        const frameFile = MR.PHOTO_FRAME_FILE[norm.frame] || MR.PHOTO_FRAME_FILE.polaroid;
        thumb.innerHTML = `<div class="cst-inner" style="${MR.photoFrameMaskStyle(norm.frame)}">
            <img class="cst-img" src="${esc(norm.url)}" alt="" style="${MR.photoMatteStyle(norm.frame)}object-position:${norm.imgPosX != null ? norm.imgPosX : 50}% ${norm.imgPosY != null ? norm.imgPosY : 50}%;">
            <img class="cst-frame" src="${MR.PHOTO_FRAME_BASE}${frameFile}" alt="">
          </div>`;
      }
      btn.appendChild(thumb);
      if (norm.label) {
        const label = document.createElement('div');
        label.className = 'cst-album-label';
        label.textContent = norm.label;
        btn.appendChild(label);
      }
      btn.addEventListener('click', async () => {
        btn.disabled = true;
        try { await deps.onPickAlbumPhoto(raw); close(); }
        catch (e) { console.error('[matrix-customize] pin photo failed:', e); btn.disabled = false; }
      });
      return btn;
    }

    function renderPhotoFrameGrid(){
      const noneSelected = photoDraft.frame === MR.NO_FRAME_KEY ? ' selected' : '';
      photoFrameGridEl.innerHTML = MR.PHOTO_FRAMES.map(f => {
        const selected = f.key === photoDraft.frame ? ' selected' : '';
        return `<button class="cst-frame-thumb${selected}" type="button" data-frame="${f.key}">
            <img src="${MR.PHOTO_FRAME_BASE}${f.file}" alt="${esc(f.label)}"><span>${esc(f.label)}</span></button>`;
      }).join('') + `<button class="cst-frame-thumb cst-frame-none${noneSelected}" type="button" data-frame="${MR.NO_FRAME_KEY}">no frame</button>`;
    }
    function updatePhotoPreviewFit(){
      const img = photoPreviewEl.querySelector('.cst-photo-preview-img');
      if (!img) return;
      img.style.objectPosition = `${photoDraft.imgPosX}% ${photoDraft.imgPosY}%`;
      img.style.transform = `rotate(${photoDraft.imgRot}deg) scale(${photoDraft.imgScale})`;
    }
    function renderPhotoPreviewContents(){
      photoPreviewEl.style.cssText = '';
      if (!photoDraft.dataUrl) return;
      if (photoDraft.frame === MR.NO_FRAME_KEY) {
        photoPreviewEl.classList.add('no-frame');
        photoPreviewEl.innerHTML = `<img class="cst-photo-preview-img plain" src="${photoDraft.dataUrl}" alt="">
            <button class="cst-photo-clear" type="button" title="remove image" aria-label="remove image">✕</button>`;
      } else {
        photoPreviewEl.classList.remove('no-frame');
        photoPreviewEl.style.cssText = MR.photoFrameMaskStyle(photoDraft.frame);
        const frameFile = MR.PHOTO_FRAME_FILE[photoDraft.frame] || MR.PHOTO_FRAME_FILE.polaroid;
        photoPreviewEl.innerHTML = `<img class="cst-photo-preview-img" src="${photoDraft.dataUrl}" alt="" style="${MR.photoMatteStyle(photoDraft.frame)}">
           <img class="cst-photo-preview-frame" src="${MR.PHOTO_FRAME_BASE}${frameFile}" alt="">
           <button class="cst-photo-rotate" type="button" title="rotate" aria-label="rotate photo">↻</button>
           <button class="cst-photo-stretch" type="button" title="stretch" aria-label="stretch photo">⤢</button>
           <button class="cst-photo-clear" type="button" title="remove image" aria-label="remove image">✕</button>`;
        updatePhotoPreviewFit();
      }
    }
    function refreshPhotoAdd(){
      photoAddBtn.disabled = !photoDraft.file;
      photoCutoutBtn.disabled = !photoDraft.file;
    }
    function clearPhotoDraft(){
      photoDraft.file = null; photoDraft.dataUrl = null;
      photoDraft.imgScale = 1; photoDraft.imgPosX = 50; photoDraft.imgPosY = 50; photoDraft.imgRot = 0;
      photoFileEl.value = '';
      photoPreviewEl.classList.remove('no-frame');
      photoPreviewEl.style.cssText = '';
      photoPreviewEl.innerHTML = '<span class="cst-photo-hint">tap to choose an image</span>';
      photoCutoutBtn.textContent = '✂ cut out subject';
      refreshPhotoAdd();
    }
    function resetPhotoUpload(){
      photoDraft = { file: null, dataUrl: null, frame: 'polaroid', imgScale: 1, imgPosX: 50, imgPosY: 50, imgRot: 0 };
      photoFileEl.value = '';
      photoPreviewEl.classList.remove('no-frame');
      photoPreviewEl.style.cssText = '';
      photoPreviewEl.innerHTML = '<span class="cst-photo-hint">tap to choose an image</span>';
      renderPhotoFrameGrid();
      photoStatusEl.textContent = ''; photoStatusEl.style.color = '';
      photoAddBtn.textContent = addLabel;
      photoCutoutBtn.textContent = '✂ cut out subject';
      refreshPhotoAdd();
    }

    photoDropEl.addEventListener('click', () => { if (!photoDraft.dataUrl) photoFileEl.click(); });
    photoFileEl.addEventListener('change', e => {
      const file = e.target.files && e.target.files[0];
      if (!file) return;
      if (!file.type.startsWith('image/')) {
        photoStatusEl.style.color = '#E8478B'; photoStatusEl.textContent = 'that file isn’t an image';
        photoDraft.file = null; refreshPhotoAdd(); return;
      }
      photoDraft.file = file;
      photoDraft.imgScale = 1; photoDraft.imgPosX = 50; photoDraft.imgPosY = 50; photoDraft.imgRot = 0;
      const reader = new FileReader();
      reader.onload = ev => { photoDraft.dataUrl = ev.target.result; renderPhotoPreviewContents(); };
      reader.readAsDataURL(file);
      photoStatusEl.textContent = '';
      refreshPhotoAdd();
    });
    async function cutOutSubject(){
      if (!photoDraft.file) return;
      photoCutoutBtn.disabled = true; photoAddBtn.disabled = true;
      photoStatusEl.style.color = '#7a86bb';
      photoStatusEl.textContent = 'cutting out subject… (first time can take a bit while it downloads)';
      try {
        const { removeBackground } = await loadBackgroundRemoval();
        const blob = await removeBackground(photoDraft.file);
        const dataUrl = await new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = ev => resolve(ev.target.result);
          reader.onerror = () => reject(new Error('could not read cutout image'));
          reader.readAsDataURL(blob);
        });
        photoDraft.file = new File([blob], 'cutout.png', { type: 'image/png' });
        photoDraft.dataUrl = dataUrl;
        photoDraft.frame = MR.NO_FRAME_KEY;
        renderPhotoFrameGrid();
        renderPhotoPreviewContents();
        photoCutoutBtn.textContent = '✂ cut out again';
        photoStatusEl.style.color = '#6ab86a';
        photoStatusEl.textContent = 'subject cut out ✓';
      } catch(err) {
        console.error('[matrix-customize] background removal failed:', err);
        photoStatusEl.style.color = '#E8478B';
        photoStatusEl.textContent = 'couldn’t cut out subject — try again';
      } finally {
        photoAddBtn.disabled = !photoDraft.file;
        photoCutoutBtn.disabled = !photoDraft.file;
      }
    }
    photoCutoutBtn.addEventListener('click', cutOutSubject);
    photoFrameGridEl.addEventListener('click', e => {
      const btn = e.target.closest('.cst-frame-thumb');
      if (!btn) return;
      photoDraft.frame = btn.dataset.frame;
      photoFrameGridEl.querySelectorAll('.cst-frame-thumb').forEach(b => b.classList.remove('selected'));
      btn.classList.add('selected');
      renderPhotoPreviewContents();
    });
    photoPreviewEl.addEventListener('click', e => {
      if (e.target.closest('.cst-photo-clear')) clearPhotoDraft();
    });
    let photoPanState = null;
    photoPreviewEl.addEventListener('pointerdown', e => {
      const img = e.target.closest('.cst-photo-preview-img');
      if (!img || img.classList.contains('plain')) return;
      img.setPointerCapture(e.pointerId);
      const box = photoPreviewEl.getBoundingClientRect();
      photoPanState = { pointerId: e.pointerId, box, startX: e.clientX, startY: e.clientY, startPosX: photoDraft.imgPosX, startPosY: photoDraft.imgPosY };
      e.preventDefault();
    });
    photoPreviewEl.addEventListener('pointermove', e => {
      if (!photoPanState || photoPanState.pointerId !== e.pointerId) return;
      const dx = e.clientX - photoPanState.startX, dy = e.clientY - photoPanState.startY;
      const posX = Math.max(0, Math.min(100, photoPanState.startPosX - (dx / photoPanState.box.width) * 100));
      const posY = Math.max(0, Math.min(100, photoPanState.startPosY - (dy / photoPanState.box.height) * 100));
      photoDraft.imgPosX = +posX.toFixed(1); photoDraft.imgPosY = +posY.toFixed(1);
      updatePhotoPreviewFit();
    });
    photoPreviewEl.addEventListener('pointerup', e => {
      if (!photoPanState || photoPanState.pointerId !== e.pointerId) return;
      photoPanState = null;
    });
    let photoStretchState = null;
    photoPreviewEl.addEventListener('pointerdown', e => {
      const handle = e.target.closest('.cst-photo-stretch');
      if (!handle) return;
      e.stopPropagation(); e.preventDefault();
      handle.setPointerCapture(e.pointerId);
      const rect = photoPreviewEl.getBoundingClientRect();
      const cx = rect.left + rect.width/2, cy = rect.top + rect.height/2;
      photoStretchState = { pointerId: e.pointerId, cx, cy, startDist: Math.max(10, Math.hypot(e.clientX-cx, e.clientY-cy)), startScale: photoDraft.imgScale };
    });
    photoPreviewEl.addEventListener('pointermove', e => {
      if (!photoStretchState || photoStretchState.pointerId !== e.pointerId) return;
      const dist = Math.hypot(e.clientX - photoStretchState.cx, e.clientY - photoStretchState.cy);
      let scale = photoStretchState.startScale * (dist / photoStretchState.startDist);
      photoDraft.imgScale = +Math.max(1, Math.min(2.5, scale)).toFixed(2);
      updatePhotoPreviewFit();
    });
    photoPreviewEl.addEventListener('pointerup', e => {
      if (!photoStretchState || photoStretchState.pointerId !== e.pointerId) return;
      photoStretchState = null;
    });
    let photoRotateState = null;
    photoPreviewEl.addEventListener('pointerdown', e => {
      const handle = e.target.closest('.cst-photo-rotate');
      if (!handle) return;
      e.stopPropagation(); e.preventDefault();
      handle.setPointerCapture(e.pointerId);
      const rect = photoPreviewEl.getBoundingClientRect();
      const cx = rect.left + rect.width/2, cy = rect.top + rect.height/2;
      photoRotateState = { pointerId: e.pointerId, cx, cy, startAngle: Math.atan2(e.clientY-cy, e.clientX-cx) * 180/Math.PI, startRot: photoDraft.imgRot };
    });
    photoPreviewEl.addEventListener('pointermove', e => {
      if (!photoRotateState || photoRotateState.pointerId !== e.pointerId) return;
      const angle = Math.atan2(e.clientY - photoRotateState.cy, e.clientX - photoRotateState.cx) * 180/Math.PI;
      let rot = photoRotateState.startRot + (angle - photoRotateState.startAngle);
      rot = ((rot + 180) % 360 + 360) % 360 - 180;
      photoDraft.imgRot = +rot.toFixed(1);
      updatePhotoPreviewFit();
    });
    photoPreviewEl.addEventListener('pointerup', e => {
      if (!photoRotateState || photoRotateState.pointerId !== e.pointerId) return;
      photoRotateState = null;
    });

    photoAddBtn.addEventListener('click', async () => {
      if (!photoDraft.file) return;
      photoAddBtn.disabled = true; photoAddBtn.textContent = 'uploading…';
      photoStatusEl.style.color = '#7a86bb'; photoStatusEl.textContent = 'uploading…';
      try {
        await deps.onUploadPhoto({
          file: photoDraft.file, dataUrl: photoDraft.dataUrl, frame: photoDraft.frame,
          imgScale: photoDraft.imgScale, imgPosX: photoDraft.imgPosX, imgPosY: photoDraft.imgPosY, imgRot: photoDraft.imgRot,
        });
        status('photo added ✓', '#6ab86a');
        close();
      } catch (err) {
        console.error('[matrix-customize] photo upload failed:', err);
        photoStatusEl.style.color = '#E8478B';
        photoStatusEl.textContent = (err && err.message) ? `couldn’t add photo: ${err.message}` : 'couldn’t add photo — try again';
        photoAddBtn.disabled = false; photoAddBtn.textContent = addLabel;
      }
    });

    // ═══ STICKER TAB ═══
    let activeStickerTab = Object.keys(STICKER_CATEGORIES)[0];
    const stickerTabsEl = overlay.querySelector('.cst-sticker-tabs');
    const stickerGridEl = overlay.querySelector('.cst-sticker-grid');

    function renderStickerTabs(){
      stickerTabsEl.innerHTML = Object.entries(STICKER_CATEGORIES).map(([key, cat]) =>
        `<button class="cst-sticker-tab${key === activeStickerTab ? ' active' : ''}" type="button" data-tab="${key}">${esc(cat.label)}</button>`
      ).join('');
    }
    function renderStickerGrid(){
      const cat = STICKER_CATEGORIES[activeStickerTab];
      stickerGridEl.innerHTML = cat.files.map(f => {
        const url = STICKER_BASE + activeStickerTab + '/' + f;
        const label = f.replace(/\.png$/,'').replace(/-/g,' ');
        return `<button class="cst-sticker-thumb" type="button" data-url="${url}" title="${esc(label)}"><img src="${url}" alt="${esc(label)}"></button>`;
      }).join('');
    }
    stickerTabsEl.addEventListener('click', e => {
      const btn = e.target.closest('.cst-sticker-tab');
      if (!btn) return;
      activeStickerTab = btn.dataset.tab;
      renderStickerTabs(); renderStickerGrid();
    });
    stickerGridEl.addEventListener('click', async e => {
      const btn = e.target.closest('.cst-sticker-thumb');
      if (!btn) return;
      btn.disabled = true;
      try {
        await deps.onAddSticker(btn.dataset.url);
        status('sticker added ✓', '#6ab86a');
        close();
      } catch (err) {
        console.error('[matrix-customize] sticker add failed:', err);
        status('couldn’t add sticker — try again', '#E8478B');
        btn.disabled = false;
      }
    });

    // ═══ TEXT TAB ═══
    const TEXT_BASE_SIZE = 18, STATIONERY_BASE_SIZE = 14;
    let textDraft = { stationery: null, scale: 1 };
    const textPreviewEl = overlay.querySelector('.cst-text-preview');
    const textInputEl = overlay.querySelector('.cst-text-input');
    const textSizeSliderEl = overlay.querySelector('.cst-text-size-slider');
    const stationeryGridEl = overlay.querySelector('.cst-stationery-grid');
    const textStatusEl = overlay.querySelector('.cst-text-status');
    const textAddBtn = overlay.querySelector('.cst-text-add');

    function renderStationeryGrid(){
      const plainSelected = !textDraft.stationery ? ' selected' : '';
      const plainThumb = `<button class="cst-frame-thumb${plainSelected}" type="button" data-stationery="">
          <div class="cst-stationery-plain-glyph">Aa</div><span>plain</span></button>`;
      const cardThumbs = (MR.STATIONERY_ITEMS || []).map(s => {
        const selected = s.key === textDraft.stationery ? ' selected' : '';
        return `<button class="cst-frame-thumb${selected}" type="button" data-stationery="${s.key}">
            <img src="${MR.STATIONERY_BASE}${s.file}" alt="${esc(s.label)}"><span>${esc(s.label)}</span></button>`;
      }).join('');
      stationeryGridEl.innerHTML = plainThumb + cardThumbs;
    }
    function updateTextAddPreview(){
      textInputEl.style.fontSize = (TEXT_BASE_SIZE * textDraft.scale) + 'px';
      if (!textDraft.stationery) { textPreviewEl.style.display = 'none'; return; }
      textPreviewEl.style.display = 'block';
      const file = MR.STATIONERY_FILE[textDraft.stationery];
      const box = MR.STATIONERY_BOX[textDraft.stationery];
      textPreviewEl.innerHTML = `<img class="cst-text-preview-img" src="${MR.STATIONERY_BASE}${file}" alt="">
          <div class="cst-text-preview-body" style="left:${box.l}%;top:${box.t}%;width:${box.w}%;height:${box.h}%;font-size:${STATIONERY_BASE_SIZE * textDraft.scale}px;">${esc(textInputEl.value)}</div>`;
    }
    function resetTextAdd(){
      textInputEl.value = ''; textInputEl.maxLength = 80;
      textDraft = { stationery: null, scale: 1 };
      textSizeSliderEl.value = 1;
      renderStationeryGrid(); updateTextAddPreview();
      textStatusEl.textContent = ''; textStatusEl.style.color = '';
      textAddBtn.disabled = false; textAddBtn.textContent = 'add';
    }
    textInputEl.addEventListener('input', updateTextAddPreview);
    textSizeSliderEl.addEventListener('input', () => {
      textDraft.scale = +textSizeSliderEl.value;
      updateTextAddPreview();
    });
    stationeryGridEl.addEventListener('click', e => {
      const btn = e.target.closest('.cst-frame-thumb');
      if (!btn) return;
      textDraft.stationery = btn.dataset.stationery || null;
      stationeryGridEl.querySelectorAll('.cst-frame-thumb').forEach(b => b.classList.remove('selected'));
      btn.classList.add('selected');
      textInputEl.maxLength = textDraft.stationery ? 300 : 80;
      updateTextAddPreview();
    });
    textAddBtn.addEventListener('click', async () => {
      const text = textInputEl.value.trim();
      if (!text) { textStatusEl.style.color = '#E8478B'; textStatusEl.textContent = 'write something first'; return; }
      textAddBtn.disabled = true; textAddBtn.textContent = 'adding…';
      try {
        await deps.onAddText({ text, stationery: textDraft.stationery || null, scale: textDraft.scale });
        status('text added ✓', '#6ab86a');
        close();
      } catch (err) {
        console.error('[matrix-customize] text add failed:', err);
        textStatusEl.style.color = '#E8478B'; textStatusEl.textContent = 'couldn’t add text — try again';
        textAddBtn.disabled = false; textAddBtn.textContent = 'add';
      }
    });

    // ═══ WALLPAPER TAB (bedroom only) ═══
    let patternTargetToggleEl, patternSwatchGridEl, wallpaperStatusEl, activePatternTarget;
    if (deps.showWallpaper) {
      patternTargetToggleEl = overlay.querySelector('.cst-target-toggle');
      patternSwatchGridEl = overlay.querySelector('.cst-pattern-swatch-grid');
      wallpaperStatusEl = overlay.querySelector('.cst-wallpaper-status');
      activePatternTarget = 'wall';

      function currentKeyForTarget() {
        if (activePatternTarget === 'floor') return deps.getCurrentFloor ? deps.getCurrentFloor() : null;
        return deps.getCurrentWall ? deps.getCurrentWall() : null;
      }
      function renderPatternGrid() {
        const currentKey = currentKeyForTarget();
        patternSwatchGridEl.innerHTML = (deps.patternOptions || []).map(o => {
          const selected = o.key === currentKey ? ' selected' : '';
          return `<button class="cst-swatch${selected}" type="button" data-key="${o.key}"
              style="background-image:url('${o.file}');background-size:${o.swatchSize || '40px 40px'};"><span>${esc(o.label)}</span></button>`;
        }).join('');
        patternSwatchGridEl.querySelectorAll('.cst-swatch').forEach(btn => {
          btn.addEventListener('click', async () => {
            if (btn.classList.contains('selected')) return;
            patternSwatchGridEl.querySelectorAll('.cst-swatch').forEach(b => b.classList.remove('selected'));
            btn.classList.add('selected');
            wallpaperStatusEl.style.color = '#7a86bb'; wallpaperStatusEl.textContent = 'saving…';
            try {
              const onPick = activePatternTarget === 'floor' ? deps.onSetFloor : deps.onSetWall;
              await onPick(btn.dataset.key);
              wallpaperStatusEl.style.color = '#6ab86a'; wallpaperStatusEl.textContent = 'saved ✓';
            } catch (err) {
              console.error('[matrix-customize] wallpaper save failed:', err);
              wallpaperStatusEl.style.color = '#E8478B'; wallpaperStatusEl.textContent = 'couldn’t save — try again';
            }
          });
        });
      }
      patternTargetToggleEl.addEventListener('click', e => {
        const btn = e.target.closest('.cst-target-btn');
        if (!btn) return;
        activePatternTarget = btn.dataset.target;
        patternTargetToggleEl.querySelectorAll('.cst-target-btn').forEach(b => b.classList.toggle('active', b === btn));
        wallpaperStatusEl.textContent = ''; wallpaperStatusEl.style.color = '';
        renderPatternGrid();
      });
      function refreshWallpaperTab() {
        activePatternTarget = 'wall';
        patternTargetToggleEl.querySelectorAll('.cst-target-btn').forEach(b => b.classList.toggle('active', b.dataset.target === 'wall'));
        wallpaperStatusEl.textContent = ''; wallpaperStatusEl.style.color = '';
        renderPatternGrid();
      }
    }

    function open(tab) {
      ensureStyles();
      switchTab(tab || 'photo');
      resetPhotoUpload();
      renderStickerTabs(); renderStickerGrid();
      resetTextAdd();
      if (deps.showAlbum) { showAlbumView(); refreshAlbum(); }
      else showUploadView();
      if (deps.showWallpaper) refreshWallpaperTab();
      overlay.classList.add('open');
    }
    function close() { overlay.classList.remove('open'); }
    function destroy() { overlay.remove(); }

    return { open, close, destroy };
  }

  window.MatrixCustomize = { createPanel };
})();
