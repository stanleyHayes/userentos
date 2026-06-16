import winston from 'winston'

const { combine, timestamp, printf, colorize } = winston.format

const devFormat = printf((info) => {
  const { level, message, timestamp } = info as { level: string; message: string; timestamp: string }
  return `${timestamp} [${level}]: ${message}`
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
