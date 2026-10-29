const path = require('path');
const readline = require('readline');

// Load environment variables from server directory
require('dotenv').config({ path: path.join(__dirname, '..', 'server', '.env') });

const pool = require('../server/db');
const { executeFactoryReset, getResetPreview } = require('../server/utils/factoryReset');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

async function run() {
  console.log('🚀 W4Y CLI Factory Reset Utility');
  console.log('────────────────────────────────');

  // Check for confirmation flag
  const args = process.argv.slice(2);
  const isConfirmed = args.includes('--confirm=RESET');

  try {
    // 1. Get Preview
    console.log('📊 Fetching data preview...');
    const counts = await getResetPreview(pool);
    
    console.log('\nThe following will be PERMANENTLY DELETED:');
    Object.entries(counts).forEach(([key, count]) => {
      console.log(`  - ${key.padEnd(20)}: ${count.toLocaleString()} records`);
    });
    console.log('  - Physical Uploads    : All files in uploads/projects/ and uploads/expenses/');
    
    console.log('\nThe following will be PRESERVED:');
    console.log('  - User Accounts, App Settings, Holidays, DB Schema\n');

    if (!isConfirmed) {
      console.log('❌ ERROR: Safety flag missing.');
      console.log('To execute the reset, run with: node scripts/factory_reset.js --confirm=RESET');
      process.exit(1);
    }

    // 2. Final Prompt
    rl.question('⚠️  CRITICAL: Are you absolutely sure? This cannot be undone. Type "PURGE" to execute: ', async (answer) => {
      if (answer !== 'PURGE') {
        console.log('❌ Aborted. Confirmation text did not match.');
        process.exit(0);
      }

      console.log('\n🔥 Executing Purge...');
      try {
        const summary = await executeFactoryReset(pool);
        
        console.log('\n✅ FACTORY RESET COMPLETE');
        console.log('────────────────────────');
        console.log(`Records Purged: ${Object.values(summary.tablesCleared).reduce((a, b) => a + b, 0).toLocaleString()}`);
        console.log(`Files Deleted : ${summary.filesDeleted}`);
        console.log(`Timestamp     : ${summary.timestamp}`);
        
        process.exit(0);
      } catch (err) {
        console.error('\n❌ FATAL ERROR during reset:', err.message);
        process.exit(1);
      }
    });

  } catch (err) {
    console.error('❌ Failed to initialize reset:', err.message);
    process.exit(1);
  }
}

run();
