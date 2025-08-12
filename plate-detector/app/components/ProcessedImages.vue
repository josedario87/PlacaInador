<template>
  <div class="glass-card">
    <div class="section-header">
      <h2 class="section-title">
        <svg class="section-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
        </svg>
        Imágenes Procesadas
        <span v-if="processedImages.length > 0" class="image-count">{{ processedImages.length }}</span>
      </h2>
      <button v-if="processedImages.length > 0" @click="clearImages" class="btn btn-secondary btn-sm">
        <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
        </svg>
        Limpiar
      </button>
    </div>

    <div class="images-container">
      <div v-if="processedImages.length === 0" class="no-images">
        <svg class="no-images-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
        </svg>
        <p>No hay imágenes procesadas aún</p>
        <small>Las etapas de procesamiento aparecerán aquí durante el análisis</small>
      </div>

      <div v-else class="images-grid">
        <div 
          v-for="(image, index) in processedImages" 
          :key="image.filename"
          class="image-card"
          @click="selectedImage = image"
        >
          <div class="image-wrapper">
            <img 
              :src="image.url" 
              :alt="image.description"
              class="processed-image"
              @error="handleImageError"
            >
            <div class="image-overlay">
              <svg class="zoom-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM10 7v3m0 0v3m0-3h3m-3 0H7" />
              </svg>
            </div>
          </div>
          <div class="image-info">
            <h4 class="image-title">{{ getStepTitle(image.stepName) }}</h4>
            <p class="image-description">{{ image.description }}</p>
            <span class="image-time">{{ formatTime(image.timestamp) }}</span>
          </div>
          <div class="step-badge" :class="getStepBadgeClass(image.stepName)">
            {{ index + 1 }}
          </div>
        </div>
      </div>
    </div>

    <!-- Image Modal -->
    <div v-if="selectedImage" class="modal-overlay" @click="selectedImage = null">
      <div class="modal-content" @click.stop>
        <div class="modal-header">
          <h3>{{ getStepTitle(selectedImage.stepName) }}</h3>
          <button @click="selectedImage = null" class="modal-close">
            <svg width="24" height="24" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div class="modal-body">
          <img 
            :src="selectedImage.url" 
            :alt="selectedImage.description"
            class="modal-image"
          >
          <div class="modal-info">
            <p><strong>Descripción:</strong> {{ selectedImage.description }}</p>
            <p><strong>Archivo:</strong> {{ selectedImage.filename }}</p>
            <p><strong>Timestamp:</strong> {{ formatTime(selectedImage.timestamp) }}</p>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
const props = defineProps({
  processedImages: {
    type: Array,
    default: () => []
  }
})

const emit = defineEmits(['clear'])

const selectedImage = ref(null)

const clearImages = () => {
  emit('clear')
}

const getStepTitle = (stepName) => {
  const titles = {
    original: 'Original',
    cropped: 'Recortada',
    focused: 'Enfocada',
    high_contrast: 'Alto Contraste',
    edge_enhanced: 'Realce de Bordes',
    upscaled: 'Escalada'
  }
  return titles[stepName] || stepName
}

const getStepBadgeClass = (stepName) => {
  const classes = {
    original: 'badge-blue',
    cropped: 'badge-purple',
    focused: 'badge-green',
    high_contrast: 'badge-yellow',
    edge_enhanced: 'badge-orange',
    upscaled: 'badge-red'
  }
  return classes[stepName] || 'badge-gray'
}

const formatTime = (timestamp) => {
  return new Date(timestamp).toLocaleTimeString('es-ES', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  })
}

const handleImageError = (event) => {
  event.target.style.display = 'none'
  console.warn('Failed to load image:', event.target.src)
}

// Keyboard navigation for modal
onMounted(() => {
  const handleKeydown = (event) => {
    if (event.key === 'Escape') {
      selectedImage.value = null
    }
  }
  
  document.addEventListener('keydown', handleKeydown)
  
  onUnmounted(() => {
    document.removeEventListener('keydown', handleKeydown)
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
  color: #10b981;
}

.image-count {
  background: #10b981;
  color: white;
  font-size: 0.75rem;
  padding: 0.25rem 0.5rem;
  border-radius: 1rem;
  min-width: 1.5rem;
  text-align: center;
}

.images-container {
  max-height: 600px;
  overflow-y: auto;
}

.no-images {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 2rem;
  text-align: center;
  color: rgba(255, 255, 255, 0.6);
  background: rgba(0, 0, 0, 0.2);
  border-radius: 0.5rem;
  border: 1px solid rgba(255, 255, 255, 0.1);
}

.no-images-icon {
  width: 48px;
  height: 48px;
  color: rgba(255, 255, 255, 0.3);
  margin-bottom: 1rem;
}

.images-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(250px, 1fr));
  gap: 1rem;
}

.image-card {
  position: relative;
  background: rgba(0, 0, 0, 0.3);
  border-radius: 0.75rem;
  border: 1px solid rgba(255, 255, 255, 0.1);
  overflow: hidden;
  cursor: pointer;
  transition: all 0.3s ease;
}

.image-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 10px 25px rgba(0, 0, 0, 0.5);
  border-color: rgba(255, 255, 255, 0.2);
}

.image-wrapper {
  position: relative;
  aspect-ratio: 16/9;
  overflow: hidden;
}

.processed-image {
  width: 100%;
  height: 100%;
  object-fit: cover;
  transition: transform 0.3s ease;
}

.image-card:hover .processed-image {
  transform: scale(1.05);
}

.image-overlay {
  position: absolute;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  opacity: 0;
  transition: opacity 0.3s ease;
}

.image-card:hover .image-overlay {
  opacity: 1;
}

.zoom-icon {
  width: 32px;
  height: 32px;
  color: white;
}

.image-info {
  padding: 1rem;
}

.image-title {
  color: white;
  font-size: 1rem;
  font-weight: 600;
  margin: 0 0 0.5rem 0;
}

.image-description {
  color: rgba(255, 255, 255, 0.8);
  font-size: 0.875rem;
  margin: 0 0 0.5rem 0;
  line-height: 1.4;
}

.image-time {
  color: rgba(255, 255, 255, 0.5);
  font-size: 0.75rem;
  font-family: 'Courier New', monospace;
}

.step-badge {
  position: absolute;
  top: 0.75rem;
  right: 0.75rem;
  width: 2rem;
  height: 2rem;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: bold;
  font-size: 0.875rem;
  color: white;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
}

.badge-blue { background: #3b82f6; }
.badge-purple { background: #8b5cf6; }
.badge-green { background: #10b981; }
.badge-yellow { background: #f59e0b; }
.badge-orange { background: #f97316; }
.badge-red { background: #ef4444; }
.badge-gray { background: #6b7280; }

/* Modal Styles */
.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.8);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  padding: 1rem;
}

.modal-content {
  background: rgba(15, 23, 42, 0.95);
  border-radius: 1rem;
  border: 1px solid rgba(255, 255, 255, 0.2);
  backdrop-filter: blur(20px);
  max-width: 90vw;
  max-height: 90vh;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 1.5rem;
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
}

.modal-header h3 {
  color: white;
  font-size: 1.25rem;
  font-weight: 600;
  margin: 0;
}

.modal-close {
  background: none;
  border: none;
  color: rgba(255, 255, 255, 0.6);
  cursor: pointer;
  padding: 0.5rem;
  border-radius: 0.5rem;
  transition: all 0.2s ease;
}

.modal-close:hover {
  color: white;
  background: rgba(255, 255, 255, 0.1);
}

.modal-body {
  padding: 1.5rem;
  overflow-y: auto;
}

.modal-image {
  width: 100%;
  max-height: 60vh;
  object-fit: contain;
  border-radius: 0.5rem;
  margin-bottom: 1rem;
}

.modal-info {
  color: rgba(255, 255, 255, 0.8);
  font-size: 0.875rem;
  line-height: 1.6;
}

.modal-info p {
  margin: 0 0 0.5rem 0;
}

.modal-info strong {
  color: white;
}

.btn-sm {
  padding: 0.5rem 0.75rem;
  font-size: 0.875rem;
}

/* Custom scrollbar */
.images-container::-webkit-scrollbar {
  width: 6px;
}

.images-container::-webkit-scrollbar-track {
  background: rgba(0, 0, 0, 0.1);
  border-radius: 3px;
}

.images-container::-webkit-scrollbar-thumb {
  background: rgba(255, 255, 255, 0.2);
  border-radius: 3px;
}

.images-container::-webkit-scrollbar-thumb:hover {
  background: rgba(255, 255, 255, 0.3);
}

/* Responsive design */
@media (max-width: 768px) {
  .images-grid {
    grid-template-columns: 1fr;
  }
  
  .modal-content {
    margin: 1rem;
    max-width: calc(100vw - 2rem);
  }
  
  .modal-header {
    padding: 1rem;
  }
  
  .modal-body {
    padding: 1rem;
  }
}
</style>