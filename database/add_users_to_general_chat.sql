-- Migration script to add existing users to general chat room
-- This script ensures all users have access to the general discussion room

-- First, ensure we have a general chat room
DO $$
DECLARE
    admin_user_id UUID;
BEGIN
    -- Get the first administrator user
    SELECT id INTO admin_user_id FROM users WHERE role = 'administrator' LIMIT 1;
    
    -- Insert general chat room if it doesn't exist
    INSERT INTO chat_rooms (id, name, is_group_chat, project_id, created_by)
    VALUES ('c0000000-0000-0000-0000-000000000000', 'General Discussion', true, NULL, admin_user_id)
    ON CONFLICT (id) DO NOTHING;
END $$;

-- Add all users to the general chat room who aren't already participants
INSERT INTO chat_participants (chat_room_id, user_id)
SELECT 
    'c0000000-0000-0000-0000-000000000000'::UUID as chat_room_id,
    u.id as user_id
FROM users u
WHERE u.is_active = true
AND NOT EXISTS (
    SELECT 1 FROM chat_participants cp 
    WHERE cp.chat_room_id = 'c0000000-0000-0000-0000-000000000000'::UUID
    AND cp.user_id = u.id
);

-- Add a welcome message from the admin if no messages exist yet
DO $$
DECLARE
    admin_user_id UUID;
    message_count INTEGER;
BEGIN
    -- Get the first administrator user
    SELECT id INTO admin_user_id FROM users WHERE role = 'administrator' LIMIT 1;
    
    -- Check if messages already exist
    SELECT COUNT(*) INTO message_count 
    FROM chat_messages 
    WHERE chat_room_id = 'c0000000-0000-0000-0000-000000000000'::UUID;
    
    -- Add welcome message if no messages exist
    IF message_count = 0 THEN
        INSERT INTO chat_messages (chat_room_id, sender_id, content)
        VALUES (
            'c0000000-0000-0000-0000-000000000000'::UUID,
            admin_user_id,
            'Welcome to Meta Software General Discussion! This is a space for everyone - administrators, developers, and clients - to communicate and collaborate.'
        );
    END IF;
END $$;

-- Show results
SELECT 
    'General Chat Participants' as info,
    COUNT(*) as participant_count
FROM chat_participants cp
JOIN chat_rooms cr ON cp.chat_room_id = cr.id
WHERE cr.name = 'General Discussion';

SELECT 
    'Users in General Chat' as info,
    u.email,
    u.first_name,
    u.last_name,
    u.role
FROM users u
JOIN chat_participants cp ON u.id = cp.user_id
JOIN chat_rooms cr ON cp.chat_room_id = cr.id
WHERE cr.name = 'General Discussion'
ORDER BY u.role, u.first_name;
