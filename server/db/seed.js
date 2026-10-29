// server/db/seed.js
const bcrypt = require('bcryptjs');
const pool = require('./index');

async function seed() {
  console.log('🚀 Starting W4Y database seed...');

  const adminName = process.env.ADMIN_NAME || 'W4Y Admin';
  const adminUsername = process.env.ADMIN_USERNAME || 'w4yadmin';
  const adminPhone = process.env.ADMIN_PHONE || '7798647265';
  const adminPassword = process.env.ADMIN_PASSWORD;

  if (!adminPassword) {
    console.error('❌ Error: ADMIN_PASSWORD environment variable is required to seed the initial admin account.');
    process.exit(1);
  }

  try {
    const adminHash = await bcrypt.hash(adminPassword, 12);

    // Upsert initial admin user
    await pool.query(
      `INSERT INTO users (name, role, department, phone, username, password_hash)
       VALUES ($1, 'admin', 'Management', $2, $3, $4)
       ON CONFLICT (username) DO UPDATE 
       SET name = EXCLUDED.name, 
           password_hash = EXCLUDED.password_hash,
           phone = EXCLUDED.phone`,
      [adminName, adminPhone, adminUsername, adminHash]
    );
    console.log(`✓ Admin user "${adminUsername}" initialized`);

    // App settings and W4Y Company details
    const settings = [
      ['office_start_time', '09:30', 'Standard office start time'],
      ['late_threshold_mins', '15', 'Minutes after start time to mark as late'],
      ['half_day_threshold_hours', '4', 'Minimum hours for a full day'],
      ['late_penalty_amount', '100', 'Flat deduction for late arrival'],
      ['half_day_penalty_percent', '50', 'Percentage deduction for half day'],
      ['late_penalty_rule_count', '3', 'Number of lates that trigger a deduction'],
      ['late_penalty_rule_days', '0.15', 'Number of days deducted per penalty trigger'],
      ['company_name', 'W4Y', 'Official Company / Brand Name'],
      ['company_address', 'Plot No. 7, New Sneh Nagar, Wardha Road, Nagpur, Maharashtra - 440015', 'Registered Business Address'],
      ['company_phone', '+91 7798647265', 'Primary Contact Phone Number'],
      ['company_email', 'contact@w4y.online', 'General Enquiry Email'],
      ['company_gst', '', 'GSTIN (Optional)'],
      ['company_website', '', 'Website (Optional)'],
      ['company_logo', '/logo.png', 'Brand Logo URL'],
      ['geofence_enabled', 'false', 'Enable geofence validation for attendance'],
      ['office_lat', '', 'Office Latitude Coordinate'],
      ['office_lng', '', 'Office Longitude Coordinate'],
      ['geofence_strict_radius', '25', 'Strict Geofence Radius in meters'],
      ['geofence_buffer_radius', '50', 'Buffer Geofence Radius in meters'],
      ['geofence_max_accuracy', '50', 'Maximum acceptable GPS accuracy in meters']
    ];

    for (const [key, val, desc] of settings) {
      await pool.query(
        'INSERT INTO app_settings (key, value, description) VALUES ($1, $2, $3) ON CONFLICT (key) DO UPDATE SET description = EXCLUDED.description',
        [key, val, desc]
      );
    }

    console.log('✅ W4Y Seeding completed successfully!');
    process.exit(0);
  } catch (err) {
    console.error('❌ Seeding failed:', err);
    process.exit(1);
  }
}

seed();
