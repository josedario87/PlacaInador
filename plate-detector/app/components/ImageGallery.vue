<template>
  <div class="glass-card">
    <div class="section-header">
      <h2 class="section-title">
        <svg class="section-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
        </svg>
        Banco de Imágenes
      </h2>
      <div style="display: flex; align-items: center; gap: 1rem;">
        <span style="font-size: 0.875rem; color: #a0a9c0;">{{ images.length }} imágenes</span>
        <button @click="$emit('refresh')" :disabled="loading" class="pagination-button">
          <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24" 
               :style="loading ? 'animation: spin 1s linear infinite' : ''">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" 
                  d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
        </button>
      </div>
    </div>

    <!-- Search -->
    <div class="gallery-controls">
      <div class="search-container">
        <input
          :value="searchQuery"
          @input="$emit('update:searchQuery', $event.target.value)"
          type="text"
          placeholder="Buscar por nombre de archivo..."
          class="search-input"
        >
        <svg class="search-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
      </div>
    </div>

    <!-- Gallery -->
    <div class="gallery-container">
      <div v-if="loading" class="loading-container">
        <div class="loading-spinner"></div>
        <p class="loading-text">Cargando imágenes...</p>
      </div>

      <div v-else-if="filteredImages.length === 0" class="loading-container">
        <svg width="64" height="64" fill="none" stroke="currentColor" viewBox="0 0 24 24" style="color: #667eea; margin-bottom: 1rem;">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        <p style="color: #a0a9c0;">No se encontraron imágenes</p>
      </div>

      <div v-else class="gallery-grid">
        <div
          v-for="image in paginatedImages"
          :key="image.name"
          @click="$emit('select', image)"
          class="gallery-item"
          :class="{ selected: selectedImage?.name === image.name }"
        >
          <img :src="image.url" :alt="image.name" loading="lazy">
          <div class="gallery-overlay">
            <p class="gallery-filename">{{ image.name.split('___')[1] || image.name }}</p>
          </div>
          <div v-if="selectedImage?.name === image.name" class="selected-badge">
            <svg width="12" height="12" fill="currentColor" viewBox="0 0 20 20">
              <path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd" />
            </svg>
          </div>
        </div>
      </div>
    </div>

    <!-- Pagination -->
    <div v-if="totalPages > 1" class="pagination">
      <button @click="$emit('previousPage')" :disabled="currentPage === 1" class="pagination-button">
        <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7" />
        </svg>
        Anterior
      </button>
      
      <div class="pagination-info">
        Página {{ currentPage }} de {{ totalPages }}
      </div>

      <button @click="$emit('nextPage')" :disabled="currentPage === totalPages" class="pagination-button">
        Siguiente
        <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
        </svg>
      </button>
    </div>
  </div>
</template>

<script setup>
const props = defineProps({
  images: {
    type: Array,
    default: () => []
  },
  filteredImages: {
    type: Array,
    default: () => []
  },
  paginatedImages: {
    type: Array,
    default: () => []
  },
  selectedImage: {
    type: Object,
    default: null
  },
  loading: {
    type: Boolean,
    default: false
  },
  searchQuery: {
    type: String,
    default: ''
  },
  currentPage: {
    type: Number,
    default: 1
  },
  totalPages: {
    type: Number,
    default: 1
  }
})

defineEmits(['select', 'refresh', 'update:searchQuery', 'previousPage', 'nextPage'])
</script>