/**
 * Deterministic natural-language time parsing for scheduled prompts. The LLM is
 * unreliable at producing absolute timestamps (and doesn't know "now"), so the
 * assistant emits a loose phrase ("9pm", "in 30 minutes", "tomorrow 9am") and we
 * resolve it here, in code, relative to the current time.
 *
 * Returns an epoch-ms timestamp in the future, or null if the text can't be
 * understood (the caller should then ask the user to rephrase).
 */
export function parseWhen(text: string, now: number = Date.now()): number | null {
  const raw = text.trim().toLowerCase();
  if (!raw) return null;

  // 1) Relative: "in 30 minutes", "in 2 hours", "in 90 min", "in 1 day".
  const rel = /^in\s+(\d+)\s*(min|mins|minute|minutes|hour|hours|hr|hrs|day|days)$/.exec(raw);
  if (rel) {
    const n = parseInt(rel[1]!, 10);
    const unit = rel[2]!;
    const ms = unit.startsWith('day')
      ? n * 86_400_000
      : unit.startsWith('h')
        ? n * 3_600_000
        : n * 60_000;
    return now + ms;
  }

  // 2) "tomorrow [at] 9am" / "today 9pm" / a bare clock time "9pm", "21:00".
  const dayMatch = /^(today|tomorrow)\b\s*(?:at\s*)?(.*)$/.exec(raw);
  const dayWord = dayMatch?.[1];
  const timePart = (dayMatch ? dayMatch[2] ?? '' : raw).trim();

  const clock = parseClock(timePart);
  if (clock) {
    const base = new Date(now);
    base.setSeconds(0, 0);
    base.setHours(clock.hours, clock.minutes, 0, 0);
    let when = base.getTime();
    if (dayWord === 'tomorrow') when += 86_400_000;
    // For a bare/"today" time that's already passed, roll to the next day so a
    // scheduled prompt never lands in the past.
    else if (dayWord !== 'tomorrow' && when <= now) when += 86_400_000;
    return when;
  }

  // 3) ISO 8601 / <input type="datetime-local"> value fallback.
  const parsed = Date.parse(text);
  return Number.isNaN(parsed) ? null : parsed;
}

/** Parse a clock fragment: "9pm", "9:30 pm", "21:00", "9am", "noon", "midnight". */
function parseClock(text: string): { hours: number; minutes: number } | null {
  const t = text.trim();
  if (t === 'noon') return { hours: 12, minutes: 0 };
  if (t === 'midnight') return { hours: 0, minutes: 0 };

  const m = /^(\d{1,2})(?::(\d{2}))?\s*(am|pm)?$/.exec(t);
  if (!m) return null;
  let hours = parseInt(m[1]!, 10);
  const minutes = m[2] ? parseInt(m[2], 10) : 0;
  const ampm = m[3];

  if (ampm) {
    if (hours < 1 || hours > 12) return null;
    if (ampm === 'pm' && hours !== 12) hours += 12;
    if (ampm === 'am' && hours === 12) hours = 0;
  }
  if (hours > 23 || minutes > 59) return null;
  return { hours, minutes };
}
