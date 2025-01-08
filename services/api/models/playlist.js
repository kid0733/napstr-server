const mongoose = require('mongoose');

const playlistSchema = new mongoose.Schema({
    name: { 
        type: String, 
        required: true,
        trim: true,
        maxLength: 100
    },
    description: {
        type: String,
        trim: true,
        maxLength: 500
    },
    owner: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    isPublic: { 
        type: Boolean, 
        default: true 
    },
    songs: [{
        songId: {
            type: String,
            required: true
        },
        addedAt: { 
            type: Date, 
            default: Date.now 
        },
        addedBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            required: true
        }
    }],
    collaborators: [{
        userId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User'
        },
        role: {
            type: String,
            enum: ['editor', 'viewer'],
            default: 'viewer'
        }
    }],
    totalDuration: {
        type: Number,
        default: 0
    },
    coverImage: String
}, { 
    timestamps: true 
});

playlistSchema.index({ owner: 1 });
playlistSchema.index({ 'collaborators.userId': 1 });
playlistSchema.index({ isPublic: 1 });
playlistSchema.index({ 'songs.songId': 1 });

playlistSchema.methods.canEdit = function(userId) {
    return (
        this.owner.equals(userId) ||
        this.collaborators.some(c => 
            c.userId.equals(userId) && c.role === 'editor'
        )
    );
};

playlistSchema.methods.canView = function(userId) {
    return (
        this.isPublic ||
        this.owner.equals(userId) ||
        this.collaborators.some(c => c.userId.equals(userId))
    );
};

module.exports = mongoose.model('Playlist', playlistSchema);
