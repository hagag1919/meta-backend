const db = require('./config/database');
const fs = require('fs');

async function runSchema() {
  try {
    console.log('📊 Creating exports table...');
    const schema = fs.readFileSync('./database/exports_schema.sql', 'utf8');
    await db.query(schema);
    console.log('✅ Exports table created successfully');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error creating exports table:', error);
    process.exit(1);
  }
}

runSchema();
