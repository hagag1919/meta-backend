const db = require('./config/database');

async function testTable() {
  try {
    console.log('🔍 Checking if exports table exists...');
    const result = await db.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'exports'
      )
    `);
    
    if (result.rows[0].exists) {
      console.log('✅ Exports table already exists');
      
      // Check structure
      const structure = await db.query(`
        SELECT column_name, data_type 
        FROM information_schema.columns 
        WHERE table_name = 'exports' 
        ORDER BY ordinal_position
      `);
      console.log('Table structure:', structure.rows);
    } else {
      console.log('❌ Exports table does not exist');
    }
    
    process.exit(0);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

testTable();
