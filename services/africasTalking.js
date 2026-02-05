const axios = require('axios');
const logger = require('../utils/logger');

class AfricasTalkingService {
  constructor() {
    this.username = process.env.AT_USERNAME;
    this.apiKey = process.env.AT_API_KEY;
    this.baseURL = 'https://api.africastalking.com/version1';
  }

  // Send SMS
  async sendSMS(to, message, from = null) {
    try {
      const response = await axios.post(
        `${this.baseURL}/messaging`,
        {
          username: this.username,
          to: to,
          message: message,
          from: from || process.env.SMS_SENDER_ID
        },
        {
          headers: {
            'apiKey': this.apiKey,
            'Content-Type': 'application/x-www-form-urlencoded'
          }
        }
      );

      logger.info('SMS sent successfully', { to, response: response.data });
      return response.data;
    } catch (error) {
      logger.error('Failed to send SMS', { to, error: error.message });
      throw error;
    }
  }

  // Make voice call
  async makeCall(to, callerId = null) {
    try {
      const response = await axios.post(
        `${this.baseURL}/call`,
        {
          username: this.username,
          to: to,
          from: callerId || process.env.VOICE_CALLER_ID
        },
        {
          headers: {
            'apiKey': this.apiKey,
            'Content-Type': 'application/x-www-form-urlencoded'
          }
        }
      );

      logger.info('Voice call initiated', { to, response: response.data });
      return response.data;
    } catch (error) {
      logger.error('Failed to initiate voice call', { to, error: error.message });
      throw error;
    }
  }

  // Generate USSD response
  generateUSSDResponse(text, continueSession = true) {
    const response = continueSession ? `CON ${text}` : `END ${text}`;
    logger.info('USSD response generated', { text, continueSession });
    return response;
  }

  // Generate voice XML response
  generateVoiceResponse(actions) {
    let xml = '<?xml version="1.0" encoding="UTF-8"?><Response>';
    
    actions.forEach(action => {
      switch (action.type) {
        case 'say':
          xml += `<Say voice="${action.voice || 'woman'}" playBeep="${action.playBeep || 'false'}">${action.text}</Say>`;
          break;
        case 'play':
          xml += `<Play url="${action.url}"/>`;
          break;
        case 'getDigits':
          xml += `<GetDigits timeout="${action.timeout || 30}" finishOnKey="${action.finishOnKey || '#'}" callbackUrl="${action.callbackUrl}">`;
          if (action.say) {
            xml += `<Say voice="${action.voice || 'woman'}">${action.say}</Say>`;
          }
          xml += '</GetDigits>';
          break;
        case 'record':
          xml += `<Record timeout="${action.timeout || 30}" trimSilence="${action.trimSilence || 'true'}" callbackUrl="${action.callbackUrl}"/>`;
          break;
        case 'hangup':
          xml += '<Hangup/>';
          break;
      }
    });
    
    xml += '</Response>';
    logger.info('Voice XML response generated', { actions });
    return xml;
  }
}

module.exports = new AfricasTalkingService();