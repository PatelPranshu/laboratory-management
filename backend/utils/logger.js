const winston = require('winston');

const { combine, timestamp, printf, colorize, errors, json } = winston.format;

// Custom log format for console
const consoleFormat = printf(({ level, message, timestamp, stack }) => {
  return `${timestamp} ${level}: ${stack || message}`;
});

const transports = [
  new winston.transports.Console()
];

if (process.env.DD_API_KEY) {
  transports.push(new winston.transports.Http({
    host: `http-intake.logs.${process.env.DD_SITE || 'datadoghq.com'}`,
    path: `/api/v2/logs?dd-api-key=${process.env.DD_API_KEY}&ddsource=nodejs&service=mypatholabs-server`,
    ssl: true
  }));
}

const logger = winston.createLogger({
  level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
  defaultMeta: {
    service: 'mypatholabs-server',
    env: process.env.NODE_ENV || 'production',
    version: process.env.npm_package_version || '1.0.0'
  },
  format: combine(
    errors({ stack: true }),
    timestamp(),
    json()
  ),
  transports
});

// Create a stream object for Morgan
logger.stream = {
  write: (message) => {
    logger.info(message.trim());
  }
};

module.exports = logger;
