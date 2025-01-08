const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const { body, validationResult } = require('express-validator');

// Create playlist with timeout handling
router.post('/', auth, [
    body('name').trim().isLength({ min: 1, max: 100 }),
    body('description').optional().trim().isLength({ max: 500 }),
    body('isPublic').optional().isBoolean()
], async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }

        const { Playlist, User } = req.app.locals.models;

        const playlist = new Playlist({
            ...req.body,
            owner: req.user._id
        });

        // Use Promise.all for parallel operations
        const [savedPlaylist] = await Promise.all([
            playlist.save(),
            User.findByIdAndUpdate(req.user._id, {
                $push: { playlists: playlist._id }
            }, { new: true })
        ]);

        res.status(201).json(savedPlaylist);
    } catch (error) {
        console.error('Create playlist error:', error);
        if (error.name === 'MongooseError' && error.message.includes('buffering timed out')) {
            return res.status(504).json({ error: 'Database operation timed out' });
        }
        res.status(500).json({ error: error.message });
    }
});

// Get user's playlists with pagination
router.get('/', auth, async (req, res) => {
    try {
        const { Playlist } = req.app.locals.models;
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 20;
        const skip = (page - 1) * limit;

        const [playlists, total] = await Promise.all([
            Playlist.find({
                $or: [
                    { owner: req.user._id },
                    { 'collaborators.userId': req.user._id }
                ]
            })
            .populate('owner', 'username profile.displayName')
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit)
            .lean(),

            Playlist.countDocuments({
                $or: [
                    { owner: req.user._id },
                    { 'collaborators.userId': req.user._id }
                ]
            })
        ]);

        res.json({
            playlists,
            pagination: {
                current: page,
                pages: Math.ceil(total / limit),
                total
            }
        });
    } catch (error) {
        console.error('Get playlists error:', error);
        if (error.name === 'MongooseError' && error.message.includes('buffering timed out')) {
            return res.status(504).json({ error: 'Database operation timed out' });
        }
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;  // Added this line
