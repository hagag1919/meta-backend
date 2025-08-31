/**
 * Utility script to add all users to the general chat room
 * Run this script to fix the chat permissions for existing installations
 */

const db = require('../config/database');

async function addUsersToGeneralChat() {
  try {
    console.log('🔧 Starting general chat room setup...');

    // 1. Find or create general chat room
    let generalRoomResult = await db.query(`
      SELECT id FROM chat_rooms 
      WHERE project_id IS NULL 
      AND (LOWER(name) LIKE '%general%' OR LOWER(name) LIKE '%discussion%')
      LIMIT 1
    `);

    let generalRoomId;
    
    if (generalRoomResult.rows.length === 0) {
      console.log('📝 Creating general chat room...');
      
      // Get first admin user
      const adminResult = await db.query('SELECT id FROM users WHERE role = \'administrator\' LIMIT 1');
      if (adminResult.rows.length === 0) {
        throw new Error('No administrator user found');
      }
      
      const adminId = adminResult.rows[0].id;
      
      // Create general chat room
      const createRoomResult = await db.query(`
        INSERT INTO chat_rooms (id, name, is_group_chat, project_id, created_by)
        VALUES ('c0000000-0000-0000-0000-000000000000', 'General Discussion', true, NULL, $1)
        RETURNING id
      `, [adminId]);
      
      generalRoomId = createRoomResult.rows[0].id;
      console.log('✅ General chat room created:', generalRoomId);
    } else {
      generalRoomId = generalRoomResult.rows[0].id;
      console.log('✅ General chat room found:', generalRoomId);
    }

    // 2. Get all active users
    const usersResult = await db.query('SELECT id, email, role FROM users WHERE is_active = true');
    console.log(`👥 Found ${usersResult.rows.length} active users`);

    // 3. Add users to general chat room
    let addedCount = 0;
    let skippedCount = 0;

    for (const user of usersResult.rows) {
      try {
        const result = await db.query(`
          INSERT INTO chat_participants (chat_room_id, user_id) 
          VALUES ($1, $2) 
          ON CONFLICT (chat_room_id, user_id) DO NOTHING
          RETURNING id
        `, [generalRoomId, user.id]);

        if (result.rows.length > 0) {
          addedCount++;
          console.log(`  ➕ Added ${user.email} (${user.role})`);
        } else {
          skippedCount++;
          console.log(`  ⏭️  Skipped ${user.email} (already in room)`);
        }
      } catch (err) {
        console.error(`  ❌ Failed to add ${user.email}:`, err.message);
      }
    }

    // 4. Add welcome message if none exists
    const messageCount = await db.query('SELECT COUNT(*) as count FROM chat_messages WHERE chat_room_id = $1', [generalRoomId]);
    
    if (parseInt(messageCount.rows[0].count) === 0) {
      console.log('💬 Adding welcome message...');
      
      const adminResult = await db.query('SELECT id FROM users WHERE role = \'administrator\' LIMIT 1');
      if (adminResult.rows.length > 0) {
        await db.query(`
          INSERT INTO chat_messages (chat_room_id, sender_id, content)
          VALUES ($1, $2, $3)
        `, [
          generalRoomId,
          adminResult.rows[0].id,
          'Welcome to Meta Software General Discussion! This is a space for everyone - administrators, developers, and clients - to communicate and collaborate.'
        ]);
        console.log('✅ Welcome message added');
      }
    }

    // 5. Show results
    console.log('\n📊 Summary:');
    console.log(`   👥 Users added: ${addedCount}`);
    console.log(`   ⏭️  Users already in room: ${skippedCount}`);
    console.log(`   🏠 General room ID: ${generalRoomId}`);

    // 6. Show final participant list
    const participantsResult = await db.query(`
      SELECT u.email, u.role, u.first_name, u.last_name
      FROM users u
      JOIN chat_participants cp ON u.id = cp.user_id
      WHERE cp.chat_room_id = $1
      ORDER BY u.role, u.first_name
    `, [generalRoomId]);

    console.log('\n👥 Current participants in General Discussion:');
    participantsResult.rows.forEach(user => {
      console.log(`   ${user.first_name} ${user.last_name} (${user.email}) - ${user.role}`);
    });

    console.log('\n🎉 General chat room setup completed successfully!');
    return true;

  } catch (error) {
    console.error('❌ Error setting up general chat room:', error);
    return false;
  }
}

// Run the script if called directly
if (require.main === module) {
  addUsersToGeneralChat()
    .then((success) => {
      if (success) {
        process.exit(0);
      } else {
        process.exit(1);
      }
    })
    .catch((error) => {
      console.error('Fatal error:', error);
      process.exit(1);
    });
}

module.exports = { addUsersToGeneralChat };
