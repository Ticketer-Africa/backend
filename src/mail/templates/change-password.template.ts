export function changePasswordTemplate(name: string): string {
  return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <meta http-equiv="X-UA-Compatible" content="IE=edge">
      <title>Password Changed - Ticketer</title>
    </head>
    <body style="margin: 0; padding: 0; background-color: #f5f5f5; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, Arial, sans-serif; line-height: 1.6;">
      <!-- Preheader text -->
      <div style="display: none; max-height: 0; overflow: hidden; font-size: 1px; line-height: 1px; color: transparent;">
        Your Ticketer password has been changed, ${name}. Verify this was you.
      </div>

      <!-- Main container -->
      <table align="center" border="0" cellpadding="0" cellspacing="0" width="100%" style="max-width: 600px; margin: 0 auto; background-color: transparent;">
        <tr>
          <td style="padding: 40px 20px;">
<!-- Header -->
<table border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color: #FFFFFF; border-radius: 12px 12px 0 0; border-bottom: 1px solid #e0e0e0;">
  <tr>
    <td style="padding: 40px 48px; text-align: center;">
      <div style="display: inline-flex; align-items: center; justify-content: center; gap: 16px;">
        <img 
          src="https://res.cloudinary.com/dszax8c6n/image/upload/v1757404493/logo_obefmi.png" 
          alt="Ticketer Logo" 
          width="32" 
          height="32" 
          style="display: block; max-width: 32px; height: auto;"
        />
        <h1 style="font-size: 24px; color: #1E88E5; margin: 0; font-weight: 600; letter-spacing: -0.3px; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, Arial, sans-serif;">
          Ticketer
        </h1>
      </div>
    </td>
  </tr>
</table>

            <!-- Main content -->
            <table border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color: #ffffff; border-radius: 0 0 8px 8px;">
              <tr>
                <td style="padding: 40px;">
                  
                  <!-- Password change message -->
                  <div style="text-align: center; margin-bottom: 32px;">
                    <h2 style="font-size: 24px; color: #333333; margin: 0 0 16px 0; font-weight: 600;">
                      Password Changed, ${name}!
                    </h2>
                    <p style="font-size: 16px; color: #666666; margin: 0; font-weight: 400;">
                      Your <strong>Ticketer</strong> password has been successfully updated.
                    </p>
                  </div>

                  <!-- Security notice -->
                  <div style="background-color: #f9f9f9; border: 1px solid #e0e0e0; border-radius: 8px; padding: 24px; margin-bottom: 32px;">
                    <h3 style="font-size: 18px; color: #333333; margin: 0 0 12px 0; font-weight: 600;">
                      Account Security
                    </h3>
                    <p style="font-size: 14px; color: #666666; margin: 0; line-height: 1.5;">
                      If you didn’t make this change, please take action to secure your account immediately by resetting your password or contacting our support team.
                    </p>
                  </div>

                  <!-- Action buttons -->
                  <div style="text-align: center; margin: 32px 0;">
                    <a href="https://ticketer.com/reset-password" style="display: inline-block; background-color: #1E88E5; color: #ffffff; text-decoration: none; padding: 12px 24px; border-radius: 6px; font-size: 14px; font-weight: 500; margin: 0 8px 8px 8px;">
                      Reset Password
                    </a>
                    <a href="mailto:ticketerafrica@gmail.com" style="display: inline-block; background-color: transparent; color: #1E88E5; text-decoration: none; padding: 12px 24px; border: 1px solid #1E88E5; border-radius: 6px; font-size: 14px; font-weight: 500; margin: 0 8px 8px 8px;">
                      Contact Support
                    </a>
                  </div>

                  <!-- Important info -->
                  <div style="border-left: 3px solid #1E88E5; padding: 16px 20px; margin: 32px 0; background-color: #f9f9f9;">
                    <h4 style="color: #333333; margin: 0 0 8px 0; font-size: 16px; font-weight: 600;">
                      What to do next:
                    </h4>
                    <ul style="color: #666666; margin: 0; padding-left: 20px; font-size: 14px; line-height: 1.6;">
                      <li>Check your account security settings in your dashboard</li>
                      <li>Reset your password immediately if this change wasn’t you</li>
                      <li>Contact support if you suspect unauthorized access</li>
                    </ul>
                  </div>

                </td>
              </tr>
            </table>

            <!-- Footer -->
            <table border="0" cellpadding="0" cellspacing="0" width="100%" style="margin-top: 32px;">
              <tr>
                <td style="text-align: center; padding: 24px 20px;">
                  <p style="font-size: 14px; color: #666666; margin: 0 0 16px 0;">
                    – The Ticketer Team
                  </p>
                  
                  <div style="background-color: #ffffff; border: 1px solid #e0e0e0; border-radius: 8px; padding: 20px; margin: 20px 0;">
                    <p style="color: #333333; margin: 8px 0; font-size: 14px; line-height: 1.5; font-weight: 500;">
                      Discover events, buy tickets, and resell securely with <a href="https://ticketer.com" style="color: #1E88E5; text-decoration: underline;">Ticketer</a>
                    </p>
                    <p style="color: #666666; margin: 8px 0; font-size: 14px; line-height: 1.5;">
                      Questions? Reach us at <a href="mailto:ticketerafrica@gmail.com" style="color: #1E88E5; text-decoration: underline;">ticketerafrica@gmail.com</a>
                    </p>
                  </div>
                  
                  <p style="font-size: 12px; color: #999999; margin: 16px 0 0 0; line-height: 1.4;">
                    © 2025 Ticketer. All rights reserved.<br>
                    This email was sent because your account password was changed.
                  </p>
                </td>
              </tr>
            </table>

          </td>
        </tr>
      </table>
    </body>
    </html>
  `;
}
