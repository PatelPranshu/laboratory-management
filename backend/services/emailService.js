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
 * Sends an invitation email to onboarding staff with Lab details and Inviter Name
 */
const sendInvitationEmail = async (email, role, inviteLink, labName = 'MyPathoLabs Laboratory', inviterName = 'Lab Administrator') => {
  try {
    if (!isValidEmail(email)) {
      throw new Error(`Invalid recipient email address: ${email}`);
    }

    const roleFormatted = role === 'Doctor' ? 'Doctor / Pathologist' : 'Lab Technician';
    const safeRole = escapeHtml(roleFormatted);
    const safeLabName = escapeHtml(labName);
    const safeInviterName = escapeHtml(inviterName);
    const safeEmail = escapeHtml(email);
    const safeLink = escapeHtml(inviteLink);
    const safeYear = new Date().getFullYear();

    const htmlContent = `
      <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; max-width: 600px; margin: 0 auto; color: #1e293b; line-height: 1.6; border: 1px solid #cbd5e1; border-radius: 16px; overflow: hidden; box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.05); background-color: #ffffff;">
        
        <!-- Header Banner -->
        <div style="background: linear-gradient(135deg, #0284c7 0%, #0f172a 100%); padding: 32px 24px; text-align: center; border-bottom: 3px solid #0ea5e9;">
          <div style="display: inline-block; padding: 6px 16px; background: rgba(255, 255, 255, 0.15); border-radius: 20px; color: #e0f2fe; font-size: 11px; font-weight: 700; letter-spacing: 1.5px; text-transform: uppercase; margin-bottom: 12px; border: 1px solid rgba(255, 255, 255, 0.2);">
            VERIFIED LABORATORY INVITATION
          </div>
          <h1 style="color: #ffffff; margin: 0; font-size: 26px; font-weight: 800; letter-spacing: -0.5px;">MyPathoLabs Platform</h1>
        </div>

        <!-- Body Content -->
        <div style="padding: 36px 32px;">
          <h2 style="margin-top: 0; font-size: 22px; color: #0f172a; font-weight: 700;">You've Been Invited to Join Staff</h2>
          <p style="margin-bottom: 24px; font-size: 15px; color: #475569;">
            <strong>${safeInviterName}</strong> has invited you to join the official medical team at <strong>${safeLabName}</strong> via the MyPathoLabs Platform.
          </p>

          <!-- Invitation Details Highlight Card -->
          <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-left: 4px solid #0ea5e9; border-radius: 12px; padding: 20px 24px; margin: 28px 0;">
            <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
              <tr>
                <td style="padding: 6px 0; color: #64748b; font-weight: 600; width: 140px;">Laboratory:</td>
                <td style="padding: 6px 0; color: #0f172a; font-weight: 700;">${safeLabName}</td>
              </tr>
              <tr>
                <td style="padding: 6px 0; color: #64748b; font-weight: 600;">Invited By:</td>
                <td style="padding: 6px 0; color: #0f172a; font-weight: 600;">${safeInviterName}</td>
              </tr>
              <tr>
                <td style="padding: 6px 0; color: #64748b; font-weight: 600;">Assigned Role:</td>
                <td style="padding: 6px 0; color: #0284c7; font-weight: 700;">${safeRole}</td>
              </tr>
              <tr>
                <td style="padding: 6px 0; color: #64748b; font-weight: 600;">Invited Email:</td>
                <td style="padding: 6px 0; color: #0f172a; font-weight: 500;">${safeEmail}</td>
              </tr>
            </table>
          </div>

          <!-- Primary CTA Button -->
          <div style="text-align: center; margin: 36px 0;">
            <a href="${safeLink}" style="display: inline-block; padding: 15px 36px; background: linear-gradient(135deg, #0ea5e9 0%, #0284c7 100%); color: #ffffff; text-decoration: none; border-radius: 12px; font-weight: 700; font-size: 15px; box-shadow: 0 10px 20px -5px rgba(14, 165, 233, 0.4); transition: all 0.2s ease;">
              Complete Staff Setup & Set Password &rarr;
            </a>
          </div>

          <!-- Direct Link Box -->
          <div style="background-color: #f1f5f9; padding: 14px 18px; border-radius: 8px; font-size: 12px; color: #64748b; margin-top: 28px; border: 1px dashed #cbd5e1;">
            <span style="font-weight: 700; color: #475569;">Having trouble clicking the button?</span> Copy and paste this URL into your browser:
            <div style="margin-top: 6px; word-break: break-all;">
              <a href="${safeLink}" style="color: #0284c7; font-weight: 600; text-decoration: underline;">${safeLink}</a>
            </div>
          </div>

          <!-- Security & Expiration Warning -->
          <div style="margin-top: 28px; padding: 12px 16px; background-color: #fffbebfb; border: 1px solid #fef08a; border-radius: 8px; color: #854d0e; font-size: 12.5px;">
            ⚠️ <strong>Security Notice:</strong> This invitation token is encrypted and strictly single-use. It will expire in 24 hours. If you were not expecting an invitation from <strong>${safeLabName}</strong>, please disregard this message.
          </div>
        </div>

        <!-- Footer Banner -->
        <div style="background-color: #0f172a; padding: 20px; text-align: center; border-top: 1px solid #334155; color: #94a3b8; font-size: 12px;">
          <p style="margin: 0 0 6px 0; font-weight: 600; color: #cbd5e1;">MyPathoLabs Enterprise Healthcare System</p>
          <p style="margin: 0;">
            &copy; ${safeYear} MyPathoLabs. All rights reserved. &bull; Official Staff Onboarding Notice
          </p>
        </div>
      </div>
    `;

    const textContent = `Official Staff Invitation - MyPathoLabs Platform\n\n${inviterName} has invited you to join ${labName} as a ${roleFormatted}.\n\nInvitation Details:\n- Laboratory: ${labName}\n- Invited By: ${inviterName}\n- Role: ${roleFormatted}\n- Recipient: ${email}\n\nPlease complete your registration and set your secure password using this link:\n${inviteLink}\n\nSecurity Notice: This link will expire in 24 hours.`;

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
