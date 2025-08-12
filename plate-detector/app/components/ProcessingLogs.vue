<template>
  <div class="glass-card">
    <div class="section-header">
      <h2 class="section-title">
        <svg class="section-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
        Logs de Procesamiento
        <span v-if="logs.length > 0" class="log-count">{{ logs.length }}</span>
      </h2>
      <button v-if="logs.length > 0" @click="clearLogs" class="btn btn-secondary btn-sm">
        <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
        </svg>
        Limpiar
      </button>
    </div>

    <div class="logs-container" ref="logsContainer">
      <div v-if="logs.length === 0" class="no-logs">
        <svg class="no-logs-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
        </svg>
        <p>No hay logs de procesamiento aún</p>
        <small>Los logs aparecerán aquí durante el análisis de imágenes</small>
      </div>

      <div v-else class="logs-list">
        <div 
          v-for="(log, index) in logs" 
          :key="index"
          :class="['log-entry', `log-${log.type}`]"
          :title="log.timestamp"
        >
          <div class="log-icon">
            <svg v-if="log.type === 'success'" width="16" height="16" fill="currentColor" viewBox="0 0 24 24">
              <path d="M9 16.2L4.8 12l-1.4 1.4L9 19 21 7l-1.4-1.4L9 16.2z"/>
            </svg>
            <svg v-else-if="log.type === 'error'" width="16" height="16" fill="currentColor" viewBox="0 0 24 24">
              <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
            </svg>
            <svg v-else-if="log.type === 'warning'" width="16" height="16" fill="currentColor" viewBox="0 0 24 24">
              <path d="M1 21h22L12 2 1 21zm12-3h-2v-2h2v2zm0-4h-2v-4h2v4z"/>
            </svg>
            <svg v-else width="16" height="16" fill="currentColor" viewBox="0 0 24 24">
              <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/>
            </svg>
          </div>
          <div class="log-content">
            <span class="log-message">{{ log.message }}</span>
            <span class="log-time">{{ formatTime(log.timestamp) }}</span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
const props = defineProps({
  logs: {
    type: Array,
    default: () => []
  }
})

const emit = defineEmits(['clear'])

const logsContainer = ref(null)

const clearLogs = () => {
  emit('clear')
}

const formatTime = (timestamp) => {
  return new Date(timestamp).toLocaleTimeString('es-ES', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    fractionalSecondDigits: 1
  })
}

// Auto-scroll to bottom when new logs are added
watch(() => props.logs.length, () => {
  nextTick(() => {
    if (logsContainer.value) {
      logsContainer.value.scrollTop = logsContainer.value.scrollHeight
    }
  })
})
</script>

<style scoped>
.section-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 1rem;
}

.section-title {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  color: white;
  font-size: 1.125rem;
  font-weight: 600;
  margin: 0;
}

.section-icon {
  width: 20px;
  height: 20px;
  color: #3b82f6;
}

.log-count {
  background: #3b82f6;
  color: white;
  font-size: 0.75rem;
  padding: 0.25rem 0.5rem;
  border-radius: 1rem;
  min-width: 1.5rem;
  text-align: center;
}

.logs-container {
  max-height: 400px;
  overflow-y: auto;
  background: rgba(0, 0, 0, 0.2);
  border-radius: 0.5rem;
  border: 1px solid rgba(255, 255, 255, 0.1);
}

.no-logs {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 2rem;
  text-align: center;
  color: rgba(255, 255, 255, 0.6);
}

.no-logs-icon {
  width: 48px;
  height: 48px;
  color: rgba(255, 255, 255, 0.3);
  margin-bottom: 1rem;
}

.logs-list {
  padding: 0.5rem;
}

.log-entry {
  display: flex;
  align-items: flex-start;
  gap: 0.75rem;
  padding: 0.75rem;
  margin-bottom: 0.5rem;
  border-radius: 0.5rem;
  border-left: 3px solid transparent;
  background: rgba(255, 255, 255, 0.05);
  transition: all 0.2s ease;
}

.log-entry:hover {
  background: rgba(255, 255, 255, 0.1);
}

.log-entry:last-child {
  margin-bottom: 0;
}

.log-info {
  border-left-color: #3b82f6;
}

.log-success {
  border-left-color: #10b981;
}

.log-warning {
  border-left-color: #f59e0b;
}

.log-error {
  border-left-color: #ef4444;
}

.log-icon {
  flex-shrink: 0;
  margin-top: 0.125rem;
}

.log-info .log-icon {
  color: #3b82f6;
}

.log-success .log-icon {
  color: #10b981;
}

.log-warning .log-icon {
  color: #f59e0b;
}

.log-error .log-icon {
  color: #ef4444;
}

.log-content {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.log-message {
  color: white;
  font-size: 0.875rem;
  line-height: 1.4;
}

.log-time {
  color: rgba(255, 255, 255, 0.5);
  font-size: 0.75rem;
  font-family: 'Courier New', monospace;
}

.btn-sm {
  padding: 0.5rem 0.75rem;
  font-size: 0.875rem;
}

/* Custom scrollbar */
.logs-container::-webkit-scrollbar {
  width: 6px;
}

.logs-container::-webkit-scrollbar-track {
  background: rgba(0, 0, 0, 0.1);
  border-radius: 3px;
}

.logs-container::-webkit-scrollbar-thumb {
  background: rgba(255, 255, 255, 0.2);
  border-radius: 3px;
}

.logs-container::-webkit-scrollbar-thumb:hover {
  background: rgba(255, 255, 255, 0.3);
}
</style>