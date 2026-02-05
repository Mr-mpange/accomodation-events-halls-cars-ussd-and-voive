const db = require('../config/database');
const logger = require('../utils/logger');
const locationService = require('./locationService');
const africasTalking = require('./africasTalking');
const sessionService = require('./sessionService');
const notificationService = require('./notificationService');
const { v4: uuidv4 } = require('uuid');

class USSDService {
  constructor() {
    // Fallback sessions for when Redis is unavailable
    this.fallbackSessions = new Map();
  }

  // Get or create session using session service
  async getSession(sessionId, phoneNumber) {
    return await sessionService.getSession(sessionId, phoneNumber, {
      locationChecked: false,
      detectedLocation: null,
      selectedCategory: null,
      selectedService: null,
      services: [],
      currentPage: 0
    });
  }

  // Update session
  async updateSession(sessionId, updates) {
    return await sessionService.updateSession(sessionId, updates);
  }

  // Clear session
  async clearSession(sessionId) {
    return await sessionService.clearSession(sessionId);
  }

  // Main USSD flow handler
  async handleUSSDRequest(sessionId, phoneNumber, text, networkCode, cellId, lac) {
    try {
      const session = await this.getSession(sessionId, phoneNumber);
      
      // Extract location metadata on first request
      if (!session.data.locationChecked) {
        await this.processLocationData(session, networkCode, cellId, lac);
      }

      const input = text.split('*').pop() || '';
      
      switch (session.step) {
        case 'main_menu':
          return await this.handleMainMenu(session, input);
        
        case 'location_confirm':
          return await this.handleLocationConfirm(session, input);
        
        case 'location_manual':
          return await this.handleLocationManual(session, input);
        
        case 'service_category':
          return await this.handleServiceCategory(session, input);
        
        case 'service_list':
          return await this.handleServiceList(session, input);
        
        case 'service_details':
          return await this.handleServiceDetails(session, input);
        
        case 'booking_confirm':
          return await this.handleBookingConfirm(session, input);
        
        case 'voice_escalation':
          return await this.handleVoiceEscalation(session, input);
        
        default:
          return await this.showMainMenu(session);
      }
    } catch (error) {
      logger.error('USSD request handling error', { sessionId, error });
      return this.generateUSSDResponse(
        'Service temporarily unavailable. Please try again later.',
        false
      );
    }
  }

  // Process location data from cell tower
  async processLocationData(session, networkCode, cellId, lac) {
    try {
      if (cellId && lac) {
        // Parse MCC and MNC from networkCode if available
        let mcc = '636'; // Default Nigeria
        let mnc = '01';  // Default MTN
        
        if (networkCode) {
          // Extract MCC and MNC from networkCode (e.g., "62101" -> mcc="636", mnc="01")
          if (networkCode.length >= 5) {
            mcc = '636'; // Nigeria
            mnc = networkCode.slice(-2); // Last 2 digits
          }
        }
        
        const locationData = await locationService.getLocationFromCellTower(cellId, lac, mcc, mnc, networkCode);
        
        if (locationData) {
          const cityData = await locationService.getCityFromCoordinates(
            locationData.latitude,
            locationData.longitude
          );
          
          session.data.detectedLocation = {
            ...locationData,
            ...cityData
          };
          
          // Save location session for analytics
          await this.saveLocationSession(session, cellId, lac, locationData, cityData);
        }
      }
      
      session.data.locationChecked = true;
      await this.updateSession(session.sessionId, session);
      
    } catch (error) {
      logger.error('Location processing error', { sessionId: session.sessionId, error });
      session.data.locationChecked = true;
      await this.updateSession(session.sessionId, session);
    }
  }

  // Save location session for analytics
  async saveLocationSession(session, cellId, lac, locationData, cityData) {
    try {
      await db.execute(`
        INSERT INTO location_sessions 
        (session_id, phone_number, cell_id, lac, latitude, longitude, city, state, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW())
        ON DUPLICATE KEY UPDATE
        latitude = VALUES(latitude),
        longitude = VALUES(longitude),
        city = VALUES(city),
        state = VALUES(state),
        updated_at = NOW()
      `, [
        session.sessionId,
        session.phoneNumber,
        cellId,
        lac,
        locationData?.latitude,
        locationData?.longitude,
        cityData?.city,
        cityData?.state
      ]);
    } catch (error) {
      logger.error('Failed to save location session', error);
    }
  }

  // Show main menu
  async showMainMenu(session) {
    let response = "Welcome to Visitor Assist!\n\n";
    
    if (session.data.detectedLocation?.city) {
      response += `Location: ${session.data.detectedLocation.city}\n`;
      response += "1. Confirm location\n";
      response += "2. Change location\n";
      response += "3. Continue anyway\n";
      response += "0. Help";
      
      await this.updateSession(session.sessionId, { step: 'location_confirm' });
    } else {
      response += "Select service:\n";
      response += "1. Stay (Hotels)\n";
      response += "2. Ride (Transport)\n";
      response += "3. Hall (Events)\n";
      response += "9. Set Location\n";
      response += "0. Help";
      
      await this.updateSession(session.sessionId, { step: 'service_category' });
    }
    
    return this.generateUSSDResponse(response, true);
  }

  // Handle main menu selection
  async handleMainMenu(session, input) {
    // If no input (first time dialing), show the main menu
    if (!input || input === '') {
      return await this.showMainMenu(session);
    }
    
    if (session.data.detectedLocation?.city) {
      return await this.handleLocationConfirm(session, input);
    } else {
      return await this.handleServiceCategory(session, input);
    }
  }

  // Handle location confirmation
  async handleLocationConfirm(session, input) {
    switch (input) {
      case '1': // Confirm location
        session.data.confirmedLocation = session.data.detectedLocation;
        await this.updateSession(session.sessionId, { 
          step: 'service_category',
          data: session.data 
        });
        return await this.showServiceCategories(session);
        
      case '2': // Change location
        await this.updateSession(session.sessionId, { step: 'location_manual' });
        return await this.showLocationOptions(session);
        
      case '3': // Continue anyway
        await this.updateSession(session.sessionId, { step: 'service_category' });
        return await this.showServiceCategories(session);
        
      case '0': // Help
        return this.generateUSSDResponse(
          "Visitor Assist helps you find:\n• Hotels & Accommodation\n• Transport Services\n• Event Halls\n\nPress any key to continue",
          true
        );
        
      default:
        return this.generateUSSDResponse(
          "Invalid option. Please try again.\n\n1. Confirm location\n2. Change location\n3. Continue anyway\n0. Help",
          true
        );
    }
  }

  // Show location options for manual selection
  async showLocationOptions(session) {
    try {
      const [locations] = await db.execute(`
        SELECT id, name, city, state 
        FROM locations 
        WHERE is_active = 1 
        ORDER BY city, name 
        LIMIT 8
      `);
      
      let response = "Select your location:\n\n";
      
      locations.forEach((location, index) => {
        response += `${index + 1}. ${location.name}, ${location.city}\n`;
      });
      
      response += "9. Back to main menu\n0. Help";
      
      session.data.locationOptions = locations;
      await this.updateSession(session.sessionId, { data: session.data });
      
      return this.generateUSSDResponse(response, true);
    } catch (error) {
      logger.error('Failed to load location options', error);
      return this.generateUSSDResponse(
        "Unable to load locations. Please try again later.",
        false
      );
    }
  }

  // Handle manual location selection
  async handleLocationManual(session, input) {
    const locationIndex = parseInt(input) - 1;
    
    if (input === '9') {
      await this.updateSession(session.sessionId, { step: 'main_menu' });
      return await this.showMainMenu(session);
    }
    
    if (input === '0') {
      return this.generateUSSDResponse(
        "Choose your current location from the list to get relevant services in your area.\n\nPress any key to continue",
        true
      );
    }
    
    if (session.data.locationOptions && locationIndex >= 0 && locationIndex < session.data.locationOptions.length) {
      const selectedLocation = session.data.locationOptions[locationIndex];
      session.data.confirmedLocation = {
        city: selectedLocation.city,
        state: selectedLocation.state,
        name: selectedLocation.name
      };
      
      await this.updateSession(session.sessionId, { 
        step: 'service_category',
        data: session.data 
      });
      
      return await this.showServiceCategories(session);
    }
    
    return this.generateUSSDResponse(
      "Invalid selection. Please choose a number from the list or press 9 to go back.",
      true
    );
  }

  // Show service categories
  async showServiceCategories(session) {
    let response = "Select service:\n\n";
    response += "1. Stay (Hotels)\n";
    response += "2. Ride (Transport)\n";
    response += "3. Hall (Events)\n";
    response += "9. Change Location\n";
    response += "0. Help";
    
    return this.generateUSSDResponse(response, true);
  }

  // Handle service category selection
  async handleServiceCategory(session, input) {
    const categories = {
      '1': 'stay',
      '2': 'ride', 
      '3': 'hall'
    };
    
    if (input === '9') {
      await this.updateSession(session.sessionId, { step: 'location_manual' });
      return await this.showLocationOptions(session);
    }
    
    if (input === '0') {
      return this.generateUSSDResponse(
        "Services available:\n• Stay: Hotels & Accommodation\n• Ride: Transport & Taxi\n• Hall: Event Venues\n\nPress any key to continue",
        true
      );
    }
    
    if (categories[input]) {
      session.data.selectedCategory = categories[input];
      await this.updateSession(session.sessionId, { 
        step: 'service_list',
        data: session.data 
      });
      
      return await this.showServiceList(session);
    }
    
    return this.generateUSSDResponse(
      "Invalid option. Please select:\n1. Stay\n2. Ride\n3. Hall\n9. Change Location\n0. Help",
      true
    );
  }

  // Show service list
  async showServiceList(session, page = 0) {
    try {
      const limit = 7; // Show 7 services + navigation options
      const offset = page * limit;
      
      let query = `
        SELECT s.*, o.business_name, o.phone as owner_phone
        FROM services s
        JOIN owners o ON s.owner_id = o.id
        WHERE s.category = ? AND s.is_active = 1 AND o.is_active = 1 AND o.is_verified = 1
      `;
      
      const params = [session.data.selectedCategory];
      
      // Filter by location if available
      if (session.data.confirmedLocation?.city) {
        query += ` AND (s.city = ? OR s.city IS NULL)`;
        params.push(session.data.confirmedLocation.city);
      }
      
      query += ` ORDER BY s.created_at DESC LIMIT ? OFFSET ?`;
      params.push(limit + 1, offset); // +1 to check if there are more
      
      const [services] = await db.execute(query, params);
      
      if (services.length === 0) {
        let response = `No ${session.data.selectedCategory} services found`;
        if (session.data.confirmedLocation?.city) {
          response += ` in ${session.data.confirmedLocation.city}`;
        }
        response += ".\n\n9. Try another category\n0. Change location";
        
        return this.generateUSSDResponse(response, true);
      }
      
      const hasMore = services.length > limit;
      const displayServices = services.slice(0, limit);
      
      let response = `${session.data.selectedCategory.toUpperCase()} Services:\n\n`;
      
      displayServices.forEach((service, index) => {
        const truncatedName = service.name.length > 25 ? 
          service.name.substring(0, 22) + '...' : service.name;
        response += `${index + 1}. ${truncatedName}\n   ${service.price}\n`;
      });
      
      // Navigation options
      if (hasMore && page > 0) {
        response += "7. Next page\n8. Previous page\n";
      } else if (hasMore) {
        response += "8. Next page\n";
      } else if (page > 0) {
        response += "8. Previous page\n";
      }
      
      response += "9. Back to categories\n0. Help";
      
      session.data.services = displayServices;
      session.data.currentPage = page;
      session.data.hasMore = hasMore;
      
      await this.updateSession(session.sessionId, { data: session.data });
      
      return this.generateUSSDResponse(response, true);
      
    } catch (error) {
      logger.error('Failed to load services', error);
      return this.generateUSSDResponse(
        "Unable to load services. Please try again later.",
        false
      );
    }
  }

  // Handle service list selection
  async handleServiceList(session, input) {
    const serviceIndex = parseInt(input) - 1;
    
    if (input === '7' && session.data.hasMore && session.data.currentPage > 0) {
      // Next page
      return await this.showServiceList(session, session.data.currentPage + 1);
    }
    
    if (input === '8') {
      if (session.data.hasMore && session.data.currentPage === 0) {
        // Next page
        return await this.showServiceList(session, session.data.currentPage + 1);
      } else if (session.data.currentPage > 0) {
        // Previous page
        return await this.showServiceList(session, session.data.currentPage - 1);
      }
    }
    
    if (input === '9') {
      await this.updateSession(session.sessionId, { step: 'service_category' });
      return await this.showServiceCategories(session);
    }
    
    if (input === '0') {
      return this.generateUSSDResponse(
        "Select a service to view details and book. Use 8 for more options if available.\n\nPress any key to continue",
        true
      );
    }
    
    if (session.data.services && serviceIndex >= 0 && serviceIndex < session.data.services.length) {
      session.data.selectedService = session.data.services[serviceIndex];
      await this.updateSession(session.sessionId, { 
        step: 'service_details',
        data: session.data 
      });
      
      return await this.showServiceDetails(session);
    }
    
    return this.generateUSSDResponse(
      "Invalid selection. Please choose a service number, 8 for more options, or 9 to go back.",
      true
    );
  }

  // Show service details
  async showServiceDetails(session) {
    const service = session.data.selectedService;
    
    let response = `${service.name}\n\n`;
    response += `Price: ${service.price}\n`;
    response += `Provider: ${service.business_name}\n`;
    
    if (service.location) {
      response += `Location: ${service.location}\n`;
    }
    
    if (service.description) {
      const truncatedDesc = service.description.length > 50 ? 
        service.description.substring(0, 47) + '...' : service.description;
      response += `Info: ${truncatedDesc}\n`;
    }
    
    response += "\n1. Book now\n";
    response += "2. Call provider\n";
    response += "3. More details via voice\n";
    response += "9. Back to list\n";
    response += "0. Help";
    
    return this.generateUSSDResponse(response, true);
  }

  // Handle service details selection
  async handleServiceDetails(session, input) {
    const service = session.data.selectedService;
    
    switch (input) {
      case '1': // Book now
        await this.updateSession(session.sessionId, { step: 'booking_confirm' });
        return await this.showBookingConfirmation(session);
        
      case '2': // Call provider
        return this.generateUSSDResponse(
          `Call ${service.business_name} at:\n${service.owner_phone}\n\nThank you for using Visitor Assist!`,
          false
        );
        
      case '3': // Voice escalation
        await this.updateSession(session.sessionId, { step: 'voice_escalation' });
        return await this.initiateVoiceEscalation(session);
        
      case '9': // Back to list
        await this.updateSession(session.sessionId, { step: 'service_list' });
        return await this.showServiceList(session, session.data.currentPage || 0);
        
      case '0': // Help
        return this.generateUSSDResponse(
          "Options:\n1. Book - Make reservation\n2. Call - Direct contact\n3. Voice - Detailed info via call\n\nPress any key to continue",
          true
        );
        
      default:
        return this.generateUSSDResponse(
          "Invalid option. Please select:\n1. Book now\n2. Call provider\n3. More details via voice\n9. Back to list",
          true
        );
    }
  }

  // Show booking confirmation
  async showBookingConfirmation(session) {
    const service = session.data.selectedService;
    
    let response = `Confirm booking:\n\n`;
    response += `Service: ${service.name}\n`;
    response += `Provider: ${service.business_name}\n`;
    response += `Price: ${service.price}\n`;
    
    if (session.data.confirmedLocation) {
      response += `Your location: ${session.data.confirmedLocation.city}\n`;
    }
    
    response += "\n1. Confirm booking\n";
    response += "2. Cancel\n";
    response += "0. Help";
    
    return this.generateUSSDResponse(response, true);
  }

  // Handle booking confirmation
  async handleBookingConfirm(session, input) {
    switch (input) {
      case '1': // Confirm booking
        return await this.createBooking(session);
        
      case '2': // Cancel
        await this.updateSession(session.sessionId, { step: 'service_details' });
        return await this.showServiceDetails(session);
        
      case '0': // Help
        return this.generateUSSDResponse(
          "Confirm to complete your booking. The provider will be notified and will contact you.\n\nPress any key to continue",
          true
        );
        
      default:
        return this.generateUSSDResponse(
          "Please select:\n1. Confirm booking\n2. Cancel\n0. Help",
          true
        );
    }
  }

  // Create booking
  async createBooking(session) {
    try {
      const service = session.data.selectedService;
      const bookingRef = this.generateBookingReference();
      
      // Create booking record
      const [result] = await db.execute(`
        INSERT INTO bookings 
        (reference, phone_number, service_id, owner_id, location_data, status, created_at)
        VALUES (?, ?, ?, ?, ?, 'pending', NOW())
      `, [
        bookingRef,
        session.phoneNumber,
        service.id,
        service.owner_id,
        JSON.stringify(session.data.confirmedLocation || {})
      ]);
      
      const booking = {
        id: result.insertId,
        reference: bookingRef,
        phone_number: session.phoneNumber,
        service_id: service.id,
        owner_id: service.owner_id,
        location_data: session.data.confirmedLocation || {},
        status: 'pending'
      };
      
      // Send notifications
      await notificationService.sendBookingConfirmation(booking, service, {
        business_name: service.business_name,
        phone: service.owner_phone
      });
      
      await notificationService.sendOwnerNotification(booking, service);
      
      // Log analytics
      await this.logUSSDAnalytics(session, 'booking_completed', bookingRef);
      
      // Clear session
      await this.clearSession(session.sessionId);
      
      return this.generateUSSDResponse(
        `Booking confirmed!\n\nRef: ${bookingRef}\nService: ${service.name}\nProvider: ${service.business_name}\n\nYou will receive SMS confirmation. Thank you!`,
        false
      );
      
    } catch (error) {
      logger.error('Failed to create booking', { sessionId: session.sessionId, error });
      return this.generateUSSDResponse(
        "Booking failed. Please try again or call the provider directly.",
        false
      );
    }
  }

  // Initiate voice escalation
  async initiateVoiceEscalation(session) {
    try {
      const service = session.data.selectedService;
      
      // Save voice session for callback
      await db.execute(`
        INSERT INTO voice_sessions (phone_number, service_id, session_data, created_at)
        VALUES (?, ?, ?, NOW())
      `, [
        session.phoneNumber,
        service.id,
        JSON.stringify({
          sessionId: session.sessionId,
          selectedService: service,
          confirmedLocation: session.data.confirmedLocation
        })
      ]);
      
      // Initiate voice call
      await africasTalking.makeCall(session.phoneNumber);
      
      return this.generateUSSDResponse(
        `You will receive a call shortly for detailed information about ${service.name}.\n\nThank you for using Visitor Assist!`,
        false
      );
      
    } catch (error) {
      logger.error('Failed to initiate voice escalation', error);
      return this.generateUSSDResponse(
        `Call ${service.business_name} at ${service.owner_phone} for more details.\n\nThank you!`,
        false
      );
    }
  }

  // Generate booking reference
  generateBookingReference() {
    const timestamp = Date.now().toString().slice(-6);
    const random = Math.random().toString(36).substring(2, 5).toUpperCase();
    return `VA${timestamp}${random}`;
  }

  // Log USSD analytics
  async logUSSDAnalytics(session, step, response = null) {
    try {
      await db.execute(`
        INSERT INTO ussd_analytics 
        (session_id, phone_number, step, input, response_time_ms, created_at)
        VALUES (?, ?, ?, ?, ?, NOW())
      `, [
        session.sessionId,
        session.phoneNumber,
        step,
        response,
        Date.now() - new Date(session.createdAt).getTime()
      ]);
    } catch (error) {
      logger.error('Failed to log USSD analytics', error);
    }
  }

  // Generate USSD response
  generateUSSDResponse(text, continueSession = true) {
    const prefix = continueSession ? 'CON ' : 'END ';
    return prefix + text;
  }
}

module.exports = new USSDService();