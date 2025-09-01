const postgres = require('postgres');
require('dotenv').config();

// Import the new database connection
let sql;

// For backwards compatibility, we'll keep the existing structure
// but use the new postgres connection internally
const connectionString = process.env.DATABASE_URL;
console.log('🔧 Using DATABASE_URL:', !!connectionString);

// Initialize postgres connection with multiple fallback strategies
async function init() {
  const connectionOptions = {
    ssl: 'require',
    connection: {
      application_name: 'meta-backend'
    },
    // Optimized connection settings
    max: 20,                    // Maximum connections in pool
    idle_timeout: 20,           // Close idle connections after 20 seconds
    connect_timeout: 30,        // Increased connection timeout
    // Transform configuration for better compatibility
    transform: {
      undefined: null
    },
    // Handle connection errors gracefully
    onnotice: () => {},         // Suppress notices
    debug: process.env.NODE_ENV === 'development'
  };

  // Try direct connection first
  try {
    console.log('🔗 Attempting direct database connection...');
    sql = postgres(connectionString, connectionOptions);
    
    // Test the connection
    const result = await sql`SELECT NOW() as current_time, version() as db_version`;
    console.log('✅ Database connected successfully (Direct connection)');
    console.log('🕐 Database time:', result[0].current_time);
    console.log('📊 Database version:', result[0].db_version.split(' ')[0]);
    
    return true;
  } catch (error) {
    console.warn('❌ Direct connection failed:', error.message);
    
    // Try session pooler as fallback
    try {
      console.log('🔗 Attempting session pooler connection...');
      const poolerUrl = connectionString.replace(
        'db.xskfbqttkhkbsmcowhtr.supabase.co:5432',
        'aws-1-eu-north-1.pooler.supabase.com:5432'
      ).replace(
        'postgres:',
        'postgres.xskfbqttkhkbsmcowhtr:'
      );
      
      sql = postgres(poolerUrl, {
        ...connectionOptions,
        ssl: 'prefer' // More flexible SSL for pooler
      });
      
      const result = await sql`SELECT NOW() as current_time`;
      console.log('✅ Database connected successfully (Session Pooler)');
      console.log('🕐 Database time:', result[0].current_time);
      
      return true;
    } catch (poolerError) {
      console.error('❌ Session pooler connection also failed:', poolerError.message);
      
      // Try transaction pooler as last resort
      try {
        console.log('🔗 Attempting transaction pooler connection...');
        const transactionPoolerUrl = connectionString.replace(
          'db.xskfbqttkhkbsmcowhtr.supabase.co:5432',
          'aws-1-eu-north-1.pooler.supabase.com:6543'
        ).replace(
          'postgres:',
          'postgres.xskfbqttkhkbsmcowhtr:'
        );
        
        sql = postgres(transactionPoolerUrl, {
          ...connectionOptions,
          ssl: 'prefer'
        });
        
        const result = await sql`SELECT NOW() as current_time`;
        console.log('✅ Database connected successfully (Transaction Pooler)');
        console.log('🕐 Database time:', result[0].current_time);
        
        return true;
      } catch (transactionError) {
        console.error('❌ All connection methods failed:', transactionError.message);
        throw new Error('Unable to connect to database with any method');
      }
    }
  }
}

// Initialize connection
let initPromise = init();

// Query function with improved error handling and performance
const query = async (text, params = []) => {
  const start = Date.now();
  try {
    // Ensure connection is initialized
    if (!sql) await initPromise;
    
    // Use tagged template for better security and performance
    let result;
    if (params && params.length > 0) {
      // For parameterized queries, use unsafe method for backwards compatibility
      result = await sql.unsafe(text, params);
    } else {
      // For simple queries without parameters, use tagged template
      result = await sql.unsafe(text);
    }
    
    // Normalize to pg-like shape for routes expecting .rows
    const normalizedResult = {
      rows: Array.isArray(result) ? result : [result],
      rowCount: result.count ?? (Array.isArray(result) ? result.length : 1)
    };
    
    // Log slow queries in development
    const duration = Date.now() - start;
    if (duration > 1000 && process.env.NODE_ENV === 'development') {
      console.warn(`🐌 Slow query detected (${duration}ms):`, text.replace(/\s+/g, ' ').trim());
    }
    
    return normalizedResult;
  } catch (error) {
    const duration = Date.now() - start;
    console.error('Database query error:', {
      query: text.replace(/\s+/g, ' ').trim(),
      params: params ? params.map(p => 
        typeof p === 'string' && p.length > 50 ? p.substring(0, 50) + '...' : p
      ) : [],
      error: error.message,
      duration,
      code: error.code
    });
    throw error;
  }
};

// Health check function
const checkConnection = async () => {
  try {
    if (!sql) await initPromise;
    const result = await sql`SELECT NOW() as current_time, 
                                   pg_database_size(current_database()) as db_size,
                                   version() as db_version`;
    
    const info = result[0];
    console.log('✅ Database health check passed');
    console.log('🕐 Current time:', info.current_time);
    console.log('💾 Database size:', Math.round(info.db_size / 1024 / 1024) + ' MB');
    console.log('📊 Version:', info.db_version.split(' ')[0]);
    
    return true;
  } catch (error) {
    console.error('❌ Database health check failed:', error.message);
    console.log('📡 Retrying database connection in 5 seconds...');
    setTimeout(checkConnection, 5000);
    return false;
  }
};

// Graceful shutdown function
const close = async () => {
  try {
    if (sql) {
      await sql.end({ timeout: 5 });
      console.log('📦 Database connection closed gracefully');
    }
  } catch (error) {
    console.error('Error closing database connection:', error.message);
  }
};

// Advanced query function for complex operations
const transaction = async (callback) => {
  if (!sql) await initPromise;
  return await sql.begin(async sql => {
    return await callback(sql);
  });
};

// Run initial health check
checkConnection();

// Handle graceful shutdown
process.on('SIGINT', close);
process.on('SIGTERM', close);

module.exports = {
  query,
  transaction,
  checkConnection,
  close,
  // Direct access to sql instance for advanced usage
  sql: () => sql
};
