const mongoose = require('mongoose');
require('dotenv').config({ path: './.env' });

const User = require('./models/User');
const Patient = require('./models/Patient');
const ReportInstance = require('./models/ReportInstance');

const syncStats = async () => {
  try {
    console.log('Connecting to database...');
    await mongoose.connect(process.env.MONGO_URI);
    console.log('Connected successfully.\n');

    const admins = await User.find({ role: 'Admin' });
    console.log(`Found ${admins.length} lab admins. Starting synchronization...\n`);

    for (const admin of admins) {
      const adminId = admin._id;
      console.log(`Syncing stats for Lab: ${admin.labName} (${adminId})...`);

      const totalPatients = await Patient.countDocuments({ doctorId: adminId });
      const totalReports = await ReportInstance.countDocuments({ doctorId: adminId });
      const pendingReports = await ReportInstance.countDocuments({ 
        doctorId: adminId, 
        status: 'draft' 
      });
      const sentReports = await ReportInstance.countDocuments({ 
        doctorId: adminId, 
        status: 'sent' 
      });

      // Recount weekly activity
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
      const weeklyReportsAgg = await ReportInstance.aggregate([
        { $match: { doctorId: adminId, createdAt: { $gte: sevenDaysAgo } } },
        {
          $group: {
            _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
            count: { $sum: 1 }
          }
        },
        { $sort: { _id: 1 } }
      ]);
      const weeklyReports = weeklyReportsAgg.map(day => ({ date: day._id, count: day.count }));

      await User.findByIdAndUpdate(adminId, {
        stats: {
          totalPatients,
          totalReports,
          pendingReports,
          sentReports,
          weeklyReports
        }
      });

      console.log(`- Patients: ${totalPatients}`);
      console.log(`- Reports: ${totalReports} (Pending: ${pendingReports}, Sent: ${sentReports})`);
      console.log(`- Weekly Data Points: ${weeklyReports.length}`);
      console.log(`Done.\n`);
    }

    console.log('All dashboard statistics have been synchronized successfully!');
    process.exit(0);
  } catch (err) {
    console.error('Synchronization failed:', err.message);
    process.exit(1);
  }
};

syncStats();
