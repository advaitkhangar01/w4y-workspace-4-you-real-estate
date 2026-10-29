// server/utils/salaryEngine.js
// Authoritative Shared Statutory Calculation Engine for DS16
// Used across Payroll, Attendance Recalculation, Monthly Close, Staff Detail, and Reports

/**
 * Calculates hourly rate strictly based on statutory business rule:
 * Hourly Rate = Base Salary / (30 * Batch Minimum Hours)
 */
function calculateHourlyRate(baseSalary, minWorkingHours = 9.0) {
  const base = parseFloat(baseSalary) || 0;
  const hours = parseFloat(minWorkingHours) || 9.0;
  if (base <= 0 || hours <= 0) return 0;
  return Math.round((base / (30 * hours)) * 100) / 100;
}

/**
 * Calculates accumulated late arrival penalty:
 * Every 3 late marks accumulated in a calendar month = 0.15 day deduction
 */
function calculateLatePenalty(lateCount, perDaySalary, latePenaltyRuleCount = 3, latePenaltyRuleDays = 0.15) {
  const count = parseInt(lateCount || 0, 10);
  const perDay = parseFloat(perDaySalary) || 0;
  const groups = Math.floor(count / latePenaltyRuleCount);
  const latePenaltyDays = Math.round(groups * latePenaltyRuleDays * 100) / 100;
  const latePenaltyAmount = Math.round(latePenaltyDays * perDay * 100) / 100;
  return {
    groups,
    latePenaltyDays,
    latePenaltyAmount
  };
}

/**
 * Computes unified net payable with Day 31 regular earnings capped at baseSalary
 */
function calculateUnifiedNet({
  baseSalary = 0,
  unmarkedAbsentCount = 0,
  unpaidLeaves = 0,
  halfDaysWorked = 0,
  halfDayShortfalls = 0,
  totalDeductions = 0,
  totalOvertimeEarnings = 0,
  totalNormalEarnings = 0,
  isMonthInProgress = false
}) {
  const base = parseFloat(baseSalary) || 0;
  const perDay = base > 0 ? base / 30 : 0;
  const absences = (parseInt(unmarkedAbsentCount || 0, 10) + parseInt(unpaidLeaves || 0, 10)) * perDay;
  const deductions = parseFloat(totalDeductions || 0);
  const ot = parseFloat(totalOvertimeEarnings || 0);
  const normal = parseFloat(totalNormalEarnings || 0);

  // Closed month top-down formula
  const projectedMonthEndNet = Math.max(
    0,
    Math.round((base - absences - halfDayShortfalls - deductions + ot) * 100) / 100
  );

  // In-progress bottom-up formula with Day 31 cap on regular earnings (CALC-02)
  const cappedNormal = base > 0 ? Math.min(base, normal) : normal;
  const accruedEarningsToDate = Math.max(0, Math.round((cappedNormal + ot) * 100) / 100);

  const currentNetPayable = isMonthInProgress
    ? Math.max(0, Math.round((accruedEarningsToDate - deductions) * 100) / 100)
    : projectedMonthEndNet;

  return {
    projectedMonthEndNet,
    accruedEarningsToDate,
    currentNetPayable,
    cappedNormalEarnings: cappedNormal
  };
}

module.exports = {
  calculateHourlyRate,
  calculateLatePenalty,
  calculateUnifiedNet
};
