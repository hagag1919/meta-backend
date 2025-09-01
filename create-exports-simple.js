const db = require('./config/database');

async function createExportsTable() {
  try {
    console.log('📊 Creating exports table...');
    
    // Create the table without comments first
    await db.query(`
      CREATE TABLE IF NOT EXISTS exports (
          id SERIAL PRIMARY KEY,
          user_id UUID NOT NULL,
          filename VARCHAR(255) NOT NULL,
          file_path VARCHAR(500) NOT NULL,
          export_type VARCHAR(50) NOT NULL CHECK (export_type IN ('excel', 'pdf', 'csv', 'json')),
          entity_type VARCHAR(100) DEFAULT 'data',
          record_count INTEGER DEFAULT 0,
          file_size BIGINT DEFAULT 0,
          is_public BOOLEAN DEFAULT FALSE,
          download_count INTEGER DEFAULT 0,
          expires_at TIMESTAMP,
          metadata JSONB DEFAULT '{}',
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    
    console.log('✅ Exports table created');
    
    // Add indexes
    await db.query('CREATE INDEX IF NOT EXISTS idx_exports_user_id ON exports(user_id)');
    await db.query('CREATE INDEX IF NOT EXISTS idx_exports_created_at ON exports(created_at DESC)');
    await db.query('CREATE INDEX IF NOT EXISTS idx_exports_export_type ON exports(export_type)');
    
    console.log('✅ Indexes created');
    
    // Add trigger function
    await db.query(`
      CREATE OR REPLACE FUNCTION update_exports_updated_at()
      RETURNS TRIGGER AS $$
      BEGIN
          NEW.updated_at = CURRENT_TIMESTAMP;
          RETURN NEW;
      END;
      $$ LANGUAGE plpgsql
    `);
    
    // Add trigger
    await db.query(`
      DROP TRIGGER IF EXISTS trigger_exports_updated_at ON exports;
      CREATE TRIGGER trigger_exports_updated_at
          BEFORE UPDATE ON exports
          FOR EACH ROW
          EXECUTE FUNCTION update_exports_updated_at()
    `);
    
    console.log('✅ Trigger created');
    console.log('✅ All exports table components created successfully');
    process.exit(0);
    
  } catch (error) {
    console.error('❌ Error creating exports table:', error);
    process.exit(1);
  }
}

createExportsTable();
