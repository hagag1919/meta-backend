-- Meta Software Project Management System Database Schema
-- PostgreSQL Database Schema
-- Created: August 31, 2025

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Enable encryption extension for password hashing
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- =============================================================================
-- ENUM TYPES
-- =============================================================================

-- User role types
CREATE TYPE user_role AS ENUM ('administrator', 'developer', 'client');

-- Project status types
CREATE TYPE project_status AS ENUM ('ongoing', 'completed', 'stopped', 'planning');

-- Task priority types
CREATE TYPE task_priority AS ENUM ('low', 'medium', 'high');

-- Task status types
CREATE TYPE task_status AS ENUM ('new', 'in_progress', 'completed', 'canceled');

-- Payment status types
CREATE TYPE payment_status AS ENUM ('pending', 'paid', 'overdue', 'canceled');

-- Notification types
CREATE TYPE notification_type AS ENUM ('task_assigned', 'task_status_changed', 'project_update', 'message', 'system');

-- Language preference
CREATE TYPE language_preference AS ENUM ('en', 'ar');

-- =============================================================================
-- CORE TABLES
-- =============================================================================

-- Users table (handles login and user management)
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    first_name VARCHAR(100) NOT NULL,
    last_name VARCHAR(100) NOT NULL,
    phone VARCHAR(20),
    role user_role NOT NULL DEFAULT 'developer',
    is_active BOOLEAN DEFAULT true,
    email_verified BOOLEAN DEFAULT false,
    last_login TIMESTAMP WITH TIME ZONE,
    password_reset_token VARCHAR(255),
    password_reset_expires TIMESTAMP WITH TIME ZONE,
    profile_image_url VARCHAR(500),
    language_preference language_preference DEFAULT 'en',
    timezone VARCHAR(50) DEFAULT 'UTC',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Companies/Clients table
CREATE TABLE companies (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255),
    phone VARCHAR(20),
    address TEXT,
    website VARCHAR(255),
    logo_url VARCHAR(500),
    contact_person VARCHAR(255),
    notes TEXT,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Client users (links users to companies)
CREATE TABLE client_users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    is_primary_contact BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, company_id)
);

-- Projects table
CREATE TABLE projects (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    description TEXT,
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    project_manager_id UUID REFERENCES users(id),
    budget DECIMAL(15, 2),
    currency VARCHAR(3) DEFAULT 'USD',
    start_date DATE,
    end_date DATE,
    estimated_hours INTEGER,
    actual_hours INTEGER DEFAULT 0,
    status project_status DEFAULT 'planning',
    progress_percentage INTEGER DEFAULT 0 CHECK (progress_percentage >= 0 AND progress_percentage <= 100),
    repository_url VARCHAR(500),
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Project team members
CREATE TABLE project_members (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role VARCHAR(100) DEFAULT 'Developer',
    hourly_rate DECIMAL(10, 2),
    joined_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    left_at TIMESTAMP WITH TIME ZONE,
    UNIQUE(project_id, user_id)
);

-- Project milestones
CREATE TABLE milestones (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    due_date DATE,
    is_completed BOOLEAN DEFAULT false,
    completed_at TIMESTAMP WITH TIME ZONE,
    order_index INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Tasks table
CREATE TABLE tasks (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    milestone_id UUID REFERENCES milestones(id) ON DELETE SET NULL,
    assigned_to UUID REFERENCES users(id) ON DELETE SET NULL,
    created_by UUID NOT NULL REFERENCES users(id),
    title VARCHAR(255) NOT NULL,
    description TEXT,
    priority task_priority DEFAULT 'medium',
    status task_status DEFAULT 'new',
    estimated_hours INTEGER,
    actual_hours INTEGER DEFAULT 0,
    due_date TIMESTAMP WITH TIME ZONE,
    started_at TIMESTAMP WITH TIME ZONE,
    completed_at TIMESTAMP WITH TIME ZONE,
    order_index INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Task dependencies
CREATE TABLE task_dependencies (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    depends_on_task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(task_id, depends_on_task_id),
    CHECK(task_id != depends_on_task_id)
);

-- =============================================================================
-- FILE MANAGEMENT
-- =============================================================================

-- File uploads (for projects and tasks)
CREATE TABLE files (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    filename VARCHAR(255) NOT NULL,
    original_filename VARCHAR(255) NOT NULL,
    file_path VARCHAR(500) NOT NULL,
    file_size BIGINT NOT NULL,
    mime_type VARCHAR(100),
    uploaded_by UUID NOT NULL REFERENCES users(id),
    project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
    task_id UUID REFERENCES tasks(id) ON DELETE CASCADE,
    is_public BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CHECK((project_id IS NOT NULL) OR (task_id IS NOT NULL))
);

-- =============================================================================
-- COMMUNICATION
-- =============================================================================

-- Comments (for projects and tasks)
CREATE TABLE comments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    content TEXT NOT NULL,
    author_id UUID NOT NULL REFERENCES users(id),
    project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
    task_id UUID REFERENCES tasks(id) ON DELETE CASCADE,
    parent_comment_id UUID REFERENCES comments(id) ON DELETE CASCADE,
    is_internal BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CHECK((project_id IS NOT NULL) OR (task_id IS NOT NULL))
);

-- Chat rooms
CREATE TABLE chat_rooms (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255),
    is_group_chat BOOLEAN DEFAULT false,
    project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
    created_by UUID NOT NULL REFERENCES users(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Chat room participants
CREATE TABLE chat_participants (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    chat_room_id UUID NOT NULL REFERENCES chat_rooms(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    joined_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    left_at TIMESTAMP WITH TIME ZONE,
    UNIQUE(chat_room_id, user_id)
);

-- Chat messages
CREATE TABLE chat_messages (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    chat_room_id UUID NOT NULL REFERENCES chat_rooms(id) ON DELETE CASCADE,
    sender_id UUID NOT NULL REFERENCES users(id),
    content TEXT NOT NULL,
    message_type VARCHAR(50) DEFAULT 'text',
    file_id UUID REFERENCES files(id),
    is_edited BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Notifications
CREATE TABLE notifications (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    type notification_type NOT NULL,
    title VARCHAR(255) NOT NULL,
    message TEXT,
    data JSONB,
    is_read BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- =============================================================================
-- TIME TRACKING & INVOICING
-- =============================================================================

-- Time entries
CREATE TABLE time_entries (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id),
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    task_id UUID REFERENCES tasks(id) ON DELETE CASCADE,
    description TEXT,
    hours_worked DECIMAL(8, 2) NOT NULL CHECK (hours_worked > 0),
    hourly_rate DECIMAL(10, 2),
    date_worked DATE NOT NULL,
    start_time TIME,
    end_time TIME,
    is_billable BOOLEAN DEFAULT true,
    is_invoiced BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Invoices
CREATE TABLE invoices (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    invoice_number VARCHAR(50) UNIQUE NOT NULL,
    project_id UUID NOT NULL REFERENCES projects(id),
    company_id UUID NOT NULL REFERENCES companies(id),
    issued_by UUID NOT NULL REFERENCES users(id),
    issue_date DATE NOT NULL,
    due_date DATE NOT NULL,
    subtotal DECIMAL(15, 2) NOT NULL,
    tax_rate DECIMAL(5, 2) DEFAULT 0,
    tax_amount DECIMAL(15, 2) DEFAULT 0,
    total_amount DECIMAL(15, 2) NOT NULL,
    currency VARCHAR(3) DEFAULT 'USD',
    status payment_status DEFAULT 'pending',
    paid_date DATE,
    notes TEXT,
    pdf_path VARCHAR(500),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Invoice line items
CREATE TABLE invoice_items (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    invoice_id UUID NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
    description TEXT NOT NULL,
    quantity DECIMAL(10, 2) NOT NULL,
    unit_price DECIMAL(10, 2) NOT NULL,
    total_price DECIMAL(15, 2) NOT NULL,
    time_entry_id UUID REFERENCES time_entries(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Payments
CREATE TABLE payments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    invoice_id UUID NOT NULL REFERENCES invoices(id),
    amount DECIMAL(15, 2) NOT NULL,
    payment_date DATE NOT NULL,
    payment_method VARCHAR(100),
    transaction_id VARCHAR(255),
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- =============================================================================
-- SYSTEM SETTINGS
-- =============================================================================

-- System settings
CREATE TABLE system_settings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    setting_key VARCHAR(100) UNIQUE NOT NULL,
    setting_value TEXT,
    setting_type VARCHAR(50) DEFAULT 'string',
    description TEXT,
    is_public BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Activity logs
CREATE TABLE activity_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id),
    action VARCHAR(100) NOT NULL,
    entity_type VARCHAR(100),
    entity_id UUID,
    details JSONB,
    ip_address INET,
    user_agent TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- =============================================================================
-- INDEXES FOR PERFORMANCE
-- =============================================================================

-- User indexes
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_role ON users(role);
CREATE INDEX idx_users_active ON users(is_active);

-- Project indexes
CREATE INDEX idx_projects_company ON projects(company_id);
CREATE INDEX idx_projects_status ON projects(status);
CREATE INDEX idx_projects_manager ON projects(project_manager_id);
CREATE INDEX idx_projects_dates ON projects(start_date, end_date);

-- Task indexes
CREATE INDEX idx_tasks_project ON tasks(project_id);
CREATE INDEX idx_tasks_assigned ON tasks(assigned_to);
CREATE INDEX idx_tasks_status ON tasks(status);
CREATE INDEX idx_tasks_priority ON tasks(priority);
CREATE INDEX idx_tasks_due_date ON tasks(due_date);

-- Time entry indexes
CREATE INDEX idx_time_entries_user ON time_entries(user_id);
CREATE INDEX idx_time_entries_project ON time_entries(project_id);
CREATE INDEX idx_time_entries_date ON time_entries(date_worked);
CREATE INDEX idx_time_entries_billable ON time_entries(is_billable);

-- Notification indexes
CREATE INDEX idx_notifications_user ON notifications(user_id);
CREATE INDEX idx_notifications_read ON notifications(is_read);
CREATE INDEX idx_notifications_created ON notifications(created_at);

-- Comment indexes
CREATE INDEX idx_comments_project ON comments(project_id);
CREATE INDEX idx_comments_task ON comments(task_id);
CREATE INDEX idx_comments_author ON comments(author_id);

-- Chat indexes
CREATE INDEX idx_chat_messages_room ON chat_messages(chat_room_id);
CREATE INDEX idx_chat_messages_sender ON chat_messages(sender_id);
CREATE INDEX idx_chat_messages_created ON chat_messages(created_at);

-- File indexes
CREATE INDEX idx_files_project ON files(project_id);
CREATE INDEX idx_files_task ON files(task_id);
CREATE INDEX idx_files_uploader ON files(uploaded_by);

-- Invoice indexes
CREATE INDEX idx_invoices_project ON invoices(project_id);
CREATE INDEX idx_invoices_company ON invoices(company_id);
CREATE INDEX idx_invoices_status ON invoices(status);
CREATE INDEX idx_invoices_due_date ON invoices(due_date);

-- =============================================================================
-- VIEWS FOR COMMON QUERIES
-- =============================================================================

-- Project summary view
CREATE VIEW project_summary AS
SELECT 
    p.id,
    p.name,
    p.status,
    p.progress_percentage,
    p.budget,
    p.start_date,
    p.end_date,
    c.name as company_name,
    u.first_name || ' ' || u.last_name as project_manager,
    COUNT(DISTINCT t.id) as total_tasks,
    COUNT(DISTINCT CASE WHEN t.status = 'completed' THEN t.id END) as completed_tasks,
    COUNT(DISTINCT pm.user_id) as team_members,
    SUM(te.hours_worked) as total_hours_logged
FROM projects p
    LEFT JOIN companies c ON p.company_id = c.id
    LEFT JOIN users u ON p.project_manager_id = u.id
    LEFT JOIN tasks t ON p.id = t.project_id
    LEFT JOIN project_members pm ON p.id = pm.project_id AND pm.left_at IS NULL
    LEFT JOIN time_entries te ON p.id = te.project_id
GROUP BY p.id, p.name, p.status, p.progress_percentage, p.budget, 
         p.start_date, p.end_date, c.name, u.first_name, u.last_name;

-- User dashboard view
CREATE VIEW user_dashboard AS
SELECT 
    u.id as user_id,
    u.first_name || ' ' || u.last_name as full_name,
    COUNT(DISTINCT CASE WHEN t.assigned_to = u.id AND t.status != 'completed' THEN t.id END) as active_tasks,
    COUNT(DISTINCT CASE WHEN t.assigned_to = u.id AND t.status = 'completed' THEN t.id END) as completed_tasks,
    COUNT(DISTINCT CASE WHEN t.assigned_to = u.id AND t.due_date < CURRENT_DATE AND t.status != 'completed' THEN t.id END) as overdue_tasks,
    COUNT(DISTINCT pm.project_id) as active_projects,
    COALESCE(SUM(te.hours_worked), 0) as total_hours_this_month
FROM users u
    LEFT JOIN tasks t ON u.id = t.assigned_to
    LEFT JOIN project_members pm ON u.id = pm.user_id AND pm.left_at IS NULL
    LEFT JOIN time_entries te ON u.id = te.user_id AND te.date_worked >= DATE_TRUNC('month', CURRENT_DATE)
WHERE u.is_active = true
GROUP BY u.id, u.first_name, u.last_name;

-- =============================================================================
-- FUNCTIONS
-- =============================================================================

-- Function to update project progress based on completed tasks
CREATE OR REPLACE FUNCTION update_project_progress()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE projects 
    SET progress_percentage = (
        SELECT CASE 
            WHEN COUNT(*) = 0 THEN 0
            ELSE ROUND((COUNT(CASE WHEN status = 'completed' THEN 1 END) * 100.0) / COUNT(*))
        END
        FROM tasks 
        WHERE project_id = COALESCE(NEW.project_id, OLD.project_id)
    ),
    updated_at = CURRENT_TIMESTAMP
    WHERE id = COALESCE(NEW.project_id, OLD.project_id);
    
    RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

-- Function to update timestamps
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- =============================================================================
-- TRIGGERS
-- =============================================================================

-- Triggers to update updated_at columns
CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_projects_updated_at BEFORE UPDATE ON projects
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_tasks_updated_at BEFORE UPDATE ON tasks
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_comments_updated_at BEFORE UPDATE ON comments
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_milestones_updated_at BEFORE UPDATE ON milestones
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_time_entries_updated_at BEFORE UPDATE ON time_entries
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_invoices_updated_at BEFORE UPDATE ON invoices
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_system_settings_updated_at BEFORE UPDATE ON system_settings
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_project_progress_trigger 
    AFTER INSERT OR UPDATE OR DELETE ON tasks
    FOR EACH ROW EXECUTE FUNCTION update_project_progress();

-- =============================================================================
-- INITIAL DATA
-- =============================================================================

-- Insert default system settings
INSERT INTO system_settings (setting_key, setting_value, setting_type, description, is_public) VALUES
('company_name', 'Meta Software', 'string', 'Company name', true),
('company_logo', '', 'string', 'Company logo URL', true),
('primary_color', '#3B82F6', 'string', 'Primary brand color', true),
('secondary_color', '#1E40AF', 'string', 'Secondary brand color', true),
('default_language', 'en', 'string', 'Default system language', true),
('default_timezone', 'UTC', 'string', 'Default system timezone', true),
('currency', 'USD', 'string', 'Default currency', true),
('smtp_host', '', 'string', 'SMTP server host', false),
('smtp_port', '587', 'string', 'SMTP server port', false),
('smtp_username', '', 'string', 'SMTP username', false),
('smtp_password', '', 'string', 'SMTP password', false),
('jwt_secret', '', 'string', 'JWT secret key', false),
('file_upload_max_size', '10485760', 'number', 'Maximum file upload size in bytes (10MB)', false),
('allowed_file_types', 'pdf,doc,docx,xls,xlsx,ppt,pptx,txt,jpg,jpeg,png,gif,zip,rar', 'string', 'Allowed file upload types', false);

-- Create default administrator user (password: admin123 - should be changed immediately)
INSERT INTO users (email, password_hash, first_name, last_name, role, is_active, email_verified) VALUES
('admin@metasoftware.com', crypt('admin123', gen_salt('bf')), 'System', 'Administrator', 'administrator', true, true);

-- =============================================================================
-- SECURITY POLICIES (RLS - Row Level Security)
-- =============================================================================

-- Enable RLS on sensitive tables
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE time_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;

-- Create policies for users table
CREATE POLICY users_select_policy ON users
    FOR SELECT USING (
        id = current_setting('app.current_user_id')::uuid OR
        EXISTS (SELECT 1 FROM users WHERE id = current_setting('app.current_user_id')::uuid AND role = 'administrator')
    );

-- Create policies for projects table (users can see projects they're members of)
CREATE POLICY projects_select_policy ON projects
    FOR SELECT USING (
        EXISTS (SELECT 1 FROM project_members WHERE project_id = projects.id AND user_id = current_setting('app.current_user_id')::uuid) OR
        EXISTS (SELECT 1 FROM client_users cu JOIN companies c ON cu.company_id = c.id WHERE c.id = projects.company_id AND cu.user_id = current_setting('app.current_user_id')::uuid) OR
        EXISTS (SELECT 1 FROM users WHERE id = current_setting('app.current_user_id')::uuid AND role = 'administrator')
    );

-- =============================================================================
-- COMMENTS
-- =============================================================================

COMMENT ON DATABASE postgres IS 'Meta Software Project Management System Database';

COMMENT ON TABLE users IS 'System users with different roles (admin, developer, client)';
COMMENT ON TABLE companies IS 'Client companies that own projects';
COMMENT ON TABLE projects IS 'Software projects managed by the system';
COMMENT ON TABLE tasks IS 'Individual tasks within projects';
COMMENT ON TABLE time_entries IS 'Time tracking entries for billing and reporting';
COMMENT ON TABLE invoices IS 'Generated invoices for project billing';
COMMENT ON TABLE notifications IS 'System notifications for users';
COMMENT ON TABLE chat_rooms IS 'Internal chat rooms for team communication';
COMMENT ON TABLE files IS 'File uploads associated with projects or tasks';
COMMENT ON TABLE comments IS 'Comments on projects and tasks';

-- =============================================================================
-- DATABASE OPTIMIZATIONS
-- =============================================================================

-- Set some PostgreSQL optimizations
ALTER SYSTEM SET shared_preload_libraries = 'pg_stat_statements';
ALTER SYSTEM SET track_activity_query_size = 2048;
ALTER SYSTEM SET pg_stat_statements.track = 'all';

-- =============================================================================
-- BACKUP RECOMMENDATIONS
-- =============================================================================

/*
Recommended backup strategy:

1. Daily full backups:
   pg_dump -U postgres -h localhost -d meta_project_db -f backup_$(date +%Y%m%d).sql

2. Point-in-time recovery setup:
   - Enable WAL archiving
   - Configure continuous archiving
   - Set up base backups

3. Monitoring queries:
   - Monitor slow queries using pg_stat_statements
   - Set up alerts for disk usage
   - Monitor connection counts

4. Maintenance tasks:
   - Regular VACUUM and ANALYZE
   - Reindex periodically
   - Update table statistics
*/

-- End of schema
