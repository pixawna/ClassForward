import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    // Google profile photos
    remotePatterns: [{ protocol: "https", hostname: "lh3.googleusercontent.com" }],
  },
  // Native binaries used by the video renderer: load them from node_modules at runtime, don't bundle them.
  serverExternalPackages: ["@resvg/resvg-js", "@ffmpeg-installer/ffmpeg"],
};

export default nextConfig;
