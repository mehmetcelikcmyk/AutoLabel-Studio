/**
 * AutoLabel Studio - Frontend API Configuration
 * /api/* istekleri hem yerelde (FastAPI) hem de Cloudflare Pages uzerinde
 * (functions/api/[[path]].js proxy ile) ayni kaynaktan servis edilir.
 */
(function () {
  var saved = "";
  try {
    saved = localStorage.getItem("autolabel_api_base") || "";
  } catch (_) {}

  var base = (window.AUTOLABEL_API_BASE || saved || "").trim().replace(/\/+$/, "");
  window.AUTOLABEL_API_BASE = base;

  window.apiUrl = function (path) {
    if (!path || typeof path !== "string") return path;
    if (/^https?:\/\//i.test(path)) return path;
    if (base && path.startsWith("/api/")) {
      return base + path;
    }
    return path;
  };
})();
