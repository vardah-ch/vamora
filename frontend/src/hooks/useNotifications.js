import { useState, useEffect, useCallback, useRef } from 'react';
import api from '../services/api';

const POLL_INTERVAL_MS = 30_000;
const SOUND_SRC = '/sounds/alert.mp3';

// ─── Audio singleton ──────────────────────────────────────────────────────────
// One Audio element shared across all hook instances.
// Browsers block playback until the user has interacted with the page.
// We listen for the first click/keydown and do a silent play-then-pause
// to satisfy the browser's user-gesture requirement.
const alertAudio = new Audio(SOUND_SRC);
alertAudio.preload = 'auto';
let audioUnlocked = false;

function unlockAudio() {
  if (audioUnlocked) return;
  alertAudio.volume = 0;
  alertAudio.play()
    .then(() => {
      alertAudio.pause();
      alertAudio.currentTime = 0;
      alertAudio.volume = 1;
      audioUnlocked = true;
      // Remove listeners — audio is permanently unlocked for this session
      document.removeEventListener('click',   unlockAudio);
      document.removeEventListener('keydown', unlockAudio);
    })
    .catch(() => {
      // Still blocked — try again on the next interaction
    });
}

// Attach once at module load; cleaned up automatically after first success
document.addEventListener('click',   unlockAudio);
document.addEventListener('keydown', unlockAudio);

// ─── Helper: play alert sound ─────────────────────────────────────────────────
function playAlertSound() {
  if (!audioUnlocked) return; // respect the browser's autoplay policy
  alertAudio.currentTime = 0;
  alertAudio.play().catch(() => {
    // Some browsers revoke permission mid-session — fail silently
  });
}

// ─── Helper: fire a browser system notification ───────────────────────────────
function showBrowserPopup(notification) {
  if (!('Notification' in window)) return;
  if (Notification.permission !== 'granted') return;

  new Notification('Vamora', {
    body:  notification.message,
    icon:  '/favicon.ico',
    // 'tag' deduplicates: a second notification with the same tag replaces the first
    // rather than stacking duplicate pop-ups
    tag:   notification.id,
    // Keep it on-screen until the user dismisses it
    requireInteraction: false,
  });
}

// ─── Exported permission helper ───────────────────────────────────────────────
// Call this on login or from a "Enable notifications" button.
// Returns 'granted' | 'denied' | 'default' | 'unsupported'.
export async function requestNotificationPermission() {
  if (!('Notification' in window)) return 'unsupported';
  if (Notification.permission === 'granted') return 'granted';
  if (Notification.permission === 'denied')  return 'denied';
  return Notification.requestPermission();
}

// ─── Hook ─────────────────────────────────────────────────────────────────────
export function useNotifications() {
  const [notifications, setNotifications] = useState([]);
  const [unreadCount,   setUnreadCount]   = useState(0);
  const [loading,       setLoading]       = useState(false);

  // null = first fetch hasn't completed yet (we don't alert on initial load)
  // Set<string> = IDs seen in the previous successful poll
  const prevIdsRef = useRef(null);

  const fetchNotifications = useCallback(async () => {
    try {
      setLoading(true);
      const { data } = await api.get('/notifications');
      const incoming = data.data.notifications;

      if (prevIdsRef.current !== null) {
        // Diff: anything whose ID wasn't in the previous batch is genuinely new
        const newItems = incoming.filter(n => !prevIdsRef.current.has(n.id));

        if (newItems.length > 0) {
          playAlertSound();
          newItems.forEach(showBrowserPopup);
        }
      }

      // Update the ref for the next comparison
      prevIdsRef.current = new Set(incoming.map(n => n.id));

      setNotifications(incoming);
      setUnreadCount(data.data.unreadCount);
    } catch {
      // Non-critical — fail silently so a 401 on logout doesn't surface here
    } finally {
      setLoading(false);
    }
  }, []);

  const markRead = useCallback(async (id) => {
    try {
      await api.patch(`/notifications/${id}/read`);
      setNotifications(prev =>
        prev.map(n => (n.id === id ? { ...n, isRead: true } : n))
      );
      setUnreadCount(prev => Math.max(0, prev - 1));
    } catch (err) {
      console.error('Failed to mark notification read:', err);
    }
  }, []);

  const markAllRead = useCallback(async () => {
    try {
      await api.patch('/notifications/read-all');
      setNotifications(prev => prev.map(n => ({ ...n, isRead: true })));
      setUnreadCount(0);
    } catch (err) {
      console.error('Failed to mark all notifications read:', err);
    }
  }, []);

  useEffect(() => {
    fetchNotifications();
    const id = setInterval(fetchNotifications, POLL_INTERVAL_MS);
    return () => clearInterval(id);
  }, [fetchNotifications]);

  return {
    notifications,
    unreadCount,
    loading,
    markRead,
    markAllRead,
    refresh: fetchNotifications,
  };
}
