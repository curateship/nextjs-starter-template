/*
 * Analytic tracking snippet. Install with:
 *   <script defer data-site="YOUR_SITE_ID" src="https://your-analytic-host/js/track.js"></script>
 * Records page views and sends them in small batches. Fails silently — it must
 * never break the page it runs on.
 */
(function () {
  try {
    var script =
      document.currentScript ||
      document.querySelector("script[data-site]") ||
      document.querySelector('script[src*="/js/track.js"]');
    if (!script) return;

    var siteId = script.getAttribute("data-site");
    if (!siteId) return;

    // Send events back to whatever host served this snippet.
    var endpoint;
    try {
      endpoint = new URL(script.src).origin + "/api/v1/track";
    } catch (e) {
      return;
    }

    var queue = [];

    function store(key, value) {
      try {
        if (value === undefined) return localStorage.getItem(key);
        localStorage.setItem(key, value);
      } catch (e) {
        return null;
      }
    }

    // Stable anonymous id (no PII) so returning visitors can be measured later.
    function visitorCode() {
      var v = store("_an_v");
      if (!v) {
        v = (Date.now().toString(36) + Math.random().toString(36).slice(2, 10));
        store("_an_v", v);
      }
      return v;
    }

    // True at most once per browser per UTC day, for unique-visitor counts.
    function firstToday() {
      var day = new Date().toISOString().slice(0, 10);
      var key = "_an_d:" + siteId + ":" + day;
      if (store(key)) return false;
      store(key, "1");
      return true;
    }

    function flush() {
      if (!queue.length) return;
      var batch = queue;
      queue = [];
      var body = JSON.stringify({ site: siteId, events: batch });
      var url = endpoint + "?s=" + encodeURIComponent(siteId);
      try {
        if (navigator.sendBeacon && navigator.sendBeacon(url, body)) return;
      } catch (e) {}
      try {
        fetch(url, {
          method: "POST",
          body: body,
          headers: { "Content-Type": "text/plain" },
          keepalive: true,
          mode: "cors",
        }).catch(function () {});
      } catch (e) {}
    }

    var lastPath = "";
    function pageview() {
      var path = location.pathname + location.search;
      if (path === lastPath) return;
      lastPath = path;
      queue.push({
        type: "pageview",
        page_path: path,
        referrer: document.referrer || undefined,
        visitor_code: visitorCode(),
        daily_visitor: firstToday() || undefined,
        timestamp: new Date().toISOString(),
      });
    }

    // Follow client-side navigations in single-page apps.
    function hook(name) {
      var original = history[name];
      if (typeof original !== "function") return;
      history[name] = function () {
        var result = original.apply(this, arguments);
        pageview();
        return result;
      };
    }
    hook("pushState");
    hook("replaceState");
    window.addEventListener("popstate", pageview);

    document.addEventListener("visibilitychange", function () {
      if (document.visibilityState === "hidden") flush();
    });
    window.addEventListener("pagehide", flush);
    setInterval(flush, 5000);

    pageview();
  } catch (e) {
    // Swallow — tracking must never throw into the host page.
  }
})();
