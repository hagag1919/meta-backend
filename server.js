const express = require('express');
// Prefer IPv4 first to avoid DNS resolution issues on some Windows setups
try {
  const dns = require('dns');
  if (typeof dns.setDefaultResultOrder === 'function') {
    dns.setDefaultResultOrder('ipv4first');
  }
} catch (e) {
  // no-op
}
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const morgan = require('morgan');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');


const { 
  sanitizeInputs, 
  sanitizeCommentInputs,
  generalRateLimit, 
  setSecurityHeaders, 
  securityLogger 
} = require('./middleware/security');
const { authenticateToken } = require('./middleware/auth');
const errorHandler = require('./middleware/errorHandler');

require('dotenv').config();

const app = express();
const server = http.createServer(app);

const io = socketIo(server, {
  cors: {
    origin: process.env.FRONTEND_URL || "http://localhost:3000",
    methods: ["GET", "POST"],
    credentials: true
  },
  transports: ['websocket'],
  pingTimeout: 60000,
  pingInterval: 25000
});

app.set('io', io);
// Some routes expect 'socketio' key; set both to avoid undefined in handlers
app.set('socketio', io);

app.use(setSecurityHeaders);

app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false
}));

app.use(securityLogger);

app.use(generalRateLimit);

app.use(express.json({ 
  limit: '10mb',
  verify: (req, res, buf) => {
    req.rawBody = buf;
  }
}));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

app.use(compression());

app.use(cors({
  origin: function (origin, callback) {
    const allowedOrigins = [
      process.env.FRONTEND_URL || 'http://localhost:3000',
      'http://localhost:3001',
      'https://metasoftware.com',
      'http://localhost:5173',
      'https://app.metasoftware.com',
      'https://meta-frontend.onrender.com'
    ];
    
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) return callback(null, true);
    
    if (allowedOrigins.indexOf(origin) !== -1 || origin.endsWith('.onrender.com')) {
      callback(null, true);
    } else {
      console.warn(`CORS blocked origin: ${origin}`);
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
}));

// Handle preflight requests
app.options('*', cors());

if (process.env.NODE_ENV === 'development') {
  app.use(morgan('combined'));
}

app.use('/uploads', express.static(path.join(__dirname, 'uploads'), {
  setHeaders: (res, path) => {
    res.setHeader('Content-Type', 'application/octet-stream');
    res.setHeader('Content-Disposition', 'attachment');
    res.setHeader('X-Content-Type-Options', 'nosniff');
  }
}));

app.get('/health', (req, res) => {
  res.status(200).json({ 
    status: 'OK', 
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

// Also provide health endpoint under /api path for frontend compatibility
app.get('/api/health', (req, res) => {
  res.status(200).json({ 
    status: 'OK', 
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

app.use('/api/auth', require('./routes/auth'));

app.use('/api/users', sanitizeInputs, authenticateToken, require('./routes/users'));
app.use('/api/projects', sanitizeInputs, authenticateToken, require('./routes/projects'));
app.use('/api/projects/:projectId/milestones', sanitizeInputs, authenticateToken, require('./routes/milestones'));
app.use('/api/tasks', sanitizeInputs, authenticateToken, require('./routes/tasks'));
app.use('/api/clients', sanitizeInputs, authenticateToken, require('./routes/clients'));
app.use('/api/dashboard', sanitizeInputs, authenticateToken, require('./routes/dashboard'));
app.use('/api/comments', sanitizeCommentInputs, authenticateToken, require('./routes/comments'));
app.use('/api/files', sanitizeInputs, authenticateToken, require('./routes/files'));
app.use('/api/time', sanitizeInputs, authenticateToken, require('./routes/time'));
app.use('/api/invoices', sanitizeInputs, authenticateToken, require('./routes/invoices'));
app.use('/api/reports', sanitizeInputs, authenticateToken, require('./routes/reports'));
app.use('/api/settings', sanitizeInputs, authenticateToken, require('./routes/settings'));
app.use('/api/chat', sanitizeInputs, authenticateToken, require('./routes/chat'));
app.use('/api/companies', sanitizeInputs, authenticateToken, require('./routes/companies'));
app.use('/api/exports', sanitizeInputs, require('./routes/exports'));

app.use('*', (req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

app.use(errorHandler);

io.use(async (socket, next) => {
  try {
    const token = socket.handshake.auth.token || socket.handshake.headers.authorization?.split(' ')[1];
    
    if (!token) {
      return next(new Error('Authentication required'));
    }

    const jwt = require('jsonwebtoken');
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    const db = require('./config/database');
    const userQuery = 'SELECT id, email, role, first_name, last_name FROM users WHERE id = $1 AND is_active = true';
    const result = await db.query(userQuery, [decoded.userId]);
    
    if (result.rows.length === 0) {
      return next(new Error('User not found'));
    }

    socket.user = result.rows[0];
    next();
  } catch (error) {
    console.error('Socket authentication error:', error.message);
    next(new Error('Authentication failed'));
  }
});

io.on('connection', (socket) => {
  console.log(`User ${socket.user.email} connected via Socket.IO`);
  
  socket.join(`user_${socket.user.id}`);
  
  const joinProjectRooms = async () => {
    try {
      const db = require('./config/database');
      const projectsQuery = `
        SELECT DISTINCT p.id 
        FROM projects p 
        LEFT JOIN project_members pm ON p.id = pm.project_id 
        WHERE p.project_manager_id = $1 OR pm.user_id = $1
      `;
      const result = await db.query(projectsQuery, [socket.user.id]);
      
      result.rows.forEach(project => {
        socket.join(`project_${project.id}`);
      });
    } catch (error) {
      console.error('Error joining project rooms:', error);
    }
  };
  
  joinProjectRooms();

  socket.on('disconnect', () => {
    console.log(`User ${socket.user.email} disconnected`);
  });

  socket.on('error', (error) => {
    console.error('Socket error:', error);
  });
});

// Graceful shutdown
const gracefulShutdown = () => {
  console.log('Shutting down gracefully...');
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
};

process.on('SIGTERM', gracefulShutdown);
process.on('SIGINT', gracefulShutdown);

// Start server
const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`🚀 Meta Backend Server running on port ${PORT}`);
  console.log(`🛡️  Security middleware enabled`);
  console.log(`⚡ Socket.IO enabled on same port`);
  console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
});

module.exports = app;
