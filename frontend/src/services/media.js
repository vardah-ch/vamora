// Media URLs come from the API as short-lived, signed, relative paths
// (/api/v1/media/...). Resolve them against the API origin.
const API = import.meta.env.VITE_API_URL || 'http://localhost:5000/api/v1';
export const API_ORIGIN = new URL(API, window.location.origin).origin;

export function mediaUrl(url) {
  if (!url) return null;
  return /^https?:\/\//.test(url) ? url : `${API_ORIGIN}${url}`;
}
