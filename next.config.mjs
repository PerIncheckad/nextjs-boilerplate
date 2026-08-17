/** @type {import('next').NextConfig} */
const nextConfig = {
  // TypeScript-fel ska stoppa build/deploy.
  typescript: {
    ignoreBuildErrors: false,
  },
  // ESLint etableras som separat kvalitetsspärr i ett senare stabiliseringspass.
  eslint: {
    ignoreDuringBuilds: true,
  },
};

export default nextConfig;
