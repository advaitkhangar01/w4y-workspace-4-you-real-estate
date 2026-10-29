// server/tests/payrollDeductions.test.js
const pool = require('../db');
const { calculatePayrollForEmployee } = require('../utils/payroll');
const { calculateSalaryStats } = require('../routes/dashboard');

describe('Payroll Late-Arrival & Deduction Logic Tests', () => {
  let testUserId;

  beforeAll(async () => {
    // Create test user with ₹25,000 monthly base salary
    const { rows } = await pool.query(
      `INSERT INTO users (name, username, password_hash, role, base_salary, hourly_rate)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id`,
      [`Test Employee ${Date.now()}`, `test_emp_${Date.now()}`, 'hash123', 'employee', 25000.00, 0.00]
    );
    testUserId = rows[0].id;
  });

  afterAll(async () => {
    if (testUserId) {
      await pool.query('DELETE FROM attendance WHERE user_id = $1', [testUserId]);
      await pool.query('DELETE FROM users WHERE id = $1', [testUserId]);
    }
  });

  afterEach(async () => {
    if (testUserId) {
      await pool.query('DELETE FROM attendance WHERE user_id = $1', [testUserId]);
    }
  });

  const defaultSettings = {
    office_start_time: '10:00',
    late_threshold_time: '10:15',
    half_day_cutoff_time: '13:00',
    late_penalty_rule_count: '3',
    late_penalty_rule_days: '0.15',
    half_day_penalty_percent: '50'
  };

  test('3 lates should trigger 0.15 day deduction', async () => {
    // Insert 3 late attendance records in Aug 2026
    const dates = ['2026-08-01', '2026-08-03', '2026-08-04'];
    for (const d of dates) {
      await pool.query(
        `INSERT INTO attendance (user_id, date, check_in, check_out, status, is_late, late_minutes, hours_worked)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [testUserId, d, `${d}T10:20:00+05:30`, `${d}T19:20:00+05:30`, 'working', true, 20, 9.00]
      );
    }

    const res = await calculatePayrollForEmployee(testUserId, 8, 2026, defaultSettings, pool);
    expect(res.late_count).toBe(3);
    expect(res.late_penalty_days).toBe(0.15);
    // Daily rate = 25000 / 30 = 833.33
    expect(res.late_deduction_amount).toBeCloseTo(0.15 * (25000 / 30), 1);
  });

  test('6 lates should trigger 0.30 day deduction', async () => {
    for (let day = 1; day <= 6; day++) {
      const d = `2026-08-${String(day).padStart(2, '0')}`;
      await pool.query(
        `INSERT INTO attendance (user_id, date, check_in, check_out, status, is_late, late_minutes, hours_worked)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [testUserId, d, `${d}T10:20:00+05:30`, `${d}T19:20:00+05:30`, 'working', true, 20, 9.00]
      );
    }

    const res = await calculatePayrollForEmployee(testUserId, 8, 2026, defaultSettings, pool);
    expect(res.late_count).toBe(6);
    expect(res.late_penalty_days).toBe(0.30);
  });

  test('15 lates should trigger 0.75 day deduction', async () => {
    for (let day = 1; day <= 15; day++) {
      const d = `2026-08-${String(day).padStart(2, '0')}`;
      await pool.query(
        `INSERT INTO attendance (user_id, date, check_in, check_out, status, is_late, late_minutes, hours_worked)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [testUserId, d, `${d}T10:20:00+05:30`, `${d}T19:20:00+05:30`, 'working', true, 20, 9.00]
      );
    }

    const res = await calculatePayrollForEmployee(testUserId, 8, 2026, defaultSettings, pool);
    expect(res.late_count).toBe(15);
    expect(res.late_penalty_days).toBe(0.75);
  });

  test('16 lates should trigger 0.75 day deduction (only completed groups of 3 count)', async () => {
    for (let day = 1; day <= 16; day++) {
      const d = `2026-08-${String(day).padStart(2, '0')}`;
      await pool.query(
        `INSERT INTO attendance (user_id, date, check_in, check_out, status, is_late, late_minutes, hours_worked)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [testUserId, d, `${d}T10:20:00+05:30`, `${d}T19:20:00+05:30`, 'working', true, 20, 9.00]
      );
    }

    const res = await calculatePayrollForEmployee(testUserId, 8, 2026, defaultSettings, pool);
    expect(res.late_count).toBe(16);
    expect(res.late_penalty_days).toBe(0.75);
  });

  test('18 lates should trigger 0.90 day deduction', async () => {
    for (let day = 1; day <= 18; day++) {
      const d = `2026-08-${String(day).padStart(2, '0')}`;
      await pool.query(
        `INSERT INTO attendance (user_id, date, check_in, check_out, status, is_late, late_minutes, hours_worked)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [testUserId, d, `${d}T10:20:00+05:30`, `${d}T19:20:00+05:30`, 'working', true, 20, 9.00]
      );
    }

    const res = await calculatePayrollForEmployee(testUserId, 8, 2026, defaultSettings, pool);
    expect(res.late_count).toBe(18);
    expect(res.late_penalty_days).toBe(0.90);
  });

  test('0, 1, or 2 lates should trigger 0.00 day deduction', async () => {
    // 2 lates
    for (let day = 1; day <= 2; day++) {
      const d = `2026-08-${String(day).padStart(2, '0')}`;
      await pool.query(
        `INSERT INTO attendance (user_id, date, check_in, check_out, status, is_late, late_minutes, hours_worked)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [testUserId, d, `${d}T10:20:00+05:30`, `${d}T19:20:00+05:30`, 'working', true, 20, 9.00]
      );
    }

    const res = await calculatePayrollForEmployee(testUserId, 8, 2026, defaultSettings, pool);
    expect(res.late_count).toBe(2);
    expect(res.late_penalty_days).toBe(0);
    expect(res.late_deduction_amount).toBe(0);
  });

  test('Chaitali Bawane regression case: 16 lates on 30-day salary basis yields exactly ₹625 late deduction', async () => {
    // On a 30-day salary basis: 25000 / 30 = 833.333/day. 0.75 * 833.333 = 625.00
    const perDaySalary30 = 25000 / 30;
    const completedLateGroups = Math.floor(16 / 3); // 5
    const lateDeductionDays = completedLateGroups * 0.15; // 0.75
    const lateDeductionAmount = lateDeductionDays * perDaySalary30; // 625.00

    expect(completedLateGroups).toBe(5);
    expect(lateDeductionDays).toBe(0.75);
    expect(Math.round(lateDeductionAmount * 100) / 100).toBe(625.00);
  });

  test('Abhijit canonical September 2026 reconciliation: 14 present, 4 absent, 3 lates, 9 upcoming', async () => {
    const { rows: uRows } = await pool.query(
      `INSERT INTO users (name, username, password_hash, role, base_salary, hourly_rate)
       VALUES ('Abhijit Canonical', 'abhijit_canon_${Date.now()}', 'hash', 'employee', 30000.00, 0.00)
       RETURNING id`
    );
    const abhijitId = uRows[0].id;

    try {
      const septSettings = {
        office_start_time: '10:00',
        late_threshold_time: '10:15',
        half_day_cutoff_time: '13:00',
        late_penalty_rule_count: '3',
        late_penalty_rule_days: '0.15',
        min_working_hours: '9.0'
      };

      // 11 Full Days Worked (3 late: 4 Sept +31m, 8 Sept +75m, 14 Sept +85m; and total OT = 16.5544h)
      // Total OT hours distributed across checkouts > 19:00 IST
      const fullDaysData = [
        { date: '2026-09-01', inTime: '10:00', outTime: '21:00', late: false, lateMins: 0, hours: 11 }, // 2h OT
        { date: '2026-09-02', inTime: '10:00', outTime: '21:00', late: false, lateMins: 0, hours: 11 }, // 2h OT
        { date: '2026-09-03', inTime: '10:00', outTime: '20:30', late: false, lateMins: 0, hours: 10.5 }, // 1.5h OT
        { date: '2026-09-04', inTime: '10:31', outTime: '21:00', late: true, lateMins: 31, hours: 10.48 }, // 2h OT, Late 1
        { date: '2026-09-05', inTime: '10:00', outTime: '20:00', late: false, lateMins: 0, hours: 10 }, // 1h OT
        { date: '2026-09-07', inTime: '10:00', outTime: '20:30', late: false, lateMins: 0, hours: 10.5 }, // 1.5h OT
        { date: '2026-09-08', inTime: '11:15', outTime: '21:00', late: true, lateMins: 75, hours: 9.75 }, // 2h OT, Late 2
        { date: '2026-09-09', inTime: '10:00', outTime: '20:00', late: false, lateMins: 0, hours: 10 }, // 1h OT
        { date: '2026-09-11', inTime: '10:00', outTime: '20:30', late: false, lateMins: 0, hours: 10.5 }, // 1.5h OT
        { date: '2026-09-14', inTime: '11:25', outTime: '20:30', late: true, lateMins: 85, hours: 9.08 }, // 1.5h OT, Late 3
        { date: '2026-09-15', inTime: '10:00', outTime: '19:33:16', late: false, lateMins: 0, hours: 9.5544 } // 0.5544h OT (33m 16s)
      ];

      for (const fd of fullDaysData) {
        const outTimeStr = fd.outTime.length === 5 ? `${fd.outTime}:00` : fd.outTime;
        await pool.query(
          `INSERT INTO attendance (user_id, date, check_in, check_out, status, is_late, late_minutes, hours_worked)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
          [
            abhijitId,
            fd.date,
            `${fd.date}T${fd.inTime}:00+05:30`,
            `${fd.date}T${outTimeStr}+05:30`,
            'working',
            fd.late,
            fd.lateMins,
            fd.hours
          ]
        );
      }

      // 3 Half Days (12, 17, 21 Sept): 5.43h, 5.75h, 6.03h
      const halfDaysData = [
        { date: '2026-09-12', hours: 5.43 },
        { date: '2026-09-17', hours: 5.75 },
        { date: '2026-09-21', hours: 6.03 }
      ];
      for (const hd of halfDaysData) {
        await pool.query(
          `INSERT INTO attendance (user_id, date, check_in, check_out, status, is_late, late_minutes, hours_worked)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
          [
            abhijitId,
            hd.date,
            `${hd.date}T13:00:00+05:30`,
            `${hd.date}T18:30:00+05:30`,
            'half_day',
            false,
            0,
            hd.hours
          ]
        );
      }

      // Run payroll calculation for Sept 2026 as of 21 Sept
      const res = await calculatePayrollForEmployee(abhijitId, 9, 2026, septSettings, pool, '2026-09-21');

      // Verify physical attendance
      expect(res.full_days_worked).toBe(11);
      expect(res.half_days_worked).toBe(3);
      expect(res.total_present).toBe(14); // MUST be 14, NOT 18

      // Verify absences and Sundays up to 21 Sept
      expect(res.unmarked_absent_count).toBe(4);
      expect(res.total_absent).toBe(4);
      expect(res.sundays_count).toBe(3); // 6, 13, 20 Sept only; 27 Sept Sunday must NOT be counted

      // Verify upcoming / pending future days
      const upcomingRecords = res.processedAttendance.filter(r => r.status === 'upcoming' || r.status === 'today_pending');
      expect(upcomingRecords.length).toBe(9); // 22 through 30 Sept
      for (const ur of upcomingRecords) {
        expect(ur.earnings).toBe(0);
        expect(ur.deduction).toBe(0);
        expect(ur.is_late).toBe(false);
      }

      // Verify late arrivals count and cumulative late penalty (every 3 lates = 0.15 day deduction = ₹150)
      expect(res.late_count).toBe(3);
      expect(res.consecutive_late_groups).toBe(1);
      expect(res.late_penalty_days).toBe(0.15);
      expect(res.late_deduction_amount).toBe(150.00);

      // Verify Deductions:
      // Half-day shortfalls and absences have 0 deduction
      // Deductions only include accumulated late penalties
      expect(res.absence_deduction_amount).toBe(0);
      expect(res.half_day_deduction_amount).toBe(0);
      expect(res.total_attendance_deductions).toBe(0);
      expect(res.deductions).toBe(150.00);

      // Verify Overtime (Rule 4: completed 1-hour multiples after 19:00 IST)
      // 14 OT hours @ ₹111.111.../hr = ₹1,555.56
      expect(res.total_overtime_hours).toBe(10);
      expect(res.overtime_earnings).toBeCloseTo(1111.11, 1);

      // Verify Authoritative Accrued Earnings to date:
      // Normal Earnings (11 full + 3 Sundays + 3 half) = ₹15,912.22
      // Overtime Earnings = ₹1,555.56
      // Total Accrued Earnings = ₹17,467.78
      expect(res.accrued_earnings_to_date).toBeCloseTo(17023.33, 1);

      // Verify Authoritative Current Net Payable:
      // Net Payable = Accrued Earnings (17,467.78) - Penalties (150) = ₹17,317.78
      expect(res.current_net_payable).toBeCloseTo(16873.33, 1);
      expect(res.net_salary_payable).toBeCloseTo(16873.33, 1);
      expect(res.suggested_salary).toBeCloseTo(16873.33, 1);

      // Verify Dashboard calculateSalaryStats API contract
      const salaryStats = await calculateSalaryStats(abhijitId, 9, 2026, '2026-09-21', septSettings);
      expect(salaryStats.earned_this_month).toBeCloseTo(17023.33, 1);
      expect(salaryStats.accrued_earnings_to_date).toBeCloseTo(17023.33, 1);
      expect(salaryStats.deductions_this_month).toBe(150.00);
      expect(salaryStats.current_net_payable).toBeCloseTo(16873.33, 1);
      expect(salaryStats.net_salary_payable).toBeCloseTo(16873.33, 1);
      expect(salaryStats.is_month_in_progress).toBe(true);

    } finally {
      await pool.query('DELETE FROM attendance WHERE user_id = $1', [abhijitId]);
      await pool.query('DELETE FROM users WHERE id = $1', [abhijitId]);
    }
  });

  test('Rule 6: 3 consecutive late arrivals trigger 0.15 day deduction, while on-time or absent day resets streak', async () => {
    const { rows: uRows } = await pool.query(
      `INSERT INTO users (name, username, password_hash, role, base_salary, hourly_rate)
       VALUES ('Streak Test User', 'streak_test_${Date.now()}', 'hash', 'employee', 30000.00, 0.00)
       RETURNING id`
    );
    const testUserId = uRows[0].id;

    try {
      const septSettings = {
        office_start_time: '10:00',
        late_threshold_time: '10:15',
        half_day_cutoff_time: '13:00',
        late_penalty_rule_count: '3',
        late_penalty_rule_days: '0.15',
        min_working_hours: '9.0'
      };

      // Days 1, 2, 3: Consecutive late arrivals -> triggers 1 penalty group (0.15 day = ₹150)
      // Day 4: On-time arrival -> resets streak
      // Day 5: Late arrival (streak = 1)
      // Day 7 (Day 6 is Sunday): Absent -> resets streak (streak = 0)
      // Day 8: Late arrival (streak = 1)
      // Day 9: Late arrival (streak = 2)
      // Total lates: 5, but ONLY Days 1, 2, 3 were 3 consecutive!
      const records = [
        { date: '2026-09-01', inTime: '10:30', outTime: '19:30', late: true, lateMins: 30, status: 'present', hours: 9.0 },
        { date: '2026-09-02', inTime: '10:30', outTime: '19:30', late: true, lateMins: 30, status: 'present', hours: 9.0 },
        { date: '2026-09-03', inTime: '10:30', outTime: '19:30', late: true, lateMins: 30, status: 'present', hours: 9.0 },
        { date: '2026-09-04', inTime: '10:00', outTime: '19:00', late: false, lateMins: 0, status: 'present', hours: 9.0 },
        { date: '2026-09-05', inTime: '10:30', outTime: '19:30', late: true, lateMins: 30, status: 'present', hours: 9.0 },
        // 2026-09-06 is Sunday
        { date: '2026-09-07', inTime: null, outTime: null, late: false, lateMins: 0, status: 'absent', hours: 0 },
        { date: '2026-09-08', inTime: '10:30', outTime: '19:30', late: true, lateMins: 30, status: 'present', hours: 9.0 },
        { date: '2026-09-09', inTime: '10:30', outTime: '19:30', late: true, lateMins: 30, status: 'present', hours: 9.0 }
      ];

      for (const r of records) {
        if (r.status === 'absent') {
          await pool.query(
            `INSERT INTO attendance (user_id, date, status, is_late, late_minutes, hours_worked)
             VALUES ($1, $2, $3, $4, $5, $6)`,
            [testUserId, r.date, 'absent', false, 0, 0]
          );
        } else {
          await pool.query(
            `INSERT INTO attendance (user_id, date, check_in, check_out, status, is_late, late_minutes, hours_worked)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
            [
              testUserId,
              r.date,
              `${r.date}T${r.inTime}:00+05:30`,
              `${r.date}T${r.outTime}:00+05:30`,
              r.status,
              r.late,
              r.lateMins,
              r.hours
            ]
          );
        }
      }

      const res = await calculatePayrollForEmployee(testUserId, 9, 2026, septSettings, pool, '2026-09-09');

      expect(res.late_count).toBe(6);
      expect(res.consecutive_late_groups).toBe(2); // 6 lates = 2 groups
      expect(res.late_penalty_days).toBe(0.30);
      expect(res.late_deduction_amount).toBe(300.00);
      expect(res.deductions).toBe(300.00);

      // Absent day 7 has 0 deduction
      expect(res.absence_deduction_amount).toBe(0);
      expect(res.total_attendance_deductions).toBe(0);

    } finally {
      await pool.query('DELETE FROM attendance WHERE user_id = $1', [testUserId]);
      await pool.query('DELETE FROM users WHERE id = $1', [testUserId]);
    }
  });
});
