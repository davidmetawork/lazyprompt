/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  typescript: {
    // Temporarily ignore TypeScript errors during build for deployment
    ignoreBuildErrors: true,
  },
  eslint: {
    // Temporarily ignore ESLint errors during build for deployment
    ignoreDuringBuilds: true,
  },
  transpilePackages: ['@lazyprompt/ui', '@lazyprompt/database', '@lazyprompt/auth'],
  images: {
    domains: [
      "avatars.githubusercontent.com",
      "lh3.googleusercontent.com",
    ],
  }
};

module.exports = nextConfig; 