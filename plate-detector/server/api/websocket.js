import { WebSocketServer } from 'ws'

let wss = null
const clients = new Map()

export function initWebSocketServer(server) {
  if (wss) return wss
  
  wss = new WebSocketServer({ server })
  
  wss.on('connection', (ws, req) => {
    const clientId = Date.now().toString()
    clients.set(clientId, ws)
    
    console.log(`WebSocket client connected: ${clientId}`)
    
    ws.on('message', (message) => {
      try {
        const data = JSON.parse(message.toString())
        console.log(`Received message from ${clientId}:`, data)
        
        // Handle different message types
        switch (data.type) {
          case 'subscribe':
            ws.sessionId = data.sessionId
            break
          case 'ping':
            ws.send(JSON.stringify({ type: 'pong', timestamp: Date.now() }))
            break
        }
      } catch (error) {
        console.error('Error parsing WebSocket message:', error)
      }
    })
    
    ws.on('close', () => {
      clients.delete(clientId)
      console.log(`WebSocket client disconnected: ${clientId}`)
    })
    
    ws.on('error', (error) => {
      console.error(`WebSocket error for client ${clientId}:`, error)
      clients.delete(clientId)
    })
    
    // Send welcome message
    ws.send(JSON.stringify({
      type: 'welcome',
      clientId,
      timestamp: Date.now()
    }))
  })
  
  return wss
}

export function broadcastToSession(sessionId, data) {
  if (!wss) return
  
  clients.forEach((ws) => {
    if (ws.readyState === ws.OPEN && ws.sessionId === sessionId) {
      ws.send(JSON.stringify(data))
    }
  })
}

export function broadcast(data) {
  if (!wss) return
  
  clients.forEach((ws) => {
    if (ws.readyState === ws.OPEN) {
      ws.send(JSON.stringify(data))
    }
  })
}

export { wss }