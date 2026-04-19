// ============================================
// Database Configuration
// PostgreSQL (Neon) Pool with MySQL2 Syntax Wrapper
// ============================================
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  // Add SSL mapping for Neon out-of-the-box compatibility
  ssl: { rejectUnauthorized: false }
});

// Create a seamless wrapper to prevent needing to refactor all 40KB of MySQL controllers
pool.execute = async function(sql, params = []) {
  // Convert MySQL '?' to Postgres '$1', '$2', ...
  let i = 1;
  const pgSql = sql.replace(/\?/g, () => `$${i++}`);

  // Auto-inject RETURNING id if it's an INSERT to simulate mysql2 insertId natively
  const isInsert = pgSql.trim().toUpperCase().startsWith('INSERT');
  const finalSql = (isInsert && !pgSql.toUpperCase().includes('RETURNING')) 
    ? `${pgSql} RETURNING id` 
    : pgSql;

  const res = await pool.query(finalSql, params);
  
  if (isInsert) {
    // Mirror mysql2's insert wrapper response
    return [{
       insertId: res.rows && res.rows.length > 0 ? res.rows[0].id : null,
       affectedRows: res.rowCount
    }];
  }

  const isUpdate = pgSql.trim().toUpperCase().startsWith('UPDATE') || pgSql.trim().toUpperCase().startsWith('DELETE');
  if (isUpdate) {
    // Mirror mysql2's update wrapper response
    return [{
       affectedRows: res.rowCount,
       changedRows: res.rowCount
    }];
  }

  // Pure SELECT structure for mysql2
  return [res.rows, res.fields];
};

// Map query safely
pool.query = pool.execute;

// Handle getting connection exactly like mysql2 does `const conn = await pool.getConnection();`
pool.getConnection = async () => {
  const client = await pool.connect();
  
  // Bind abstraction to client
  client.execute = async (sql, params) => pool.execute.call(client, sql, params);
  client.query = client.execute;
  
  // Standardize release mapping
  const release = client.release;
  client.release = () => release.call(client);
  
  return client;
};

// Test connection on startup
async function testConnection() {
  try {
    const connection = await pool.getConnection();
    console.log('✅ PostgreSQL (Neon) connected and abstracting seamlessly!');
    connection.release();
  } catch (error) {
    console.error('❌ PostgreSQL connection failed:', error.message);
    console.error('Make sure DATABASE_URL is configured tightly inside .env.');
  }
}

testConnection();

module.exports = pool;
