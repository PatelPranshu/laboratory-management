const mongoose = require('mongoose');
const logger = require('../utils/logger');

const connectDB = async () => {
  const MAX_RETRIES = 5;
  let retries = 0;

  const connect = async () => {
    try {
      const conn = await mongoose.connect(process.env.MONGO_URI, {
        maxPoolSize: 50,
        serverSelectionTimeoutMS: 5000,
        socketTimeoutMS: 45000,
      });
      logger.info(`MongoDB Connected: ${conn.connection.host}`);
    } catch (error) {
      retries++;
      logger.error(`MongoDB Connection Error (attempt ${retries}/${MAX_RETRIES}): ${error.message}`);
      if (retries < MAX_RETRIES) {
        logger.info(`Retrying in 5 seconds...`);
        await new Promise(resolve => setTimeout(resolve, 5000));
        return connect();
      } else {
        logger.error('Max retries reached. Exiting.');
        process.exit(1);
      }
    }
  };

  await connect();

  // Connection event listeners
  mongoose.connection.on('error', (err) => {
    logger.error('MongoDB connection error:', err);
  });

  mongoose.connection.on('disconnected', () => {
    logger.warn('MongoDB disconnected. Attempting to reconnect...');
  });

  mongoose.connection.on('reconnected', () => {
    logger.info('MongoDB reconnected.');
  });
};

module.exports = connectDB;
