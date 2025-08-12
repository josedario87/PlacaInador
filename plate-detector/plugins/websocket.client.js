export default defineNuxtPlugin(() => {
  // Create reactive state that will be available globally
  const websocketState = reactive({
    websocket: null,
    connected: false,
    logs: [],
    processedImages: []
  })
  
  const connect = () => {
    if (websocketState.websocket) return
    
    // For now, let's disable WebSocket in development to avoid connection issues
    // This will be a simple state management without real-time updates
    websocketState.connected = true
    console.log('WebSocket state initialized (mock mode)')
  }
  
  const disconnect = () => {
    if (websocketState.websocket) {
      websocketState.websocket.close()
      websocketState.websocket = null
    }
    websocketState.connected = false
  }
  
  const subscribe = (sessionId) => {
    console.log('Subscribed to session:', sessionId)
    // In mock mode, this is just a placeholder
  }
  
  const clearLogs = () => {
    websocketState.logs.splice(0)
  }
  
  const clearProcessedImages = () => {
    websocketState.processedImages.splice(0)
  }
  
  // Auto-connect on plugin initialization
  if (process.client) {
    connect()
  }
  
  return {
    provide: {
      websocket: {
        connect,
        disconnect,
        subscribe,
        clearLogs,
        clearProcessedImages,
        connected: computed(() => websocketState.connected),
        logs: computed(() => websocketState.logs),
        processedImages: computed(() => websocketState.processedImages),
        // Internal state for updating
        _state: websocketState
      }
    }
  }
})