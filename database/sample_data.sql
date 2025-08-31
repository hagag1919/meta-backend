-- Meta Software Project Management System - Sample Data
-- PostgreSQL Sample Data for Testing
-- Created: August 31, 2025

-- =============================================================================
-- SAMPLE DATA FOR TESTING
-- =============================================================================

-- Note: Run this AFTER running the main schema file (meta_project_schema.sql)

-- Insert sample companies
INSERT INTO companies (id, name, email, phone, address, website, contact_person) VALUES
('11111111-1111-1111-1111-111111111111', 'TechCorp Solutions', 'contact@techcorp.com', '+1-555-0101', '123 Tech Street, Silicon Valley, CA', 'https://techcorp.com', 'John Smith'),
('22222222-2222-2222-2222-222222222222', 'StartupXYZ Inc', 'hello@startupxyz.com', '+1-555-0102', '456 Innovation Ave, Austin, TX', 'https://startupxyz.com', 'Sarah Johnson'),
('33333333-3333-3333-3333-333333333333', 'Enterprise Corp', 'info@enterprise.com', '+1-555-0103', '789 Business Blvd, New York, NY', 'https://enterprise.com', 'Michael Brown');

-- Insert sample users (including the admin created in schema)
INSERT INTO users (id, email, password_hash, first_name, last_name, role, phone, is_active, email_verified) VALUES
-- Administrators
('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'admin@metasoftware.com', crypt('admin123', gen_salt('bf')), 'System', 'Administrator', 'administrator', '+1-555-0001', true, true),

-- Developers
('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'alice.dev@metasoftware.com', crypt('dev123', gen_salt('bf')), 'Alice', 'Developer', 'developer', '+1-555-0002', true, true),
('cccccccc-cccc-cccc-cccc-cccccccccccc', 'bob.smith@metasoftware.com', crypt('dev123', gen_salt('bf')), 'Bob', 'Smith', 'developer', '+1-555-0003', true, true),
('dddddddd-dddd-dddd-dddd-dddddddddddd', 'carol.jones@metasoftware.com', crypt('dev123', gen_salt('bf')), 'Carol', 'Jones', 'developer', '+1-555-0004', true, true),
('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee', 'david.wilson@metasoftware.com', crypt('dev123', gen_salt('bf')), 'David', 'Wilson', 'developer', '+1-555-0005', true, true),

-- Clients
('ffffffff-ffff-ffff-ffff-ffffffffffff', 'john.smith@techcorp.com', crypt('client123', gen_salt('bf')), 'John', 'Smith', 'client', '+1-555-0101', true, true),
('gggggggg-gggg-gggg-gggg-gggggggggggg', 'sarah.johnson@startupxyz.com', crypt('client123', gen_salt('bf')), 'Sarah', 'Johnson', 'client', '+1-555-0102', true, true),
('hhhhhhhh-hhhh-hhhh-hhhh-hhhhhhhhhhhh', 'michael.brown@enterprise.com', crypt('client123', gen_salt('bf')), 'Michael', 'Brown', 'client', '+1-555-0103', true, true);

-- Link client users to companies
INSERT INTO client_users (user_id, company_id, is_primary_contact) VALUES
('ffffffff-ffff-ffff-ffff-ffffffffffff', '11111111-1111-1111-1111-111111111111', true),
('gggggggg-gggg-gggg-gggg-gggggggggggg', '22222222-2222-2222-2222-222222222222', true),
('hhhhhhhh-hhhh-hhhh-hhhh-hhhhhhhhhhhh', '33333333-3333-3333-3333-333333333333', true);

-- Insert sample projects
INSERT INTO projects (id, name, description, company_id, project_manager_id, budget, start_date, end_date, status, progress_percentage) VALUES
('p1111111-1111-1111-1111-111111111111', 'E-commerce Platform', 'Complete e-commerce solution with payment integration', '11111111-1111-1111-1111-111111111111', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 50000.00, '2025-01-15', '2025-06-15', 'ongoing', 35),
('p2222222-2222-2222-2222-222222222222', 'Mobile App Development', 'Cross-platform mobile application for startup', '22222222-2222-2222-2222-222222222222', 'cccccccc-cccc-cccc-cccc-cccccccccccc', 30000.00, '2025-02-01', '2025-05-01', 'ongoing', 60),
('p3333333-3333-3333-3333-333333333333', 'Enterprise Dashboard', 'Business intelligence dashboard for enterprise client', '33333333-3333-3333-3333-333333333333', 'dddddddd-dddd-dddd-dddd-dddddddddddd', 75000.00, '2024-12-01', '2025-04-01', 'ongoing', 80),
('p4444444-4444-4444-4444-444444444444', 'Website Redesign', 'Complete website overhaul with modern design', '11111111-1111-1111-1111-111111111111', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 15000.00, '2024-10-01', '2024-12-31', 'completed', 100);

-- Insert project team members
INSERT INTO project_members (project_id, user_id, role, hourly_rate) VALUES
-- E-commerce Platform team
('p1111111-1111-1111-1111-111111111111', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'Project Manager', 80.00),
('p1111111-1111-1111-1111-111111111111', 'cccccccc-cccc-cccc-cccc-cccccccccccc', 'Backend Developer', 70.00),
('p1111111-1111-1111-1111-111111111111', 'dddddddd-dddd-dddd-dddd-dddddddddddd', 'Frontend Developer', 65.00),

-- Mobile App team
('p2222222-2222-2222-2222-222222222222', 'cccccccc-cccc-cccc-cccc-cccccccccccc', 'Project Manager', 80.00),
('p2222222-2222-2222-2222-222222222222', 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee', 'Mobile Developer', 75.00),
('p2222222-2222-2222-2222-222222222222', 'dddddddd-dddd-dddd-dddd-dddddddddddd', 'UI/UX Designer', 60.00),

-- Enterprise Dashboard team
('p3333333-3333-3333-3333-333333333333', 'dddddddd-dddd-dddd-dddd-dddddddddddd', 'Project Manager', 85.00),
('p3333333-3333-3333-3333-333333333333', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'Senior Developer', 90.00),
('p3333333-3333-3333-3333-333333333333', 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee', 'Data Analyst', 70.00),

-- Website Redesign team
('p4444444-4444-4444-4444-444444444444', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'Project Manager', 80.00),
('p4444444-4444-4444-4444-444444444444', 'dddddddd-dddd-dddd-dddd-dddddddddddd', 'Web Developer', 65.00);

-- Insert milestones
INSERT INTO milestones (id, project_id, name, description, due_date, is_completed, order_index) VALUES
-- E-commerce Platform milestones
('m1111111-1111-1111-1111-111111111111', 'p1111111-1111-1111-1111-111111111111', 'Requirements Analysis', 'Complete requirements gathering and analysis', '2025-02-01', true, 1),
('m2222222-2222-2222-2222-222222222222', 'p1111111-1111-1111-1111-111111111111', 'Database Design', 'Design and implement database schema', '2025-02-15', true, 2),
('m3333333-3333-3333-3333-333333333333', 'p1111111-1111-1111-1111-111111111111', 'Backend API', 'Develop core backend APIs', '2025-03-15', false, 3),
('m4444444-4444-4444-4444-444444444444', 'p1111111-1111-1111-1111-111111111111', 'Frontend Development', 'Build user interface', '2025-04-15', false, 4),
('m5555555-5555-5555-5555-555555555555', 'p1111111-1111-1111-1111-111111111111', 'Payment Integration', 'Integrate payment gateways', '2025-05-15', false, 5),
('m6666666-6666-6666-6666-666666666666', 'p1111111-1111-1111-1111-111111111111', 'Testing & Deployment', 'Complete testing and deploy to production', '2025-06-15', false, 6),

-- Mobile App milestones
('m7777777-7777-7777-7777-777777777777', 'p2222222-2222-2222-2222-222222222222', 'UI/UX Design', 'Complete app design and user flow', '2025-02-15', true, 1),
('m8888888-8888-8888-8888-888888888888', 'p2222222-2222-2222-2222-222222222222', 'Core Features', 'Develop core app functionality', '2025-03-15', true, 2),
('m9999999-9999-9999-9999-999999999999', 'p2222222-2222-2222-2222-222222222222', 'Beta Testing', 'Internal and external beta testing', '2025-04-15', false, 3),
('ma111111-1111-1111-1111-111111111111', 'p2222222-2222-2222-2222-222222222222', 'App Store Launch', 'Deploy to app stores', '2025-05-01', false, 4);

-- Insert sample tasks
INSERT INTO tasks (id, project_id, milestone_id, assigned_to, created_by, title, description, priority, status, estimated_hours, actual_hours, due_date) VALUES
-- E-commerce Platform tasks
('t1111111-1111-1111-1111-111111111111', 'p1111111-1111-1111-1111-111111111111', 'm3333333-3333-3333-3333-333333333333', 'cccccccc-cccc-cccc-cccc-cccccccccccc', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'User Authentication API', 'Implement user login, registration, and password reset APIs', 'high', 'in_progress', 20, 12, '2025-03-01'),
('t2222222-2222-2222-2222-222222222222', 'p1111111-1111-1111-1111-111111111111', 'm3333333-3333-3333-3333-333333333333', 'cccccccc-cccc-cccc-cccc-cccccccccccc', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'Product Catalog API', 'Create APIs for product management and catalog', 'high', 'new', 25, 0, '2025-03-10'),
('t3333333-3333-3333-3333-333333333333', 'p1111111-1111-1111-1111-111111111111', 'm4444444-4444-4444-4444-444444444444', 'dddddddd-dddd-dddd-dddd-dddddddddddd', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'Shopping Cart UI', 'Design and implement shopping cart interface', 'medium', 'new', 15, 0, '2025-04-01'),
('t4444444-4444-4444-4444-444444444444', 'p1111111-1111-1111-1111-111111111111', 'm5555555-5555-5555-5555-555555555555', 'cccccccc-cccc-cccc-cccc-cccccccccccc', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'PayPal Integration', 'Integrate PayPal payment gateway', 'high', 'new', 18, 0, '2025-05-01'),

-- Mobile App tasks
('t5555555-5555-5555-5555-555555555555', 'p2222222-2222-2222-2222-222222222222', 'm8888888-8888-8888-8888-888888888888', 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee', 'cccccccc-cccc-cccc-cccc-cccccccccccc', 'User Onboarding Flow', 'Implement user registration and onboarding', 'high', 'completed', 12, 14, '2025-03-01'),
('t6666666-6666-6666-6666-666666666666', 'p2222222-2222-2222-2222-222222222222', 'm8888888-8888-8888-8888-888888888888', 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee', 'cccccccc-cccc-cccc-cccc-cccccccccccc', 'Push Notifications', 'Implement push notification system', 'medium', 'in_progress', 10, 6, '2025-03-15'),

-- Enterprise Dashboard tasks
('t7777777-7777-7777-7777-777777777777', 'p3333333-3333-3333-3333-333333333333', null, 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'dddddddd-dddd-dddd-dddd-dddddddddddd', 'Data Visualization Components', 'Create reusable chart and graph components', 'high', 'completed', 30, 32, '2025-01-15'),
('t8888888-8888-8888-8888-888888888888', 'p3333333-3333-3333-3333-333333333333', null, 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee', 'dddddddd-dddd-dddd-dddd-dddddddddddd', 'Report Generation', 'Implement automated report generation', 'medium', 'in_progress', 20, 15, '2025-03-30');

-- Insert sample time entries
INSERT INTO time_entries (user_id, project_id, task_id, description, hours_worked, hourly_rate, date_worked, is_billable) VALUES
-- Alice's time entries
('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'p1111111-1111-1111-1111-111111111111', 't1111111-1111-1111-1111-111111111111', 'Working on user authentication endpoints', 8.0, 70.00, '2025-08-29', true),
('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'p1111111-1111-1111-1111-111111111111', 't1111111-1111-1111-1111-111111111111', 'Testing and debugging authentication', 4.0, 70.00, '2025-08-30', true),
('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'p3333333-3333-3333-3333-333333333333', 't7777777-7777-7777-7777-777777777777', 'Building dashboard components', 6.0, 90.00, '2025-08-28', true),

-- Bob's time entries
('cccccccc-cccc-cccc-cccc-cccccccccccc', 'p1111111-1111-1111-1111-111111111111', 't1111111-1111-1111-1111-111111111111', 'API development and testing', 7.5, 70.00, '2025-08-29', true),
('cccccccc-cccc-cccc-cccc-cccccccccccc', 'p2222222-2222-2222-2222-222222222222', 't5555555-5555-5555-5555-555555555555', 'Mobile app development', 8.0, 75.00, '2025-08-30', true),

-- Carol's time entries
('dddddddd-dddd-dddd-dddd-dddddddddddd', 'p3333333-3333-3333-3333-333333333333', 't7777777-7777-7777-7777-777777777777', 'Frontend component design', 6.0, 65.00, '2025-08-28', true),

-- David's time entries
('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee', 'p2222222-2222-2222-2222-222222222222', 't6666666-6666-6666-6666-666666666666', 'Push notification setup', 3.0, 75.00, '2025-08-30', true),
('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee', 'p3333333-3333-3333-3333-333333333333', 't8888888-8888-8888-8888-888888888888', 'Report generation feature', 5.0, 70.00, '2025-08-29', true);

-- Insert sample comments
INSERT INTO comments (content, author_id, project_id, task_id, is_internal) VALUES
('Project kickoff meeting scheduled for next week. Please prepare your development environment.', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'p1111111-1111-1111-1111-111111111111', null, false),
('The authentication API is almost complete. Need to add email verification.', 'cccccccc-cccc-cccc-cccc-cccccccccccc', null, 't1111111-1111-1111-1111-111111111111', true),
('Great work on the user onboarding! The flow is very intuitive.', 'cccccccc-cccc-cccc-cccc-cccccccccccc', null, 't5555555-5555-5555-5555-555555555555', false),
('Dashboard components are looking great. Client will be impressed!', 'dddddddd-dddd-dddd-dddd-dddddddddddd', 'p3333333-3333-3333-3333-333333333333', null, true);

-- Insert sample notifications
INSERT INTO notifications (user_id, type, title, message, data) VALUES
('cccccccc-cccc-cccc-cccc-cccccccccccc', 'task_assigned', 'New Task Assigned', 'You have been assigned to task: User Authentication API', '{"task_id": "t1111111-1111-1111-1111-111111111111", "project_id": "p1111111-1111-1111-1111-111111111111"}'),
('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee', 'task_assigned', 'New Task Assigned', 'You have been assigned to task: Push Notifications', '{"task_id": "t6666666-6666-6666-6666-666666666666", "project_id": "p2222222-2222-2222-2222-222222222222"}'),
('ffffffff-ffff-ffff-ffff-ffffffffffff', 'project_update', 'Project Progress Update', 'Your E-commerce Platform project is now 35% complete', '{"project_id": "p1111111-1111-1111-1111-111111111111", "progress": 35}'),
('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'system', 'Welcome to Meta Software', 'Welcome to the project management system!', '{}');

-- Insert sample invoice
INSERT INTO invoices (id, invoice_number, project_id, company_id, issued_by, issue_date, due_date, subtotal, tax_rate, tax_amount, total_amount, status) VALUES
('i1111111-1111-1111-1111-111111111111', 'INV-2025-001', 'p4444444-4444-4444-4444-444444444444', '11111111-1111-1111-1111-111111111111', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '2025-01-01', '2025-01-31', 15000.00, 8.25, 1237.50, 16237.50, 'paid');

-- Insert invoice items
INSERT INTO invoice_items (invoice_id, description, quantity, unit_price, total_price) VALUES
('i1111111-1111-1111-1111-111111111111', 'Website Redesign - Development Hours', 150.0, 65.00, 9750.00),
('i1111111-1111-1111-1111-111111111111', 'Website Redesign - Project Management', 50.0, 80.00, 4000.00),
('i1111111-1111-1111-1111-111111111111', 'Website Redesign - Design Work', 25.0, 50.00, 1250.00);

-- Insert payment for the invoice
INSERT INTO payments (invoice_id, amount, payment_date, payment_method, transaction_id) VALUES
('i1111111-1111-1111-1111-111111111111', 16237.50, '2025-01-25', 'Bank Transfer', 'TXN-20250125-001');

-- Insert sample chat room
INSERT INTO chat_rooms (id, name, is_group_chat, project_id, created_by) VALUES
('c1111111-1111-1111-1111-111111111111', 'E-commerce Project Team', true, 'p1111111-1111-1111-1111-111111111111', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb');

-- Insert chat participants
INSERT INTO chat_participants (chat_room_id, user_id) VALUES
('c1111111-1111-1111-1111-111111111111', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'),
('c1111111-1111-1111-1111-111111111111', 'cccccccc-cccc-cccc-cccc-cccccccccccc'),
('c1111111-1111-1111-1111-111111111111', 'dddddddd-dddd-dddd-dddd-dddddddddddd'),
('c1111111-1111-1111-1111-111111111111', 'ffffffff-ffff-ffff-ffff-ffffffffffff');

-- Insert sample chat messages
INSERT INTO chat_messages (chat_room_id, sender_id, content) VALUES
('c1111111-1111-1111-1111-111111111111', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'Good morning team! Ready for another productive day?'),
('c1111111-1111-1111-1111-111111111111', 'cccccccc-cccc-cccc-cccc-cccccccccccc', 'Yes! I''ll be working on the authentication API today.'),
('c1111111-1111-1111-1111-111111111111', 'dddddddd-dddd-dddd-dddd-dddddddddddd', 'I''ll start on the shopping cart UI once the API is ready.'),
('c1111111-1111-1111-1111-111111111111', 'ffffffff-ffff-ffff-ffff-ffffffffffff', 'Great! Looking forward to seeing the progress.');

-- =============================================================================
-- USEFUL QUERIES FOR TESTING
-- =============================================================================

-- View all projects with their progress
-- SELECT * FROM project_summary ORDER BY name;

-- View user dashboard information
-- SELECT * FROM user_dashboard ORDER BY full_name;

-- Get overdue tasks
-- SELECT t.title, t.due_date, u.first_name || ' ' || u.last_name as assigned_to, p.name as project
-- FROM tasks t
-- JOIN users u ON t.assigned_to = u.id
-- JOIN projects p ON t.project_id = p.id
-- WHERE t.due_date < CURRENT_DATE AND t.status != 'completed'
-- ORDER BY t.due_date;

-- Get project financial summary
-- SELECT 
--     p.name,
--     p.budget,
--     SUM(te.hours_worked * te.hourly_rate) as actual_cost,
--     p.budget - SUM(te.hours_worked * te.hourly_rate) as remaining_budget
-- FROM projects p
-- LEFT JOIN time_entries te ON p.id = te.project_id
-- GROUP BY p.id, p.name, p.budget
-- ORDER BY p.name;

-- Get user productivity report
-- SELECT 
--     u.first_name || ' ' || u.last_name as developer_name,
--     COUNT(DISTINCT t.id) as total_tasks,
--     COUNT(DISTINCT CASE WHEN t.status = 'completed' THEN t.id END) as completed_tasks,
--     SUM(te.hours_worked) as total_hours,
--     AVG(te.hours_worked) as avg_hours_per_day
-- FROM users u
-- LEFT JOIN tasks t ON u.id = t.assigned_to
-- LEFT JOIN time_entries te ON u.id = te.user_id
-- WHERE u.role = 'developer'
-- GROUP BY u.id, u.first_name, u.last_name
-- ORDER BY total_hours DESC;

-- Test login (use these credentials):
-- Admin: admin@metasoftware.com / admin123
-- Developer: alice.dev@metasoftware.com / dev123
-- Client: john.smith@techcorp.com / client123
