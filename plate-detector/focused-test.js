#!/usr/bin/env node

import fs from 'fs/promises'
import path from 'path'
import { fileURLToPath } from 'url'
import Tesseract from 'tesseract.js'
import sharp from 'sharp'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

async function focusedPlateTest(imageName, expectedPlate) {
  const imagePath = path.join(__dirname, '..', 'test-dataset', imageName)
  
  console.log(`🎯 FOCUSED PLATE TEST: ${imageName}`)
  console.log(`Expected: ${expectedPlate}`)
  console.log('='.repeat(50))
  
  try {
    const metadata = await sharp(imagePath).metadata()
    console.log(`Image: ${metadata.width}x${metadata.height}`)
    
    // Strategy: Focus on the exact center where the plate text should be
    // Remove watermarks and focus only on the plate area
    
    const plateRegionPath = imagePath.replace('.jpg', '_plate_region.jpg')
    
    if (imageName.includes('15334170')) {
      // For the standalone plate image GZW-002-A
      // The plate text is in the center, avoid the header and footer text
      await sharp(imagePath)
        .extract({
          left: Math.round(metadata.width * 0.1),
          top: Math.round(metadata.height * 0.3),
          width: Math.round(metadata.width * 0.8),
          height: Math.round(metadata.height * 0.4)
        })
        .greyscale()
        .resize({ width: 600, fit: 'inside', withoutEnlargement: false })
        .normalize()
        .modulate({ brightness: 1.1, contrast: 1.8 })
        .sharpen()
        .toFile(plateRegionPath)
    } else {
      // For vehicle images like EHR 64-43
      // Focus on bottom center where rear plates are
      await sharp(imagePath)
        .extract({
          left: Math.round(metadata.width * 0.2),
          top: Math.round(metadata.height * 0.6),
          width: Math.round(metadata.width * 0.6),
          height: Math.round(metadata.height * 0.3)
        })
        .greyscale()
        .resize({ width: 800, fit: 'inside', withoutEnlargement: false })
        .normalize()
        .linear(2.5, -(128 * 1.5))
        .sharpen({ sigma: 2, flat: 1, jagged: 3 })
        .toFile(plateRegionPath)
    }
    
    console.log('✓ Extracted plate region')
    
    // Try multiple OCR configurations
    const ocrConfigs = [
      { mode: '7', engine: '1', name: 'Single Line + LSTM' },
      { mode: '8', engine: '1', name: 'Single Word + LSTM' },
      { mode: '6', engine: '1', name: 'Uniform Block + LSTM' },
      { mode: '13', engine: '1', name: 'Raw Line + LSTM' }
    ]
    
    const results = []
    
    for (const config of ocrConfigs) {
      try {
        const result = await Tesseract.recognize(plateRegionPath, 'eng', {
          logger: () => {},
          tessedit_char_whitelist: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-',
          tessedit_pageseg_mode: config.mode,
          tessedit_ocr_engine_mode: config.engine
        })
        
        const cleanText = result.data.text
          .replace(/[^A-Z0-9-\\s]/g, '')
          .replace(/\\s+/g, '')
          .toUpperCase()
          .trim()
        
        results.push({
          config: config.name,
          raw: result.data.text.trim(),
          clean: cleanText,
          confidence: result.data.confidence
        })
        
        console.log(`${config.name}: "${cleanText}" (${result.data.confidence.toFixed(1)}%)`)
      } catch (error) {
        console.log(`${config.name}: ERROR - ${error.message}`)
      }
    }
    
    // Test plate patterns on all results
    console.log('\\n📋 Pattern Matching:')
    const patterns = [
      { name: 'ABC-12-34', regex: /[A-Z]{3}-?\\d{2}-?\\d{2}/g },
      { name: 'ABC-123-A', regex: /[A-Z]{3}-?\\d{3}-?[A-Z]/g },
      { name: 'ABC1234', regex: /[A-Z]{3}\\d{4}/g },
      { name: 'ABC12CD', regex: /[A-Z]{3}\\d{2}[A-Z]{2}/g }
    ]
    
    let foundPlate = null
    
    for (const result of results) {
      for (const pattern of patterns) {
        const matches = result.clean.match(pattern.regex)
        if (matches && matches.length > 0) {
          console.log(`✓ ${pattern.name} found in ${result.config}: ${matches.join(', ')}`)
          if (!foundPlate) foundPlate = matches[0]
        }
      }
    }
    
    console.log('\\n🏆 FINAL RESULT:')
    if (foundPlate) {
      const isCorrect = foundPlate === expectedPlate.replace('-', '').replace(/\\s/g, '') || 
                       foundPlate.replace('-', '') === expectedPlate.replace('-', '').replace(/\\s/g, '')
      console.log(`Found: ${foundPlate}`)
      console.log(`Expected: ${expectedPlate}`)
      console.log(`Status: ${isCorrect ? '✅ CORRECT' : '❌ INCORRECT'}`)
    } else {
      console.log('❌ NO PLATE DETECTED')
    }
    
    // Cleanup
    await fs.unlink(plateRegionPath).catch(() => {})
    
  } catch (error) {
    console.error('❌ Error:', error.message)
  }
}

// Test both images
console.log('🧪 TESTING PLATE DETECTION ON DATASET IMAGES\\n')

const tests = [
  { image: 'Mexico___img03.platesmania.com_200907_m_15334170.jpg', expected: 'GZW-002-A' },
  { image: 'Mexico___img03.platesmania.com_200907_m_15333851.jpg', expected: 'EHR-64-43' }
]

for (const test of tests) {
  await focusedPlateTest(test.image, test.expected)
  console.log('\\n' + '='.repeat(60) + '\\n')
}