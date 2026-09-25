import { test } from 'node:test';
import assert from 'node:assert/strict';
import { nextOccurrence, nextRing, describeDays, describeCountdown, formatTime } from '../www/js/schedule.js';

// Wed 2026-09-23 22:00 local time
const WED_10PM = new Date(2026, 8, 23, 22, 0, 0).getTime();
const at = (d, h, m) => new Date(2026, 8, d, h, m, 0).getTime();

test('one-time alarm rings at the next matching clock time', () => {
    const a = { id: 'x', hour: 6, minute: 45, days: [], enabled: true };
    assert.equal(nextOccurrence(a, WED_10PM), at(24, 6, 45));
});

test('one-time alarm later today rings today', () => {
    const a = { id: 'x', hour: 23, minute: 30, days: [], enabled: true };
    assert.equal(nextOccurrence(a, WED_10PM), at(23, 23, 30));
});

test('alarm set for exactly now rolls to the next occurrence', () => {
    const a = { id: 'x', hour: 22, minute: 0, days: [], enabled: true };
    assert.equal(nextOccurrence(a, WED_10PM), at(24, 22, 0));
});

test('weekday alarm on Friday night skips to Monday', () => {
    const friNight = new Date(2026, 8, 25, 21, 0).getTime();
    const a = { id: 'x', hour: 6, minute: 45, days: [1, 2, 3, 4, 5], enabled: true };
    assert.equal(nextOccurrence(a, friNight), at(28, 6, 45));
});

test('single-day weekly alarm that already passed today waits a full week', () => {
    const wed7am = new Date(2026, 8, 23, 7, 0).getTime();
    const a = { id: 'x', hour: 6, minute: 0, days: [3], enabled: true };
    assert.equal(nextOccurrence(a, wed7am), at(30, 6, 0));
});

test('disabled alarm never rings', () => {
    assert.equal(nextOccurrence({ id: 'x', hour: 6, minute: 0, days: [], enabled: false }, WED_10PM), null);
});

test('nextRing picks the earliest enabled alarm', () => {
    const alarms = [
        { id: 'late', hour: 8, minute: 30, days: [], enabled: true },
        { id: 'early', hour: 6, minute: 45, days: [], enabled: true },
        { id: 'off', hour: 5, minute: 0, days: [], enabled: false },
    ];
    assert.deepEqual(nextRing(alarms, null, WED_10PM), { at: at(24, 6, 45), alarmId: 'early', isSnooze: false });
});

test('a pending snooze wins when it is sooner', () => {
    const alarms = [{ id: 'a', hour: 6, minute: 45, days: [], enabled: true }];
    const snooze = { at: WED_10PM + 5 * 60000, alarmId: 'a' };
    assert.deepEqual(nextRing(alarms, snooze, WED_10PM), { at: snooze.at, alarmId: 'a', isSnooze: true });
});

test('an expired snooze is ignored', () => {
    const alarms = [{ id: 'a', hour: 6, minute: 45, days: [], enabled: true }];
    assert.equal(nextRing(alarms, { at: WED_10PM - 1000, alarmId: 'a' }, WED_10PM).isSnooze, false);
});

test('nothing enabled means nothing rings', () => {
    assert.equal(nextRing([], null, WED_10PM), null);
});

test('describeDays names common patterns', () => {
    assert.equal(describeDays([]), 'Once');
    assert.equal(describeDays([5, 1, 2, 3, 4]), 'Weekdays');
    assert.equal(describeDays([6, 0]), 'Weekends');
    assert.equal(describeDays([0, 1, 2, 3, 4, 5, 6]), 'Every day');
    assert.equal(describeDays([0, 3, 1]), 'Mon, Wed, Sun');
});

test('countdown wording', () => {
    assert.equal(describeCountdown(WED_10PM + 30000, WED_10PM), 'in under a minute');
    assert.equal(describeCountdown(WED_10PM + 4 * 60000, WED_10PM), 'in 4 min');
    assert.equal(describeCountdown(WED_10PM + 120 * 60000, WED_10PM), 'in 2 h');
    assert.equal(describeCountdown(WED_10PM + 432 * 60000, WED_10PM), 'in 7 h 12 min');
    assert.equal(describeCountdown(WED_10PM + (65 * 60 + 47) * 60000, WED_10PM), 'in 2 days, 17 h');
    assert.equal(describeCountdown(WED_10PM + 24 * 3600000, WED_10PM), 'in 1 day');
});

test('12-hour formatting', () => {
    assert.deepEqual(formatTime(0, 5), { time: '12:05', period: 'AM' });
    assert.deepEqual(formatTime(13, 30), { time: '1:30', period: 'PM' });
    assert.deepEqual(formatTime(13, 30, true), { time: '13:30', period: '' });
});
