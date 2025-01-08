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
        required: true,
        index: true  // Explicit index
    },
    isPublic: { 
        type: Boolean, 
        default: true,
        index: true  // Explicit index
    },
    songs: [{
        songId: {
            type: String,
            required: true,
            index: true  // Explicit index
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
            ref: 'User',
            index: true  // Explicit index
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
    timestamps: true,
    collection: 'playlists',  // Explicit collection name
    bufferTimeoutMS: 30000    // Increase timeout for operations
});

// Compound indexes for better query performance
playlistSchema.index({ owner: 1, createdAt: -1 });
playlistSchema.index({ 'collaborators.userId': 1, createdAt: -1 });
playlistSchema.index({ isPublic: 1, createdAt: -1 });

playlistSchema.methods.canEdit = function(userId) {
    if (!userId) return false;
    return (
        this.owner.equals(userId) ||
        this.collaborators.some(c => 
            c.userId.equals(userId) && c.role === 'editor'
        )
    );
};

playlistSchema.methods.canView = function(userId) {
    if (!userId) return this.isPublic;
    return (
        this.isPublic ||
        this.owner.equals(userId) ||
        this.collaborators.some(c => c.userId.equals(userId))
    );
};

// Don't export the model directly
module.exports = { playlistSchema };
