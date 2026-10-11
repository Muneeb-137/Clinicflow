import nodemailer from "nodemailer";

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: Number(process.env.SMTP_PORT ?? 587),
  secure: false,

  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },

  /*
   * Certificates are verified by default. Some antivirus
   * tools intercept SMTP and re-sign it with their own
   * certificate; SMTP_ALLOW_SELF_SIGNED=true accepts that
   * on a development machine only.
   */
  ...(process.env.SMTP_ALLOW_SELF_SIGNED === "true" &&
  process.env.NODE_ENV !== "production"
    ? { tls: { rejectUnauthorized: false } }
    : {}),
});

/*
 * Escapes user-supplied text before placing it in email
 * HTML, so a name like <a href=...> cannot inject links.
 */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/*
 * Test the SMTP connection when the server starts.
 */
export async function verifyEmailTransport() {
  try {
    await transporter.verify();

    console.log(
      "ClinicFlow email service is ready.",
    );
  } catch (error) {
    console.error(
      "ClinicFlow email service failed:",
      error,
    );
  }
}

export async function sendPatientVerificationEmail(
  email: string,
  firstName: string,
  verificationToken: string,
) {
  const clientUrl =
    process.env.CLIENT_URL ?? "http://localhost:5173";

  const verificationUrl =
    `${clientUrl}/patient/verify-email?token=${encodeURIComponent(
      verificationToken,
    )}`;

  const info = await transporter.sendMail({
    from: `"ClinicFlow" <${process.env.SMTP_USER}>`,
    to: email,
    subject: "Verify your ClinicFlow account",

    html: `
      <div style="
        font-family: Arial, sans-serif;
        max-width: 560px;
        margin: 0 auto;
        padding: 32px;
        color: #0f172a;
      ">
        <h2 style="margin-bottom: 16px;">
          Welcome to ClinicFlow, ${escapeHtml(firstName)}
        </h2>

        <p style="
          color: #475569;
          line-height: 1.7;
        ">
          Your patient account has been created.
          Please verify your email address before signing in.
        </p>

        <a
          href="${verificationUrl}"
          style="
            display: inline-block;
            margin-top: 20px;
            background: #13B2B3;
            color: white;
            text-decoration: none;
            padding: 13px 22px;
            border-radius: 10px;
            font-weight: 600;
          "
        >
          Verify email
        </a>

        <p style="
          margin-top: 28px;
          color: #94a3b8;
          font-size: 13px;
        ">
          This verification link expires in 30 minutes.
        </p>
      </div>
    `,
  });

  console.log("EMAIL SENT SUCCESSFULLY:", {
  to: email,
  accepted: info.accepted,
  rejected: info.rejected,
  response: info.response,
  messageId: info.messageId,
});
}

export async function sendDoctorInviteEmail(
  email: string,
  firstName: string,
  inviteToken: string,
) {
  const clientUrl =
    process.env.CLIENT_URL ??
    "http://localhost:5173";

  const inviteUrl =
    `${clientUrl}/doctor/accept-invite?token=${encodeURIComponent(
      inviteToken,
    )}`;

  const info =
    await transporter.sendMail({
      from: `"ClinicFlow" <${process.env.SMTP_USER}>`,
      to: email,
      subject:
        "Activate your ClinicFlow Doctor Portal",

      html: `
        <div style="
          font-family: Arial, sans-serif;
          max-width: 560px;
          margin: 0 auto;
          padding: 32px;
          color: #0f172a;
        ">
          <h2 style="margin-bottom: 16px;">
            Welcome to ClinicFlow, Dr. ${escapeHtml(firstName)}
          </h2>

          <p style="
            color: #475569;
            line-height: 1.7;
          ">
            You have been invited to access the
            ClinicFlow Doctor Portal.
          </p>

          <p style="
            color: #475569;
            line-height: 1.7;
          ">
            Use the button below to create your
            password and activate your doctor account.
          </p>

          <a
            href="${inviteUrl}"
            style="
              display: inline-block;
              margin-top: 20px;
              background: #13B2B3;
              color: white;
              text-decoration: none;
              padding: 13px 22px;
              border-radius: 10px;
              font-weight: 600;
            "
          >
            Activate Doctor Portal
          </a>

          <p style="
            margin-top: 28px;
            color: #94a3b8;
            font-size: 13px;
            line-height: 1.6;
          ">
            This invitation link expires in 24 hours.
            If you were not expecting this invitation,
            you can ignore this email.
          </p>
        </div>
      `,
    });

  console.log(
    "DOCTOR INVITE EMAIL SENT:",
    {
      to: email,
      accepted: info.accepted,
      rejected: info.rejected,
      response: info.response,
      messageId: info.messageId,
    },
  );
}

/*
 * Invitation for an admin or receptionist login created
 * from the Staff Directory. The link lets the person set
 * their own password; nobody else ever sees it.
 */
export async function sendStaffInviteEmail(
  email: string,
  firstName: string,
  roleLabel: string,
  inviteToken: string,
) {
  const clientUrl =
    process.env.CLIENT_URL ??
    "http://localhost:5173";

  const inviteUrl =
    `${clientUrl}/staff/accept-invite?token=${encodeURIComponent(
      inviteToken,
    )}`;

  const info =
    await transporter.sendMail({
      from: `"ClinicFlow" <${process.env.SMTP_USER}>`,
      to: email,
      subject:
        "Activate your ClinicFlow staff account",

      html: `
        <div style="
          font-family: Arial, sans-serif;
          max-width: 560px;
          margin: 0 auto;
          padding: 32px;
          color: #0f172a;
        ">
          <h2 style="margin-bottom: 16px;">
            Welcome to ClinicFlow, ${escapeHtml(firstName)}
          </h2>

          <p style="
            color: #475569;
            line-height: 1.7;
          ">
            You have been added to the ClinicFlow
            staff portal as ${escapeHtml(roleLabel)}.
          </p>

          <p style="
            color: #475569;
            line-height: 1.7;
          ">
            Use the button below to create your
            password and activate your account.
          </p>

          <a
            href="${inviteUrl}"
            style="
              display: inline-block;
              margin-top: 20px;
              background: #13B2B3;
              color: white;
              text-decoration: none;
              padding: 13px 22px;
              border-radius: 10px;
              font-weight: 600;
            "
          >
            Activate staff account
          </a>

          <p style="
            margin-top: 28px;
            color: #94a3b8;
            font-size: 13px;
            line-height: 1.6;
          ">
            This invitation link expires in 24 hours.
            If you were not expecting this invitation,
            you can ignore this email.
          </p>
        </div>
      `,
    });

  console.log(
    "STAFF INVITE EMAIL SENT:",
    {
      to: email,
      accepted: info.accepted,
      rejected: info.rejected,
      response: info.response,
      messageId: info.messageId,
    },
  );
}
/*
 * Message from the public Contact page, sent to the
 * clinic's inbox (CONTACT_EMAIL, or the sending account).
 * Replying answers the person who wrote in.
 */
export async function sendContactMessageEmail(message: {
  firstName: string;
  lastName: string;
  email: string;
  clinicName: string;
  inquiryLabel: string;
  body: string;
}) {
  const to =
    process.env.CONTACT_EMAIL ?? process.env.SMTP_USER;

  if (!to) {
    throw new Error("CONTACT_EMAIL is not configured.");
  }

  const fullName = `${message.firstName} ${message.lastName}`.trim();

  const row = (label: string, value: string) =>
    value
      ? `<p style="margin: 4px 0; color: #475569;"><strong>${label}:</strong> ${escapeHtml(value)}</p>`
      : "";

  await transporter.sendMail({
    from: `"ClinicFlow" <${process.env.SMTP_USER}>`,
    to,
    replyTo: { name: fullName, address: message.email },
    subject: `Contact form: ${message.inquiryLabel} from ${fullName}`,
    text: [
      `From: ${fullName} <${message.email}>`,
      message.clinicName ? `Clinic: ${message.clinicName}` : "",
      `Topic: ${message.inquiryLabel}`,
      "",
      message.body,
    ]
      .filter((line, index) => line !== "" || index === 3)
      .join("\n"),
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; color: #0f172a;">
        <h2 style="margin-bottom: 12px;">New message from the Contact page</h2>
        ${row("From", `${fullName} <${message.email}>`)}
        ${row("Clinic", message.clinicName)}
        ${row("Topic", message.inquiryLabel)}
        <div style="margin-top: 16px; padding: 16px; border-radius: 10px; background: #f1f5f9; white-space: pre-wrap; line-height: 1.6;">${escapeHtml(message.body)}</div>
      </div>
    `,
  });
}

/*
 * Shared frame for the short account emails below.
 */
function accountEmailHtml(heading: string, body: string) {
  return `
    <div style="font-family: Arial, sans-serif; max-width: 560px; margin: 0 auto; padding: 32px; color: #0f172a;">
      <h2 style="margin-bottom: 16px;">${heading}</h2>
      ${body}
      <p style="margin-top: 28px; color: #94a3b8; font-size: 13px; line-height: 1.6;">
        ClinicFlow will never ask you for this code or your password by phone or email.
      </p>
    </div>
  `;
}

/*
 * Second sign-in step: the 6-digit code.
 */
export async function sendLoginCodeEmail(
  email: string,
  firstName: string,
  code: string,
) {
  await transporter.sendMail({
    from: `"ClinicFlow" <${process.env.SMTP_USER}>`,
    to: email,
    subject: `${code} is your ClinicFlow sign-in code`,
    text: `Hi ${firstName},\n\nYour ClinicFlow sign-in code is ${code}. It expires in 10 minutes.\n\nIf you didn't try to sign in, change your password: someone may know it.`,
    html: accountEmailHtml(
      `Your sign-in code`,
      `
        <p style="color: #475569; line-height: 1.7;">Hi ${escapeHtml(firstName)}, enter this code to finish signing in:</p>
        <p style="margin: 20px 0; font-size: 32px; font-weight: 700; letter-spacing: 8px; color: #0f172a;">${code}</p>
        <p style="color: #475569; line-height: 1.7;">It expires in 10 minutes. If you didn't try to sign in, change your password: someone may know it.</p>
      `,
    ),
  });
}

/*
 * "Forgot password" link.
 */
export async function sendPasswordResetEmail(
  email: string,
  firstName: string,
  resetUrl: string,
) {
  await transporter.sendMail({
    from: `"ClinicFlow" <${process.env.SMTP_USER}>`,
    to: email,
    subject: "Reset your ClinicFlow password",
    text: `Hi ${firstName},\n\nReset your password here (valid for 30 minutes):\n${resetUrl}\n\nIf you didn't ask for this, ignore this email; your password stays the same.`,
    html: accountEmailHtml(
      "Reset your password",
      `
        <p style="color: #475569; line-height: 1.7;">Hi ${escapeHtml(firstName)}, use the button below to choose a new password.</p>
        <a href="${resetUrl}" style="display: inline-block; margin-top: 12px; background: #13B2B3; color: white; text-decoration: none; padding: 13px 22px; border-radius: 10px; font-weight: 600;">Choose a new password</a>
        <p style="margin-top: 20px; color: #475569; line-height: 1.7;">The link works once and expires in 30 minutes. If you didn't ask for this, ignore this email; your password stays the same.</p>
      `,
    ),
  });
}

/*
 * Sent after any password change or reset, so the owner
 * notices if it wasn't them.
 */
export async function sendPasswordChangedEmail(
  email: string,
  firstName: string,
) {
  await transporter.sendMail({
    from: `"ClinicFlow" <${process.env.SMTP_USER}>`,
    to: email,
    subject: "Your ClinicFlow password was changed",
    text: `Hi ${firstName},\n\nYour ClinicFlow password was just changed and you were signed out on other devices.\n\nIf this wasn't you, use "Forgot password" on the sign-in page right away and contact the clinic.`,
    html: accountEmailHtml(
      "Your password was changed",
      `
        <p style="color: #475569; line-height: 1.7;">Hi ${escapeHtml(firstName)}, your ClinicFlow password was just changed, and you were signed out on your other devices.</p>
        <p style="color: #475569; line-height: 1.7;">If this wasn't you, use <strong>Forgot password</strong> on the sign-in page right away and contact the clinic.</p>
      `,
    ),
  });
}

/*
 * Patient changing their email: confirm the new inbox.
 */
export async function sendPatientEmailChangeEmail(
  newEmail: string,
  firstName: string,
  confirmUrl: string,
) {
  await transporter.sendMail({
    from: `"ClinicFlow" <${process.env.SMTP_USER}>`,
    to: newEmail,
    subject: "Confirm your new ClinicFlow email",
    text: `Hi ${firstName},\n\nConfirm this is your new email for ClinicFlow (link valid for 1 hour):\n${confirmUrl}\n\nIf you didn't ask for this, ignore this email.`,
    html: accountEmailHtml(
      "Confirm your new email",
      `
        <p style="color: #475569; line-height: 1.7;">Hi ${escapeHtml(firstName)}, confirm this is your new email for signing in to ClinicFlow.</p>
        <a href="${confirmUrl}" style="display: inline-block; margin-top: 12px; background: #13B2B3; color: white; text-decoration: none; padding: 13px 22px; border-radius: 10px; font-weight: 600;">Confirm email</a>
        <p style="margin-top: 20px; color: #475569; line-height: 1.7;">The link expires in 1 hour. If you didn't ask for this, ignore this email.</p>
      `,
    ),
  });
}
