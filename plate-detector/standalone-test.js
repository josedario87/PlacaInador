#!/usr/bin/env node

import fs from 'fs/promises'
import path from 'path'
import { fileURLToPath } from 'url'
import Tesseract from 'tesseract.js'
import sharp from 'sharp'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// Mexican license plate patterns
const MEXICAN_PLATE_PATTERNS = [
  /[A-Z]{3}-?\d{2}-?\d{2}/g,
  /[A-Z]{3}-?\d{3}-?[A-Z]?/g,
  /[A-Z]{3}-?\d{3}-?/g,
  /[A-Z]{3}-?\d{4}/g,
  /[A-Z]{3}\d{4}/g,
  /[A-Z]{3}\d{2}[A-Z]{2}/g,
  /[A-Z]{2,3}\d{2,4}[A-Z]?/g
]

function validateMexicanPlate(text) {
  if (!text || text.length < 5) return null
  
  let cleanText = text
    .replace(/[^A-Z0-9-\s]/g, '')
    .replace(/platesmania/gi, '')
    .replace(/www\./gi, '')
    .replace(/\.com/gi, '')
    .replace(/major/gi, '')
    .replace(/katz/gi, '')
    .replace(/guerrero/gi, '')
    .replace(/\s+/g, '')
    .toUpperCase()
  
  const candidates = []
  
  for (const pattern of MEXICAN_PLATE_PATTERNS) {
    const matches = cleanText.match(pattern)
    if (matches && matches.length > 0) {
      for (const match of matches) {
        if (match.length >= 5 && match.length <= 10) {
          let score = 0
          
          if (/^[A-Z]{3}-?\d{2}-?\d{2}$/.test(match)) score += 100
          else if (/^[A-Z]{3}-?\d{3}-?[A-Z]$/.test(match)) score += 90
          else if (/^[A-Z]{3}-?\d{3}-?$/.test(match)) score += 85
          else score += 50
          
          if (match.includes('-')) score += 10
          
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

async function standaloneTest(imageName, expectedPlate) {
  const imagePath = path.join(__dirname, '..', 'test-dataset', imageName)
  
  console.log(`\n🧪 STANDALONE TEST: ${imageName}`)
  console.log(`Expected: ${expectedPlate}`)
  console.log('=' .repeat(50))
  
  try {
    const metadata = await sharp(imagePath).metadata()
    console.log(`Image: ${metadata.width}x${metadata.height}`)
    
    // Create different enhanced versions
    const variations = [
      {
        name: 'Full Image Enhanced',
        path: imagePath.replace('.jpg', '_test_full.jpg'),
        process: () => sharp(imagePath)
          .greyscale()
          .resize({ width: Math.max(metadata.width * 2, 800), fit: 'inside', withoutEnlargement: false })
          .normalize()
          .modulate({ brightness: 1.1, contrast: 1.8 })
          .sharpen()
      },
      {
        name: 'Bottom Half',
        path: imagePath.replace('.jpg', '_test_bottom.jpg'),
        process: () => sharp(imagePath)
          .extract({
            left: 0,
            top: Math.round(metadata.height * 0.5),
            width: metadata.width,
            height: Math.round(metadata.height * 0.5)
          })
          .greyscale()
          .resize({ width: 800, fit: 'inside', withoutEnlargement: false })
          .normalize()
          .linear(2.5, -(128 * 1.5))
          .sharpen({ sigma: 2, flat: 1, jagged: 3 })
      },
      {
        name: 'Center Region',
        path: imagePath.replace('.jpg', '_test_center.jpg'),
        process: () => sharp(imagePath)
          .extract({
            left: Math.round(metadata.width * 0.2),
            top: Math.round(metadata.height * 0.3),
            width: Math.round(metadata.width * 0.6),
            height: Math.round(metadata.height * 0.4)
          })
          .greyscale()
          .resize({ width: 800, fit: 'inside', withoutEnlargement: false })
          .normalize()
          .linear(3.0, -(128 * 2.0))
          .sharpen({ sigma: 2, flat: 1, jagged: 3 })
      }
    ]
    
    const allResults = []
    
    for (const variation of variations) {
      try {
        console.log(`\n📸 Processing: ${variation.name}`)
        await variation.process().toFile(variation.path)
        
        const ocrConfigs = [
          { mode: '7', name: 'Line' },
          { mode: '8', name: 'Word' },
          { mode: '6', name: 'Block' }
        ]
        
        for (const config of ocrConfigs) {
          try {
            const result = await Tesseract.recognize(variation.path, 'eng', {
              logger: () => {},
              tessedit_char_whitelist: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-',
              tessedit_pageseg_mode: config.mode,
              tessedit_ocr_engine_mode: '1'
            })
            
            const validatedPlate = validateMexicanPlate(result.data.text)
            
            console.log(`  ${config.name}: "${result.data.text.trim()}" -> ${validatedPlate || 'None'} (${result.data.confidence.toFixed(1)}%)`)
            
            if (validatedPlate) {
              allResults.push({
                plate: validatedPlate,
                confidence: result.data.confidence,
                method: `${variation.name} - ${config.name}`,
                raw: result.data.text.trim()
              })
            }
          } catch (error) {
            console.log(`  ${config.name}: ERROR - ${error.message}`)
          }
        }
        
        // Clean up
        await fs.unlink(variation.path).catch(() => {})
        
      } catch (error) {
        console.log(`  ERROR: ${error.message}`)
      }
    }
    
    // Show results
    console.log(`\n🏆 FINAL RESULTS:`)
    if (allResults.length > 0) {
      allResults.sort((a, b) => b.confidence - a.confidence)
      
      allResults.forEach((result, i) => {
        const cleanExpected = expectedPlate.replace(/[-\s]/g, '').toUpperCase()
        const cleanFound = result.plate.replace(/[-\s]/g, '').toUpperCase()
        const isMatch = cleanFound === cleanExpected || 
                       cleanFound.includes(cleanExpected.substring(0, 6)) ||
                       cleanExpected.includes(cleanFound.substring(0, 6))
        
        console.log(`  ${i + 1}. ${result.plate} ${isMatch ? '✅' : '❌'} (${result.confidence.toFixed(1)}%, ${result.method})`)
      })
      
      const bestResult = allResults[0]
      const cleanExpected = expectedPlate.replace(/[-\s]/g, '').toUpperCase()
      const cleanFound = bestResult.plate.replace(/[-\s]/g, '').toUpperCase()
      const isCorrect = cleanFound === cleanExpected || 
                       cleanFound.includes(cleanExpected.substring(0, 6)) ||
                       cleanExpected.includes(cleanFound.substring(0, 6))
      
      console.log(`\n🎯 BEST: ${bestResult.plate} ${isCorrect ? '✅ SUCCESS' : '❌ MISMATCH'}`)
      if (!isCorrect) {
        console.log(`   Expected: ${expectedPlate}`)
        console.log(`   Found: ${bestResult.plate}`)
      }
    } else {
      console.log('❌ NO PLATES DETECTED')
    }
    
  } catch (error) {
    console.error('❌ Error:', error.message)
  }
}

// Test our problematic images
const tests = [
  { image: 'Mexico___img03.platesmania.com_200907_m_15334170.jpg', expected: 'GZW-002-A' },
  { image: 'Mexico___img03.platesmania.com_200907_m_15333851.jpg', expected: 'EHR-64-43' },
  { image: 'Mexico___img03.platesmania.com_200907_m_15334110.jpg', expected: 'NCM-27-04' }
]

console.log('🔬 STANDALONE PLATE DETECTION TEST')
console.log('==================================')

for (const test of tests) {
  await standaloneTest(test.image, test.expected)
  console.log('\n' + '='.repeat(60))
}