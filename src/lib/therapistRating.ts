/**
 * Merge therapists.rating / therapists.review_count (seed, set by admin)
 * with real customer reviews loaded from the `reviews` table via
 * BookingsContext (`getReviewsForTherapist`).
 *
 * Formula matches TherapistDetailScreen exactly so list cards and the
 * public detail page always agree on the displayed values.
 */
export type TherapistRatingSeed = { rating: number; reviewCount: number };
export type RealReview = { rating: number };

export function getMergedTherapistRating(
  seed: TherapistRatingSeed,
  realReviews: readonly RealReview[],
): { rating: number; reviewCount: number } {
  const realCount = realReviews.length;
  const totalReviewCount = seed.reviewCount + realCount;
  if (totalReviewCount <= 0) {
    return { rating: seed.rating, reviewCount: 0 };
  }
  const realRatingSum = realReviews.reduce((s, r) => s + r.rating, 0);
  const baseRatingSum = seed.rating * seed.reviewCount;
  return {
    rating: (baseRatingSum + realRatingSum) / totalReviewCount,
    reviewCount: totalReviewCount,
  };
}
