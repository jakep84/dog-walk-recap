import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,

  // If you ever use next/image, this prevents “Image from host not allowed” errors.
  images: {
    remotePatterns: [
      // Firebase Storage public URLs
      {
        protocol: "https",
        hostname: "firebasestorage.googleapis.com",
        pathname: "/v0/b/**",
      },
      // If you ever use the "storage.googleapis.com/<bucket>" style URLs
      {
        protocol: "https",
        hostname: "storage.googleapis.com",
        pathname: "/**",
      },
      // If you keep Leaflet marker icons from unpkg (optional)
      {
        protocol: "https",
        hostname: "unpkg.com",
        pathname: "/**",
      },
    ],
  },

  // IMPORTANT: Do NOT add CSP headers here unless you really need them.
  // If you previously had an async headers() with Content-Security-Policy, remove it.
};

export default nextConfig;
