// api/ranking.js

function rankPredictions(predictions = []) {
    return [...predictions]
        .sort((a, b) => {
            const confidenceDifference =
                Number(b.confidence || 0) -
                Number(a.confidence || 0);

            if (confidenceDifference !== 0) {
                return confidenceDifference;
            }

            return (
                Number(b.probability || 0) -
                Number(a.probability || 0)
            );
        })
        .map((prediction, index) => ({
            ...prediction,
            rank: index + 1
        }));
}

function getTopPredictions(predictions = [], maximum = 50) {
    return rankPredictions(predictions).slice(0, maximum);
}

module.exports = {
    rankPredictions,
    getTopPredictions
};
