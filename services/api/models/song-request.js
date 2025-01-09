const mongoose = require('mongoose');

const songRequestSchema = new mongoose.Schema({
    spotify_url: {
        type: String,
        required: true,
        unique: true
    },
    type: {
        type: String,
        enum: ['track', 'album', 'playlist'],
        required: true
    },
    status: {
        type: String,
        enum: ['pending', 'processing', 'completed', 'failed'],
        default: 'pending'
    },
    requested_by: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    requested_at: {
        type: Date,
        default: Date.now
    },
    processed_at: Date,
    error: String
});

// Validate Spotify URL format
songRequestSchema.path('spotify_url').validate(function(url) {
    return url.startsWith('https://open.spotify.com/') || 
           url.startsWith('spotify:');
}, 'Invalid Spotify URL format');

// Extract type from URL
songRequestSchema.pre('save', function(next) {
    const url = this.spotify_url;
    if (url.includes('/track/') || url.includes(':track:')) {
        this.type = 'track';
    } else if (url.includes('/album/') || url.includes(':album:')) {
        this.type = 'album';
    } else if (url.includes('/playlist/') || url.includes(':playlist:')) {
        this.type = 'playlist';
    }
    next();
});

const SongRequest = mongoose.model('SongRequest', songRequestSchema);

module.exports = { SongRequest, songRequestSchema }; 