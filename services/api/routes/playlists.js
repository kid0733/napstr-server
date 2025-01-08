const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const { body, validationResult } = require('express-validator');
const Playlist = require('../models/playlist');
const User = require('../models/user');

// Create playlist
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

        const playlist = new Playlist({
            ...req.body,
            owner: req.user._id
        });

        await playlist.save();
        await User.findByIdAndUpdate(req.user._id, {
            $push: { playlists: playlist._id }
        });

        res.status(201).json(playlist);
    } catch (error) {
        console.error('Create playlist error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Get user's playlists
router.get('/', auth, async (req, res) => {
    try {
        const playlists = await Playlist.find({
            $or: [
                { owner: req.user._id },
                { 'collaborators.userId': req.user._id }
            ]
        }).populate('owner', 'username profile.displayName');

        res.json(playlists);
    } catch (error) {
        console.error('Get playlists error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Get specific playlist
router.get('/:id', auth, async (req, res) => {
    try {
        const playlist = await Playlist.findById(req.params.id)
            .populate('owner', 'username profile.displayName')
            .populate('collaborators.userId', 'username profile.displayName');

        if (!playlist) {
            return res.status(404).json({ error: 'Playlist not found' });
        }

        if (!playlist.canView(req.user._id)) {
            return res.status(403).json({ error: 'Not authorized' });
        }

        res.json(playlist);
    } catch (error) {
        console.error('Get playlist error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Add song to playlist
router.post('/:id/songs', auth, async (req, res) => {
    try {
        const { songId } = req.body;
        const playlist = await Playlist.findById(req.params.id);

        if (!playlist) {
            return res.status(404).json({ error: 'Playlist not found' });
        }

        if (!playlist.canEdit(req.user._id)) {
            return res.status(403).json({ error: 'Not authorized' });
        }

        playlist.songs.push({
            songId,
            addedBy: req.user._id
        });

        await playlist.save();
        res.json(playlist);
    } catch (error) {
        console.error('Add song error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Remove song from playlist
router.delete('/:id/songs/:songId', auth, async (req, res) => {
    try {
        const playlist = await Playlist.findById(req.params.id);

        if (!playlist) {
            return res.status(404).json({ error: 'Playlist not found' });
        }

        if (!playlist.canEdit(req.user._id)) {
            return res.status(403).json({ error: 'Not authorized' });
        }

        playlist.songs = playlist.songs.filter(song => song.songId !== req.params.songId);
        await playlist.save();
        res.json(playlist);
    } catch (error) {
        console.error('Remove song error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Add collaborator
router.post('/:id/collaborators', auth, async (req, res) => {
    try {
        const { userId, role = 'viewer' } = req.body;
        const playlist = await Playlist.findById(req.params.id);

        if (!playlist) {
            return res.status(404).json({ error: 'Playlist not found' });
        }

        if (!playlist.owner.equals(req.user._id)) {
            return res.status(403).json({ error: 'Only owner can add collaborators' });
        }

        playlist.collaborators.push({ userId, role });
        await playlist.save();

        await User.findByIdAndUpdate(userId, {
            $push: { 
                sharedPlaylists: {
                    playlist: playlist._id,
                    role
                }
            }
        });

        const populatedPlaylist = await playlist
            .populate('collaborators.userId', 'username profile.displayName');
        res.json(populatedPlaylist);
    } catch (error) {
        console.error('Add collaborator error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Remove collaborator
router.delete('/:id/collaborators/:userId', auth, async (req, res) => {
    try {
        const playlist = await Playlist.findById(req.params.id);

        if (!playlist) {
            return res.status(404).json({ error: 'Playlist not found' });
        }

        if (!playlist.owner.equals(req.user._id)) {
            return res.status(403).json({ error: 'Only owner can remove collaborators' });
        }

        playlist.collaborators = playlist.collaborators.filter(
            c => !c.userId.equals(req.params.userId)
        );
        await playlist.save();

        await User.findByIdAndUpdate(req.params.userId, {
            $pull: { 
                sharedPlaylists: {
                    playlist: playlist._id
                }
            }
        });

        res.json(playlist);
    } catch (error) {
        console.error('Remove collaborator error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Delete playlist
router.delete('/:id', auth, async (req, res) => {
    try {
        const playlist = await Playlist.findById(req.params.id);

        if (!playlist) {
            return res.status(404).json({ error: 'Playlist not found' });
        }

        if (!playlist.owner.equals(req.user._id)) {
            return res.status(403).json({ error: 'Not authorized' });
        }

        await User.findByIdAndUpdate(playlist.owner, {
            $pull: { playlists: playlist._id }
        });

        await User.updateMany(
            { 'sharedPlaylists.playlist': playlist._id },
            { $pull: { sharedPlaylists: { playlist: playlist._id } } }
        );

        await playlist.remove();
        res.json({ message: 'Playlist deleted' });
    } catch (error) {
        console.error('Delete playlist error:', error);
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;
