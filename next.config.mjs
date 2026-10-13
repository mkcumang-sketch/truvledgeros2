/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  experimental: {
    cpus: 1,
  },
  images: {
    // Disable external SVG execution and remote unconstrained domains
    dangerouslyAllowSVG: false,
    contentDispositionType: "attachment",
  },
};

export default nextConfig;
