import type { NextConfig } from "next";

// Production-leaning security headers. We deliberately don't ship a
// strict Content-Security-Policy yet because the app uses a few
// inline-style patterns (CSS-var-driven dynamic styles) and Tailwind
// + Next.js inject inline styles at build time — a strict CSP would
// need explicit nonces or a pre-build script. The headers below give
// us defense-in-depth without breaking the app:
//
//   X-Content-Type-Options: nosniff
//     Stops the browser from mime-sniffing a non-image as an image.
//   X-Frame-Options: DENY
//     Refuses to be embedded in an iframe → clickjacking protection.
//   Referrer-Policy: strict-origin-when-cross-origin
//     Sends the origin (not the path) on cross-origin navigations.
//   Permissions-Policy: camera=*, microphone=*, geolocation=()
//     Camera + mic stay on (avatar / post media capture); geolocation
//     is locked off — we never request it and don't want a future
//     library to accidentally enable it.
//   Strict-Transport-Security
//     Tell modern browsers to force HTTPS for a year. The preload
//     directive is intentionally absent — submitting to the HSTS
//     preload list is a one-way door and should be a deliberate ops
//     decision once the app has been on HTTPS for a few weeks.
//
// We rely on Vercel for HTTPS termination, so HSTS is applied by
// the edge regardless of what the Node server returns. The header
// here is a belt-and-suspenders default for any other host.
const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=*, microphone=*, geolocation=(), browsing-topics=()",
  },
  {
    key: "Strict-Transport-Security",
    value: "max-age=31536000; includeSubDomains",
  },
];

const nextConfig: NextConfig = {
  // Apply the headers to every route. The catch-all `/(.*)` source
  // matches both pages and the `_next` static assets — same defaults,
  // since nothing here is path-specific.
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: securityHeaders,
      },
    ];
  },
};

export default nextConfig;
