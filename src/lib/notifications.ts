import { normalizeUkMobile, renderRunNotification, type RunNotificationInput } from '../brs/notify';
import { env } from './env';

const RESEND_URL = 'https://api.resend.com/emails';
const PURESMS_URL = 'https://connect-api.divergent.cloud/sms/send';

/** Send one email via Resend. No-ops (with a warning) when RESEND_API_KEY is unset. */
export async function sendEmail(
  to: string,
  subject: string,
  html: string,
  text: string,
): Promise<void> {
  const key = env.RESEND_API_KEY;
  if (!key) {
    console.warn('[notify] RESEND_API_KEY unset; skipping email');
    return;
  }
  const from = env.RESEND_FROM ?? 'GolfSnipe <noreply@golfsnipe.com>';
  const res = await fetch(RESEND_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from, to, subject, html, text }),
  });
  if (!res.ok) throw new Error(`Resend ${res.status}: ${await res.text()}`);
}

/** Send one SMS via PureSMS. No-ops when SMS_API_KEY is unset or the number is not a UK mobile. */
export async function sendSms(to: string, body: string): Promise<void> {
  const key = env.SMS_API_KEY;
  if (!key) {
    console.warn('[notify] SMS_API_KEY unset; skipping sms');
    return;
  }
  const recipient = normalizeUkMobile(to);
  if (!recipient) {
    console.warn(`[notify] "${to}" is not a UK mobile; skipping sms`);
    return;
  }
  const res = await fetch(env.SMS_ENDPOINT ?? PURESMS_URL, {
    method: 'POST',
    headers: { 'X-Api-Key': key, 'Content-Type': 'application/json' },
    body: JSON.stringify({ sender: env.SMS_SENDER ?? 'GolfSnipe', recipient, content: body }),
  });
  if (!res.ok) throw new Error(`PureSMS ${res.status}: ${await res.text()}`);
}

export interface RunRecipient {
  email?: string | null;
  phone?: string | null;
}

/** Render a run outcome and fan it out to email + SMS. Best-effort: logs failures, never throws. */
export async function notifyRun(input: RunNotificationInput, to: RunRecipient): Promise<void> {
  const n = renderRunNotification(input);
  await Promise.all([
    to.email
      ? sendEmail(to.email, n.subject, n.html, n.text).catch((e) =>
          console.error('[notify] email failed', e),
        )
      : Promise.resolve(),
    to.phone
      ? sendSms(to.phone, n.sms).catch((e) => console.error('[notify] sms failed', e))
      : Promise.resolve(),
  ]);
}
