const mongoose = require('mongoose');

const songSchema = new mongoose.Schema({
    track_id: { type: String, required: true },
    source: { type: String, enum: ['spotify', 'youtube'], required: true },
    spotify_id: { type: String },
    youtube_id: { type: String },
    title: { type: String, required: true },
    artists: [{ type: String }],
    album: { type: String },
    release_date: { type: String },
    duration_ms: { type: Number },
    explicit: { type: Boolean },
    isrc: { type: String },
    spotify_url: { type: String },
    youtube_url: { type: String },
    preview_url: { type: String },
    added_at: { type: Date },
    popularity: { type: Number },
    album_art: { type: String },
    genres: [{ type: String }],
    tempo: { type: Number },
    key: { type: String },
    loudness: { type: Number },
    spectral_centroid: { type: Number },
    sample_rate: { type: Number },
    audio_format: { type: String },
    
    rating: { 
        type: Number, 
        default: 1500,
        index: true
    },
    total_plays: { 
        type: Number, 
        default: 0 
    },
    skip_count: { 
        type: Number, 
        default: 0 
    },
    playlist_adds: { 
        type: Number, 
        default: 0 
    },
    download_count: { 
        type: Number, 
        default: 0 
    },
    rating_confidence: { 
        type: Number, 
        default: 0 
    }
}, {
    timestamps: {
        createdAt: 'created_at',
        updatedAt: 'updated_at'
    },
    collection: 'songs'
});

// Create indexes after schema definition
songSchema.index({ track_id: 1 }, { unique: true });
songSchema.index({ added_at: -1 });
songSchema.index({ popularity: -1 });
songSchema.index({ title: 1 });
songSchema.index({ artists: 1 });
songSchema.index({ rating: -1 });
songSchema.index({ source: 1, youtube_id: 1 });
songSchema.index({ source: 1, spotify_id: 1 });

const Song = mongoose.model('Song', songSchema);
module.exports = { Song, songSchema };
