import 'dotenv/config';

const lateFeeStartDate = process.env.LATE_FEE_START_DATE || '2026-08-10';
const lateFeePerDay = Number(process.env.LATE_FEE_PER_DAY || 20);

function toUtcDate(value) {
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) throw new Error(`Invalid date: ${value}`);
    return new Date(Date.UTC(value.getFullYear(), value.getMonth(), value.getDate()));
  }

  const date = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) throw new Error(`Invalid date: ${value}`);
  return date;
}

function calendarDaysBetween(start, end) {
  return Math.max(0, Math.floor((end - start) / 86400000));
}

export function calculateLateFee(dueMonth, today = new Date()) {
  const dueDate = toUtcDate(dueMonth);
  const startDate = toUtcDate(lateFeeStartDate);
  const currentDate = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
  const monthlyCutoff = new Date(Date.UTC(
    dueDate.getUTCFullYear(),
    dueDate.getUTCMonth(),
    10
  ));
  const rolloutMonth = new Date(Date.UTC(
    startDate.getUTCFullYear(),
    startDate.getUTCMonth(),
    1
  ));
  const feeStartDate = monthlyCutoff > startDate ? monthlyCutoff : startDate;

  // Late fees apply when:
  // 1. The month's cutoff has passed
  // 2. The month was covered by the rollout start date
  if (dueDate < rolloutMonth || currentDate <= feeStartDate) return 0;
  
  return calendarDaysBetween(feeStartDate, currentDate) * lateFeePerDay;
}

export function feePolicy() {
  return { startDate: lateFeeStartDate, perDay: lateFeePerDay };
}
