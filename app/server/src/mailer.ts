import nodemailer from 'nodemailer';

/** Email is optional: without SMTP_* env vars, callers fall back to logging
 *  (password reset link goes to the server console; the digest cron no-ops). */
export function isMailerConfigured(): boolean {
  return !!(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);
}

let transporter: nodemailer.Transporter | null = null;
function getTransporter() {
  if (transporter) return transporter;
  transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT) || 587,
    secure: process.env.SMTP_SECURE === 'true',
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  });
  return transporter;
}

export async function sendMail(opts: { to: string; subject: string; text: string }): Promise<void> {
  if (!isMailerConfigured()) return;
  const from = process.env.SMTP_FROM || process.env.SMTP_USER!;
  await getTransporter().sendMail({ from, to: opts.to, subject: opts.subject, text: opts.text });
}
