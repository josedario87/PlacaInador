import fs from 'fs/promises'
import path from 'path'

export default defineEventHandler(async (event) => {
  try {
    const testDatasetPath = path.join(process.cwd(), '..', 'test-dataset')
    
    const files = await fs.readdir(testDatasetPath)
    
    const imageFiles = files
      .filter(file => file.endsWith('.jpg') || file.endsWith('.jpeg') || file.endsWith('.png'))
      .sort()
      .map(filename => ({
        name: filename,
        url: `/api/image/${encodeURIComponent(filename)}`
      }))
    
    return {
      success: true,
      images: imageFiles,
      total: imageFiles.length
    }
  } catch (error) {
    console.error('Error reading images:', error)
    throw createError({
      statusCode: 500,
      statusMessage: 'Error al leer las imágenes'
    })
  }
})