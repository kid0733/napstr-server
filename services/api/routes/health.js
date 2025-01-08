const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');

router.get('/', async (req, res) => {
    try {
        // Get the music database connection from app.locals
        const models = req.app.locals.models;
        const dbStatus = models.Song.db.readyState === 1;
        
        // Get counts using the models from app.locals
        const songCount = dbStatus ? await models.Song.countDocuments() : 0;
        const ratingCount = dbStatus ? await models.RatingHistory.countDocuments() : 0;

        res.json({
            status: 'OK',
            timestamp: new Date().toISOString(),
            database: {
                connected: dbStatus,
                songCount,
                ratingCount
            },
            uptime: process.uptime(),
            memory: process.memoryUsage()
        });
    } catch (error) {
        res.status(500).json({ 
            status: 'ERROR', 
            timestamp: new Date().toISOString(),
            error: error.message 
        });
    }
});

module.exports = router;
