require('dotenv').config();
const mongoose = require('mongoose');
const { processExports } = require('../utils/exportWorker');

async function run() {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log('Connected to MongoDB.');
    await processExports();
    console.log('Done processing exports.');
  } catch (err) {
    console.error(err);
  } finally {
    await mongoose.disconnect();
    process.exit(0);
  }
}

run();
