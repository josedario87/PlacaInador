<template>
  <div class="glass-card">
    <div class="section-header">
      <h2 class="section-title">
        <svg class="section-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
        </svg>
        Análisis Inteligente
      </h2>
    </div>

    <!-- Upload Section -->
    <div class="upload-area">
      <label for="file-upload" class="upload-zone" @dragover.prevent @drop.prevent="handleDrop">
        <svg class="upload-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
        </svg>
        <p class="upload-text">Subir imagen desde dispositivo</p>
        <p class="upload-hint">PNG, JPG, JPEG (máx. 10MB)</p>
        <input 
          id="file-upload" 
          type="file" 
          class="file-input"
          @change="handleFileUpload"
          accept="image/*"
        >
      </label>
    </div>

    <!-- Preview -->
    <div v-if="selectedImage" class="preview-container">
      <h3 style="color: white; font-weight: 600; margin-bottom: 0.75rem;">Vista Previa</h3>
      <div class="preview-wrapper">
        <img :src="selectedImage" alt="Preview" class="preview-image">
        <button @click="$emit('clear')" class="clear-button">
          <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
      <p class="preview-filename">{{ selectedFileName }}</p>
    </div>

    <!-- Analyze Button -->
    <button @click="$emit('analyze')" :disabled="!hasSelectedFile || processing" class="btn btn-primary" style="width: 100%;">
      <template v-if="!processing">
        <svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z" />
        </svg>
        Analizar con IA
      </template>
      <template v-else>
        <div class="loading-spinner"></div>
        Procesando...
      </template>
    </button>
  </div>
</template>

<script setup>
const props = defineProps({
  selectedImage: {
    type: String,
    default: null
  },
  selectedFileName: {
    type: String,
    default: null
  },
  hasSelectedFile: {
    type: Boolean,
    default: false
  },
  processing: {
    type: Boolean,
    default: false
  }
})

const emit = defineEmits(['fileUpload', 'clear', 'analyze'])

const handleFileUpload = (event) => {
  const file = event.target.files[0]
  if (file) {
    emit('fileUpload', file)
  }
}

const handleDrop = (event) => {
  const files = event.dataTransfer.files
  if (files.length > 0) {
    emit('fileUpload', files[0])
  }
}
</script>