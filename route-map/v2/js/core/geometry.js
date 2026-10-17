/**
 * geometry.js
 * Utilities for geometric calculations, specifically for Octilinear (45-degree) routing.
 */

export const Geometry = {
    /**
     * Calculates an octilinear path (Horizontal, Vertical, Diagonal) between two points.
     * @param {L.Point} p1 Start point (pixel coordinates)
     * @param {L.Point} p2 End point (pixel coordinates)
     * @returns {L.Point[]} Array of points including start, intermediate turns, and end.
     */
    getOctilinearPath(p1, p2) {
        const dx = p2.x - p1.x;
        const dy = p2.y - p1.y;
        const absDx = Math.abs(dx);
        const absDy = Math.abs(dy);

        // If already aligned (0, 90, 45 degrees), return direct line
        // Allow a small epsilon for floating point errors
        if (absDx < 1 || absDy < 1 || Math.abs(absDx - absDy) < 1) {
            return [p1, p2];
        }

        const points = [p1];

        // Strategy: Go Diagonal then Orthogonal OR Orthogonal then Diagonal
        // We prefer: Go Diagonal as much as possible from start, then finish with Orthogonal,
        // OR go Orthogonal to align diagonally.

        // Simple heuristics:
        // Case 1: absDx > absDy (Landscape-ish)
        // We can go diagonal for 'absDy' distance, then horizontal for the rest.
        // OR go horizontal, then diagonal.

        // Let's try: Move diagonally until Y aligns, or X aligns.

        const signX = dx > 0 ? 1 : -1;
        const signY = dy > 0 ? 1 : -1;

        // Calculate the diagonal distance we can cover
        const minDiff = Math.min(absDx, absDy);

        // Intermediate point 1: Move diagonally
        const pMid = {
            x: p1.x + minDiff * signX,
            y: p1.y + minDiff * signY
        };

        points.push(pMid);

        // From pMid to p2, it should be a straight orthogonal line
        // (Just verification, pushing p2 does this effectively)

        points.push(p2);

        return points;
    }

    // Future expansion: "Snap" logic for dragging
};
