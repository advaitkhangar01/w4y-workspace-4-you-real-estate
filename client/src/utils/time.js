// client/src/utils/time.js
// IST timezone helpers

export function formatIST(dateString, options = {}) {
  if (!dateString) return '—';
  try {
    return new Date(dateString).toLocaleString('en-IN', {
      timeZone: 'Asia/Kolkata',
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      ...options,
    });
  } catch {
    return '—';
  }
}

export function formatTimeIST(dateString) {
  if (!dateString) return '—';
  try {
    return new Date(dateString).toLocaleString('en-IN', {
      timeZone: 'Asia/Kolkata',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    });
  } catch {
    return '—';
  }
}

export function formatDateIST(dateString) {
  if (!dateString) return '—';
  try {
    return new Date(dateString).toLocaleDateString('en-IN', {
      timeZone: 'Asia/Kolkata',
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
  } catch {
    return '—';
  }
}

export function todayIST() {
  return new Date().toLocaleDateString('en-IN', {
    timeZone: 'Asia/Kolkata',
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

/**
 * Returns today's date in YYYY-MM-DD format for IST timezone
 */
export function getISODateIST() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

export function timeAgo(dateString) {
  if (!dateString) return '';
  const diff = Date.now() - new Date(dateString).getTime();
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  if (days > 0) return `${days}d ago`;
  if (hours > 0) return `${hours}h ago`;
  if (minutes > 0) return `${minutes}m ago`;
  return 'just now';
}

// Parse @mentions in text and highlight them
export function parseMentions(text) {
  return text.replace(/@(\w+)/g, '<span class="text-[#E05A1E] font-semibold">@$1</span>');
}

/**
 * Calculates the number of days a task is overdue.
 * If the task is completed/in review ('passed', 'done', 'review') or dates are missing, returns 0.
 */
export function getTaskOverdueDays(task) {
  if (!task || ['passed', 'done', 'review'].includes(task.status)) return 0;
  try {
    const todayStr = getISODateIST();
    const todayDate = new Date(todayStr);
    
    if (task.due_date) {
      const dueStr = task.due_date.substring(0, 10);
      const dueDate = new Date(dueStr);
      const diffTime = todayDate.getTime() - dueDate.getTime();
      const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
      return diffDays > 0 ? diffDays : 0;
    }
    
    if (task.start_date) {
      const startStr = task.start_date.substring(0, 10);
      const startDate = new Date(startStr);
      const diffTime = todayDate.getTime() - startDate.getTime();
      const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
      // Overdue after 7-day allocation; return days past threshold
      return diffDays > 7 ? (diffDays - 7) : 0;
    }
    
    return 0;
  } catch {
    return 0;
  }
}

/**
 * Checks if a task is overdue. If due_date is set, it is overdue if it is past due_date.
 * If no due_date is set, it is overdue if it is more than 7 days past start_date.
 */
export function isTaskOverdue(task) {
  if (!task) return false;
  return getTaskOverdueDays(task) > 0;
}
