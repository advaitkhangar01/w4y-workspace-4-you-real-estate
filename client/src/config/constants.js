/**
 * Centralized constants for the application to ensure consistency
 * and make refactoring safer.
 */

export const ATTENDANCE_STATUS = {
  PRESENT: 'present',
  WORKING: 'working',
  COMPLETED: 'completed',
  ABSENT: 'absent',
  HALF_DAY: 'half_day',
  LEAVE: 'leave'
};

export const LEAVE_STATUS = {
  PENDING: 'pending',
  APPROVED: 'approved',
  REJECTED: 'rejected'
};

export const LEAVE_TYPE = {
  CASUAL: 'casual',
  SICK: 'sick',
  EMERGENCY: 'emergency',
  UNPAID: 'unpaid',
  HALF_DAY: 'half_day',
  ADVANCE: 'advance',
  RESIGNATION: 'resignation'
};

export const TASK_STATUS = {
  TODO: 'todo',
  IN_PROGRESS: 'in_progress',
  REVIEW: 'review',
  PASSED: 'passed'
};

export const USER_ROLES = {
  ADMIN: 'admin',
  EMPLOYEE: 'employee',
  ACCOUNTS: 'accounts',
  DESIGN_HEAD: 'design_head',
  PROJECT_HEAD: 'project_head'
};

export const VIEW_MODES = {
  TODAY: 'today',
  HISTORY: 'all',
  CALENDAR: 'calendar',
  TABLE: 'table'
};
