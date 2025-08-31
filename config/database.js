const { Pool } = require('pg');

require('dotenv').config();

const { secureQuery } = require('../middleware/security');


const poolConfig = process.env.DATABASE_URL ? {
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  },
  max: 10, 
  idleTimeoutMillis: 60000,
  connectionTimeoutMillis: 30000,
  query_timeout: 30000,
  keepAlive: true,
  keepAliveInitialDelayMillis: 0
} : {
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 5432,
  database: process.env.DB_NAME || 'meta_project_db',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'password',
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
};

console.log('🔧 Using DATABASE_URL:', !!process.env.DATABASE_URL);

const pool = new Pool(poolConfig);

const query = async (text, params = []) => {
  const start = Date.now();
  try {
    return await secureQuery(pool, text, params);
  } catch (error) {
    console.error('Database query error:', {
      query: text.replace(/\s+/g, ' ').trim(),
      params: params.map(p => typeof p === 'string' && p.length > 50 ? p.substring(0, 50) + '...' : p),
      error: error.message,
      duration: Date.now() - start
    });
    throw error;
  }
};

const checkConnection = async () => {
  try {
    const client = await pool.connect();
    const result = await client.query('SELECT NOW()');
    client.release();
    console.log('✅ Database connected successfully at:', result.rows[0].now);
    return true;
  } catch (error) {
    console.error('❌ Database connection failed:', error.message);
    console.log('📡 Retrying database connection in 5 seconds...');
    setTimeout(checkConnection, 5000);
    return false;
  }
};

const close = async () => {
  try {
    await pool.end();
    console.log('📦 Database connection pool closed');
  } catch (error) {
    console.error('Error closing database pool:', error.message);
  }
};

checkConnection();

module.exports = {
  query,
  pool,
  checkConnection,
  close
};
