const winston = require('winston');

const { combine, timestamp, printf, colorize, errors } = winston.format;

// Custom log format for console
const consoleFormat = printf(({ level, message, timestamp, stack }) => {
  return `${timestamp} ${level}: ${stack || message}`;
});

const logger = winston.createLogger({
  level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
  format: combine(
    errors({ stack: true }), // Capture stack traces
    timestamp({ format: 'YYYY-MM-DD HH:mm:ss' })
  ),
  transports: [
    new winston.transports.Console({
      format: combine(
        colorize(),
        consoleFormat
      )
    })
  ]
});

// Create a stream object for Morgan
logger.stream = {
  write: (message) => {
    logger.info(message.trim());
  }
};

module.exports = logger;
