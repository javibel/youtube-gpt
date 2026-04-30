import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      { hostname: 'm.media-amazon.com' },
      { hostname: 'cdn.manfrotto.com' },
      { hostname: 'cdn11.bigcommerce.com' },
      { hostname: 'www.apple.com' },
      { hostname: 'i.dell.com' },
      { hostname: 'resource.logitech.com' },
      { hostname: 'images.blackmagicdesign.com' },
    ],
  },
};

export default nextConfig;
