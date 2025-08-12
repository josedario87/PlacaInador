#!/usr/bin/env node

import fs from 'fs/promises'
import path from 'path'
import { fileURLToPath } from 'url'
import fetch from 'node-fetch'
import FormData from 'form-data'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

async function testSimpleEndpoint(imageName, expectedPlate) {
  const imagePath = path.join(__dirname, '..', 'test-dataset', imageName)
  
  try {
    console.log(`🧪 Testing: ${imageName}`)
    console.log(`Expected: ${expectedPlate}`)
    console.log('=' .repeat(50))
    
    // Check if file exists
    await fs.access(imagePath)
    
    // Read the image
    const imageBuffer = await fs.readFile(imagePath)
    console.log(`✓ Image loaded: ${imageBuffer.length} bytes`)
    
    // Create form data
    const formData = new FormData()
    formData.append('image', imageBuffer, {
      filename: imageName,
      contentType: 'image/jpeg'
    })
    
    console.log('📤 Sending to simplified API...')
    
    // Send to our simplified API
    const response = await fetch('http://localhost:3000/api/analyze-plate-simple', {
      method: 'POST',
      body: formData
    })
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`)
    }
    
    const result = await response.json()
    
    console.log('\n🔍 ANALYSIS RESULTS:')
    console.log('===================')
    console.log(`Has Plate: ${result.hasPlate}`)
    console.log(`Plate Text: ${result.plateText || 'N/A'}`)
    console.log(`Confidence: ${(result.plateConfidence * 100).toFixed(1)}%`)
    console.log(`Processing Method: ${result.processingMethod || 'N/A'}`)
    console.log(`Processing Time: ${result.processingTimeMs}ms`)
    
    if (result.debug?.alternativePlates?.length > 0) {
      console.log('\n📋 Alternative candidates:')
      result.debug.alternativePlates.forEach((alt, i) => {
        console.log(`  ${i + 1}. ${alt.text} (${(alt.confidence * 100).toFixed(1)}%)`)
      })
    }
    
    // Check if result matches expected
    if (result.hasPlate && result.plateText) {
      const cleanExpected = expectedPlate.replace(/[-\s]/g, '').toUpperCase()
      const cleanFound = result.plateText.replace(/[-\s]/g, '').toUpperCase()
      
      const isCorrect = cleanFound === cleanExpected || 
                       cleanFound.includes(cleanExpected.substring(0, 6)) ||
                       cleanExpected.includes(cleanFound.substring(0, 6))
      
      console.log(`\n🏆 RESULT: ${isCorrect ? '✅ SUCCESS' : '❌ MISMATCH'}`)
      if (!isCorrect) {
        console.log(`   Expected: ${expectedPlate}`)
        console.log(`   Found: ${result.plateText}`)
      }
    } else {
      console.log('\n🏆 RESULT: ❌ NO PLATE DETECTED')
    }
    
  } catch (error) {
    console.error('❌ Error:', error.message)
  }
}

// Test with our problematic images
const tests = [
  { image: 'Mexico___img03.platesmania.com_200907_m_15334170.jpg', expected: 'GZW-002-A' },
  { image: 'Mexico___img03.platesmania.com_200907_m_15333851.jpg', expected: 'EHR-64-43' },
  { image: 'Mexico___img03.platesmania.com_200907_m_15334110.jpg', expected: 'NCM-27-04' }
]

console.log('🚀 TESTING SIMPLIFIED PLATE DETECTION API')
console.log('=========================================\n')

for (const test of tests) {
  await testSimpleEndpoint(test.image, test.expected)
  console.log('\n' + '='.repeat(60) + '\n')
}