const express = require('express');
const router = express.Router();
const db = require('../config/database');
const { validateUUID } = require('../middleware/validation');

// @route   GET /api/chat/conversations
// @desc    Get user's chat conversations (chat rooms)
// @access  Private
router.get('/conversations', async (req, res, next) => {
  try {
    const userId = req.user.id;
    console.log('Chat conversations request from user:', userId);

    // Get chat rooms where the user is a participant
    const conversationsQuery = `
      SELECT 
        cr.id,
        cr.name,
        cr.is_group_chat,
        cr.project_id,
        cr.created_at,
        p.name as project_name,
        (
          SELECT cm.content 
          FROM chat_messages cm 
          WHERE cm.chat_room_id = cr.id 
          ORDER BY cm.created_at DESC 
          LIMIT 1
        ) as last_message,
        (
          SELECT cm.created_at 
          FROM chat_messages cm 
          WHERE cm.chat_room_id = cr.id 
          ORDER BY cm.created_at DESC 
          LIMIT 1
        ) as last_message_at,
        (
          SELECT COUNT(*) 
          FROM chat_messages cm 
          WHERE cm.chat_room_id = cr.id 
          AND cm.created_at > COALESCE(cp.joined_at, cr.created_at)
        ) as message_count
      FROM chat_rooms cr
      INNER JOIN chat_participants cp ON cr.id = cp.chat_room_id
      LEFT JOIN projects p ON cr.project_id = p.id
      WHERE cp.user_id = $1 AND cp.left_at IS NULL
      ORDER BY last_message_at DESC NULLS LAST, cr.created_at DESC
    `;

    console.log('Executing conversations query for user:', userId);
    const result = await db.query(conversationsQuery, [userId]);
    console.log('Query result:', result.rows.length, 'conversations found');
    
    res.json({ conversations: result.rows });
  } catch (error) {
    console.error('Error in chat conversations:', error);
    next(error);
  }
});

// @route   POST /api/chat/conversations
// @desc    Create new chat conversation (chat room)
// @access  Private
router.post('/conversations', async (req, res, next) => {
  try {
    const { name, is_group_chat = false, project_id, participant_ids = [] } = req.body;
    const userId = req.user.id;

    // Validate required fields
    if (is_group_chat && !name) {
      return res.status(400).json({ error: 'Name is required for group chats' });
    }

    // For direct messages, ensure exactly 2 participants
    if (!is_group_chat && participant_ids.length !== 1) {
      return res.status(400).json({ error: 'Direct messages require exactly one other participant' });
    }

    // Create chat room
    const createRoomQuery = `
      INSERT INTO chat_rooms (name, is_group_chat, project_id, created_by)
      VALUES ($1, $2, $3, $4)
      RETURNING id, name, is_group_chat, project_id, created_at
    `;

    const roomResult = await db.query(createRoomQuery, [
      name || null,
      is_group_chat,
      project_id || null,
      userId
    ]);

    const chatRoom = roomResult.rows[0];

        // Add creator as participant
    await db.query(
      'INSERT INTO chat_participants (chat_room_id, user_id) VALUES ($1, $2)',
      [chatRoom.id, userId]
    );

    // Add other participants
    if (is_group_chat && participant_ids.length > 0) {
      const participantValues = participant_ids.map(pId => `(${chatRoom.id}, ${pId})`).join(',');
      await db.query(`INSERT INTO chat_participants (chat_room_id, user_id) VALUES ${participantValues}`);
    } else if (!is_group_chat) {
      // Add the other single participant for direct message
      await db.query(
        'INSERT INTO chat_participants (chat_room_id, user_id) VALUES ($1, $2)',
        [chatRoom.id, participant_ids[0]]
      );
    }

    // Fetch the newly created chat room with all necessary details
    const newConversationQuery = `
      SELECT 
        cr.id,
        cr.name,
        cr.is_group_chat,
        cr.project_id,
        cr.created_at,
        p.name as project_name,
        NULL as last_message,
        NULL as last_message_at,
        0 as message_count
      FROM chat_rooms cr
      LEFT JOIN projects p ON cr.project_id = p.id
      WHERE cr.id = $1
    `;
    const newConversationResult = await db.query(newConversationQuery, [chatRoom.id]);

    res.status(201).json(newConversationResult.rows[0]);
  } catch (error) {
    console.error('Error creating conversation:', error);
    next(error);
  }
});

// @route   GET /api/chat/conversations/:id/messages
// @desc    Get messages from a conversation
// @access  Private
router.get('/conversations/:id/messages', validateUUID, async (req, res, next) => {
  try {
    const { id } = req.params;
    const { page = 1, limit = 50 } = req.query;
    const userId = req.user.id;
    const offset = (page - 1) * limit;

    // Check if user is participant in this chat room
    const participantCheck = await db.query(
      'SELECT 1 FROM chat_participants WHERE chat_room_id = $1 AND user_id = $2 AND left_at IS NULL',
      [id, userId]
    );

    if (participantCheck.rows.length === 0) {
      return res.status(403).json({ error: 'Access denied to this conversation' });
    }

    // Get messages
    const messagesQuery = `
      SELECT 
        cm.id,
        cm.content,
        cm.message_type,
        cm.created_at,
        cm.updated_at,
        cm.is_edited,
        u.first_name || ' ' || u.last_name as sender_name,
        u.id as sender_id,
        f.filename,
        f.original_filename
      FROM chat_messages cm
      INNER JOIN users u ON cm.sender_id = u.id
      LEFT JOIN files f ON cm.file_id = f.id
      WHERE cm.chat_room_id = $1
      ORDER BY cm.created_at DESC
      LIMIT $2 OFFSET $3
    `;

    const result = await db.query(messagesQuery, [id, limit, offset]);
    
    // Reverse to show oldest first
    const messages = result.rows.reverse();

    res.json({ messages });
  } catch (error) {
    next(error);
  }
});

// @route   POST /api/chat/conversations/:id/messages
// @desc    Send message to conversation
// @access  Private
router.post('/conversations/:id/messages', validateUUID, async (req, res, next) => {
  try {
    const { id } = req.params;
    const { content, message_type = 'text' } = req.body;
    const userId = req.user.id;

    // Validate content
    if (!content || content.trim().length === 0) {
      return res.status(400).json({ error: 'Message content is required' });
    }

    // Check if user is participant in this chat room
    const participantCheck = await db.query(
      'SELECT 1 FROM chat_participants WHERE chat_room_id = $1 AND user_id = $2 AND left_at IS NULL',
      [id, userId]
    );

    if (participantCheck.rows.length === 0) {
      return res.status(403).json({ error: 'Access denied to this conversation' });
    }

    // Insert message
    const insertMessageQuery = `
      INSERT INTO chat_messages (chat_room_id, sender_id, content, message_type)
      VALUES ($1, $2, $3, $4)
      RETURNING id, content, message_type, created_at
    `;

    const result = await db.query(insertMessageQuery, [id, userId, content.trim(), message_type]);
    const message = result.rows[0];

    // Get sender info for response
    const senderQuery = 'SELECT first_name || \' \' || last_name as sender_name FROM users WHERE id = $1';
    const senderResult = await db.query(senderQuery, [userId]);
    
    message.sender_name = senderResult.rows[0]?.sender_name;
    message.sender_id = userId;

    res.status(201).json({ message });
  } catch (error) {
    next(error);
  }
});

// @route   POST /api/chat/add-to-general
// @desc    Add user(s) to general chat room (Admin only)
// @access  Private (Admin)
router.post('/add-to-general', async (req, res, next) => {
  try {
    // Check if user is admin
    if (req.user.role !== 'administrator') {
      return res.status(403).json({ error: 'Only administrators can add users to general chat' });
    }

    const { user_ids } = req.body;
    
    // If no user_ids provided, add all active users
    let usersToAdd = [];
    if (!user_ids || user_ids.length === 0) {
      const allUsersResult = await db.query('SELECT id FROM users WHERE is_active = true');
      usersToAdd = allUsersResult.rows.map(row => row.id);
    } else {
      usersToAdd = user_ids;
    }

    // Find the general chat room
    const generalRoomQuery = `
      SELECT id FROM chat_rooms 
      WHERE project_id IS NULL 
      AND (LOWER(name) LIKE '%general%' OR LOWER(name) LIKE '%discussion%')
      LIMIT 1
    `;
    const generalRoomResult = await db.query(generalRoomQuery);
    
    if (generalRoomResult.rows.length === 0) {
      return res.status(404).json({ error: 'General chat room not found' });
    }

    const generalRoomId = generalRoomResult.rows[0].id;
    let addedCount = 0;

    // Add each user to the general chat room
    for (const userId of usersToAdd) {
      try {
        await db.query(
          'INSERT INTO chat_participants (chat_room_id, user_id) VALUES ($1, $2) ON CONFLICT (chat_room_id, user_id) DO NOTHING',
          [generalRoomId, userId]
        );
        addedCount++;
      } catch (err) {
        console.error(`Failed to add user ${userId} to general chat:`, err);
      }
    }

    res.status(200).json({ 
      message: `Successfully ensured ${addedCount} users have access to general chat`,
      added_count: addedCount,
      general_room_id: generalRoomId
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
