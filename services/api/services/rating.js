const calculateRatingChange = (currentRating, confidence, event) => {
    // Chess ELO uses K-factor based on rating and number of games
    let K;
    if (confidence < 30) {
        K = 32; // New songs get bigger adjustments
    } else if (currentRating > 2100) {
        K = 16; // High rated songs change slower
    } else if (confidence > 100) {
        K = 24; // Established songs
    } else {
        K = 32; // Default
    }

    // Expected score based on rating difference with baseline
    const baselineRating = 1500;
    const expectedScore = 1 / (1 + Math.pow(10, (baselineRating - currentRating) / 400));

    // Actual score based on event
    let actualScore;
    switch(event) {
        case 'play':
            actualScore = 0.6;  // Better than neutral
            break;
        case 'skip':
            actualScore = 0.2;  // Worse than neutral
            break;
        case 'download':
            actualScore = 0.8;  // Best outcome
            break;
        default:
            actualScore = 0.5;  // Neutral
    }

    return K * (actualScore - expectedScore);
};

module.exports = {
    calculateRatingChange
};
