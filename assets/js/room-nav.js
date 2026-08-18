/* ── Heartability shared room-map dropdown ──
   Renders the "map ▾" button + link list into config.mount. Single source
   of truth for the room list — previously this was hand-copied into 11
   pages and every room rename meant editing all 11 by hand.
   Load assets/css/room-nav.css alongside this file. */

window.HeartabilityRoomNav = (function () {
  const ROOMS = [
    { id: 'bed',       label: 'bedroom',   href: '../rooms/bed.html' },
    { id: 'game-room', label: 'game room', href: '../rooms/game-room.html' },
    { id: 'patio',     label: 'patio',     href: '../rooms/patio.html' },
    { id: 'library',   label: 'library',   href: '../rooms/library.html' },
    { id: 'salon',     label: 'salon',     href: '../rooms/salon.html' },
    { id: 'timewarp',  label: 'timewarp',  href: '../matrix/timewarp.html' },
    { id: 'daily',     label: 'matrix',    href: '../matrix/daily.html' },
    { id: 'archive',   label: 'archive',   href: '../matrix/archive.html' },
  ];

  function $(id) { return document.getElementById(id); }

  function itemHtml(room, currentRoom) {
    if (room.id === currentRoom) {
      return `<span class="map-item current">${room.label}</span>`;
    }
    return `<a class="map-item" href="${room.href}">${room.label}</a>`;
  }

  function outsideClick(e) {
    const wrap = $('map-wrap');
    const dd = $('map-dropdown');
    if (wrap && dd && !wrap.contains(e.target)) dd.classList.remove('open');
  }

  function init(config) {
    const mount = document.querySelector(config.mount);
    mount.innerHTML = `
      <div class="map-wrap" id="map-wrap">
        <button class="nav-btn map-btn" id="map-btn">map ▾</button>
        <div class="map-dropdown" id="map-dropdown">
          ${ROOMS.map(r => itemHtml(r, config.currentRoom)).join('\n')}
        </div>
      </div>`;
    $('map-btn').addEventListener('click', () => $('map-dropdown').classList.toggle('open'));
    document.addEventListener('click', outsideClick);
  }

  return { init };
})();
