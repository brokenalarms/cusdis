module.exports = {
  reactStrictMode: true,
  env: {
    PLATFORM_SUPPORTS_WEBSOCKETS: process.env.PLATFORM_SUPPORTS_WEBSOCKETS || 'false',
  },
  rewrites() {
    return [
      {
        source: '/doc',
        destination: '/doc/index.html'
      }
    ]
  }
}