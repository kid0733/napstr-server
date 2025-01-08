const mongoose = require('mongoose');

const userPlayHistorySchema = new mongoose.Schema({
    userId: { 
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true 
    },
    yearMonth: { 
        type: String,
        required: true 
    },
    plays: [{
        songId: String,
        playedAt: Date,
        duration: Number,
        completionRate: Number,
        skipped: Boolean,
        context: {
            source: String,
            sourceId: String
        }
    }]
}, { 
    timestamps: true 
});

userPlayHistorySchema.index({ userId: 1, yearMonth: -1 });

module.exports = mongoose.model('UserPlayHistory', userPlayHistorySchema);
