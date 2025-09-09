/**
 * Safe date formatting utilities that work consistently in SSR
 */

/**
 * Format date to Korean locale string in a consistent way
 * Uses explicit formatting to avoid browser/server differences
 */
export function formatDateKorean(dateString: string): string {
  const date = new Date(dateString);

  // Use explicit formatting to ensure consistency
  const year = date.getFullYear();
  const month = date.getMonth() + 1;
  const day = date.getDate();

  return `${year}년 ${month}월 ${day}일`;
}
