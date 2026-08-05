/* Heartability shared modal — standard popup for confirm/alert dialogs.
   Usage:
     const ok = await HGModal.confirm("delete map?", "this cannot be undone.");
     await HGModal.alert("saved", "your changes were saved.");
*/
(function () {
  function ensureDom() {
    var overlay = document.getElementById("hg-modal-overlay");
    if (overlay) return overlay;

    overlay = document.createElement("div");
    overlay.className = "hg-modal-overlay";
    overlay.id = "hg-modal-overlay";
    overlay.innerHTML =
      '<div class="hg-modal">' +
        '<div class="hg-modal-titlebar">' +
          '<span id="hg-modal-title"></span>' +
          '<span class="hg-modal-close" id="hg-modal-close">&#x2715;</span>' +
        '</div>' +
        '<div class="hg-modal-body">' +
          '<div class="hg-modal-message" id="hg-modal-message"></div>' +
          '<div class="hg-modal-actions" id="hg-modal-actions"></div>' +
        '</div>' +
      '</div>';
    document.body.appendChild(overlay);
    return overlay;
  }

  function open(title, message, buttons) {
    var overlay = ensureDom();
    document.getElementById("hg-modal-title").textContent = title || "";
    document.getElementById("hg-modal-message").textContent = message || "";

    var actions = document.getElementById("hg-modal-actions");
    actions.innerHTML = "";
    actions.classList.toggle("stacked", !!buttons.stacked);

    return new Promise(function (resolve) {
      function close(value) {
        overlay.classList.remove("open");
        document.removeEventListener("keydown", onKeydown);
        resolve(value);
      }

      function onKeydown(e) {
        if (e.key === "Escape") close(buttons.escValue);
      }
      document.addEventListener("keydown", onKeydown);

      document.getElementById("hg-modal-close").onclick = function () {
        close(buttons.escValue);
      };

      buttons.items.forEach(function (btn) {
        var el = document.createElement("button");
        el.className = "hg-modal-btn" + (btn.variant ? " hg-modal-btn-" + btn.variant : "");
        el.textContent = btn.label;
        el.onclick = function () { close(btn.value); };
        actions.appendChild(el);
      });

      overlay.classList.add("open");
    });
  }

  window.HGModal = {
    // opts.stacked: true renders the confirm button on top and the cancel
    // option as a plain underlined link below it (instead of the default
    // side-by-side boxed buttons) — used by the journal "unsent message"
    // prompt. opts.cancelVariant: "link" pairs with it to style the cancel
    // option as that plain link; omit either for the original look.
    confirm: function (title, message, opts) {
      opts = opts || {};
      var confirmItem = { label: opts.confirmLabel || "ok", value: true, variant: opts.danger ? "danger" : "primary" };
      var cancelItem  = { label: opts.cancelLabel || "cancel", value: false, variant: opts.cancelVariant };
      return open(title, message, {
        escValue: false,
        stacked: !!opts.stacked,
        items: opts.stacked ? [confirmItem, cancelItem] : [cancelItem, confirmItem]
      });
    },
    alert: function (title, message, opts) {
      opts = opts || {};
      return open(title, message, {
        escValue: undefined,
        items: [
          { label: opts.okLabel || "ok", value: undefined, variant: "primary" }
        ]
      });
    },
    // Single-action popup: one primary button plus the titlebar × — for
    // "here's a next step" prompts (e.g. "saved! want to review it?") where
    // there's no real "cancel", just "do the thing" or "dismiss". Resolves
    // true if the button was clicked, false for × / Escape / overlay dismiss.
    action: function (title, message, opts) {
      opts = opts || {};
      return open(title, message, {
        escValue: false,
        items: [
          { label: opts.label || "ok", value: true, variant: opts.variant || "primary" }
        ]
      });
    }
  };
})();
