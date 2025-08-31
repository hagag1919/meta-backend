const express = require('express');
const router = express.Router();
const db = require('../config/database');
const { validatePagination } = require('../middleware/validation');
const { body } = require('express-validator');

const activeConnections = new Map();


router.get('/conversations', validatePagination, async (req, res, next) => {
  try {
    const { page = 1, limit = 20 } = req.query;
    const offset = (page - 1) * limit;

    // Get conversations where user is a participant
    const conversationsQuery = `
      SELECT DISTINCT
        c.id, c.name, c.type, c.created_at, c.updated_at,
        c.created_by,
        creator.first_name || ' ' || creator.last_name as created_by_name,
        (
          SELECT COUNT(*) FROM chat_messages cm 
          WHERE cm.conversation_id = c.id 
          AND cm.created_at > COALESCE(cp.last_read_at, '1970-01-01'::timestamp)
        ) as unread_count,
        (
          SELECT cm.message_text FROM chat_messages cm 
          WHERE cm.conversation_id = c.id 
          ORDER BY cm.created_at DESC LIMIT 1
        ) as last_message,
        (
          SELECT cm.created_at FROM chat_messages cm 
          WHERE cm.conversation_id = c.id 
          ORDER BY cm.created_at DESC LIMIT 1
        ) as last_message_at,
        (
          SELECT sender.first_name || ' ' || sender.last_name 
          FROM chat_messages cm 
          JOIN users sender ON cm.sender_id = sender.id
          WHERE cm.conversation_id = c.id 
          ORDER BY cm.created_at DESC LIMIT 1
        ) as last_message_sender
      FROM chat_conversations c
      JOIN chat_participants cp ON c.id = cp.conversation_id
      JOIN users creator ON c.created_by = creator.id
      WHERE cp.user_id = $1 AND cp.is_active = true
      ORDER BY 
        COALESCE(
          (SELECT MAX(cm.created_at) FROM chat_messages cm WHERE cm.conversation_id = c.id),
          c.created_at
        ) DESC
      LIMIT $2 OFFSET $3
    `;

    const result = await db.query(conversationsQuery, [req.user.id, limit, offset]);

    // Get participants for each conversation
    const conversationsWithParticipants = await Promise.all(
      result.rows.map(async (conversation) => {
        const participantsQuery = `
          SELECT 
            u.id, u.first_name, u.last_name, u.email, u.role,
            cp.joined_at, cp.last_read_at
          FROM chat_participants cp
          JOIN users u ON cp.user_id = u.id
          WHERE cp.conversation_id = $1 AND cp.is_active = true
          ORDER BY u.first_name, u.last_name
        `;

        const participantsResult = await db.query(participantsQuery, [conversation.id]);
        
        return {
          ...conversation,
          participants: participantsResult.rows
        };
      })
    );

    // Get total count
    const countQuery = `
      SELECT COUNT(DISTINCT c.id) FROM chat_conversations c
      JOIN chat_participants cp ON c.id = cp.conversation_id
      WHERE cp.user_id = $1 AND cp.is_active = true
    `;
    const countResult = await db.query(countQuery, [req.user.id]);
    const totalConversations = parseInt(countResult.rows[0].count);

    const totalPages = Math.ceil(totalConversations / limit);

    res.json({
      conversations: conversationsWithParticipants,
      pagination: {
        current_page: parseInt(page),
        total_pages: totalPages,
        total_conversations: totalConversations,
        has_next: page < totalPages,
        has_prev: page > 1
      }
    });
  } catch (error) {
    next(error);
  }
});

// @route   POST /api/chat/conversations
// @desc    Create new conversation
// @access  Private
router.post('/conversations', [
  body('name').optional().trim().isLength({ min: 1, max: 255 }),
  body('type').isIn(['direct', 'group', 'project']),
  body('participant_ids').isArray().isLength({ min: 1 }),
  body('project_id').optional().isUUID()
], async (req, res, next) => {
  try {
    const { name, type, participant_ids, project_id } = req.body;

    // Validate participants exist and are active
    const participantCheckQuery = `
      SELECT id FROM users 
      WHERE id = ANY($1) AND is_active = true
    `;
    const participantCheckResult = await db.query(participantCheckQuery, [participant_ids]);
    
    if (participantCheckResult.rows.length !== participant_ids.length) {
      return res.status(400).json({ error: 'One or more participants not found or inactive' });
    }

    // For direct messages, check if conversation already exists
    if (type === 'direct' && participant_ids.length === 1) {
      const existingQuery = `
        SELECT c.id FROM chat_conversations c
        JOIN chat_participants cp1 ON c.id = cp1.conversation_id
        JOIN chat_participants cp2 ON c.id = cp2.conversation_id
        WHERE c.type = 'direct'
        AND cp1.user_id = $1 AND cp1.is_active = true
        AND cp2.user_id = $2 AND cp2.is_active = true
        AND (
          SELECT COUNT(*) FROM chat_participants cp 
          WHERE cp.conversation_id = c.id AND cp.is_active = true
        ) = 2
      `;

      const existingResult = await db.query(existingQuery, [req.user.id, participant_ids[0]]);
      if (existingResult.rows.length > 0) {
        return res.status(400).json({ 
          error: 'Direct conversation already exists',
          conversation_id: existingResult.rows[0].id
        });
      }
    }

    // For project conversations, validate project access
    if (type === 'project' && project_id) {
      const projectAccessQuery = `
        SELECT p.id FROM projects p
        LEFT JOIN project_team pt ON p.id = pt.project_id
        WHERE p.id = $1 AND p.is_active = true
        AND (p.project_manager_id = $2 OR pt.user_id = $2)
      `;

      const projectAccessResult = await db.query(projectAccessQuery, [project_id, req.user.id]);
      if (projectAccessResult.rows.length === 0) {
        return res.status(403).json({ error: 'Access denied to project' });
      }
    }

    // Generate conversation name if not provided
    let conversationName = name;
    if (!conversationName) {
      if (type === 'direct') {
        const otherUserQuery = 'SELECT first_name, last_name FROM users WHERE id = $1';
        const otherUserResult = await db.query(otherUserQuery, [participant_ids[0]]);
        if (otherUserResult.rows.length > 0) {
          const otherUser = otherUserResult.rows[0];
          conversationName = `${req.user.first_name} ${req.user.last_name} & ${otherUser.first_name} ${otherUser.last_name}`;
        }
      } else if (type === 'project' && project_id) {
        const projectQuery = 'SELECT name FROM projects WHERE id = $1';
        const projectResult = await db.query(projectQuery, [project_id]);
        if (projectResult.rows.length > 0) {
          conversationName = `${projectResult.rows[0].name} - Team Chat`;
        }
      } else {
        conversationName = 'Group Chat';
      }
    }

    // Create conversation
    const createQuery = `
      INSERT INTO chat_conversations (name, type, created_by, project_id)
      VALUES ($1, $2, $3, $4)
      RETURNING id, name, type, created_at
    `;

    const conversationResult = await db.query(createQuery, [
      conversationName, type, req.user.id, project_id
    ]);

    const conversation = conversationResult.rows[0];

    // Add creator as participant
    await db.query(
      'INSERT INTO chat_participants (conversation_id, user_id, joined_by) VALUES ($1, $2, $3)',
      [conversation.id, req.user.id, req.user.id]
    );

    // Add other participants
    for (const participantId of participant_ids) {
      if (participantId !== req.user.id) {
        await db.query(
          'INSERT INTO chat_participants (conversation_id, user_id, joined_by) VALUES ($1, $2, $3)',
          [conversation.id, participantId, req.user.id]
        );
      }
    }

    // Log activity
    await db.query(
      'INSERT INTO activity_logs (user_id, action, entity_type, entity_id, details) VALUES ($1, $2, $3, $4, $5)',
      [req.user.id, 'conversation_created', 'chat_conversation', conversation.id, {
        type,
        participant_count: participant_ids.length + 1,
        project_id
      }]
    );

    res.status(201).json({
      message: 'Conversation created successfully',
      conversation
    });
  } catch (error) {
    next(error);
  }
});

// @route   GET /api/chat/conversations/:id/messages
// @desc    Get messages from conversation
// @access  Private
router.get('/conversations/:id/messages', validatePagination, async (req, res, next) => {
  try {
    const { id } = req.params;
    const { page = 1, limit = 50 } = req.query;
    const offset = (page - 1) * limit;

    // Check if user is participant
    const participantQuery = `
      SELECT cp.id FROM chat_participants cp
      WHERE cp.conversation_id = $1 AND cp.user_id = $2 AND cp.is_active = true
    `;

    const participantResult = await db.query(participantQuery, [id, req.user.id]);
    if (participantResult.rows.length === 0) {
      return res.status(403).json({ error: 'Access denied to conversation' });
    }

    // Get messages
    const messagesQuery = `
      SELECT 
        cm.id, cm.message_text, cm.message_type, cm.created_at, cm.updated_at,
        cm.is_edited, cm.reply_to_id,
        u.id as sender_id, u.first_name || ' ' || u.last_name as sender_name,
        u.email as sender_email,
        reply_msg.message_text as reply_to_text,
        reply_sender.first_name || ' ' || reply_sender.last_name as reply_to_sender
      FROM chat_messages cm
      JOIN users u ON cm.sender_id = u.id
      LEFT JOIN chat_messages reply_msg ON cm.reply_to_id = reply_msg.id
      LEFT JOIN users reply_sender ON reply_msg.sender_id = reply_sender.id
      WHERE cm.conversation_id = $1
      ORDER BY cm.created_at DESC
      LIMIT $2 OFFSET $3
    `;

    const messagesResult = await db.query(messagesQuery, [id, limit, offset]);

    // Update last read timestamp
    await db.query(
      'UPDATE chat_participants SET last_read_at = CURRENT_TIMESTAMP WHERE conversation_id = $1 AND user_id = $2',
      [id, req.user.id]
    );

    // Get total count
    const countQuery = 'SELECT COUNT(*) FROM chat_messages WHERE conversation_id = $1';
    const countResult = await db.query(countQuery, [id]);
    const totalMessages = parseInt(countResult.rows[0].count);

    const totalPages = Math.ceil(totalMessages / limit);

    res.json({
      messages: messagesResult.rows.reverse(), // Reverse to show oldest first
      pagination: {
        current_page: parseInt(page),
        total_pages: totalPages,
        total_messages: totalMessages,
        has_next: page < totalPages,
        has_prev: page > 1
      }
    });
  } catch (error) {
    next(error);
  }
});

// @route   POST /api/chat/conversations/:id/messages
// @desc    Send message to conversation
// @access  Private
router.post('/conversations/:id/messages', [
  body('message_text').trim().isLength({ min: 1, max: 2000 }),
  body('message_type').optional().isIn(['text', 'file', 'image']),
  body('reply_to_id').optional().isUUID()
], async (req, res, next) => {
  try {
    const { id } = req.params;
    const { message_text, message_type = 'text', reply_to_id } = req.body;

    // Check if user is participant
    const participantQuery = `
      SELECT cp.id FROM chat_participants cp
      WHERE cp.conversation_id = $1 AND cp.user_id = $2 AND cp.is_active = true
    `;

    const participantResult = await db.query(participantQuery, [id, req.user.id]);
    if (participantResult.rows.length === 0) {
      return res.status(403).json({ error: 'Access denied to conversation' });
    }

    // Validate reply_to message if provided
    if (reply_to_id) {
      const replyQuery = 'SELECT id FROM chat_messages WHERE id = $1 AND conversation_id = $2';
      const replyResult = await db.query(replyQuery, [reply_to_id, id]);
      if (replyResult.rows.length === 0) {
        return res.status(400).json({ error: 'Reply message not found in this conversation' });
      }
    }

    // Create message
    const messageQuery = `
      INSERT INTO chat_messages (conversation_id, sender_id, message_text, message_type, reply_to_id)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING id, message_text, message_type, created_at
    `;

    const messageResult = await db.query(messageQuery, [
      id, req.user.id, message_text, message_type, reply_to_id
    ]);

    const message = messageResult.rows[0];

    // Update conversation timestamp
    await db.query(
      'UPDATE chat_conversations SET updated_at = CURRENT_TIMESTAMP WHERE id = $1',
      [id]
    );

    // Emit message to active connections (Socket.IO integration)
    const io = req.app.get('io');
    if (io) {
      // Get all participants for this conversation
      const participantsQuery = 'SELECT user_id FROM chat_participants WHERE conversation_id = $1 AND is_active = true';
      const participantsResult = await db.query(participantsQuery, [id]);
      
      const messageData = {
        ...message,
        sender_id: req.user.id,
        sender_name: `${req.user.first_name} ${req.user.last_name}`,
        conversation_id: id
      };

      // Emit to all participants
      participantsResult.rows.forEach(participant => {
        io.to(`user_${participant.user_id}`).emit('new_message', messageData);
      });
    }

    res.status(201).json({
      message: 'Message sent successfully',
      chat_message: {
        ...message,
        sender_id: req.user.id,
        sender_name: `${req.user.first_name} ${req.user.last_name}`
      }
    });
  } catch (error) {
    next(error);
  }
});

// @route   PUT /api/chat/messages/:id
// @desc    Edit message
// @access  Private
router.put('/messages/:id', [
  body('message_text').trim().isLength({ min: 1, max: 2000 })
], async (req, res, next) => {
  try {
    const { id } = req.params;
    const { message_text } = req.body;

    // Check if message exists and user is sender
    const messageQuery = `
      SELECT cm.*, c.id as conversation_id FROM chat_messages cm
      JOIN chat_conversations c ON cm.conversation_id = c.id
      WHERE cm.id = $1 AND cm.sender_id = $2
    `;

    const messageResult = await db.query(messageQuery, [id, req.user.id]);
    if (messageResult.rows.length === 0) {
      return res.status(404).json({ error: 'Message not found or access denied' });
    }

    const message = messageResult.rows[0];

    // Check if message is recent (can only edit within 15 minutes)
    const fifteenMinutesAgo = new Date(Date.now() - 15 * 60 * 1000);
    if (new Date(message.created_at) < fifteenMinutesAgo) {
      return res.status(400).json({ error: 'Cannot edit messages older than 15 minutes' });
    }

    // Update message
    const updateQuery = `
      UPDATE chat_messages 
      SET message_text = $1, is_edited = true, updated_at = CURRENT_TIMESTAMP
      WHERE id = $2
      RETURNING id, message_text, is_edited, updated_at
    `;

    const updateResult = await db.query(updateQuery, [message_text, id]);

    // Emit update to active connections
    const io = req.app.get('io');
    if (io) {
      const participantsQuery = 'SELECT user_id FROM chat_participants WHERE conversation_id = $1 AND is_active = true';
      const participantsResult = await db.query(participantsQuery, [message.conversation_id]);
      
      const updatedMessage = {
        ...updateResult.rows[0],
        sender_id: req.user.id,
        sender_name: `${req.user.first_name} ${req.user.last_name}`,
        conversation_id: message.conversation_id
      };

      participantsResult.rows.forEach(participant => {
        io.to(`user_${participant.user_id}`).emit('message_updated', updatedMessage);
      });
    }

    res.json({
      message: 'Message updated successfully',
      chat_message: updateResult.rows[0]
    });
  } catch (error) {
    next(error);
  }
});

// @route   DELETE /api/chat/messages/:id
// @desc    Delete message
// @access  Private
router.delete('/messages/:id', async (req, res, next) => {
  try {
    const { id } = req.params;

    // Check if message exists and user is sender
    const messageQuery = `
      SELECT cm.*, c.id as conversation_id FROM chat_messages cm
      JOIN chat_conversations c ON cm.conversation_id = c.id
      WHERE cm.id = $1 AND cm.sender_id = $2
    `;

    const messageResult = await db.query(messageQuery, [id, req.user.id]);
    if (messageResult.rows.length === 0) {
      return res.status(404).json({ error: 'Message not found or access denied' });
    }

    const message = messageResult.rows[0];

    // Soft delete message
    const deleteQuery = `
      UPDATE chat_messages 
      SET message_text = '[Message deleted]', is_deleted = true, updated_at = CURRENT_TIMESTAMP
      WHERE id = $1
      RETURNING id, message_text, is_deleted, updated_at
    `;

    const deleteResult = await db.query(deleteQuery, [id]);

    // Emit deletion to active connections
    const io = req.app.get('io');
    if (io) {
      const participantsQuery = 'SELECT user_id FROM chat_participants WHERE conversation_id = $1 AND is_active = true';
      const participantsResult = await db.query(participantsQuery, [message.conversation_id]);
      
      const deletedMessage = {
        ...deleteResult.rows[0],
        sender_id: req.user.id,
        conversation_id: message.conversation_id
      };

      participantsResult.rows.forEach(participant => {
        io.to(`user_${participant.user_id}`).emit('message_deleted', deletedMessage);
      });
    }

    res.json({
      message: 'Message deleted successfully'
    });
  } catch (error) {
    next(error);
  }
});

// @route   POST /api/chat/conversations/:id/participants
// @desc    Add participants to conversation
// @access  Private
router.post('/conversations/:id/participants', [
  body('user_ids').isArray().isLength({ min: 1 })
], async (req, res, next) => {
  try {
    const { id } = req.params;
    const { user_ids } = req.body;

    // Check if user is participant and conversation allows adding members
    const conversationQuery = `
      SELECT c.*, cp.user_id as participant_id FROM chat_conversations c
      JOIN chat_participants cp ON c.id = cp.conversation_id
      WHERE c.id = $1 AND cp.user_id = $2 AND cp.is_active = true
    `;

    const conversationResult = await db.query(conversationQuery, [id, req.user.id]);
    if (conversationResult.rows.length === 0) {
      return res.status(403).json({ error: 'Access denied to conversation' });
    }

    const conversation = conversationResult.rows[0];

    // Don't allow adding to direct conversations
    if (conversation.type === 'direct') {
      return res.status(400).json({ error: 'Cannot add participants to direct conversations' });
    }

    // Validate users exist and are active
    const userCheckQuery = `
      SELECT id, first_name, last_name FROM users 
      WHERE id = ANY($1) AND is_active = true
    `;
    const userCheckResult = await db.query(userCheckQuery, [user_ids]);
    
    if (userCheckResult.rows.length !== user_ids.length) {
      return res.status(400).json({ error: 'One or more users not found or inactive' });
    }

    const addedParticipants = [];

    // Add participants
    for (const userId of user_ids) {
      // Check if already participant
      const existingQuery = `
        SELECT id FROM chat_participants 
        WHERE conversation_id = $1 AND user_id = $2 AND is_active = true
      `;
      const existingResult = await db.query(existingQuery, [id, userId]);

      if (existingResult.rows.length === 0) {
        await db.query(
          'INSERT INTO chat_participants (conversation_id, user_id, joined_by) VALUES ($1, $2, $3)',
          [id, userId, req.user.id]
        );

        const user = userCheckResult.rows.find(u => u.id === userId);
        addedParticipants.push(user);
      }
    }

    // Log activity
    await db.query(
      'INSERT INTO activity_logs (user_id, action, entity_type, entity_id, details) VALUES ($1, $2, $3, $4, $5)',
      [req.user.id, 'participants_added', 'chat_conversation', id, {
        added_count: addedParticipants.length,
        participant_names: addedParticipants.map(p => `${p.first_name} ${p.last_name}`)
      }]
    );

    res.json({
      message: 'Participants added successfully',
      added_participants: addedParticipants
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
