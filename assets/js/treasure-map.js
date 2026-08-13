/* treasure-map.js — single source of truth for the treasure-map terrain +
   emotional-climate data shared by games/treasure-map.html and the location
   pickers in matrix/{cosmic,daily,dream}.html.

   Before this file existed, each of those pages hardcoded its own copy of
   TERRAIN_IMGS/TERRAIN_ORDER/WEATHER_CATS, so additions (like new feelings)
   made in one place silently didn't show up in the others. This is the fix:
   edit the data here once, every page picks it up.

   Load with a plain tag (no bundler):  <script src="../assets/js/treasure-map.js"></script>
   It attaches a single global:  window.TreasureMap

   Asset paths are emitted page-relative ("../assets/..."), so this must be
   loaded from a page one folder below the repo root (games/, matrix/, etc).
*/
(function () {
  'use strict';

  const TERRAIN_CATEGORIES = [
    { id: "air",   label: "air"   },
    { id: "fire",  label: "fire"  },
    { id: "water", label: "water" },
    { id: "earth", label: "earth" },
  ];

  const TERRAIN = [
    { id: "fog",        label: "fog",        cat: "air" },
    { id: "lightning",  label: "lightning",  cat: "air" },
    { id: "maze",       label: "maze",       cat: "air" },
    { id: "nebula",     label: "nebula",     cat: "air" },
    { id: "rainbow",    label: "rainbow",    cat: "air" },
    { id: "tornado",    label: "tornado",    cat: "air" },
    { id: "tumbleweed", label: "tumbleweed", cat: "air" },
    { id: "windtunnel", label: "windtunnel", cat: "air" },

    { id: "campfire",  label: "campfire",  cat: "fire" },
    { id: "desert",    label: "desert",    cat: "fire" },
    { id: "dunes",     label: "dunes",     cat: "fire" },
    { id: "hell",      label: "hell",      cat: "fire" },
    { id: "mesa",      label: "mesa",      cat: "fire" },
    { id: "supernova", label: "supernova", cat: "fire" },
    { id: "volcano",   label: "volcano",   cat: "fire" },
    { id: "wildfire",  label: "wildfire",  cat: "fire" },

    { id: "blizzard",  label: "blizzard",  cat: "water" },
    { id: "comet",     label: "comet",     cat: "water" },
    { id: "hurricane", label: "hurricane", cat: "water" },
    { id: "island",    label: "island",    cat: "water" },
    { id: "pond",      label: "pond",      cat: "water" },
    { id: "river",     label: "river",     cat: "water" },
    { id: "tidepool",  label: "tidepool",  cat: "water" },
    { id: "waterfall", label: "waterfall", cat: "water" },

    { id: "cave",       label: "cave",       cat: "earth" },
    { id: "cliff",      label: "cliff",      cat: "earth" },
    { id: "crater",     label: "crater",     cat: "earth" },
    { id: "crystal",    label: "crystal",    cat: "earth" },
    { id: "earthquake", label: "earthquake", cat: "earth" },
    { id: "jungle",     label: "jungle",     cat: "earth" },
    { id: "meadow",     label: "meadow",     cat: "earth" },
    { id: "mountains",  label: "mountains",  cat: "earth" },
  ];

  const TERRAIN_IMGS = {};
  TERRAIN.forEach(t => {
    TERRAIN_IMGS[t.id] = `../assets/elements/maps/${t.cat}/${t.id}.png`;
  });

  // Retired terrain ids. Not shown in any picker (excluded from TERRAIN /
  // TERRAIN_ORDER / TERRAIN_CATEGORIES), but kept resolvable here so old
  // saved maps that still reference them don't render a broken image.
  const OLD_TERRAIN = [
    { id: "forest",  label: "forest",  img: "../assets/elements/maps/old/forest.png" },
    { id: "glacier", label: "glacier", img: "../assets/elements/maps/old/glacier.png" },
    { id: "marsh",   label: "marsh",   img: "../assets/elements/maps/old/marsh.png" },
    { id: "ocean",   label: "ocean",   img: "../assets/elements/maps/old/ocean.png" },
    { id: "spring",  label: "spring",  img: "../assets/elements/maps/old/spring.png" },
    { id: "valley",  label: "valley",  img: "../assets/elements/maps/old/valley.png" },
    // plateau.png no longer exists; alias old saves to the closest new terrain.
    { id: "plateau", label: "plateau", img: "../assets/elements/maps/fire/mesa.png" },
  ];
  OLD_TERRAIN.forEach(t => { TERRAIN_IMGS[t.id] = t.img; });

  const TERRAIN_ORDER = TERRAIN.map(t => t.id);
  const TERRAIN_LABELS = Object.fromEntries(
    TERRAIN.concat(OLD_TERRAIN).map(t => [t.id, t.label])
  );

  // Canonical emotional-climate list. This is the full set — pages that
  // showed a trimmed subset before this file existed now get everything.
  const WEATHER_CATS = [
    { id: "sunny", label: "sunny", desc: "bright / happy / intense", cls: "sunny", tint: "#f2e6a8",
      feelings: ["trust","peace","joy","hope","confidence","truth","stability","acceptance","pressure","confrontation","temptation","reclamation","redemption","reunion"] },
    { id: "rainy", label: "rainy", desc: "sad / heavy / grief", cls: "rainy", tint: "#c9b3e7",
      feelings: ["shadows","worry","fear","depression","regret","confusion","boredom","loneliness","grief","sadness","betrayal","reckoning","surrender"] },
    { id: "windy", label: "windy", desc: "change / transition / evolution", cls: "windy", tint: "#b6e6cf",
      feelings: ["surprise","curiosity","inspiration","excitement","courage","progress","chaos","disruption","departure","initiation","crossroads","unraveling","rebirth","release"] },
    { id: "snowy", label: "snowy", desc: "cold / stuck / isolating", cls: "snowy", tint: "#a0d7e6",
      feelings: ["anger","avoidance","bitterness","apathy","shock","stillness","quiet","melancholy","isolation","abandonment","exile","descent","self-confrontation"] },
  ];

  window.TreasureMap = {
    TERRAIN_IMGS,
    TERRAIN_CATEGORIES,
    TERRAIN,
    TERRAIN_ORDER,
    TERRAIN_LABELS,
    WEATHER_CATS,
  };
})();
