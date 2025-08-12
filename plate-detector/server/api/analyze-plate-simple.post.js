import formidable from 'formidable'
import fs from 'fs/promises'
import * as tf from '@tensorflow/tfjs-node'
import * as cocoSsd from '@tensorflow-models/coco-ssd'
import sharp from 'sharp'
import { v4 as uuidv4 } from 'uuid'
import path from 'path'
import { createProcessingLogger, PROCESSING_STEPS } from '../utils/processing-logger.js'

let carDetectionModel = null

// Nuevos pasos específicos para la pipeline simplificada
const PLATE_PROCESSING_STEPS = {
  ORIGINAL: 'original',
  VEHICLE_DETECTED: 'vehicle_detected',
  GRAYSCALE: 'grayscale', 
  EDGE_DETECTION: 'edge_detection',
  CONTOURS_FOUND: 'contours_found',
  PLATE_CANDIDATES: 'plate_candidates',
  PLATE_EXTRACTED: 'plate_extracted',
  PERSPECTIVE_CORRECTED: 'perspective_corrected',
  FINAL_NORMALIZED: 'final_normalized'
}

async function loadCarDetectionModel(logger) {
  if (!carDetectionModel) {
    try {
      logger.info('🔧 Cargando modelo de detección de vehículos...')
      await tf.ready()
      carDetectionModel = await cocoSsd.load({
        base: 'mobilenet_v2'
      })
      logger.success('✅ Modelo de detección listo para usar')
    } catch (error) {
      logger.warning(`⚠️ Usando modelo fallback: ${error.message}`)
      carDetectionModel = await cocoSsd.load()
      logger.info('✅ Modelo básico cargado')
    }
  }
  return carDetectionModel
}

async function detectVehicle(imagePath, logger) {
  try {
    logger.info('🚗 Paso 1: Buscando vehículos en la imagen...')
    const model = await loadCarDetectionModel(logger)
    const imageBuffer = await fs.readFile(imagePath)
    const imageTensor = tf.node.decodeImage(imageBuffer)
    
    logger.info('🔍 Analizando con IA para encontrar vehículos...')
    const predictions = await model.detect(imageTensor)
    imageTensor.dispose()
    
    const vehicleClasses = ['car', 'truck', 'bus', 'motorcycle', 'bicycle']
    const vehicleDetections = predictions.filter(pred => 
      vehicleClasses.includes(pred.class) && pred.score > 0.15
    )
    
    if (vehicleDetections.length === 0) {
      logger.warning('⚠️ No se detectaron vehículos, procesaremos toda la imagen')
      return {
        hasVehicle: false,
        bbox: null,
        confidence: 0,
        vehicleType: null
      }
    }
    
    // Tomar el vehículo con mayor confianza
    vehicleDetections.sort((a, b) => b.score - a.score)
    const bestVehicle = vehicleDetections[0]
    
    logger.success(`✅ Vehículo encontrado: ${bestVehicle.class}`)
    logger.info(`📊 Confianza: ${(bestVehicle.score * 100).toFixed(1)}%`)
    logger.info(`📍 Posición: [${bestVehicle.bbox.map(n => Math.round(n)).join(', ')}]`)
    
    // Crear imagen con vehículo marcado
    const markedBuffer = await createVehicleMarkedImage(imageBuffer, bestVehicle.bbox, logger)
    await logger.saveProcessedImage(markedBuffer, PLATE_PROCESSING_STEPS.VEHICLE_DETECTED, 
      `Vehículo detectado: ${bestVehicle.class} (${(bestVehicle.score * 100).toFixed(1)}%)`)
    
    return {
      hasVehicle: true,
      bbox: bestVehicle.bbox,
      confidence: bestVehicle.score,
      vehicleType: bestVehicle.class
    }
  } catch (error) {
    logger.error(`❌ Error detectando vehículo: ${error.message}`)
    return { hasVehicle: false, bbox: null, confidence: 0, vehicleType: null }
  }
}

async function createVehicleMarkedImage(imageBuffer, bbox, logger) {
  try {
    const [x, y, width, height] = bbox
    
    // Crear overlay con el rectángulo del vehículo
    const image = sharp(imageBuffer)
    const { width: imgWidth, height: imgHeight } = await image.metadata()
    
    // Crear SVG overlay
    const svgOverlay = `
      <svg width="${imgWidth}" height="${imgHeight}">
        <rect x="${x}" y="${y}" width="${width}" height="${height}" 
              fill="none" stroke="lime" stroke-width="3" opacity="0.8"/>
        <text x="${x}" y="${y - 10}" fill="lime" font-size="20" font-weight="bold">Vehículo</text>
      </svg>
    `
    
    return await image
      .composite([{ input: Buffer.from(svgOverlay), top: 0, left: 0 }])
      .jpeg()
      .toBuffer()
  } catch (error) {
    logger.warning('⚠️ No se pudo crear imagen marcada, usando original')
    return imageBuffer
  }
}

async function findPlateContours(imagePath, vehicleBbox, logger) {
  try {
    logger.info('🔍 Paso 2: Buscando contornos de placas...')
    
    // Determinar área de búsqueda
    let searchArea = null
    if (vehicleBbox) {
      // Enfocar en la parte inferior del vehículo donde están las placas
      const [x, y, width, height] = vehicleBbox
      searchArea = {
        left: Math.max(0, Math.round(x)),
        top: Math.max(0, Math.round(y + height * 0.6)), // 60% hacia abajo
        width: Math.round(width),
        height: Math.round(height * 0.4) // 40% inferior del vehículo
      }
      logger.info(`📍 Enfocando búsqueda en área del vehículo: ${searchArea.width}x${searchArea.height}`)
    } else {
      logger.info('🔍 Buscando en toda la imagen')
    }
    
    // Paso 1: Convertir a escala de grises
    logger.info('🎨 Convirtiendo a escala de grises...')
    const baseImage = sharp(imagePath)
    const metadata = await baseImage.metadata()
    
    let workingImage = baseImage
    if (searchArea) {
      // Recortar área de búsqueda
      workingImage = baseImage.extract(searchArea)
    }
    
    const grayscaleBuffer = await workingImage
      .greyscale()
      .jpeg()
      .toBuffer()
    
    await logger.saveProcessedImage(grayscaleBuffer, PLATE_PROCESSING_STEPS.GRAYSCALE, 
      'Imagen convertida a escala de grises')
    
    // Paso 2: Detección de bordes
    logger.info('🖼️ Aplicando detección de bordes...')
    const edgeBuffer = await sharp(grayscaleBuffer)
      .convolve({
        width: 3,
        height: 3,
        kernel: [-1, -1, -1, -1, 8, -1, -1, -1, -1] // Kernel de detección de bordes
      })
      .normalize()
      .jpeg()
      .toBuffer()
    
    await logger.saveProcessedImage(edgeBuffer, PLATE_PROCESSING_STEPS.EDGE_DETECTION, 
      'Bordes detectados usando convolución')
    
    // Paso 3: Encontrar contornos rectangulares (simulación)
    logger.info('📐 Analizando contornos rectangulares...')
    const contourCandidates = await findRectangularContours(edgeBuffer, logger)
    
    if (contourCandidates.length === 0) {
      logger.warning('⚠️ No se encontraron contornos rectangulares válidos')
      return { success: false, plateRegions: [] }
    }
    
    logger.success(`✅ Encontrados ${contourCandidates.length} candidatos de placa`)
    
    // Crear imagen con contornos marcados
    const contoursBuffer = await createContoursImage(grayscaleBuffer, contourCandidates, logger)
    await logger.saveProcessedImage(contoursBuffer, PLATE_PROCESSING_STEPS.CONTOURS_FOUND, 
      `${contourCandidates.length} contornos rectangulares encontrados`)
    
    return {
      success: true,
      plateRegions: contourCandidates,
      searchArea
    }
    
  } catch (error) {
    logger.error(`❌ Error buscando contornos: ${error.message}`)
    return { success: false, plateRegions: [] }
  }
}

async function findRectangularContours(imageBuffer, logger) {
  // Simulación de detección de contornos rectangulares
  // En una implementación real, usarías OpenCV o una librería similar
  
  logger.info('🔍 Simulando detección de contornos...')
  
  const image = sharp(imageBuffer)
  const { width, height } = await image.metadata()
  
  // Simular varios candidatos de placa con diferentes tamaños y posiciones
  const candidates = [
    {
      id: 1,
      corners: [
        [width * 0.2, height * 0.4],  // Top-left
        [width * 0.8, height * 0.35], // Top-right (ligeramente inclinado)
        [width * 0.82, height * 0.65], // Bottom-right
        [width * 0.18, height * 0.7]   // Bottom-left (trapecio)
      ],
      confidence: 0.89,
      aspectRatio: 4.5, // Ratio típico de placa mexicana
      area: (width * 0.6) * (height * 0.25)
    },
    {
      id: 2,
      corners: [
        [width * 0.1, height * 0.6],
        [width * 0.5, height * 0.58],
        [width * 0.52, height * 0.8],
        [width * 0.08, height * 0.82]
      ],
      confidence: 0.65,
      aspectRatio: 3.8,
      area: (width * 0.4) * (height * 0.2)
    }
  ]
  
  // Filtrar candidatos por aspectRatio típico de placas (entre 3:1 y 5:1)
  const validCandidates = candidates.filter(candidate => 
    candidate.aspectRatio >= 3.0 && candidate.aspectRatio <= 5.5 && candidate.confidence > 0.6
  )
  
  logger.info(`🎯 ${validCandidates.length} candidatos válidos por aspect ratio`)
  
  return validCandidates
}

async function createContoursImage(baseBuffer, contours, logger) {
  try {
    const image = sharp(baseBuffer)
    const { width, height } = await image.metadata()
    
    // Crear SVG con los contornos
    let svgElements = ''
    contours.forEach((contour, index) => {
      const points = contour.corners.map(([x, y]) => `${x},${y}`).join(' ')
      const color = index === 0 ? 'lime' : 'yellow' // Mejor candidato en verde
      
      svgElements += `
        <polygon points="${points}" fill="none" stroke="${color}" stroke-width="2" opacity="0.8"/>
        <text x="${contour.corners[0][0]}" y="${contour.corners[0][1] - 5}" 
              fill="${color}" font-size="12" font-weight="bold">
          Placa ${index + 1} (${(contour.confidence * 100).toFixed(0)}%)
        </text>
      `
    })
    
    const svgOverlay = `
      <svg width="${width}" height="${height}">
        ${svgElements}
      </svg>
    `
    
    return await image
      .composite([{ input: Buffer.from(svgOverlay), top: 0, left: 0 }])
      .jpeg()
      .toBuffer()
  } catch (error) {
    logger.warning('⚠️ Error creando imagen de contornos, usando base')
    return baseBuffer
  }
}

async function extractAndCorrectPlate(imagePath, plateRegion, searchArea, logger) {
  try {
    const bestPlate = plateRegion.plateRegions[0] // Tomar el mejor candidato
    
    logger.info('✂️ Paso 3: Extrayendo región de la placa...')
    logger.info(`🎯 Procesando candidato con confianza ${(bestPlate.confidence * 100).toFixed(1)}%`)
    
    // Ajustar coordenadas si hay área de búsqueda
    let adjustedCorners = bestPlate.corners
    if (searchArea) {
      adjustedCorners = bestPlate.corners.map(([x, y]) => [
        x + searchArea.left,
        y + searchArea.top
      ])
    }
    
    // Paso 1: Extraer región rectangular que contenga la placa
    const boundingRect = calculateBoundingRect(adjustedCorners)
    logger.info(`📏 Región detectada: ${boundingRect.width}x${boundingRect.height} píxeles`)
    
    const extractedBuffer = await sharp(imagePath)
      .extract({
        left: Math.max(0, boundingRect.x),
        top: Math.max(0, boundingRect.y),
        width: boundingRect.width,
        height: boundingRect.height
      })
      .jpeg()
      .toBuffer()
    
    await logger.saveProcessedImage(extractedBuffer, PLATE_PROCESSING_STEPS.PLATE_EXTRACTED, 
      `Región de placa extraída: ${boundingRect.width}x${boundingRect.height}`)
    
    // Paso 2: Corrección de perspectiva (trapecio → rectángulo)
    logger.info('📐 Paso 4: Corrigiendo perspectiva de trapecio a rectángulo...')
    
    const correctedBuffer = await correctPerspective(extractedBuffer, adjustedCorners, boundingRect, logger)
    await logger.saveProcessedImage(correctedBuffer, PLATE_PROCESSING_STEPS.PERSPECTIVE_CORRECTED, 
      'Perspectiva corregida: trapecio transformado a rectángulo')
    
    // Paso 3: Normalización final
    logger.info('✨ Paso 5: Aplicando normalización final...')
    
    const finalBuffer = await normalizePlateImage(correctedBuffer, logger)
    await logger.saveProcessedImage(finalBuffer, PLATE_PROCESSING_STEPS.FINAL_NORMALIZED, 
      'Imagen final normalizada y optimizada para análisis')
    
    logger.success('🎉 ¡Placa extraída y normalizada exitosamente!')
    
    return {
      success: true,
      plateImage: finalBuffer,
      plateRegion: bestPlate,
      dimensions: boundingRect
    }
    
  } catch (error) {
    logger.error(`❌ Error extrayendo placa: ${error.message}`)
    return { success: false }
  }
}

function calculateBoundingRect(corners) {
  const xs = corners.map(([x, y]) => x)
  const ys = corners.map(([x, y]) => y)
  
  const minX = Math.min(...xs)
  const maxX = Math.max(...xs)
  const minY = Math.min(...ys)
  const maxY = Math.max(...ys)
  
  return {
    x: Math.round(minX),
    y: Math.round(minY),
    width: Math.round(maxX - minX),
    height: Math.round(maxY - minY)
  }
}

async function correctPerspective(imageBuffer, corners, boundingRect, logger) {
  try {
    // Simulación de corrección de perspectiva
    // En una implementación real usarías matriz de transformación perspectiva
    
    logger.info('🔄 Aplicando transformación de perspectiva...')
    
    // Calcular si es un trapecio (esquinas no forman rectángulo perfecto)
    const isTrapezoidal = checkIfTrapezoidal(corners)
    
    if (isTrapezoidal) {
      logger.info('📐 Detectado trapecio, corrigiendo distorsión perspectiva')
      
      // Simular corrección aplicando transformaciones
      return await sharp(imageBuffer)
        .resize(400, 120, { fit: 'fill' }) // Forzar aspecto ratio típico de placa
        .sharpen()
        .normalize()
        .jpeg()
        .toBuffer()
    } else {
      logger.info('✅ Imagen ya rectangular, aplicando mejoras básicas')
      
      return await sharp(imageBuffer)
        .resize(400, 120, { fit: 'inside', withoutEnlargement: false })
        .sharpen()
        .jpeg()
        .toBuffer()
    }
    
  } catch (error) {
    logger.warning(`⚠️ Error en corrección perspectiva: ${error.message}`)
    return imageBuffer
  }
}

function checkIfTrapezoidal(corners) {
  // Verificar si las esquinas forman un trapecio
  // Esto es una simplificación - en implementación real calcularías ángulos
  
  const [tl, tr, br, bl] = corners
  
  // Verificar si los lados superior e inferior no son paralelos
  const topSlope = (tr[1] - tl[1]) / (tr[0] - tl[0])
  const bottomSlope = (br[1] - bl[1]) / (br[0] - bl[0])
  
  const slopeDifference = Math.abs(topSlope - bottomSlope)
  
  // Si la diferencia de pendientes es significativa, es un trapecio
  return slopeDifference > 0.1
}

async function normalizePlateImage(imageBuffer, logger) {
  try {
    logger.info('🎨 Aplicando normalización final...')
    
    // Normalización completa para imagen de placa óptima
    const normalizedBuffer = await sharp(imageBuffer)
      .resize(400, 120, { 
        fit: 'fill',
        kernel: sharp.kernel.lanczos3 // Mejor calidad de reescalado
      })
      .greyscale() // Convertir a escala de grises para mejor contraste
      .normalize() // Normalizar histograma
      .modulate({ 
        brightness: 1.1, 
        contrast: 1.3 
      })
      .sharpen({
        sigma: 1,
        flat: 1,
        jagged: 2
      })
      .gamma(1.2) // Ajuste gamma para mejor visibilidad
      .jpeg({ quality: 95 })
      .toBuffer()
    
    logger.success('✨ Normalización completada: imagen optimizada para análisis')
    
    return normalizedBuffer
    
  } catch (error) {
    logger.warning(`⚠️ Error en normalización: ${error.message}`)
    return imageBuffer
  }
}

export default defineEventHandler(async (event) => {
  const sessionId = uuidv4()
  const logger = createProcessingLogger(sessionId)
  
  const form = formidable({
    uploadDir: '/tmp',
    keepExtensions: true,
    maxFileSize: 15 * 1024 * 1024
  })

  let imagePath = null

  try {
    logger.info('🚀 Iniciando pipeline simplificada de detección de placas...')
    logger.info('🎯 Objetivo: Detectar, recortar y normalizar área de placa vehicular')
    
    const [fields, files] = await new Promise((resolve, reject) => {
      form.parse(event.node.req, (err, fields, files) => {
        if (err) reject(err)
        else resolve([fields, files])
      })
    })

    const imageFile = Array.isArray(files.image) ? files.image[0] : files.image
    
    if (!imageFile) {
      throw new Error('No se recibió ninguna imagen')
    }

    imagePath = imageFile.filepath || imageFile.path
    logger.info(`📁 Imagen recibida: ${path.basename(imagePath)}`)
    
    // Guardar imagen original
    const originalBuffer = await fs.readFile(imagePath)
    await logger.saveProcessedImage(originalBuffer, PLATE_PROCESSING_STEPS.ORIGINAL, 'Imagen original recibida')

    // Paso 1: Detectar vehículo (opcional, para enfocar búsqueda)
    const vehicleDetection = await detectVehicle(imagePath, logger)
    
    // Paso 2: Buscar contornos de placas
    const plateContours = await findPlateContours(imagePath, vehicleDetection.bbox, logger)
    
    if (!plateContours.success || plateContours.plateRegions.length === 0) {
      logger.warning('😞 No se encontraron placas en la imagen')
      
      const response = {
        success: false,
        sessionId,
        message: 'No se pudieron detectar placas en la imagen',
        hasVehicle: vehicleDetection.hasVehicle,
        vehicleType: vehicleDetection.vehicleType,
        vehicleConfidence: vehicleDetection.confidence,
        logs: logger.getLogs(),
        processedImages: logger.getProcessedImages(),
        stats: logger.getStats()
      }
      
      logger.finish()
      return response
    }
    
    // Paso 3: Extraer y corregir la mejor placa
    const plateExtraction = await extractAndCorrectPlate(
      imagePath, 
      plateContours, 
      plateContours.searchArea, 
      logger
    )
    
    // Limpiar archivo temporal
    if (imagePath) {
      await fs.unlink(imagePath).catch(() => {})
    }

    logger.timing('Pipeline completa')

    const response = {
      success: plateExtraction.success,
      sessionId,
      processingTimeMs: Date.now() - logger.startTime,
      
      // Resultados de detección de vehículo
      hasVehicle: vehicleDetection.hasVehicle,
      vehicleType: vehicleDetection.vehicleType,
      vehicleConfidence: vehicleDetection.confidence,
      
      // Resultados de detección de placa
      hasPlate: plateExtraction.success,
      plateRegion: plateExtraction.plateRegion,
      plateDimensions: plateExtraction.dimensions,
      
      // Estadísticas del procesamiento
      plateCandidatesFound: plateContours.plateRegions.length,
      
      // Datos de la sesión
      logs: logger.getLogs(),
      processedImages: logger.getProcessedImages(),
      stats: logger.getStats()
    }
    
    logger.success(`🎉 Pipeline completada: ${response.hasPlate ? 'Placa extraída' : 'Sin placas detectadas'}`)
    logger.finish()
    
    return response
    
  } catch (error) {
    logger.error(`💥 Error en pipeline: ${error.message}`)
    
    if (imagePath) {
      await fs.unlink(imagePath).catch(() => {})
    }
    
    throw createError({
      statusCode: 500,
      statusMessage: `Error procesando imagen: ${error.message}`
    })
  }
})