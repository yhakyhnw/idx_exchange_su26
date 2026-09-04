export type EmailDraft = {
  to: string;
  subject: string;
  body: string;
};

// STEP 1: Draft — never send without approval
export async function draftEmail(to: string, subject: string, body: string) {
  return { draft: { to, subject, body }, status: "pending_approval" };
}

// STEP 2: Send only after explicit human confirmation
export async function sendApprovedEmail(draft: EmailDraft): Promise<void> {
  const { default: nodemailer } = await import("nodemailer");
  const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASSWORD },
  });
  await transporter.sendMail({
    from: process.env.EMAIL_USER,
    to: draft.to,
    subject: draft.subject,
    html: draft.body,
  });
}
