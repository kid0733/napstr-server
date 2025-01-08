const mongoose = require('mongoose');

const chatMessageSchema = new mongoose.Schema({
    roomId: {
        type: String,
        required: true,
        index: true
    },
    senderId: {
        type: String,
        required: true,
        index: true
    },
    content: {
        type: String,
        required: true
    },
    type: {
        type: String,
        enum: ['text', 'song'],
        default: 'text'
    },
    songId: String,
    timestamp: {
        type: Date,
        default: Date.now,
        index: true
    }
});

module.exports = { chatMessageSchema };
