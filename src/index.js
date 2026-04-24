// src/index.js
// Entry for the ratehero Workers Static Assets project.
// Serves the same responsive HTML to every visitor regardless of UA.
// The previous mobile UA rewrite was removed because routing real
// mobile users to /mobile/ while serving the desktop homepage to
// Googlebot-Smartphone constituted cloaking under Google's spam
// policies. The /mobile/ directory still exists in the repo but is
// no longer routed to by this Worker.

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // Explicit desktop override via ?desktop=1 or rh_desktop=1 cookie.
    // Retained from the previous mobile-rewrite era for compatibility
    // with any existing user cookies and bookmarked ?desktop=1 URLs.
    // Currently a no-op for routing (there's no mobile rewrite to
    // bypass), but still sets the cookie when the param is present.
    const cookie = request.headers.get('cookie') || '';
    const hasDesktopCookie = /(?:^|;\s*)rh_desktop=1/.test(cookie);
    const hasDesktopParam = url.searchParams.get('desktop') === '1';

    if (hasDesktopCookie || hasDesktopParam) {
      const response = await env.ASSETS.fetch(request);
      if (hasDesktopParam) {
        const r = new Response(response.body, response);
        r.headers.append(
          'Set-Cookie',
          'rh_desktop=1; Path=/; Max-Age=2592000; SameSite=Lax'
        );
        return r;
      }
      return response;
    }

    // Default: serve the requested asset unmodified. Same HTML for
    // every visitor — desktop, mobile, bot, anyone.
    return env.ASSETS.fetch(request);
  }
};
