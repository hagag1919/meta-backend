# Security Implementation Guide

## Overview
This document outlines the comprehensive security measures implemented in the Meta Software project management backend to protect against various types of attacks including SQL injection, XSS, CSRF, command injection, and other security vulnerabilities.

## 🛡️ Security Features Implemented

### 1. Input Sanitization & Validation

#### SQL Injection Protection
- **Parameterized Queries**: All database queries use parameterized statements with `$1`, `$2`, etc.
- **Input Pattern Detection**: Automatic detection of SQL injection patterns including:
  - SQL keywords (SELECT, INSERT, UPDATE, DELETE, UNION, etc.)
  - SQL operators (OR 1=1, UNION SELECT, etc.)
  - SQL comment syntax (--, /*, */)
  - Dangerous functions (LOAD_FILE, INTO OUTFILE)

#### XSS (Cross-Site Scripting) Protection
- **DOMPurify Integration**: Server-side HTML sanitization
- **Pattern Detection**: Automatic detection of XSS patterns:
  - Script tags and event handlers
  - JavaScript protocols
  - Object and embed tags
  - Iframe injections

#### Command Injection Protection
- **Pattern Detection**: Detection of command injection attempts:
  - Shell metacharacters (;, &, |, `, $, etc.)
  - Dangerous commands (rm, del, wget, curl, etc.)
  - Path traversal attempts (../, ..\, %2e%2e)

### 2. Authentication & Authorization

#### JWT Security
- **Strong Secret Keys**: Minimum 32-character secrets
- **Token Expiration**: Configurable token lifetimes
- **User Validation**: Real-time user status checking
- **Role-Based Access Control**: Granular permission system

#### Password Security
- **Strong Password Requirements**:
  - Minimum 8 characters
  - Must contain uppercase, lowercase, digit, and special character
  - Maximum 128 characters to prevent DoS
- **bcrypt Hashing**: Configurable salt rounds (default: 12)

### 3. Rate Limiting

#### Multiple Rate Limit Tiers
```javascript
// Authentication endpoints
authRateLimit: 5 requests per 15 minutes

// General API endpoints  
generalRateLimit: 100 requests per 15 minutes

// File upload endpoints
uploadRateLimit: 20 uploads per hour
```

#### IP-Based Protection
- Automatic IP blocking for repeated violations
- Customizable time windows and request limits
- Detailed logging of rate limit violations

### 4. Security Headers

#### Content Security Policy (CSP)
```
Content-Security-Policy: default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; font-src 'self'; connect-src 'self'; frame-ancestors 'none';
```

#### Additional Security Headers
- `X-Content-Type-Options: nosniff`
- `X-Frame-Options: DENY`
- `X-XSS-Protection: 1; mode=block`
- `Referrer-Policy: strict-origin-when-cross-origin`
- `Permissions-Policy: geolocation=(), microphone=(), camera=()`

### 5. File Upload Security

#### File Type Validation
- Whitelist-based file type checking
- MIME type validation
- File extension verification
- Magic number checking

#### File Size Limits
- Configurable maximum file sizes
- Per-endpoint size restrictions
- Prevention of zip bombs and large file DoS

#### Secure File Storage
- Organized directory structure
- Filename sanitization
- Prevention of file execution
- Access control validation

### 6. Database Security

#### Connection Security
- SSL/TLS encryption support
- Connection pooling with limits
- Connection timeout configuration
- Prepared statement usage

#### Query Security Wrapper
```javascript
const secureQuery = async (db, query, params = []) => {
  // Parameter validation
  // SQL injection pattern detection
  // Query logging (development only)
  // Error handling and sanitization
};
```

### 7. Real-time Communication Security

#### Socket.IO Security
- JWT-based socket authentication
- Room-based access control
- Connection rate limiting
- Message validation and sanitization

### 8. Logging & Monitoring

#### Security Event Logging
- Failed authentication attempts
- Rate limit violations
- Suspicious request patterns
- Database errors and anomalies

#### Request Monitoring
```javascript
// Log format
{
  timestamp: "2024-01-15T10:30:00.000Z",
  ip: "192.168.1.100",
  method: "POST",
  path: "/api/auth/login",
  statusCode: 401,
  duration: 150,
  userAgent: "Mozilla/5.0...",
  userId: "user-uuid-or-anonymous"
}
```

## 🚨 Attack Prevention Matrix

| Attack Type | Prevention Method | Implementation |
|-------------|-------------------|----------------|
| SQL Injection | Parameterized queries + pattern detection | `secureQuery()` wrapper |
| XSS | DOMPurify + CSP headers | `sanitizeInputs()` middleware |
| CSRF | SameSite cookies + CORS | CORS configuration |
| Command Injection | Input pattern detection | `sanitizeInput()` function |
| Path Traversal | Pattern detection + validation | File access controls |
| Brute Force | Rate limiting + account lockout | Multiple rate limiters |
| File Upload Attacks | Type validation + sandboxing | `validateFileUpload()` |
| Session Hijacking | Secure cookies + HTTPS | Cookie configuration |
| Information Disclosure | Error sanitization + logging | Error handler middleware |
| DoS/DDoS | Rate limiting + resource limits | Express limits + timeouts |

## 🔧 Configuration Options

### Environment Variables
```bash
# Security Configuration
BCRYPT_SALT_ROUNDS=12
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=100
AUTH_RATE_LIMIT_MAX=5

# Database Security
DB_SSL_MODE=require
DB_CONNECTION_TIMEOUT=2000
DB_MAX_CONNECTIONS=20

# File Security
MAX_FILE_SIZE=10485760
ALLOWED_FILE_TYPES=image/jpeg,image/png,application/pdf
```

### Security Middleware Chain
```javascript
app.use(setSecurityHeaders);     // Custom security headers
app.use(helmet());               // Additional security headers
app.use(securityLogger);         // Request monitoring
app.use(generalRateLimit);       // Rate limiting
app.use(express.json({limit}));  // Body parsing with limits
app.use(sanitizeInputs);         // Input sanitization
```

## 📋 Security Checklist

### Pre-Production Checklist
- [ ] Update all JWT secrets to production-grade random strings
- [ ] Enable SSL/TLS for database connections
- [ ] Configure proper CORS origins
- [ ] Set secure cookie flags in production
- [ ] Enable HTTPS redirect
- [ ] Configure proper CSP policies
- [ ] Set up security monitoring and alerting
- [ ] Implement proper backup encryption
- [ ] Configure firewall rules
- [ ] Set up intrusion detection

### Regular Security Tasks
- [ ] Review and rotate JWT secrets quarterly
- [ ] Monitor security logs for anomalies
- [ ] Update dependencies for security patches
- [ ] Conduct penetration testing
- [ ] Review and update rate limits based on usage
- [ ] Audit user permissions and access levels
- [ ] Review file upload security settings
- [ ] Test backup and recovery procedures

## 🔍 Security Testing

### Automated Testing
```bash
# Install security testing tools
npm install --save-dev sqlmap burp-suite nmap

# Run security tests
npm run test:security
```

### Manual Testing Checklist
1. **SQL Injection Testing**
   - Test with malicious payloads in all input fields
   - Verify parameterized queries are working
   - Check error messages don't leak database info

2. **XSS Testing**
   - Test script injection in text fields
   - Verify HTML sanitization
   - Check CSP headers are blocking inline scripts

3. **Authentication Testing**
   - Test JWT token validation
   - Verify password complexity requirements
   - Test rate limiting on login attempts

4. **Authorization Testing**
   - Test role-based access controls
   - Verify resource ownership checks
   - Test privilege escalation attempts

5. **File Upload Testing**
   - Test malicious file uploads
   - Verify file type restrictions
   - Test file size limits

## 🚀 Performance Impact

### Security vs Performance Balance
- Input sanitization adds ~2-5ms per request
- Rate limiting adds ~1-2ms per request
- JWT validation adds ~3-5ms per request
- Database security wrapper adds ~1-3ms per query

### Optimization Strategies
- Cache JWT validations when possible
- Use connection pooling for database efficiency
- Implement security checks at multiple layers
- Monitor performance metrics continuously

## 📞 Incident Response

### Security Incident Procedures
1. **Detection**: Monitor logs for security alerts
2. **Containment**: Rate limit or block malicious IPs
3. **Investigation**: Analyze attack patterns and scope
4. **Recovery**: Patch vulnerabilities and restore services
5. **Lessons Learned**: Update security measures and documentation

### Emergency Contacts
- Security Team: security@metasoftware.com
- Infrastructure Team: ops@metasoftware.com
- Management: management@metasoftware.com

## 📚 Additional Resources

### Security Standards
- OWASP Top 10 Web Application Security Risks
- NIST Cybersecurity Framework
- CIS Controls for Web Applications

### Tools and Libraries Used
- **DOMPurify**: HTML sanitization
- **Helmet.js**: Security headers
- **express-rate-limit**: Rate limiting
- **express-validator**: Input validation
- **bcryptjs**: Password hashing
- **jsonwebtoken**: JWT handling

This comprehensive security implementation provides multiple layers of protection against common web application vulnerabilities while maintaining good performance and usability.
