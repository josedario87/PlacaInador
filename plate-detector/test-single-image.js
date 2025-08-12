#!/usr/bin/env node

import fs from 'fs/promises'
import path from 'path'
import { fileURLToPath } from 'url'
import fetch from 'node-fetch'
import FormData from 'form-data'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

async function testSingleImage(imageName) {
  const imagePath = path.join(__dirname, '..', 'test-dataset', imageName)
  
  try {
    // Check if file exists
    await fs.access(imagePath)
    console.log(`✓ Found image: ${imageName}`)
    
    // Read the image
    const imageBuffer = await fs.readFile(imagePath)
    console.log(`✓ Image loaded: ${imageBuffer.length} bytes`)
    
    // Create form data
    const formData = new FormData()
    formData.append('image', imageBuffer, {
      filename: imageName,
      contentType: 'image/jpeg'
    })
    
    console.log('📤 Sending to API...')
    
    // Send to our API
    const response = await fetch('http://localhost:3000/api/analyze-plate', {
      method: 'POST',
      body: formData
    })
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`)
    }
    
    const result = await response.json()
    
    console.log('\n🔍 ANALYSIS RESULTS:')
    console.log('===================')
    console.log(`Has Vehicle: ${result.hasVehicle}`)
    console.log(`Vehicle Type: ${result.vehicleType || 'N/A'}`)
    console.log(`Vehicle Confidence: ${(result.vehicleConfidence * 100).toFixed(1)}%`)
    console.log(`Has Plate: ${result.hasPlate}`)
    console.log(`Plate Text: ${result.plateText || 'N/A'}`)
    console.log(`Plate Confidence: ${(result.plateConfidence * 100).toFixed(1)}%`)
    console.log(`Processing Method: ${result.processingMethod || 'N/A'}`)
    console.log(`Processing Time: ${result.processingTimeMs}ms`)
    
    if (result.debug) {
      console.log('\n🐛 DEBUG INFO:')
      console.log(`Vehicle Detections: ${result.debug.vehicleDetections}`)
      console.log(`Plate Candidates: ${result.debug.plateCandidates}`)
      if (result.debug.alternativePlates?.length > 0) {
        console.log('Alternative plates:')
        result.debug.alternativePlates.forEach((alt, i) => {
          console.log(`  ${i + 1}. ${alt.text} (${(alt.confidence * 100).toFixed(1)}%)`)
        })
      }
    }
    
  } catch (error) {
    console.error('❌ Error:', error.message)
  }
}

// Test the standalone plate image first
const testImage = 'Mexico___img03.platesmania.com_200907_m_15334170.jpg'
console.log(`🧪 Testing PlateVision AI with: ${testImage}`)
console.log('Expected result: GZW-002-A')
console.log('Current result: No vehicle, no plate\n')

testSingleImage(testImage)