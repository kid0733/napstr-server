const mongoose = require('mongoose');

const playStatsSchema = new mongoose.Schema({
    track_id: {
        type: String,
        required: true,
        unique: true,
        index: true
    },
    play_count: {
        type: Number,
        default: 0
    },
    skip_count: {
        type: Number,
        default: 0
    },
    pause_count: {
        type: Number,
        default: 0
    },
    total_play_time_ms: {
        type: Number,
        default: 0
    },
    completion_rate: {
        type: Number,
        default: 0  // 0 to 100
    },
    avg_play_duration_ms: {
        type: Number,
        default: 0
    },
    last_played: {
        type: Date,
        default: null
    },
    // Weekly stats
    weekly_plays: {
        type: Number,
        default: 0
    },
    weekly_skips: {
        type: Number,
        default: 0
    },
    weekly_play_time_ms: {
        type: Number,
        default: 0
    },
    // Monthly stats
    monthly_plays: {
        type: Number,
        default: 0
    },
    monthly_skips: {
        type: Number,
        default: 0
    },
    monthly_play_time_ms: {
        type: Number,
        default: 0
    }
}, {
    timestamps: true
});

// Method to update stats based on a play event
playStatsSchema.methods.updateWithPlayEvent = async function(event) {
    this.play_count += 1;
    this.total_play_time_ms += event.duration_ms;
    this.last_played = event.timestamp;
    
    // Update completion rate
    const oldCompletionTotal = this.completion_rate * (this.play_count - 1);
    const newCompletionRate = (event.completed ? 100 : (event.position_ms / event.duration_ms) * 100);
    this.completion_rate = (oldCompletionTotal + newCompletionRate) / this.play_count;
    
    // Update average play duration
    const oldDurationTotal = this.avg_play_duration_ms * (this.play_count - 1);
    this.avg_play_duration_ms = (oldDurationTotal + event.duration_ms) / this.play_count;
    
    // Update periodic stats
    const now = new Date();
    if (event.timestamp > new Date(now - 7 * 24 * 60 * 60 * 1000)) {
        this.weekly_plays += 1;
        this.weekly_play_time_ms += event.duration_ms;
    }
    if (event.timestamp > new Date(now - 30 * 24 * 60 * 60 * 1000)) {
        this.monthly_plays += 1;
        this.monthly_play_time_ms += event.duration_ms;
    }
    
    await this.save();
};

// Method to update stats based on a skip event
playStatsSchema.methods.updateWithSkipEvent = async function(event) {
    this.skip_count += 1;
    
    // Update periodic stats
    const now = new Date();
    if (event.timestamp > new Date(now - 7 * 24 * 60 * 60 * 1000)) {
        this.weekly_skips += 1;
    }
    if (event.timestamp > new Date(now - 30 * 24 * 60 * 60 * 1000)) {
        this.monthly_skips += 1;
    }
    
    await this.save();
};

module.exports = {
    playStatsSchema,
    PlayStats: mongoose.model('PlayStats', playStatsSchema)
}; 