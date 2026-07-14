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

  const TERRAIN_IMGS = {
    pond:"../assets/elements/maps/pond.png", waterfall:"../assets/elements/maps/waterfall.png",
    spring:"../assets/elements/maps/spring.png", river:"../assets/elements/maps/river.png",
    ocean:"../assets/elements/maps/ocean.png", glacier:"../assets/elements/maps/glacier.png",
    marsh:"../assets/elements/maps/marsh.png", dunes:"../assets/elements/maps/dunes.png",
    mountains:"../assets/elements/maps/mountains.png", cave:"../assets/elements/maps/cave.png",
    cliff:"../assets/elements/maps/cliff.png", maze:"../assets/elements/maps/maze.png",
    plateau:"../assets/elements/maps/plateau.png", valley:"../assets/elements/maps/valley.png",
    meadow:"../assets/elements/maps/meadow.png", jungle:"../assets/elements/maps/jungle.png",
    island:"../assets/elements/maps/island.png", forest:"../assets/elements/maps/forest.png",
  };

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
        + `href="${TERRAIN_IMGS[loc.terrain]}" preserveAspectRatio="xMidYMid meet"/>`;
    } else {
      body += `<circle cx="${cx}" cy="${cy}" r="${R}" fill="rgba(200,196,180,.55)" stroke="#6e83d3" stroke-width="1.5"/>`;
    }
    if (loc.feeling) {
      body += `<text x="${cx}" y="${cy+R+22}" text-anchor="middle" fill="#2a1e14" `
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
    { key:'airmail-letter',         file:'stationary-airmail-letter.png',           box:{l:4.2, t:16.7, w:91.6, h:70.8} },
    { key:'gift-tag-olive',         file:'stationary-gift-tag-olive.png',           box:{l:4.2, t:37.5, w:91.6, h:58.3} },
    { key:'label-bracket-green',    file:'stationary-label-bracket-green.png',      box:{l:8.3, t:16.7, w:83.4, h:66.6} },
    { key:'label-bracket-navy',     file:'stationary-label-bracket-navy.png',       box:{l:12.5,t:12.5, w:75,   h:75} },
    { key:'lace-doily-oval',        file:'stationary-lace-doily-oval-frame.png',    box:{l:25,  t:20.8, w:54.2, h:54.2} },
    { key:'library-card',           file:'stationary-library-card.png',             box:{l:0,   t:37.5, w:100,  h:62.5} },
    { key:'notecard-daisies',       file:'stationary-notecard-daisies.png',         box:{l:4.2, t:8.3,  w:62.5, h:83.4} },
    { key:'notecard-strawberry',    file:'stationary-notecard-strawberry.png',      box:{l:37.5,t:8.3,  w:58.3, h:70.9} },
    { key:'notepaper-cowboy',       file:'stationary-notepaper-cowboy-western.png', box:{l:12.5,t:29.2, w:75,   h:50} },
    { key:'notepaper-mushroom-cat', file:'stationary-notepaper-mushroom-cat.png',   box:{l:54.2,t:12.5, w:45.8, h:62.5} },
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

  /* PORTABLE RENDER: data + stable seed string → matrix HTML.
     data = { dateLabel, mapName, mapType, zones, bingoScore(0-24), charState,
              locationData, sidequestData, journalText, matrixImages[] }
     journalText isn't drawn on the matrix (no preview item) — it's only read
     by callers to prefill the "✎ notes" editor (see showEditNotes below).
     opts = { showAddPhoto=true, showEditNotes=false, archiveHref=null }      */
  function buildHTML(data, seedStr, opts){
    data = data || {};
    opts = opts || {};
    const showAddPhoto  = opts.showAddPhoto !== false;
    const showEditNotes = !!opts.showEditNotes;
    const archiveHref   = opts.archiveHref || null;

    const rnd = seedRand(seedStr || 'matrix');
    const jit = r => (rnd()*2-1)*r;
    const rot = r => ((rnd()*2-1)*r).toFixed(1);

    // MAP → top-left (external + action): only the day's chosen destination.
    const dayLoc = data.sidequestData || data.locationData || {};
    const mapCap = (data.sidequestData && data.sidequestData.name) || data.mapName || 'my map';
    const mapItem = `<div class="adv-item adv-map" style="left:${(27+jit(2)).toFixed(1)}%;top:${(30+jit(2)).toFixed(1)}%;transform:translate(-50%,-50%) rotate(${rot(3)}deg);">
        <div class="adv-map-svg">${buildSingleLocationSVG(dayLoc)}</div>
        <div class="adv-cap">${esc(mapCap)}</div></div>`;

    // BINGO (heart meter) → bottom-left (internal + action).
    const score = data.bingoScore || 0;
    const meterPct = Math.round((score/24)*100);
    const mode = score<=9 ? 'hard mode' : score<=19 ? 'medium mode' : 'easy mode';
    const bingoItem = `<div class="adv-item adv-bingo" style="left:${(27+jit(2)).toFixed(1)}%;top:${(71+jit(2)).toFixed(1)}%;transform:translate(-50%,-50%) rotate(${rot(3)}deg);">
        <div class="adv-cap">heart meter</div>
        <div class="adv-meter"><div class="adv-meter-fill" style="width:${meterPct}%"></div></div>
        <div class="adv-mode">${mode}</div></div>`;

    // CHARACTER (infinity mirror archetype) → bottom-right (internal + feeling).
    const charStack = buildCharStack(data.charState);
    const charItem = charStack ? `<div class="adv-item adv-char" style="left:${(73+jit(2)).toFixed(1)}%;top:${(71+jit(2)).toFixed(1)}%;transform:translate(-50%,-50%) rotate(${rot(3)}deg);">${charStack}</div>` : '';

    // Photos — placed inside their assigned quadrant.
    const quadCount = {};
    let photos = '';
    (data.matrixImages||[]).forEach(img => {
      if (!img || !img.url) return;
      const q = QUADRANTS[img.quadrant] ? img.quadrant : 'internal-feeling';
      const n = quadCount[q] || 0; quadCount[q] = n + 1;
      const slot = photoSlot(q, n);
      photos += `<div class="adv-photo" style="left:${(slot.left+jit(1.5)).toFixed(1)}%;top:${(slot.top+jit(1.5)).toFixed(1)}%;transform:translate(-50%,-50%) rotate(${rot(8)}deg);"><img src="${img.url}" alt="" onerror="this.parentElement.style.display='none'"><button class="adv-photo-remove" type="button" data-url="${esc(img.url)}" title="remove photo" aria-label="remove photo">✕</button></div>`;
    });

    // Stickers — freeform decorations, placed wherever they were last dragged to.
    let stickers = '';
    (data.matrixStickers||[]).forEach(s => {
      if (!s || !s.url || !s.id) return;
      const sRot = s.rot || 0, sScale = s.scale || 1;
      stickers += `<div class="adv-sticker" style="left:${s.x}%;top:${s.y}%;transform:translate(-50%,-50%) rotate(${sRot}deg) scale(${sScale});"><img src="${s.url}" alt="" onerror="this.parentElement.style.display='none'"></div>`;
    });

    // Text notes — freeform, optionally set on a stationery card whose
    // writable rectangle (STATIONERY_BOX) keeps the text off the illustration.
    let texts = '';
    (data.matrixTexts||[]).forEach(t => {
      if (!t || !t.text || !t.id) return;
      const tRot = t.rot || 0, tScale = t.scale || 1;
      if (t.stationery && STATIONERY_FILE[t.stationery]) {
        const box = STATIONERY_BOX[t.stationery];
        texts += `<div class="mx-note stationery" style="left:${t.x}%;top:${t.y}%;transform:translate(-50%,-50%) rotate(${tRot}deg) scale(${tScale});">
            <img class="mx-note-stationery-img" src="${STATIONERY_BASE}${STATIONERY_FILE[t.stationery]}" alt="">
            <div class="mx-note-stationery-body" style="left:${box.l}%;top:${box.t}%;width:${box.w}%;height:${box.h}%;">${esc(t.text)}</div></div>`;
      } else {
        texts += `<div class="mx-note" style="left:${t.x}%;top:${t.y}%;transform:translate(-50%,-50%) rotate(${tRot}deg) scale(${tScale});">${esc(t.text)}</div>`;
      }
    });

    // Header buttons (no inline onclick — host wires via attachMatrix).
    const addBtn  = showAddPhoto  ? `<button class="matrix-photo-btn" type="button">+ photo</button>` : '';
    const noteBtn = showEditNotes ? `<button class="matrix-edit-notes" type="button">✎ notes</button>` : '';
    const archBtn = archiveHref   ? `<button class="matrix-archive-btn" type="button" data-href="${esc(archiveHref)}">archive →</button>` : '';

    const bgStyle = opts.bgImage ? ` style="background:url('${opts.bgImage}') center/cover no-repeat"` : '';
    const frameClass = opts.showFrame ? ' framed' : '';
    return `<div class="step-panel matrix-panel">
      <div class="matrix-header">
        <div class="matrix-date">${esc(data.dateLabel||'')}</div>
        ${addBtn}${noteBtn}${archBtn}
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
          ${mapItem}${bingoItem}${charItem}
          ${photos}
          ${stickers}
          ${texts}
        </div>
      </div>
    </div>`;
  }

  // ── ASSEMBLE: load a matrix row by id → render model ──
  // gameData = { map_name, map_type, map_data } for the row's parent game (dream only).
  // table defaults to 'dream_matrix'; pass 'daily_matrix' for daily entries (no map/zones).
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
      matrixStickers: [], matrixTexts: [],
    };
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
        // dateLabel reflects the SAVE's local day, not "today". Daily rows are
        // dated by entry_date (a plain YYYY-MM-DD), so prefer it when present.
        if (row.entry_date) {
          const [y,m,dd] = String(row.entry_date).split('-').map(Number);
          if (y && m && dd) d.dateLabel = new Date(y, m-1, dd)
            .toLocaleDateString('en-US', { weekday:'long', month:'long', day:'numeric' });
        } else if (row.created_at) {
          d.dateLabel = new Date(row.created_at)
            .toLocaleDateString('en-US', { weekday:'long', month:'long', day:'numeric' });
        }
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
  // handlers = { onAddPhoto, onRemovePhoto(url), onEditNotes }. Returns cleanup.
  function attachMatrix(rootEl, handlers){
    handlers = handlers || {};
    function onClick(e){
      const rm = e.target.closest('.adv-photo-remove');
      if (rm && rootEl.contains(rm)) { e.stopPropagation(); handlers.onRemovePhoto && handlers.onRemovePhoto(rm.dataset.url); return; }
      const add = e.target.closest('.matrix-photo-btn');
      if (add && rootEl.contains(add)) { handlers.onAddPhoto && handlers.onAddPhoto(); return; }
      const note = e.target.closest('.matrix-edit-notes');
      if (note && rootEl.contains(note)) { handlers.onEditNotes && handlers.onEditNotes(); return; }
      const arch = e.target.closest('.matrix-archive-btn');
      if (arch && rootEl.contains(arch) && arch.dataset.href) { window.location.href = arch.dataset.href; return; }
    }
    rootEl.addEventListener('click', onClick);
    return () => rootEl.removeEventListener('click', onClick);
  }

  // ── PHOTO EDITOR ──────────────────────────────────────────
  // deps = { sb, getEntryId(), getUserId(), onChange(), status(msg,color) }
  // Owns its own modal (appended to <body> once). open() shows it; remove(url)
  // drops a photo. Both write dream_matrix.matrix_images + matrix-photos bucket.
  function createPhotoEditor(deps){
    deps = deps || {};
    const status = deps.status || function(){};
    const table  = deps.table || 'dream_matrix';
    let draft = { file:null, quadrant:null };

    const overlay = document.createElement('div');
    overlay.className = 'mr-photo-overlay';
    overlay.innerHTML = `
      <div class="mr-photo-card">
        <div class="mr-photo-head">
          <span class="mr-photo-title">✦ add a photo</span>
          <button class="mr-photo-close" type="button">×</button>
        </div>
        <div class="mr-photo-sub">pick an image and choose where it lands on your matrix.</div>
        <label class="mr-photo-drop">
          <input type="file" accept="image/*" hidden class="mr-photo-file">
          <div class="mr-photo-preview"><span class="mr-photo-hint">tap to choose an image</span></div>
        </label>
        <div class="mr-photo-quad-label">which quadrant?</div>
        <div class="mr-photo-quad-grid">
          <button class="mr-photo-quad" type="button" data-q="external-action"><b>map</b><span>external · action</span></button>
          <button class="mr-photo-quad" type="button" data-q="external-feeling"><span>external · feeling</span></button>
          <button class="mr-photo-quad" type="button" data-q="internal-action"><b>heart</b><span>internal · action</span></button>
          <button class="mr-photo-quad" type="button" data-q="internal-feeling"><b>character</b><span>internal · feeling</span></button>
        </div>
        <div class="mr-photo-status"></div>
        <button class="mr-photo-add" type="button" disabled>add to matrix</button>
      </div>`;
    document.body.appendChild(overlay);

    const fileEl    = overlay.querySelector('.mr-photo-file');
    const previewEl = overlay.querySelector('.mr-photo-preview');
    const statusEl  = overlay.querySelector('.mr-photo-status');
    const addEl     = overlay.querySelector('.mr-photo-add');

    function refreshAdd(){ addEl.disabled = !(draft.file && draft.quadrant); }
    function reset(){
      draft = { file:null, quadrant:null };
      fileEl.value = '';
      previewEl.innerHTML = '<span class="mr-photo-hint">tap to choose an image</span>';
      overlay.querySelectorAll('.mr-photo-quad.selected').forEach(el => el.classList.remove('selected'));
      statusEl.textContent = ''; statusEl.style.color = '';
      addEl.textContent = 'add to matrix';
      refreshAdd();
    }
    function open(){ reset(); overlay.classList.add('open'); }
    function close(){ overlay.classList.remove('open'); }

    overlay.querySelector('.mr-photo-close').addEventListener('click', close);
    overlay.addEventListener('click', e => { if (e.target === overlay) close(); });

    fileEl.addEventListener('change', e => {
      const file = e.target.files && e.target.files[0];
      if (!file) return;
      if (!file.type.startsWith('image/')){
        statusEl.style.color = '#E8478B'; statusEl.textContent = 'that file isn’t an image';
        draft.file = null; refreshAdd(); return;
      }
      draft.file = file;
      const reader = new FileReader();
      reader.onload = ev => { previewEl.innerHTML = `<img src="${ev.target.result}" alt="">`; };
      reader.readAsDataURL(file);
      statusEl.textContent = '';
      refreshAdd();
    });

    overlay.querySelectorAll('.mr-photo-quad').forEach(btn => {
      btn.addEventListener('click', () => {
        draft.quadrant = btn.dataset.q;
        overlay.querySelectorAll('.mr-photo-quad').forEach(b => b.classList.remove('selected'));
        btn.classList.add('selected');
        refreshAdd();
      });
    });

    addEl.addEventListener('click', async () => {
      if (!(draft.file && draft.quadrant)) return;
      const sb = deps.sb, entryId = deps.getEntryId && deps.getEntryId(), userId = deps.getUserId && deps.getUserId();
      if (!userId){ statusEl.style.color = '#E8478B'; statusEl.textContent = 'sign in to save photos'; return; }
      if (!entryId){ statusEl.style.color = '#E8478B'; statusEl.textContent = 'no entry selected'; return; }
      addEl.disabled = true; addEl.textContent = 'uploading…';
      statusEl.style.color = ''; statusEl.textContent = 'uploading…';
      try {
        const file = draft.file;
        const ext  = (file.name.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g,'') || 'jpg';
        const path = `${userId}/${entryId}/${crypto.randomUUID()}.${ext}`;
        const { error: upErr } = await sb.storage.from(BUCKET).upload(path, file, { contentType: file.type, upsert: false });
        if (upErr) throw upErr;
        const { data: pub } = sb.storage.from(BUCKET).getPublicUrl(path);
        const publicUrl = pub && pub.publicUrl;
        if (!publicUrl) throw new Error('could not resolve image url');
        // Append {url,quadrant} (read-modify-write).
        const { data: row, error: readErr } = await sb.from(table).select('matrix_images').eq('id', entryId).maybeSingle();
        if (readErr) throw readErr;
        const current = Array.isArray(row && row.matrix_images) ? row.matrix_images : [];
        const next = [...current, { url: publicUrl, quadrant: draft.quadrant }];
        const { error: updErr } = await sb.from(table).update({ matrix_images: next }).eq('id', entryId);
        if (updErr) throw updErr;
        close();
        status('photo added ✓', '#6ab86a');
        deps.onChange && deps.onChange();
      } catch (err) {
        console.error('[matrix-render] photo upload failed:', err);
        statusEl.style.color = '#E8478B';
        statusEl.textContent = (err && err.message) ? `couldn’t add photo: ${err.message}` : 'couldn’t add photo — try again';
        addEl.disabled = false; addEl.textContent = 'add to matrix';
      }
    });

    async function remove(url){
      const sb = deps.sb, entryId = deps.getEntryId && deps.getEntryId(), userId = deps.getUserId && deps.getUserId();
      if (!url || !userId || !entryId) return;
      try {
        const { data: row } = await sb.from(table).select('matrix_images').eq('id', entryId).maybeSingle();
        const imgs = Array.isArray(row && row.matrix_images) ? row.matrix_images : [];
        const next = imgs.filter(i => !(i && i.url === url));
        if (next.length === imgs.length) { deps.onChange && deps.onChange(); return; }
        const { error } = await sb.from(table).update({ matrix_images: next }).eq('id', entryId);
        if (error) throw error;
      } catch (err) {
        console.error('[matrix-render] photo remove failed:', err);
        status('couldn’t remove photo — try again', '#E8478B');
        return;
      }
      await deletePhotoFiles(sb, [url]);
      status('photo removed', '#7a86bb');
      deps.onChange && deps.onChange();
    }

    function destroy(){ overlay.remove(); }
    return { open, close, remove, destroy };
  }

  // ── JOURNAL EDITOR ────────────────────────────────────────
  // deps = { sb, getEntryId(), onChange(), status(msg,color), table }
  // Edits <table>.journal_messages (defaults to dream_matrix). Saving replaces
  // with a single message; clearing removes all.
  function createJournalEditor(deps){
    deps = deps || {};
    const status = deps.status || function(){};
    const table  = deps.table || 'dream_matrix';

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
        console.error('[matrix-render] journal save failed:', err);
        statusEl.style.color = '#E8478B';
        statusEl.textContent = 'couldn’t save notes — try again';
        saveEl.disabled = false; saveEl.textContent = 'save notes';
      }
    });

    function destroy(){ overlay.remove(); }
    return { open, close, destroy };
  }

  // ── STYLES (injected once; var() fallbacks make it self-sufficient) ──
  function injectStyles(){
    if (document.getElementById('matrix-render-styles')) return;
    const css = `
.matrix-panel { padding:0; overflow:hidden; justify-content:flex-start; align-items:stretch; position:relative; }
.matrix-panel.step-panel { width:100%; height:100%; display:flex; flex-direction:column; font-family:var(--font-hand,"ZoesHandwriting",cursive); }
.matrix-date {
  position:absolute; top:10px; left:50%; transform:translateX(-50%);
  font-family:var(--font-hand,"ZoesHandwriting",cursive); font-size:clamp(13px,1.5vw,17px); color:#7a86bb; z-index:6;
}
.matrix-photo-btn {
  position:absolute; top:8px; left:12px; z-index:6;
  font-family:var(--font-hand,"ZoesHandwriting",cursive); font-size:clamp(12px,1.3vw,15px);
  color:var(--blue,#6e83d3); background:rgba(255,255,255,.72);
  border:2px solid var(--blue,#6e83d3); box-shadow:2px 2px 0 var(--aqua,#83d2e6);
  padding:5px 14px; cursor:pointer; transition:all .05s;
}
.matrix-photo-btn:hover  { background:var(--blue,#6e83d3); color:#fff; }
.matrix-photo-btn:active { box-shadow:none; transform:translate(2px,2px); }
.matrix-edit-notes, .matrix-archive-btn {
  position:absolute; top:8px; right:12px; z-index:6;
  font-family:var(--font-hand,"ZoesHandwriting",cursive); font-size:clamp(12px,1.3vw,15px);
  color:#fff; background:var(--blue,#6e83d3); border:2px solid #4a5bc4;
  box-shadow:2px 2px 0 #3a4aaa; padding:5px 14px; cursor:pointer; transition:all .05s;
}
.matrix-edit-notes:hover, .matrix-archive-btn:hover { background:#4a5bc4; }
.matrix-edit-notes:active, .matrix-archive-btn:active { box-shadow:none; transform:translate(2px,2px); }
.matrix-header { position:relative; height:34px; flex-shrink:0; }
.matrix-frame {
  width:76%; height:76%; margin:auto; align-self:center;
  position:relative; overflow:hidden;
}
.matrix-frame.framed {
  border:2px solid var(--blue,#6e83d3);
  box-shadow: 0 0 0 3px var(--blue,#6e83d3), 0 0 0 6px var(--aqua,#83d2e6), 6px 10px 40px rgba(0,0,0,0.35);
}
.adv-matrix { position:absolute; top:0; left:0; width:100%; height:100%; overflow:hidden; background:transparent; }
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
.adv-bingo { width:clamp(130px,16vw,200px); }
.adv-meter { width:100%; height:14px; border:1.5px solid var(--blue,#6e83d3); background:#e7e1d6; margin-top:2px; }
.adv-meter-fill { height:100%; background:linear-gradient(90deg,#E8478B,#f3a0c4); }
.adv-mode { font-family:var(--font-hand,"ZoesHandwriting",cursive); font-size:clamp(10px,1.1vw,13px); color:#7a86bb; margin-top:3px; }
.adv-char { width:clamp(90px,11vw,140px); }
.adv-char-stack { position:relative; width:100%; aspect-ratio:1; }
.adv-char-stack img { position:absolute; inset:0; width:100%; height:100%; object-fit:contain; }
.adv-photo { position:absolute; z-index:3; width:clamp(74px,9vw,118px); }
.adv-photo img {
  width:100%; height:auto; max-height:clamp(96px,11.5vw,150px); display:block;
  border:4px solid #fff; border-bottom-width:18px;
  box-shadow:2px 3px 7px rgba(0,0,0,.18); object-fit:contain; background:#fff;
}
.adv-photo-remove {
  position:absolute; top:-8px; right:-8px; z-index:4;
  width:20px; height:20px; padding:0; line-height:1;
  background:#fff; border:1.5px solid #ccc; border-radius:50%;
  color:#888; font-size:11px; cursor:pointer;
  display:flex; align-items:center; justify-content:center;
  opacity:0; transition:opacity .12s, color .12s, border-color .12s;
}
.adv-photo:hover .adv-photo-remove { opacity:1; }
.adv-photo-remove:hover { color:#E8478B; border-color:#E8478B; }
@media (hover: none) { .adv-photo-remove { opacity:1; } }
.adv-sticker { position:absolute; z-index:4; width:clamp(56px,7vw,86px); }
.adv-sticker img { width:100%; height:auto; display:block; pointer-events:none; filter:drop-shadow(2px 3px 4px rgba(0,0,0,.18)); }
.mx-note {
  position:absolute; z-index:4; max-width:220px;
  font-family:var(--font-hand,"ZoesHandwriting",cursive); font-size:clamp(20px,2.2vw,30px); color:#3a2e1e;
  text-align:center; line-height:1.2; word-break:break-word;
}
.mx-note.stationery { max-width:none; width:clamp(150px,17vw,260px); text-align:center; }
.mx-note-stationery-img { width:100%; height:auto; display:block; pointer-events:none; }
.mx-note-stationery-body {
  position:absolute; overflow:hidden; text-align:center; word-break:break-word; white-space:pre-wrap;
  display:flex; align-items:center; justify-content:center;
  font-family:var(--font-hand,"ZoesHandwriting",cursive); color:#3a2e1e; line-height:1.25; font-size:clamp(11px,1.2vw,15px);
}

/* ── shared photo-upload modal ── */
.mr-photo-overlay, .mr-jr-overlay {
  position:fixed; inset:0; z-index:600;
  background:rgba(40,32,24,.45);
  display:none; align-items:center; justify-content:center; padding:18px;
}
.mr-photo-overlay.open, .mr-jr-overlay.open { display:flex; }
.mr-photo-card, .mr-jr-card {
  width:min(440px,94vw); max-height:92vh; overflow-y:auto;
  background:var(--back-wall,#f1ebe4);
  border:2px solid var(--blue,#6e83d3);
  box-shadow:0 0 0 3px var(--blue,#6e83d3), 0 0 0 6px var(--aqua,#83d2e6), 6px 10px 40px rgba(0,0,0,.4);
  padding:18px 20px; font-family:var(--font-hand,"ZoesHandwriting",cursive);
}
.mr-photo-head, .mr-jr-head { display:flex; align-items:baseline; justify-content:space-between; gap:10px; }
.mr-photo-title, .mr-jr-title { font-size:clamp(18px,2.2vw,24px); color:var(--blue,#6e83d3); }
.mr-photo-close, .mr-jr-close { font-size:22px; color:#aaa; cursor:pointer; line-height:1; border:none; background:none; padding:2px 6px; }
.mr-photo-close:hover, .mr-jr-close:hover { color:#E8478B; }
.mr-photo-sub, .mr-jr-sub { font-size:13px; color:#7a86bb; margin:2px 0 14px; }
.mr-photo-drop { display:block; cursor:pointer; }
.mr-photo-preview {
  width:100%; aspect-ratio:4/3; background:#cdd3ec;
  border:2px dashed var(--blue); display:flex; align-items:center; justify-content:center;
  overflow:hidden; margin-bottom:14px; transition:border-color .12s;
}
.mr-photo-drop:hover .mr-photo-preview { border-color:var(--blue,#6e83d3); }
.mr-photo-preview img { width:100%; height:100%; object-fit:contain; }
.mr-photo-hint { color:rgba(138,122,90,.7); font-style:italic; font-size:14px; }
.mr-photo-quad-label { font-size:12px; color:#7a86bb; letter-spacing:.4px; margin-bottom:6px; }
.mr-photo-quad-grid { display:grid; grid-template-columns:1fr 1fr; gap:8px; margin-bottom:12px; }
.mr-photo-quad {
  display:flex; flex-direction:column; align-items:center; gap:2px;
  padding:12px 8px; background:#fdf6e3; border:1.5px solid #ccc;
  font-family:var(--font-hand,"ZoesHandwriting",cursive); cursor:pointer; color:#555; transition:all .1s;
}
.mr-photo-quad b { font-size:15px; color:#3a2e1e; }
.mr-photo-quad span { font-size:10px; color:#7a86bb; }
.mr-photo-quad:hover { border-color:var(--blue,#6e83d3); background:#f0edfa; }
.mr-photo-quad.selected { border-color:var(--blue,#6e83d3); background:var(--blue,#6e83d3); box-shadow:2px 2px 0 #3a4aaa; }
.mr-photo-quad.selected b, .mr-photo-quad.selected span { color:#fff; }
.mr-photo-status, .mr-jr-status { font-size:13px; min-height:18px; margin-bottom:8px; color:#7a86bb; }
.mr-photo-add {
  width:100%; padding:12px 18px; background:var(--blue,#6e83d3);
  border:2px solid #4a5bc4; box-shadow:2px 2px 0 #3a4aaa;
  font-family:var(--font-hand,"ZoesHandwriting",cursive); font-size:16px; color:#fff; cursor:pointer; transition:all .05s;
}
.mr-photo-add:hover  { background:#4a5bc4; }
.mr-photo-add:active { box-shadow:none; transform:translate(2px,2px); }
.mr-photo-add:disabled { opacity:.4; cursor:not-allowed; transform:none !important; }

/* ── shared journal editor ── */
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
    createPhotoEditor,
    createJournalEditor,
    buildMapSVG,
    buildCharStack,
    // exposed for reuse/testing
    CHAR_FULL_ASSETS,
    TERRAIN_IMGS,
    buildSingleLocationSVG,
  };
})();
