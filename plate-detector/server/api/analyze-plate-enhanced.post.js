import formidable from 'formidable'
import fs from 'fs/promises'
import * as tf from '@tensorflow/tfjs-node'
import * as cocoSsd from '@tensorflow-models/coco-ssd'
import Tesseract from 'tesseract.js'
import sharp from 'sharp'
import { v4 as uuidv4 } from 'uuid'
import path from 'path'
import { createProcessingLogger, PROCESSING_STEPS } from '../utils/processing-logger.js'

let carDetectionModel = null
let plateDetectionModel = null

async function loadCarDetectionModel(logger) {
  if (!carDetectionModel) {
    try {
      logger.info('🔧 Inicializando modelo de detección de vehículos...')
      await tf.ready()
      carDetectionModel = await cocoSsd.load({
        base: 'mobilenet_v2'
      })
      logger.success('✅ Modelo de detección de vehículos cargado exitosamente')
    } catch (error) {
      logger.warning(`⚠️ Error cargando modelo optimizado, usando fallback: ${error.message}`)
      carDetectionModel = await cocoSsd.load()
      logger.info('✅ Modelo fallback cargado')
    }
  }
  return carDetectionModel
}

async function loadPlateDetectionModel(logger) {
  if (!plateDetectionModel) {
    try {
      logger.info('🔧 Inicializando pipeline de detección de placas...')
      await tf.ready()
      plateDetectionModel = true
      logger.success('✅ Pipeline de detección de placas inicializado')
    } catch (error) {
      logger.warning(`⚠️ Error inicializando pipeline: ${error.message}`)
      plateDetectionModel = true
    }
  }
  return plateDetectionModel
}

async function detectVehicle(imagePath, logger) {
  try {
    logger.info('🚗 Iniciando detección de vehículos...')
    const model = await loadCarDetectionModel(logger)
    const imageBuffer = await fs.readFile(imagePath)
    const imageTensor = tf.node.decodeImage(imageBuffer)
    
    logger.info('🔍 Analizando imagen con modelo de IA...')
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
      logger.success(`✅ Vehículo detectado: ${bestVehicle.class} (confianza: ${(bestVehicle.score * 100).toFixed(1)}%)`)
      logger.info(`📍 Ubicación: [${bestVehicle.bbox.map(n => Math.round(n)).join(', ')}]`)
    } else {
      logger.warning('⚠️ No se detectaron vehículos claros en la imagen')
    }
    
    return {
      hasVehicle,
      bbox: bestVehicle ? bestVehicle.bbox : null,
      confidence: bestVehicle ? bestVehicle.score : 0,
      vehicleType: bestVehicle ? bestVehicle.class : null,
      allDetections: vehicleDetections
    }
  } catch (error) {
    logger.error(`❌ Error en detección de vehículos: ${error.message}`)
    return { hasVehicle: false, bbox: null, confidence: 0, vehicleType: null, allDetections: [] }
  }
}

async function preprocessImageForPlateDetection(imagePath, vehicleBbox = null, logger) {
  try {
    logger.info('🖼️ Iniciando preprocesamiento de imagen...')
    let workingPath = imagePath
    const tempFiles = []
    
    // Guardar imagen original
    const originalBuffer = await fs.readFile(imagePath)
    await logger.saveProcessedImage(originalBuffer, PROCESSING_STEPS.ORIGINAL, 'Imagen original')
    
    // Paso 1: Recortar región si está disponible
    if (vehicleBbox && Array.isArray(vehicleBbox) && vehicleBbox.length === 4) {
      logger.info('✂️ Recortando región del vehículo detectado...')
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
        await logger.saveProcessedImage(croppedBuffer, PROCESSING_STEPS.CROPPED, `Región recortada: ${cropParams.width}x${cropParams.height}`)
        
        workingPath = croppedPath
        tempFiles.push(croppedPath)
        logger.success(`✅ Imagen recortada: ${cropParams.width}x${cropParams.height} píxeles`)
      } else {
        logger.warning(`⚠️ Región muy pequeña para recortar: ${cropParams.width}x${cropParams.height}`)
      }
    }
    
    // Paso 2: Crear variaciones de mejora
    logger.info('🎨 Generando variaciones de mejora de imagen...')
    const enhancementVariations = []
    
    // Variación 1: Enfocada
    logger.info('📸 Creando versión enfocada...')
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
      await logger.saveProcessedImage(focusedBuffer, PROCESSING_STEPS.FOCUSED, `Versión enfocada: ${targetWidth}x${targetHeight}`)
      
      logger.success(`✅ Versión enfocada creada: ${targetWidth}x${targetHeight}`)
    } else {
      await sharp(workingPath).jpeg().toFile(focusedPath)
      logger.warning(`⚠️ Usando tamaño original debido a dimensiones pequeñas`)
    }
    enhancementVariations.push(focusedPath)
    tempFiles.push(focusedPath)
    
    // Variación 2: Alto contraste
    logger.info('🔆 Creando versión de alto contraste...')
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
    await logger.saveProcessedImage(highContrastBuffer, PROCESSING_STEPS.HIGH_CONTRAST, 'Versión de alto contraste')
    
    enhancementVariations.push(highContrastPath)
    tempFiles.push(highContrastPath)
    logger.success('✅ Versión de alto contraste creada')
    
    // Variación 3: Realce de bordes
    logger.info('🖼️ Creando versión con realce de bordes...')
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
    await logger.saveProcessedImage(edgeBuffer, PROCESSING_STEPS.EDGE_ENHANCED, 'Versión con realce de bordes')
    
    enhancementVariations.push(edgeEnhancedPath)
    tempFiles.push(edgeEnhancedPath)
    logger.success('✅ Versión con realce de bordes creada')
    
    // Variación 4: Escalada
    logger.info('🔍 Creando versión escalada...')
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
    await logger.saveProcessedImage(upscaledBuffer, PROCESSING_STEPS.UPSCALED, 'Versión escalada para mejorar detalles')
    
    enhancementVariations.push(upscaledPath)
    tempFiles.push(upscaledPath)
    logger.success('✅ Versión escalada creada')
    
    logger.success(`🎯 Preprocesamiento completado: ${enhancementVariations.length} variaciones generadas`)
    
    return { enhancementVariations, tempFiles }
  } catch (error) {
    logger.error(`❌ Error en preprocesamiento: ${error.message}`)
    return { enhancementVariations: [imagePath], tempFiles: [] }
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

async function detectPlateWithOCR(imagePath, vehicleBbox = null, logger) {
  try {
    await loadPlateDetectionModel(logger)
    
    logger.info('🔤 Iniciando reconocimiento óptico de caracteres (OCR)...')
    const { enhancementVariations, tempFiles } = await preprocessImageForPlateDetection(imagePath, vehicleBbox, logger)
    
    const ocrResults = []
    
    for (let i = 0; i < enhancementVariations.length; i++) {
      const enhancedPath = enhancementVariations[i]
      const variantName = enhancedPath.includes('focused') ? 'enfocada' : 
                         enhancedPath.includes('highcontrast') ? 'alto contraste' : 
                         enhancedPath.includes('edges') ? 'realce de bordes' :
                         enhancedPath.includes('upscaled') ? 'escalada' : 'desconocida'
      
      try {
        logger.info(`🔍 Analizando variación ${i + 1}/${enhancementVariations.length}: ${variantName}...`)
        logger.progress('OCR', i + 1, enhancementVariations.length, 'variaciones')
        
        const { data: { text, confidence, words } } = await Tesseract.recognize(
          enhancedPath,
          'eng',
          {
            logger: (m) => {
              if (m.status === 'recognizing text') {
                const progress = Math.round(m.progress * 100)
                if (progress % 20 === 0) { // Log cada 20%
                  logger.info(`📖 OCR en progreso (${variantName}): ${progress}%`)
                }
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
        
        logger.info(`📝 Texto detectado en ${variantName}: "${text}" (confianza: ${confidence.toFixed(1)}%)`)
        
        const validatedPlate = validateMexicanPlate(text)
        if (validatedPlate) {
          logger.success(`✅ Placa válida encontrada: ${validatedPlate}`)
          ocrResults.push({
            plateText: validatedPlate,
            confidence: confidence / 100,
            rawText: text,
            source: variantName
          })
        } else {
          logger.warning(`❌ Texto no corresponde a formato de placa mexicana`)
        }
      } catch (error) {
        logger.error(`❌ OCR falló en variación ${variantName}: ${error.message}`)
      }
    }
    
    // Limpiar archivos temporales
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
      logger.success(`🎯 Mejor resultado: ${bestResult.plateText} (método: ${bestResult.source}, confianza: ${(bestResult.confidence * 100).toFixed(1)}%)`)
      
      return {
        hasPlate: true,
        plateText: bestResult.plateText,
        confidence: bestResult.confidence,
        processingMethod: bestResult.source,
        allCandidates: ocrResults.map(r => ({ text: r.plateText, confidence: r.confidence }))
      }
    }
    
    logger.warning('😞 No se pudo detectar ninguna placa válida')
    return {
      hasPlate: false,
      plateText: null,
      confidence: 0,
      processingMethod: null,
      allCandidates: []
    }
  } catch (error) {
    logger.error(`❌ Error en detección de placa: ${error.message}`)
    return {
      hasPlate: false,
      plateText: null,
      confidence: 0,
      processingMethod: null,
      allCandidates: []
    }
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
    logger.info('🚀 Iniciando análisis inteligente de imagen...')
    
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

    // Paso 1: Detección de vehículos
    logger.info('🚗 Paso 1: Detectando vehículos en la imagen...')
    const vehicleDetection = await detectVehicle(imagePath, logger)
    
    // Paso 2: Detección de placas
    logger.info('🔍 Paso 2: Buscando placas de matrícula...')
    let plateDetection = { hasPlate: false, plateText: null, confidence: 0 }
    
    const plateResults = await Promise.all([
      vehicleDetection.hasVehicle ? 
        detectPlateWithOCR(imagePath, vehicleDetection.bbox, logger) : 
        Promise.resolve(null),
      detectPlateWithOCR(imagePath, null, logger),
      detectPlateWithOCR(imagePath, [0, 0.5, 1.0, 0.5], logger)
    ])
    
    plateDetection = plateResults.find(result => result && result.hasPlate && result.confidence > 0.1) || 
                    plateResults.find(result => result && result.hasPlate) ||
                    plateResults[1] || 
                    plateResults[0] || 
                    { hasPlate: false, plateText: null, confidence: 0 }

    // Limpiar archivo subido
    if (imagePath) {
      await fs.unlink(imagePath).catch(() => {})
    }

    logger.timing('Procesamiento')

    const response = {
      success: true,
      sessionId,
      processingTimeMs: Date.now() - logger.startTime,
      
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
      
      // Datos en tiempo real
      logs: logger.getLogs(),
      processedImages: logger.getProcessedImages(),
      stats: logger.getStats()
    }
    
    logger.success(`🎉 Análisis finalizado: ${response.hasPlate ? 'Placa detectada' : 'No se detectó placa'}`)
    logger.finish()
    
    return response
    
  } catch (error) {
    logger.error(`💥 Error crítico: ${error.message}`)
    
    if (imagePath) {
      await fs.unlink(imagePath).catch(() => {})
    }
    
    throw createError({
      statusCode: 500,
      statusMessage: `Error al procesar la imagen: ${error.message}`
    })
  }
})