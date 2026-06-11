import winston from 'winston';
import morgan from 'morgan';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// Resolve __dirname in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Define log directory at the root of the backend
const logDir = path.join(__dirname, '../../logs');

// Create the log directory if it does not exist
if (!fs.existsSync(logDir)) {
  fs.mkdirSync(logDir, { recursive: true });
}

// Set up Winston Logger
const winstonLogger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp({
      format: 'YYYY-MM-DD HH:mm:ss'
    }),
    winston.format.errors({ stack: true }),
    winston.format.splat(),
    winston.format.json()
  ),
  defaultMeta: { service: 'engineer-app-backend' },
  transports: [
    // Write all logs with level `error` and below to `logs/error.log`
    new winston.transports.File({ filename: path.join(logDir, 'error.log'), level: 'error' }),
    // Write all logs with level `info` and below to `logs/combined.log`
    new winston.transports.File({ filename: path.join(logDir, 'combined.log') })
  ]
});

// If we're not in production then log to the console as well
if (process.env.NODE_ENV !== 'production') {
  winstonLogger.add(new winston.transports.Console({
    format: winston.format.combine(
      winston.format.colorize(),
      winston.format.printf(({ level, message, timestamp }) => {
        return `${timestamp} ${level}: ${message}`;
      })
    )
  }));
}

// Set up Morgan middleware
// Morgan will log every HTTP request and we redirect its output to Winston
const morganMiddleware = morgan('dev', {
  stream: {
    write: (message) => winstonLogger.info(message.trim())
  }
});

// Export morgan middleware as default (so `app.use(logger)` in server.js uses Morgan)
export default morganMiddleware;
// Export winston if you want to manually log errors in other files:
// import { log } from '../middleware/logger.js';
export const log = winstonLogger;
