const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');

// Debug middleware
router.use((req, res, next) => {
    console.log('Liked Songs Router:', req.method, req.url);
    next();
});

// GET /api/v1/liked-songs - Get user's liked songs with pagination
router.get('/', auth, async (req, res) => {
    try {
        const {
            page = 1,
            limit = 20,
            sortBy = 'addedAt',
            sortOrder = 'desc'
        } = req.query;

        const user = await req.app.locals.models.User
            .findById(req.user._id)
            .select('likedSongs');

        const songIds = user.likedSongs.map(item => item.songId);
        
        const songs = await req.app.locals.models.Song
            .find({ track_id: { $in: songIds } })
            .select({
                _id: 0,
                track_id: 1,
                title: 1,
                artists: 1,
                album: 1,
                album_art: 1,
                duration_ms: 1,
                rating: 1,
                total_plays: 1
            })
            .lean();

        // Combine song data with liked timestamp and transform duration
        const likedSongs = songs.map(song => {
            const likedInfo = user.likedSongs.find(item => item.songId === song.track_id);
            return {
                ...song,
                duration: {
                    minutes: Math.floor(song.duration_ms / 60000),
                    seconds: Math.floor((song.duration_ms % 60000) / 1000)
                },
                likedAt: likedInfo.addedAt
            };
        });

        // Sort the results
        likedSongs.sort((a, b) => {
            if (sortOrder === 'desc') {
                return b.likedAt - a.likedAt;
            }
            return a.likedAt - b.likedAt;
        });

        // Apply pagination
        const startIndex = (page - 1) * limit;
        const endIndex = page * limit;
        const paginatedSongs = likedSongs.slice(startIndex, endIndex);

        res.json({
            songs: paginatedSongs,
            pagination: {
                total: likedSongs.length,
                page: parseInt(page),
                pages: Math.ceil(likedSongs.length / limit),
                limit: parseInt(limit)
            }
        });
    } catch (error) {
        console.error('Get liked songs error:', error);
        res.status(500).json({ error: error.message });
    }
});

// POST /api/v1/liked-songs/:trackId - Like a song
router.post('/:trackId', auth, async (req, res) => {
    try {
        const song = await req.app.locals.models.Song
            .findOne({ track_id: req.params.trackId });

        if (!song) {
            return res.status(404).json({ error: 'Song not found' });
        }

        const user = await req.app.locals.models.User.findById(req.user._id);
        
        // Check if song is already liked
        if (user.likedSongs.some(item => item.songId === req.params.trackId)) {
            return res.status(400).json({ error: 'Song already liked' });
        }

        // Add to liked songs
        user.likedSongs.push({
            songId: req.params.trackId,
            addedAt: new Date()
        });

        await user.save();

        res.json({
            success: true,
            message: 'Song added to liked songs'
        });
    } catch (error) {
        console.error('Like song error:', error);
        res.status(500).json({ error: error.message });
    }
});

// DELETE /api/v1/liked-songs/:trackId - Unlike a song
router.delete('/:trackId', auth, async (req, res) => {
    try {
        const user = await req.app.locals.models.User.findById(req.user._id);
        
        // Remove from liked songs
        user.likedSongs = user.likedSongs.filter(
            item => item.songId !== req.params.trackId
        );

        await user.save();

        res.json({
            success: true,
            message: 'Song removed from liked songs'
        });
    } catch (error) {
        console.error('Unlike song error:', error);
        res.status(500).json({ error: error.message });
    }
});

// GET /api/v1/liked-songs/:trackId/status - Check if a song is liked
router.get('/:trackId/status', auth, async (req, res) => {
    try {
        const user = await req.app.locals.models.User
            .findById(req.user._id)
            .select('likedSongs');

        const isLiked = user.likedSongs.some(
            item => item.songId === req.params.trackId
        );

        res.json({ isLiked });
    } catch (error) {
        console.error('Check liked status error:', error);
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;
