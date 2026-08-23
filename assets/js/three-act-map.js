// Shared three-act ("beginning / middle / end") map picker — terrain + emotional-climate
// data plus the interactive SVG factory, used by matrix/media.html's reading-experience map
// and rooms/library.html's crowd-sourced story-arc board. Both load this before their own
// inline <script>. Terrain/weather data originates from games/treasure-map.html.
window.ThreeActMap = (function () {

const TERRAIN_IMGS = {
  pond:      "../assets/elements/maps/pond.png",
  waterfall: "../assets/elements/maps/waterfall.png",
  spring:    "../assets/elements/maps/spring.png",
  river:     "../assets/elements/maps/river.png",
  ocean:     "../assets/elements/maps/ocean.png",
  glacier:   "../assets/elements/maps/glacier.png",
  marsh:     "../assets/elements/maps/marsh.png",
  dunes:     "../assets/elements/maps/dunes.png",
  mountains: "../assets/elements/maps/mountains.png",
  cave:      "../assets/elements/maps/cave.png",
  cliff:     "../assets/elements/maps/cliff.png",
  maze:      "../assets/elements/maps/maze.png",
  plateau:   "../assets/elements/maps/plateau.png",
  valley:    "../assets/elements/maps/valley.png",
  meadow:    "../assets/elements/maps/meadow.png",
  jungle:    "../assets/elements/maps/jungle.png",
  island:    "../assets/elements/maps/island.png",
  forest:    "../assets/elements/maps/forest.png",
};
const TERRAIN_CATEGORIES = [
  { id:"water",      label:"water"      },
  { id:"barriers",   label:"barriers"   },
  { id:"landscapes", label:"landscapes" },
];
const TERRAIN = [
  { id:"pond",      label:"pond",      cat:"water" },
  { id:"waterfall", label:"waterfall", cat:"water" },
  { id:"spring",    label:"spring",    cat:"water" },
  { id:"river",     label:"river",     cat:"water" },
  { id:"ocean",     label:"ocean",     cat:"water" },
  { id:"glacier",   label:"glacier",   cat:"water" },
  { id:"marsh",     label:"marsh",     cat:"barriers" },
  { id:"dunes",     label:"dunes",     cat:"barriers" },
  { id:"mountains", label:"mountains", cat:"barriers" },
  { id:"cave",      label:"cave",      cat:"barriers" },
  { id:"cliff",     label:"cliff",     cat:"barriers" },
  { id:"maze",      label:"maze",      cat:"barriers" },
  { id:"plateau",   label:"plateau",   cat:"landscapes" },
  { id:"valley",    label:"valley",    cat:"landscapes" },
  { id:"meadow",    label:"meadow",    cat:"landscapes" },
  { id:"jungle",    label:"jungle",    cat:"landscapes" },
  { id:"island",    label:"island",    cat:"landscapes" },
  { id:"forest",    label:"forest",    cat:"landscapes" },
];
const TERRAIN_LABELS = Object.fromEntries(TERRAIN.map(t => [t.id, t.label]));
const WEATHER_CATS = [
  { id:"sunny", label:"sunny", desc:"bright/happy/intense", cls:"sunny", tint:"#f2e6a8", feelings:["trust","peace","joy","hope","confidence","truth","stability","acceptance","pressure","challenge","temptation","reclamation","redemption","reunion"] },
  { id:"rainy", label:"rainy", desc:"sad/heavy/grief", cls:"rainy", tint:"#c9b3e7", feelings:["shadows","worry","fear","depression","regret","confusion","boredom","loneliness","grief","sadness","betrayal","reckoning","surrender"] },
  { id:"windy", label:"windy", desc:"change/transition/evolution", cls:"windy", tint:"#b6e6cf", feelings:["surprise","curiosity","inspiration","excitement","courage","progress","chaos","disruption","departure","initiation","crossroads","unraveling","rebirth","release"] },
  { id:"snowy", label:"snowy", desc:"cold/stuck/isolating", cls:"snowy", tint:"#a0d7e6", feelings:["anger","avoidance","bitterness","apathy","shock","stillness","quiet","melancholy","isolation","abandonment","exile","descent","confrontation"] },
];

// ── THREE-ACT MAP (factory — supports multiple independent instances) ───
const ZONE_PROMPTS = [
  "exposition — how does the story begin?",
  "climax — what is the problem?",
  "resolution — how does it end?",
];
// Tuned by eye against the story-arc curve in assets/elements/maps/three-act.png
// (687×188 image: low-left → peak-center → low-right)
const THREE_ACT_ZONE_POSITIONS = [
  { x: 65,  y: 172 },
  { x: 352, y: 12  },
  { x: 618, y: 140 },
];
const THREE_ACT_VIEWBOX = "-135 -140 950 465";
const THREE_ACT_CURVE_IMG = "../assets/elements/maps/three-act.png";

function createThreeActMap(ids) {
  const state = { zones: [{}, {}, {}] };
  let activeZone = null;
  let activeTerrainCat = "landscapes";

  function zoneTarget() {
    if (activeZone === 0 || activeZone === 1 || activeZone === 2) return state.zones[activeZone];
    return null;
  }

  function updateZonePrompt() {
    const prompt = document.getElementById(ids.promptId);
    const text   = document.getElementById(ids.promptTextId);
    if (activeZone === null) { prompt.style.display = 'none'; return; }
    text.textContent = ZONE_PROMPTS[activeZone];
    prompt.style.display = 'block';
  }

  function selectZone(i) { activeZone = i; render(); updateZonePrompt(); }

  function render() {
    const zoneGroup = document.getElementById(ids.zoneGroupId);
    const defs      = document.getElementById(ids.defsId);
    zoneGroup.innerHTML = ''; defs.innerHTML = '';
    const R = 60;
    THREE_ACT_ZONE_POSITIONS.forEach((pos, i) => {
      const zone = state.zones[i] || {};
      const isActive = activeZone === i;
      if (zone.tint) {
        const gradId = `${ids.svgId}-halo-${i}`;
        const grad = document.createElementNS('http://www.w3.org/2000/svg', 'radialGradient');
        grad.setAttribute('id', gradId); grad.setAttribute('cx','50%'); grad.setAttribute('cy','50%'); grad.setAttribute('r','50%');
        const s1 = document.createElementNS('http://www.w3.org/2000/svg', 'stop');
        s1.setAttribute('offset','0%'); s1.setAttribute('stop-color', zone.tint); s1.setAttribute('stop-opacity','1');
        const s2 = document.createElementNS('http://www.w3.org/2000/svg', 'stop');
        s2.setAttribute('offset','55%'); s2.setAttribute('stop-color', zone.tint); s2.setAttribute('stop-opacity','0.85');
        const s3 = document.createElementNS('http://www.w3.org/2000/svg', 'stop');
        s3.setAttribute('offset','100%'); s3.setAttribute('stop-color', zone.tint); s3.setAttribute('stop-opacity','0');
        grad.appendChild(s1); grad.appendChild(s2); grad.appendChild(s3); defs.appendChild(grad);
        const halo = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        halo.setAttribute('cx', pos.x); halo.setAttribute('cy', pos.y); halo.setAttribute('r', R + 76);
        halo.setAttribute('fill', `url(#${gradId})`); halo.style.pointerEvents = 'none';
        zoneGroup.appendChild(halo);
      }
      const hasTerrain = !!(zone.terrain && TERRAIN_IMGS[zone.terrain]);
      const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      circle.setAttribute('cx', pos.x); circle.setAttribute('cy', pos.y); circle.setAttribute('r', R);
      if (hasTerrain) { circle.setAttribute('fill', 'transparent'); circle.setAttribute('stroke', 'transparent'); }
      else {
        circle.setAttribute('fill', isActive ? 'rgba(101,121,226,0.18)' : 'rgba(200,196,180,0.82)');
        circle.setAttribute('stroke', isActive ? '#6e83d3' : '#6e83d3');
      }
      circle.setAttribute('stroke-width', isActive ? '5' : '3');
      zoneGroup.appendChild(circle);
      if (hasTerrain) {
        const img = document.createElementNS('http://www.w3.org/2000/svg', 'image');
        img.setAttribute('x', pos.x - R); img.setAttribute('y', pos.y - R);
        img.setAttribute('width', R * 2); img.setAttribute('height', R * 2);
        img.setAttribute('href', TERRAIN_IMGS[zone.terrain]);
        img.setAttribute('preserveAspectRatio', 'xMidYMid meet');
        img.style.pointerEvents = 'none';
        zoneGroup.appendChild(img);
      }
      const numEl = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      numEl.setAttribute('x', pos.x); numEl.setAttribute('y', pos.y + 8);
      numEl.setAttribute('text-anchor', 'middle');
      numEl.setAttribute('fill', hasTerrain ? '#00000000' : (isActive ? '#6e83d3' : '#3a4aaa'));
      numEl.setAttribute('font-family', '"ZoesHandwriting", cursive'); numEl.setAttribute('font-size', '40');
      numEl.style.pointerEvents = 'none'; numEl.textContent = i + 1;
      if (!hasTerrain) zoneGroup.appendChild(numEl);
      if (hasTerrain) {
        const terrainEl = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        terrainEl.setAttribute('x', pos.x); terrainEl.setAttribute('y', pos.y - R - 22);
        terrainEl.setAttribute('text-anchor', 'middle'); terrainEl.setAttribute('fill', '#000000');
        terrainEl.setAttribute('font-family', '"ZoesHandwriting", cursive'); terrainEl.setAttribute('font-size', '52');
        terrainEl.setAttribute('font-weight', 'bold');
        terrainEl.style.pointerEvents = 'none'; terrainEl.textContent = (TERRAIN_LABELS[zone.terrain] || zone.terrain) + ' of';
        zoneGroup.appendChild(terrainEl);
      }
      if (zone.feeling) {
        const feelEl = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        feelEl.setAttribute('x', pos.x); feelEl.setAttribute('y', pos.y + R + 48);
        feelEl.setAttribute('text-anchor', 'middle'); feelEl.setAttribute('fill', '#000000');
        feelEl.setAttribute('font-family', '"ZoesHandwriting", cursive'); feelEl.setAttribute('font-size', '52');
        feelEl.setAttribute('font-weight', 'bold');
        feelEl.style.pointerEvents = 'none'; feelEl.textContent = zone.feeling;
        zoneGroup.appendChild(feelEl);
      }
      const hit = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      hit.setAttribute('cx', pos.x); hit.setAttribute('cy', pos.y); hit.setAttribute('r', R + 12);
      hit.setAttribute('fill', 'transparent'); hit.style.cursor = 'pointer';
      hit.addEventListener('click', () => selectZone(i));
      zoneGroup.appendChild(hit);
    });
  }

  function buildTerrain() {
    const tabs = document.getElementById(ids.terrainTabsId);
    const allCats = [...TERRAIN_CATEGORIES, { id: "all", label: "view all" }];
    allCats.forEach(cat => {
      const btn = document.createElement("div");
      btn.className = "terrain-cat-btn" + (cat.id === activeTerrainCat ? " active" : "");
      btn.dataset.catId = cat.id;
      btn.textContent = cat.label;
      btn.addEventListener("click", () => selectTerrainCat(cat.id));
      tabs.appendChild(btn);
    });
    const tp = document.getElementById(ids.terrainPaletteId);
    TERRAIN.forEach(t => {
      const el = document.createElement("div");
      el.className = "palette-item";
      el.dataset.cat = t.cat;
      el.innerHTML = `<img src="${TERRAIN_IMGS[t.id]}" alt="${t.label}"><div class="palette-item-name">${t.label}</div>`;
      el.addEventListener("click", () => selectTerrain(t, el));
      tp.appendChild(el);
    });
    applyTerrainCatFilter();
  }
  function selectTerrainCat(catId) {
    activeTerrainCat = catId;
    document.getElementById(ids.terrainTabsId).querySelectorAll(".terrain-cat-btn").forEach(b => b.classList.toggle("active", b.dataset.catId === catId));
    applyTerrainCatFilter();
  }
  function applyTerrainCatFilter() {
    document.querySelectorAll(`#${ids.terrainPaletteId} .palette-item`).forEach(el => {
      el.style.display = (activeTerrainCat === "all" || el.dataset.cat === activeTerrainCat) ? "flex" : "none";
    });
  }
  function selectTerrain(t, el) {
    document.querySelectorAll(`#${ids.terrainPaletteId} .palette-item`).forEach(p => p.classList.remove("active"));
    el.classList.add("active");
    const target = zoneTarget();
    if (!target) return;
    target.terrain = t.id;
    render();
  }

  function buildWeather() {
    const wc = document.getElementById(ids.weatherId);
    WEATHER_CATS.forEach(cat => {
      const section = document.createElement("div");
      section.className = `weather-category ${cat.cls}`;
      const header = document.createElement("div");
      header.className = "weather-cat-header";
      header.innerHTML = `${cat.label} <span class="weather-cat-desc">(${cat.desc})</span>`;
      const chips = document.createElement("div"); chips.className = "feeling-chips";
      cat.feelings.forEach(feeling => {
        const chip = document.createElement("div");
        chip.className = "feeling-chip"; chip.textContent = feeling;
        chip.addEventListener("click", () => selectFeeling(feeling, cat, chip));
        chips.appendChild(chip);
      });
      section.appendChild(header); section.appendChild(chips); wc.appendChild(section);
    });
  }
  function selectFeeling(feeling, cat, el) {
    document.querySelectorAll(`#${ids.weatherId} .feeling-chip`).forEach(c => c.classList.remove("active"));
    el.classList.add("active");
    const target = zoneTarget();
    if (!target) return;
    target.feeling = feeling; target.tint = cat.tint; target.cat = cat.id;
    render();
  }

  function reset() {
    state.zones = [{}, {}, {}];
    activeZone = null;
    render();
    updateZonePrompt();
    document.querySelectorAll(`#${ids.terrainPaletteId} .palette-item`).forEach(p => p.classList.remove('active'));
    document.querySelectorAll(`#${ids.weatherId} .feeling-chip`).forEach(c => c.classList.remove('active'));
  }
  function isTouched()  { return state.zones.some(z => z.terrain || z.feeling); }
  function isComplete() { return state.zones.every(z => z.terrain && z.feeling); }

  return { state, buildTerrain, buildWeather, render, reset, isTouched, isComplete };
}

// Read-only preview renderer for a "frame" of already-submitted maps (rooms/library.html's
// story-arc board) — draws the curve + the three filled zones from `zones` data with no
// interactivity, no terrain/weather picker UI. `instanceId` namespaces the gradient/svg ids
// so many previews can sit on one page without colliding.
function renderStatic(container, zones, instanceId) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', THREE_ACT_VIEWBOX);
  svg.setAttribute('id', `${instanceId}-svg`);
  svg.style.width = '100%'; svg.style.height = 'auto'; svg.style.display = 'block';

  const curve = document.createElementNS('http://www.w3.org/2000/svg', 'image');
  curve.setAttribute('href', THREE_ACT_CURVE_IMG);
  curve.setAttribute('x', '0'); curve.setAttribute('y', '0');
  curve.setAttribute('width', '687'); curve.setAttribute('height', '188');
  curve.setAttribute('preserveAspectRatio', 'xMidYMid meet');
  curve.style.pointerEvents = 'none';
  svg.appendChild(curve);

  const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
  svg.appendChild(defs);
  const zoneGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
  svg.appendChild(zoneGroup);

  const R = 60;
  THREE_ACT_ZONE_POSITIONS.forEach((pos, i) => {
    const zone = (zones && zones[i]) || {};
    if (zone.tint) {
      const gradId = `${instanceId}-halo-${i}`;
      const grad = document.createElementNS('http://www.w3.org/2000/svg', 'radialGradient');
      grad.setAttribute('id', gradId); grad.setAttribute('cx','50%'); grad.setAttribute('cy','50%'); grad.setAttribute('r','50%');
      const s1 = document.createElementNS('http://www.w3.org/2000/svg', 'stop');
      s1.setAttribute('offset','0%'); s1.setAttribute('stop-color', zone.tint); s1.setAttribute('stop-opacity','1');
      const s2 = document.createElementNS('http://www.w3.org/2000/svg', 'stop');
      s2.setAttribute('offset','55%'); s2.setAttribute('stop-color', zone.tint); s2.setAttribute('stop-opacity','0.85');
      const s3 = document.createElementNS('http://www.w3.org/2000/svg', 'stop');
      s3.setAttribute('offset','100%'); s3.setAttribute('stop-color', zone.tint); s3.setAttribute('stop-opacity','0');
      grad.appendChild(s1); grad.appendChild(s2); grad.appendChild(s3); defs.appendChild(grad);
      const halo = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      halo.setAttribute('cx', pos.x); halo.setAttribute('cy', pos.y); halo.setAttribute('r', R + 76);
      halo.setAttribute('fill', `url(#${gradId})`); halo.style.pointerEvents = 'none';
      zoneGroup.appendChild(halo);
    }
    const hasTerrain = !!(zone.terrain && TERRAIN_IMGS[zone.terrain]);
    const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    circle.setAttribute('cx', pos.x); circle.setAttribute('cy', pos.y); circle.setAttribute('r', R);
    circle.setAttribute('fill', hasTerrain ? 'transparent' : 'rgba(200,196,180,0.82)');
    circle.setAttribute('stroke', '#6e83d3'); circle.setAttribute('stroke-width', '3');
    zoneGroup.appendChild(circle);
    if (hasTerrain) {
      const img = document.createElementNS('http://www.w3.org/2000/svg', 'image');
      img.setAttribute('x', pos.x - R); img.setAttribute('y', pos.y - R);
      img.setAttribute('width', R * 2); img.setAttribute('height', R * 2);
      img.setAttribute('href', TERRAIN_IMGS[zone.terrain]);
      img.setAttribute('preserveAspectRatio', 'xMidYMid meet');
      img.style.pointerEvents = 'none';
      zoneGroup.appendChild(img);
    }
    if (zone.terrain) {
      const terrainEl = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      terrainEl.setAttribute('x', pos.x); terrainEl.setAttribute('y', pos.y - R - 22);
      terrainEl.setAttribute('text-anchor', 'middle'); terrainEl.setAttribute('fill', '#000000');
      terrainEl.setAttribute('font-family', '"ZoesHandwriting", cursive'); terrainEl.setAttribute('font-size', '52');
      terrainEl.setAttribute('font-weight', 'bold');
      terrainEl.style.pointerEvents = 'none'; terrainEl.textContent = (TERRAIN_LABELS[zone.terrain] || zone.terrain) + ' of';
      zoneGroup.appendChild(terrainEl);
    }
    if (zone.feeling) {
      const feelEl = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      feelEl.setAttribute('x', pos.x); feelEl.setAttribute('y', pos.y + R + 48);
      feelEl.setAttribute('text-anchor', 'middle'); feelEl.setAttribute('fill', '#000000');
      feelEl.setAttribute('font-family', '"ZoesHandwriting", cursive'); feelEl.setAttribute('font-size', '52');
      feelEl.setAttribute('font-weight', 'bold');
      feelEl.style.pointerEvents = 'none'; feelEl.textContent = zone.feeling;
      zoneGroup.appendChild(feelEl);
    }
  });

  container.innerHTML = '';
  container.appendChild(svg);
}

return {
  TERRAIN_IMGS, TERRAIN_CATEGORIES, TERRAIN, TERRAIN_LABELS, WEATHER_CATS,
  ZONE_PROMPTS, THREE_ACT_ZONE_POSITIONS, THREE_ACT_VIEWBOX, THREE_ACT_CURVE_IMG,
  create: createThreeActMap,
  renderStatic,
};

})();
