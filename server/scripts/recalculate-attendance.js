// server/scripts/recalculate-attendance.js
const { recalculateAttendanceForAll } = require('../utils/attendanceRecalculator');
const { getISTDate } = require('../utils/date');

async function run() {
  const fromDate = process.argv[2] || null;
  const toDate = process.argv[3] || null;

  console.log(`Recalculating attendance status${fromDate ? ` from: ${fromDate}` : ''}${toDate ? ` to: ${toDate}` : ''}...`);

  const result = await recalculateAttendanceForAll({ fromDate, toDate });

  console.log(`Recalculation complete! Processed ${result.recalculatedCount} records across ${result.affectedUsersCount} users.`);
  process.exit(0);
}

run().catch(err => {
  console.error('Error during recalculation:', err);
  process.exit(1);
});
