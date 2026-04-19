// ============================================
// Database Configuration
// MySQL2 Connection Pool with Promise wrapper
// ============================================
const mysql = require('mysql2/promise');

const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASS || '',
  database: process.env.DB_NAME || 'budgetbukas',
  port: process.env.DB_PORT || 3306,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  // Enable SSL for cloud databases
  ...(process.env.DB_SSL === 'true' ? { ssl: { rejectUnauthorized: true } } : {})
});

// Test connection on startup
async function testConnection() {
  try {
    const connection = await pool.getConnection();
    console.log('✅ MySQL connected successfully');
    connection.release();
  } catch (error) {
    console.error('❌ MySQL connection failed:', error.message);
    console.error('Make sure MySQL is running and the database "budgetbukas" exists.');
    console.error('Run the schema: mysql -u root -p < database/schema.sql');
  }
}

testConnection();

module.exports = pool;
