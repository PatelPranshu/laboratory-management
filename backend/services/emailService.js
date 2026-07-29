const { Resend } = require('resend');

// Initialize Resend with fallback to prevent constructor crash on startup
const resend = new Resend(process.env.RESEND_API_KEY || 'missing_key');

// Centralized Sender Email Address
const DEFAULT_FROM = process.env.EMAIL_FROM || 'MyPathoLabs <no-reply@mypatholabs.tech>';

/**
 * Escapes HTML special characters in dynamic strings to prevent XSS / HTML injection in emails.
 */
function escapeHtml(str) {
  if (typeof str !== 'string') return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/**
 * Validates recipient email format before calling Resend API.
 */
function isValidEmail(email) {
  return typeof email === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

/**
 * Sends an invitation email to onboarding staff
 */
const sendInvitationEmail = async (email, role, inviteLink) => {
  try {
    if (!isValidEmail(email)) {
      throw new Error(`Invalid recipient email address: ${email}`);
    }

    const roleFormatted = role === 'Doctor' ? 'Doctor / Pathologist' : 'Lab Technician';
    const safeRole = escapeHtml(roleFormatted);
    const safeLink = escapeHtml(inviteLink);
    const safeYear = new Date().getFullYear();

    const htmlContent = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; color: #333333; line-height: 1.6; border: 1px solid #e5e7eb; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);">
        <div style="background-color: #0ea5e9; padding: 24px; text-align: center;">
          <h2 style="color: #ffffff; margin: 0; font-size: 24px; font-weight: bold; letter-spacing: 0.5px;">MyPathoLabs Platform</h2>
        </div>
        <div style="padding: 32px 24px;">
          <h3 style="margin-top: 0; font-size: 20px; color: #1e293b;">You've been invited!</h3>
          <p style="margin-bottom: 24px; font-size: 16px;">
            You have been invited to join the <strong>MyPathoLabs</strong> platform as a <strong>${safeRole}</strong>.
            Click the button below to complete your registration and set your secure password.
          </p>
          <div style="text-align: center; margin: 32px 0;">
            <a href="${safeLink}" style="display: inline-block; padding: 14px 28px; background-color: #0ea5e9; color: #ffffff; text-decoration: none; border-radius: 8px; font-weight: bold; font-size: 16px; box-shadow: 0 4px 6px -1px rgba(14, 165, 233, 0.2);">
              Set Up Account
            </a>
          </div>
          <p style="font-size: 14px; color: #64748b; margin-top: 32px;">
            If the button above does not work, copy and paste this link into your browser:
            <br />
            <a href="${safeLink}" style="color: #0ea5e9; word-break: break-all;">${safeLink}</a>
          </p>
        </div>
        <div style="background-color: #f8fafc; padding: 16px; text-align: center; border-top: 1px solid #e5e7eb; padding-bottom: 20px;">
          <p style="font-size: 12px; color: #94a3b8; margin: 0;">
            This invitation link will expire in 24 hours.
            <br />
            &copy; ${safeYear} MyPathoLabs. All rights reserved.
          </p>
        </div>
      </div>
    `;

    const textContent = `You have been invited to join MyPathoLabs as a ${roleFormatted}.\n\nPlease complete your setup using this link:\n${inviteLink}\n\nThis invitation link will expire in 24 hours.`;

    console.log(`[EMAIL SERVICE] Attempting to send invite to ${email}...`);
    
    const data = await resend.emails.send({
      from: DEFAULT_FROM,
      to: [email.trim()],
      subject: `Invitation to join MyPathoLabs as a ${roleFormatted}`,
      html: htmlContent,
      text: textContent
    });

    if (data.error) {
      console.error('[EMAIL SERVICE] Resend API Error:', data.error);
      throw new Error(data.error.message);
    }

    console.log(`[EMAIL SERVICE] Invitation successfully sent to ${email}. ID: ${data.data.id}`);
    return data;
  } catch (error) {
    console.error('[EMAIL SERVICE] Failed to send email:', error.message);
    throw error;
  }
};

const sendPasswordResetEmail = async (email, resetUrl) => {
  try {
    if (!isValidEmail(email)) {
      throw new Error(`Invalid recipient email address: ${email}`);
    }

    const safeResetUrl = escapeHtml(resetUrl);
    const safeYear = new Date().getFullYear();

    const htmlContent = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; color: #333333; line-height: 1.6; border: 1px solid #e5e7eb; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);">
        <div style="background-color: #0ea5e9; padding: 24px; text-align: center;">
          <h2 style="color: #ffffff; margin: 0; font-size: 24px; font-weight: bold; letter-spacing: 0.5px;">MyPathoLabs</h2>
        </div>
        <div style="padding: 32px 24px;">
          <h3 style="margin-top: 0; font-size: 20px; color: #1e293b;">Password Reset Request</h3>
          <p style="margin-bottom: 24px; font-size: 16px;">
            We received a request to reset your password. Click the button below to choose a new password.
          </p>
          <div style="text-align: center; margin: 32px 0;">
            <a href="${safeResetUrl}" style="display: inline-block; padding: 14px 28px; background-color: #0ea5e9; color: #ffffff; text-decoration: none; border-radius: 8px; font-weight: bold; font-size: 16px; box-shadow: 0 4px 6px -1px rgba(14, 165, 233, 0.2);">
              Reset Password
            </a>
          </div>
          <p style="font-size: 14px; color: #64748b; margin-top: 32px;">
            If you did not request a password reset, you can safely ignore this email. Only a person with access to your email can reset your account password.
          </p>
          <p style="font-size: 14px; color: #64748b; margin-top: 16px;">
            If the button above does not work, copy and paste this link into your browser:
            <br />
            <a href="${safeResetUrl}" style="color: #0ea5e9; word-break: break-all;">${safeResetUrl}</a>
          </p>
        </div>
        <div style="background-color: #f8fafc; padding: 16px; text-align: center; border-top: 1px solid #e5e7eb; padding-bottom: 20px;">
          <p style="font-size: 12px; color: #94a3b8; margin: 0;">
            This link will expire in 15 minutes.
            <br />
            &copy; ${safeYear} MyPathoLabs. All rights reserved.
          </p>
        </div>
      </div>
    `;

    const textContent = `Password Reset Request - MyPathoLabs\n\nClick the link below to reset your password:\n${resetUrl}\n\nThis link will expire in 15 minutes. If you did not request a reset, please ignore this message.`;

    console.log(`[EMAIL SERVICE] Attempting to send password reset to ${email}...`);
    
    const data = await resend.emails.send({
      from: DEFAULT_FROM,
      to: [email.trim()],
      subject: `Password Reset Request - MyPathoLabs`,
      html: htmlContent,
      text: textContent
    });

    if (data.error) {
      throw new Error(data.error.message);
    }
    return data;
  } catch (error) {
    console.error('[EMAIL SERVICE] Failed to send password reset email:', error.message);
    throw error;
  }
};

const sendVerificationEmail = async (email, verifyUrl) => {
  try {
    if (!isValidEmail(email)) {
      throw new Error(`Invalid recipient email address: ${email}`);
    }

    const safeVerifyUrl = escapeHtml(verifyUrl);
    const safeYear = new Date().getFullYear();

    const htmlContent = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; color: #333333; line-height: 1.6; border: 1px solid #e5e7eb; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);">
        <div style="background-color: #0ea5e9; padding: 24px; text-align: center;">
          <h2 style="color: #ffffff; margin: 0; font-size: 24px; font-weight: bold; letter-spacing: 0.5px;">MyPathoLabs</h2>
        </div>
        <div style="padding: 32px 24px;">
          <h3 style="margin-top: 0; font-size: 20px; color: #1e293b;">Verify Your Email Address</h3>
          <p style="margin-bottom: 24px; font-size: 16px;">
            Welcome to MyPathoLabs! Please click the button below to verify your email address and activate your account.
          </p>
          <div style="text-align: center; margin: 32px 0;">
            <a href="${safeVerifyUrl}" style="display: inline-block; padding: 14px 28px; background-color: #0ea5e9; color: #ffffff; text-decoration: none; border-radius: 8px; font-weight: bold; font-size: 16px; box-shadow: 0 4px 6px -1px rgba(14, 165, 233, 0.2);">
              Verify Email
            </a>
          </div>
          <p style="font-size: 14px; color: #64748b; margin-top: 32px;">
            If the button above does not work, copy and paste this link into your browser:
            <br />
            <a href="${safeVerifyUrl}" style="color: #0ea5e9; word-break: break-all;">${safeVerifyUrl}</a>
          </p>
        </div>
        <div style="background-color: #f8fafc; padding: 16px; text-align: center; border-top: 1px solid #e5e7eb; padding-bottom: 20px;">
          <p style="font-size: 12px; color: #94a3b8; margin: 0;">
            This link will expire in 24 hours.
            <br />
            &copy; ${safeYear} MyPathoLabs. All rights reserved.
          </p>
        </div>
      </div>
    `;

    const textContent = `Welcome to MyPathoLabs!\n\nPlease verify your email address using this link:\n${verifyUrl}\n\nThis link will expire in 24 hours.`;

    console.log(`[EMAIL SERVICE] Attempting to send email verification to ${email}...`);
    
    const data = await resend.emails.send({
      from: DEFAULT_FROM,
      to: [email.trim()],
      subject: `Verify your email - MyPathoLabs`,
      html: htmlContent,
      text: textContent
    });

    if (data.error) {
      throw new Error(data.error.message);
    }
    return data;
  } catch (error) {
    console.error('[EMAIL SERVICE] Failed to send email verification:', error.message);
    throw error;
  }
};

const sendDataExportReadyEmail = async (email, settingsUrl) => {
  try {
    if (!isValidEmail(email)) {
      throw new Error(`Invalid recipient email address: ${email}`);
    }

    const safeExportUrl = escapeHtml(`${settingsUrl}#data-export`);
    const safeYear = new Date().getFullYear();

    const htmlContent = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; color: #333333; line-height: 1.6; border: 1px solid #e5e7eb; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);">
        <div style="background-color: #0ea5e9; padding: 24px; text-align: center;">
          <h2 style="color: #ffffff; margin: 0; font-size: 24px; font-weight: bold; letter-spacing: 0.5px;">MyPathoLabs</h2>
        </div>
        <div style="padding: 32px 24px;">
          <h3 style="margin-top: 0; font-size: 20px; color: #1e293b;">Your Data Export is Ready</h3>
          <p style="margin-bottom: 24px; font-size: 16px;">
            The data export you requested has finished processing and is now ready to download.
          </p>
          <div style="text-align: center; margin: 32px 0;">
            <a href="${safeExportUrl}" style="display: inline-block; padding: 14px 28px; background-color: #0ea5e9; color: #ffffff; text-decoration: none; border-radius: 8px; font-weight: bold; font-size: 16px; box-shadow: 0 4px 6px -1px rgba(14, 165, 233, 0.2);">
              Download Data
            </a>
          </div>
          <p style="font-size: 14px; color: #64748b; margin-top: 32px;">
            If the button above does not work, copy and paste this link into your browser:
            <br />
            <a href="${safeExportUrl}" style="color: #0ea5e9; word-break: break-all;">${safeExportUrl}</a>
          </p>
          <p style="font-size: 14px; color: #e11d48; margin-top: 16px; font-weight: bold;">
            For security reasons, this data export will automatically expire and be deleted from our servers in 7 days.
          </p>
        </div>
        <div style="background-color: #f8fafc; padding: 16px; text-align: center; border-top: 1px solid #e5e7eb; padding-bottom: 20px;">
          <p style="font-size: 12px; color: #94a3b8; margin: 0;">
            &copy; ${safeYear} MyPathoLabs. All rights reserved.
          </p>
        </div>
      </div>
    `;

    const textContent = `Your Data Export is Ready - MyPathoLabs\n\nDownload your data export here:\n${settingsUrl}#data-export\n\nFor security reasons, this data export will automatically expire in 7 days.`;

    console.log(`[EMAIL SERVICE] Attempting to send data export notification to ${email}...`);
    
    const data = await resend.emails.send({
      from: DEFAULT_FROM,
      to: [email.trim()],
      subject: `Your Data Export is Ready - MyPathoLabs`,
      html: htmlContent,
      text: textContent
    });

    if (data.error) {
      throw new Error(data.error.message);
    }
    return data;
  } catch (error) {
    console.error('[EMAIL SERVICE] Failed to send data export email:', error.message);
    throw error;
  }
};

module.exports = {
  sendInvitationEmail,
  sendPasswordResetEmail,
  sendVerificationEmail,
  sendDataExportReadyEmail
};
