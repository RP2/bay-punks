/**
 * Client-side date utilities for real-time date-based filtering
 */

/**
 * Gets today's date in YYYY-MM-DD format based on local timezone
 * This is the core function used by all components to determine
 * the current date for filtering shows.
 *
 * @returns {string} Today's date in YYYY-MM-DD format
 */
export function getTodayISOString(): string {
  const today = new Date();
  return (
    today.getFullYear() +
    "-" +
    String(today.getMonth() + 1).padStart(2, "0") +
    "-" +
    String(today.getDate()).padStart(2, "0")
  );
}
