/** @type {import('next').NextConfig} */
const nextConfig = {
  // TypeScript-fel ska stoppa build/deploy.
  typescript: {
    ignoreBuildErrors: false,
  },
};

export default nextConfig;
