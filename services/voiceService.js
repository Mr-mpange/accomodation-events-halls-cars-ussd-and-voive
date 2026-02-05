const db = require('../config/database');
const logger = require('../utils/logger');
const africasTalking = require('./africasTalking');
const notificationService = require('./notificationService');
const sessionService = require('./sessionService');

class VoiceService {
  constructor() {
    this.voiceSessions = new Map();
  }

  // Handle incoming voice call
  async handleIncomingCall(sessionId, phoneNumber, isActive) {
    try {
      logger.info('Incoming voice call', { sessionId, phoneNumber, isActive });
      
      if (!isActive) {
        return this.generateHangupResponse();
      }

      // Check if this is a callback from USSD
      const voiceSession = await this.getVoiceSession(phoneNumber);
      
      if (voiceSession) {
        return await this.handleUSSDCallback(voiceSession);
      } else {
        return this.handleDirectCall();
      }
    } catch (error) {
      logger.error('Voice call handling error', { sessionId, phoneNumber, error });
      return this.generateErrorResponse();
    }
  }

  // Get voice session from database
  async getVoiceSession(phoneNumber) {
    try {
      const [rows] = await db.execute(`
        SELECT * FROM voice_sessions 
        WHERE phone_number = ? 
        ORDER BY created_at DESC 
        LIMIT 1
      `, [phoneNumber]);
      
      return rows.length > 0 ? rows[0] : null;
    } catch (error) {
      logger.error('Failed to get voice session', error);
      return null;
    }
  }

  // Handle USSD callback voice session
  async handleUSSDCallback(voiceSession) {
    const sessionData = JSON.parse(voiceSession.session_data);
    const service = sessionData.selectedService;
    
    const actions = [
      {
        type: 'say',
        text: `Hello! You requested details about ${service.name} from ${service.business_name}. This service costs ${service.price}.`,
        voice: 'woman'
      },
      {
        type: 'say',
        text: `The service is located at ${service.location || 'contact provider for location details'}.`,
        voice: 'woman'
      }
    ];

    if (service.description) {
      actions.push({
        type: 'say',
        text: service.description,
        voice: 'woman'
      });
    }

    actions.push({
      type: 'getDigits',
      timeout: 30,
      finishOnKey: '#',
      callbackUrl: `${process.env.VOICE_CALLBACK_URL}/service-action`,
      say: 'Press 1 to book this service, 2 to speak with the provider, or 0 to end the call.'
    });
    
    return this.generateVoiceResponse(actions);
  }

  // Handle direct voice call
  handleDirectCall() {
    const actions = [
      {
        type: 'say',
        text: 'Welcome to Visitor Assistance. We help you find hotels, transport, and event halls.',
        voice: 'woman'
      },
      {
        type: 'getDigits',
        timeout: 30,
        finishOnKey: '#',
        callbackUrl: `${process.env.VOICE_CALLBACK_URL}/main-menu`,
        say: 'Press 1 for hotels, 2 for transport, 3 for event halls, or 0 to speak with an agent.'
      }
    ];
    
    return this.generateVoiceResponse(actions);
  }

  // Handle main menu selection in voice
  async handleMainMenuSelection(sessionId, phoneNumber, dtmfDigits) {
    try {
      const digit = dtmfDigits.charAt(0);
      let category;
      
      switch (digit) {
        case '1':
          category = 'stay';
          break;
        case '2':
          category = 'ride';
          break;
        case '3':
          category = 'hall';
          break;
        case '0':
          return this.handleAgentEscalation(phoneNumber);
        default:
          return this.generateErrorResponse('Invalid selection. Please try again.');
      }

      // Store voice session
      this.voiceSessions.set(sessionId, {
        phoneNumber,
        category,
        step: 'service_selection',
        createdAt: new Date()
      });

      return await this.handleServiceSelection(sessionId, phoneNumber, category);
    } catch (error) {
      logger.error('Voice main menu selection error', error);
      return this.generateErrorResponse();
    }
  }

  // Handle service selection
  async handleServiceSelection(sessionId, phoneNumber, categoryOrDigits) {
    try {
      let category = categoryOrDigits;
      
      // If it's digits, get category from session
      if (typeof categoryOrDigits === 'string' && categoryOrDigits.length === 1) {
        const session = this.voiceSessions.get(sessionId);
        if (!session) {
          return this.generateErrorResponse('Session expired. Please call again.');
        }
        category = session.category;
      }

      // Get services for category
      const [services] = await db.execute(`
        SELECT s.*, o.business_name, o.phone as owner_phone
        FROM services s
        JOIN owners o ON s.owner_id = o.id
        WHERE s.category = ? AND s.is_active = 1 AND o.is_active = 1 AND o.is_verified = 1
        ORDER BY s.created_at DESC
        LIMIT 3
      `, [category]);

      if (services.length === 0) {
        return this.generateVoiceResponse([
          {
            type: 'say',
            text: `Sorry, no ${category} services are currently available. Please try again later or press 0 to speak with an agent.`,
            voice: 'woman'
          },
          {
            type: 'getDigits',
            timeout: 10,
            finishOnKey: '#',
            callbackUrl: `${process.env.VOICE_CALLBACK_URL}/main-menu`,
            say: 'Press any key to return to the main menu.'
          }
        ]);
      }

      // Store services in session
      const session = this.voiceSessions.get(sessionId) || { phoneNumber, category };
      session.services = services;
      session.step = 'service_action';
      this.voiceSessions.set(sessionId, session);

      const actions = [
        {
          type: 'say',
          text: `Here are the top ${category} services available:`,
          voice: 'woman'
        }
      ];

      services.forEach((service, index) => {
        actions.push({
          type: 'say',
          text: `Option ${index + 1}: ${service.name} by ${service.business_name}, priced at ${service.price}.`,
          voice: 'woman'
        });
      });

      actions.push({
        type: 'getDigits',
        timeout: 30,
        finishOnKey: '#',
        callbackUrl: `${process.env.VOICE_CALLBACK_URL}/service-action`,
        say: 'Press 1, 2, or 3 to select a service, or 0 to speak with an agent.'
      });

      return this.generateVoiceResponse(actions);
    } catch (error) {
      logger.error('Voice service selection error', error);
      return this.generateErrorResponse();
    }
  }

  // Handle service action
  async handleServiceAction(sessionId, phoneNumber, dtmfDigits) {
    try {
      const digit = dtmfDigits.charAt(0);
      const session = this.voiceSessions.get(sessionId);
      
      if (!session || !session.services) {
        return this.generateErrorResponse('Session expired. Please call again.');
      }

      if (digit === '0') {
        return this.handleAgentEscalation(phoneNumber);
      }

      const serviceIndex = parseInt(digit) - 1;
      if (serviceIndex >= 0 && serviceIndex < session.services.length) {
        const selectedService = session.services[serviceIndex];
        session.selectedService = selectedService;
        session.step = 'location_recording';
        this.voiceSessions.set(sessionId, session);

        return this.generateVoiceResponse([
          {
            type: 'say',
            text: `You selected ${selectedService.name}. To complete your booking, please tell us your exact pickup location after the beep.`,
            voice: 'woman'
          },
          {
            type: 'record',
            timeout: 30,
            trimSilence: true,
            callbackUrl: `${process.env.VOICE_CALLBACK_URL}/location-recording`,
            say: 'Please speak your location clearly after the beep, then press hash when done.'
          }
        ]);
      }

      return this.generateErrorResponse('Invalid selection. Please choose 1, 2, 3, or 0.');
    } catch (error) {
      logger.error('Voice service action error', error);
      return this.generateErrorResponse();
    }
  }

  // Handle location recording
  async handleLocationRecording(sessionId, phoneNumber, recordingUrl) {
    try {
      const session = this.voiceSessions.get(sessionId);
      
      if (!session || !session.selectedService) {
        return this.generateErrorResponse('Session expired. Please call again.');
      }

      // Create booking with voice recording
      const bookingRef = this.generateBookingReference();
      const service = session.selectedService;

      const [result] = await db.execute(`
        INSERT INTO bookings 
        (reference, phone_number, service_id, owner_id, location_recording, status, created_at)
        VALUES (?, ?, ?, ?, ?, 'pending', NOW())
      `, [
        bookingRef,
        phoneNumber,
        service.id,
        service.owner_id,
        recordingUrl
      ]);

      const booking = {
        id: result.insertId,
        reference: bookingRef,
        phone_number: phoneNumber,
        service_id: service.id,
        owner_id: service.owner_id,
        location_recording: recordingUrl,
        status: 'pending'
      };

      // Send notifications
      await notificationService.sendBookingConfirmation(booking, service, {
        business_name: service.business_name,
        phone: service.owner_phone
      });

      await notificationService.sendOwnerNotification(booking, service, recordingUrl);

      // Clear session
      this.voiceSessions.delete(sessionId);

      return this.generateVoiceResponse([
        {
          type: 'say',
          text: `Thank you! Your booking has been confirmed with reference ${bookingRef}. The service provider will contact you shortly. You will also receive an SMS confirmation.`,
          voice: 'woman'
        },
        {
          type: 'hangup'
        }
      ]);

    } catch (error) {
      logger.error('Voice location recording error', error);
      return this.generateErrorResponse('Booking failed. Please try again.');
    }
  }

  // Handle agent escalation
  handleAgentEscalation(phoneNumber) {
    return this.generateVoiceResponse([
      {
        type: 'say',
        text: 'Please hold while we connect you to our customer service team. If no agent is available, please call our support line.',
        voice: 'woman'
      },
      {
        type: 'say',
        text: `Our support number is ${process.env.SUPPORT_PHONE || '+234 800 VISITOR'}. Thank you for using Visitor Assist.`,
        voice: 'woman'
      },
      {
        type: 'hangup'
      }
    ]);
  }

  // Generate booking reference
  generateBookingReference() {
    const timestamp = Date.now().toString().slice(-6);
    const random = Math.random().toString(36).substring(2, 5).toUpperCase();
    return `VA${timestamp}${random}`;
  }

  // Generate voice response XML
  generateVoiceResponse(actions) {
    let xml = '<?xml version="1.0" encoding="UTF-8"?>\n<Response>\n';
    
    actions.forEach(action => {
      switch (action.type) {
        case 'say':
          xml += `  <Say voice="${action.voice || 'woman'}">${action.text}</Say>\n`;
          break;
        case 'getDigits':
          xml += `  <GetDigits timeout="${action.timeout}" finishOnKey="${action.finishOnKey}" callbackUrl="${action.callbackUrl}">\n`;
          if (action.say) {
            xml += `    <Say voice="woman">${action.say}</Say>\n`;
          }
          xml += `  </GetDigits>\n`;
          break;
        case 'record':
          xml += `  <Record timeout="${action.timeout}" trimSilence="${action.trimSilence}" callbackUrl="${action.callbackUrl}">\n`;
          if (action.say) {
            xml += `    <Say voice="woman">${action.say}</Say>\n`;
          }
          xml += `  </Record>\n`;
          break;
        case 'hangup':
          xml += `  <Hangup/>\n`;
          break;
      }
    });
    
    xml += '</Response>';
    return xml;
  }

  // Generate error response
  generateErrorResponse(message = 'Sorry, we encountered an error. Please try again later.') {
    return this.generateVoiceResponse([
      {
        type: 'say',
        text: message,
        voice: 'woman'
      },
      {
        type: 'hangup'
      }
    ]);
  }

  // Generate hangup response
  generateHangupResponse() {
    return this.generateVoiceResponse([
      {
        type: 'hangup'
      }
    ]);
  }
}

module.exports = new VoiceService();