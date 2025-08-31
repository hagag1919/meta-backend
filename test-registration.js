const axios = require('axios');

async function testRegistration() {
  try {
    const response = await axios.post('http://localhost:3001/api/auth/register', {
      first_name: 'John',
      last_name: 'Doe', 
      email: 'john.test@example.com',
      password: 'SecurePass123!',
      role: 'administrator'
    });
    
    console.log('Registration successful:', response.data);
  } catch (error) {
    console.error('Registration failed:', error.response?.data || error.message);
  }
}

testRegistration();
