import { config } from './config.js';

function partsInTimezone(date = new Date()) {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: config.timezone,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    weekday: 'short', hour12: false,
  });
  return Object.fromEntries(formatter.formatToParts(date).map((p) => [p.type, p.value]));
}

function minutes(value) {
  const [hour, minute] = String(value).split(':').map(Number);
  return hour * 60 + minute;
}

export function isBusinessWindow(date = new Date()) {
  const p = partsInTimezone(date);
  if (['Sat', 'Sun'].includes(p.weekday)) return false;
  const current = Number(p.hour) * 60 + Number(p.minute);
  return current >= minutes(config.limits.businessStart) && current <= minutes(config.limits.businessEnd);
}

export function autoBatchSlot(date = new Date()) {
  const p = partsInTimezone(date);
  if (config.autoBatch.weekdaysOnly && ['Sat', 'Sun'].includes(p.weekday)) return null;
  const current = Number(p.hour) * 60 + Number(p.minute);
  const interval = Math.max(config.autoBatch.intervalMinutes, 1);
  const window = config.autoBatch.windows.find(({ start, end }) => (
    current >= minutes(start) && current <= minutes(end) + interval - 1
  ));
  if (!window) return null;

  const start = minutes(window.start);
  const end = minutes(window.end);
  const scheduled = start + Math.floor((current - start) / interval) * interval;
  if (scheduled > end) return null;

  const scheduledHour = Math.floor(scheduled / 60);
  const scheduledMinute = scheduled % 60;
  const minute = String(scheduledMinute).padStart(2, '0');
  const hour = String(scheduledHour).padStart(2, '0');
  const delayMinutes = current - scheduled;
  return {
    key: `${p.year}-${p.month}-${p.day}T${hour}:${minute}`,
    window: window.id,
    startAt: new Date(
      date.getTime()
      - delayMinutes * 60_000
      - Number(p.second || 0) * 1000
      - date.getUTCMilliseconds(),
    ),
  };
}

export function dateKey(date = new Date()) {
  const p = partsInTimezone(date);
  return `${p.year}-${p.month}-${p.day}`;
}

export function addBusinessDays(input, count) {
  const date = new Date(input);
  let added = 0;
  while (added < count) {
    date.setUTCDate(date.getUTCDate() + 1);
    const weekday = new Intl.DateTimeFormat('en-US', {
      timeZone: config.timezone,
      weekday: 'short',
    }).format(date);
    if (!['Sat', 'Sun'].includes(weekday)) added += 1;
  }
  return date;
}

export function nextStageDueAt(lead, stage) {
  if (stage === 0) return new Date(0);
  if (!lead.sentAt) return null;
  const sent = new Date(lead.sentAt);
  if (stage === 1) return addBusinessDays(sent, config.limits.followup1BusinessDays);
  if (stage === 2) return addBusinessDays(sent, config.limits.followup2BusinessDays);
  return null;
}
