# Visitor Assistance USSD + Voice System

A complete, professional, deployable USSD and voice system for visitor assistance platform, fully integrated with web and owner services.

## Features

### USSD Flow
- Short, concise menus optimized for feature phones
- Location detection using Africa's Talking metadata (Cell ID + LAC)
- OpenCellID integration for approximate city/area mapping
- Fallback manual location selection
- Confirmation prompts for inferred locations
- Minimal screens for fast UX (<3 steps for main actions)

### Voice/IVR Flow
- Escalation for precise pickup points or event hall confirmation
- Integration with USSD session data
- Voice recording for exact location capture
- Professional voice prompts and menu navigation

### Owner/Provider Integration
- Only approved services uploaded by owners are shown
- Real-time booking updates to owner dashboard
- SMS and voice call notifications to owners
- Complete owner management system

### Backend Features
- Africa's Talking API integration (USSD, SMS, Voice)
- Node.js with Express framework
- MySQL database with proper relationships
- Modular, scalable, maintainable code structure
- Comprehensive logging and error handling
- JWT-based authentication
- Input validation with Joi

## Quick Start

### Prerequisites
- Node.js 16+ and npm
- MySQL 5.7+ or 8.0+
- Africa's Talking account with API credentials
- OpenCellID API key (optional, for location services)

### Installation

1. **Clone and install dependencies:**
```bash
git clone <repository-url>
cd visitor-assistance-ussd-system
npm install
```

2. **Environment setup:**
```bash
cp .env.example .env
# Edit .env with your configuration
```

3. **Database setup:**
```bash
# Create database and tables
npm run migrate

# Seed with sample data
npm run seed
```

4. **Start the server:**
```bash
# Development
npm run dev

# Production
npm start
```

## Configuration

### Environment Variables

```env
# Database Configuration
DB_HOST=localhost
DB_USER=root
DB_PASSWORD=your_password
DB_NAME=visitor_assistance

# Africa's Talking API Configuration
AT_USERNAME=your_username
AT_API_KEY=your_api_key
AT_USSD_CODE=*384*1234#

# OpenCellID Configuration (Optional)
OPENCELLID_API_KEY=your_opencellid_key

# Server Configuration
PORT=3000
NODE_ENV=development

# JWT Configuration
JWT_SECRET=your_jwt_secret_key_here

# Callback URLs
VOICE_CALLBACK_URL=https://yourdomain.com/voice/callback
USSD_CALLBACK_URL=https://yourdomain.com/ussd/callback

# SMS Configuration
SMS_SENDER_ID=VISITOR
```

### Africa's Talking Setup

1. **USSD Configuration:**
   - Set callback URL: `https://yourdomain.com/ussd/callback`
   - Configure your USSD code (e.g., `*384*1234#`)

2. **Voice Configuration:**
   - Set callback URL: `https://yourdomain.com/voice/callback`
   - Configure voice number

3. **SMS Configuration:**
   - Set sender ID: `VISITOR` (or your preferred ID)

## API Endpoints

### USSD Endpoints
- `POST /ussd/callback` - Main USSD callback from Africa's Talking
- `POST /ussd/test` - Test USSD flow
- `GET /ussd/session/:sessionId` - Get session status
- `DELETE /ussd/session/:sessionId` - Clear session

### Voice Endpoints
- `POST /voice/callback` - Main voice callback
- `POST /voice/main-menu` - Main menu selection
- `POST /voice/service-selection` - Service selection
- `POST /voice/service-action` - Service actions
- `POST /voice/location-recording` - Location recording

### Admin Endpoints
- `POST /admin/login` - Admin login
- `GET /admin/dashboard` - Dashboard statistics
- `GET /admin/bookings` - Get all bookings
- `GET /admin/owners` - Get all owners
- `GET /admin/services` - Get all services

### Owner Endpoints
- `POST /owner/register` - Owner registration
- `POST /owner/login` - Owner login
- `GET /owner/dashboard` - Owner dashboard
- `GET /owner/services` - Get owner services
- `POST /owner/services` - Create new service
- `GET /owner/bookings` - Get owner bookings

## Database Schema

### Core Tables
- `admins` - System administrators
- `owners` - Service providers
- `services` - Available services (hotels, transport, halls)
- `locations` - Predefined locations
- `bookings` - Customer bookings
- `location_sessions` - USSD location sessions
- `voice_sessions` - Voice call sessions

### Analytics Tables
- `ussd_analytics` - USSD usage analytics
- `system_logs` - System logs

## USSD Flow Example

```
Welcome to Visitor Assist
Location: Lagos
1. Confirm location
2. Change location
3. Stay (Hotels)
4. Ride (Transport)
5. Hall (Events)

> User selects 3 (Stay)

STAY Services:
1. Grand Hotel - ₦25,000/night
2. Budget Inn - ₦15,000/night
3. Luxury Suites - ₦35,000/night
0. Back to main menu

> User selects 1

Grand Hotel
Price: ₦25,000/night
Luxury room with city view...
1. Book now
2. Call for details
0. Back

> User selects 1

Confirm booking:
Grand Hotel
Price: ₦25,000/night
1. Confirm
2. Cancel

> User selects 1

Booking confirmed! 
Ref: VA1234567890
You will receive SMS confirmation.
```

## Voice Flow Example

```
"Welcome to Visitor Assistance. 
For hotels, press 1. 
For transport, press 2. 
For event halls, press 3."

> User presses 1

"Available hotel services: 
Press 1 for Grand Hotel. 
Press 2 for Budget Inn. 
Press 0 to speak with an agent."

> User presses 1

"You selected Grand Hotel. 
Price is 25,000 naira per night. 
Press 1 to book now, 
press 2 to get more details, 
or press 0 to go back."

> User presses 1

"To complete your booking, 
please provide your exact location 
after the beep, then press hash."

[Records location]

"Thank you! Your booking reference is VA1234567890. 
The service provider will contact you shortly."
```

## Testing

### USSD Testing
```bash
# Test USSD flow
curl -X POST http://localhost:3000/ussd/test \
  -H "Content-Type: application/json" \
  -d '{
    "phoneNumber": "+2348123456789",
    "text": "",
    "sessionId": "test123"
  }'
```

### Voice Testing
```bash
# Test voice flow
curl -X POST http://localhost:3000/voice/test \
  -H "Content-Type: application/json" \
  -d '{
    "phoneNumber": "+2348123456789",
    "sessionId": "voice_test123",
    "isActive": true
  }'
```

## Deployment

### Production Deployment

1. **Server Setup:**
   - Ubuntu 20.04+ or CentOS 8+
   - Node.js 16+ LTS
   - MySQL 8.0+
   - Nginx (reverse proxy)
   - SSL certificate

2. **Environment:**
   - Set `NODE_ENV=production`
   - Use strong JWT secret
   - Configure proper database credentials
   - Set up SSL/HTTPS

3. **Process Management:**
   ```bash
   # Using PM2
   npm install -g pm2
   pm2 start server.js --name visitor-assistance
   pm2 startup
   pm2 save
   ```

4. **Nginx Configuration:**
   ```nginx
   server {
       listen 80;
       server_name yourdomain.com;
       
       location / {
           proxy_pass http://localhost:3000;
           proxy_http_version 1.1;
           proxy_set_header Upgrade $http_upgrade;
           proxy_set_header Connection 'upgrade';
           proxy_set_header Host $host;
           proxy_cache_bypass $http_upgrade;
       }
   }
   ```

### Docker Deployment

```dockerfile
FROM node:16-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
EXPOSE 3000
CMD ["npm", "start"]
```

## Monitoring and Maintenance

### Logging
- Application logs: `logs/combined.log`
- Error logs: `logs/error.log`
- Database logs: Check MySQL error logs

### Health Checks
- `GET /health` - Application health status
- Monitor database connections
- Check Africa's Talking API status

### Analytics
- USSD usage patterns in `ussd_analytics` table
- Booking conversion rates
- Popular services and locations
- Response time monitoring

## Security Considerations

- JWT tokens for authentication
- Input validation with Joi
- SQL injection prevention with parameterized queries
- Rate limiting on API endpoints
- HTTPS in production
- Environment variable protection
- Database connection encryption

## Support and Maintenance

### Common Issues
1. **USSD not responding:** Check Africa's Talking callback URL
2. **Voice calls failing:** Verify voice callback configuration
3. **Database connection errors:** Check MySQL service and credentials
4. **Location detection not working:** Verify OpenCellID API key

### Scaling Considerations
- Use Redis for session storage in production
- Implement database read replicas
- Add CDN for static assets
- Use load balancer for multiple instances
- Implement caching strategies

## License

MIT License - see LICENSE file for details.

## Contributing

1. Fork the repository
2. Create feature branch
3. Commit changes
4. Push to branch
5. Create Pull Request

## Contact

For support and questions:
- Email: support@visitorassist.com
- Phone: 0800-VISITOR
- Documentation: https://docs.visitorassist.com