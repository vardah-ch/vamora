import { useEffect, useState } from 'react';
import { Users, Scale, ClipboardList, Info, BadgeCheck } from 'lucide-react';
import api from '../../services/api';
import './CareTeamConsent.css';

/**
 * Clinician view of a patient's care team, consent mode and a
 * non-diagnostic summary of recent caregiver observations.
 * APIs: GET /doctor/patients/:id (careTeam, consentMode),
 *       PUT /doctor/patients/:id/consent-mode,
 *       GET /doctor/patients/:id/observation-summary
 */
const PERM_LABELS = {
  'memories.view': 'Photos & memories', 'memories.upload': 'Add memories', 'memories.delete': 'Remove memories',
  'voice.view': 'Voice recordings', 'voice.upload': 'Add voice', 'mood.view': 'Mood',
  'observations.view': 'Read observations', 'observations.create': 'Write observations',
  'clinical.view': 'Clinical record', 'clinical.manage': 'Edit clinical record',
  'alerts.receive': 'Alerts', 'ai.history.view': 'Cara conversations', 'consent.manage': 'Sharing decisions'
};

const MODES = [
  { key: 'self', title: 'Self', text: 'The person makes their own sharing decisions.' },
  { key: 'supported', title: 'Supported', text: 'The person decides, with help from family or the care team.' },
  { key: 'representative', title: 'Representative', text: 'A legally authorised representative decides with the person. Requires documented authority.' }
];

export default function CareTeamConsent({ patientId, details, onSaved }) {
  const team = details?.careTeam || [];
  const [mode, setMode] = useState(details?.patient?.consentMode || 'self');
  const [repEmail, setRepEmail] = useState('');
  const [basis, setBasis] = useState('');
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState(null);
  const [summary, setSummary] = useState(null);
  const [summaryState, setSummaryState] = useState('loading');

  useEffect(() => { setMode(details?.patient?.consentMode || 'self'); }, [details?.patient?.consentMode]);

  useEffect(() => {
    let live = true;
    setSummaryState('loading');
    api.get(`/doctor/patients/${patientId}/observation-summary`, { params: { days: 30 } })
      .then(({ data }) => { if (live) { setSummary(data.data); setSummaryState('ok'); } })
      .catch((e) => { if (live) setSummaryState(e.response?.status === 403 ? 'forbidden' : 'error'); });
    return () => { live = false; };
  }, [patientId]);

  const activeCarers = team.filter(c => c.grantStatus === 'active');

  const save = async (e) => {
    e.preventDefault();
    setSaving(true); setMsg(null);
    try {
      await api.put(`/doctor/patients/${patientId}/consent-mode`, {
        mode, basis, ...(mode === 'representative' ? { representativeEmail: repEmail } : {})
      });
      setMsg({ type: 'ok', text: 'Saved. The patient has been notified and can see this in My Privacy.' });
      setBasis('');
      onSaved?.();
    } catch (err) {
      setMsg({ type: 'err', text: err.response?.data?.message || 'Could not save the consent mode.' });
    } finally { setSaving(false); }
  };

  const digest = summary?.digest;

  return (
    <div className="ctc">
      {/* Care team */}
      <section className="doc-section">
        <div className="doc-section-header"><h2 className="doc-section-title"><Users size={20} /> Care team</h2></div>
        {team.length === 0 ? (
          <p className="ctc-muted">No caregivers on this care team yet. Use “Assign Caregiver” above to add one; the patient is told and can change what they share.</p>
        ) : (
          <ul className="ctc-team">
            {team.map(c => (
              <li key={c.userId} className="ctc-member">
                <div className="ctc-member-head">
                  <strong>{c.name || c.email || `Caregiver #${c.userId}`}</strong>
                  <span className={`ctc-pill ctc-pill--${c.grantStatus}`}>{c.grantStatus === 'pending' ? 'Waiting for patient approval' : 'Active'}</span>
                  {c.isRepresentative && <span className="ctc-pill ctc-pill--rep"><BadgeCheck size={14} /> Representative</span>}
                </div>
                {c.email && <span className="ctc-muted">{c.email}</span>}
                <div className="ctc-perms">
                  {(c.permissions || []).length === 0
                    ? <span className="ctc-muted">No permissions yet</span>
                    : c.permissions.map(p => <span key={p} className="ctc-perm">{PERM_LABELS[p] || p}</span>)}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Consent mode */}
      <section className="doc-section">
        <div className="doc-section-header"><h2 className="doc-section-title"><Scale size={20} /> How sharing decisions are made</h2></div>
        <p className="ctc-note"><Info size={15} /> Record this after discussing it with the person. Reducing sharing is always possible for the person; giving someone authority to expand it needs a documented basis.</p>
        <form onSubmit={save}>
          <div className="ctc-modes" role="radiogroup" aria-label="Consent mode">
            {MODES.map(m => (
              <label key={m.key} className={`ctc-mode${mode === m.key ? ' ctc-mode--on' : ''}`}>
                <input type="radio" name="consent-mode" value={m.key} checked={mode === m.key} onChange={() => setMode(m.key)} />
                <strong>{m.title}</strong>
                <span>{m.text}</span>
              </label>
            ))}
          </div>

          {mode === 'representative' && (
            <div className="ctc-field">
              <label htmlFor="ctc-rep">Representative (must already be on the care team)</label>
              <select id="ctc-rep" required value={repEmail} onChange={e => setRepEmail(e.target.value)}>
                <option value="">Choose a caregiver…</option>
                {activeCarers.filter(c => c.email).map(c => <option key={c.userId} value={c.email}>{c.name || c.email} · {c.email}</option>)}
              </select>
            </div>
          )}
          <div className="ctc-field">
            <label htmlFor="ctc-basis">{mode === 'representative' ? 'Basis of authority (required)' : 'Note (optional)'}</label>
            <textarea id="ctc-basis" rows={2} value={basis} onChange={e => setBasis(e.target.value)}
              required={mode === 'representative'} minLength={mode === 'representative' ? 15 : undefined}
              placeholder={mode === 'representative' ? 'e.g. Lasting power of attorney, ref. 12345, original seen 16 Nov 2026' : 'e.g. Discussed with the person and daughter at clinic visit'} />
          </div>
          {msg && <p className={`ctc-msg ctc-msg--${msg.type}`} role="status">{msg.text}</p>}
          <button type="submit" className="doc-add-btn fill-btn" disabled={saving}>{saving ? 'Saving…' : 'Save consent mode'}</button>
        </form>
      </section>

      {/* Observation summary */}
      <section className="doc-section">
        <div className="doc-section-header"><h2 className="doc-section-title"><ClipboardList size={20} /> Caregiver observations, last 30 days</h2></div>
        {summaryState === 'loading' && <p className="ctc-muted">Loading…</p>}
        {summaryState === 'forbidden' && <p className="ctc-muted">The patient has not shared care observations with you.</p>}
        {summaryState === 'error' && <p className="ctc-muted">The summary could not be loaded.</p>}
        {summaryState === 'ok' && digest && (
          <>
            <div className="ctc-stats">
              <div><strong>{digest.observationCount}</strong><span>observations</span></div>
              {Object.entries(digest.byCategory).map(([k, v]) => <div key={k}><strong>{v}</strong><span>{k}</span></div>)}
            </div>
            {Object.keys(digest.selfReportedMoodCounts || {}).length > 0 && (
              <p className="ctc-muted">Self-reported mood: {Object.entries(digest.selfReportedMoodCounts).map(([k, v]) => `${k} ${v}×`).join(' · ')}</p>
            )}
            {summary.narrative?.length > 0 && (
              <ul className="ctc-bullets">{summary.narrative.map((b, i) => <li key={i}>{b}</li>)}</ul>
            )}
            <p className="ctc-label">{summary.label}</p>
          </>
        )}
      </section>
    </div>
  );
}
