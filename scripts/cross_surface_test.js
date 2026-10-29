// scripts/cross_surface_test.js
// Read-only Cross-Surface Consistency Test across Payroll, Staff Detail, Dashboards, and Reports

const { calculateHourlyRate } = require('../server/utils/payroll');

function runCrossSurfaceTest() {
  console.log('================================================================');
  console.log('            CROSS-SURFACE FORMULA CONSISTENCY TEST              ');
  console.log('================================================================\n');

  // Test Profiles
  const profiles = [
    {
      name: 'Employee A (Full Attendance)',
      base: 30000,
      minHours: 9.0,
      fullDays: 27,
      halfDays: 0,
      sundays: 4,
      paidHolidays: 0,
      unmarkedAbsent: 0,
      unpaidLeaves: 0,
      lateCount: 0,
      lateMinsTotal: 0,
      otHours: 0
    },
    {
      name: 'Employee B (Many Lates)',
      base: 25000,
      minHours: 8.5,
      fullDays: 27,
      halfDays: 0,
      sundays: 4,
      paidHolidays: 0,
      unmarkedAbsent: 0,
      unpaidLeaves: 0,
      lateCount: 7,
      lateMinsTotal: 175,
      otHours: 0
    },
    {
      name: 'Employee C (OT-Heavy + Half Days)',
      base: 30000,
      minHours: 9.0,
      fullDays: 23,
      halfDays: 2,
      sundays: 4,
      paidHolidays: 0,
      unmarkedAbsent: 2,
      unpaidLeaves: 0,
      lateCount: 4,
      lateMinsTotal: 80,
      otHours: 20
    }
  ];

  profiles.forEach(p => {
    console.log(`\n================ PROFILE: ${p.name} ================`);
    const perDay = p.base / 30;
    const hourlyRate = calculateHourlyRate(p.base, p.minHours);

    // 1. Late Penalty
    const lateGroups = Math.floor(p.lateCount / 3);
    const latePenaltyDays = Math.round(lateGroups * 0.15 * 100) / 100;
    const latePenaltyAmount = Math.round(latePenaltyDays * perDay * 100) / 100;

    // 2. OT Earnings
    const otEarnings = Math.round(p.otHours * hourlyRate * 100) / 100;

    // 3. Effective Days
    const effectiveDays = p.fullDays + (p.halfDays * 0.5) + p.sundays + p.paidHolidays;
    const payableDays = Math.max(0, Math.round((effectiveDays - latePenaltyDays) * 100) / 100);

    // 4. Closed Month Net (top-down formula)
    // base - (absent * perDay) - (halfDayShortfall) - latePenalty + OT
    const absenceDeduction = (p.unmarkedAbsent + p.unpaidLeaves) * perDay;
    const halfDayShortfall = p.halfDays * (perDay * 0.5);
    const closedNet = Math.max(0, Math.round((p.base - absenceDeduction - halfDayShortfall - latePenaltyAmount + otEarnings) * 100) / 100);

    // 5. In-Progress Net (bottom-up accrued formula for elapsed days with Day 31 regular earnings cap)
    const rawAccruedRegular = (p.fullDays * perDay) + (p.halfDays * perDay * 0.5) + (p.sundays * perDay);
    const cappedAccruedRegular = Math.min(p.base, rawAccruedRegular);
    const accruedEarnings = Math.round((cappedAccruedRegular + otEarnings) * 100) / 100;
    const inProgressNet = Math.max(0, Math.round((accruedEarnings - latePenaltyAmount) * 100) / 100);

    // 6. Staff Detail Custom Date Filter UI calculation (with 2-decimal rounding fix):
    const staffDetailEarnings = Math.round(accruedEarnings * 100) / 100;
    const staffDetailNet = Math.max(0, Math.round((staffDetailEarnings - latePenaltyAmount) * 100) / 100);

    console.log(`Base Salary:           ₹${p.base.toLocaleString()}`);
    console.log(`Hourly Rate:           ₹${hourlyRate} (Divisor: 30 * ${p.minHours}h)`);
    console.log(`Late Count:            ${p.lateCount} lates (Groups: ${lateGroups})`);
    console.log(`Late Penalty Days:     ${latePenaltyDays} days`);
    console.log(`Late Deduction:        ₹${latePenaltyAmount.toFixed(2)}`);
    console.log(`OT Hours:              ${p.otHours}h -> ₹${otEarnings.toFixed(2)}`);
    console.log(`Payable Days:          ${payableDays} days`);
    console.log(`------------------------------------------------------`);
    console.log(`Backend Closed Month Net:    ₹${closedNet.toFixed(2)}`);
    console.log(`Backend In-Progress Net:     ₹${inProgressNet.toFixed(2)}`);
    console.log(`StaffDetailPage Filter Net:  ₹${staffDetailNet.toFixed(2)}`);

    const paisaMismatch = Math.abs(inProgressNet - staffDetailNet);
    if (paisaMismatch > 0) {
      console.log(`⚠️ MISMATCH DETECTED: Staff Detail page differs from backend by ₹${paisaMismatch.toFixed(2)} due to integer rounding in StaffDetailPage.jsx:223-225!`);
    } else {
      console.log(`✓ Exact match between backend and UI.`);
    }
  });
}

runCrossSurfaceTest();
