export const securityHeaders = {
  "Content-Security-Policy":
    "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https:; connect-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
};

/**
 * @typedef {{ fetch(request: Request): Promise<Response> }} AssetBinding
 * @typedef {{ ASSETS: AssetBinding }} WorkerEnvironment
 */

/**
 * @param {Response} response
 * @returns {Response}
 */
function withSecurityHeaders(response) {
  const headers = new Headers(response.headers);
  for (const [name, value] of Object.entries(securityHeaders)) {
    headers.set(name, value);
  }
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

export default {
  /**
   * @param {Request} request
   * @param {WorkerEnvironment} env
   * @returns {Promise<Response>}
   */
  async fetch(request, env) {
    const url = new URL(request.url);
    let response = await env.ASSETS.fetch(request);

    if (
      request.method === "GET" &&
      response.status === 404 &&
      !url.pathname.includes(".")
    ) {
      // Sites normalizes /index.html to / with a redirect. Fetching the root
      // asset directly keeps deep-link responses at 200 without forwarding
      // that redirect to the browser.
      const fallbackUrl = new URL("/", request.url);
      response = await env.ASSETS.fetch(new Request(fallbackUrl, request));
    }

    return withSecurityHeaders(response);
  },
};
