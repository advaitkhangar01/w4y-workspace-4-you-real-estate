// server/tests/attendanceRecalculation.test.js
const pool = require('../db');
const {
  recalculateAttendanceForUser,
  recalculateAttendanceForBatch,
  timeToMinutes
} = require('../utils/attendanceRecalculator');

describe('Attendance Batch Recalculation Utility & API', () => {
  let testUserId;
  let testBatchId;

  beforeAll(async () => {
    // Create test batch: 10:00 start, 10:15 late threshold, 13:00 cutoff
    const { rows: batchRows } = await pool.query(
      `INSERT INTO attendance_batches (name, office_start_time, late_threshold_time, half_day_cutoff_time, min_working_hours)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id`,
      [`Test Batch ${Date.now()}`, '10:00:00', '10:15:00', '13:00:00', 9.0]
    );
    testBatchId = batchRows[0].id;

    // Create test user assigned to testBatchId
    const { rows: userRows } = await pool.query(
      `INSERT INTO users (name, username, password_hash, role, batch_id)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id`,
      [`Test User ${Date.now()}`, `testuser_${Date.now()}`, 'hash123', 'employee', testBatchId]
    );
    testUserId = userRows[0].id;
  });

  afterAll(async () => {
    // Cleanup test data
    if (testUserId) {
      await pool.query('DELETE FROM attendance WHERE user_id = $1', [testUserId]);
      await pool.query('DELETE FROM users WHERE id = $1', [testUserId]);
    }
    if (testBatchId) {
      await pool.query('DELETE FROM attendance_batches WHERE id = $1', [testBatchId]);
    }
  });

  it('should correctly convert time string to minutes', () => {
    expect(timeToMinutes('10:00')).toBe(600);
    expect(timeToMinutes('10:15:00')).toBe(615);
    expect(timeToMinutes('13:30')).toBe(810);
    expect(timeToMinutes('')).toBe(0);
  });

  it('should recalculate past attendance records when user batch thresholds change', async () => {
    // 1. Insert past attendance record checked in at 10:20:00 IST (20 mins after 10:00, 5 mins after 10:15 threshold)
    // Under original 10:00 batch: late_minutes = 20, is_late = true
    const testDate = '2026-08-01';
    const checkInTime = new Date('2026-08-01T10:20:00+05:30').toISOString();
    const checkOutTime = new Date('2026-08-01T19:20:00+05:30').toISOString();

    await pool.query(
      `INSERT INTO attendance (user_id, date, check_in, check_out, status, is_late, late_minutes, hours_worked, batch_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       ON CONFLICT (user_id, date) DO UPDATE SET check_in = EXCLUDED.check_in, batch_id = EXCLUDED.batch_id`,
      [testUserId, testDate, checkInTime, checkOutTime, 'completed', true, 20, 9.0, testBatchId]
    );

    // Verify initial row state
    const { rows: initial } = await pool.query(
      'SELECT is_late, late_minutes, status FROM attendance WHERE user_id = $1 AND date = $2',
      [testUserId, testDate]
    );
    expect(initial[0].is_late).toBe(true);
    expect(initial[0].late_minutes).toBe(20);

    // 2. Update test batch to start at 10:30 AM (late threshold 10:45 AM)
    await pool.query(
      `UPDATE attendance_batches
       SET office_start_time = '10:30:00', late_threshold_time = '10:45:00'
       WHERE id = $1`,
      [testBatchId]
    );

    // 3. Trigger recalculation for the user
    const result = await recalculateAttendanceForUser(testUserId);
    expect(result.recalculatedCount).toBeGreaterThan(0);

    // 4. Verify that check-in at 10:20 AM is now ON TIME under 10:30 AM start (is_late = false, late_minutes = 0)
    const { rows: updated } = await pool.query(
      'SELECT is_late, late_minutes, status FROM attendance WHERE user_id = $1 AND date = $2',
      [testUserId, testDate]
    );
    expect(updated[0].is_late).toBe(false);
    expect(updated[0].late_minutes).toBe(0);
    expect(updated[0].status).toBe('completed');
  });

  it('should recalculate attendance based on the record batch and protect historical records', async () => {
    // Create a 2nd batch: 09:00 start, 09:15 late threshold
    const { rows: batch2Rows } = await pool.query(
      `INSERT INTO attendance_batches (name, office_start_time, late_threshold_time, half_day_cutoff_time, min_working_hours)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id`,
      [`Test Batch 2 ${Date.now()}`, '09:00:00', '09:15:00', '12:00:00', 9.0]
    );
    const batch2Id = batch2Rows[0].id;

    try {
      const testDate2 = '2026-08-05';
      const checkInTime2 = new Date('2026-08-05T10:20:00+05:30').toISOString();
      const checkOutTime2 = new Date('2026-08-05T19:20:00+05:30').toISOString();

      // Attendance recorded under Batch 2
      await pool.query(
        `INSERT INTO attendance (user_id, date, check_in, check_out, status, is_late, late_minutes, hours_worked, batch_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         ON CONFLICT (user_id, date) DO UPDATE SET check_in = EXCLUDED.check_in, batch_id = EXCLUDED.batch_id`,
        [testUserId, testDate2, checkInTime2, checkOutTime2, 'working', false, 0, 9.0, batch2Id]
      );

      // Recalculate for user
      await recalculateAttendanceForUser(testUserId);

      // Under Batch 2 (09:00 start): 10:20 check-in is 80 mins late! (is_late = true, late_minutes = 80)
      const { rows: updated } = await pool.query(
        'SELECT is_late, late_minutes FROM attendance WHERE user_id = $1 AND date = $2',
        [testUserId, testDate2]
      );
      expect(updated[0].is_late).toBe(true);
      expect(updated[0].late_minutes).toBe(80);
    } finally {
      await pool.query('DELETE FROM attendance_batches WHERE id = $1', [batch2Id]);
    }
  });

  it('should preserve leave and holiday records without modifying them', async () => {
    const leaveDate = '2026-08-02';
    await pool.query(
      `INSERT INTO attendance (user_id, date, status, is_late, late_minutes)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (user_id, date) DO UPDATE SET status = EXCLUDED.status`,
      [testUserId, leaveDate, 'leave', false, 0]
    );

    await recalculateAttendanceForUser(testUserId);

    const { rows } = await pool.query(
      'SELECT status FROM attendance WHERE user_id = $1 AND date = $2',
      [testUserId, leaveDate]
    );
    expect(rows[0].status).toBe('leave');
  });
});
