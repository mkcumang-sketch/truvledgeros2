/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  eslint: {
    // Prevent unescaped entity or non-critical lint rules from aborting production builds
    ignoreDuringBuilds: true,
  },
  typescript: {
    // Keep strict type-safety enabled
    ignoreBuildErrors: false,
  },
  experimental: {
    cpus: 1,
    serverComponentsExternalPackages: ["ioredis"],
  },
  images: {
    // Disable external SVG execution and remote unconstrained domains
    dangerouslyAllowSVG: false,
    contentDispositionType: "attachment",
  },
};

export default nextConfig;