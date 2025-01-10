const mongoose = require('mongoose');

const playHistorySchema = new mongoose.Schema({
    track_id: {
        type: String,
        required: true,
        index: true
    },
    event_type: {
        type: String,
        enum: ['play', 'skip', 'pause', 'resume'],
        required: true
    },
    timestamp: {
        type: Date,
        default: Date.now,
        index: true
    },
    duration_ms: {
        type: Number,
        required: function() { return this.event_type === 'play'; }
    },
    position_ms: {
        type: Number,
        required: true
    },
    completed: {
        type: Boolean,
        required: function() { return this.event_type === 'play'; }
    },
    previous_track_id: {
        type: String,
        required: function() { return this.event_type === 'skip'; }
    }
}, {
    timestamps: true
});

// Create compound indexes for efficient querying
playHistorySchema.index({ track_id: 1, event_type: 1, timestamp: -1 });
playHistorySchema.index({ track_id: 1, timestamp: -1 });

// Virtual for calculating completion percentage
playHistorySchema.virtual('completion_percentage').get(function() {
    if (this.event_type !== 'play' || !this.duration_ms) return null;
    return (this.position_ms / this.duration_ms) * 100;
});

module.exports = {
    playHistorySchema,
    PlayHistory: mongoose.model('PlayHistory', playHistorySchema)
}; 