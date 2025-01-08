const mongoose = require('mongoose');

const cachedSongSchema = new mongoose.Schema({
    songId: { 
        type: String, 
        required: true, 
        unique: true 
    },
    title: String,
    artist: String,
    thumbnail: String,
    lastAccessed: { 
        type: Date, 
        default: Date.now 
    },
    accessCount: { 
        type: Number, 
        default: 0 
    }
}, { 
    timestamps: true 
});

// Auto-delete cache entries not accessed in 30 days
cachedSongSchema.index({ lastAccessed: 1 }, { 
    expireAfterSeconds: 30 * 24 * 60 * 60 
});

module.exports = mongoose.model('CachedSong', cachedSongSchema);
