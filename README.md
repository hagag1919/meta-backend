# Meta Software Project Management System - Backend API Documentation

## Overview
Complete Node.js Express backend for Meta Software project management system with PostgreSQL database, JWT authentication, real-time features, and comprehensive business logic.

## Project Structure
```
meta-backend/
├── config/
│   └── database.js          # PostgreSQL connection configuration
├── middleware/
│   ├── auth.js             # JWT authentication & authorization
│   ├── validation.js       # Request validation middleware
│   └── errorHandler.js     # Global error handling
├── routes/
│   ├── auth.js            # Authentication endpoints
│   ├── users.js           # User management
│   ├── projects.js        # Project lifecycle management
│   ├── tasks.js           # Task management with dependencies
│   ├── clients.js         # Client/company management
│   ├── dashboard.js       # Dashboard statistics & real-time data
│   ├── comments.js        # Comment system for projects/tasks
│   ├── files.js           # File upload/download system
│   ├── time.js            # Time tracking & billing
│   ├── invoices.js        # Invoice management & PDF generation
│   ├── reports.js         # Comprehensive reporting system
│   ├── settings.js        # System, company, and user settings
│   └── chat.js            # Real-time team communication
├── uploads/               # File storage directory
├── database/
│   ├── meta_project_schema.sql  # Complete database schema
│   ├── sample_data.sql          # Sample data for testing
│   └── README.md               # Database documentation
├── server.js              # Main application entry point
└── package.json          # Dependencies and scripts
```

## Core Features

### 1. Authentication System (`/api/auth`)
- **POST /register** - User registration with email verification
- **POST /login** - JWT-based login with activity logging
- **POST /logout** - Secure logout with token invalidation
- **POST /forgot-password** - Password reset via email
- **POST /reset-password** - Password reset with token validation
- **POST /verify-email** - Email verification for new accounts

**Features:**
- Role-based access control (administrator, developer, client)
- Password complexity validation
- Account activation/deactivation
- Activity logging for security auditing

### 2. User Management (`/api/users`)
- **GET /users** - Paginated user list with role-based filtering
- **GET /users/:id** - Individual user profile
- **PUT /users/:id** - Update user profile (admin/self)
- **DELETE /users/:id** - Deactivate user account
- **PUT /users/:id/activate** - Reactivate user account
- **GET /users/me** - Current user profile

**Features:**
- Advanced filtering by role, status, company
- Profile management with validation
- Activity tracking and audit logs

### 3. Project Management (`/api/projects`)
- **GET /projects** - Project list with team statistics
- **POST /projects** - Create new project with team assignment
- **GET /projects/:id** - Detailed project view with progress tracking
- **PUT /projects/:id** - Update project details and settings
- **DELETE /projects/:id** - Archive/delete project
- **POST /projects/:id/team** - Add team members
- **DELETE /projects/:id/team/:userId** - Remove team member
- **GET /projects/:id/milestones** - Project milestones
- **POST /projects/:id/milestones** - Create milestone

**Features:**
- Team management with role assignments
- Progress tracking and milestone management
- Budget and time estimation
- Project status lifecycle management
- Client association and access control

### 4. Task Management (`/api/tasks`)
- **GET /tasks** - Task list with advanced filtering
- **POST /tasks** - Create task with dependencies
- **GET /tasks/:id** - Task details with dependency tree
- **PUT /tasks/:id** - Update task with status transitions
- **DELETE /tasks/:id** - Remove task
- **POST /tasks/:id/dependencies** - Add task dependencies
- **DELETE /tasks/:id/dependencies/:depId** - Remove dependency

**Features:**
- Task dependency management
- Status tracking (to_do, in_progress, completed, blocked)
- Priority levels and due date management
- Assignment and notification system
- Time estimation and tracking integration

### 5. Client/Company Management (`/api/clients`)
- **GET /clients** - Company list with project statistics
- **POST /clients** - Create new company/client
- **GET /clients/:id** - Company details with project history
- **PUT /clients/:id** - Update company information
- **GET /clients/:id/users** - Company users list
- **POST /clients/:id/users** - Link user to company
- **DELETE /clients/:id/users/:userId** - Remove user from company

**Features:**
- Multi-tenant company structure
- Client user management
- Project association and statistics
- Contact information management

### 6. Dashboard & Analytics (`/api/dashboard`)
- **GET /overview** - Dashboard statistics overview
- **GET /activity** - Recent activity feed
- **GET /projects/progress** - Project progress charts
- **GET /tasks/summary** - Task distribution summary
- **GET /notifications** - User notifications
- **PUT /notifications/:id/read** - Mark notification as read

**Features:**
- Role-based dashboard data
- Real-time statistics and progress tracking
- Activity feeds and notifications
- Project and task analytics

### 7. Comments System (`/api/comments`)
- **GET /comments** - Comments with filtering by entity
- **POST /comments** - Create comment on project/task
- **PUT /comments/:id** - Edit comment (author only)
- **DELETE /comments/:id** - Delete comment
- **GET /projects/:id/comments** - Project-specific comments
- **GET /tasks/:id/comments** - Task-specific comments

**Features:**
- Internal/external comment visibility
- Parent-child comment threading
- Rich text support
- Access control based on project membership

### 8. File Management (`/api/files`)
- **POST /upload** - Upload files with organized storage
- **GET /files** - File list with metadata
- **GET /files/:id** - File details and metadata
- **GET /files/:id/download** - Secure file download
- **DELETE /files/:id** - Delete file
- **PUT /files/:id** - Update file metadata

**Features:**
- Organized directory structure by project/task
- File type validation and size limits
- Access control and permission management
- Metadata tracking and search

### 9. Time Tracking (`/api/time`)
- **GET /time** - Time entries with role-based filtering
- **POST /time** - Log time with project/task validation
- **GET /time/:id** - Individual time entry details
- **PUT /time/:id** - Update time entry (with constraints)
- **DELETE /time/:id** - Remove time entry
- **GET /time/stats/summary** - Time tracking analytics

**Features:**
- Billable vs non-billable time tracking
- Automatic project/task hour calculations
- Hourly rate management
- Invoice integration for billing

### 10. Invoice Management (`/api/invoices`)
- **GET /invoices** - Invoice list with payment status
- **POST /invoices** - Generate invoice from time entries
- **GET /invoices/:id** - Invoice details with line items
- **PUT /invoices/:id** - Update invoice status
- **POST /invoices/:id/payments** - Record payment
- **GET /invoices/stats/overview** - Invoice statistics

**Features:**
- Automatic invoice generation from time entries
- PDF invoice generation (using pdf-lib)
- Payment tracking and status management
- Tax calculation and multiple currencies
- Client-specific invoice access

### 11. Reporting System (`/api/reports`)
- **GET /reports/projects** - Project performance reports
- **GET /reports/tasks** - Task completion reports by developer
- **GET /reports/productivity** - Productivity analytics
- **GET /reports/financial** - Financial reports and revenue analysis

**Features:**
- Comprehensive project and task analytics
- Developer productivity metrics
- Financial reporting with payment analysis
- Role-based report access
- Customizable date ranges and filtering

### 12. Settings Management (`/api/settings`)
- **GET /settings/system** - System-wide settings (admin only)
- **PUT /settings/system** - Update system settings
- **GET /settings/company** - Company-specific settings
- **PUT /settings/company/:id** - Update company settings
- **GET /settings/user** - User preferences
- **PUT /settings/user** - Update user preferences
- **GET /settings/permissions** - Role permissions matrix
- **PUT /settings/permissions** - Update role permissions

**Features:**
- Multi-level settings (system, company, user)
- Language support (English/Arabic)
- Theme and UI customization
- Permission management system
- Company branding (logo, colors)

### 13. Real-time Chat (`/api/chat`)
- **GET /chat/conversations** - User's conversation list
- **POST /chat/conversations** - Create new conversation
- **GET /chat/conversations/:id/messages** - Message history
- **POST /chat/conversations/:id/messages** - Send message
- **PUT /chat/messages/:id** - Edit message
- **DELETE /chat/messages/:id** - Delete message
- **POST /chat/conversations/:id/participants** - Add participants

**Features:**
- Direct messaging between team members
- Group conversations for project teams
- Real-time message delivery via Socket.IO
- Message editing and deletion
- Read status tracking

## Technical Implementation

### Authentication & Authorization
- JWT-based authentication with role-based access control
- Middleware for token validation and role checking
- Activity logging for security auditing
- Password hashing with bcryptjs

### Database Integration
- PostgreSQL with connection pooling
- Comprehensive schema with proper relationships
- Parameterized queries for SQL injection prevention
- Transaction support for data consistency

### Real-time Features
- Socket.IO integration for live updates
- Real-time notifications for project/task changes
- Live chat messaging system
- Dashboard real-time statistics

### File Handling
- Multer for file uploads with validation
- Organized storage structure
- File type and size restrictions
- Secure download with access control

### Error Handling
- Global error handling middleware
- Standardized error responses
- Request validation with express-validator
- Comprehensive logging system

### Security Features
- Rate limiting to prevent abuse
- CORS configuration
- Helmet.js for security headers
- Input validation and sanitization

## Environment Variables
```env
# Database
DB_HOST=localhost
DB_PORT=5432
DB_NAME=meta_project_db
DB_USER=your_db_user
DB_PASSWORD=your_db_password

# JWT
JWT_SECRET=your_jwt_secret_key
JWT_EXPIRES_IN=7d

# Email (for notifications)
EMAIL_HOST=smtp.your-email-provider.com
EMAIL_PORT=587
EMAIL_USER=your_email@domain.com
EMAIL_PASSWORD=your_email_password

# File Upload
UPLOAD_DIR=./uploads
MAX_FILE_SIZE=10485760

# Server
PORT=3000
NODE_ENV=development
```

## Getting Started

1. **Install Dependencies**
   ```bash
   npm install
   ```

2. **Setup Database**
   ```bash
   # Create database and run schema
   psql -U postgres -c "CREATE DATABASE meta_project_db;"
   psql -U postgres -d meta_project_db -f database/meta_project_schema.sql
   psql -U postgres -d meta_project_db -f database/sample_data.sql
   ```

3. **Configure Environment**
   ```bash
   # Copy and configure environment variables
   cp .env.example .env
   # Edit .env with your configuration
   ```

4. **Start Server**
   ```bash
   # Development mode
   npm run dev
   
   # Production mode
   npm start
   ```

## API Usage Examples

### Authentication
```javascript
// Login
POST /api/auth/login
{
  "email": "admin@metasoftware.com",
  "password": "Admin123!"
}

// Response
{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "id": "uuid",
    "email": "admin@metasoftware.com",
    "role": "administrator"
  }
}
```

### Project Management
```javascript
// Create Project
POST /api/projects
Authorization: Bearer your_jwt_token
{
  "name": "E-commerce Website",
  "description": "Modern e-commerce platform",
  "company_id": "company-uuid",
  "start_date": "2024-01-01",
  "end_date": "2024-06-30",
  "budget": 50000,
  "estimated_hours": 500
}
```

### Time Tracking
```javascript
// Log Time
POST /api/time
Authorization: Bearer your_jwt_token
{
  "project_id": "project-uuid",
  "task_id": "task-uuid",
  "date_worked": "2024-01-15",
  "hours_worked": 8,
  "description": "Implemented user authentication system",
  "is_billable": true,
  "hourly_rate": 75
}
```

This backend provides a complete foundation for the Meta Software project management system with all required features including user management, project tracking, time management, invoicing, reporting, and real-time communication.
