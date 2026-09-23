import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  images: {
    formats: ["image/avif", "image/webp"],
    qualities: [50, 75],
  },
  async redirects() {
    // The homepage is the advertiser page; /advertise is kept for links and ads.
    return [{ source: "/advertise", destination: "/", permanent: false }];
  },
};

export default nextConfig;
