import fs from 'fs/promises'
import path from 'path'
import { broadcastToSession } from '../api/websocket.js'

/**
 * ProcessingLogger - Módulo para manejo de logs y captura de imágenes procesadas
 * 
 * Este módulo proporciona una interfaz unificada para:
 * - Enviar logs en tiempo real al frontend
 * - Capturar y guardar imágenes procesadas
 * - Gestionar el estado de una sesión de procesamiento
 */
export class ProcessingLogger {
  constructor(sessionId) {
    this.sessionId = sessionId
    this.logs = []
    this.processedImages = []
    this.startTime = Date.now()
  }

  /**
   * Envía un log al frontend y lo almacena localmente
   * @param {string} message - Mensaje del log
   * @param {string} type - Tipo de log: 'info', 'success', 'warning', 'error'
   * @param {Object} metadata - Metadatos adicionales (opcional)
   */
  log(message, type = 'info', metadata = {}) {
    const logEntry = {
      timestamp: new Date().toISOString(),
      message,
      type,
      sessionId: this.sessionId,
      ...metadata
    }
    
    this.logs.push(logEntry)
    console.log(`[${type.toUpperCase()}] ${message}`)
    
    // Enviar log via WebSocket en tiempo real
    broadcastToSession(this.sessionId, {
      type: 'log',
      ...logEntry
    })
  }

  /**
   * Log de información general
   * @param {string} message - Mensaje informativo
   * @param {Object} metadata - Metadatos adicionales
   */
  info(message, metadata = {}) {
    this.log(message, 'info', metadata)
  }

  /**
   * Log de operación exitosa
   * @param {string} message - Mensaje de éxito
   * @param {Object} metadata - Metadatos adicionales
   */
  success(message, metadata = {}) {
    this.log(message, 'success', metadata)
  }

  /**
   * Log de advertencia
   * @param {string} message - Mensaje de advertencia
   * @param {Object} metadata - Metadatos adicionales
   */
  warning(message, metadata = {}) {
    this.log(message, 'warning', metadata)
  }

  /**
   * Log de error
   * @param {string} message - Mensaje de error
   * @param {Object} metadata - Metadatos adicionales
   */
  error(message, metadata = {}) {
    this.log(message, 'error', metadata)
  }

  /**
   * Guarda una imagen procesada y la envía al frontend
   * @param {Buffer} imageBuffer - Buffer de la imagen
   * @param {string} stepName - Nombre del paso de procesamiento
   * @param {string} description - Descripción de la imagen procesada
   * @returns {Object|null} - Información de la imagen guardada o null si hay error
   */
  async saveProcessedImage(imageBuffer, stepName, description) {
    try {
      const filename = `${this.sessionId}_${stepName}_${Date.now()}.jpg`
      const publicPath = path.join(process.cwd(), 'public', 'processing', filename)
      
      // Asegurar que el directorio existe
      await fs.mkdir(path.dirname(publicPath), { recursive: true })
      
      // Guardar la imagen
      await fs.writeFile(publicPath, imageBuffer)
      
      const processedImage = {
        filename,
        url: `/processing/${filename}`,
        description,
        stepName,
        timestamp: new Date().toISOString(),
        sessionId: this.sessionId
      }
      
      this.processedImages.push(processedImage)
      
      // Enviar imagen via WebSocket
      broadcastToSession(this.sessionId, {
        type: 'processed_image',
        ...processedImage
      })
      
      this.info(`📸 Imagen procesada guardada: ${description}`)
      
      return processedImage
    } catch (error) {
      this.error(`❌ Error guardando imagen procesada: ${error.message}`)
      return null
    }
  }

  /**
   * Marca el progreso de una operación
   * @param {string} operation - Nombre de la operación
   * @param {number} current - Valor actual
   * @param {number} total - Valor total
   * @param {string} unit - Unidad de medida (opcional)
   */
  progress(operation, current, total, unit = '') {
    const percentage = Math.round((current / total) * 100)
    this.info(`📊 ${operation}: ${current}/${total} ${unit} (${percentage}%)`, {
      operation,
      current,
      total,
      percentage,
      unit
    })
    
    // Enviar progreso específico via WebSocket
    broadcastToSession(this.sessionId, {
      type: 'progress',
      operation,
      current,
      total,
      percentage,
      unit,
      sessionId: this.sessionId
    })
  }

  /**
   * Registra el tiempo transcurrido desde el inicio
   * @param {string} operation - Operación completada (opcional)
   */
  timing(operation = 'Procesamiento') {
    const elapsed = Date.now() - this.startTime
    this.info(`⏱️ ${operation} completado en ${elapsed}ms`, {
      operation,
      elapsedMs: elapsed,
      elapsedSeconds: elapsed / 1000
    })
  }

  /**
   * Finaliza la sesión de logging
   */
  finish() {
    this.timing('Análisis total')
    
    // Enviar resumen final
    broadcastToSession(this.sessionId, {
      type: 'session_complete',
      sessionId: this.sessionId,
      totalLogs: this.logs.length,
      totalImages: this.processedImages.length,
      duration: Date.now() - this.startTime,
      logs: this.logs,
      processedImages: this.processedImages
    })
  }

  /**
   * Obtiene todos los logs de la sesión
   * @returns {Array} - Array de logs
   */
  getLogs() {
    return [...this.logs]
  }

  /**
   * Obtiene todas las imágenes procesadas de la sesión
   * @returns {Array} - Array de imágenes procesadas
   */
  getProcessedImages() {
    return [...this.processedImages]
  }

  /**
   * Obtiene estadísticas de la sesión
   * @returns {Object} - Estadísticas de la sesión
   */
  getStats() {
    const logsByType = this.logs.reduce((acc, log) => {
      acc[log.type] = (acc[log.type] || 0) + 1
      return acc
    }, {})

    return {
      sessionId: this.sessionId,
      startTime: this.startTime,
      duration: Date.now() - this.startTime,
      totalLogs: this.logs.length,
      logsByType,
      totalImages: this.processedImages.length,
      imagesByStep: this.processedImages.reduce((acc, img) => {
        acc[img.stepName] = (acc[img.stepName] || 0) + 1
        return acc
      }, {})
    }
  }

  /**
   * Limpia archivos temporales de imágenes (opcional)
   * @param {number} maxAge - Edad máxima en milisegundos (default: 1 hora)
   */
  static async cleanupOldImages(maxAge = 60 * 60 * 1000) {
    try {
      const processingDir = path.join(process.cwd(), 'public', 'processing')
      const files = await fs.readdir(processingDir)
      const now = Date.now()

      for (const file of files) {
        const filePath = path.join(processingDir, file)
        const stats = await fs.stat(filePath)
        
        if (now - stats.mtime.getTime() > maxAge) {
          await fs.unlink(filePath)
          console.log(`Cleaned up old processed image: ${file}`)
        }
      }
    } catch (error) {
      console.error('Error cleaning up old images:', error)
    }
  }
}

/**
 * Factory function para crear un logger de procesamiento
 * @param {string} sessionId - ID único de la sesión
 * @returns {ProcessingLogger} - Instancia del logger
 */
export function createProcessingLogger(sessionId) {
  return new ProcessingLogger(sessionId)
}

/**
 * Tipos de log disponibles
 */
export const LOG_TYPES = {
  INFO: 'info',
  SUCCESS: 'success',
  WARNING: 'warning',
  ERROR: 'error'
}

/**
 * Pasos de procesamiento comunes
 */
export const PROCESSING_STEPS = {
  ORIGINAL: 'original',
  CROPPED: 'cropped',
  FOCUSED: 'focused',
  HIGH_CONTRAST: 'high_contrast',
  EDGE_ENHANCED: 'edge_enhanced',
  UPSCALED: 'upscaled',
  OCR_RESULT: 'ocr_result'
}