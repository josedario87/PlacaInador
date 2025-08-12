import { initWebSocketServer } from '../server/api/websocket.js'

export default async function (nitroApp) {
  nitroApp.hooks.hook('listen', (server) => {
    initWebSocketServer(server)
    console.log('WebSocket server initialized')
  })
}