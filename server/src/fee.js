import 'dotenv/config';

const lateFeeStartDate = process.env.LATE_FEE_START_DATE || '2026-08-10';
const lateFeeMonth = process.env.LATE_FEE_MONTH || '2026-08-01';
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
  const feeMonth = toUtcDate(lateFeeMonth);
  const startDate = toUtcDate(lateFeeStartDate);
  const currentDate = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));

  if (dueDate.getUTCFullYear() !== feeMonth.getUTCFullYear()
    || dueDate.getUTCMonth() !== feeMonth.getUTCMonth()
    || currentDate <= startDate) return 0;
  return calendarDaysBetween(startDate, currentDate) * lateFeePerDay;
}

export function feePolicy() {
  return { startDate: lateFeeStartDate, perDay: lateFeePerDay };
}
