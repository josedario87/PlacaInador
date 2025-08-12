import formidable from 'formidable'
import fs from 'fs/promises'
import * as tf from '@tensorflow/tfjs-node'
import * as cocoSsd from '@tensorflow-models/coco-ssd'
import Tesseract from 'tesseract.js'
import sharp from 'sharp'
import { v4 as uuidv4 } from 'uuid'
import path from 'path'
import { broadcastToSession } from './websocket.js'

let carDetectionModel = null
let plateDetectionModel = null

async function loadCarDetectionModel(logger) {
  if (!carDetectionModel) {
    try {
      logger('🔧 Inicializando modelo de detección de vehículos...', 'info')
      await tf.ready()
      carDetectionModel = await cocoSsd.load({
        base: 'mobilenet_v2'
      })
      logger('✅ Modelo de detección de vehículos cargado exitosamente', 'success')
    } catch (error) {
      logger(`⚠️ Error cargando modelo optimizado, usando fallback: ${error.message}`, 'warning')
      carDetectionModel = await cocoSsd.load()
      logger('✅ Modelo fallback cargado', 'info')
    }
  }
  return carDetectionModel
}

async function loadPlateDetectionModel(logger) {
  if (!plateDetectionModel) {
    try {
      logger('🔧 Inicializando pipeline de detección de placas...', 'info')
      await tf.ready()
      plateDetectionModel = true
      logger('✅ Pipeline de detección de placas inicializado', 'success')
    } catch (error) {
      logger(`⚠️ Error inicializando pipeline: ${error.message}`, 'warning')
      plateDetectionModel = true
    }
  }
  return plateDetectionModel
}

async function detectVehicle(imagePath, logger) {
  try {
    logger('🚗 Iniciando detección de vehículos...', 'info')
    const model = await loadCarDetectionModel(logger)
    const imageBuffer = await fs.readFile(imagePath)
    const imageTensor = tf.node.decodeImage(imageBuffer)
    
    logger('🔍 Analizando imagen con modelo de IA...', 'info')
    const predictions = await model.detect(imageTensor)
    imageTensor.dispose()
    
    const vehicleClasses = ['car', 'truck', 'bus', 'motorcycle', 'bicycle']
    const vehicleDetections = predictions.filter(pred => 
      vehicleClasses.includes(pred.class) && pred.score > 0.15
    )
    
    vehicleDetections.sort((a, b) => b.score - a.score)
    
    const bestVehicle = vehicleDetections[0]
    const hasVehicle = vehicleDetections.length > 0
    
    if (hasVehicle) {
      logger(`✅ Vehículo detectado: ${bestVehicle.class} (confianza: ${(bestVehicle.score * 100).toFixed(1)}%)`, 'success')
      logger(`📍 Ubicación: [${bestVehicle.bbox.map(n => Math.round(n)).join(', ')}]`, 'info')
    } else {
      logger('⚠️ No se detectaron vehículos claros en la imagen', 'warning')
    }
    
    return {
      hasVehicle,
      bbox: bestVehicle ? bestVehicle.bbox : null,
      confidence: bestVehicle ? bestVehicle.score : 0,
      vehicleType: bestVehicle ? bestVehicle.class : null,
      allDetections: vehicleDetections
    }
  } catch (error) {
    logger(`❌ Error en detección de vehículos: ${error.message}`, 'error')
    return { hasVehicle: false, bbox: null, confidence: 0, vehicleType: null, allDetections: [] }
  }
}

async function saveProcessedImage(imageBuffer, sessionId, stepName, description, logger) {
  try {
    const filename = `${sessionId}_${stepName}_${Date.now()}.jpg`
    const publicPath = path.join(process.cwd(), 'public', 'processing', filename)
    
    await fs.mkdir(path.dirname(publicPath), { recursive: true })
    await fs.writeFile(publicPath, imageBuffer)
    
    const processedImage = {
      filename,
      url: `/processing/${filename}`,
      description,
      stepName,
      timestamp: new Date().toISOString()
    }
    
    // Broadcast the processed image via WebSocket
    broadcastToSession(sessionId, {
      type: 'processed_image',
      ...processedImage
    })
    
    logger(`📸 Imagen procesada guardada: ${description}`, 'info')
    
    return processedImage
  } catch (error) {
    logger(`❌ Error guardando imagen procesada: ${error.message}`, 'error')
    return null
  }
}

async function preprocessImageForPlateDetection(imagePath, vehicleBbox = null, logger, sessionId) {
  try {
    logger('🖼️ Iniciando preprocesamiento de imagen...', 'info')
    let workingPath = imagePath
    const tempFiles = []
    const processedImages = []
    
    // Save original image
    const originalBuffer = await fs.readFile(imagePath)
    const originalProcessed = await saveProcessedImage(originalBuffer, sessionId, 'original', 'Imagen original', logger)
    if (originalProcessed) processedImages.push(originalProcessed)
    
    // Step 1: Crop to specified region if available
    if (vehicleBbox && Array.isArray(vehicleBbox) && vehicleBbox.length === 4) {
      logger('✂️ Recortando región del vehículo detectado...', 'info')
      const originalImage = sharp(imagePath)
      const metadata = await originalImage.metadata()
      
      let cropParams
      
      if (vehicleBbox.every(v => typeof v === 'number' && v <= 1 && v >= 0)) {
        const [xRatio, yRatio, widthRatio, heightRatio] = vehicleBbox
        cropParams = {
          left: Math.max(0, Math.round(metadata.width * xRatio)),
          top: Math.max(0, Math.round(metadata.height * yRatio)),
          width: Math.min(metadata.width, Math.round(metadata.width * widthRatio)),
          height: Math.min(metadata.height, Math.round(metadata.height * heightRatio))
        }
      } else {
        const [x, y, width, height] = vehicleBbox
        cropParams = {
          left: Math.max(0, Math.round(x)),
          top: Math.max(0, Math.round(y)),
          width: Math.min(metadata.width - Math.round(x), Math.round(width)),
          height: Math.min(metadata.height - Math.round(y), Math.round(height))
        }
      }
      
      if (cropParams.width >= 100 && cropParams.height >= 75) {
        const croppedPath = imagePath.replace('.', '_cropped.')
        const croppedBuffer = await sharp(imagePath)
          .extract(cropParams)
          .jpeg()
          .toBuffer()
        
        await fs.writeFile(croppedPath, croppedBuffer)
        
        const croppedProcessed = await saveProcessedImage(croppedBuffer, sessionId, 'cropped', `Región recortada: ${cropParams.width}x${cropParams.height}`, logger)
        if (croppedProcessed) processedImages.push(croppedProcessed)
        
        workingPath = croppedPath
        tempFiles.push(croppedPath)
        logger(`✅ Imagen recortada: ${cropParams.width}x${cropParams.height} píxeles`, 'success')
      } else {
        logger(`⚠️ Región muy pequeña para recortar: ${cropParams.width}x${cropParams.height}`, 'warning')
      }
    }
    
    // Step 2: Create enhancement variations
    logger('🎨 Generando variaciones de mejora de imagen...', 'info')
    const enhancementVariations = []
    
    // Variation 1: Focused plate region
    logger('📸 Creando versión enfocada...', 'info')
    const focusedPath = workingPath.replace('.', '_focused.')
    const workingImage = sharp(workingPath)
    const workingMetadata = await workingImage.metadata()
    
    const targetWidth = Math.max(workingMetadata.width * 2, 600)
    const targetHeight = Math.max(workingMetadata.height * 2, 400)
    
    if (workingMetadata.width >= 10 && workingMetadata.height >= 10) {
      const focusedBuffer = await sharp(workingPath)
        .greyscale()
        .resize({ 
          width: targetWidth, 
          height: targetHeight, 
          fit: 'inside', 
          withoutEnlargement: false 
        })
        .normalize()
        .modulate({ brightness: 1.1, contrast: 1.8 })
        .sharpen()
        .jpeg()
        .toBuffer()
      
      await fs.writeFile(focusedPath, focusedBuffer)
      
      const focusedProcessed = await saveProcessedImage(focusedBuffer, sessionId, 'focused', `Versión enfocada: ${targetWidth}x${targetHeight}`, logger)
      if (focusedProcessed) processedImages.push(focusedProcessed)
      
      logger(`✅ Versión enfocada creada: ${targetWidth}x${targetHeight}`, 'success')
    } else {
      await sharp(workingPath).jpeg().toFile(focusedPath)
      logger(`⚠️ Usando tamaño original debido a dimensiones pequeñas`, 'warning')
    }
    enhancementVariations.push(focusedPath)
    tempFiles.push(focusedPath)
    
    // Variation 2: High contrast
    logger('🔆 Creando versión de alto contraste...', 'info')
    const highContrastPath = workingPath.replace('.', '_highcontrast.')
    const highContrastBuffer = await sharp(workingPath)
      .greyscale()
      .resize({ width: 800, height: 600, fit: 'inside', withoutEnlargement: false })
      .normalize()
      .linear(2.0, -(128 * 1.0))
      .sharpen({ sigma: 1, flat: 1, jagged: 2 })
      .jpeg()
      .toBuffer()
    
    await fs.writeFile(highContrastPath, highContrastBuffer)
    
    const highContrastProcessed = await saveProcessedImage(highContrastBuffer, sessionId, 'high_contrast', 'Versión de alto contraste', logger)
    if (highContrastProcessed) processedImages.push(highContrastProcessed)
    
    enhancementVariations.push(highContrastPath)
    tempFiles.push(highContrastPath)
    logger('✅ Versión de alto contraste creada', 'success')
    
    // Variation 3: Edge enhancement
    logger('🖼️ Creando versión con realce de bordes...', 'info')
    const edgeEnhancedPath = workingPath.replace('.', '_edges.')
    const edgeBuffer = await sharp(workingPath)
      .greyscale()
      .resize({ width: 800, height: 600, fit: 'inside', withoutEnlargement: false })
      .blur(0.3)
      .sharpen({ sigma: 2, flat: 1, jagged: 3 })
      .modulate({ brightness: 1.3, contrast: 1.4 })
      .normalize()
      .jpeg()
      .toBuffer()
    
    await fs.writeFile(edgeEnhancedPath, edgeBuffer)
    
    const edgeProcessed = await saveProcessedImage(edgeBuffer, sessionId, 'edge_enhanced', 'Versión con realce de bordes', logger)
    if (edgeProcessed) processedImages.push(edgeProcessed)
    
    enhancementVariations.push(edgeEnhancedPath)
    tempFiles.push(edgeEnhancedPath)
    logger('✅ Versión con realce de bordes creada', 'success')
    
    // Variation 4: Upscaled
    logger('🔍 Creando versión escalada...', 'info')
    const upscaledPath = workingPath.replace('.', '_upscaled.')
    const upscaledBuffer = await sharp(workingPath)
      .greyscale()
      .resize({ width: 1200, height: 900, fit: 'inside', withoutEnlargement: false })
      .sharpen({ sigma: 1.5, flat: 1, jagged: 2 })
      .modulate({ brightness: 1.2, contrast: 1.5 })
      .normalize()
      .jpeg()
      .toBuffer()
    
    await fs.writeFile(upscaledPath, upscaledBuffer)
    
    const upscaledProcessed = await saveProcessedImage(upscaledBuffer, sessionId, 'upscaled', 'Versión escalada para mejorar detalles', logger)
    if (upscaledProcessed) processedImages.push(upscaledProcessed)
    
    enhancementVariations.push(upscaledPath)
    tempFiles.push(upscaledPath)
    logger('✅ Versión escalada creada', 'success')
    
    logger(`🎯 Preprocesamiento completado: ${enhancementVariations.length} variaciones generadas`, 'success')
    
    return { enhancementVariations, tempFiles, processedImages }
  } catch (error) {
    logger(`❌ Error en preprocesamiento: ${error.message}`, 'error')
    return { enhancementVariations: [imagePath], tempFiles: [], processedImages: [] }
  }
}

const MEXICAN_PLATE_PATTERNS = [
  /[A-Z]{3}-?\d{2}-?\d{2}/g,
  /[A-Z]{3}-?\d{3}-?[A-Z]?/g,
  /[A-Z]{3}-?\d{3}-?/g,
  /[A-Z]{3}-?\d{4}/g,
  /[A-Z]{3}\d{4}/g,
  /[A-Z]{3}\d{2}[A-Z]{2}/g,
  /[A-Z]{2}-?\d{3}-?[A-Z]{2}/g,
  /\d{2}-?[A-Z]{2}-?\d{3}/g,
  /[A-Z]{2,3}\d{2,4}[A-Z]?/g
]

function validateMexicanPlate(text) {
  if (!text || text.length < 6) return null
  
  let cleanText = text
    .replace(/[^A-Z0-9-\s]/g, '')
    .replace(/platesmania/gi, '')
    .replace(/www\./gi, '')
    .replace(/\.com/gi, '')
    .replace(/\s+/g, '')
    .toUpperCase()
  
  const candidates = []
  
  for (const pattern of MEXICAN_PLATE_PATTERNS) {
    const matches = cleanText.match(pattern)
    if (matches && matches.length > 0) {
      for (const match of matches) {
        if (match.length >= 6 && match.length <= 10) {
          let score = 0
          
          if (/^[A-Z]{3}-?\d{2}-?\d{2}$/.test(match)) score += 100
          else if (/^[A-Z]{3}-?\d{3}-?[A-Z]$/.test(match)) score += 90
          else if (/^[A-Z]{3}-?\d{3}-?$/.test(match)) score += 85
          else if (/^[A-Z]{3}-?\d{4}$/.test(match)) score += 80
          else if (/^[A-Z]{2}-?\d{3}-?[A-Z]{2}$/.test(match)) score += 85
          else if (/^[A-Z]{2,3}\d{2,4}[A-Z]?$/.test(match)) score += 60
          else score += 50
          
          if (match.includes('-')) score += 10
          
          if (/000|111|222|333|444|555|666|777|888|999/.test(match)) score -= 20
          if (/AAA|BBB|CCC/.test(match)) score -= 15
          
          candidates.push({ plate: match, score })
        }
      }
    }
  }
  
  if (candidates.length > 0) {
    candidates.sort((a, b) => b.score - a.score)
    return candidates[0].plate
  }
  
  return null
}

async function detectPlateWithOCR(imagePath, vehicleBbox = null, logger, sessionId) {
  try {
    await loadPlateDetectionModel(logger)
    
    logger('🔤 Iniciando reconocimiento óptico de caracteres (OCR)...', 'info')
    const { enhancementVariations, tempFiles, processedImages } = await preprocessImageForPlateDetection(imagePath, vehicleBbox, logger, sessionId)
    
    const ocrResults = []
    
    for (let i = 0; i < enhancementVariations.length; i++) {
      const enhancedPath = enhancementVariations[i]
      const variantName = enhancedPath.includes('focused') ? 'enfocada' : 
                         enhancedPath.includes('highcontrast') ? 'alto contraste' : 
                         enhancedPath.includes('edges') ? 'realce de bordes' :
                         enhancedPath.includes('upscaled') ? 'escalada' : 'desconocida'
      
      try {
        logger(`🔍 Analizando variación ${i + 1}/${enhancementVariations.length}: ${variantName}...`, 'info')
        
        const { data: { text, confidence, words } } = await Tesseract.recognize(
          enhancedPath,
          'eng',
          {
            logger: (m) => {
              if (m.status === 'recognizing text') {
                const progress = Math.round(m.progress * 100)
                logger(`📖 OCR en progreso (${variantName}): ${progress}%`, 'info')
              }
            },
            tessedit_char_whitelist: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-',
            tessedit_pageseg_mode: '7',
            tessedit_ocr_engine_mode: '1',
            preserve_interword_spaces: '0',
            tessedit_char_blacklist: '!@#$%^&*()_+=[]{}|;:,.<>?/~`"\'\\',
            classify_bln_numeric_mode: '0'
          }
        )
        
        logger(`📝 Texto detectado en ${variantName}: "${text}" (confianza: ${confidence.toFixed(1)}%)`, 'info')
        
        const validatedPlate = validateMexicanPlate(text)
        if (validatedPlate) {
          logger(`✅ Placa válida encontrada: ${validatedPlate}`, 'success')
          ocrResults.push({
            plateText: validatedPlate,
            confidence: confidence / 100,
            rawText: text,
            source: variantName
          })
        } else {
          logger(`❌ Texto no corresponde a formato de placa mexicana`, 'warning')
        }
      } catch (error) {
        logger(`❌ OCR falló en variación ${variantName}: ${error.message}`, 'error')
      }
    }
    
    // Clean up temporary files
    for (const tempFile of tempFiles) {
      await fs.unlink(tempFile).catch(() => {})
    }
    
    if (ocrResults.length > 0) {
      ocrResults.sort((a, b) => {
        if (Math.abs(a.confidence - b.confidence) < 0.1) {
          return a.source === 'enfocada' ? -1 : 1
        }
        return b.confidence - a.confidence
      })
      
      const bestResult = ocrResults[0]
      logger(`🎯 Mejor resultado: ${bestResult.plateText} (método: ${bestResult.source}, confianza: ${(bestResult.confidence * 100).toFixed(1)}%)`, 'success')
      
      return {
        hasPlate: true,
        plateText: bestResult.plateText,
        confidence: bestResult.confidence,
        processingMethod: bestResult.source,
        allCandidates: ocrResults.map(r => ({ text: r.plateText, confidence: r.confidence })),
        processedImages
      }
    }
    
    logger('😞 No se pudo detectar ninguna placa válida', 'warning')
    return {
      hasPlate: false,
      plateText: null,
      confidence: 0,
      processingMethod: null,
      allCandidates: [],
      processedImages
    }
  } catch (error) {
    logger(`❌ Error en detección de placa: ${error.message}`, 'error')
    return {
      hasPlate: false,
      plateText: null,
      confidence: 0,
      processingMethod: null,
      allCandidates: [],
      processedImages: []
    }
  }
}

export default defineEventHandler(async (event) => {
  const sessionId = uuidv4()
  const processedImages = []
  
  const logger = (message, type = 'info') => {
    const logEntry = {
      timestamp: new Date().toISOString(),
      message,
      type,
      sessionId
    }
    
    console.log(`[${type.toUpperCase()}] ${message}`)
    
    // Broadcast log via WebSocket
    broadcastToSession(sessionId, {
      type: 'log',
      ...logEntry
    })
  }
  
  const form = formidable({
    uploadDir: '/tmp',
    keepExtensions: true,
    maxFileSize: 15 * 1024 * 1024
  })

  const startTime = Date.now()
  let imagePath = null

  try {
    logger('🚀 Iniciando análisis inteligente de imagen...', 'info')
    
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
    logger(`📁 Imagen recibida: ${path.basename(imagePath)}`, 'info')

    // Step 1: Vehicle Detection
    logger('🚗 Paso 1: Detectando vehículos en la imagen...', 'info')
    const vehicleDetection = await detectVehicle(imagePath, logger)
    
    // Step 2: License Plate Detection
    logger('🔍 Paso 2: Buscando placas de matrícula...', 'info')
    let plateDetection = { hasPlate: false, plateText: null, confidence: 0, processedImages: [] }
    
    const plateResults = await Promise.all([
      vehicleDetection.hasVehicle ? 
        detectPlateWithOCR(imagePath, vehicleDetection.bbox, logger, sessionId) : 
        Promise.resolve(null),
      detectPlateWithOCR(imagePath, null, logger, sessionId),
      detectPlateWithOCR(imagePath, [0, 0.5, 1.0, 0.5], logger, sessionId)
    ])
    
    plateDetection = plateResults.find(result => result && result.hasPlate && result.confidence > 0.1) || 
                    plateResults.find(result => result && result.hasPlate) ||
                    plateResults[1] || 
                    plateResults[0] || 
                    { hasPlate: false, plateText: null, confidence: 0, processedImages: [] }

    // Collect all processed images
    plateResults.forEach(result => {
      if (result && result.processedImages) {
        processedImages.push(...result.processedImages)
      }
    })

    // Clean up uploaded file
    if (imagePath) {
      await fs.unlink(imagePath).catch(() => {})
    }

    const processingTime = Date.now() - startTime
    logger(`⏱️ Procesamiento completado en ${processingTime}ms`, 'success')

    const response = {
      success: true,
      sessionId,
      processingTimeMs: processingTime,
      
      hasVehicle: vehicleDetection.hasVehicle,
      vehicleType: vehicleDetection.vehicleType,
      vehicleConfidence: vehicleDetection.confidence,
      
      hasPlate: plateDetection.hasPlate,
      plateText: plateDetection.plateText,
      plateConfidence: plateDetection.confidence,
      processingMethod: plateDetection.processingMethod,
      
      overallConfidence: plateDetection.hasPlate ? 
        (plateDetection.confidence * 0.7 + vehicleDetection.confidence * 0.3) :
        vehicleDetection.confidence,
      
      debug: {
        vehicleDetections: vehicleDetection.allDetections?.length || 0,
        plateCandidates: plateDetection.allCandidates?.length || 0,
        alternativePlates: plateDetection.allCandidates || []
      },
      
      processedImages: processedImages.filter((img, index, self) => 
        index === self.findIndex(i => i.filename === img.filename)
      )
    }
    
    logger(`🎉 Análisis finalizado: ${response.hasPlate ? 'Placa detectada' : 'No se detectó placa'}`, response.hasPlate ? 'success' : 'warning')
    
    // Broadcast completion
    broadcastToSession(sessionId, {
      type: 'analysis_complete',
      ...response
    })
    
    return response
    
  } catch (error) {
    logger(`💥 Error crítico: ${error.message}`, 'error')
    
    if (imagePath) {
      await fs.unlink(imagePath).catch(() => {})
    }
    
    broadcastToSession(sessionId, {
      type: 'analysis_error',
      error: error.message,
      sessionId
    })
    
    throw createError({
      statusCode: 500,
      statusMessage: `Error al procesar la imagen: ${error.message}`
    })
  }
})