// Read-only star display for a rating, e.g. 2 -> ★★☆☆☆. Used wherever a
// saved rating is shown (book detail, recommendations) and as the label
// of each option in the rating form, so a rating always looks the same.

// Takes a rating from 1 to 5. Renders it as plain-text stars - no
// star-rating library.
export default function Stars({ rating }) {
  return <>{"★".repeat(rating) + "☆".repeat(5 - rating)}</>;
}
