import { readFileSync } from 'node:fs';
import { expect, test } from 'vitest';

const fixture = (name: string) =>
  readFileSync(new URL(`./__fixtures__/${name}`, import.meta.url), 'utf8');

const teeSheet = () => JSON.parse(fixture('tee-sheet-data.json'));
const notLive = () => JSON.parse(fixture('tee-sheet-not-live.json'));
const roster = () => JSON.parse(fixture('member-data.json'));

test('parseLoginToken extracts the login_form[_token] value', async () => {
  const { parseLoginToken } = await import('./parse');
  const token = parseLoginToken(fixture('login-page.html'));
  expect(token).toBe(
    '338a0b311832229ef7f7e980.N5sPkHcZk3BxolDxY1EzxW7Pe4WIoFSYKWYTcXQyO0E.Wu1VxCZ71xI3lmSzDmRxlgWoA_O_9i3TbgVdOhpjXjBZ9mjPE17gQRbXFQ',
  );
});

test('parseLoginToken throws when the token field is absent', async () => {
  const { parseLoginToken } = await import('./parse');
  expect(() => parseLoginToken('<form><input name="other"></form>')).toThrow();
});

test('findSlot returns a bookable empty slot with its lock url', async () => {
  const { findSlot } = await import('./parse');
  const slot = findSlot(teeSheet(), '12:15');
  expect(slot).not.toBeNull();
  expect(slot!.bookable).toBe(true);
  expect(slot!.booked).toBe(false);
  expect(slot!.url).toContain('/monifieth/bookings/book/');
  expect(slot!.participants).toEqual([]);
});

test('findSlot returns null for a marker row (sunrise)', async () => {
  const { findSlot } = await import('./parse');
  expect(findSlot(teeSheet(), '05:36')).toBeNull();
});

test('findSlot returns null for a time not on the sheet', async () => {
  const { findSlot } = await import('./parse');
  expect(findSlot(teeSheet(), '03:00')).toBeNull();
});

test('findSlot marks a booked view-only slot not bookable, with participants and no url', async () => {
  const { findSlot } = await import('./parse');
  const slot = findSlot(teeSheet(), '07:30');
  expect(slot!.bookable).toBe(false);
  expect(slot!.url).toBeNull();
  expect(slot!.participants.length).toBeGreaterThan(0);
});

test('parseReleaseTime returns the ISO release time when a date is not yet live', async () => {
  const { parseReleaseTime } = await import('./parse');
  const rel = parseReleaseTime(notLive());
  expect(rel).not.toBeNull();
  expect(rel!.time).toBe('2026-08-14T19:00:00+01:00');
  expect(rel!.title).toContain('become live');
});

test('parseReleaseTime returns null when the date is already live (empty rules)', async () => {
  const { parseReleaseTime } = await import('./parse');
  expect(parseReleaseTime(teeSheet())).toBeNull();
});

test('parseRoster maps the raw member/data array to golferId/first/last', async () => {
  const { parseRoster } = await import('./parse');
  const members = parseRoster(roster());
  expect(members).toHaveLength(6);
  expect(members[0]).toEqual({
    golferId: 1001,
    firstName: 'Alex',
    lastName: 'Sample',
    initials: '',
  });
});

test('matchMembers finds a unique member by full name (either order)', async () => {
  const { parseRoster, matchMembers } = await import('./parse');
  const members = parseRoster(roster());
  expect(matchMembers(members, 'Alex Sample').map((m) => m.golferId)).toEqual([1001]);
  expect(matchMembers(members, 'Sample, Alex').map((m) => m.golferId)).toEqual([1001]);
});

test('matchMembers returns every member sharing a surname (multi-match)', async () => {
  const { parseRoster, matchMembers } = await import('./parse');
  const members = parseRoster(roster());
  expect(matchMembers(members, 'Sample').map((m) => m.golferId).sort()).toEqual([1001, 1006]);
});

test('matchMembers returns [] when nobody matches', async () => {
  const { parseRoster, matchMembers } = await import('./parse');
  expect(matchMembers(parseRoster(roster()), 'Nobody Here')).toEqual([]);
});

test('parseBrsUrl pulls slug + platform + course from a modern tee-sheet URL', async () => {
  const { parseBrsUrl } = await import('./parse');
  expect(parseBrsUrl('https://members.brsgolf.com/monifieth/tee-sheet/3')).toEqual({
    slug: 'monifieth',
    platform: 'modern',
    courseId: 3,
  });
});

test('parseBrsUrl handles a bare club URL (no course), and legacy hosts', async () => {
  const { parseBrsUrl } = await import('./parse');
  expect(parseBrsUrl('https://members.brsgolf.com/monifieth')).toEqual({
    slug: 'monifieth',
    platform: 'modern',
    courseId: null,
  });
  expect(parseBrsUrl('https://www.brsgolf.com/oldclub')).toEqual({
    slug: 'oldclub',
    platform: 'legacy',
    courseId: null,
  });
});

test('parseBrsUrl finds the course inside a booking URL, trims, and rejects non-BRS input', async () => {
  const { parseBrsUrl } = await import('./parse');
  expect(parseBrsUrl('  https://members.brsgolf.com/monifieth/bookings/book/TOK/3/20260822/0746 ')?.courseId).toBe(3);
  expect(parseBrsUrl('https://google.com/x')).toBeNull();
  expect(parseBrsUrl('not a url')).toBeNull();
});

test('parseBookingForm extracts action, CSRF token, and the pre-selected booker golfer-id', async () => {
  const { parseBookingForm } = await import('./parse');
  const form = parseBookingForm(fixture('booking-form.html'));
  expect(form.action).toBe('/monifieth/bookings/store/3/20260819/1419');
  expect(form.csrfToken).toBe(
    'FAKECSRF0000000000000000.aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.bbbbbbbbbbbbbbbbbbbbbbbbbbb',
  );
  expect(form.bookerGolferId).toBe(1001);
});
