import { useCallback, useEffect, useState } from 'react';
import { History, RefreshCw, ShieldAlert } from 'lucide-react';
import api from '../../services/api';

/**
 * Security audit trail for administrators (GET /super-admin/audit).
 * Metadata only: who did what kind of action on which record id, when, and the
 * outcome. Administrators never see the content of photos, notes or chats.
 * The log is append-only in the database (a trigger blocks UPDATE/DELETE).
 */
const OUTCOMES = [
  { key: '', label: 'All events' },
  { key: 'denied', label: 'Denied only' },
  { key: 'error', label: 'Errors' }
];

const fmt = (d) => new Date(d).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
const pretty = (a) => String(a || '').replace(/[._]/g, ' ');

export default function AuditLogPanel() {
  const [outcome, setOutcome] = useState('');
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const { data } = await api.get('/super-admin/audit', { params: { limit: 200, ...(outcome ? { outcome } : {}) } });
      setEvents(Array.isArray(data) ? data : []);
    } catch (e) {
      setError(e.response?.data?.message || 'Could not load the audit log.');
    } finally { setLoading(false); }
  }, [outcome]);

  useEffect(() => { load(); }, [load]);

  const denied = events.filter(e => e.outcome === 'denied').length;

  return (
    <div className="sa-section">
      <div className="sa-section-header">
        <h2 className="sa-section-title"><History size={22} /> Access audit log</h2>
        <button type="button" className="sa-refresh" onClick={load} disabled={loading}>
          <RefreshCw size={16} /> {loading ? 'Loading…' : 'Refresh'}
        </button>
      </div>
      <p className="sa-hint">
        Every view of a patient’s photos, voice notes, records and every change of sharing is recorded here.
        Entries cannot be edited or deleted. Content is never shown, only what kind of record was opened.
      </p>

      <div className="sa-chipbar" role="radiogroup" aria-label="Filter by outcome">
        {OUTCOMES.map(o => (
          <button key={o.key || 'all'} type="button" role="radio" aria-checked={outcome === o.key}
            className={`sa-chip${outcome === o.key ? ' sa-chip--on' : ''}`} onClick={() => setOutcome(o.key)}>
            {o.label}
          </button>
        ))}
        {!outcome && denied > 0 && (
          <span className="sa-denied-note"><ShieldAlert size={16} /> {denied} denied attempt{denied === 1 ? '' : 's'} in this view</span>
        )}
      </div>

      {error && <div className="sa-alert sa-alert--error">{error}</div>}

      <div className="sa-table-wrap">
        <table className="sa-table">
          <thead>
            <tr><th>When</th><th>Who</th><th>Action</th><th>Record</th><th>Patient</th><th>Basis</th><th>Outcome</th></tr>
          </thead>
          <tbody>
            {!loading && events.length === 0 ? (
              <tr><td colSpan={7} className="sa-empty">No events for this filter.</td></tr>
            ) : events.map(e => (
              <tr key={e.id}>
                <td className="sa-td-date">{fmt(e.occurredAt)}</td>
                <td>{e.actorRole ? `${pretty(e.actorRole)} #${e.actorUserId}` : 'anonymous'}</td>
                <td className="sa-td-name">{pretty(e.action)}{e.reason ? <span className="sa-sub"> · {e.reason}</span> : null}</td>
                <td>{e.resourceType ? `${pretty(e.resourceType)}${e.resourceId ? ` #${e.resourceId}` : ''}` : '—'}</td>
                <td>{e.patientUserId ? `#${e.patientUserId}` : '—'}</td>
                <td>{e.accessBasis ? pretty(e.accessBasis) : '—'}</td>
                <td><span className={`sa-outcome sa-outcome--${e.outcome}`}>{e.outcome}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
