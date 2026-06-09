import { useState, useRef, useEffect } from 'react';
import { useNotifications } from '../hooks/useNotifications';
import './NotificationBell.css';

const TYPE_ICON = {
  medication_assigned: '💊',
  checkup_added:       '📋',
  checkup_reminder:    '⏰',
  mood_alert:          '💛',
};

function formatTime(iso) {
  return new Date(iso).toLocaleString('en-US', {
    month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

export default function NotificationBell() {
  const { notifications, unreadCount, markRead, markAllRead } = useNotifications();
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(e) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div className="nb-wrapper" ref={wrapperRef}>
      <button
        className="nb-btn"
        onClick={() => setOpen(v => !v)}
        aria-label="Notifications"
        aria-expanded={open}
      >
        🔔
        {unreadCount > 0 && (
          <span className="nb-badge">{unreadCount > 9 ? '9+' : unreadCount}</span>
        )}
      </button>

      {open && (
        <div className="nb-dropdown">
          <div className="nb-header">
            <span className="nb-title">Notifications</span>
            {unreadCount > 0 && (
              <button className="nb-mark-all" onClick={markAllRead}>
                Mark all read
              </button>
            )}
          </div>

          {notifications.length === 0 ? (
            <p className="nb-empty">You're all caught up!</p>
          ) : (
            <ul className="nb-list">
              {notifications.map(n => (
                <li
                  key={n.id}
                  className={`nb-item ${n.isRead ? 'nb-item--read' : 'nb-item--unread'}`}
                  onClick={() => !n.isRead && markRead(n.id)}
                >
                  <span className="nb-icon">{TYPE_ICON[n.type] || '🔔'}</span>
                  <div className="nb-body">
                    <p className="nb-msg">{n.message}</p>
                    <p className="nb-time">{formatTime(n.createdAt)}</p>
                  </div>
                  {!n.isRead && <span className="nb-dot" aria-label="Unread" />}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
