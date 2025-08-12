# PlateVision AI - Sistema Inteligente de Reconocimiento de Placas

Un sistema avanzado de detección y reconocimiento de placas vehiculares mexicanas utilizando IA, con logging en tiempo real y captura de cada paso del procesamiento.

## 🚀 Características Principales

- **Detección de vehículos** usando TensorFlow.js y COCO-SSD
- **Reconocimiento de placas mexicanas** con Tesseract.js OCR
- **Procesamiento multi-variación** para mayor precisión
- **Logs en tiempo real** de cada paso del análisis
- **Captura automática** de imágenes procesadas
- **Interfaz moderna** con glassmorphism design
- **WebSocket support** para actualizaciones en vivo
- **API modular** y extensible

## 📋 Requisitos del Sistema

- Node.js 18+ 
- npm/yarn/pnpm
- 4GB+ RAM (para modelos de IA)
- Espacio en disco para imágenes temporales

## 🛠 Instalación

### 1. Clonar e instalar dependencias

```bash
git clone <repo-url>
cd plate-detector
npm install
```

### 2. Configurar directorios

```bash
mkdir -p public/processing
```

### 3. Iniciar servidor de desarrollo

```bash
npm run dev
```

La aplicación estará disponible en `http://localhost:3000`

## 📁 Estructura del Proyecto

```
plate-detector/
├── app/
│   ├── components/           # Componentes Vue
│   │   ├── ImageGallery.vue
│   │   ├── ImageUpload.vue
│   │   ├── ProcessingLogs.vue
│   │   ├── ProcessedImages.vue
│   │   └── ResultsPanel.vue
│   ├── pages/
│   │   └── index.vue         # Página principal
│   └── assets/css/
│       └── main.css          # Estilos globales
├── server/
│   ├── api/
│   │   ├── analyze-plate.post.js          # API original
│   │   ├── analyze-plate-realtime.post.js # API con logs
│   │   ├── analyze-plate-enhanced.post.js # API refactorizada
│   │   ├── images.get.js
│   │   ├── image/[name].get.js
│   │   └── websocket.js      # Servidor WebSocket
│   └── utils/
│       └── processing-logger.js # Módulo de logging
├── plugins/
│   ├── websocket.client.js   # Cliente WebSocket
│   └── websocket.server.js   # Plugin servidor
├── public/
│   └── processing/           # Imágenes procesadas
└── nuxt.config.ts           # Configuración Nuxt
```

## 🔌 API Endpoints

### POST `/api/analyze-plate-enhanced`

Endpoint principal para análisis con logging completo.

**Request:**
```javascript
// FormData con imagen
const formData = new FormData()
formData.append('image', imageFile)

fetch('/api/analyze-plate-enhanced', {
  method: 'POST',
  body: formData
})
```

**Response:**
```javascript
{
  "success": true,
  "sessionId": "uuid-v4",
  "processingTimeMs": 3450,
  
  // Resultados principales
  "hasVehicle": true,
  "vehicleType": "car",
  "vehicleConfidence": 0.89,
  "hasPlate": true,
  "plateText": "ABC-12-34",
  "plateConfidence": 0.92,
  "processingMethod": "enfocada",
  "overallConfidence": 0.91,
  
  // Datos detallados
  "debug": {
    "vehicleDetections": 2,
    "plateCandidates": 3,
    "alternativePlates": [...]
  },
  
  // Logging en tiempo real
  "logs": [
    {
      "timestamp": "2024-01-15T10:30:00.000Z",
      "message": "🚀 Iniciando análisis...",
      "type": "info",
      "sessionId": "uuid-v4"
    },
    // ... más logs
  ],
  
  // Imágenes procesadas
  "processedImages": [
    {
      "filename": "uuid_original_timestamp.jpg",
      "url": "/processing/uuid_original_timestamp.jpg",
      "description": "Imagen original",
      "stepName": "original",
      "timestamp": "2024-01-15T10:30:01.000Z"
    },
    // ... más imágenes
  ],
  
  // Estadísticas
  "stats": {
    "sessionId": "uuid-v4",
    "duration": 3450,
    "totalLogs": 25,
    "totalImages": 6,
    "logsByType": {
      "info": 15,
      "success": 8,
      "warning": 2
    }
  }
}
```

### GET `/api/images`

Obtiene lista de imágenes de prueba disponibles.

**Response:**
```javascript
{
  "success": true,
  "images": [
    {
      "name": "imagen1.jpg",
      "url": "/path/to/image1.jpg",
      "size": 123456
    }
  ]
}
```

## 🔧 Módulo ProcessingLogger

### Importación y uso básico

```javascript
import { createProcessingLogger, PROCESSING_STEPS } from '../utils/processing-logger.js'

// Crear logger para una sesión
const logger = createProcessingLogger(sessionId)

// Logs básicos
logger.info('Iniciando proceso...')
logger.success('Operación exitosa')
logger.warning('Advertencia detectada')
logger.error('Error en el proceso')

// Progreso
logger.progress('OCR', 3, 5, 'variaciones')

// Guardar imagen procesada
const imageBuffer = await sharp(imagePath).jpeg().toBuffer()
await logger.saveProcessedImage(
  imageBuffer, 
  PROCESSING_STEPS.FOCUSED, 
  'Imagen enfocada para OCR'
)

// Finalizar sesión
logger.finish()
```

### Métodos disponibles

#### `logger.log(message, type, metadata)`
- **message**: Texto del log
- **type**: 'info' | 'success' | 'warning' | 'error'
- **metadata**: Objeto con datos adicionales

#### `logger.saveProcessedImage(buffer, stepName, description)`
- **buffer**: Buffer de la imagen
- **stepName**: Identificador del paso (usar PROCESSING_STEPS)
- **description**: Descripción legible

#### `logger.progress(operation, current, total, unit)`
- **operation**: Nombre de la operación
- **current**: Valor actual
- **total**: Valor máximo
- **unit**: Unidad de medida

#### `logger.timing(operation)`
Registra tiempo transcurrido desde el inicio

#### `logger.getStats()`
Retorna estadísticas de la sesión

### Constantes disponibles

```javascript
import { LOG_TYPES, PROCESSING_STEPS } from '../utils/processing-logger.js'

// Tipos de log
LOG_TYPES.INFO      // 'info'
LOG_TYPES.SUCCESS   // 'success'
LOG_TYPES.WARNING   // 'warning'
LOG_TYPES.ERROR     // 'error'

// Pasos de procesamiento
PROCESSING_STEPS.ORIGINAL        // 'original'
PROCESSING_STEPS.CROPPED         // 'cropped'
PROCESSING_STEPS.FOCUSED         // 'focused'
PROCESSING_STEPS.HIGH_CONTRAST   // 'high_contrast'
PROCESSING_STEPS.EDGE_ENHANCED   // 'edge_enhanced'
PROCESSING_STEPS.UPSCALED        // 'upscaled'
PROCESSING_STEPS.OCR_RESULT      // 'ocr_result'
```

## 🎨 Componentes del Frontend

### ProcessingLogs

Componente para mostrar logs en tiempo real.

```vue
<template>
  <ProcessingLogs
    :logs="processingLogs"
    @clear="clearLogs"
  />
</template>

<script setup>
const processingLogs = ref([])

const clearLogs = () => {
  processingLogs.value = []
}
</script>
```

### ProcessedImages

Componente para mostrar imágenes procesadas.

```vue
<template>
  <ProcessedImages
    :processed-images="processedImages"
    @clear="clearProcessedImages"
  />
</template>

<script setup>
const processedImages = ref([])

const clearProcessedImages = () => {
  processedImages.value = []
}
</script>
```

## 🔄 WebSocket (Modo Avanzado)

Para habilitar actualizaciones en tiempo real:

### Servidor

```javascript
import { broadcastToSession } from '../api/websocket.js'

// Enviar log
broadcastToSession(sessionId, {
  type: 'log',
  message: 'Procesando...',
  timestamp: new Date().toISOString()
})

// Enviar imagen
broadcastToSession(sessionId, {
  type: 'processed_image',
  url: '/processing/image.jpg',
  description: 'Imagen procesada'
})
```

### Cliente

```javascript
// En el plugin websocket.client.js
websocket.onmessage = (event) => {
  const data = JSON.parse(event.data)
  
  switch (data.type) {
    case 'log':
      logs.value.push(data)
      break
    case 'processed_image':
      processedImages.value.push(data)
      break
  }
}
```

## 🧪 Desarrollo y Testing

### Ejecutar en desarrollo

```bash
npm run dev
```

### Estructura de tests (ejemplo)

```javascript
// tests/api.test.js
import { describe, it, expect } from 'vitest'
import { createProcessingLogger } from '../server/utils/processing-logger.js'

describe('ProcessingLogger', () => {
  it('should create logs correctly', () => {
    const logger = createProcessingLogger('test-session')
    logger.info('Test message')
    
    const logs = logger.getLogs()
    expect(logs).toHaveLength(1)
    expect(logs[0].message).toBe('Test message')
  })
})
```

## 📝 Configuración

### Variables de entorno (opcional)

```bash
# .env
NUXT_OCR_LANGUAGE=eng
NUXT_MAX_IMAGE_SIZE=15728640  # 15MB
NUXT_PROCESSING_TIMEOUT=120000  # 2 minutos
```

### Configuración de Nuxt

```javascript
// nuxt.config.ts
export default defineNuxtConfig({
  nitro: {
    experimental: {
      websocket: true  // Habilitar WebSocket
    }
  },
  runtimeConfig: {
    ocrLanguage: 'eng',
    maxImageSize: 15 * 1024 * 1024,
    processingTimeout: 2 * 60 * 1000
  }
})
```

## 🚀 Despliegue en Producción

### Build

```bash
npm run build
```

### Variables de entorno de producción

```bash
NODE_ENV=production
NITRO_PORT=3000
NITRO_HOST=0.0.0.0
```

### Docker (ejemplo)

```dockerfile
FROM node:18-alpine

WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production

COPY . .
RUN npm run build

EXPOSE 3000
CMD ["npm", "start"]
```

## 🔧 Personalización

### Agregar nuevos tipos de procesamiento

1. **Extender PROCESSING_STEPS**:
```javascript
// server/utils/processing-logger.js
export const PROCESSING_STEPS = {
  // ... existentes
  CUSTOM_FILTER: 'custom_filter'
}
```

2. **Implementar en el endpoint**:
```javascript
// Nuevo paso de procesamiento
const customBuffer = await sharp(imagePath)
  .custom_filter() // Tu transformación
  .toBuffer()

await logger.saveProcessedImage(
  customBuffer,
  PROCESSING_STEPS.CUSTOM_FILTER,
  'Filtro personalizado aplicado'
)
```

### Agregar nuevos logs personalizados

```javascript
// Logs con metadatos
logger.log('Análisis completado', 'success', {
  processingTime: 1500,
  confidence: 0.95,
  method: 'custom'
})

// Logs de progreso avanzado
logger.progress('Análisis IA', currentStep, totalSteps, 'pasos', {
  currentModel: 'YOLO-v8',
  gpuMemory: '2.1GB'
})
```

## 🐛 Debugging

### Logs de desarrollo

```javascript
// Habilitar logs detallados
logger.info('Debug info', {
  imageDimensions: { width: 800, height: 600 },
  processingParams: { contrast: 1.8, brightness: 1.1 },
  ocrSettings: { language: 'eng', mode: 7 }
})
```

### Verificar imágenes procesadas

Las imágenes se guardan en `public/processing/` con el formato:
```
{sessionId}_{stepName}_{timestamp}.jpg
```

### Limpiar archivos temporales

```javascript
import { ProcessingLogger } from '../utils/processing-logger.js'

// Limpiar imágenes más viejas de 1 hora
await ProcessingLogger.cleanupOldImages(60 * 60 * 1000)
```

## 📚 Recursos Adicionales

- [Documentación de Nuxt.js](https://nuxt.com/docs)
- [TensorFlow.js](https://www.tensorflow.org/js)
- [Tesseract.js](https://tesseract.projectnaptha.com/)
- [Sharp Image Processing](https://sharp.pixelplumbing.com/)

## 🤝 Contribución

1. Fork el proyecto
2. Crear branch de feature (`git checkout -b feature/nueva-funcionalidad`)
3. Commit cambios (`git commit -am 'Agregar nueva funcionalidad'`)
4. Push al branch (`git push origin feature/nueva-funcionalidad`)
5. Crear Pull Request

## 📄 Licencia

Este proyecto está bajo la licencia MIT. Ver `LICENSE` para más detalles.

---

**Desarrollado con ❤️ para el reconocimiento inteligente de placas vehiculares mexicanas**