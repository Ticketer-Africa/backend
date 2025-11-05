export interface TicketDetails {
  ticketId: string;
  code: string;
  categoryName: string;
  qrCodeDataUrl: string;
}

export function ticketPurchaseBuyerTemplate(
  name: string,
  event: string,
  tickets: TicketDetails[],
): string {
  return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <meta http-equiv="X-UA-Compatible" content="IE=edge">
      <title>Ticket Purchase Confirmation - Ticketer</title>
    </head>
    <body style="margin: 0; padding: 0; background-color: #f5f5f5; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, Arial, sans-serif; line-height: 1.6;">
      <!-- Preheader text -->
      <div style="display: none; max-height: 0; overflow: hidden; font-size: 1px; line-height: 1px; color: transparent;">
        Your tickets are confirmed! View your QR codes and event details inside.
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
                  
                  <!-- Success message -->
                  <div style="text-align: center; margin-bottom: 32px;">
                    <h2 style="font-size: 24px; color: #333333; margin: 0 0 16px 0; font-weight: 600;">
                      Thanks for your purchase, ${name}!
                    </h2>
                    <p style="font-size: 16px; color: #666666; margin: 0; font-weight: 400;">
                      Your ticket(s) for <strong>${event}</strong> are confirmed.
                    </p>
                  </div>

                  <!-- Tickets section -->
                  <div style="background-color: #f9f9f9; border: 1px solid #e0e0e0; border-radius: 8px; padding: 32px; margin-bottom: 32px;">
                    <h3 style="font-size: 18px; color: #333333; margin: 0 0 16px 0; font-weight: 600;">
                      Your Tickets
                    </h3>
                    ${tickets
                      .map(
                        (ticket, index) => `
                          <!-- Ticket card ${index + 1} -->
                          <div style="border: 1px solid #e0e0e0; border-radius: 8px; margin-bottom: 24px; padding: 24px; background-color: #ffffff; box-shadow: 0 2px 4px rgba(0,0,0,0.05);">
                            <h4 style="font-size: 18px; color: #333333; margin: 0 0 12px 0; font-weight: 600;">
                              ${ticket.categoryName}
                            </h4>
                            <div style="margin-bottom: 20px;">
                              <p style="font-size: 15px; color: #666666; margin: 4px 0; line-height: 1.5;">
                                <strong>Ticket ID:</strong> <code style="background: #f3f4f6; padding: 2px 8px; border-radius: 4px; font-size: 13px;">${ticket.ticketId}</code>
                              </p>
                              <p style="font-size: 15px; color: #666666; margin: 4px 0; line-height: 1.5;">
                                <strong>Code:</strong> <code style="background: #f3f4f6; padding: 2px 8px; border-radius: 4px; font-size: 13px;">${ticket.code}</code>
                              </p>
                            </div>
                            <div style="text-align: center;">
                              <img src="${ticket.qrCodeDataUrl}" alt="QR Code for Ticket ${ticket.code}" style="width: 160px; height: 160px; border-radius: 8px; border: 1px solid #e0e0e0; display: inline-block;" />
                              <p style="font-size: 13px; color: #666666; margin: 12px 0 0 0;">
                                Scan at venue
                              </p>
                            </div>
                          </div>
                        `,
                      )
                      .join('')}
                  </div>

                  <!-- Action buttons -->
                  <div style="text-align: center; margin: 32px 0;">
                    <a href="https://ticketer.com/dashboard" style="display: inline-block; background-color: #1E88E5; color: #ffffff; text-decoration: none; padding: 12px 24px; border-radius: 6px; font-size: 14px; font-weight: 500; margin: 0 8px 8px 8px;">
                      View in Dashboard
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
                      <li>Arrive 30 minutes before the event starts</li>
                      <li>Keep your QR code ready for quick entry</li>
                      <li>Check your dashboard for ticket details</li>
                      <li>Contact support if you encounter any issues</li>
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
                    This email was sent because you purchased tickets through our platform.
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

export function ticketPurchaseOrganizerTemplate(
  organizerName: string,
  event: string,
  ticketCount: number,
  proceeds: number,
  ticketCategories: string[],
): string {
  return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <meta http-equiv="X-UA-Compatible" content="IE=edge">
      <title>Ticket Sale Notification - Ticketer</title>
    </head>
    <body style="margin: 0; padding: 0; background-color: #f5f5f5; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, Arial, sans-serif; line-height: 1.6;">
      <!-- Preheader text -->
      <div style="display: none; max-height: 0; overflow: hidden; font-size: 1px; line-height: 1px; color: transparent;">
        New ticket sales for ${event}! Check your proceeds and event details.
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
                  
                  <!-- Success message -->
                  <div style="text-align: center; margin-bottom: 32px;">
                    <h2 style="font-size: 24px; color: #333333; margin: 0 0 16px 0; font-weight: 600;">
                      New Ticket Sale, ${organizerName}!
                    </h2>
                    <p style="font-size: 16px; color: #666666; margin: 0; font-weight: 400;">
                      Great news! <strong>${ticketCount}</strong> ticket(s) for <strong>${event}</strong> have been sold.
                    </p>
                  </div>

                  <!-- Sale details card -->
                  <div style="background-color: #f9f9f9; border: 1px solid #e0e0e0; border-radius: 8px; padding: 24px; margin-bottom: 32px;">
                    <h3 style="font-size: 18px; color: #333333; margin: 0 0 12px 0; font-weight: 600;">
                      Sale Details
                    </h3>
                    <p style="font-size: 14px; color: #666666; margin: 8px 0; line-height: 1.5;">
                      <strong>Tickets Sold:</strong> ${ticketCount}<br>
                      <strong>Categories:</strong> ${ticketCategories.join(', ')}<br>
                      <strong>Proceeds:</strong> NGN ${proceeds.toFixed(2)}
                    </p>
                  </div>

                  <!-- Action buttons -->
                  <div style="text-align: center; margin: 32px 0;">
                    <a href="https://ticketer.com/dashboard" style="display: inline-block; background-color: #1E88E5; color: #ffffff; text-decoration: none; padding: 12px 24px; border-radius: 6px; font-size: 14px; font-weight: 500; margin: 0 8px 8px 8px;">
                      View in Dashboard
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
                      <li>Proceeds are credited to your wallet instantly</li>
                      <li>Monitor real-time sales in your dashboard</li>
                      <li>Contact support for any discrepancies</li>
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
                      Organize events and track sales seamlessly with <a href="https://ticketer.com" style="color: #1E88E5; text-decoration: underline;">Ticketer</a>
                    </p>
                    <p style="color: #666666; margin: 8px 0; font-size: 14px; line-height: 1.5;">
                      Questions? Reach us at <a href="mailto:ticketerafrica@gmail.com" style="color: #1E88E5; text-decoration: underline;">ticketerafrica@gmail.com</a>
                    </p>
                  </div>
                  
                  <p style="font-size: 12px; color: #999999; margin: 16px 0 0 0; line-height: 1.4;">
                    © 2025 Ticketer. All rights reserved.<br>
                    This email was sent because you are an event organizer on our platform.
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

export function ticketPurchaseAdminTemplate(
  adminName: string,
  event: string,
  ticketCount: number,
  platformCut: number,
  buyerName: string,
  ticketCategories: string[],
): string {
  return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <meta http-equiv="X-UA-Compatible" content="IE=edge">
      <title>Platform Transaction Notification - Ticketer</title>
    </head>
    <body style="margin: 0; padding: 0; background-color: #f5f5f5; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, Arial, sans-serif; line-height: 1.6;">
      <!-- Preheader text -->
      <div style="display: none; max-height: 0; overflow: hidden; font-size: 1px; line-height: 1px; color: transparent;">
        New transaction for ${event}! View platform cut and details.
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
                  
                  <!-- Success message -->
                  <div style="text-align: center; margin-bottom: 32px;">
                    <h2 style="font-size: 24px; color: #333333; margin: 0 0 16px 0; font-weight: 600;">
                      New Transaction, ${adminName}
                    </h2>
                    <p style="font-size: 16px; color: #666666; margin: 0; font-weight: 400;">
                      A purchase for <strong>${event}</strong> has been completed.
                    </p>
                  </div>

                  <!-- Transaction details card -->
                  <div style="background-color: #f9f9f9; border: 1px solid #e0e0e0; border-radius: 8px; padding: 24px; margin-bottom: 32px;">
                    <h3 style="font-size: 18px; color: #333333; margin: 0 0 12px 0; font-weight: 600;">
                      Transaction Details
                    </h3>
                    <p style="font-size: 14px; color: #666666; margin: 8px 0; line-height: 1.5;">
                      <strong>Buyer:</strong> ${buyerName}<br>
                      <strong>Tickets:</strong> ${ticketCount}<br>
                      <strong>Categories:</strong> ${ticketCategories.join(', ')}<br>
                      <strong>Platform Cut:</strong> NGN ${platformCut.toFixed(2)}
                    </p>
                  </div>

                  <!-- Action buttons -->
                  <div style="text-align: center; margin: 32px 0;">
                    <a href="https://ticketer.com/admin-dashboard" style="display: inline-block; background-color: #1E88E5; color: #ffffff; text-decoration: none; padding: 12px 24px; border-radius: 6px; font-size: 14px; font-weight: 500; margin: 0 8px 8px 8px;">
                      View in Admin Dashboard
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
                      <li>Platform cut is credited to the admin wallet</li>
                      <li>Review transaction details in the admin dashboard</li>
                      <li>Contact support for any issues</li>
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
                      Manage events and transactions with <a href="https://ticketer.com" style="color: #1E88E5; text-decoration: underline;">Ticketer</a>
                    </p>
                    <p style="color: #666666; margin: 8px 0; font-size: 14px; line-height: 1.5;">
                      Monitor platform earnings in your wallet
                    </p>
                    <p style="color: #666666; margin: 8px 0; font-size: 14px; line-height: 1.5;">
                      Questions? Reach us at <a href="mailto:ticketerafrica@gmail.com" style="color: #1E88E5; text-decoration: underline;">ticketerafrica@gmail.com</a>
                    </p>
                  </div>
                  
                  <p style="font-size: 12px; color: #999999; margin: 16px 0 0 0; line-height: 1.4;">
                    © 2025 Ticketer. All rights reserved.<br>
                    This email was sent because you are an admin on our platform.
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

export function ticketResaleBuyerTemplate(
  name: string,
  event: string,
  tickets: TicketDetails[],
): string {
  return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <meta http-equiv="X-UA-Compatible" content="IE=edge">
      <title>Resale Ticket Purchase Confirmation - Ticketer</title>
    </head>
    <body style="margin: 0; padding: 0; background-color: #f5f5f5; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, Arial, sans-serif; line-height: 1.6;">
      <!-- Preheader text -->
      <div style="display: none; max-height: 0; overflow: hidden; font-size: 1px; line-height: 1px; color: transparent;">
        Your resale tickets for ${event} are confirmed! View your QR codes and details.
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
                  
                  <!-- Success message -->
                  <div style="text-align: center; margin-bottom: 32px;">
                    <h2 style="font-size: 24px; color: #333333; margin: 0 0 16px 0; font-weight: 600;">
                      Your Resale Ticket Purchase, ${name}!
                    </h2>
                    <p style="font-size: 16px; color: #666666; margin: 0; font-weight: 400;">
                      Your purchase of <strong>${tickets.length}</strong> resale ticket(s) for <strong>${event}</strong> is confirmed.
                    </p>
                  </div>

                  <!-- Tickets section -->
                  <div style="background-color: #f9f9f9; border: 1px solid #e0e0e0; border-radius: 8px; padding: 32px; margin-bottom: 32px;">
                    <h3 style="font-size: 18px; color: #333333; margin: 0 0 16px 0; font-weight: 600;">
                      Your Tickets
                    </h3>
                    ${tickets
                      .map(
                        (ticket, index) => `
                          <!-- Ticket card ${index + 1} -->
                          <div style="border: 1px solid #e0e0e0; border-radius: 8px; margin-bottom: 24px; padding: 24px; background-color: #ffffff; box-shadow: 0 2px 4px rgba(0,0,0,0.05);">
                            <h4 style="font-size: 18px; color: #333333; margin: 0 0 12px 0; font-weight: 600;">
                              ${ticket.categoryName}
                            </h4>
                            <div style="margin-bottom: 20px;">
                              <p style="font-size: 15px; color: #666666; margin: 4px 0; line-height: 1.5;">
                                <strong>Ticket ID:</strong> <code style="background: #f3f4f6; padding: 2px 8px; border-radius: 4px; font-size: 13px;">${ticket.ticketId}</code>
                              </p>
                              <p style="font-size: 15px; color: #666666; margin: 4px 0; line-height: 1.5;">
                                <strong>Code:</strong> <code style="background: #f3f4f6; padding: 2px 8px; border-radius: 4px; font-size: 13px;">${ticket.code}</code>
                              </p>
                            </div>
                            <div style="text-align: center;">
                              <img src="${ticket.qrCodeDataUrl}" alt="QR Code for Ticket ${ticket.code}" style="width: 160px; height: 160px; border-radius: 8px; border: 1px solid #e0e0e0; display: inline-block;" />
                              <p style="font-size: 13px; color: #666666; margin: 12px 0 0 0;">
                                Scan at venue
                              </p>
                            </div>
                          </div>
                        `,
                      )
                      .join('')}
                  </div>

                  <!-- Action buttons -->
                  <div style="text-align: center; margin: 32px 0;">
                    <a href="https://ticketer.com/dashboard" style="display: inline-block; background-color: #1E88E5; color: #ffffff; text-decoration: none; padding: 12px 24px; border-radius: 6px; font-size: 14px; font-weight: 500; margin: 0 8px 8px 8px;">
                      View in Dashboard
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
                      <li>Arrive 30 minutes before the event starts</li>
                      <li>Keep your QR code ready for quick entry</li>
                      <li>Check your dashboard for ticket details</li>
                      <li>Contact support if you encounter any issues</li>
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
                    This email was sent because you purchased resale tickets through our platform.
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

export function ticketResaleSellerTemplate(
  name: string,
  event: string,
  ticketCount: number,
  proceeds: number,
  ticketCategories: string[],
): string {
  return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <meta http-equiv="X-UA-Compatible" content="IE=edge">
      <title>Ticket Resale Confirmation - Ticketer</title>
    </head>
    <body style="margin: 0; padding: 0; background-color: #f5f5f5; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, Arial, sans-serif; line-height: 1.6;">
      <!-- Preheader text -->
      <div style="display: none; max-height: 0; overflow: hidden; font-size: 1px; line-height: 1px; color: transparent;">
        Your tickets for ${event} have been sold! Check your proceeds.
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
                  
                  <!-- Success message -->
                  <div style="text-align: center; margin-bottom: 32px;">
                    <h2 style="font-size: 24px; color: #333333; margin: 0 0 16px 0; font-weight: 600;">
                      Your Ticket Sold, ${name}!
                    </h2>
                    <p style="font-size: 16px; color: #666666; margin: 0; font-weight: 400;">
                      Your <strong>${ticketCount}</strong> ticket(s) for <strong>${event}</strong> have been sold.
                    </p>
                  </div>

                  <!-- Sale details card -->
                  <div style="background-color: #f9f9f9; border: 1px solid #e0e0e0; border-radius: 8px; padding: 24px; margin-bottom: 32px;">
                    <h3 style="font-size: 18px; color: #333333; margin: 0 0 12px 0; font-weight: 600;">
                      Sale Details
                    </h3>
                    <p style="font-size: 14px; color: #666666; margin: 8px 0; line-height: 1.5;">
                      <strong>Tickets Sold:</strong> ${ticketCount}<br>
                      <strong>Categories:</strong> ${ticketCategories.join(', ')}<br>
                      <strong>Proceeds:</strong> NGN ${proceeds.toFixed(2)}
                    </p>
                  </div>

                  <!-- Action buttons -->
                  <div style="text-align: center; margin: 32px 0;">
                    <a href="https://ticketer.com/dashboard" style="display: inline-block; background-color: #1E88E5; color: #ffffff; text-decoration: none; padding: 12px 24px; border-radius: 6px; font-size: 14px; font-weight: 500; margin: 0 8px 8px 8px;">
                      View in Dashboard
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
                      <li>Proceeds are credited to your wallet instantly</li>
                      <li>Check transaction details in your dashboard</li>
                      <li>Contact support for any issues</li>
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
                    This email was sent because you sold tickets through our platform.
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

export function ticketResaleOrganizerTemplate(
  organizerName: string,
  event: string,
  ticketCount: number,
  royalty: number,
  ticketCategories: string[],
): string {
  return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <meta http-equiv="X-UA-Compatible" content="IE=edge">
      <title>Resale Royalty Notification - Ticketer</title>
    </head>
    <body style="margin: 0; padding: 0; background-color: #f5f5f5; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, Arial, sans-serif; line-height: 1.6;">
      <!-- Preheader text -->
      <div style="display: none; max-height: 0; overflow: hidden; font-size: 1px; line-height: 1px; color: transparent;">
        Resale activity for ${event}! Check your royalty earnings.
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
                  
                  <!-- Success message -->
                  <div style="text-align: center; margin-bottom: 32px;">
                    <h2 style="font-size: 24px; color: #333333; margin: 0 0 16px 0; font-weight: 600;">
                      Resale Activity, ${organizerName}
                    </h2>
                    <p style="font-size: 16px; color: #666666; margin: 0; font-weight: 400;">
                      <strong>${ticketCount}</strong> ticket(s) for <strong>${event}</strong> have been resold.
                    </p>
                  </div>

                  <!-- Resale details card -->
                  <div style="background-color: #f9f9f9; border: 1px solid #e0e0e0; border-radius: 8px; padding: 24px; margin-bottom: 32px;">
                    <h3 style="font-size: 18px; color: #333333; margin: 0 0 12px 0; font-weight: 600;">
                      Resale Details
                    </h3>
                    <p style="font-size: 14px; color: #666666; margin: 8px 0; line-height: 1.5;">
                      <strong>Tickets Resold:</strong> ${ticketCount}<br>
                      <strong>Categories:</strong> ${ticketCategories.join(', ')}<br>
                      <strong>Royalty:</strong> NGN ${royalty.toFixed(2)}
                    </p>
                  </div>

                  <!-- Action buttons -->
                  <div style="text-align: center; margin: 32px 0;">
                    <a href="https://ticketer.com/dashboard" style="display: inline-block; background-color: #1E88E5; color: #ffffff; text-decoration: none; padding: 12px 24px; border-radius: 6px; font-size: 14px; font-weight: 500; margin: 0 8px 8px 8px;">
                      View in Dashboard
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
                      <li>Royalties are credited to your wallet instantly</li>
                      <li>Monitor resale activity in your dashboard</li>
                      <li>Contact support for any discrepancies</li>
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
                      Organize events and track sales seamlessly with <a href="https://ticketer.com" style="color: #1E88E5; text-decoration: underline;">Ticketer</a>
                    </p>
                    <p style="color: #666666; margin: 8px 0; font-size: 14px; line-height: 1.5;">
                      Questions? Reach us at <a href="mailto:ticketerafrica@gmail.com" style="color: #1E88E5; text-decoration: underline;">ticketerafrica@gmail.com</a>
                    </p>
                  </div>
                  
                  <p style="font-size: 12px; color: #999999; margin: 16px 0 0 0; line-height: 1.4;">
                    © 2025 Ticketer. All rights reserved.<br>
                    This email was sent because you are an event organizer on our platform.
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

export function ticketResaleAdminTemplate(
  adminName: string,
  event: string,
  ticketCount: number,
  platformCut: number,
  buyerName: string,
  sellerName: string,
  ticketCategories: string[],
): string {
  return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <meta http-equiv="X-UA-Compatible" content="IE=edge">
      <title>Resale Transaction Notification - Ticketer</title>
    </head>
    <body style="margin: 0; padding: 0; background-color: #f5f5f5; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, Arial, sans-serif; line-height: 1.6;">
      <!-- Preheader text -->
      <div style="display: none; max-height: 0; overflow: hidden; font-size: 1px; line-height: 1px; color: transparent;">
        New resale transaction for ${event}! View platform cut and details.
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
                  
                  <!-- Success message -->
                  <div style="text-align: center; margin-bottom: 32px;">
                    <h2 style="font-size: 24px; color: #333333; margin: 0 0 16px 0; font-weight: 600;">
                      New Resale Transaction, ${adminName}
                    </h2>
                    <p style="font-size: 16px; color: #666666; margin: 0; font-weight: 400;">
                      A resale for <strong>${event}</strong> has been completed.
                    </p>
                  </div>

                  <!-- Transaction details card -->
                  <div style="background-color: #f9f9f9; border: 1px solid #e0e0e0; border-radius: 8px; padding: 24px; margin-bottom: 32px;">
                    <h3 style="font-size: 18px; color: #333333; margin: 0 0 12px 0; font-weight: 600;">
                      Transaction Details
                    </h3>
                    <p style="font-size: 14px; color: #666666; margin: 8px 0; line-height: 1.5;">
                      <strong>Seller:</strong> ${sellerName}<br>
                      <strong>Buyer:</strong> ${buyerName}<br>
                      <strong>Tickets:</strong> ${ticketCount}<br>
                      <strong>Categories:</strong> ${ticketCategories.join(', ')}<br>
                      <strong>Platform Cut:</strong> NGN ${platformCut.toFixed(2)}
                    </p>
                  </div>

                  <!-- Action buttons -->
                  <div style="text-align: center; margin: 32px 0;">
                    <a href="https://ticketer.com/admin-dashboard" style="display: inline-block; background-color: #1E88E5; color: #ffffff; text-decoration: none; padding: 12px 24px; border-radius: 6px; font-size: 14px; font-weight: 500; margin: 0 8px 8px 8px;">
                      View in Admin Dashboard
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
                      <li>Platform cut is credited to the admin wallet</li>
                      <li>Review transaction details in the admin dashboard</li>
                      <li>Contact support for any issues</li>
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
                      Manage events and transactions with <a href="https://ticketer.com" style="color: #1E88E5; text-decoration: underline;">Ticketer</a>
                    </p>
                    <p style="color: #666666; margin: 8px 0; font-size: 14px; line-height: 1.5;">
                      Monitor platform earnings in your wallet
                    </p>
                    <p style="color: #666666; margin: 8px 0; font-size: 14px; line-height: 1.5;">
                      Questions? Reach us at <a href="mailto:ticketerafrica@gmail.com" style="color: #1E88E5; text-decoration: underline;">ticketerafrica@gmail.com</a>
                    </p>
                  </div>
                  
                  <p style="font-size: 12px; color: #999999; margin: 16px 0 0 0; line-height: 1.4;">
                    © 2025 Ticketer. All rights reserved.<br>
                    This email was sent because you are an admin on our platform.
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

export function ticketResaleTemplate(name: string, event: string): string {
  return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <meta http-equiv="X-UA-Compatible" content="IE=edge">
      <title>Ticket Listed for Resale - Ticketer</title>
    </head>
    <body style="margin: 0; padding: 0; background-color: #f5f5f5; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, Arial, sans-serif; line-height: 1.6;">
      <!-- Preheader text -->
      <div style="display: none; max-height: 0; overflow: hidden; font-size: 1px; line-height: 1px; color: transparent;">
        Your ticket for ${event} is listed for resale! Manage your listings.
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
                  
                  <!-- Success message -->
                  <div style="text-align: center; margin-bottom: 32px;">
                    <h2 style="font-size: 24px; color: #333333; margin: 0 0 16px 0; font-weight: 600;">
                      Ticket Listed, ${name}!
                    </h2>
                    <p style="font-size: 16px; color: #666666; margin: 0; font-weight: 400;">
                      Your ticket for <strong>${event}</strong> has been listed for resale.
                    </p>
                  </div>

                  <!-- Action buttons -->
                  <div style="text-align: center; margin: 32px 0;">
                    <a href="https://ticketer.com/dashboard" style="display: inline-block; background-color: #1E88E5; color: #ffffff; text-decoration: none; padding: 12px 24px; border-radius: 6px; font-size: 14px; font-weight: 500; margin: 0 8px 8px 8px;">
                      View in Dashboard
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
                      <li>You’ll be notified when your ticket is sold</li>
                      <li>Manage your listings in your dashboard</li>
                      <li>Contact support for any issues</li>
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
                    This email was sent because you listed a ticket for resale on our platform.
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
