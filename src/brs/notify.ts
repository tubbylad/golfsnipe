export interface RunNotificationInput {
  status: 'won' | 'lost' | 'error';
  club: string;
  course: string;
  /** `YYYY/MM/DD`. */
  date: string;
  time: string;
  size: number;
  players?: string[];
  bookingRef?: string | null;
  reason?: string;
}

export interface RenderedNotification {
  subject: string;
  text: string;
  html: string;
  sms: string;
}

/** Canonicalise a UK mobile to `447XXXXXXXXX`, or null if it is not a UK mobile (e.g. a landline). */
export function normalizeUkMobile(input: string): string | null {
  let n = input.replace(/\D/g, '');
  if (n.startsWith('0')) n = '44' + n.slice(1);
  else if (n.startsWith('7') && n.length === 10) n = '44' + n;
  else if (!n.startsWith('44')) return null;
  return /^447\d{9}$/.test(n) ? n : null;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function formatDate(ymd: string): string {
  const [y, m, d] = ymd.split('/').map(Number);
  if (!y || !m || !d) return ymd;
  return `${d} ${MONTHS[m - 1]} ${y}`;
}

/** Pure renderer for a weekly-run outcome. Plain hyphens only (the app forbids em-dashes). */
export function renderRunNotification(input: RunNotificationInput): RenderedNotification {
  const when = `${input.time} on ${formatDate(input.date)}`;
  const where = `${input.course} (${input.club})`;
  const players = (input.players ?? []).join(', ');

  if (input.status === 'won') {
    const ref = input.bookingRef ? ` Ref ${input.bookingRef}.` : '';
    return {
      subject: `Booked: ${where} at ${when}`,
      sms: `Booked ${input.time} ${formatDate(input.date)} at ${where}.${ref}`,
      text: `Booked ${when} at ${where} for ${input.size}.${ref}\nPlayers: ${players}`,
      html:
        `<h2>Booked</h2><p>${where} at ${when} for ${input.size}.</p>` +
        `<p>Players: ${players}</p>` +
        (input.bookingRef ? `<p>Reference: <strong>${input.bookingRef}</strong></p>` : ''),
    };
  }
  if (input.status === 'lost') {
    return {
      subject: `Missed: ${where} at ${when}`,
      sms: `Missed ${input.time} ${formatDate(input.date)} at ${where}. We did not secure it.`,
      text: `We could not secure ${when} at ${where}. ${input.reason ?? ''}`.trim(),
      html: `<h2>Missed</h2><p>Could not secure ${when} at ${where}.</p><p>${input.reason ?? ''}</p>`,
    };
  }
  return {
    subject: `Booking error: ${where} at ${when}`,
    sms: `Booking error for ${input.time} ${formatDate(input.date)}: ${input.reason ?? 'unknown'}`,
    text: `An error occurred booking ${when} at ${where}: ${input.reason ?? 'unknown'}`,
    html: `<h2>Booking error</h2><p>${when} at ${where}</p><p>${input.reason ?? 'unknown'}</p>`,
  };
}
