const express = require('express');
const router = express.Router();
const db = require('../config/database');
const { isAuthenticated } = require('../middleware/auth');

// Get user profile
router.get('/:id', isAuthenticated, async (req, res) => {
    try {
        const userId = req.params.id;
        
        // Get user details
        const [user] = await db.query(
            `SELECT 
                ID,
                Full_Name,
                Email,
                avatar,
                Department,
                Year_Level
            FROM Students 
            WHERE ID = ?`,
            [userId]
        );

        if (!user.length) {
            return res.status(404).render('error', { 
                message: 'User not found',
                error: { status: 404 }
            });
        }

        // Get user's connections
        const [connections] = await db.query(
            `SELECT 
                c.id as connection_id,
                CASE 
                    WHEN c.sender_id = ? THEN c.receiver_id
                    ELSE c.sender_id
                END as other_user_id,
                u.Full_Name as username,
                u.avatar,
                c.status
            FROM connections c
            JOIN Students u ON (u.ID = CASE WHEN c.sender_id = ? THEN c.receiver_id ELSE c.sender_id END)
            WHERE (c.sender_id = ? OR c.receiver_id = ?)
            AND c.status = 'accepted'`,
            [userId, userId, userId, userId]
        );

        res.render('profile', {
            user: req.session.user,
            profileUser: user[0],
            connections: connections,
            title: `${user[0].Full_Name}'s Profile - EduTrack`
        });
    } catch (error) {
        console.error('Error fetching profile:', error);
        res.status(500).render('error', {
            message: 'Error loading profile',
            error: { status: 500 }
        });
    }
});

module.exports = router;
