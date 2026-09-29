const ApiError = require('./ApiError');

const RANGE_KEYS = ['today', '7d', '30d', 'month', 'custom'];
const MAX_CUSTOM_DAYS = 366;
const DAY_MS = 24 * 60 * 60 * 1000;

function localParts(date, timeZone) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    })
      .formatToParts(date)
      .filter((part) => part.type !== 'literal')
      .map((part) => [part.type, Number(part.value)])
  );
  return parts;
}

function offsetMs(date, timeZone) {
  const p = localParts(date, timeZone);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return asUtc - Math.floor(date.getTime() / 1000) * 1000;
}

// UTC instant of local midnight for a calendar day in the given zone.
function zonedMidnight(year, month, day, timeZone) {
  const guess = Date.UTC(year, month - 1, day);
  return new Date(guess - offsetMs(new Date(guess), timeZone));
}

function dayString({ year, month, day }) {
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function parseDayString(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value || ''));
  if (!match) return null;
  const [year, month, day] = match.slice(1).map(Number);
  const check = new Date(Date.UTC(year, month - 1, day));
  if (check.getUTCFullYear() !== year || check.getUTCMonth() !== month - 1 || check.getUTCDate() !== day) {
    return null;
  }
  return { year, month, day };
}

function shiftDay(parts, days) {
  const d = new Date(Date.UTC(parts.year, parts.month - 1, parts.day) + days * DAY_MS);
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate() };
}

function daysBetween(a, b) {
  return Math.round(
    (Date.UTC(b.year, b.month - 1, b.day) - Date.UTC(a.year, a.month - 1, a.day)) / DAY_MS
  );
}

function formatDay(parts) {
  return new Date(Date.UTC(parts.year, parts.month - 1, parts.day)).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

/**
 * Resolves a named range into [start, end) instants in the analytics time zone.
 * end is capped at "now" so partial days are honest.
 */
function resolveRange({ range = '7d', from, to } = {}, { timeZone, now = new Date() }) {
  const key = RANGE_KEYS.includes(range) ? range : '7d';
  const today = localParts(now, timeZone);
  let firstDay;
  let lastDay = { year: today.year, month: today.month, day: today.day };

  if (key === 'today') firstDay = lastDay;
  if (key === '7d') firstDay = shiftDay(lastDay, -6);
  if (key === '30d') firstDay = shiftDay(lastDay, -29);
  if (key === 'month') firstDay = { year: today.year, month: today.month, day: 1 };
  if (key === 'custom') {
    const fromParts = parseDayString(from);
    const toParts = parseDayString(to);
    if (!fromParts || !toParts) {
      throw new ApiError(400, 'Choose a valid start and end date.');
    }
    if (daysBetween(fromParts, toParts) < 0) {
      throw new ApiError(400, 'The start date must be before the end date.');
    }
    if (daysBetween(fromParts, toParts) + 1 > MAX_CUSTOM_DAYS) {
      throw new ApiError(400, `Custom ranges can cover up to ${MAX_CUSTOM_DAYS} days.`);
    }
    firstDay = fromParts;
    lastDay = toParts;
  }

  const start = zonedMidnight(firstDay.year, firstDay.month, firstDay.day, timeZone);
  if (start > now) {
    throw new ApiError(400, 'Choose dates up to today.');
  }
  const nextDay = shiftDay(lastDay, 1);
  const naturalEnd = zonedMidnight(nextDay.year, nextDay.month, nextDay.day, timeZone);
  const end = naturalEnd > now ? now : naturalEnd;
  const days = daysBetween(firstDay, lastDay) + 1;

  const dayKeys = [];
  for (let i = 0; i < days; i += 1) dayKeys.push(dayString(shiftDay(firstDay, i)));

  const label = days === 1
    ? formatDay(firstDay)
    : `${formatDay(firstDay)} – ${formatDay(lastDay)}`;

  return {
    key,
    start,
    end,
    days,
    from: dayString(firstDay),
    to: dayString(lastDay),
    label,
    dayKeys,
    timeZone,
  };
}

module.exports = {
  RANGE_KEYS,
  MAX_CUSTOM_DAYS,
  resolveRange,
  parseDayString,
  zonedMidnight,
  localParts,
};
