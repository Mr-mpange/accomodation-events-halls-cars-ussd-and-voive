const mysql = require('mysql2/promise');
const bcrypt = require('bcryptjs');
require('dotenv').config();

const dbConfig = {
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'visitor_assistance'
};

async function seedDatabase() {
  const connection = await mysql.createConnection(dbConfig);

  try {
    console.log('Starting database seeding...');

    // Seed admin user
    const adminPassword = await bcrypt.hash('admin123', 10);
    await connection.execute(`
      INSERT IGNORE INTO admins (username, password, name, email)
      VALUES ('admin', ?, 'System Administrator', 'admin@visitorassist.com')
    `, [adminPassword]);

    // Seed sample locations
    const locations = [
      ['Victoria Island', 'Lagos', 'Lagos', 6.4281, 3.4219],
      ['Ikeja', 'Lagos', 'Lagos', 6.5954, 3.3364],
      ['Lekki', 'Lagos', 'Lagos', 6.4474, 3.5562],
      ['Garki', 'Abuja', 'FCT', 9.0579, 7.4951],
      ['Wuse', 'Abuja', 'FCT', 9.0643, 7.4892],
      ['Maitama', 'Abuja', 'FCT', 9.0982, 7.4951],
      ['GRA', 'Port Harcourt', 'Rivers', 4.8156, 7.0498],
      ['Trans Amadi', 'Port Harcourt', 'Rivers', 4.7719, 6.9972],
      ['Bodija', 'Ibadan', 'Oyo', 7.4407, 3.9125],
      ['Ring Road', 'Ibadan', 'Oyo', 7.3775, 3.9470],
      ['Cantonment', 'Kaduna', 'Kaduna', 10.5105, 7.4165],
      ['Barnawa', 'Kaduna', 'Kaduna', 10.5667, 7.4167],
      ['Independence Layout', 'Enugu', 'Enugu', 6.4474, 7.5248],
      ['New Haven', 'Enugu', 'Enugu', 6.4698, 7.5262],
      ['Asokoro', 'Abuja', 'FCT', 9.0364, 7.5340]
    ];

    for (const [name, city, state, lat, lng] of locations) {
      await connection.execute(`
        INSERT IGNORE INTO locations (name, city, state, latitude, longitude)
        VALUES (?, ?, ?, ?, ?)
      `, [name, city, state, lat, lng]);
    }

    // Seed sample owners
    const ownerPassword = await bcrypt.hash('owner123', 10);
    const owners = [
      ['John Doe', 'john@hotelexample.com', '+2348123456789', 'Grand Hotel Lagos', 'hotel', '123 Victoria Island, Lagos'],
      ['Jane Smith', 'jane@transportco.com', '+2348123456790', 'Swift Transport Services', 'transport', '456 Ikeja, Lagos'],
      ['Mike Johnson', 'mike@eventhall.com', '+2348123456791', 'Royal Event Center', 'event_hall', '789 Lekki, Lagos'],
      ['Sarah Wilson', 'sarah@abujastay.com', '+2348123456792', 'Capital Suites', 'hotel', '321 Garki, Abuja'],
      ['David Brown', 'david@phrides.com', '+2348123456793', 'Port Harcourt Rides', 'transport', '654 GRA, Port Harcourt']
    ];

    const ownerIds = [];
    for (const [name, email, phone, businessName, businessType, address] of owners) {
      const [result] = await connection.execute(`
        INSERT IGNORE INTO owners (name, email, phone, password, business_name, business_type, address, is_verified)
        VALUES (?, ?, ?, ?, ?, ?, ?, TRUE)
      `, [name, email, phone, ownerPassword, businessName, businessType, address]);
      
      if (result.insertId) {
        ownerIds.push(result.insertId);
      } else {
        // Get existing owner ID
        const [existing] = await connection.execute('SELECT id FROM owners WHERE email = ?', [email]);
        if (existing.length > 0) {
          ownerIds.push(existing[0].id);
        }
      }
    }

    // Seed sample services
    const services = [
      // Hotels
      [ownerIds[0] || 1, 'Deluxe Room', 'stay', 'Luxury room with city view, AC, WiFi, and breakfast included', '₦25,000/night', 'Victoria Island', 'Lagos', 'Lagos'],
      [ownerIds[0] || 1, 'Standard Room', 'stay', 'Comfortable room with basic amenities', '₦15,000/night', 'Victoria Island', 'Lagos', 'Lagos'],
      [ownerIds[3] || 4, 'Executive Suite', 'stay', 'Spacious suite with living area and kitchenette', '₦35,000/night', 'Garki', 'Abuja', 'FCT'],
      [ownerIds[3] || 4, 'Business Room', 'stay', 'Perfect for business travelers with work desk', '₦20,000/night', 'Garki', 'Abuja', 'FCT'],
      
      // Transport
      [ownerIds[1] || 2, 'Airport Transfer', 'ride', 'Comfortable ride to/from airport with professional driver', '₦5,000', 'Lagos', 'Lagos', 'Lagos'],
      [ownerIds[1] || 2, 'City Tour', 'ride', 'Full day city tour with experienced guide', '₦15,000', 'Lagos', 'Lagos', 'Lagos'],
      [ownerIds[4] || 5, 'Port Harcourt Taxi', 'ride', 'Reliable taxi service within Port Harcourt', '₦2,000/trip', 'Port Harcourt', 'Port Harcourt', 'Rivers'],
      [ownerIds[4] || 5, 'Inter-city Travel', 'ride', 'Comfortable travel between cities', '₦10,000', 'Port Harcourt', 'Port Harcourt', 'Rivers'],
      
      // Event Halls
      [ownerIds[2] || 3, 'Grand Ballroom', 'hall', 'Elegant ballroom for weddings and corporate events, capacity 500', '₦200,000/day', 'Lekki', 'Lagos', 'Lagos'],
      [ownerIds[2] || 3, 'Conference Room', 'hall', 'Modern conference facility with AV equipment, capacity 100', '₦50,000/day', 'Lekki', 'Lagos', 'Lagos'],
      [ownerIds[2] || 3, 'Garden Pavilion', 'hall', 'Outdoor venue perfect for garden parties, capacity 200', '₦80,000/day', 'Lekki', 'Lagos', 'Lagos']
    ];

    for (const [ownerId, name, category, description, price, location, city, state] of services) {
      await connection.execute(`
        INSERT IGNORE INTO services (owner_id, name, category, description, price, location, city, state)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `, [ownerId, name, category, description, price, location, city, state]);
    }

    // Seed sample bookings
    const bookings = [
      ['VA001', '+2348111111111', 1, ownerIds[0] || 1, 'pending'],
      ['VA002', '+2348111111112', 5, ownerIds[1] || 2, 'confirmed'],
      ['VA003', '+2348111111113', 9, ownerIds[2] || 3, 'completed'],
      ['VA004', '+2348111111114', 3, ownerIds[3] || 4, 'pending'],
      ['VA005', '+2348111111115', 7, ownerIds[4] || 5, 'confirmed']
    ];

    for (const [reference, phone, serviceId, ownerId, status] of bookings) {
      await connection.execute(`
        INSERT IGNORE INTO bookings (reference, phone_number, service_id, owner_id, status)
        VALUES (?, ?, ?, ?, ?)
      `, [reference, phone, serviceId, ownerId, status]);
    }

    console.log('Database seeded successfully!');
    console.log('\nSample credentials:');
    console.log('Admin: username=admin, password=admin123');
    console.log('Owner: email=john@hotelexample.com, password=owner123');
    console.log('\nUSSD Test: Use any phone number to test the USSD flow');

  } catch (error) {
    console.error('Seeding error:', error);
    throw error;
  } finally {
    await connection.end();
  }
}

if (require.main === module) {
  seedDatabase().catch(console.error);
}

module.exports = { seedDatabase };