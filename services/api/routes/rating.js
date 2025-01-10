const express = require('express');
const router = express.Router();

// GET /api/v1/rating/history/:trackId
router.get('/history/:trackId', async (req, res) => {
    console.log('Getting rating history for:', req.params.trackId);
    try {
        const song = await req.app.locals.models.Song
            .findOne({ track_id: req.params.trackId })
            .lean();

        if (!song) {
            return res.status(404).json({ error: 'Song not found' });
        }

        const history = await req.app.locals.models.RatingHistory
            .find({ song_id: req.params.trackId })
            .sort({ created_at: -1 })
            .limit(50)
            .lean();

        console.log('Found history entries:', history.length);
        res.json(history);
    } catch (error) {
        console.error('Get rating history error:', error);
        res.status(500).json({ error: error.message });
    }
});

// GET /api/v1/rating/stats/:trackId
router.get('/stats/:trackId', async (req, res) => {
    console.log('Getting rating stats for:', req.params.trackId);
    try {
        const song = await req.app.locals.models.Song
            .findOne({ track_id: req.params.trackId })
            .lean();

        if (!song) {
            return res.status(404).json({ error: 'Song not found' });
        }

        const history = await req.app.locals.models.RatingHistory
            .find({ song_id: req.params.trackId })
            .sort({ created_at: -1 });

        const stats = {
            current_rating: song.rating,
            confidence: song.rating_confidence,
            total_changes: history.length,
            biggest_gain: history.length > 0 ? Math.max(...history.map(h => h.rating_change)) : 0,
            biggest_loss: history.length > 0 ? Math.min(...history.map(h => h.rating_change)) : 0,
            events: {
                plays: history.filter(h => h.event_type === 'play').length,
                skips: history.filter(h => h.event_type === 'skip').length,
                downloads: history.filter(h => h.event_type === 'download').length
            }
        };

        res.json(stats);
    } catch (error) {
        console.error('Get rating stats error:', error);
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;
