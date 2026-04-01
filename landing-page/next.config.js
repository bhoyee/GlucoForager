/** @type {import('next').NextConfig} */
const nextConfig = {
  async redirects() {
    return [
      // Force canonical host for SEO consistency.
      {
        source: '/:path*',
        has: [{ type: 'host', value: 'glucoforager.com' }],
        destination: 'https://www.glucoforager.com/:path*',
        permanent: true,
      },
    ];
  },
};

module.exports = nextConfig;

