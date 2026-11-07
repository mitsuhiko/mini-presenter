// Compatibility shim for decks that include the standalone script from its old
// location (https://cdn.jsdelivr.net/gh/mitsuhiko/mini-presenter@main/client/standalone.js).
// The browser assets are now built and published to npm; this forwards to them.
// New decks should use:
//
//   <script src="https://cdn.jsdelivr.net/npm/mini-presenter@0/dist/client/standalone.js"></script>
(function () {
  var current = document.currentScript;
  var script = document.createElement("script");
  script.src = "https://cdn.jsdelivr.net/npm/mini-presenter@0/dist/client/standalone.js";
  // Only `data-force` carries over; the old asset overrides (base, runtime,
  // transport, presenter) point at files that no longer exist.
  if (current && current.dataset.force !== undefined) {
    script.dataset.force = current.dataset.force;
  }
  (document.head || document.documentElement).appendChild(script);
})();
