/* ============================================================================
   matrix-render.js — shared adventure-matrix renderer + editors
   ----------------------------------------------------------------------------
   One source of truth for: assembling a dream_matrix row into a render model,
   drawing the 2x2 adventure matrix, and editing a row's photos + journal.

   Used by BOTH archive.html (now) and adventure-matrix.html (after launch).
   Nothing here reaches for page globals — every dependency (the Supabase
   client, the row id, the user id, a redraw callback) is passed IN, so the
   same functions run unchanged on either page.

   Load with a plain tag (no bundler):  <script src="./matrix-render.js"></script>
   It attaches a single global:  window.MatrixRender

   Asset paths are emitted page-relative ("../assets/..."), so they resolve
   against whichever HTML page is displaying the matrix. Keep archive.html and
   adventure-matrix.html at the same folder depth (both in /matrix/).
   ========================================================================== */
(function () {
  'use strict';

  // ── CONFIG ────────────────────────────────────────────────
  const BUCKET = 'matrix-photos';

  // ── CHARACTER ASSETS (mirrors FULL_ASSETS in infinity-mirror.html) ──
  const CHAR_FULL_ASSETS = {
    body_red:    "../assets/characters-full/01.01-RED_BODY.png",
    body_orange: "../assets/characters-full/02.01-ORANGE_BODY.png",
    body_yellow: "../assets/characters-full/03.01-YELLOW_BODY.png",
    body_green:  "../assets/characters-full/04.01-GREEN_BODY.png",
    body_cyan:   "../assets/characters-full/05.01-CYAN_BODY.png",
    body_blue:   "../assets/characters-full/06.01-BLUE_BODY.png",
    body_purple: "../assets/characters-full/07.01-PURPLE_BODY.png",
    body_pink:   "../assets/characters-full/08.01-PINK_BODY.png",

    eyes_open:       "../assets/characters-full/01.02-OPEN_EYES.png",
    eyes_closed:     "../assets/characters-full/02.02-EYES_CLOSED.png",
    eyes_cyclops:    "../assets/characters-full/03.02-SINGLE_EYE.png",
    eyes_glasses:    "../assets/characters-full/04.02-GLASSES.png",
    eyes_serious:    "../assets/characters-full/05.02-SERIOUS_EYES.png",
    eyes_up:         "../assets/characters-full/06.02-UP_EYES.png",
    eyes_sunglasses: "../assets/characters-full/07.02-SUNGLASSES.png",
    eyes_sideways:   "../assets/characters-full/08.02-SIDE_EYES.png",

    mouth_lips:     "../assets/characters-full/01.03-RED_LIPS.png",
    mouth_tongue:   "../assets/characters-full/02.03-TONGUE_SMILE.png",
    mouth_thin:     "../assets/characters-full/03.03-THIN_SMILE.png",
    mouth_flat:     "../assets/characters-full/04.03-FLAT_MOUTH.png",
    mouth_straight: "../assets/characters-full/05.03-STRAIGHT_MOUTH.png",
    mouth_sad:      "../assets/characters-full/06.03-SLIGHT_SAD.png",
    mouth_grin:     "../assets/characters-full/07.03-BIG_GRIN.png",
    mouth_smooch:   "../assets/characters-full/08.03-SMOOCH.png",

    hair_fire:     "../assets/characters-full/01.04-FIRE_HAIR.png",
    hair_flower:   "../assets/characters-full/02.04-ORANGE_HAIR.png",
    hair_rays:     "../assets/characters-full/03.04-RAY_HAIR.png",
    hair_spikes:   "../assets/characters-full/04.04-SPIKE_HAIR.png",
    hair_squiggle: "../assets/characters-full/05.04-SQUIGGLE_HAIR.png",
    hair_wings:    "../assets/characters-full/06.04-BLUE_HAIR.png",
    hair_pigtails: "../assets/characters-full/07.04-PIGTAIL_HAIR.png",
    hair_wideray:  "../assets/characters-full/08.04-WIDE_RAY.png",

    acc_rollerblades: "../assets/characters-full/09.02-ROLLERBLADES.png",
    acc_sneakers:     "../assets/characters-full/09.03-SNEAKERS.png",
    acc_heels:        "../assets/characters-full/09.01-HIGH_HEELS.png",
    acc_sandals:      "../assets/characters-full/09.04-SANDALS.png",
    acc_devil:        "../assets/characters-full/10.01-DEVIL.png",
    acc_angel:        "../assets/characters-full/10.02-HALO.png",
    acc_birthday:     "../assets/characters-full/10.03-BIRTHDAY.png",
    acc_swearword:    "../assets/characters-full/10.05-SENSOR.png",
    acc_rainstorm:    "../assets/characters-full/10-RAINSTORM.png",
    acc_rainbow:      "../assets/characters-full/10.04-RAINBOW.png",
  };

  // Sourced from assets/js/treasure-map.js (window.TreasureMap), which every
  // page loading this file also loads first — single source of truth for
  // terrain image paths, shared with treasure-map.html/cosmic.html/daily.html/dream.html.
  const TERRAIN_IMGS = (window.TreasureMap && window.TreasureMap.TERRAIN_IMGS) || {};

  // ── PHOTO FRAMES (mirrors PHOTO_FRAMES in dream.html/daily.html) ──
  // Each frame also has a solid-silhouette mask (assets/.../frames/masks/,
  // generated with scipy.ndimage.binary_fill_holes over the frame's alpha
  // channel) applied via CSS mask-image on the photo box, so the photo is
  // truly clipped to the frame's outline, corners included.
  const PHOTO_FRAME_BASE = '../assets/elements/stickers/frames/';
  const PHOTO_FRAME_MASK_BASE = '../assets/elements/stickers/frames/masks/';
  const PHOTO_FRAMES = [
    { key: 'polaroid',           label: 'polaroid',    file: 'frame-polaroid.png',           mask: 'frame-polaroid-mask.png' },
    { key: 'gold-beaded-square', label: 'gold beaded', file: 'frame-gold-beaded-square.png', mask: 'frame-gold-beaded-square-mask.png' },
  ];
  const PHOTO_FRAME_FILE = Object.fromEntries(PHOTO_FRAMES.map(f => [f.key, f.file]));
  const PHOTO_FRAME_MASK_FILE = Object.fromEntries(PHOTO_FRAMES.map(f => [f.key, f.mask]));
  // Shared inline CSS (both prefixed and standard) that clips an element to a
  // frame's mask, stretched to match that element's own box exactly.
  function photoFrameMaskStyle(frameKey){
    const maskUrl = PHOTO_FRAME_MASK_BASE + (PHOTO_FRAME_MASK_FILE[frameKey] || PHOTO_FRAME_MASK_FILE.polaroid);
    return `mask-image:url(${maskUrl});-webkit-mask-image:url(${maskUrl});`
      + `mask-size:100% 100%;-webkit-mask-size:100% 100%;`
      + `mask-repeat:no-repeat;-webkit-mask-repeat:no-repeat;`
      + `mask-position:center;-webkit-mask-position:center;`;
  }
  // Each frame's transparent "window" as %-of-box (l/t/w/h), measured from the
  // frame PNG's actual alpha hole so the photo lines up with the art instead of
  // assuming a uniform border. Used to inset the photo off the frame's edge —
  // the #fff matte (see .adv-photo-inner) shows in the gap — so the frame's
  // own border art no longer overlaps/crops the image underneath it.
  const PHOTO_FRAME_WINDOW = {
    'polaroid':           { l: 9.3,  t: 9.3,  w: 81.2, h: 67.0 },
    'gold-beaded-square': { l: 20.8, t: 21.6, w: 58.1, h: 57.0 },
  };
  const PHOTO_MATTE_MARGIN = 4; // percentage points of breathing room inset from the window on each side
  // Inline CSS that positions/sizes the photo <img> inside a frame's window,
  // shrunk by PHOTO_MATTE_MARGIN so the matte color is visible as a border
  // between the photo's edge and where the frame art begins.
  function photoMatteStyle(frameKey){
    const win = PHOTO_FRAME_WINDOW[frameKey] || PHOTO_FRAME_WINDOW.polaroid;
    const m = PHOTO_MATTE_MARGIN;
    const l = win.l + m, t = win.t + m;
    const w = Math.max(10, win.w - 2 * m), h = Math.max(10, win.h - 2 * m);
    return `left:${l}%;top:${t}%;width:${w}%;height:${h}%;`;
  }
  const NO_FRAME_KEY = 'none'; // clean cutout PNGs: no overlay, no white mat, no cropping

  // ── PURE HELPERS ──────────────────────────────────────────
  function seedRand(str){
    let h = 1779033703 ^ (str ? str.length : 0);
    for (let i=0; i<(str||'').length; i++){ h = Math.imul(h ^ str.charCodeAt(i), 3432918353); h = (h<<13)|(h>>>19); }
    let s = h>>>0;
    return function(){ s = Math.imul(s ^ (s>>>15), 2246822507); s = Math.imul(s ^ (s>>>13), 3266489909); s ^= s>>>16; return (s>>>0)/4294967296; };
  }
  function esc(s){ return (s||'').replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }

  function buildCharStack(charState){
    if(!charState) return '';
    // Saved state stores bare IDs (e.g. "body_pink"); resolve each to its full PNG.
    // A value already containing "/" is treated as a ready URL (forward-compatible).
    const resolve = v => !v ? null
      : (typeof v === 'string' && v.includes('/')
          ? v.replace(/(\d{2}\.\d{2})\s+/g, '$1-')  // fix old space-based filenames
          : (CHAR_FULL_ASSETS[v] || null));
    // Back→front order (same as the mirror): body, shoes, hair, eyes, mouth, acc.
    const layers = [
      charState.body, charState.shoes, charState.hair,
      charState.eyes, charState.mouth, charState.acc,
    ].map(resolve).filter(Boolean);
    if(!layers.length) return '';
    return `<div class="adv-char-stack">${layers.map(s=>`<img src="${s}" alt="" onerror="this.style.display='none'">`).join('')}</div>`;
  }

  // The matrix map item shows ONLY the day's chosen destination (one terrain +
  // tint glow + feeling). loc = {terrain, feeling, tint}.
  function buildSingleLocationSVG(loc){
    loc = loc || {};
    const R = 58, cx = 150, cy = 108;
    let defs = '', body = '';
    if (loc.tint) {
      defs += `<radialGradient id="locglow" cx="50%" cy="50%" r="50%">`
        + `<stop offset="0%" stop-color="${loc.tint}" stop-opacity="1"/>`
        + `<stop offset="55%" stop-color="${loc.tint}" stop-opacity=".85"/>`
        + `<stop offset="100%" stop-color="${loc.tint}" stop-opacity="0"/></radialGradient>`;
      body += `<circle cx="${cx}" cy="${cy}" r="${R+44}" fill="url(#locglow)"/>`;
    }
    if (loc.terrain && TERRAIN_IMGS[loc.terrain]) {
      body += `<image x="${cx-R}" y="${cy-R}" width="${R*2}" height="${R*2}" `
        + `href="${TERRAIN_IMGS[loc.terrain]}" preserveAspectRatio="xMidYMid meet"/>`
        + `<text x="${cx}" y="${cy-R-8}" text-anchor="middle" fill="#000000" `
        + `font-family="ZoesHandwriting,cursive" font-size="16" font-weight="bold">${esc(loc.terrain)} of</text>`;
    } else {
      body += `<circle cx="${cx}" cy="${cy}" r="${R}" fill="rgba(200,196,180,.55)" stroke="#6e83d3" stroke-width="1.5"/>`;
    }
    if (loc.feeling) {
      body += `<text x="${cx}" y="${cy+R+22}" text-anchor="middle" fill="#000000" `
        + `font-family="ZoesHandwriting,cursive" font-size="17" font-weight="bold">${esc(loc.feeling)}</text>`;
    }
    return `<svg viewBox="0 0 300 240" xmlns="http://www.w3.org/2000/svg" style="width:100%;height:100%;"><defs>${defs}</defs>${body}</svg>`;
  }

  // ── WHOLE-MAP RENDER (read-only) ──────────────────────────
  // The full map as drawn on the treasure-map game + matrix phase selector:
  // 3-zone spiral on spiral-3.png, or 4-corner square on square-1.png, with
  // the large soft tint glows. Read-only (no zone numbers, no click targets).
  // zones[i] = { terrain, feeling, tint }. Single source for the archive's
  // map window + map-selector thumbnails so they can't drift from the games.
  const SPIRAL_ZONE_POS = [ {x:245,y:230}, {x:372,y:288}, {x:150,y:75} ];
  const SQUARE_ZONE_POS = [ {x:160,y:114}, {x:340,y:114}, {x:340,y:286}, {x:160,y:286} ];

  function _mapZone(p, z, R, feelOffset, feelSize){
    let defs = '', body = '';
    if (z.tint){
      const gid = 'mg_' + Math.random().toString(36).slice(2,9);
      defs += `<radialGradient id="${gid}" cx="50%" cy="50%" r="50%">`
        + `<stop offset="0%" stop-color="${z.tint}" stop-opacity="1"/>`
        + `<stop offset="55%" stop-color="${z.tint}" stop-opacity=".85"/>`
        + `<stop offset="100%" stop-color="${z.tint}" stop-opacity="0"/></radialGradient>`;
      body += `<circle cx="${p.x}" cy="${p.y}" r="${R+48}" fill="url(#${gid})" pointer-events="none"/>`;
    }
    if (z.terrain && TERRAIN_IMGS[z.terrain]){
      body += `<image x="${p.x-R}" y="${p.y-R}" width="${R*2}" height="${R*2}" href="${TERRAIN_IMGS[z.terrain]}" preserveAspectRatio="xMidYMid meet" pointer-events="none"/>`;
    } else {
      body += `<circle cx="${p.x}" cy="${p.y}" r="${R}" fill="rgba(200,196,180,.82)" stroke="#6e83d3" stroke-width="1.5" pointer-events="none"/>`;
    }
    if (z.feeling){
      body += `<text x="${p.x}" y="${p.y+R+feelOffset}" text-anchor="middle" fill="#2a1e14" font-family="ZoesHandwriting,cursive" font-size="${feelSize}" font-weight="bold" pointer-events="none">${esc(z.feeling)}</text>`;
    }
    return { defs, body };
  }

  function buildMapSVG(mapType, zones){
    zones = zones || [];
    const square = (mapType === 'square');
    const positions = square ? SQUARE_ZONE_POS : SPIRAL_ZONE_POS;
    const bg = square ? '../assets/elements/square-1.png' : '../assets/elements/spiral-3.png';
    const R = 36;
    let defs = '', body = '';
    positions.forEach((p,i) => {
      const part = _mapZone(p, zones[i] || {}, R, square ? 14 : 18, square ? 13 : 15);
      defs += part.defs; body += part.body;
    });
    const guides = square ? '' :
      `<line x1="250" y1="0" x2="250" y2="400" stroke="rgba(138,122,90,.15)" stroke-width="1"/>`
      + `<line x1="0" y1="200" x2="500" y2="200" stroke="rgba(138,122,90,.15)" stroke-width="1"/>`;
    return `<svg viewBox="0 0 500 400" xmlns="http://www.w3.org/2000/svg" style="width:100%;height:100%;">`
      + `<defs>${defs}</defs>`
      + guides
      + `<image href="${bg}" x="25" y="10" width="450" height="380" preserveAspectRatio="xMidYMid meet" style="pointer-events:none;"/>`
      + body + `</svg>`;
  }

  // Stationery cards a text note can sit on (mirrors STATIONERY_ITEMS in
  // dream.html — keep in sync if those cards change).
  const STATIONERY_BASE = '../assets/elements/stickers/stationary/';
  const STATIONERY_ITEMS = [
    { key:'airmail-letter',         label:'airmail',       file:'stationary-airmail-letter.png',           box:{l:4.2, t:16.7, w:91.6, h:70.8} },
    { key:'gift-tag-olive',         label:'gift tag',      file:'stationary-gift-tag-olive.png',           box:{l:4.2, t:37.5, w:91.6, h:58.3} },
    { key:'label-bracket-green',    label:'green label',   file:'stationary-label-bracket-green.png',      box:{l:8.3, t:16.7, w:83.4, h:66.6} },
    { key:'label-bracket-navy',     label:'navy label',    file:'stationary-label-bracket-navy.png',       box:{l:12.5,t:12.5, w:75,   h:75} },
    { key:'lace-doily-oval',        label:'lace doily',    file:'stationary-lace-doily-oval-frame.png',    box:{l:25,  t:20.8, w:54.2, h:54.2} },
    { key:'library-card',           label:'library card',  file:'stationary-library-card.png',             box:{l:0,   t:37.5, w:100,  h:62.5} },
    { key:'notecard-daisies',       label:'daisies',       file:'stationary-notecard-daisies.png',         box:{l:4.2, t:8.3,  w:62.5, h:83.4} },
    { key:'notecard-strawberry',    label:'strawberry',    file:'stationary-notecard-strawberry.png',      box:{l:37.5,t:8.3,  w:58.3, h:70.9} },
    { key:'notepaper-cowboy',       label:'cowboy',        file:'stationary-notepaper-cowboy-western.png', box:{l:12.5,t:29.2, w:75,   h:50} },
    { key:'notepaper-mushroom-cat', label:'mushroom cat',  file:'stationary-notepaper-mushroom-cat.png',   box:{l:54.2,t:12.5, w:45.8, h:62.5} },
  ];
  const STATIONERY_FILE = Object.fromEntries(STATIONERY_ITEMS.map(s => [s.key, s.file]));
  const STATIONERY_BOX  = Object.fromEntries(STATIONERY_ITEMS.map(s => [s.key, s.box]));

  // Quadrant geometry for photo placement (matrix %). 2-col grid growing inward
  // from each quadrant's outer corner so photo bodies don't overlap.
  const QUADRANTS = {
    'external-action':  { x0:13, y0:17, dx:+1 },  // top-left  (map)
    'external-feeling': { x0:87, y0:17, dx:-1 },  // top-right (character)
    'internal-action':  { x0:13, y0:61, dx:+1 },  // bottom-left (heart)
    'internal-feeling': { x0:87, y0:61, dx:-1 },  // bottom-right (journal)
  };
  const PHOTO_COLS = 2, PHOTO_COL_GAP = 17, PHOTO_ROW_GAP = 16;
  function photoSlot(quadrant, n){
    const q = QUADRANTS[quadrant] || QUADRANTS['internal-feeling'];
    const col = n % PHOTO_COLS, row = Math.floor(n / PHOTO_COLS);
    return { left: q.x0 + q.dx * col * PHOTO_COL_GAP, top: q.y0 + row * PHOTO_ROW_GAP };
  }

  // Rotate & resize handles — shared by every draggable item kind (photo/
  // sticker/text/map/bingo/char/book). Only emitted when opts.editable.
  function itemHandles(kind, id){
    return `<button class="adv-rotate-handle" type="button" data-kind="${kind}" data-id="${esc(id)}" title="rotate" aria-label="rotate">↻</button>
      <button class="adv-resize-handle" type="button" data-kind="${kind}" data-id="${esc(id)}" title="resize" aria-label="resize">⤢</button>`;
  }

  /* PORTABLE RENDER: data + stable seed string → matrix HTML.
     data = { dateLabel, mapName, mapType, zones, bingoScore(0-24), charState,
              locationData, sidequestData, journalText, matrixImages[],
              matrixLayout{} }
     journalText isn't drawn on the matrix (no preview item) — it's only read
     by callers to prefill the "✎ notes" editor (see showEditNotes below).
     opts = { showEditNotes=false, editable=false }
     editable=true additionally makes every item draggable/rotatable/
     resizable (adv-draggable + handles), adds the +/★/Aa toolbar (the only
     way to add a photo now — there's no separate header button) and the
     explicit "save" button, and adds remove controls to stickers/text notes
     (photos already get one either way — that's existing archive behavior).
     Wire the actual interactions with createMatrixEditor(deps) — buildHTML
     only emits the markup, it never touches Supabase itself.            */
  function buildHTML(data, seedStr, opts){
    data = data || {};
    opts = opts || {};
    const showEditNotes = !!opts.showEditNotes;
    const editable      = !!opts.editable;
    // Class + data-* attrs for a draggable item's wrapper div — '' in
    // non-editable mode, so the div just gets its plain kind class.
    const dragClass = editable ? ' adv-draggable' : '';
    const dragAttrs = (kind, id, itemRot, itemScale) => editable
      ? ` data-kind="${kind}" data-id="${esc(id)}" data-rot="${itemRot}" data-scale="${itemScale}"`
      : '';
    const dragHandles = (kind, id) => editable ? itemHandles(kind, id) : '';

    const rnd = seedRand(seedStr || 'matrix');
    const jit = r => (rnd()*2-1)*r;
    const rot = r => ((rnd()*2-1)*r).toFixed(1);

    // Saved drag/rotate/resize overrides for the map/bingo/char/book items —
    // same matrix_layout jsonb column the live dream/daily matrix pages write
    // to (see their own updateMatrixLayoutItem). Falls back to the seeded
    // jitter position when nothing's been dragged yet, same as photos do.
    // This is a read-only render (no drag handles), so it only ever consumes
    // layout, never writes it.
    const layout = data.matrixLayout || {};

    // ── QUADRANT PROMPTS (opt-in) — when a quadrant has no data yet, render
    // a clickable placeholder instead of the item, and never for callers
    // that don't pass quadrantPrompts (e.g. archive.html's read-only view).
    // opts.lockedQuadrants marks prompts that can't be opened yet (dream.html
    // gates bingo/library/char behind the map/phase quadrant being filled
    // first) — rendered dimmed, non-interactive.
    const quadrantPrompts = opts.quadrantPrompts || null;
    const lockedQuadrants = new Set(opts.lockedQuadrants || []);
    function quadPromptTile(key, has, pos){
      if (!quadrantPrompts || !quadrantPrompts[key] || has) return '';
      const locked = lockedQuadrants.has(key);
      return `<div class="adv-item adv-quad-prompt${locked ? ' locked' : ''}" data-quadrant="${key}" style="left:${pos.x}%;top:${pos.y}%;transform:translate(-50%,-50%);">
          <div class="adv-quad-prompt-text">${esc(quadrantPrompts[key])}</div>
          ${locked ? '<div class="adv-quad-prompt-lock">&#128274;</div>' : ''}
        </div>`;
    }

    // MAP → top-left (external + action): only the day's chosen destination.
    const dayLoc = data.sidequestData || data.locationData || {};
    const hasMap = !!(dayLoc && dayLoc.terrain);
    const mapCap = (data.sidequestData && data.sidequestData.name) || data.mapName || 'my map';
    const mapLayout = layout.map || {};
    const mapLeft  = mapLayout.x != null ? mapLayout.x : (27+jit(2)).toFixed(1);
    const mapTop   = mapLayout.y != null ? mapLayout.y : (30+jit(2)).toFixed(1);
    const mapRot   = mapLayout.rot != null ? mapLayout.rot : rot(3);
    const mapScale = mapLayout.scale || 1;
    const mapItem = (quadrantPrompts && !hasMap) ? '' : `<div class="adv-item adv-map${dragClass}" data-quadrant="map"${dragAttrs('map','map',mapRot,mapScale)} style="left:${mapLeft}%;top:${mapTop}%;transform:translate(-50%,-50%) rotate(${mapRot}deg) scale(${mapScale});">
        <div class="adv-map-svg">${buildSingleLocationSVG(dayLoc)}</div>
        <div class="adv-cap">${esc(mapCap)}</div>
        ${dragHandles('map','map')}</div>`;
    const mapPromptTile = quadPromptTile('map', hasMap, {x:27, y:30});

    // BINGO (heart meter) → bottom-left (internal + action). Vertical striped
    // track with a pixel heart marker riding the fill line — matches the
    // live dream/daily matrix pages' .hm-box widget (see injectStyles below).
    // Once full, swap the whole coded meter out for the custom heart-gold.png
    // artwork (a complete meter graphic, not just a marker) instead.
    const hmScore = data.bingoScore || 0;
    const hmPct = Math.max(0, Math.min(100, Math.round((hmScore/24)*100)));
    const hmFull = hmScore >= 24;
    const hmHeartPos = Math.max(6, Math.min(94, hmPct));
    const bingoLayout = layout.bingo || {};
    const bingoLeft  = bingoLayout.x != null ? bingoLayout.x : (27+jit(2)).toFixed(1);
    const bingoTop   = bingoLayout.y != null ? bingoLayout.y : (71+jit(2)).toFixed(1);
    const bingoRot   = bingoLayout.rot != null ? bingoLayout.rot : rot(3);
    const bingoScale = bingoLayout.scale || 1;
    const hasBingo = hmScore > 0;
    const bingoInner = hmFull
      ? `<img class="hm-full-img" src="../assets/elements/heart-gold.png" alt="bingo complete">`
      : `<div class="hm-box">
          <div class="hm-track"><div class="hm-fill" style="height:${hmPct}%"></div></div>
          <img class="hm-heart" src="../assets/elements/heart-pink.png" alt="heart meter" style="bottom:${hmHeartPos}%">
        </div>`;
    const bingoItem = (quadrantPrompts && !hasBingo) ? '' : `<div class="adv-item adv-bingo${dragClass}" data-quadrant="bingo"${dragAttrs('bingo','bingo',bingoRot,bingoScale)} style="left:${bingoLeft}%;top:${bingoTop}%;transform:translate(-50%,-50%) rotate(${bingoRot}deg) scale(${bingoScale});">
        ${bingoInner}
        ${dragHandles('bingo','bingo')}</div>`;
    const bingoPromptTile = quadPromptTile('bingo', hasBingo, {x:27, y:71});

    // CHARACTER (infinity mirror archetype) → bottom-right (internal + feeling).
    const charStack = buildCharStack(data.charState);
    const charName = (data.charState && data.charState.name) || '';
    const charLayout = layout.char || {};
    const charLeft  = charLayout.x != null ? charLayout.x : (73+jit(2)).toFixed(1);
    const charTop   = charLayout.y != null ? charLayout.y : (71+jit(2)).toFixed(1);
    const charRot   = charLayout.rot != null ? charLayout.rot : rot(3);
    const charScale = charLayout.scale || 1;
    const charItem = charStack ? `<div class="adv-item adv-char${dragClass}" data-quadrant="char"${dragAttrs('char','char',charRot,charScale)} style="left:${charLeft}%;top:${charTop}%;transform:translate(-50%,-50%) rotate(${charRot}deg) scale(${charScale});">${charStack}${charName ? `<div class="adv-cap">${esc(charName)}</div>` : ''}
        ${dragHandles('char','char')}</div>` : '';
    const charPromptTile = quadPromptTile('char', !!charStack, {x:73, y:71});

    // LIBRARY BOOKS tagged to this entry → top-right (external + feeling).
    const bookLayout = layout.books || {};
    const libraryItems = (data.libraryEntries||[]).map((entry, i) => {
      const saved = bookLayout[entry.id] || {};
      const slot = photoSlot('external-feeling', i);
      const left  = saved.x != null ? saved.x : (slot.left+jit(1.5)).toFixed(1);
      const top   = saved.y != null ? saved.y : (slot.top+jit(1.5)).toFixed(1);
      const bRot  = saved.rot != null ? saved.rot : rot(4);
      const bScale = saved.scale || 1;
      const cover = entry.cover_url_override || (entry.media && entry.media.cover_url);
      const title = (entry.media && entry.media.title) || 'untitled';
      return `<div class="adv-item adv-book${dragClass}" data-quadrant="library"${dragAttrs('book',entry.id,bRot,bScale)} style="left:${left}%;top:${top}%;transform:translate(-50%,-50%) rotate(${bRot}deg) scale(${bScale});">
          ${cover ? `<img class="adv-book-cover" src="${esc(cover)}" alt="">` : '<div class="adv-book-noimg"></div>'}
          <div class="adv-cap">${esc(title)}</div>
          ${dragHandles('book', entry.id)}</div>`;
    }).join('');

    // TOOLS tagged to this entry → same top-right quadrant as books, slots
    // continuing on from wherever the book grid left off.
    const toolLayout = layout.tools || {};
    const toolItems = (data.libraryTools||[]).map((tool, i) => {
      const saved = toolLayout[tool.id] || {};
      const slot = photoSlot('external-feeling', (data.libraryEntries||[]).length + i);
      const left  = saved.x != null ? saved.x : (slot.left+jit(1.5)).toFixed(1);
      const top   = saved.y != null ? saved.y : (slot.top+jit(1.5)).toFixed(1);
      const tRot  = saved.rot != null ? saved.rot : rot(4);
      const tScale = saved.scale || 1;
      return `<div class="adv-item adv-tool${dragClass}" data-quadrant="library"${dragAttrs('tool',tool.id,tRot,tScale)} style="left:${left}%;top:${top}%;transform:translate(-50%,-50%) rotate(${tRot}deg) scale(${tScale});">
          ${tool.icon_url ? `<img class="adv-tool-icon" src="${esc(tool.icon_url)}" alt="">` : '<div class="adv-tool-noimg"></div>'}
          <div class="adv-cap">${esc(tool.title||'untitled')}</div>
          ${dragHandles('tool', tool.id)}</div>`;
    }).join('');
    const hasBag = (data.libraryEntries||[]).length > 0 || (data.libraryTools||[]).length > 0;
    const libraryPromptTile = quadPromptTile('library', hasBag, {x:73, y:30});

    // Photos — start out placed inside their assigned quadrant (2-col grid so
    // each photo stays visible), but once a photo has been dragged in the
    // live editor its saved x/y takes over so it stays where it was put.
    const quadCount = {};
    let photos = '';
    (data.matrixImages||[]).forEach(img => {
      if (!img || !img.url) return;
      let left, top, pRot;
      const scale = img.scale || 1;
      if (img.x != null && img.y != null) {
        left = img.x; top = img.y; pRot = img.rot || 0;
      } else {
        const q = QUADRANTS[img.quadrant] ? img.quadrant : 'internal-feeling';
        const n = quadCount[q] || 0; quadCount[q] = n + 1;
        const slot = photoSlot(q, n);
        left = (slot.left+jit(1.5)).toFixed(1); top = (slot.top+jit(1.5)).toFixed(1); pRot = rot(8);
      }
      // Photo removal is existing archive behavior too — always present,
      // not gated on editable (only drag/rotate/resize handles are).
      const removeBtn = `<button class="adv-photo-remove" type="button" data-url="${esc(img.url)}" title="remove photo" aria-label="remove photo">✕</button>`;
      const photoAttrs = `${dragClass}"${dragAttrs('photo',img.url,pRot,scale)}`;
      const photoHandles = dragHandles('photo', img.url);
      if (img.frame === NO_FRAME_KEY) {
        // Clean cutout PNG — no box, no white backing, no cropping.
        photos += `<div class="adv-photo${photoAttrs} style="left:${left}%;top:${top}%;transform:translate(-50%,-50%) rotate(${pRot}deg) scale(${scale});">
            <img class="adv-photo-img-plain" src="${img.url}" alt="" onerror="this.parentElement.style.display='none'">
            ${photoHandles}${removeBtn}</div>`;
      } else {
        const frameFile = PHOTO_FRAME_FILE[img.frame] || PHOTO_FRAME_FILE.polaroid;
        const imgScale = img.imgScale || 1;
        const imgPosX = img.imgPosX != null ? img.imgPosX : 50;
        const imgPosY = img.imgPosY != null ? img.imgPosY : 50;
        const imgRot = img.imgRot || 0;
        photos += `<div class="adv-photo${photoAttrs} style="left:${left}%;top:${top}%;transform:translate(-50%,-50%) rotate(${pRot}deg) scale(${scale});">
            <div class="adv-photo-inner" style="${photoFrameMaskStyle(img.frame)}">
              <img class="adv-photo-img" src="${img.url}" alt="" style="${photoMatteStyle(img.frame)}object-position:${imgPosX}% ${imgPosY}%;transform:rotate(${imgRot}deg) scale(${imgScale});" onerror="this.parentElement.parentElement.style.display='none'">
              <img class="adv-photo-frame" src="${PHOTO_FRAME_BASE}${frameFile}" alt="">
            </div>
            ${photoHandles}${removeBtn}</div>`;
      }
    });

    // Stickers — freeform decorations, placed wherever they were last dragged to.
    let stickers = '';
    (data.matrixStickers||[]).forEach(s => {
      if (!s || !s.url || !s.id) return;
      const sRot = s.rot || 0, sScale = s.scale || 1;
      const removeBtn = editable ? `<button class="adv-sticker-remove" type="button" data-id="${esc(s.id)}" title="remove sticker" aria-label="remove sticker">✕</button>` : '';
      stickers += `<div class="adv-sticker${dragClass}"${dragAttrs('sticker',s.id,sRot,sScale)} style="left:${s.x}%;top:${s.y}%;transform:translate(-50%,-50%) rotate(${sRot}deg) scale(${sScale});"><img src="${s.url}" alt="" onerror="this.parentElement.style.display='none'">${dragHandles('sticker',s.id)}${removeBtn}</div>`;
    });

    // Text notes — freeform, optionally set on a stationery card whose
    // writable rectangle (STATIONERY_BOX) keeps the text off the illustration.
    let texts = '';
    (data.matrixTexts||[]).forEach(t => {
      if (!t || !t.text || !t.id) return;
      const tRot = t.rot || 0, tScale = t.scale || 1;
      const removeBtn = editable ? `<button class="mx-note-remove" type="button" data-id="${esc(t.id)}" title="remove text" aria-label="remove text">✕</button>` : '';
      const noteHandles = dragHandles('text', t.id);
      if (t.postit) {
        texts += `<div class="mx-note postit${dragClass}"${dragAttrs('text',t.id,tRot,tScale)} style="left:${t.x}%;top:${t.y}%;transform:translate(-50%,-50%) rotate(${tRot}deg) scale(${tScale});">${esc(t.text)}
            ${noteHandles}${removeBtn}</div>`;
      } else if (t.stationery && STATIONERY_FILE[t.stationery]) {
        const box = STATIONERY_BOX[t.stationery];
        texts += `<div class="mx-note stationery${dragClass}"${dragAttrs('text',t.id,tRot,tScale)} style="left:${t.x}%;top:${t.y}%;transform:translate(-50%,-50%) rotate(${tRot}deg) scale(${tScale});">
            <img class="mx-note-stationery-img" src="${STATIONERY_BASE}${STATIONERY_FILE[t.stationery]}" alt="">
            <div class="mx-note-stationery-body" style="left:${box.l}%;top:${box.t}%;width:${box.w}%;height:${box.h}%;">${esc(t.text)}</div>
            ${noteHandles}${removeBtn}</div>`;
      } else {
        texts += `<div class="mx-note${dragClass}"${dragAttrs('text',t.id,tRot,tScale)} style="left:${t.x}%;top:${t.y}%;transform:translate(-50%,-50%) rotate(${tRot}deg) scale(${tScale});">${esc(t.text)}
            ${noteHandles}${removeBtn}</div>`;
      }
    });

    // Header buttons (no inline onclick — host wires via attachMatrix).
    const noteBtn = showEditNotes ? `<button class="matrix-edit-notes" type="button">✎ notes</button>` : '';
    // Explicit "save" button — drag/rotate/resize already autosave per-gesture
    // (see createMatrixEditor), but this batches every item's current
    // on-screen position into one write, so rearranging a lot at once can't
    // lose anything to overlapping autosaves.
    const saveBtn = editable ? `<button class="matrix-save-btn" type="button">save</button>` : '';
    // Customize (photo/sticker/text) + journal — centered below the matrix
    // frame. Journal is opt-in (opts.showJournalTool) and can be shown
    // disabled (opts.journalLocked) before there's an entry to attach it to.
    const journalBtn = (editable && opts.showJournalTool)
      ? `<button class="matrix-tool-btn" type="button" data-tool="notes" title="journal"${opts.journalLocked ? ' disabled' : ''}>&#9998;</button>`
      : '';
    const toolbar = editable ? `<div class="matrix-toolbar">
        <button class="matrix-tool-btn matrix-customize-btn" type="button" data-tool="customize" title="customize">
          <img src="../assets/elements/customize.png" alt="">
        </button>
        ${journalBtn}
      </div>` : '';

    const bgStyle = opts.bgImage ? ` style="background:url('${opts.bgImage}') center/cover no-repeat"` : '';
    const frameClass = opts.showFrame ? ' framed' : '';
    return `<div class="step-panel matrix-panel">
      <div class="matrix-header">
        <div class="matrix-header-btns">${noteBtn}${saveBtn}</div>
        <div class="matrix-date">${esc(data.dateLabel||'')}</div>
      </div>
      <div class="matrix-frame${frameClass}">
        <div class="adv-matrix"${bgStyle}>
          <div class="adv-grid"></div>
          <div class="adv-axis adv-axis-x"></div>
          <div class="adv-axis adv-axis-y"></div>
          <div class="adv-axlbl" style="left:50%;top:3.5%;transform:translate(-50%,-50%) translateZ(0);">external</div>
          <div class="adv-axlbl" style="left:96.5%;top:50%;transform:translate(-50%,-50%) translateZ(0);writing-mode:vertical-rl;">feeling</div>
          <div class="adv-axlbl" style="left:50%;top:96.5%;transform:translate(-50%,-50%) translateZ(0);">internal</div>
          <div class="adv-axlbl" style="left:3.5%;top:50%;transform:translate(-50%,-50%) rotate(180deg);writing-mode:vertical-rl;">action</div>
          ${mapItem}${mapPromptTile}${bingoItem}${bingoPromptTile}${charItem}${charPromptTile}${libraryItems}${toolItems}${libraryPromptTile}
          ${photos}
          ${stickers}
          ${texts}
        </div>
      </div>
      ${toolbar}
    </div>`;
  }

  // ── ASSEMBLE: load a matrix row by id → render model ──
  // gameData = { map_name, map_type, map_data } for the row's parent game (dream only).
  // table defaults to 'dream_matrix'; pass 'daily_matrix' for daily entries (no map/zones).
  // dateLabel doubles as the matrix header title (see .matrix-date in
  // buildHTML) and means something different per table: daily shows the
  // entry's calendar date, dream shows the selected map's title (mapName —
  // already available from gameData, no row fetch needed), cosmic has no
  // transit name to draw on here (it isn't stored on the cosmic_matrix row,
  // only transit_id is) so cosmic.html sets dateLabel itself after calling
  // assemble(), the same way it already overrides mapName.
  async function assemble(sb, entryId, gameData, table){
    table = table || 'dream_matrix';
    const g = gameData || {};
    const d = {
      dateLabel: '',
      mapName: g.map_name || (table === 'daily_matrix' ? 'today' : 'my map'),
      mapType: g.map_type || 'spiral',
      zones: (g.map_data || {}).zones || [],
      mapPhase: null, locationData: null, sidequestData: null,
      bingoScore: 0, charState: null, journalText: '', matrixImages: [],
      matrixStickers: [], matrixTexts: [], libraryEntries: [], libraryTools: [],
      matrixLayout: {}, // drag/rotate/resize overrides for map/bingo/char/book/tool — see buildHTML
    };
    if (table === 'dream_matrix') d.dateLabel = d.mapName;
    if (!sb || !entryId) return d;
    try {
      const { data: row } = await sb.from(table).select('*').eq('id', entryId).maybeSingle();
      if (row){
        d.charState     = row.character_data || null;
        d.bingoScore    = (row.bingo_data && row.bingo_data.score) || 0;
        d.mapPhase      = row.map_phase || null;
        d.locationData  = row.location_data || null;
        d.sidequestData = row.sidequest_data || null;
        d.journalText   = (Array.isArray(row.journal_messages)
          ? row.journal_messages.map(m => m && m.text).filter(Boolean).join(' ')
          : '');
        d.matrixImages   = Array.isArray(row.matrix_images) ? row.matrix_images : [];
        d.matrixStickers = Array.isArray(row.matrix_stickers) ? row.matrix_stickers : [];
        d.matrixTexts    = Array.isArray(row.matrix_texts) ? row.matrix_texts : [];
        d.matrixLayout   = row.matrix_layout || {};
        // dateLabel reflects the SAVE's local day, not "today". Daily rows are
        // dated by entry_date (a plain YYYY-MM-DD), so prefer it when present.
        // Dream/cosmic don't use a calendar date as their title (see above).
        if (table === 'daily_matrix') {
          if (row.entry_date) {
            const [y,m,dd] = String(row.entry_date).split('-').map(Number);
            if (y && m && dd) d.dateLabel = new Date(y, m-1, dd)
              .toLocaleDateString('en-US', { weekday:'long', month:'long', day:'numeric' });
          } else if (row.created_at) {
            d.dateLabel = new Date(row.created_at)
              .toLocaleDateString('en-US', { weekday:'long', month:'long', day:'numeric' });
          }
        }
        const libIds  = Array.isArray(row.library_entry_ids) ? row.library_entry_ids : [];
        const saveIds = Array.isArray(row.library_save_ids) ? row.library_save_ids : [];
        const toolIds = Array.isArray(row.library_tool_ids) ? row.library_tool_ids : [];
        const [libRes, saveRes, toolRes] = await Promise.all([
          libIds.length
            ? sb.from('media_submissions').select('id, cover_url_override, media(title, cover_url)').in('id', libIds)
            : Promise.resolve({ data: [] }),
          saveIds.length
            ? sb.from('media_saves').select('id, media(title, cover_url)').in('id', saveIds)
            : Promise.resolve({ data: [] }),
          toolIds.length
            ? sb.from('tools').select('id, title, icon_url').in('id', toolIds)
            : Promise.resolve({ data: [] }),
        ]);
        d.libraryEntries = [...(libRes.data || []), ...(saveRes.data || [])];
        d.libraryTools = toolRes.data || [];
      }
    } catch(e){ /* leave defaults */ }
    return d;
  }

  // ── STORAGE CLEANUP ───────────────────────────────────────
  function photoPathFromUrl(url){
    if (typeof url !== 'string') return null;
    const marker = `/object/public/${BUCKET}/`;
    const i = url.indexOf(marker);
    if (i === -1) return null;
    let p = url.slice(i + marker.length);
    const q = p.indexOf('?'); if (q !== -1) p = p.slice(0, q);
    try { p = decodeURIComponent(p); } catch(e){}
    return p || null;
  }
  async function deletePhotoFiles(sb, urls){
    const paths = (urls || []).map(photoPathFromUrl).filter(Boolean);
    if (!paths.length) return;
    try { await sb.storage.from(BUCKET).remove(paths); }
    catch(err){ console.error('[matrix-render] storage delete failed:', err); }
  }

  // ── EVENT WIRING ──────────────────────────────────────────
  // Delegated listeners on a stable root so they survive innerHTML rebuilds.
  // handlers = { onRemovePhoto(url), onEditNotes, onQuadrantOpen(quadrant) }. Returns cleanup.
  function attachMatrix(rootEl, handlers){
    handlers = handlers || {};
    function onClick(e){
      const rm = e.target.closest('.adv-photo-remove');
      if (rm && rootEl.contains(rm)) { e.stopPropagation(); handlers.onRemovePhoto && handlers.onRemovePhoto(rm.dataset.url); return; }
      const note = e.target.closest('.matrix-edit-notes');
      if (note && rootEl.contains(note)) { handlers.onEditNotes && handlers.onEditNotes(); return; }
      const prompt = e.target.closest('.adv-quad-prompt');
      if (prompt && rootEl.contains(prompt) && !prompt.classList.contains('locked')) {
        handlers.onQuadrantOpen && handlers.onQuadrantOpen(prompt.dataset.quadrant); return;
      }
    }
    rootEl.addEventListener('click', onClick);
    return () => rootEl.removeEventListener('click', onClick);
  }

  // ── MATRIX EDITOR — drag/rotate/resize/pinch on every item, plus the
  // add-photo (with frame + crop/pan/zoom/rotate), add-sticker, and add-text
  // (with stationery) modals, and the explicit save button. This is the full
  // interactive layer buildHTML's opts.editable markup expects to be wired
  // up by. deps = { sb, table, getEntryId(), getUserId(), status(msg,color),
  // onChange() } — onChange() is called after any edit that changes what's
  // on the matrix (add/remove) so the host can re-render from fresh data;
  // drag/rotate/resize/pinch update the DOM directly and autosave without
  // forcing a full re-render (matches dream.html's original behavior). ──
  const MATRIX_ITEM_TABLE = {
    photo:   { column: 'matrix_images',   key: 'url' },
    sticker: { column: 'matrix_stickers', key: 'id'  },
    text:    { column: 'matrix_texts',    key: 'id'  },
  };
  // map/bingo/char are singleton layout slots and book/tool entries are keyed
  // by their media_submissions/tools id — none of them live in their own
  // array column like photos/stickers/text do, so their x/y/rot/scale
  // overrides are stored together in one small matrix_layout jsonb column
  // instead. book entries bucket under layout.books, tools under layout.tools.
  const LAYOUT_KINDS = new Set(['map', 'bingo', 'char', 'book', 'tool']);
  const LAYOUT_BUCKET = { book: 'books', tool: 'tools' };

  function createMatrixEditor(deps){
    deps = deps || {};
    const status = deps.status || function(){};
    const onChange = deps.onChange || function(){};
    const table = deps.table || 'dream_matrix';

    // Set whenever a drag/rotate/resize gesture moves an .adv-draggable —
    // per-gesture autosave (updateMatrixItem) already persists the change,
    // but saveAllPositions is the batched "safe" checkpoint, so callers use
    // this flag to warn before navigating away mid-rearrange.
    let _dirty = false;

    // ── PERSISTENCE ──────────────────────────────────────────
    async function updateMatrixLayoutItem(kind, id, patch){
      const sb = deps.sb, entryId = deps.getEntryId && deps.getEntryId();
      if (!id || !sb || !entryId) return;
      try {
        const { data: row } = await sb.from(table)
          .select('matrix_layout').eq('id', entryId).maybeSingle();
        const layout = (row && row.matrix_layout) || {};
        const bucket = LAYOUT_BUCKET[kind];
        if (bucket) {
          const items = { ...(layout[bucket] || {}) };
          items[id] = { ...(items[id] || {}), ...patch };
          layout[bucket] = items;
        } else {
          layout[kind] = { ...(layout[kind] || {}), ...patch };
        }
        await sb.from(table).update({ matrix_layout: layout }).eq('id', entryId);
      } catch(err){
        console.error(`[matrix-render] layout ${kind} update failed:`, err);
      }
    }
    async function updateMatrixItem(kind, id, patch){
      if (LAYOUT_KINDS.has(kind)) return updateMatrixLayoutItem(kind, id, patch);
      const sb = deps.sb, entryId = deps.getEntryId && deps.getEntryId();
      const cfg = MATRIX_ITEM_TABLE[kind];
      if (!cfg || !id || !sb || !entryId) return;
      try {
        const { data: row } = await sb.from(table)
          .select(cfg.column).eq('id', entryId).maybeSingle();
        const items = Array.isArray(row && row[cfg.column]) ? row[cfg.column] : [];
        const next = items.map(i => (i && i[cfg.key] === id) ? { ...i, ...patch } : i);
        await sb.from(table).update({ [cfg.column]: next }).eq('id', entryId);
      } catch(err){
        console.error(`[matrix-render] ${kind} update failed:`, err);
      }
    }

    // Explicit "save" button — reads every .adv-draggable's current on-screen
    // position/rotation/scale straight from the DOM (scoped to rootEl) and
    // writes it all in one update, atomically.
    async function saveAllPositions(rootEl){
      const sb = deps.sb, entryId = deps.getEntryId && deps.getEntryId();
      if (!sb || !entryId) return;
      const btn = rootEl.querySelector('.matrix-save-btn');
      if (btn) { btn.disabled = true; btn.textContent = 'saving…'; }
      try {
        const { data: row, error: readErr } = await sb.from(table)
          .select('matrix_images, matrix_stickers, matrix_texts, matrix_layout')
          .eq('id', entryId).maybeSingle();
        if (readErr) throw readErr;
        const images   = Array.isArray(row && row.matrix_images)   ? row.matrix_images.map(i => ({ ...i }))   : [];
        const stickers = Array.isArray(row && row.matrix_stickers) ? row.matrix_stickers.map(i => ({ ...i })) : [];
        const texts    = Array.isArray(row && row.matrix_texts)    ? row.matrix_texts.map(i => ({ ...i }))    : [];
        const layout   = { ...((row && row.matrix_layout) || {}) };
        if (layout.books) layout.books = { ...layout.books };
        if (layout.tools) layout.tools = { ...layout.tools };

        rootEl.querySelectorAll('.adv-draggable').forEach(el => {
          const kind = el.dataset.kind, id = el.dataset.id;
          const x = parseFloat(el.style.left), y = parseFloat(el.style.top);
          if (!kind || !id || Number.isNaN(x) || Number.isNaN(y)) return;
          const rot = parseFloat(el.dataset.rot || '0');
          const scale = parseFloat(el.dataset.scale || '1');

          if (LAYOUT_KINDS.has(kind)) {
            const bucket = LAYOUT_BUCKET[kind];
            if (bucket) {
              layout[bucket] = layout[bucket] || {};
              layout[bucket][id] = { ...(layout[bucket][id] || {}), x, y, rot, scale };
            } else {
              layout[kind] = { ...(layout[kind] || {}), x, y, rot, scale };
            }
            return;
          }
          const cfg = MATRIX_ITEM_TABLE[kind];
          if (!cfg) return;
          const arr = cfg.column === 'matrix_images' ? images : cfg.column === 'matrix_stickers' ? stickers : texts;
          const idx = arr.findIndex(i => i && i[cfg.key] === id);
          if (idx !== -1) arr[idx] = { ...arr[idx], x, y, rot, scale };
        });

        const { error } = await sb.from(table).update({
          matrix_images: images, matrix_stickers: stickers, matrix_texts: texts, matrix_layout: layout,
        }).eq('id', entryId);
        if (error) throw error;
        _dirty = false;
        status('scrapbook saved ✓', '#6ab86a');
        if (window.HGModal) {
          HGModal.action('saved!', 'your matrix is saved! want to review your progress?', { label: 'archive →' })
            .then(go => { if (go) window.location.href = 'archive.html'; });
        }
      } catch(err){
        console.error('[matrix-render] save failed:', err);
        status('save failed — try again', '#E8478B');
      } finally {
        if (btn) { btn.disabled = false; btn.textContent = 'save'; }
      }
    }

    // ── DRAG / ROTATE / RESIZE / PINCH — scoped to whichever rootEl the host
    // calls attachInteractions() on (the live element containing the matrix,
    // rebuilt on every render — so state below is per-attach, not module-
    // global, and stale listeners never pile up across re-renders). ──
    function attachInteractions(rootEl){
      let dragState = null, rotateState = null, resizeState = null;

      rootEl.addEventListener('pointerdown', e => {
        const item = e.target.closest('.adv-draggable');
        rootEl.querySelectorAll('.adv-draggable.selected').forEach(el => {
          if (el !== item) el.classList.remove('selected');
        });
        if (item) item.classList.add('selected');
      });

      // DOUBLE-CLICK a placed quadrant item (map/bingo/char/book/tool) to
      // reopen that quadrant's popup and redo the choice.
      rootEl.addEventListener('dblclick', e => {
        const item = e.target.closest('.adv-draggable[data-quadrant]');
        if (item) deps.onQuadrantOpen && deps.onQuadrantOpen(item.dataset.quadrant);
      });

      // DRAG-TO-REPOSITION
      rootEl.addEventListener('pointerdown', e => {
        if (e.target.closest('.adv-photo-remove, .adv-sticker-remove, .mx-note-remove, .adv-rotate-handle, .adv-resize-handle')) return;
        const el = e.target.closest('.adv-draggable');
        if (!el) return;
        const frame = el.closest('.matrix-frame');
        if (!frame) return;
        el.setPointerCapture(e.pointerId);
        el.classList.add('dragging');
        dragState = { el, frame, pointerId: e.pointerId, kind: el.dataset.kind, id: el.dataset.id, lastX: null, lastY: null };
        e.preventDefault();
      });
      rootEl.addEventListener('pointermove', e => {
        if (!dragState || dragState.pointerId !== e.pointerId) return;
        const rect = dragState.frame.getBoundingClientRect();
        let x = ((e.clientX - rect.left) / rect.width) * 100;
        let y = ((e.clientY - rect.top) / rect.height) * 100;
        x = Math.max(2, Math.min(98, x));
        y = Math.max(2, Math.min(98, y));
        dragState.el.style.left = x + '%';
        dragState.el.style.top  = y + '%';
        dragState.lastX = x; dragState.lastY = y;
      });
      rootEl.addEventListener('pointerup', e => {
        if (!dragState || dragState.pointerId !== e.pointerId) return;
        const { el, kind, id, lastX, lastY } = dragState;
        el.classList.remove('dragging');
        dragState = null;
        if (lastX == null) return; // tapped without moving — nothing changed
        _dirty = true;
        updateMatrixItem(kind, id, { x: lastX, y: lastY });
      });

      // ROTATE handle
      rootEl.addEventListener('pointerdown', e => {
        const handle = e.target.closest('.adv-rotate-handle');
        if (!handle) return;
        e.stopPropagation(); e.preventDefault();
        const el = handle.closest('.adv-draggable');
        if (!el) return;
        handle.setPointerCapture(e.pointerId);
        el.classList.add('dragging');
        const rect = el.getBoundingClientRect();
        rotateState = {
          el, pointerId: e.pointerId, kind: handle.dataset.kind, id: handle.dataset.id,
          cx: rect.left + rect.width/2, cy: rect.top + rect.height/2,
          startAngle: Math.atan2(e.clientY - (rect.top+rect.height/2), e.clientX - (rect.left+rect.width/2)) * 180/Math.PI,
          startRot: parseFloat(el.dataset.rot || '0'),
          scale: parseFloat(el.dataset.scale || '1'),
          lastRot: null,
        };
      });
      rootEl.addEventListener('pointermove', e => {
        if (!rotateState || rotateState.pointerId !== e.pointerId) return;
        const s = rotateState;
        const angle = Math.atan2(e.clientY - s.cy, e.clientX - s.cx) * 180/Math.PI;
        let rot = s.startRot + (angle - s.startAngle);
        rot = ((rot + 180) % 360 + 360) % 360 - 180;
        rot = +rot.toFixed(1);
        s.el.style.transform = `translate(-50%,-50%) rotate(${rot}deg) scale(${s.scale})`;
        s.lastRot = rot;
      });
      rootEl.addEventListener('pointerup', e => {
        if (!rotateState || rotateState.pointerId !== e.pointerId) return;
        const { el, kind, id, lastRot } = rotateState;
        el.classList.remove('dragging');
        rotateState = null;
        if (lastRot == null) return;
        el.dataset.rot = lastRot;
        _dirty = true;
        updateMatrixItem(kind, id, { rot: lastRot });
      });

      // RESIZE handle
      rootEl.addEventListener('pointerdown', e => {
        const handle = e.target.closest('.adv-resize-handle');
        if (!handle) return;
        e.stopPropagation(); e.preventDefault();
        const el = handle.closest('.adv-draggable');
        if (!el) return;
        handle.setPointerCapture(e.pointerId);
        el.classList.add('dragging');
        const rect = el.getBoundingClientRect();
        const cx = rect.left + rect.width/2, cy = rect.top + rect.height/2;
        resizeState = {
          el, pointerId: e.pointerId, kind: handle.dataset.kind, id: handle.dataset.id,
          cx, cy, startDist: Math.max(10, Math.hypot(e.clientX-cx, e.clientY-cy)),
          startScale: parseFloat(el.dataset.scale || '1'),
          rot: parseFloat(el.dataset.rot || '0'),
          lastScale: null,
        };
      });
      rootEl.addEventListener('pointermove', e => {
        if (!resizeState || resizeState.pointerId !== e.pointerId) return;
        const s = resizeState;
        const dist = Math.hypot(e.clientX - s.cx, e.clientY - s.cy);
        let scale = s.startScale * (dist / s.startDist);
        scale = +Math.max(0.4, Math.min(2.5, scale)).toFixed(2);
        s.el.style.transform = `translate(-50%,-50%) rotate(${s.rot}deg) scale(${scale})`;
        s.lastScale = scale;
      });
      rootEl.addEventListener('pointerup', e => {
        if (!resizeState || resizeState.pointerId !== e.pointerId) return;
        const { el, kind, id, lastScale } = resizeState;
        el.classList.remove('dragging');
        resizeState = null;
        if (lastScale == null) return;
        el.dataset.scale = lastScale;
        _dirty = true;
        updateMatrixItem(kind, id, { scale: lastScale });
      });

      // ── click delegation for this rootEl: save button, toolbar, remove
      // buttons for stickers/text (photo remove is handled by the host's own
      // attachMatrix, same as it always has been). ──
      rootEl.addEventListener('click', e => {
        const saveBtn = e.target.closest('.matrix-save-btn');
        if (saveBtn) { saveAllPositions(rootEl); return; }
        const tool = e.target.closest('.matrix-tool-btn');
        if (tool) {
          const kind = tool.dataset.tool;
          if (kind === 'customize') {
            if (deps.onPhotoBlocked && deps.onPhotoBlocked()) return;
            customizePanel.open();
          }
          else if (kind === 'notes') deps.onOpenJournal && deps.onOpenJournal();
          return;
        }
        const stickerBtn = e.target.closest('.adv-sticker-remove');
        if (stickerBtn) { e.stopPropagation(); removeMatrixSticker(stickerBtn.dataset.id); return; }
        const textBtn = e.target.closest('.mx-note-remove');
        if (textBtn) { e.stopPropagation(); removeMatrixText(textBtn.dataset.id); return; }
      });
    }

    // ── customize modal (photo/sticker/text) — UI lives in
    // assets/js/matrix-customize.js (MatrixCustomize.createPanel); these are
    // just the persistence callbacks it calls into. ──
    async function uploadMatrixPhoto({ file, frame, imgScale, imgPosX, imgPosY, imgRot }){
      const sb = deps.sb, entryId = deps.getEntryId && deps.getEntryId(), userId = deps.getUserId && deps.getUserId();
      if (!userId) throw new Error('sign in to save photos');
      const ext = (file.name.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g,'') || 'jpg';
      const path = `${userId}/${entryId}/${crypto.randomUUID()}.${ext}`;
      const { error: upErr } = await sb.storage.from(BUCKET).upload(path, file, { contentType: file.type, upsert: false });
      if (upErr) throw upErr;
      const { data: pub } = sb.storage.from(BUCKET).getPublicUrl(path);
      const publicUrl = pub && pub.publicUrl;
      if (!publicUrl) throw new Error('could not resolve image url');
      const { data: row, error: readErr } = await sb.from(table).select('matrix_images').eq('id', entryId).maybeSingle();
      if (readErr) throw readErr;
      const current = Array.isArray(row && row.matrix_images) ? row.matrix_images : [];
      const next = [...current, {
        url: publicUrl, frame,
        imgScale, imgPosX, imgPosY, imgRot,
        x: +(20 + Math.random()*60).toFixed(1), y: +(20 + Math.random()*60).toFixed(1), rot: +((Math.random()*2-1)*8).toFixed(1),
      }];
      const { error: updErr } = await sb.from(table).update({ matrix_images: next }).eq('id', entryId);
      if (updErr) throw updErr;
      onChange();
    }

    async function removeMatrixPhoto(url){
      const sb = deps.sb, entryId = deps.getEntryId && deps.getEntryId();
      if (!url || !sb || !entryId) return;
      try {
        const { data: row } = await sb.from(table).select('matrix_images').eq('id', entryId).maybeSingle();
        const imgs = Array.isArray(row && row.matrix_images) ? row.matrix_images : [];
        const next = imgs.filter(i => !(i && i.url === url));
        if (next.length === imgs.length) { onChange(); return; }
        const { error } = await sb.from(table).update({ matrix_images: next }).eq('id', entryId);
        if (error) throw error;
      } catch(err) {
        console.error('[matrix-render] photo remove failed:', err);
        status('couldn’t remove photo — try again', '#E8478B');
        return;
      }
      await deletePhotoFiles(sb, [url]);
      status('photo removed', '#7a86bb');
      onChange();
    }

    async function addMatrixSticker(url){
      const sb = deps.sb, entryId = deps.getEntryId && deps.getEntryId();
      if (!sb || !entryId) throw new Error('sign in to save stickers');
      const entry = { id: crypto.randomUUID(), url, x: +(20 + Math.random()*60).toFixed(1), y: +(20 + Math.random()*60).toFixed(1), rot: +((Math.random()*2-1)*15).toFixed(1) };
      const { data: row, error: readErr } = await sb.from(table).select('matrix_stickers').eq('id', entryId).maybeSingle();
      if (readErr) throw readErr;
      const current = Array.isArray(row && row.matrix_stickers) ? row.matrix_stickers : [];
      const { error: updErr } = await sb.from(table).update({ matrix_stickers: [...current, entry] }).eq('id', entryId);
      if (updErr) throw updErr;
      onChange();
    }

    async function removeMatrixSticker(id){
      const sb = deps.sb, entryId = deps.getEntryId && deps.getEntryId();
      if (!id || !sb || !entryId) return;
      try {
        const { data: row } = await sb.from(table).select('matrix_stickers').eq('id', entryId).maybeSingle();
        const items = Array.isArray(row && row.matrix_stickers) ? row.matrix_stickers : [];
        const next = items.filter(s => s && s.id !== id);
        const { error } = await sb.from(table).update({ matrix_stickers: next }).eq('id', entryId);
        if (error) throw error;
      } catch(err) {
        console.error('[matrix-render] sticker remove failed:', err);
        status('couldn’t remove sticker — try again', '#E8478B');
        return;
      }
      status('sticker removed', '#7a86bb');
      onChange();
    }

    async function addMatrixText({ text, stationery, scale }){
      const sb = deps.sb, entryId = deps.getEntryId && deps.getEntryId();
      if (!sb || !entryId) throw new Error('sign in to save text');
      const entry = { id: crypto.randomUUID(), text, x: +(20 + Math.random()*60).toFixed(1), y: +(20 + Math.random()*60).toFixed(1), rot: +((Math.random()*2-1)*8).toFixed(1), scale: scale || 1 };
      if (stationery) entry.stationery = stationery;
      const { data: row, error: readErr } = await sb.from(table).select('matrix_texts').eq('id', entryId).maybeSingle();
      if (readErr) throw readErr;
      const current = Array.isArray(row && row.matrix_texts) ? row.matrix_texts : [];
      const { error: updErr } = await sb.from(table).update({ matrix_texts: [...current, entry] }).eq('id', entryId);
      if (updErr) throw updErr;
      onChange();
    }

    async function removeMatrixText(id){
      const sb = deps.sb, entryId = deps.getEntryId && deps.getEntryId();
      if (!id || !sb || !entryId) return;
      try {
        const { data: row } = await sb.from(table).select('matrix_texts').eq('id', entryId).maybeSingle();
        const items = Array.isArray(row && row.matrix_texts) ? row.matrix_texts : [];
        const next = items.filter(t => t && t.id !== id);
        const { error } = await sb.from(table).update({ matrix_texts: next }).eq('id', entryId);
        if (error) throw error;
      } catch(err) {
        console.error('[matrix-render] text remove failed:', err);
        status('couldn’t remove text — try again', '#E8478B');
        return;
      }
      status('text removed', '#7a86bb');
      onChange();
    }

    const customizePanel = MatrixCustomize.createPanel({
      showAlbum: false,
      onUploadPhoto: uploadMatrixPhoto,
      onAddSticker: addMatrixSticker,
      onAddText: addMatrixText,
      status,
    });

    function destroy(){
      customizePanel.destroy();
    }

    return {
      attachInteractions, saveAllPositions,
      openCustomize: (tab) => customizePanel.open(tab),
      removeMatrixPhoto, removeMatrixSticker, removeMatrixText,
      isDirty: () => _dirty,
      destroy,
    };
  }

  // ── STYLES (injected once; var() fallbacks make it self-sufficient) ──
  function injectStyles(){
    if (document.getElementById('matrix-render-styles')) return;
    const css = `
.matrix-panel { padding:0; overflow:hidden; justify-content:flex-start; align-items:stretch; position:relative; }
.matrix-panel.step-panel { width:100%; height:100%; display:flex; flex-direction:column; font-family:var(--font-hand,"ZoesHandwriting",cursive); }
/* Header is a two-row column: buttons (notes/save) right-aligned on top,
   title/date centered underneath — the title sits on its own full-width
   row so a long one (e.g. a dream map's title) can wrap without the fixed-
   height old layout clipping the second line, and stays centered whether
   it wraps or not. */
.matrix-header { position:relative; flex-shrink:0; display:flex; flex-direction:column; padding-top:6px; }
.matrix-header-btns { display:flex; justify-content:flex-end; align-items:center; gap:8px; min-height:30px; padding:0 12px; }
.matrix-header-btns:empty { display:none; }
.matrix-date {
  font-family:var(--font-hand,"ZoesHandwriting",cursive); font-size:clamp(28px,3.8vw,46px); color:#3a4aaa;
  text-align:center; line-height:1.1; padding:2px 12px 4px;
}
.matrix-edit-notes {
  font-family:var(--font-hand,"ZoesHandwriting",cursive); font-size:clamp(12px,1.3vw,15px);
  color:#fff; background:var(--blue,#6e83d3); border:2px solid #4a5bc4;
  box-shadow:2px 2px 0 #3a4aaa; padding:5px 14px; cursor:pointer; transition:all .05s;
}
.matrix-edit-notes:hover { background:#4a5bc4; }
.matrix-edit-notes:active { box-shadow:none; transform:translate(2px,2px); }
.matrix-frame {
  width:76%; height:76%; margin:auto; align-self:center;
  position:relative; overflow:visible;
}
.adv-matrix { position:absolute; top:0; left:0; width:100%; height:100%; overflow:visible; background:transparent; }
.adv-grid {
  position:absolute; top:0; left:0; width:100%; height:100%; pointer-events:none;
  background-image:
    linear-gradient(to right, rgba(184,168,138,.13) 1px, transparent 1px),
    linear-gradient(to bottom, rgba(184,168,138,.13) 1px, transparent 1px);
  background-size:38px 38px;
}
.adv-axis { position:absolute; background:rgba(184,168,138,.5); pointer-events:none; }
.adv-axis-x { left:6%; right:6%; top:50%; height:1.5px; }
.adv-axis-y { top:7%; bottom:7%; left:50%; width:1.5px; }
.adv-axlbl {
  position:absolute; z-index:5; white-space:nowrap;
  font-family:var(--font-hand,"ZoesHandwriting",cursive); color:#3a4aaa; letter-spacing:.5px;
  font-size:clamp(14px,1.9vw,23px);
}
.adv-item { position:absolute; z-index:3; text-align:center; }
.adv-cap  { font-family:var(--font-hand,"ZoesHandwriting",cursive); font-size:clamp(10px,1.1vw,13px); color:#7a86bb; margin-top:3px; }
.adv-map { width:clamp(150px,20vw,240px); }
.adv-map-svg { width:100%; aspect-ratio:5/4; }
.adv-map-svg svg { width:100%; height:100%; }
.adv-bingo { width:clamp(46px,5.5vw,64px); }
/* Vertical heart meter — matches the live dream/daily matrix pages' .hm-box
   widget: a striped meter-track (fills bottom-to-top) inside a bezel frame,
   with the pixel heart riding on top of the fill line as a marker. Once full,
   the whole coded meter is swapped for the custom heart-gold.png artwork
   (.hm-full-img below), which is itself a complete meter graphic. */
.hm-box {
  position:relative; width:100%; padding:4px; box-sizing:border-box;
  border:3px solid var(--blue,#6e83d3);
  background:#e5e8f5; border-radius:2px;
}
.hm-track {
  position:relative; width:100%; height:clamp(90px,11vw,140px);
  box-sizing:border-box; overflow:hidden;
  border:3px solid var(--blue,#6e83d3);
  background:#cdd3ec;
}
.hm-fill {
  position:absolute; left:0; right:0; bottom:0; width:100%;
  background:repeating-linear-gradient(0deg, #6f84d3 0px, #6f84d3 16px, #9aa9e0 16px, #9aa9e0 18px);
}
.hm-full-img { display:block; width:100%; height:auto; }
.hm-heart {
  position:absolute; left:50%; width:68%; z-index:2;
  transform:translate(-50%,50%); image-rendering:pixelated;
  filter:drop-shadow(0 1px 2px rgba(0,0,0,.35));
}
.adv-char { width:clamp(90px,11vw,140px); }
.adv-char-stack { position:relative; width:100%; aspect-ratio:1; }
.adv-char-stack img { position:absolute; inset:0; width:100%; height:100%; object-fit:contain; }
.adv-book { width:clamp(56px,7vw,86px); }
.adv-book-cover, .adv-book-noimg { width:100%; aspect-ratio:2/3; display:block; border:2px solid #fff; box-shadow:2px 3px 6px rgba(0,0,0,.25); }
.adv-book-cover { object-fit:cover; }
.adv-book-noimg { background:#ccc; display:flex; align-items:center; justify-content:center; font-family:var(--font-hand,"ZoesHandwriting",cursive); font-size:11px; color:#666; padding:4px; text-align:center; }
.adv-quad-prompt {
  width:clamp(120px,15vw,180px); box-sizing:border-box; cursor:pointer;
  padding:16px 12px; background:rgba(255,255,255,.55);
  border:2px dashed var(--blue,#6e83d3); border-radius:6px;
  transition:background .12s, border-color .12s;
}
.adv-quad-prompt:hover { background:rgba(255,255,255,.85); border-style:solid; }
.adv-quad-prompt-text { font-family:var(--font-hand,"ZoesHandwriting",cursive); font-size:clamp(13px,1.6vw,18px); color:#3a4aaa; }
.adv-quad-prompt.locked { cursor:default; opacity:.45; border-style:solid; border-color:#bbb; }
.adv-quad-prompt.locked .adv-quad-prompt-text { color:#999; }
.adv-quad-prompt-lock { margin-top:4px; font-size:14px; }
.adv-tool { width:clamp(56px,7vw,80px); }
.adv-tool-icon { width:100%; aspect-ratio:1/1; display:block; object-fit:contain; }
.adv-tool-noimg { width:100%; aspect-ratio:1/1; display:block; background:#ccc; box-sizing:border-box; }
.adv-photo { position:absolute; z-index:3; width:clamp(74px,9vw,118px); }
/* Fixed-ratio box (matches the standard polaroid frame's own proportions) —
   the photo fills it edge-to-edge via object-fit:cover, so it always fills
   the frame properly: a white base shows through if the image doesn't fully
   cover, and anything outside the box is clipped rather than overflowing. */
.adv-photo-inner {
  position:relative; display:block; width:100%; aspect-ratio:602/691;
  background:#fff; overflow:hidden; box-shadow:2px 3px 7px rgba(0,0,0,.18);
}
/* Positioned per-frame via photoMatteStyle() to sit inside the frame's window
   with a margin — the .adv-photo-inner background shows through as a matte. */
.adv-photo-img { position:absolute; display:block; pointer-events:none; object-fit:cover; }
/* Frame overlay — stretched to exactly match the photo box, so its border
   sits on top and crops whatever falls outside its window. */
.adv-photo-frame { position:absolute; inset:0; width:100%; height:100%; pointer-events:none; }
/* "no frame" — no box, no white backing, no cropping: shows a clean cutout
   PNG exactly as uploaded, same sizing convention the photo tool used
   pre-frames. */
.adv-photo-img-plain {
  width:100%; height:auto; max-height:clamp(96px,11.5vw,150px); display:block;
  pointer-events:none; object-fit:contain; box-shadow:2px 3px 7px rgba(0,0,0,.18);
}
.adv-photo-remove {
  position:absolute; top:-8px; right:-8px; z-index:4;
  width:20px; height:20px; padding:0; line-height:1;
  background:#fff; border:1.5px solid #ccc; border-radius:50%;
  color:#888; font-size:11px; cursor:pointer;
  display:flex; align-items:center; justify-content:center;
  opacity:0; transition:opacity .12s, color .12s, border-color .12s;
}
.adv-photo:hover .adv-photo-remove, .adv-photo.selected .adv-photo-remove { opacity:1; }
.adv-photo-remove:hover { color:#E8478B; border-color:#E8478B; }
@media (hover: none) { .adv-photo.selected .adv-photo-remove { opacity:1; } }
.adv-sticker { position:absolute; z-index:4; width:clamp(56px,7vw,86px); }
.adv-sticker img { width:100%; height:auto; display:block; pointer-events:none; filter:drop-shadow(2px 3px 4px rgba(0,0,0,.18)); }
.mx-note {
  position:absolute; z-index:4; max-width:220px;
  font-family:var(--font-hand,"ZoesHandwriting",cursive); font-size:clamp(20px,2.2vw,30px); color:#3a2e1e;
  text-align:center; line-height:1.2; word-break:break-word;
}
.mx-note.stationery { max-width:none; width:clamp(150px,17vw,260px); text-align:center; }
.mx-note.postit {
  max-width:none; width:clamp(90px,10vw,130px); aspect-ratio:1/1; box-sizing:border-box;
  background:#dfe2ef; box-shadow:2px 3px 6px rgba(0,0,0,.18);
  display:flex; align-items:center; justify-content:center; padding:10px;
  font-size:clamp(14px,1.6vw,18px);
}
.mx-note-stationery-img { width:100%; height:auto; display:block; pointer-events:none; }
.mx-note-stationery-body {
  position:absolute; overflow:hidden; text-align:center; word-break:break-word; white-space:pre-wrap;
  display:flex; align-items:center; justify-content:center;
  font-family:var(--font-hand,"ZoesHandwriting",cursive); color:#3a2e1e; line-height:1.25; font-size:clamp(11px,1.2vw,15px);
}

/* ── EDITABLE MODE — drag/rotate/resize handles, toolbar, save button, and
   sticker/text remove controls. Only ever rendered when opts.editable, and
   only functional once createMatrixEditor's attachInteractions() is wired
   up (see matrix-render.js's MATRIX EDITOR section). ── */
.adv-rotate-handle, .adv-resize-handle {
  position:absolute; z-index:4;
  width:24px; height:24px; padding:0; line-height:1;
  background:#fff; border:1.5px solid #ccc; border-radius:50%;
  color:#888; font-size:13px; touch-action:none;
  display:flex; align-items:center; justify-content:center;
  opacity:0; transition:opacity .12s, color .12s, border-color .12s;
}
.adv-rotate-handle { top:-10px; left:-10px; cursor:grab; }
.adv-resize-handle { bottom:-10px; right:-10px; cursor:nwse-resize; }
/* .adv-draggable marks every item that can be dragged/rotated/resized —
   scrapbook items (photo/sticker/text) AND game items (map/bingo/char/book) —
   so this reveal rule and the JS selectors don't need one line per kind. */
.adv-draggable:hover .adv-rotate-handle, .adv-draggable:hover .adv-resize-handle,
.adv-draggable.selected .adv-rotate-handle, .adv-draggable.selected .adv-resize-handle { opacity:1; }
.adv-rotate-handle:hover, .adv-resize-handle:hover { color:var(--blue,#6e83d3); border-color:var(--blue,#6e83d3); }
.adv-draggable { cursor:grab; touch-action:none; }
.adv-item.adv-draggable.dragging { cursor:grabbing; z-index:60; }
/* Touch has no hover state to reveal the handles with, so show them
   unconditionally there (same pattern as the remove buttons below) — and
   size them up, since a 20px target is hard to land a fingertip on. */
@media (hover: none) { .adv-draggable.selected .adv-rotate-handle, .adv-draggable.selected .adv-resize-handle { opacity:1; } }
@media (pointer: coarse) {
  .adv-rotate-handle, .adv-resize-handle { width:32px; height:32px; font-size:17px; }
  .adv-rotate-handle { top:-15px; left:-15px; }
  .adv-resize-handle { bottom:-15px; right:-15px; }
}
.adv-sticker-remove, .mx-note-remove {
  position:absolute; top:-8px; right:-8px; z-index:4;
  width:20px; height:20px; padding:0; line-height:1;
  background:#fff; border:1.5px solid #ccc; border-radius:50%;
  color:#888; font-size:11px; cursor:pointer;
  display:flex; align-items:center; justify-content:center;
  opacity:0; transition:opacity .12s, color .12s, border-color .12s;
}
.adv-sticker:hover .adv-sticker-remove, .adv-sticker.selected .adv-sticker-remove,
.mx-note:hover .mx-note-remove, .mx-note.selected .mx-note-remove { opacity:1; }
.adv-sticker-remove:hover, .mx-note-remove:hover { color:#E8478B; border-color:#E8478B; }
@media (hover: none) { .adv-sticker.selected .adv-sticker-remove, .mx-note.selected .mx-note-remove { opacity:1; } }

/* Matrix toolbar — add photo / sticker / text, centered below the matrix */
.matrix-toolbar { display:flex; gap:10px; justify-content:center; align-self:center; margin-top:14px; flex-shrink:0; }
.matrix-tool-btn {
  width:40px; height:40px; border-radius:50%;
  font-size:22px; line-height:1; color:var(--blue,#6e83d3);
  background:#fff; border:none;
  box-shadow:0 2px 8px rgba(0,0,0,0.18);
  cursor:pointer; transition:all .1s;
  display:flex; align-items:center; justify-content:center;
}
.matrix-tool-btn:hover  { background:var(--blue,#6e83d3); color:#fff; box-shadow:0 3px 12px rgba(0,0,0,0.25); }
.matrix-tool-btn:active { transform:scale(0.93); }
.matrix-tool-btn:disabled { opacity:.4; cursor:not-allowed; box-shadow:none; }
.matrix-tool-btn:disabled:hover { background:#fff; color:var(--blue,#6e83d3); }
/* customize.png is already a complete self-contained icon graphic — no extra
   button chrome around it (matches rooms/bed.html's wall-customize-btn). */
.matrix-customize-btn {
  width:auto; height:auto; border-radius:0; background:none; box-shadow:none; transition:transform .1s;
}
.matrix-customize-btn:hover { background:none; box-shadow:none; transform:scale(1.08); }
.matrix-customize-btn:active { transform:scale(0.96); }
.matrix-customize-btn img { width:40px; height:40px; object-fit:contain; }

/* Explicit save — top-right of the matrix header, above the date.
   Drag/rotate/resize already autosave per-gesture, but this batches every
   item's current on-screen position into one write, so rearranging a lot at
   once can't lose anything to overlapping autosaves. */
.matrix-save-btn {
  font-family:var(--font-hand,"ZoesHandwriting",cursive); font-size:15px; color:#fff;
  background:var(--blue,#6e83d3); border:2px solid #4a5bc4; box-shadow:2px 2px 0 #3a4aaa;
  padding:5px 14px; cursor:pointer; transition:all .05s;
}
.matrix-save-btn:hover  { background:#4a5bc4; }
.matrix-save-btn:active { box-shadow:none; transform:translate(2px,2px); }
.matrix-save-btn:disabled { opacity:.6; cursor:default; transform:none; box-shadow:2px 2px 0 #3a4aaa; }
`;
    const style = document.createElement('style');
    style.id = 'matrix-render-styles';
    style.textContent = css;
    document.head.appendChild(style);
  }

  injectStyles();

  // ── PUBLIC API ────────────────────────────────────────────
  window.MatrixRender = {
    assemble,
    buildHTML,
    attachMatrix,
    createMatrixEditor,
    buildMapSVG,
    buildCharStack,
    // exposed for reuse/testing
    CHAR_FULL_ASSETS,
    TERRAIN_IMGS,
    buildSingleLocationSVG,
    PHOTO_FRAME_BASE,
    PHOTO_FRAME_MASK_BASE,
    PHOTO_FRAMES,
    PHOTO_FRAME_FILE,
    PHOTO_FRAME_MASK_FILE,
    photoFrameMaskStyle,
    PHOTO_FRAME_WINDOW,
    photoMatteStyle,
    NO_FRAME_KEY,
    STATIONERY_BASE,
    STATIONERY_ITEMS,
    STATIONERY_FILE,
    STATIONERY_BOX,
  };
})();
