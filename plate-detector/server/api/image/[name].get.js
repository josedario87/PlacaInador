import fs from 'fs/promises'
import path from 'path'

export default defineEventHandler(async (event) => {
  try {
    const imageName = getRouterParam(event, 'name')
    
    if (!imageName) {
      throw createError({
        statusCode: 400,
        statusMessage: 'Nombre de imagen no proporcionado'
      })
    }
    
    const decodedName = decodeURIComponent(imageName)
    const imagePath = path.join(process.cwd(), '..', 'test-dataset', decodedName)
    
    const imageBuffer = await fs.readFile(imagePath)
    
    const extension = path.extname(decodedName).toLowerCase()
    let contentType = 'image/jpeg'
    
    if (extension === '.png') {
      contentType = 'image/png'
    } else if (extension === '.gif') {
      contentType = 'image/gif'
    }
    
    setHeader(event, 'Content-Type', contentType)
    setHeader(event, 'Cache-Control', 'public, max-age=3600')
    
    return imageBuffer
  } catch (error) {
    console.error('Error serving image:', error)
    throw createError({
      statusCode: 404,
      statusMessage: 'Imagen no encontrada'
    })
  }
})