#!/usr/bin/env node

// Simple test to check if our changes work
import sharp from 'sharp'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

async function simpleTest() {
  try {
    const imagePath = path.join(__dirname, '..', 'test-dataset', 'Mexico___img03.platesmania.com_200907_m_15334170.jpg')
    
    console.log('Testing Sharp processing...')
    
    const metadata = await sharp(imagePath).metadata()
    console.log(`✓ Image metadata: ${metadata.width}x${metadata.height}`)
    
    // Test basic processing
    const testPath = imagePath.replace('.jpg', '_test.jpg')
    await sharp(imagePath)
      .greyscale()
      .resize({ width: 600, fit: 'inside', withoutEnlargement: false })
      .normalize()
      .modulate({ brightness: 1.1, contrast: 1.8 })
      .sharpen()
      .toFile(testPath)
    
    console.log('✓ Basic processing works')
    
    // Test our patterns
    const testText = "SZH-002-"
    console.log(`Testing patterns with: "${testText}"`)
    
    const patterns = [
      /[A-Z]{3}-?\d{3}-?[A-Z]?/g,
      /[A-Z]{3}-?\d{3}-?/g
    ]
    
    patterns.forEach((pattern, i) => {
      const matches = testText.match(pattern)
      console.log(`Pattern ${i+1}: ${matches ? matches.join(', ') : 'no matches'}`)
    })
    
    console.log('✅ All basic tests passed')
    
  } catch (error) {
    console.error('❌ Error:', error.message)
    console.error(error.stack)
  }
}

simpleTest()