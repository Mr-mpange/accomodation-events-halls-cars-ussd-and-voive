const africasTalking = require('./africasTalking');
const nodemailer = require('nodemailer');
const logger = require('../utils/logger');
const db = require('../config/database');

class NotificationService {
  constructor() {
    this.emailTransporter = null;
    this.initializeEmailTransporter();
  }

  // Initialize email transporter
  initializeEmailTransporter() {
    try {
      if (process.env.EMAIL_HOST && process.env.EMAIL_USER && process.env.EMAIL_PASS) {
        this.emailTransporter = nodemailer.createTransporter({
          host: process.env.EMAIL_HOST,
          port: process.env.EMAIL_PORT || 587,
          secure: process.env.EMAIL_SECURE === 'true',
          auth: {
            user: process.env.EMAIL_USER,
            pass: process.env.EMAIL_PASS
          }
        });
        
        logger.info('Email transporter initialized');
      } else {
        logger.warn('Email configuration not found, email notifications disabled');
      }
    } catch (error) {
      logger.error('Failed to initialize email transporter', error);
    }
  }

  // Send booking confirmation to customer
  async sendBookingConfirmation(booking, service, owner) {
    try {
      const message = `Booking Confirmed!\n\nRef: ${booking.reference}\nService: ${service.name}\nProvider: ${owner.business_name}\nContact: ${owner.phone}\n\nThank you for using Visitor Assist!`;
      
      // Send SMS
      await africasTalking.sendSMS(booking.phone_number, message);
      
      // Send email if available
      if (this.emailTransporter && booking.email) {
        await this.sendEmail(
          booking.email,
          'Booking Confirmation - Visitor Assist',
          this.generateBookingEmailTemplate(booking, service, owner)
        );
      }
      
      logger.info('Booking confirmation sent', { 
        bookingRef: booking.reference,
        phone: booking.phone_number 
      });
      
      return true;
    } catch (error) {
      logger.error('Failed to send booking confirmation', { 
        bookingRef: booking.reference,
        error 
      });
      return false;
    }
  }

  // Send booking notification to owner
  async sendOwnerNotification(booking, service, recordingUrl = null) {
    try {
      let message = `New Booking!\n\nRef: ${booking.reference}\nService: ${service.name}\nCustomer: ${booking.phone_number}\nLocation: ${booking.location_data?.city || 'Not specified'}`;
      
      if (recordingUrl) {
        message += `\nVoice Recording: ${recordingUrl}`;
      }
      
      message += `\n\nLogin to your dashboard to confirm.`;
      
      // Send SMS to owner
      const [ownerResult] = await db.execute(
        'SELECT phone, email FROM owners WHERE id = ?',
        [service.owner_id]
      );
      
      if (ownerResult.length > 0) {
        const owner = ownerResult[0];
        
        // Send SMS
        await africasTalking.sendSMS(owner.phone, message);
        
        // Send email if available
        if (this.emailTransporter && owner.email) {
          await this.sendEmail(
            owner.email,
            'New Booking Received - Visitor Assist',
            this.generateOwnerNotificationEmailTemplate(booking, service, recordingUrl)
          );
        }
        
        logger.info('Owner notification sent', { 
          bookingRef: booking.reference,
          ownerId: service.owner_id 
        });
      }
      
      return true;
    } catch (error) {
      logger.error('Failed to send owner notification', { 
        bookingRef: booking.reference,
        error 
      });
      return false;
    }
  }

  // Send booking status update
  async sendBookingStatusUpdate(booking, service, newStatus) {
    try {
      const statusMessages = {
        confirmed: 'Your booking has been confirmed by the service provider.',
        completed: 'Your booking has been completed. Thank you for using our service!',
        cancelled: 'Your booking has been cancelled. Please contact us if you have any questions.'
      };
      
      const message = `Booking Update\n\nRef: ${booking.reference}\nService: ${service.name}\nStatus: ${newStatus.toUpperCase()}\n\n${statusMessages[newStatus] || 'Booking status updated.'}\n\nVisitor Assist`;
      
      // Send SMS
      await africasTalking.sendSMS(booking.phone_number, message);
      
      logger.info('Booking status update sent', { 
        bookingRef: booking.reference,
        status: newStatus 
      });
      
      return true;
    } catch (error) {
      logger.error('Failed to send booking status update', { 
        bookingRef: booking.reference,
        error 
      });
      return false;
    }
  }

  // Send reminder notification
  async sendBookingReminder(booking, service) {
    try {
      const message = `Reminder: You have a booking today!\n\nRef: ${booking.reference}\nService: ${service.name}\nTime: ${new Date(booking.created_at).toLocaleDateString()}\n\nVisitor Assist`;
      
      // Send SMS
      await africasTalking.sendSMS(booking.phone_number, message);
      
      logger.info('Booking reminder sent', { 
        bookingRef: booking.reference 
      });
      
      return true;
    } catch (error) {
      logger.error('Failed to send booking reminder', { 
        bookingRef: booking.reference,
        error 
      });
      return false;
    }
  }

  // Send welcome message to new owners
  async sendOwnerWelcome(owner) {
    try {
      const message = `Welcome to Visitor Assist!\n\nYour business "${owner.business_name}" has been registered successfully.\n\nLogin to your dashboard to add services and manage bookings.\n\nSupport: ${process.env.SUPPORT_PHONE || '+234800VISITOR'}`;
      
      // Send SMS
      await africasTalking.sendSMS(owner.phone, message);
      
      // Send email if available
      if (this.emailTransporter && owner.email) {
        await this.sendEmail(
          owner.email,
          'Welcome to Visitor Assist',
          this.generateWelcomeEmailTemplate(owner)
        );
      }
      
      logger.info('Owner welcome message sent', { 
        ownerId: owner.id,
        phone: owner.phone 
      });
      
      return true;
    } catch (error) {
      logger.error('Failed to send owner welcome message', { 
        ownerId: owner.id,
        error 
      });
      return false;
    }
  }

  // Send email
  async sendEmail(to, subject, html) {
    try {
      if (!this.emailTransporter) {
        logger.warn('Email transporter not available');
        return false;
      }
      
      const mailOptions = {
        from: process.env.EMAIL_FROM || process.env.EMAIL_USER,
        to,
        subject,
        html
      };
      
      await this.emailTransporter.sendMail(mailOptions);
      logger.info('Email sent successfully', { to, subject });
      
      return true;
    } catch (error) {
      logger.error('Failed to send email', { to, subject, error });
      return false;
    }
  }

  // Email templates
  generateBookingEmailTemplate(booking, service, owner) {
    return `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #2c3e50;">Booking Confirmation</h2>
        <div style="background: #f8f9fa; padding: 20px; border-radius: 5px;">
          <h3>Booking Details</h3>
          <p><strong>Reference:</strong> ${booking.reference}</p>
          <p><strong>Service:</strong> ${service.name}</p>
          <p><strong>Category:</strong> ${service.category}</p>
          <p><strong>Provider:</strong> ${owner.business_name}</p>
          <p><strong>Contact:</strong> ${owner.phone}</p>
          <p><strong>Location:</strong> ${service.location || 'Contact provider for details'}</p>
          <p><strong>Price:</strong> ${service.price}</p>
        </div>
        <p>Thank you for using Visitor Assist! Please contact the service provider directly for any specific arrangements.</p>
        <hr>
        <p style="font-size: 12px; color: #666;">
          This is an automated message from Visitor Assist. 
          For support, contact us at ${process.env.SUPPORT_EMAIL || 'support@visitorassist.com'}
        </p>
      </div>
    `;
  }

  generateOwnerNotificationEmailTemplate(booking, service, recordingUrl) {
    return `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #27ae60;">New Booking Received!</h2>
        <div style="background: #f8f9fa; padding: 20px; border-radius: 5px;">
          <h3>Booking Details</h3>
          <p><strong>Reference:</strong> ${booking.reference}</p>
          <p><strong>Service:</strong> ${service.name}</p>
          <p><strong>Customer Phone:</strong> ${booking.phone_number}</p>
          <p><strong>Location:</strong> ${booking.location_data?.city || 'Not specified'}</p>
          <p><strong>Booking Time:</strong> ${new Date(booking.created_at).toLocaleString()}</p>
          ${recordingUrl ? `<p><strong>Voice Recording:</strong> <a href="${recordingUrl}">Listen Here</a></p>` : ''}
        </div>
        <p>Please login to your dashboard to confirm this booking and contact the customer.</p>
        <a href="${process.env.OWNER_DASHBOARD_URL || '#'}" style="background: #27ae60; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px;">View Dashboard</a>
        <hr>
        <p style="font-size: 12px; color: #666;">
          Visitor Assist - Service Provider Portal
        </p>
      </div>
    `;
  }

  generateWelcomeEmailTemplate(owner) {
    return `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #3498db;">Welcome to Visitor Assist!</h2>
        <p>Dear ${owner.name},</p>
        <p>Your business <strong>"${owner.business_name}"</strong> has been successfully registered on our platform.</p>
        
        <div style="background: #f8f9fa; padding: 20px; border-radius: 5px; margin: 20px 0;">
          <h3>Next Steps:</h3>
          <ol>
            <li>Login to your dashboard</li>
            <li>Add your services (hotels, transport, event halls)</li>
            <li>Set up your pricing and availability</li>
            <li>Start receiving bookings!</li>
          </ol>
        </div>
        
        <a href="${process.env.OWNER_DASHBOARD_URL || '#'}" style="background: #3498db; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px;">Access Dashboard</a>
        
        <p style="margin-top: 20px;">If you need any assistance, please contact our support team.</p>
        
        <hr>
        <p style="font-size: 12px; color: #666;">
          Support: ${process.env.SUPPORT_EMAIL || 'support@visitorassist.com'} | ${process.env.SUPPORT_PHONE || '+234800VISITOR'}
        </p>
      </div>
    `;
  }

  // Bulk notifications
  async sendBulkNotification(phoneNumbers, message) {
    try {
      const results = [];
      
      for (const phoneNumber of phoneNumbers) {
        try {
          await africasTalking.sendSMS(phoneNumber, message);
          results.push({ phoneNumber, success: true });
        } catch (error) {
          results.push({ phoneNumber, success: false, error: error.message });
        }
      }
      
      logger.info('Bulk notification sent', { 
        total: phoneNumbers.length,
        successful: results.filter(r => r.success).length 
      });
      
      return results;
    } catch (error) {
      logger.error('Failed to send bulk notification', error);
      return [];
    }
  }
}

// Create singleton instance
const notificationService = new NotificationService();

module.exports = notificationService;