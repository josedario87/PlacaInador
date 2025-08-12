#!/usr/bin/env node

import fs from 'fs/promises'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// Import our analyze function (we'll need to adapt it)
async function testImages() {
  const testDatasetPath = path.join(__dirname, '..', 'test-dataset')
  
  try {
    const files = await fs.readdir(testDatasetPath)
    const imageFiles = files.filter(file => file.toLowerCase().endsWith('.jpg')).slice(0, 5)
    
    console.log(`Testing with ${imageFiles.length} images from dataset...`)
    
    for (const file of imageFiles) {
      console.log(`\n--- Testing: ${file} ---`)
      const imagePath = path.join(testDatasetPath, file)
      
      try {
        // Create a FormData-like object for testing
        const imageBuffer = await fs.readFile(imagePath)
        
        // We would call our analysis function here
        console.log(`Image size: ${imageBuffer.length} bytes`)
        console.log('✓ Image loaded successfully')
        
        // TODO: Call actual analysis function when server is running
        
      } catch (error) {
        console.error(`✗ Error processing ${file}:`, error.message)
      }
    }
    
  } catch (error) {
    console.error('Error reading test dataset:', error.message)
  }
}

// Expected plate texts for validation (based on the images we saw)
const expectedResults = {
  'Mexico___img03.platesmania.com_200907_m_15334110.jpg': 'NCM-27-04',
  'Mexico___img03.platesmania.com_200907_m_15334165.jpg': 'ELD-94-06',
  'Mexico___img03.platesmania.com_200907_m_15334170.jpg': 'GZW-002-A'
}

console.log('PlateVision AI - Test Script')
console.log('============================')
console.log('Expected results for validation:')
Object.entries(expectedResults).forEach(([file, plate]) => {
  console.log(`${file}: ${plate}`)
})

testImages()