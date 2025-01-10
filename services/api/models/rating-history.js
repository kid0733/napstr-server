const mongoose = require('mongoose');

const ratingHistorySchema = new mongoose.Schema({
    track_id: { 
        type: String, 
        required: true,
        index: true
    },
    old_rating: { 
        type: Number, 
        required: true 
    },
    new_rating: { 
        type: Number, 
        required: true 
    },
    event_type: { 
        type: String, 
        required: true,
        enum: ['play', 'skip', 'download']
    },
    rating_change: { 
        type: Number, 
        required: true 
    },
    confidence: { 
        type: Number, 
        required: true 
    }
}, {
    timestamps: {
        createdAt: 'created_at',
        updatedAt: 'updated_at'
    }
});

// Add compound index for better query performance
ratingHistorySchema.index({ track_id: 1, created_at: -1 });

const RatingHistory = mongoose.model('RatingHistory', ratingHistorySchema);
module.exports = RatingHistory;
