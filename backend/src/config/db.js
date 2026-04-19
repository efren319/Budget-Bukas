// ============================================
// Database Configuration
// PostgreSQL (Neon) Pool with MySQL2 Syntax Wrapper
// ============================================
const { Pool } = require('pg');

if (!process.env.DATABASE_URL) {
  console.error('❌ ERROR: DATABASE_URL is not set in environment variables! Check your Render dashboard.');
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

// Create a seamless wrapper to prevent needing to refactor all 40KB of MySQL controllers
pool.execute = async function(sql, params = []) {
  // Convert MySQL '?' to Postgres '$1', '$2', ...
  let i = 1;
  const pgSql = sql.replace(/\?/g, () => `$${i++}`);

  // Trace the mapping for Render logs
  console.log(`📡 DB Query: ${pgSql.substring(0, 100)}...`);

  // Auto-inject RETURNING id if it's an INSERT 
  const isInsert = pgSql.trim().toUpperCase().startsWith('INSERT');
  const finalSql = (isInsert && !pgSql.toUpperCase().includes('RETURNING')) 
    ? `${pgSql} RETURNING id` 
    : pgSql;

  try {
    const res = await this.query(finalSql, params);
    
    if (isInsert) {
      return [{
         insertId: res.rows && res.rows.length > 0 ? res.rows[0].id : null,
         affectedRows: res.rowCount
      }];
    }

    const isUpdate = pgSql.trim().toUpperCase().startsWith('UPDATE') || pgSql.trim().toUpperCase().startsWith('DELETE');
    if (isUpdate) {
      return [{
         affectedRows: res.rowCount,
         changedRows: res.rowCount
      }];
    }

    return [res.rows, res.fields];
  } catch (err) {
    console.error(`❌ DB Error on query [${finalSql}]:`, err.message);
    throw err;
  }
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
