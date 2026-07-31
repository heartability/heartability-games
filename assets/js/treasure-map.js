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
    { id: "water",      label: "water"      },
    { id: "barriers",   label: "barriers"   },
    { id: "landscapes", label: "landscapes" },
  ];

  const TERRAIN = [
    { id: "pond",      label: "pond",      cat: "water" },
    { id: "waterfall", label: "waterfall", cat: "water" },
    { id: "spring",    label: "spring",    cat: "water" },
    { id: "river",     label: "river",     cat: "water" },
    { id: "ocean",     label: "ocean",     cat: "water" },
    { id: "glacier",   label: "glacier",   cat: "water" },

    { id: "marsh",     label: "marsh",     cat: "barriers" },
    { id: "dunes",     label: "dunes",     cat: "barriers" },
    { id: "mountains", label: "mountains", cat: "barriers" },
    { id: "cave",      label: "cave",      cat: "barriers" },
    { id: "cliff",     label: "cliff",     cat: "barriers" },
    { id: "maze",      label: "maze",      cat: "barriers" },

    { id: "plateau",   label: "plateau",   cat: "landscapes" },
    { id: "valley",    label: "valley",    cat: "landscapes" },
    { id: "meadow",    label: "meadow",    cat: "landscapes" },
    { id: "jungle",    label: "jungle",    cat: "landscapes" },
    { id: "island",    label: "island",    cat: "landscapes" },
    { id: "forest",    label: "forest",    cat: "landscapes" },
  ];

  const TERRAIN_ORDER = TERRAIN.map(t => t.id);
  const TERRAIN_LABELS = Object.fromEntries(TERRAIN.map(t => [t.id, t.label]));

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
