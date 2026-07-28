export const securityHeaders = {
  "Content-Security-Policy":
    "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https:; connect-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
};
export const internalAssetPrefix = "/__forge_static";

/** @param {string | null} value */
function optionalString(value) {
  return value;
}

export const embeddedIndexHtml = optionalString(null);

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
    const assetUrl = new URL(request.url);
    assetUrl.pathname =
      url.pathname === "/"
        ? `${internalAssetPrefix}/`
        : `${internalAssetPrefix}${url.pathname}`;
    let response = await env.ASSETS.fetch(new Request(assetUrl, request));

    if (
      request.method === "GET" &&
      response.status === 404 &&
      !url.pathname.includes(".")
    ) {
      if (embeddedIndexHtml !== null) {
        response = new Response(embeddedIndexHtml, {
          headers: { "Content-Type": "text/html" },
        });
      } else {
        // Source-level tests use the asset fallback. Production builds replace
        // embeddedIndexHtml and remove the directly addressable HTML shell.
        const fallbackUrl = new URL(`${internalAssetPrefix}/`, request.url);
        response = await env.ASSETS.fetch(new Request(fallbackUrl, request));
      }
    }

    return withSecurityHeaders(response);
  },
};
