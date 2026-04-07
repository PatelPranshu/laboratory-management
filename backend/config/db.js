const mongoose = require('mongoose');

const connectDB = async () => {
  const MAX_RETRIES = 5;
  let retries = 0;

  const connect = async () => {
    try {
      const conn = await mongoose.connect(process.env.MONGO_URI);
      console.log(`MongoDB Connected: ${conn.connection.host}`);
    } catch (error) {
      retries++;
      console.error(`MongoDB Connection Error (attempt ${retries}/${MAX_RETRIES}): ${error.message}`);
      if (retries < MAX_RETRIES) {
        console.log(`Retrying in 5 seconds...`);
        await new Promise(resolve => setTimeout(resolve, 5000));
        return connect();
      } else {
        console.error('Max retries reached. Exiting.');
        process.exit(1);
      }
    }
  };

  await connect();

  // Connection event listeners
  mongoose.connection.on('error', (err) => {
    console.error('MongoDB connection error:', err.message);
  });

  mongoose.connection.on('disconnected', () => {
    console.warn('MongoDB disconnected. Attempting to reconnect...');
  });

  mongoose.connection.on('reconnected', () => {
    console.log('MongoDB reconnected.');
  });
};

module.exports = connectDB;
