const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const mongoose = require('mongoose');

// Debug middleware
router.use((req, res, next) => {
    console.log('Song Requests Router:', req.method, req.url);
    next();
});

// POST /api/v1/song-requests - Create a new song request
router.post('/', auth, async (req, res) => {
    try {
        const { spotify_url } = req.body;

        if (!spotify_url) {
            return res.status(400).json({
                error: 'Spotify URL is required'
            });
        }

        // Validate URL format and extract type
        let type;
        if (spotify_url.includes('/track/') || spotify_url.includes(':track:')) {
            type = 'track';
        } else if (spotify_url.includes('/album/') || spotify_url.includes(':album:')) {
            type = 'album';
        } else if (spotify_url.includes('/playlist/') || spotify_url.includes(':playlist:')) {
            type = 'playlist';
        } else {
            return res.status(400).json({
                error: 'Invalid Spotify URL format. Must be a track, album, or playlist URL.'
            });
        }

        // Check if request already exists
        const existingRequest = await req.app.locals.models.SongRequest.findOne({
            spotify_url,
            status: { $in: ['pending', 'processing'] }
        });

        if (existingRequest) {
            return res.status(409).json({
                error: 'This song/album/playlist is already in the request queue',
                request: {
                    id: existingRequest._id,
                    status: existingRequest.status,
                    requested_at: existingRequest.requested_at
                }
            });
        }

        // Create new request
        const songRequest = new req.app.locals.models.SongRequest({
            spotify_url,
            type,
            requested_by: req.user._id
        });

        await songRequest.save();

        res.status(201).json({
            message: 'Song request created successfully',
            request: {
                id: songRequest._id,
                type: songRequest.type,
                status: songRequest.status,
                requested_at: songRequest.requested_at
            }
        });
    } catch (error) {
        console.error('Create song request error:', error);
        if (error.name === 'ValidationError') {
            return res.status(400).json({
                error: 'Invalid request data',
                details: error.message
            });
        }
        res.status(500).json({
            error: 'Failed to create song request',
            details: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});

// GET /api/v1/song-requests - Get all requests (with filters)
router.get('/', auth, async (req, res) => {
    try {
        const {
            status,
            type,
            page = 1,
            limit = 20
        } = req.query;

        const query = { requested_by: req.user._id };
        if (status) query.status = status;
        if (type) query.type = type;

        const requests = await req.app.locals.models.SongRequest
            .find(query)
            .sort({ requested_at: -1 })
            .skip((page - 1) * limit)
            .limit(limit)
            .lean();

        const total = await req.app.locals.models.SongRequest
            .countDocuments(query);

        res.json({
            requests,
            pagination: {
                total,
                page: parseInt(page),
                pages: Math.ceil(total / limit),
                limit: parseInt(limit)
            }
        });
    } catch (error) {
        console.error('Get song requests error:', error);
        res.status(500).json({ error: error.message });
    }
});

// GET /api/v1/song-requests/:requestId - Get a specific request
router.get('/:requestId', auth, async (req, res) => {
    try {
        const request = await req.app.locals.models.SongRequest
            .findOne({
                _id: req.params.requestId,
                requested_by: req.user._id
            })
            .lean();

        if (!request) {
            return res.status(404).json({
                error: 'Song request not found'
            });
        }

        res.json(request);
    } catch (error) {
        console.error('Get song request error:', error);
        res.status(500).json({ error: error.message });
    }
});

// DELETE /api/v1/song-requests/:requestId - Cancel a pending request
router.delete('/:requestId', auth, async (req, res) => {
    try {
        const request = await req.app.locals.models.SongRequest
            .findOne({
                _id: req.params.requestId,
                requested_by: req.user._id,
                status: 'pending'
            });

        if (!request) {
            return res.status(404).json({
                error: 'Pending song request not found'
            });
        }

        await request.deleteOne();

        res.json({
            message: 'Song request cancelled successfully'
        });
    } catch (error) {
        console.error('Delete song request error:', error);
        res.status(500).json({ error: error.message });
    }
});

module.exports = router; 