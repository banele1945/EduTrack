const express = require('express');
const router = express.Router();
const db = require('../config/database');
const { isAuthenticated } = require('../middleware/auth');
const { formatDistanceToNow } = require('date-fns');

// Render messages page
router.get('/', isAuthenticated, (req, res) => {
    res.render('messages', { user: req.session.user });
});

// Get all accepted connections as conversations for the current user
router.get('/conversations', isAuthenticated, async (req, res) => {
    try {
        const userId = req.session.user.id;
        console.log('Fetching conversations for user ID:', userId);
        
        // Rewritten query to get accepted connections and the latest message details
        const query = `
            SELECT 
                c.id as connection_id,
                -- Select the other user's info
                CASE 
                    WHEN c.sender_id = ? THEN receiver_id
                    ELSE sender_id
                END as other_user_id,
                u.Full_Name as username,
                u.avatar,
                -- Get the last message content using a correlated subquery
                (SELECT m.content
                 FROM messages m
                 WHERE m.conversation_id = c.id
                 ORDER BY m.created_at DESC
                 LIMIT 1
                ) as last_message,
                -- Get the last message timestamp using a correlated subquery
                (SELECT m.created_at
                 FROM messages m
                 WHERE m.conversation_id = c.id
                 ORDER BY m.created_at DESC
                 LIMIT 1
                ) as last_message_time,
                -- Count unread messages from the other user
                (SELECT COUNT(*) 
                 FROM messages 
                 WHERE conversation_id = c.id 
                   AND sender_id != ? 
                   AND is_read = 0
                ) as unread_count
            FROM connections c
            JOIN Students u ON (u.ID = CASE WHEN c.sender_id = ? THEN c.receiver_id ELSE c.sender_id END)
            WHERE (c.sender_id = ? OR c.receiver_id = ?)
            AND c.status = 'accepted'
            -- Order by the latest message timestamp for the conversation list order
            ORDER BY last_message_time DESC;
        `;
        
        console.log('Executing conversations query with parameters:', [userId, userId, userId, userId, userId]);
        const [connectionsAsConversations] = await db.query(query, [userId, userId, userId, userId, userId]);
        console.log('Query executed successfully. Results:', connectionsAsConversations.length);
        
        // Format the data
        const formattedConversations = connectionsAsConversations.map(conv => ({
            id: conv.connection_id, // Use connection_id as conversation_id
            user: {
                id: conv.other_user_id,
                username: conv.username,
                avatar: conv.avatar || '/images/default-avatar.jpg'
            },
            lastMessage: conv.last_message,
            lastMessageTime: conv.last_message_time ? formatDistanceToNow(new Date(conv.last_message_time), { addSuffix: true }) : null,
            unreadCount: conv.unread_count
        }));
        
        res.json(formattedConversations);
    } catch (error) {
        console.error('Error fetching conversations:', error);
        // Log the SQL query that caused the error if available
        if (error.sql) {
            console.error('Failing SQL query:', error.sql);
            console.error('SQL parameters:', error.params);
        }
        res.status(500).json({ error: 'Failed to fetch conversations' });
    }
});

// Get messages for a specific conversation (connection_id)
router.get('/conversations/:connectionId', isAuthenticated, async (req, res) => {
    try {
        const { connectionId } = req.params;
        const userId = req.session.user.id;
        
        // Verify user is part of the accepted connection
        const [connection] = await db.query(
            'SELECT id FROM connections WHERE id = ? AND (sender_id = ? OR receiver_id = ?) AND status = \'accepted\'',
            [connectionId, userId, userId]
        );
        
        if (!connection.length) {
            return res.status(403).json({ error: 'Not authorized to access this conversation' });
        }
        
        // Get messages for this connection
        const [messages] = await db.query(
            `SELECT 
                m.*,
                u.Full_Name as username,
                u.avatar
            FROM messages m
            JOIN Students u ON m.sender_id = u.ID
            WHERE m.conversation_id = ? -- messages.conversation_id now refers to connections.id
            ORDER BY m.created_at ASC`,
            [connectionId]
        );
        
        // Mark messages as read (sent by the other user)
        await db.query(
            'UPDATE messages SET is_read = 1 WHERE conversation_id = ? AND sender_id != ? AND is_read = 0',
            [connectionId, userId]
        );
        
        // Format messages
        const formattedMessages = messages.map(msg => ({
            id: msg.id,
            content: msg.content,
            senderId: msg.sender_id,
            senderName: msg.username,
            senderAvatar: msg.avatar || '/images/default-avatar.jpg',
            timestamp: msg.created_at,
            isRead: msg.is_read
        }));
        
        res.json(formattedMessages);
    } catch (error) {
        console.error('Error fetching messages:', error);
        res.status(500).json({ error: 'Failed to fetch messages' });
    }
});

// Send a message
router.post('/messages', isAuthenticated, async (req, res) => {
    try {
        const { conversationId, content } = req.body; // conversationId here is actually connection_id
        const userId = req.session.user.id;
        
        console.log('Attempting to send message:', { conversationId, content, userId });

        // Verify user is part of an accepted connection associated with this conversationId (connectionId)
        const [connection] = await db.query(
            'SELECT id FROM connections WHERE id = ? AND (sender_id = ? OR receiver_id = ?) AND status = \'accepted\'',
            [conversationId, userId, userId]
        );
        
        if (!connection.length) {
            console.log(`User ${userId} is not authorized to send message in connection ${conversationId}`);
            return res.status(403).json({ error: 'Not authorized to send message in this conversation' });
        }

        console.log('Connection verified. Inserting message...');

        // Insert message into the messages table (using connectionId as conversation_id)
        const [result] = await db.query(
            'INSERT INTO messages (conversation_id, sender_id, content) VALUES (?, ?, ?)',
            [conversationId, userId, content]
        );
        
        console.log('Message inserted with ID:', result.insertId);

        // Fetch the full message details including sender info to emit
        const [messageDetails] = await db.query(
             `SELECT 
                 m.*,
                 u.Full_Name as username,
                 u.avatar
             FROM messages m
             JOIN Students u ON m.sender_id = u.ID
             WHERE m.id = ?`,
             [result.insertId]
         );

        if (!messageDetails.length) {
             console.error('Failed to fetch newly created message details for message ID:', result.insertId);
             return res.status(500).json({ error: 'Failed to retrieve message details after sending' });
        }

        const emittedMessage = {
             id: messageDetails[0].id,
             conversationId: messageDetails[0].conversation_id, // Ensure connectionId is included
             senderId: messageDetails[0].sender_id,
             senderName: messageDetails[0].username,
             senderAvatar: messageDetails[0].avatar || '/images/default-avatar.jpg',
             content: messageDetails[0].content,
             timestamp: messageDetails[0].created_at,
             isRead: messageDetails[0].is_read
        };

        // Emit the new message to all connected clients in the conversation (using connectionId as the room)
        req.app.get('io').to(conversationId).emit('newMessage', emittedMessage);
        console.log(`Message successfully processed and emitted in conversation ${conversationId} by user ${userId}`);

        res.json({ success: true, message: emittedMessage });
    } catch (error) {
        console.error('Error sending message:', error);
        // Log more error details if available
        if (error.sql) {
            console.error('Failing SQL query:', error.sql);
            console.error('SQL parameters:', error.params);
        }
        if (error.message) {
             console.error('Error message:', error.message);
        }
        res.status(500).json({ error: 'Failed to send message' });
    }
});

module.exports = router;
