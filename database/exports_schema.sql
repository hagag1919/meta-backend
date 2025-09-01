-- Create exports table for storing document export metadata
CREATE TABLE IF NOT EXISTS exports (
    id SERIAL PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
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
);

-- Add indexes for better performance
CREATE INDEX IF NOT EXISTS idx_exports_user_id ON exports(user_id);
CREATE INDEX IF NOT EXISTS idx_exports_created_at ON exports(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_exports_export_type ON exports(export_type);
CREATE INDEX IF NOT EXISTS idx_exports_is_public ON exports(is_public);
CREATE INDEX IF NOT EXISTS idx_exports_expires_at ON exports(expires_at) WHERE expires_at IS NOT NULL;

-- Add trigger to automatically update updated_at timestamp
CREATE OR REPLACE FUNCTION update_exports_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_exports_updated_at
    BEFORE UPDATE ON exports
    FOR EACH ROW
    EXECUTE FUNCTION update_exports_updated_at();

-- Add comments for documentation
COMMENT ON TABLE exports IS 'Stores metadata for document exports created by users';
COMMENT ON COLUMN exports.file_path IS 'Path to the file in Supabase Storage bucket';
COMMENT ON COLUMN exports.export_type IS 'Type of export: excel, pdf, csv, json';
COMMENT ON COLUMN exports.entity_type IS 'Type of data exported: projects, tasks, users, etc.';
COMMENT ON COLUMN exports.record_count IS 'Number of records included in the export';
COMMENT ON COLUMN exports.file_size IS 'File size in bytes';
COMMENT ON COLUMN exports.is_public IS 'Whether the export can be accessed without authentication';
COMMENT ON COLUMN exports.download_count IS 'Number of times the export has been downloaded';
COMMENT ON COLUMN exports.expires_at IS 'When the export expires and should be cleaned up';
COMMENT ON COLUMN exports.metadata IS 'Additional metadata about the export (JSON)';
