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
const supabaseOrigin = (() => {
  try {
    return new URL(supabaseUrl).origin;
  } catch {
    return "";
  }
})();
const supabaseHosts = (() => {
  try {
    const u = new URL(supabaseUrl);
    return `${u.origin} ${u.protocol === "https:" ? "wss" : "ws"}://${u.host}`;
  } catch {
    return "";
  }
})();
const google = "https://*.googleapis.com https://*.gstatic.com https://*.google.com";
// The dev server evaluates strings (source maps, React's call stacks). A production build must not need this.
const devEval = process.env.NODE_ENV === "production" ? "" : " 'unsafe-eval'";

/**
 * The Content-Security-Policy, enforced. It ran in report-only mode first and was checked against the real Google
 * Maps scripts (2026-11-19). If a new third-party script or host is added, a violation now BLOCKS it: add the host
 * here. To investigate without blocking, temporarily send this value as Content-Security-Policy-Report-Only.
 * e2e/security-headers.spec.ts fails if one of our own screens logs a violation.
 */
const csp = [
  "frame-ancestors 'none'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "default-src 'self'",
  // Next and the theme script are inline (a nonce setup would replace 'unsafe-inline'). 'wasm-unsafe-eval' lets the
  // Google Maps script compile its WebAssembly; it does NOT allow evaluating strings. Our own bundle has no WebAssembly.
  `script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval'${devEval} ${google}`,
  `connect-src 'self' data: ${supabaseHosts} ${google}`, // data: is used by the Google Maps label worker
  // Photos can come from any https site the owner pasted; the Supabase origin is named so signed links work over http in tests.
  `img-src 'self' data: blob: https: ${supabaseOrigin}`,
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
          { key: "Content-Security-Policy", value: csp },
        ],
      },
    ];
  },
};

export default nextConfig;
