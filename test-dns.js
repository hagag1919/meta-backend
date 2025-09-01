const dns = require('dns').promises;

async function testDNS() {
  console.log('🧪 Testing DNS resolution for Supabase hosts...\n');
  
  const hosts = [
    'db.xskfbqttkhkbsmcowhtr.supabase.co',
    'aws-1-eu-north-1.pooler.supabase.com'
  ];
  
  for (const host of hosts) {
    try {
      console.log(`🔍 Resolving ${host}...`);
      const addresses = await dns.resolve4(host);
      console.log(`✅ ${host} resolves to:`, addresses);
    } catch (error) {
      console.log(`❌ ${host} resolution failed:`, error.code);
      
      // Try IPv6
      try {
        const addresses6 = await dns.resolve6(host);
        console.log(`✅ ${host} resolves to IPv6:`, addresses6);
      } catch (error6) {
        console.log(`❌ ${host} IPv6 resolution also failed:`, error6.code);
      }
    }
  }
  
  // Test basic internet connectivity
  try {
    console.log('\n🌐 Testing basic internet connectivity...');
    const googleIPs = await dns.resolve4('google.com');
    console.log('✅ Internet connectivity OK, google.com resolves to:', googleIPs[0]);
  } catch (error) {
    console.log('❌ No internet connectivity:', error.code);
  }
  
  console.log('\n📝 Recommendations:');
  console.log('1. If DNS resolution fails, try connecting via VPN');
  console.log('2. Check Windows firewall and antivirus settings');
  console.log('3. Try flushing DNS cache: ipconfig /flushdns');
  console.log('4. Use transaction pooler URL as alternative');
}

testDNS().catch(console.error);
