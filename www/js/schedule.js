/* ----------------------------------------------------
 * ALARM SCHEDULE (pure logic, no DOM, no storage)
 * An alarm is { id, hour, minute, days, enabled, label }.
 *   days: array of weekday numbers (0 = Sunday … 6 = Saturday).
 *         Empty array = rings once, then switches itself off.
 * The Android side (ReveilleAlarmScheduler.java) mirrors
 * nextOccurrence() exactly — keep the two in step.
 * ---------------------------------------------------- */

export const WEEKDAYS = [1, 2, 3, 4, 5];
export const WEEKEND = [0, 6];
export const EVERY_DAY = [0, 1, 2, 3, 4, 5, 6];

/** Next moment (ms epoch) this alarm should ring strictly after `now`, or null if it never will. */
export function nextOccurrence(alarm, now = Date.now()) {
    if (!alarm || !alarm.enabled) return null;
    const from = new Date(now);
    for (let offset = 0; offset <= 7; offset++) {
        const candidate = new Date(
            from.getFullYear(), from.getMonth(), from.getDate() + offset,
            alarm.hour, alarm.minute, 0, 0
        );
        if (candidate.getTime() <= now) continue;
        if (alarm.days.length === 0 || alarm.days.includes(candidate.getDay())) {
            return candidate.getTime();
        }
    }
    return null;
}

/**
 * The next thing that will ring: the earliest enabled alarm, or a pending snooze
 * if that comes sooner. Returns { at, alarmId, isSnooze } or null.
 */
export function nextRing(alarms, snooze, now = Date.now()) {
    let best = null;
    for (const alarm of alarms) {
        const at = nextOccurrence(alarm, now);
        if (at !== null && (best === null || at < best.at)) {
            best = { at, alarmId: alarm.id, isSnooze: false };
        }
    }
    if (snooze && snooze.at > now && (best === null || snooze.at <= best.at)) {
        best = { at: snooze.at, alarmId: snooze.alarmId, isSnooze: true };
    }
    return best;
}

/** "Weekdays", "Every day", "Mon, Wed", "Once" … */
export function describeDays(days) {
    const sorted = [...days].sort((a, b) => a - b).join(',');
    if (days.length === 0) return 'Once';
    if (sorted === EVERY_DAY.join(',')) return 'Every day';
    if (sorted === WEEKDAYS.join(',')) return 'Weekdays';
    if (sorted === WEEKEND.join(',')) return 'Weekends';
    const names = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    // Show Monday-first, which is how most people read a week.
    return [1, 2, 3, 4, 5, 6, 0].filter(d => days.includes(d)).map(d => names[d]).join(', ');
}

/** "in 2 days, 17 h", "in 7 h 12 min", "in 4 min", "in under a minute" */
export function describeCountdown(at, now = Date.now()) {
    const totalMinutes = Math.ceil((at - now) / 60000);
    if (totalMinutes <= 1) return 'in under a minute';
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    if (hours >= 24) {
        const days = Math.floor(hours / 24);
        const rest = hours % 24;
        return `in ${days} day${days > 1 ? "s" : ""}${rest ? `, ${rest} h` : ""}`;
    }
    if (hours === 0) return `in ${minutes} min`;
    if (minutes === 0) return `in ${hours} h`;
    return `in ${hours} h ${minutes} min`;
}

export function formatTime(hour, minute, use24h = false) {
    const mm = String(minute).padStart(2, '0');
    if (use24h) return { time: `${String(hour).padStart(2, '0')}:${mm}`, period: '' };
    return { time: `${hour % 12 || 12}:${mm}`, period: hour >= 12 ? 'PM' : 'AM' };
}

export function newAlarmId() {
    return 'a' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}
