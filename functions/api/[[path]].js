/**
 * Cloudflare Pages Function — Reverse proxy for /api/*
 * Proxies all /api/* requests (fetch, <img>, file downloads, Google OAuth redirects)
 * from https://autolabelstudio.com/api/* to the active backend origin.
 */
const DEFAULT_BACKEND_ORIGIN = "https://backend-production-7d66d736.up.railway.app";

export async function onRequest(context) {
  const { request, env } = context;
  const backendOrigin = (env && env.BACKEND_ORIGIN ? env.BACKEND_ORIGIN : DEFAULT_BACKEND_ORIGIN).replace(/\/+$/, "");

  const incomingUrl = new URL(request.url);
  const targetUrl = new URL(incomingUrl.pathname + incomingUrl.search, backendOrigin);

  const headers = new Headers(request.headers);
  headers.set("X-Forwarded-Host", incomingUrl.host);
  headers.set("X-Forwarded-Proto", incomingUrl.protocol.replace(":", ""));
  headers.delete("host");

  const init = {
    method: request.method,
    headers,
    redirect: "manual",
  };

  if (request.method !== "GET" && request.method !== "HEAD") {
    init.body = request.body;
  }

  const upstream = await fetch(targetUrl.toString(), init);

  // Preserve status, headers (including Set-Cookie and Location for OAuth redirects), and body
  const responseHeaders = new Headers(upstream.headers);
  return new Response(upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers: responseHeaders,
  });
}
