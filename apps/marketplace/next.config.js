/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@lazyprompt/ui', '@lazyprompt/database', '@lazyprompt/auth'],
  images: {
    domains: [
      "avatars.githubusercontent.com",
      "lh3.googleusercontent.com",
    ],
  }
};

module.exports = nextConfig; 