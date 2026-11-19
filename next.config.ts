import type { NextConfig } from "next";

const securityHeaders = [
  // The invite token lives in the URL; never send it to other sites as a referrer.
  { key: "Referrer-Policy", value: "no-referrer" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
];

// Where the browser may talk to. Supabase's address comes from the environment (the e2e tests use a fake one).
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const supabaseHosts = (() => {
  try {
    const u = new URL(supabaseUrl);
    return `${u.origin} ${u.protocol === "https:" ? "wss" : "ws"}://${u.host}`;
  } catch {
    return "";
  }
})();
const google = "https://*.googleapis.com https://*.gstatic.com https://*.google.com";

/**
 * ENFORCED: the directives that cannot break a page (no framing, no plugins, no <base> tricks, forms stay on-site).
 * REPORT-ONLY: the full policy. It shows violations in the browser console without blocking anything. After a
 * deploy, open every screen (especially Itinerary with the map), and when the console is quiet, move these
 * directives into the enforced header. Not verified against the real Google Maps scripts.
 */
const enforcedCsp = "frame-ancestors 'none'; object-src 'none'; base-uri 'self'; form-action 'self'";
const fullCsp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline' ${google}`, // Next and the theme script are inline; a nonce setup would replace this
  `connect-src 'self' ${supabaseHosts} ${google}`,
  "img-src 'self' data: blob: https:", // photos can come from any https site the owner pasted
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' data: https://fonts.gstatic.com",
  "worker-src 'self' blob:",
  "frame-src 'none'",
].join("; ");

const nextConfig: NextConfig = {
  // Test and Lighthouse builds use their own folder so they never clobber a dev server or a real build.
  distDir: process.env.NEXT_DIST_DIR || ".next",
  cacheComponents: true,
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          ...securityHeaders,
          { key: "Content-Security-Policy", value: enforcedCsp },
          { key: "Content-Security-Policy-Report-Only", value: fullCsp },
        ],
      },
    ];
  },
};

export default nextConfig;
