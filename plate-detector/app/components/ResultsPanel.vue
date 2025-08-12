<template>
  <!-- Results -->
  <Transition name="fade">
    <div v-if="results" class="results-container">
      <div class="results-header">
        <svg width="20" height="20" fill="currentColor" viewBox="0 0 20 20" style="color: #34d399;">
          <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd" />
        </svg>
        Resultados del Análisis
      </div>
      
      <div class="results-grid">
        <div class="result-item">
          <span class="result-label">
            <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
            </svg>
            Vehículo detectado
          </span>
          <span class="result-value" :class="results.hasCar ? 'positive' : 'negative'">
            {{ results.hasCar ? 'SÍ' : 'NO' }}
          </span>
        </div>
        
        <div class="result-item">
          <span class="result-label">
            <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
            </svg>
            Placa visible
          </span>
          <span class="result-value" :class="results.hasPlate ? 'positive' : 'negative'">
            {{ results.hasPlate ? 'SÍ' : 'NO' }}
          </span>
        </div>
        
        <div v-if="results.plateText" class="plate-result">
          <p style="color: #a0a9c0; font-size: 0.875rem; margin-bottom: 0.5rem;">Texto detectado:</p>
          <p class="plate-text">{{ results.plateText }}</p>
        </div>

        <div v-if="results.confidence" class="result-item">
          <span class="result-label">Confianza</span>
          <div style="display: flex; align-items: center; gap: 0.75rem;">
            <div class="confidence-bar" style="width: 120px;">
              <div class="confidence-fill" :style="`width: ${results.confidence * 100}%`"></div>
            </div>
            <span style="color: white; font-weight: 600;">{{ (results.confidence * 100).toFixed(1) }}%</span>
          </div>
        </div>
      </div>
    </div>
  </Transition>

  <!-- Error -->
  <Transition name="fade">
    <div v-if="error" class="error-container">
      <div class="error-content">
        <svg class="error-icon" fill="currentColor" viewBox="0 0 20 20">
          <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clip-rule="evenodd" />
        </svg>
        <span>{{ error }}</span>
      </div>
    </div>
  </Transition>
</template>

<script setup>
defineProps({
  results: {
    type: Object,
    default: null
  },
  error: {
    type: String,
    default: null
  }
})
</script>