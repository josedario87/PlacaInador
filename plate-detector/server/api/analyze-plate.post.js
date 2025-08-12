import formidable from 'formidable'
import fs from 'fs/promises'
import * as tf from '@tensorflow/tfjs-node'
import * as cocoSsd from '@tensorflow-models/coco-ssd'
import Tesseract from 'tesseract.js'
import sharp from 'sharp'

let carDetectionModel = null
let plateDetectionModel = null

// Model URLs for better license plate detection
const YOLO_VEHICLE_MODEL_URL = 'https://www.kaggle.com/models/tensorflow/yolo/frameworks/TensorFlow.js/variations/yolo-v8n/versions/1'
const PLATE_DETECTION_MODEL_URL = 'https://tfhub.dev/tensorflow/tfjs-model/ssd_mobilenet_v2/1/default/1'

async function loadCarDetectionModel() {
  if (!carDetectionModel) {
    try {
      await tf.ready()
      // Try to load a better vehicle detection model, fallback to COCO-SSD
      carDetectionModel = await cocoSsd.load({
        base: 'mobilenet_v2'
      })
      console.log('Vehicle detection model loaded successfully')
    } catch (error) {
      console.error('Error loading vehicle model:', error)
      carDetectionModel = await cocoSsd.load()
    }
  }
  return carDetectionModel
}

async function loadPlateDetectionModel() {
  if (!plateDetectionModel) {
    try {
      await tf.ready()
      // For now, we'll use a simple approach and enhance it with better image processing
      plateDetectionModel = true // Placeholder - we'll use image processing techniques
      console.log('Plate detection pipeline initialized')
    } catch (error) {
      console.error('Error initializing plate detection:', error)
      plateDetectionModel = true
    }
  }
  return plateDetectionModel
}

async function detectVehicle(imagePath) {
  try {
    const model = await loadCarDetectionModel()
    const imageBuffer = await fs.readFile(imagePath)
    const imageTensor = tf.node.decodeImage(imageBuffer)
    
    const predictions = await model.detect(imageTensor)
    imageTensor.dispose()
    
    // Enhanced vehicle classes for better detection
    const vehicleClasses = ['car', 'truck', 'bus', 'motorcycle', 'bicycle']
    
    // Get all vehicle detections with confidence > 0.15 (very low threshold for challenging conditions)
    const vehicleDetections = predictions.filter(pred => 
      vehicleClasses.includes(pred.class) && pred.score > 0.15
    )
    
    // Sort by confidence and take the best detection
    vehicleDetections.sort((a, b) => b.score - a.score)
    
    const bestVehicle = vehicleDetections[0]
    const hasVehicle = vehicleDetections.length > 0
    
    return {
      hasVehicle,
      bbox: bestVehicle ? bestVehicle.bbox : null,
      confidence: bestVehicle ? bestVehicle.score : 0,
      vehicleType: bestVehicle ? bestVehicle.class : null,
      allDetections: vehicleDetections
    }
  } catch (error) {
    console.error('Error detecting vehicle:', error)
    return { hasVehicle: false, bbox: null, confidence: 0, vehicleType: null, allDetections: [] }
  }
}

// Advanced image preprocessing for license plate detection
async function preprocessImageForPlateDetection(imagePath, vehicleBbox = null) {
  try {
    let workingPath = imagePath
    const tempFiles = []
    
    // Step 1: Crop to specified region if available
    if (vehicleBbox && Array.isArray(vehicleBbox) && vehicleBbox.length === 4) {
      const originalImage = sharp(imagePath)
      const metadata = await originalImage.metadata()
      
      let cropParams
      
      if (vehicleBbox.every(v => typeof v === 'number' && v <= 1 && v >= 0)) {
        // Ratio-based cropping (for bottom half, etc.)
        const [xRatio, yRatio, widthRatio, heightRatio] = vehicleBbox
        cropParams = {
          left: Math.max(0, Math.round(metadata.width * xRatio)),
          top: Math.max(0, Math.round(metadata.height * yRatio)),
          width: Math.min(metadata.width, Math.round(metadata.width * widthRatio)),
          height: Math.min(metadata.height, Math.round(metadata.height * heightRatio))
        }
      } else {
        // Absolute pixel cropping (vehicle detection bbox)
        const [x, y, width, height] = vehicleBbox
        cropParams = {
          left: Math.max(0, Math.round(x)),
          top: Math.max(0, Math.round(y)),
          width: Math.min(metadata.width - Math.round(x), Math.round(width)),
          height: Math.min(metadata.height - Math.round(y), Math.round(height))
        }
      }
      
      // Ensure minimum dimensions to avoid "too small to scale" error
      if (cropParams.width >= 100 && cropParams.height >= 75) {
        const croppedPath = imagePath.replace('.', '_cropped.')
        await sharp(imagePath)
          .extract(cropParams)
          .toFile(croppedPath)
        
        workingPath = croppedPath
        tempFiles.push(croppedPath)
        console.log(`✓ Cropped to region: ${cropParams.width}x${cropParams.height}`)
      } else {
        console.log(`⚠ Skipping crop - too small: ${cropParams.width}x${cropParams.height}`)
      }
    }
    
    // Step 2: Multiple enhancement approaches
    const enhancementVariations = []
    
    // Variation 1: Focused plate region (center area)
    const focusedPath = workingPath.replace('.', '_focused.')
    const workingImage = sharp(workingPath)
    const workingMetadata = await workingImage.metadata()
    
    // Ensure minimum working size
    const targetWidth = Math.max(workingMetadata.width * 2, 600)
    const targetHeight = Math.max(workingMetadata.height * 2, 400)
    
    if (workingMetadata.width >= 10 && workingMetadata.height >= 10) {
      await sharp(workingPath)
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
        .toFile(focusedPath)
      console.log(`✓ Created focused version: ${targetWidth}x${targetHeight}`)
    } else {
      // Fallback: just copy the original
      await sharp(workingPath).toFile(focusedPath)
      console.log(`⚠ Used original size due to small dimensions`)
    }
    enhancementVariations.push(focusedPath)
    tempFiles.push(focusedPath)
    
    // Variation 2: High contrast for dark/distant plates
    const highContrastPath = workingPath.replace('.', '_highcontrast.')
    await sharp(workingPath)
      .greyscale()
      .resize({ width: 800, height: 600, fit: 'inside', withoutEnlargement: false })
      .normalize()
      .linear(2.0, -(128 * 1.0)) // More aggressive contrast
      .sharpen({ sigma: 1, flat: 1, jagged: 2 })
      .toFile(highContrastPath)
    enhancementVariations.push(highContrastPath)
    tempFiles.push(highContrastPath)
    
    // Variation 3: Noise reduction and edge enhancement
    const edgeEnhancedPath = workingPath.replace('.', '_edges.')
    await sharp(workingPath)
      .greyscale()
      .resize({ width: 800, height: 600, fit: 'inside', withoutEnlargement: false })
      .blur(0.3) // Light blur to reduce noise
      .sharpen({ sigma: 2, flat: 1, jagged: 3 }) // Strong sharpening
      .modulate({ brightness: 1.3, contrast: 1.4 })
      .normalize()
      .toFile(edgeEnhancedPath)
    enhancementVariations.push(edgeEnhancedPath)
    tempFiles.push(edgeEnhancedPath)
    
    // Variation 4: Upscaled version for small/distant plates
    const upscaledPath = workingPath.replace('.', '_upscaled.')
    await sharp(workingPath)
      .greyscale()
      .resize({ width: 1200, height: 900, fit: 'inside', withoutEnlargement: false })
      .sharpen({ sigma: 1.5, flat: 1, jagged: 2 })
      .modulate({ brightness: 1.2, contrast: 1.5 })
      .normalize()
      .toFile(upscaledPath)
    enhancementVariations.push(upscaledPath)
    tempFiles.push(upscaledPath)
    
    return { enhancementVariations, tempFiles }
  } catch (error) {
    console.error('Error in image preprocessing:', error)
    return { enhancementVariations: [imagePath], tempFiles: [] }
  }
}

// Mexican license plate patterns - optimized based on dataset analysis and OCR results
const MEXICAN_PLATE_PATTERNS = [
  // Most common format: ABC-12-34 (like NCM-27-04, ELD-94-06)
  /[A-Z]{3}-?\d{2}-?\d{2}/g,
  // Alternative format: ABC-123-A (like GZW-002-A)  
  /[A-Z]{3}-?\d{3}-?[A-Z]?/g,
  // Incomplete reads like SZH-002- (missing last character)
  /[A-Z]{3}-?\d{3}-?/g,
  // Legacy format: ABC-1234
  /[A-Z]{3}-?\d{4}/g,
  // Without dashes: ABC1234, ABC12CD
  /[A-Z]{3}\d{4}/g,
  /[A-Z]{3}\d{2}[A-Z]{2}/g,
  // New federal format: AB-123-CD
  /[A-Z]{2}-?\d{3}-?[A-Z]{2}/g,
  // Commercial/transport: 12-AB-345
  /\d{2}-?[A-Z]{2}-?\d{3}/g,
  // Partial matches with at least 6 characters
  /[A-Z]{2,3}\d{2,4}[A-Z]?/g
]

function validateMexicanPlate(text) {
  if (!text || text.length < 6) return null
  
  // Clean the text - remove common OCR artifacts and watermarks
  let cleanText = text
    .replace(/[^A-Z0-9-\s]/g, '') // Remove special chars except dashes and spaces
    .replace(/platesmania/gi, '') // Remove watermark text
    .replace(/www\./gi, '') // Remove web artifacts
    .replace(/\.com/gi, '') // Remove web artifacts
    .replace(/\s+/g, '') // Remove all spaces
    .toUpperCase()
  
  // Try each pattern with confidence scoring
  const candidates = []
  
  for (const pattern of MEXICAN_PLATE_PATTERNS) {
    const matches = cleanText.match(pattern)
    if (matches && matches.length > 0) {
      for (const match of matches) {
        if (match.length >= 6 && match.length <= 10) {
          // Score the candidate based on format compliance
          let score = 0
          
          // Prefer standard format ABC-12-34
          if (/^[A-Z]{3}-?\d{2}-?\d{2}$/.test(match)) score += 100
          // Alternative formats
          else if (/^[A-Z]{3}-?\d{3}-?[A-Z]$/.test(match)) score += 90
          else if (/^[A-Z]{3}-?\d{3}-?$/.test(match)) score += 85 // Incomplete but likely valid
          else if (/^[A-Z]{3}-?\d{4}$/.test(match)) score += 80
          else if (/^[A-Z]{2}-?\d{3}-?[A-Z]{2}$/.test(match)) score += 85
          else if (/^[A-Z]{2,3}\d{2,4}[A-Z]?$/.test(match)) score += 60 // Partial but possible
          else score += 50
          
          // Bonus for proper dash placement
          if (match.includes('-')) score += 10
          
          // Penalty for suspicious patterns
          if (/000|111|222|333|444|555|666|777|888|999/.test(match)) score -= 20
          if (/AAA|BBB|CCC/.test(match)) score -= 15
          
          candidates.push({ plate: match, score })
        }
      }
    }
  }
  
  // Return the highest scoring candidate
  if (candidates.length > 0) {
    candidates.sort((a, b) => b.score - a.score)
    return candidates[0].plate
  }
  
  return null
}

async function detectPlateWithOCR(imagePath, vehicleBbox = null) {
  try {
    await loadPlateDetectionModel()
    
    const { enhancementVariations, tempFiles } = await preprocessImageForPlateDetection(imagePath, vehicleBbox)
    
    const ocrResults = []
    
    // Run OCR on all enhancement variations
    for (const enhancedPath of enhancementVariations) {
      try {
        const { data: { text, confidence, words } } = await Tesseract.recognize(
          enhancedPath,
          'eng',
          {
            logger: () => {}, // Suppress logs
            tessedit_char_whitelist: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-',
            tessedit_pageseg_mode: '7', // Single text line (better for plates)
            tessedit_ocr_engine_mode: '1', // LSTM only for better accuracy
            preserve_interword_spaces: '0',
            // Mexican plate specific optimizations
            tessedit_char_blacklist: '!@#$%^&*()_+=[]{}|;:,.<>?/~`"\'\\',
            classify_bln_numeric_mode: '0'
          }
        )
        
        const validatedPlate = validateMexicanPlate(text)
        if (validatedPlate) {
          ocrResults.push({
            plateText: validatedPlate,
            confidence: confidence / 100,
            rawText: text,
            source: enhancedPath.includes('standard') ? 'standard' : 
                   enhancedPath.includes('highcontrast') ? 'high_contrast' : 
                   enhancedPath.includes('edges') ? 'edge_enhanced' :
                   enhancedPath.includes('upscaled') ? 'upscaled' : 'unknown'
          })
        }
      } catch (error) {
        console.warn(`OCR failed for ${enhancedPath}:`, error.message)
      }
    }
    
    // Clean up temporary files
    for (const tempFile of tempFiles) {
      await fs.unlink(tempFile).catch(() => {})
    }
    
    // Return the best result
    if (ocrResults.length > 0) {
      // Sort by confidence and prefer standard processing if confidence is similar
      ocrResults.sort((a, b) => {
        if (Math.abs(a.confidence - b.confidence) < 0.1) {
          return a.source === 'standard' ? -1 : 1
        }
        return b.confidence - a.confidence
      })
      
      const bestResult = ocrResults[0]
      return {
        hasPlate: true,
        plateText: bestResult.plateText,
        confidence: bestResult.confidence,
        processingMethod: bestResult.source,
        allCandidates: ocrResults.map(r => ({ text: r.plateText, confidence: r.confidence }))
      }
    }
    
    return {
      hasPlate: false,
      plateText: null,
      confidence: 0,
      processingMethod: null,
      allCandidates: []
    }
  } catch (error) {
    console.error('Error in plate detection:', error)
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
  const form = formidable({
    uploadDir: '/tmp',
    keepExtensions: true,
    maxFileSize: 15 * 1024 * 1024 // Increased limit for better quality images
  })

  const startTime = Date.now()
  let imagePath = null

  try {
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
    console.log(`Processing image: ${imagePath}`)

    // Step 1: Vehicle Detection
    console.log('Step 1: Detecting vehicles...')
    const vehicleDetection = await detectVehicle(imagePath)
    
    // Step 2: License Plate Detection (always run, even without vehicle detection)
    console.log('Step 2: Detecting license plates...')
    let plateDetection = { hasPlate: false, plateText: null, confidence: 0 }
    
    // Always try multiple approaches in parallel
    const plateResults = await Promise.all([
      // Method 1: Use vehicle detection if available
      vehicleDetection.hasVehicle ? 
        detectPlateWithOCR(imagePath, vehicleDetection.bbox) : 
        Promise.resolve(null),
      // Method 2: Always try full image (primary fallback)
      detectPlateWithOCR(imagePath, null),
      // Method 3: Try bottom half of image (where plates usually are)
      detectPlateWithOCR(imagePath, [0, 0.5, 1.0, 0.5]) // x, y, width, height ratios
    ])
    
    // Choose the best plate detection result (lower confidence threshold)
    plateDetection = plateResults.find(result => result && result.hasPlate && result.confidence > 0.1) || 
                    plateResults.find(result => result && result.hasPlate) ||
                    plateResults[1] || // Prefer full image result
                    plateResults[0] || 
                    { hasPlate: false, plateText: null, confidence: 0 }

    // Clean up uploaded file
    if (imagePath) {
      await fs.unlink(imagePath).catch(() => {})
    }

    const processingTime = Date.now() - startTime
    console.log(`Processing completed in ${processingTime}ms`)

    // Enhanced response with more detailed information
    const response = {
      success: true,
      processingTimeMs: processingTime,
      
      // Vehicle detection results
      hasVehicle: vehicleDetection.hasVehicle,
      vehicleType: vehicleDetection.vehicleType,
      vehicleConfidence: vehicleDetection.confidence,
      
      // License plate detection results
      hasPlate: plateDetection.hasPlate,
      plateText: plateDetection.plateText,
      plateConfidence: plateDetection.confidence,
      processingMethod: plateDetection.processingMethod,
      
      // Overall confidence (weighted average)
      overallConfidence: plateDetection.hasPlate ? 
        (plateDetection.confidence * 0.7 + vehicleDetection.confidence * 0.3) :
        vehicleDetection.confidence,
      
      // Debug information
      debug: {
        vehicleDetections: vehicleDetection.allDetections?.length || 0,
        plateCandidates: plateDetection.allCandidates?.length || 0,
        alternativePlates: plateDetection.allCandidates || []
      }
    }
    
    console.log('Analysis result:', {
      hasVehicle: response.hasVehicle,
      hasPlate: response.hasPlate,
      plateText: response.plateText,
      confidence: response.overallConfidence
    })
    
    return response
    
  } catch (error) {
    console.error('Error processing image:', error)
    
    // Clean up on error
    if (imagePath) {
      await fs.unlink(imagePath).catch(() => {})
    }
    
    throw createError({
      statusCode: 500,
      statusMessage: `Error al procesar la imagen: ${error.message}`
    })
  }
})