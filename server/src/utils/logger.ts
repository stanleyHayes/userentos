import winston from 'winston'

const { combine, timestamp, printf, colorize } = winston.format

const devFormat = printf((info) => {
  const { level, message, timestamp, stack, ...meta } = info as {
    level: string
    message: string
    timestamp: string
    stack?: string
  }
  // Render trailing metadata (e.g. { stack } passed to logger.error) instead of dropping it
  let line = `${timestamp} [${level}]: ${message}`
  if (Object.keys(meta).length > 0) line += ` ${JSON.stringify(meta)}`
  if (stack) line += `\n${stack}`
  return line
})

export const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: combine(
    timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    devFormat,
  ),
  transports: [
    new winston.transports.Console({
      format: combine(
        colorize(),
        timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
        devFormat,
      ),
    }),
  ],
})
