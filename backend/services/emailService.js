const { Resend } = require('resend');

// Initialize Resend with fallback to prevent constructor crash on startup
const resend = new Resend(process.env.RESEND_API_KEY || 'missing_key');

/**
 * Sends an invitation email to onboarding staff
 * @param {string} email - Recipient email address
 * @param {string} role - Role of the invited staff (e.g., Doctor, LabTech)
 * @param {string} inviteLink - The unique registration URL for this invitation
 * @returns {Promise<Object>} The response from Resend API
 */
const sendInvitationEmail = async (email, role, inviteLink) => {
  try {
    const roleFormatted = role === 'Doctor' ? 'Doctor / Pathologist' : 'Lab Technician';

    const htmlContent = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; color: #333333; line-height: 1.6; border: 1px solid #e5e7eb; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);">
        <div style="background-color: #0ea5e9; padding: 24px; text-align: center;">
          <h2 style="color: #ffffff; margin: 0; font-size: 24px; font-weight: bold; letter-spacing: 0.5px;">MyPathoLabs Platform</h2>
        </div>
        <div style="padding: 32px 24px;">
          <h3 style="margin-top: 0; font-size: 20px; color: #1e293b;">You've been invited!</h3>
          <p style="margin-bottom: 24px; font-size: 16px;">
            You have been invited to join the <strong>MyPathoLabs</strong> platform as a <strong>${roleFormatted}</strong>.
            Click the button below to complete your registration and set your secure password.
          </p>
          <div style="text-align: center; margin: 32px 0;">
            <a href="${inviteLink}" style="display: inline-block; padding: 14px 28px; background-color: #0ea5e9; color: #ffffff; text-decoration: none; border-radius: 8px; font-weight: bold; font-size: 16px; box-shadow: 0 4px 6px -1px rgba(14, 165, 233, 0.2);">
              Set Up Account
            </a>
          </div>
          <p style="font-size: 14px; color: #64748b; margin-top: 32px;">
            If the button above does not work, copy and paste this link into your browser:
            <br />
            <a href="${inviteLink}" style="color: #0ea5e9; word-break: break-all;">${inviteLink}</a>
          </p>
        </div>
        <div style="background-color: #f8fafc; padding: 16px; text-align: center; border-top: 1px solid #e5e7eb; padding-bottom: 20px;">
          <p style="font-size: 12px; color: #94a3b8; margin: 0;">
            This invitation link will expire in 24 hours.
            <br />
            &copy; ${new Date().getFullYear()} MyPathoLabs. All rights reserved.
          </p>
        </div>
      </div>
    `;

    console.log(`[EMAIL SERVICE] Attempting to send invite to ${email}...`);
    
    // Using onboarding@resend.dev as required by the free tier
    const data = await resend.emails.send({
      from: 'MyPathoLabs <no-reply@mypatholabs.tech>',
      to: [email],
      subject: `Invitation to join MyPathoLabs as a ${roleFormatted}`,
      html: htmlContent,
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
            <a href="${resetUrl}" style="display: inline-block; padding: 14px 28px; background-color: #0ea5e9; color: #ffffff; text-decoration: none; border-radius: 8px; font-weight: bold; font-size: 16px; box-shadow: 0 4px 6px -1px rgba(14, 165, 233, 0.2);">
              Reset Password
            </a>
          </div>
          <p style="font-size: 14px; color: #64748b; margin-top: 32px;">
            If you did not request a password reset, you can safely ignore this email. Only a person with access to your email can reset your account password.
          </p>
          <p style="font-size: 14px; color: #64748b; margin-top: 16px;">
            If the button above does not work, copy and paste this link into your browser:
            <br />
            <a href="${resetUrl}" style="color: #0ea5e9; word-break: break-all;">${resetUrl}</a>
          </p>
        </div>
        <div style="background-color: #f8fafc; padding: 16px; text-align: center; border-top: 1px solid #e5e7eb; padding-bottom: 20px;">
          <p style="font-size: 12px; color: #94a3b8; margin: 0;">
            This link will expire in 15 minutes.
            <br />
            &copy; ${new Date().getFullYear()} MyPathoLabs. All rights reserved.
          </p>
        </div>
      </div>
    `;

    console.log(`[EMAIL SERVICE] Attempting to send password reset to ${email}...`);
    
    const data = await resend.emails.send({
      from: 'MyPathoLabs Security <no-reply@mypatholabs.tech>',
      to: [email],
      subject: `Password Reset Request - MyPathoLabs`,
      html: htmlContent,
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
            <a href="${verifyUrl}" style="display: inline-block; padding: 14px 28px; background-color: #0ea5e9; color: #ffffff; text-decoration: none; border-radius: 8px; font-weight: bold; font-size: 16px; box-shadow: 0 4px 6px -1px rgba(14, 165, 233, 0.2);">
              Verify Email
            </a>
          </div>
          <p style="font-size: 14px; color: #64748b; margin-top: 32px;">
            If the button above does not work, copy and paste this link into your browser:
            <br />
            <a href="${verifyUrl}" style="color: #0ea5e9; word-break: break-all;">${verifyUrl}</a>
          </p>
        </div>
        <div style="background-color: #f8fafc; padding: 16px; text-align: center; border-top: 1px solid #e5e7eb; padding-bottom: 20px;">
          <p style="font-size: 12px; color: #94a3b8; margin: 0;">
            This link will expire in 24 hours.
            <br />
            &copy; ${new Date().getFullYear()} MyPathoLabs. All rights reserved.
          </p>
        </div>
      </div>
    `;

    console.log(`[EMAIL SERVICE] Attempting to send email verification to ${email}...`);
    
    const data = await resend.emails.send({
      from: 'MyPathoLabs Onboarding <no-reply@mypatholabs.tech>',
      to: [email],
      subject: `Verify your email - MyPathoLabs`,
      html: htmlContent,
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

module.exports = {
  sendInvitationEmail,
  sendPasswordResetEmail,
  sendVerificationEmail
};
