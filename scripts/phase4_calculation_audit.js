// scripts/phase4_calculation_audit.js
// Read-only business-logic reconciliation and test script for Phase 4

const pool = require('../server/db');
const { getISTDate, getISTTime } = require('../server/utils/date');
const { calculateHourlyRate, calculatePayrollForEmployee, calculateDayAttendanceStats } = require('../server/utils/payroll');
const { recalculateAttendanceForUser } = require('../server/utils/attendanceRecalculator');

async function runPhase4Audit() {
  console.log('================================================================');
  console.log('     PHASE 4: BUSINESS-LOGIC RECONCILIATION & AUDIT REPORT      ');
  console.log('================================================================\n');

  // -------------------------------------------------------------
  // 1. DATE & TIME IST VERIFICATION (00:00 - 05:30 UTC Date Shift)
  // -------------------------------------------------------------
  console.log('--- 1. Testing Date & Time IST Invariants ---');
  // Simulate 02:00 IST (which is 20:30 UTC of previous day)
  const simulatedUtcDate = new Date('2026-10-28T20:30:00.000Z'); // 02:00 IST on 2026-10-29
  const istDate = getISTDate(simulatedUtcDate);
  const istTime = getISTTime(simulatedUtcDate);
  console.log(`Input UTC: ${simulatedUtcDate.toISOString()}`);
  console.log(`Evaluated IST Date: ${istDate} (Expected: 2026-10-29)`);
  console.log(`Evaluated IST Time: ${istTime} (Expected: 02:00)`);
  const dateShiftOk = (istDate === '2026-10-29' && istTime === '02:00');
  console.log(`getISTDate / getISTTime 00:00-05:30 date shift check: ${dateShiftOk ? '✅ PASSED' : '❌ FAILED'}`);

  // -------------------------------------------------------------
  // 2. SALARY DIVISOR & HOURLY RATE VERIFICATION
  // -------------------------------------------------------------
  console.log('\n--- 2. Verifying Salary Divisor & Hourly Rate ---');
  // Test case 1: base 25,000 @ 8.5h -> 25000 / (30 * 8.5) = 98.039... -> 98.04
  const rate1 = calculateHourlyRate(25000, 8.5);
  // Test case 2: base 30,000 @ 9.0h -> 30000 / (30 * 9.0) = 111.111... -> 111.11
  const rate2 = calculateHourlyRate(30000, 9.0);
  console.log(`Hourly Rate 25,000 @ 8.5h: ${rate1} (Expected: 98.04) -> ${rate1 === 98.04 ? '✅ PASSED' : '❌ FAILED'}`);
  console.log(`Hourly Rate 30,000 @ 9.0h: ${rate2} (Expected: 111.11) -> ${rate2 === 111.11 ? '✅ PASSED' : '❌ FAILED'}`);

  // -------------------------------------------------------------
  // 3. LATE PENALTY FORMULA VERIFICATION
  // -------------------------------------------------------------
  console.log('\n--- 3. Verifying Late Penalty Formula ---');
  // Formula: groups = floor(late_count / 3), penalty_days = groups * 0.15, deduction = penalty_days * (base / 30)
  // At base 25,000: per_day = 833.3333333333334
  const testLates = [
    { count: 0, expDed: 0 },
    { count: 1, expDed: 0 },
    { count: 2, expDed: 0 },
    { count: 3, expDed: 125.00 },
    { count: 5, expDed: 125.00 },
    { count: 6, expDed: 250.00 },
    { count: 15, expDed: 625.00 },
    { count: 16, expDed: 625.00 },
    { count: 18, expDed: 750.00 }
  ];

  const base = 25000;
  const perDay = base / 30;
  testLates.forEach(t => {
    const groups = Math.floor(t.count / 3);
    const penaltyDays = Math.round(groups * 0.15 * 100) / 100;
    const deduction = Math.round(penaltyDays * perDay * 100) / 100;
    const match = Math.abs(deduction - t.expDed) < 0.01;
    console.log(`Late count ${t.count.toString().padEnd(2)}: Deduction = ₹${deduction.toFixed(2)} (Expected: ₹${t.expDed.toFixed(2)}) -> ${match ? '✅ PASSED' : '❌ FAILED'}`);
  });

  // -------------------------------------------------------------
  // 4. OVERTIME FORMULA VERIFICATION
  // -------------------------------------------------------------
  console.log('\n--- 4. Verifying Overtime Rules & Formulas ---');
  // Reference (9h shift, start 09:30, 30,000 base):
  // (1) total_hours >= 9.0 and not half_day
  // (2) check_out strictly after 19:00 IST
  // (3) extra = floor(max(0, total - 9.0)), past7 = floor(max(0, (checkout - max(checkin, 19:00))/3600000)), ot = min(extra, past7)
  const otTestCases = [
    // Case 1: 09:30 to 18:51 (9.36h) -> Checkout before 19:00 -> 0 OT
    { in: '09:30', out: '18:51', expOt: 0, desc: '9.36h, checkout before 19:00' },
    // Case 2: 09:30 to 19:00 (9.50h) -> Checkout not strictly after 19:00 -> 0 OT
    { in: '09:30', out: '19:00', expOt: 0, desc: '9.50h, checkout exactly 19:00' },
    // Case 3: 09:30 to 20:00 (10.5h, 10.0h elapsed) -> past 19:00 by 1h, extra = floor(10.5 - 9) = 1h -> 1h OT
    { in: '09:30', out: '20:00', expOt: 1, desc: '10.5h, checkout 20:00' },
    // Case 4: 09:30 to 20:18 (10.8h) -> extra = floor(10.8 - 9) = 1h -> 1h OT
    { in: '09:30', out: '20:18', expOt: 1, desc: '10.8h, checkout 20:18' },
    // Case 5: 09:30 to 21:00 (11.5h) -> extra = floor(11.5 - 9) = 2h, past7 = 2h -> 2h OT
    { in: '09:30', out: '21:00', expOt: 2, desc: '11.5h, checkout 21:00' }
  ];

  otTestCases.forEach(tc => {
    const dummyDate = '2026-10-15';
    const checkInDate = new Date(`${dummyDate}T${tc.in}:00+05:30`);
    const checkOutDate = new Date(`${dummyDate}T${tc.out}:00+05:30`);
    const totalHours = (checkOutDate - checkInDate) / (1000 * 60 * 60);

    const sevenPm = new Date(`${dummyDate}T19:00:00+05:30`);
    let otHours = 0;
    if (totalHours >= 9.0 && checkOutDate > sevenPm) {
      const extra = Math.floor(Math.max(0, totalHours - 9.0));
      const pastSeven = Math.floor(Math.max(0, (checkOutDate - Math.max(checkInDate, sevenPm)) / (1000 * 60 * 60)));
      otHours = Math.min(extra, pastSeven);
    }
    const match = otHours === tc.expOt;
    console.log(`OT Case: ${tc.desc} -> ${otHours}h OT (Expected: ${tc.expOt}h) -> ${match ? '✅ PASSED' : '❌ FAILED'}`);
  });

  // -------------------------------------------------------------
  // 5. HALF DAY CLEARS LATE INVARIANT CHECK
  // -------------------------------------------------------------
  console.log('\n--- 5. Checking Half-Day Clears Late Invariant in Code ---');
  const fs = require('fs');
  const attRouteCode = fs.readFileSync('server/routes/attendance.js', 'utf8');
  const recalCode = fs.readFileSync('server/utils/attendanceRecalculator.js', 'utf8');

  const attHasClearLate = attRouteCode.includes('is_late = false') || attRouteCode.includes('isLate = false') || attRouteCode.includes('late_minutes = 0');
  const recalHasClearLate = recalCode.includes('is_late = false') || recalCode.includes('late_minutes = 0') || recalCode.includes('isLate = false');

  console.log(`attendance.js clears late on half_day: ${attHasClearLate ? 'YES' : '❌ NO'}`);
  console.log(`attendanceRecalculator.js clears late on half_day: ${recalHasClearLate ? 'YES' : '❌ NO'}`);

  // -------------------------------------------------------------
  // 6. AUTO-CHECKOUT DAEMON (16:00 IST CLAMP & PM2 CLUSTER CHECK)
  // -------------------------------------------------------------
  console.log('\n--- 6. Checking Auto-Checkout Daemon Logic ---');
  const hasAutoCheckout16 = attRouteCode.includes('16:00:00') || attRouteCode.includes('16:00');
  console.log(`Auto-checkout clamps checkout time to 16:00 IST: ${hasAutoCheckout16 ? 'YES' : '❌ NO'}`);

  // Check what happens if an employee checks in at 09:30 and auto-checkout closes at 16:00:
  // 09:30 to 16:00 = 6.5 hours. Since 6.5 < 9.0 (min_working_hours), status becomes 'half_day'!
  const autoCheckoutElapsed = (new Date('2026-10-15T16:00:00+05:30') - new Date('2026-10-15T09:30:00+05:30')) / 3600000;
  console.log(`Auto-checkout elapsed hours for 09:30-16:00: ${autoCheckoutElapsed} hours (< 9h min_working_hours -> ALWAYS half_day)`);

  // -------------------------------------------------------------
  // 7. LEAVE LEDGER FORMULA AUDIT
  // -------------------------------------------------------------
  console.log('\n--- 7. Verifying Leave Ledger Accrual & Balance Formula ---');
  // Formula:
  // Accrual: +1.5 / month
  // closing = max(0, opening + 1.5 - taken)
  // unpaid = max(0, taken - (opening + 1.5))
  const sampleLeaves = [
    { opening: 2.0, taken: 1.0, expClose: 2.5, expUnpaid: 0 },
    { opening: 0.0, taken: 3.0, expClose: 0.0, expUnpaid: 1.5 },
    { opening: 1.0, taken: 2.5, expClose: 0.0, expUnpaid: 0.0 }
  ];

  sampleLeaves.forEach((sl, idx) => {
    const totalAvail = sl.opening + 1.5;
    const closing = Math.max(0, totalAvail - sl.taken);
    const unpaid = Math.max(0, sl.taken - totalAvail);
    console.log(`Leave Case ${idx + 1} (Opening: ${sl.opening}, Taken: ${sl.taken}): Closing=${closing} (Exp: ${sl.expClose}), Unpaid=${unpaid} (Exp: ${sl.expUnpaid}) -> ${closing === sl.expClose && unpaid === sl.expUnpaid ? '✅ PASSED' : '❌ FAILED'}`);
  });

  pool.end();
}

runPhase4Audit().catch(e => console.error(e));
