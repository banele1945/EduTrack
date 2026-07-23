const express = require('express');
const router = express.Router();
const db = require('../config/database');
const { isAuthenticated } = require('../middleware/auth');

// Get user information
router.get('/users/:id', isAuthenticated, async (req, res) => {
    try {
        const userId = req.params.id;
        
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
            return res.status(404).json({ error: 'User not found' });
        }

        res.json(user[0]);
    } catch (error) {
        console.error('Error fetching user info:', error);
        res.status(500).json({ error: 'Failed to fetch user information' });
    }
});

module.exports = router; 