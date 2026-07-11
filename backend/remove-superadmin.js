const mongoose = require('mongoose');
require('dotenv').config();
const User = require('./models/User');

const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/lis_db';

mongoose.connect(MONGO_URI)
  .then(async () => {
    console.log('Connected to Database.');
    
    // Find and delete the Super Admin
    const result = await User.deleteMany({ role: 'SuperAdmin' });
    
    if (result.deletedCount > 0) {
      console.log(`Successfully removed ${result.deletedCount} Super Admin(s).`);
      console.log('You can now go to /setup-superadmin.html to create a new one!');
    } else {
      console.log('No Super Admin found in the database. You are ready to create one.');
    }
    
    process.exit(0);
  })
  .catch((err) => {
    console.error('Error connecting to DB:', err);
    process.exit(1);
  });
