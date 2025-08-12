#!/usr/bin/env node

import fs from 'fs/promises'
import path from 'path'
import { fileURLToPath } from 'url'
import * as tf from '@tensorflow/tfjs-node'
import * as cocoSsd from '@tensorflow-models/coco-ssd'
import Tesseract from 'tesseract.js'
import sharp from 'sharp'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

async function debugAnalysis(imageName) {
  const imagePath = path.join(__dirname, '..', 'test-dataset', imageName)
  
  console.log('🔍 DEBUGGING STEP BY STEP:')
  console.log('=========================')
  
  try {
    // Step 1: Load image and get metadata
    console.log('1. Loading image...')
    const imageBuffer = await fs.readFile(imagePath)
    const metadata = await sharp(imagePath).metadata()
    console.log(`   ✓ Image: ${metadata.width}x${metadata.height}, ${imageBuffer.length} bytes`)
    
    // Step 2: Test vehicle detection
    console.log('\n2. Testing vehicle detection...')
    await tf.ready()
    const model = await cocoSsd.load({ base: 'mobilenet_v2' })
    const imageTensor = tf.node.decodeImage(imageBuffer)
    const predictions = await model.detect(imageTensor)
    imageTensor.dispose()
    
    console.log(`   ✓ Total predictions: ${predictions.length}`)
    
    const vehicleClasses = ['car', 'truck', 'bus', 'motorcycle', 'bicycle']
    const allVehicles = predictions.filter(pred => vehicleClasses.includes(pred.class))
    const confidentVehicles = allVehicles.filter(pred => pred.score > 0.15)
    
    console.log(`   ✓ All vehicle detections: ${allVehicles.length}`)
    console.log(`   ✓ Confident vehicles (>0.15): ${confidentVehicles.length}`)
    
    allVehicles.forEach((pred, i) => {
      console.log(`      ${i+1}. ${pred.class}: ${(pred.score*100).toFixed(1)}% at [${pred.bbox.map(x => Math.round(x)).join(', ')}]`)
    })
    
    // Step 3: Test OCR on different regions
    console.log('\n3. Testing OCR on different regions...')
    
    // Test 3a: Bottom half of image (where plates usually are)
    const bottomHalfPath = imagePath.replace('.jpg', '_debug_bottom.jpg')
    await sharp(imagePath)
      .extract({
        left: 0,
        top: Math.round(metadata.height * 0.5),
        width: metadata.width,
        height: Math.round(metadata.height * 0.5)
      })
      .greyscale()
      .resize({ width: 800, fit: 'inside', withoutEnlargement: false })
      .normalize()
      .linear(3.0, -(128 * 2.0))
      .sharpen({ sigma: 2, flat: 1, jagged: 3 })
      .toFile(bottomHalfPath)
    
    console.log('   3a. Testing bottom half...')
    const bottomResult = await Tesseract.recognize(bottomHalfPath, 'eng', {
      logger: () => {},
      tessedit_char_whitelist: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-',
      tessedit_pageseg_mode: '7'
    })
    console.log(`       Raw text: "${bottomResult.data.text.trim()}"`)
    
    // Test 3b: Center region (where the plate clearly is)
    const centerPath = imagePath.replace('.jpg', '_debug_center.jpg')
    await sharp(imagePath)
      .extract({
        left: Math.round(metadata.width * 0.25),
        top: Math.round(metadata.height * 0.4),
        width: Math.round(metadata.width * 0.5),
        height: Math.round(metadata.height * 0.4)
      })
      .greyscale()
      .resize({ width: 800, fit: 'inside', withoutEnlargement: false })
      .normalize()
      .linear(3.5, -(128 * 2.5))
      .sharpen({ sigma: 3, flat: 1, jagged: 4 })
      .toFile(centerPath)
    
    console.log('   3b. Testing center region...')
    const centerResult = await Tesseract.recognize(centerPath, 'eng', {
      logger: () => {},
      tessedit_char_whitelist: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-',
      tessedit_pageseg_mode: '8'
    })
    console.log(`       Raw text: "${centerResult.data.text.trim()}"`)
    
    // Test 3c: Full image with watermark removal
    const cleanPath = imagePath.replace('.jpg', '_debug_clean.jpg')
    await sharp(imagePath)
      .greyscale()
      .resize({ width: 1000, fit: 'inside', withoutEnlargement: false })
      .normalize()
      .linear(2.0, -(128 * 1.0))
      .sharpen()
      .toFile(cleanPath)
    
    console.log('   3c. Testing full image (cleaner)...')
    const cleanResult = await Tesseract.recognize(cleanPath, 'eng', {
      logger: () => {},
      tessedit_char_whitelist: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-',
      tessedit_pageseg_mode: '6'
    })
    console.log(`       Raw text: "${cleanResult.data.text.trim()}"`)
    
    // Use the best result
    const allResults = [bottomResult.data, centerResult.data, cleanResult.data]
    const bestResult = allResults.reduce((best, current) => 
      current.confidence > best.confidence ? current : best
    )
    
    console.log(`   ✓ Best OCR result: "${bestResult.text}" (${bestResult.confidence.toFixed(1)}%)`)
    
    // Step 4: Test our validation function
    console.log('\n4. Testing plate validation...')
    const cleanText = bestResult.text
      .replace(/[^A-Z0-9-\\s]/g, '')
      .replace(/platesmania/gi, '')
      .replace(/www\\./gi, '')
      .replace(/\\.com/gi, '')
      .replace(/\\s+/g, '')
      .toUpperCase()
    
    console.log(`   ✓ Cleaned text: "${cleanText}"`)
    
    // Test patterns
    const patterns = [
      /\\b[A-Z]{3}-?\\d{2}-?\\d{2}\\b/g,
      /\\b[A-Z]{3}-?\\d{3}-?[A-Z]\\b/g,
      /\\b[A-Z]{3}-?\\d{4}\\b/g
    ]
    
    patterns.forEach((pattern, i) => {
      const matches = cleanText.match(pattern)
      console.log(`   Pattern ${i+1}: ${matches ? matches.join(', ') : 'no matches'}`)
    })
    
    // Cleanup
    await fs.unlink(bottomHalfPath).catch(() => {})
    await fs.unlink(centerPath).catch(() => {})
    await fs.unlink(cleanPath).catch(() => {})
    
  } catch (error) {
    console.error('❌ Error:', error.message)
  }
}

const testImage = 'Mexico___img03.platesmania.com_200907_m_15334170.jpg'
console.log(`🧪 Debugging: ${testImage}`)
console.log('Expected: GZW-002-A\\n')

debugAnalysis(testImage)