/* Room slider — shows a "scroll left and right to explore this room"
   hint whenever the viewport is in a vertical/portrait orientation,
   pairing with assets/css/room-slider.css and the .room-scroll /
   .room-stage wrapper markup. Fires on load and again any time the
   viewport transitions into portrait (e.g. rotating a phone or
   resizing a desktop window taller than it is wide). */
(function () {
  function ensureHintDom() {
    var overlay = document.getElementById("room-hint-overlay");
    if (overlay) return overlay;

    overlay = document.createElement("div");
    overlay.className = "room-hint-overlay";
    overlay.id = "room-hint-overlay";
    overlay.innerHTML =
      '<div class="room-hint-popup">' +
        '<button class="room-hint-close" id="room-hint-close" aria-label="close">&#x2715;</button>' +
        '<div class="room-hint-icon">⟷</div>' +
        '<div class="room-hint-text">scroll left and right to explore this room</div>' +
      "</div>";
    document.body.appendChild(overlay);

    function close() { overlay.classList.remove("open"); }
    overlay._close = close;
    overlay.addEventListener("click", function (e) {
      if (e.target === overlay) close();
    });
    document.getElementById("room-hint-close").addEventListener("click", close);

    return overlay;
  }

  var hideTimer;
  function showHint() {
    var overlay = ensureHintDom();
    overlay.classList.add("open");
    clearTimeout(hideTimer);
    hideTimer = setTimeout(function () { overlay._close(); }, 4200);
  }

  var mq = window.matchMedia("(orientation: portrait)");
  function handleChange(e) {
    if (e.matches) showHint();
  }

  if (mq.matches) {
    setTimeout(showHint, 300);
  }
  if (mq.addEventListener) mq.addEventListener("change", handleChange);
  else mq.addListener(handleChange);
})();
