import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // Amplify's SSR runtime sits behind CloudFront, so the forwarded host can
    // differ from the browser's Origin; allow the public domain explicitly.
    serverActions: { allowedOrigins: ["blog.skang.dev"] },
  },
};

export default nextConfig;
