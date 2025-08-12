export default defineNuxtConfig({
  compatibilityDate: '2024-11-01',
  devtools: { enabled: true },
  ssr: false,
  nitro: {
    experimental: {
      websocket: true
    },
    cors: {
      origin: '*',
      credentials: false,
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS']
    }
  },
  css: ['~/assets/css/main.css'],
  devServer: {
    host: '0.0.0.0'
  }
})
