import postgres from 'postgres'

const connectionString = process.env.DATABASE_URL
const sql = postgres(connectionString, {
  ssl: 'require',
  connection: {
    application_name: 'meta-backend'
  },
  // Handle connection pooling and retries
  max: 20,
  idle_timeout: 20,
  connect_timeout: 10,
  // Transform configuration for better compatibility
  transform: {
    undefined: null
  }
})

// Test the connection
async function testConnection() {
  try {
    const result = await sql`SELECT NOW() as current_time, version() as db_version`
    console.log('✅ Database connected successfully')
    console.log('🕐 Database time:', result[0].current_time)
    console.log('📊 Database version:', result[0].db_version.split(' ')[0])
    return true
  } catch (error) {
    console.error('❌ Database connection failed:', error.message)
    throw error
  }
}

// Initialize connection on startup
testConnection().catch(console.error)

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('🔄 Closing database connection...')
  await sql.end({ timeout: 5 })
  console.log('📦 Database connection closed')
  process.exit(0)
})

export default sql
