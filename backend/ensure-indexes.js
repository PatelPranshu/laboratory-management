const mongoose = require('mongoose');
require('dotenv').config({ path: './backend/.env' });

const ensureIndexes = async () => {
  try {
    console.log('Connecting to database...');
    await mongoose.connect(process.env.MONGO_URI);
    console.log('Connected successfully.\n');

    console.log('--- Optimizing Patient Collection ---');
    const Patient = mongoose.model('Patient', new mongoose.Schema({}));
    await Patient.collection.createIndex({ doctorId: 1, createdAt: -1 });
    await Patient.collection.createIndex({ doctorId: 1, name: 1 });
    await Patient.collection.createIndex({ doctorId: 1, phone: 1 });
    console.log('Patient indexes created.\n');

    console.log('--- Optimizing ReportInstance Collection ---');
    const ReportInstance = mongoose.model('ReportInstance', new mongoose.Schema({}));
    await ReportInstance.collection.createIndex({ doctorId: 1, createdAt: -1 });
    await ReportInstance.collection.createIndex({ doctorId: 1, status: 1 });
    await ReportInstance.collection.createIndex({ patientId: 1 });
    console.log('ReportInstance indexes created.\n');

    console.log('Database optimization completed successfully! Your site is now ready for high traffic.');
    process.exit(0);
  } catch (err) {
    console.error('Index creation failed:', err.message);
    process.exit(1);
  }
};

ensureIndexes();
