<template>
  <div class="app-background"></div>
  <div class="app-container">
    <div class="main-content">
      <!-- Header -->
      <header class="app-header">
        <h1 class="app-title">PlateVision AI</h1>
        <p class="app-subtitle">Sistema Inteligente de Reconocimiento de Placas Vehiculares</p>
      </header>

      <div class="app-grid">
        <!-- Gallery Panel -->
        <ImageGallery
          :images="images"
          :filtered-images="filteredImages"
          :paginated-images="paginatedImages"
          :selected-image="selectedGalleryImage"
          :loading="loadingImages"
          v-model:search-query="searchQuery"
          :current-page="currentPage"
          :total-pages="totalPages"
          @select="selectImageFromGallery"
          @refresh="loadImages"
          @previous-page="previousPage"
          @next-page="nextPage"
        />

        <!-- Upload & Analysis Panel -->
        <div>
          <ImageUpload
            :selected-image="selectedImage"
            :selected-filename="selectedFileName"
            :has-selected-file="!!selectedFile"
            :processing="processing"
            @file-upload="processFile"
            @clear="clearSelection"
            @analyze="analyzeImage"
          />

          <ResultsPanel
            :results="results"
            :error="error"
          />
        </div>

        <!-- Real-time Processing Logs -->
        <ProcessingLogs
          :logs="processingLogs"
          @clear="clearLogs"
        />

        <!-- Processed Images Display -->
        <ProcessedImages
          :processed-images="processedImages"
          @clear="clearProcessedImages"
        />
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, watch } from 'vue'

// Upload functionality
const selectedFile = ref(null)
const selectedImage = ref(null)
const selectedFileName = ref(null)
const processing = ref(false)
const results = ref(null)
const error = ref(null)

// Real-time processing state
const processingLogs = ref([])
const processedImages = ref([])

// Gallery functionality
const images = ref([])
const loadingImages = ref(false)
const searchQuery = ref('')
const currentPage = ref(1)
const imagesPerPage = 12
const selectedGalleryImage = ref(null)

// Computed properties
const filteredImages = computed(() => {
  if (!searchQuery.value) return images.value
  
  const query = searchQuery.value.toLowerCase()
  return images.value.filter(img => 
    img.name.toLowerCase().includes(query)
  )
})

const totalPages = computed(() => 
  Math.ceil(filteredImages.value.length / imagesPerPage)
)

const paginatedImages = computed(() => {
  const start = (currentPage.value - 1) * imagesPerPage
  const end = start + imagesPerPage
  return filteredImages.value.slice(start, end)
})

// Methods
const loadImages = async () => {
  loadingImages.value = true
  error.value = null
  
  try {
    const response = await $fetch('/api/images')
    if (response.success) {
      images.value = response.images
    }
  } catch (err) {
    error.value = 'Error al cargar las imágenes del servidor'
    console.error('Error loading images:', err)
  } finally {
    loadingImages.value = false
  }
}

const processFile = (file) => {
  selectedFile.value = file
  selectedFileName.value = file.name
  const reader = new FileReader()
  reader.onload = (e) => {
    selectedImage.value = e.target.result
  }
  reader.readAsDataURL(file)
  results.value = null
  error.value = null
  selectedGalleryImage.value = null
}

const selectImageFromGallery = async (image) => {
  selectedGalleryImage.value = image
  error.value = null
  
  // Cargar automáticamente la imagen seleccionada
  try {
    const response = await fetch(image.url)
    const blob = await response.blob()
    const file = new File([blob], image.name, { type: 'image/jpeg' })
    
    selectedFile.value = file
    selectedFileName.value = image.name
    selectedImage.value = image.url
    results.value = null
    error.value = null
  } catch (err) {
    error.value = 'Error al cargar la imagen seleccionada'
    console.error('Error:', err)
  }
}

const clearSelection = () => {
  selectedFile.value = null
  selectedImage.value = null
  selectedFileName.value = null
  selectedGalleryImage.value = null
  results.value = null
  error.value = null
}

const analyzeImage = async () => {
  if (!selectedFile.value) return

  processing.value = true
  error.value = null
  results.value = null

  // Clear previous logs and images
  processingLogs.value = []
  processedImages.value = []

  const formData = new FormData()
  formData.append('image', selectedFile.value)

  try {
    // Use the simplified API endpoint for plate detection and normalization
    const response = await $fetch('/api/analyze-plate-simple', {
      method: 'POST',
      body: formData
    })

    results.value = response
    
    // Populate logs and processed images from the response
    if (response.logs && Array.isArray(response.logs)) {
      processingLogs.value = [...response.logs]
    }
    
    if (response.processedImages && Array.isArray(response.processedImages)) {
      processedImages.value = [...response.processedImages]
    }
    
    console.log('Analysis completed:', {
      sessionId: response.sessionId,
      logsCount: processingLogs.value.length,
      imagesCount: processedImages.value.length
    })
  } catch (err) {
    error.value = 'Error al procesar la imagen. Por favor intenta de nuevo.'
    console.error('Error:', err)
  } finally {
    processing.value = false
  }
}

const previousPage = () => {
  if (currentPage.value > 1) {
    currentPage.value--
  }
}

const nextPage = () => {
  if (currentPage.value < totalPages.value) {
    currentPage.value++
  }
}

const clearLogs = () => {
  processingLogs.value = []
}

const clearProcessedImages = () => {
  processedImages.value = []
}

// Watch for search query changes to reset page
watch(searchQuery, () => {
  currentPage.value = 1
})

// Load images on component mount
onMounted(() => {
  loadImages()
})
</script>