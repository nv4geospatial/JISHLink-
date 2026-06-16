import { Resend } from "resend";

const resend = new Resend(process.env["RESEND_API_KEY"]);
const FROM = "JISHLink HR <onboarding@resend.dev>";

export async function sendApprovalEmail(opts: {
  to: string;
  name: string;
  workplace: string;
  designation: string;
  username: string;
  tempPassword: string;
}): Promise<void> {
  await resend.emails.send({
    from: FROM,
    to: opts.to,
    subject: "Welcome to JISHLink — Your account is ready",
    html: `
      <h2>Welcome to JISHLink, ${opts.name}!</h2>
      <p>Your employee account has been created. Here are your details:</p>
      <ul>
        <li><strong>Workplace:</strong> ${opts.workplace}</li>
        <li><strong>Designation:</strong> ${opts.designation}</li>
        <li><strong>Username:</strong> ${opts.username}</li>
        <li><strong>Temporary Password:</strong> ${opts.tempPassword}</li>
      </ul>
      <p>Please download the JISHLink app and log in with the above credentials. You will be asked to change your password on first login.</p>
      <p>Best regards,<br/>JISHLink Consulting India Private Limited</p>
    `,
  });
}

export async function sendRejectionEmail(opts: {
  to: string;
  name: string;
  remarks: string;
}): Promise<void> {
  await resend.emails.send({
    from: FROM,
    to: opts.to,
    subject: "JISHLink — Please update your registration details",
    html: `
      <h2>Dear ${opts.name},</h2>
      <p>We have reviewed your registration submission. Unfortunately, we need some additional information or corrections before we can proceed.</p>
      <p><strong>Remarks from the admin:</strong></p>
      <blockquote>${opts.remarks}</blockquote>
      <p>Please resubmit the Google Form with the corrected information.</p>
      <p>Best regards,<br/>JISHLink Consulting India Private Limited</p>
    `,
  });
}
