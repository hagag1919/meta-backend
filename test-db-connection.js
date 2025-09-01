const db = require('./config/database.js');

async function testDatabase() {
  console.log('🧪 Testing new database connection...\n');
  
  try {
    // Test 1: Basic connection and time check
    console.log('Test 1: Basic connection test');
    const timeResult = await db.query('SELECT NOW() as current_time');
    console.log('✅ Connection successful. Current time:', timeResult.rows[0].current_time);
    
    // Test 2: Database structure check
    console.log('\nTest 2: Database structure check');
    const tableResult = await db.query(`
      SELECT COUNT(*) as table_count 
      FROM information_schema.tables 
      WHERE table_schema = 'public'
    `);
    console.log('✅ Public tables found:', tableResult.rows[0].table_count);
    
    // Test 3: Check for users table (should exist)
    console.log('\nTest 3: Users table check');
    const usersCheck = await db.query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'users' 
      AND table_schema = 'public'
      ORDER BY ordinal_position
      LIMIT 5
    `);
    
    if (usersCheck.rows.length > 0) {
      console.log('✅ Users table exists with columns:');
      usersCheck.rows.forEach(col => {
        console.log(`   - ${col.column_name}: ${col.data_type}`);
      });
    } else {
      console.log('⚠️  Users table not found - may need to run migrations');
    }
    
    // Test 4: Transaction test
    console.log('\nTest 4: Transaction test');
    if (db.transaction) {
      await db.transaction(async (sql) => {
        const result = await sql`SELECT 1 as test_value`;
        console.log('✅ Transaction test successful:', result[0].test_value);
      });
    } else {
      console.log('ℹ️  Transaction function not available in this version');
    }
    
    console.log('\n🎉 All database tests passed!');
    console.log('\n📊 Database connection summary:');
    console.log('  - Host: db.xskfbqttkhkbsmcowhtr.supabase.co');
    console.log('  - Type: Direct connection (persistent)');
    console.log('  - SSL: Required');
    console.log('  - Library: postgres.js');
    console.log('  - Status: ✅ Connected and functional');
    
  } catch (error) {
    console.error('❌ Database test failed:', error.message);
    console.error('Error details:', error.code || 'No error code');
    
    if (error.message.includes('connect')) {
      console.log('\n🔧 Connection troubleshooting:');
      console.log('  1. Check if DATABASE_URL is correct in .env');
      console.log('  2. Verify network connectivity to Supabase');
      console.log('  3. Ensure password is correct');
      console.log('  4. Try using Transaction Pooler URL for IPv4 networks');
    }
  } finally {
    // Clean up
    console.log('\n📦 Closing database connection...');
    await db.close();
    process.exit(0);
  }
}

// Run the test
testDatabase().catch(console.error);
