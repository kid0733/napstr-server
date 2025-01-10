const mongoose = require('mongoose');

const songRequestSchema = new mongoose.Schema({
    source: {
        type: String,
        enum: ['spotify', 'youtube'],
        required: true
    },
    url: {
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

// Validate URL format based on source
songRequestSchema.path('url').validate(function(url) {
    if (this.source === 'spotify') {
        return url.startsWith('https://open.spotify.com/') || 
               url.startsWith('spotify:');
    } else if (this.source === 'youtube') {
        return url.startsWith('https://www.youtube.com/watch?v=') ||
               url.startsWith('https://youtu.be/') ||
               url.startsWith('https://youtube.com/watch?v=');
    }
    return false;
}, 'Invalid URL format');

// Extract type from URL
songRequestSchema.pre('save', function(next) {
    const url = this.url;
    if (this.source === 'spotify') {
        if (url.includes('/track/') || url.includes(':track:')) {
            this.type = 'track';
        } else if (url.includes('/album/') || url.includes(':album:')) {
            this.type = 'album';
        } else if (url.includes('/playlist/') || url.includes(':playlist:')) {
            this.type = 'playlist';
        }
    } else if (this.source === 'youtube') {
        // YouTube URLs are always treated as tracks
        this.type = 'track';
    }
    next();
});

const SongRequest = mongoose.model('SongRequest', songRequestSchema);

module.exports = { SongRequest, songRequestSchema }; 