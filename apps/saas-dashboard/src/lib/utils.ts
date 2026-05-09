export function toErrorMessage(err: unknown): string {
  if (err instanceof Error) {
    if (err.message === 'Failed to fetch') {
      return 'Unable to connect to FlashEngine API. Check your connection.';
    }
    return err.message;
  }
  return 'An unexpected error occurred.';
}

export function relativeTime(date: string | Date): string {
  const seconds = Math.floor((Date.now() - new Date(date).getTime()) / 1000);

  if (seconds < 60)   return 'just now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)} minutes ago`;
  if (seconds < 86400) {
    const h = Math.floor(seconds / 3600);
    return `${h} ${h === 1 ? 'hour' : 'hours'} ago`;
  }
  const d = Math.floor(seconds / 86400);
  if (d < 30) return `${d} ${d === 1 ? 'day' : 'days'} ago`;
  const m = Math.floor(d / 30);
  return `${m} ${m === 1 ? 'month' : 'months'} ago`;
}
