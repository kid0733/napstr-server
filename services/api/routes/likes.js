const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');

// GET /api/v1/likes - Get user's liked songs with pagination
router.get('/', auth, async (req, res) => {
    try {
        const { page = 1, limit = 20 } = req.query;
        const skip = (page - 1) * limit;

        const user = await req.app.locals.models.User
            .findById(req.user._id)
            .select('likedSongs')
            .slice('likedSongs', [skip, parseInt(limit)])
            .lean();

        const songIds = user.likedSongs.map(like => like.songId);
        const songs = await req.app.locals.models.Song
            .find({ track_id: { $in: songIds } })
            .lean();

        // Count total liked songs
        const total = await req.app.locals.models.User
            .findById(req.user._id)
            .select('likedSongs')
            .lean()
            .then(user => user.likedSongs.length);

        res.json({
            songs,
            pagination: {
                total,
                page: parseInt(page),
                pages: Math.ceil(total / parseInt(limit)),
                limit: parseInt(limit)
            }
        });
    } catch (error) {
        console.error('Get liked songs error:', error);
        res.status(500).json({ error: error.message });
    }
});

// POST /api/v1/likes/:trackId - Like a song
router.post('/:trackId', auth, async (req, res) => {
    try {
        const song = await req.app.locals.models.Song
            .findOne({ track_id: req.params.trackId });

        if (!song) {
            return res.status(404).json({ error: 'Song not found' });
        }

        const user = await req.app.locals.models.User.findById(req.user._id);
        
        // Check if already liked
        const alreadyLiked = user.likedSongs.some(like => 
            like.songId === req.params.trackId
        );

        if (alreadyLiked) {
            return res.status(400).json({ error: 'Song already liked' });
        }

        // Add to liked songs
        user.likedSongs.push({
            songId: req.params.trackId,
            addedAt: new Date()
        });

        await user.save();

        res.json({ success: true });
    } catch (error) {
        console.error('Like song error:', error);
        res.status(500).json({ error: error.message });
    }
});

// DELETE /api/v1/likes/:trackId - Unlike a song
router.delete('/:trackId', auth, async (req, res) => {
    try {
        const user = await req.app.locals.models.User.findById(req.user._id);
        
        // Remove from liked songs
        user.likedSongs = user.likedSongs.filter(like => 
            like.songId !== req.params.trackId
        );

        await user.save();

        res.json({ success: true });
    } catch (error) {
        console.error('Unlike song error:', error);
        res.status(500).json({ error: error.message });
    }
});

// GET /api/v1/likes/:trackId - Check if song is liked
router.get('/:trackId', auth, async (req, res) => {
    try {
        const user = await req.app.locals.models.User
            .findById(req.user._id)
            .select('likedSongs')
            .lean();

        const isLiked = user.likedSongs.some(like => 
            like.songId === req.params.trackId
        );

        res.json({ isLiked });
    } catch (error) {
        console.error('Check like status error:', error);
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;
