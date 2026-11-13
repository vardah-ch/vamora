import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, ShieldCheck, Eye, UserCheck, UserX, Settings } from 'lucide-react';
import api from '../services/api';
import { usePreferences } from '../hooks/usePreferences';
import './MyPrivacy.css';

/**
 * "My Privacy" – the patient's view of who can see their information.
 * HCI choices: one person per card, plain words instead of permission codes,
 * the same two actions everywhere ("share less", "stop sharing"), explicit
 * confirmation before stopping, and a history in everyday language.
 */
const GROUPS = [
  { label: 'My photos and memories', perms: ['memories.view'] },
  { label: 'Add photos and memories for me', perms: ['memories.upload'] },
  { label: 'Remove memories others added', perms: ['memories.delete'] },
  { label: 'Listen to my voice recordings', perms: ['voice.view'] },
  { label: 'Add voice recordings', perms: ['voice.upload'] },
  { label: 'How I said I feel', perms: ['mood.view'] },
  { label: 'Read care notes', perms: ['observations.view'] },
  { label: 'Write care notes', perms: ['observations.create'] },
  { label: 'My appointments and medicines', perms: ['clinical.view'] },
  { label: 'Tell them when I ask for help or feel low', perms: ['alerts.receive'] },
  { label: 'My conversations with Cara', perms: ['ai.history.view'] }
];

const BASIS_TEXT = {
  legacy_assignment: 'This was set up before VAMORA asked for your agreement.',
  clinician_assignment: 'Your doctor added this person to your care team.',
  caregiver_request: 'This person asked to help you.',
  patient_consent: 'You chose to share with this person.'
};

function PermissionChecklist({ value, onChange, canExpand, idPrefix }) {
  return (
    <fieldset className="mp-checklist">
      <legend className="visually-hidden">What they can see or do</legend>
      {GROUPS.map(g => {
        const checked = g.perms.every(p => value.includes(p));
        const disabled = !checked && !canExpand;
        return (
          <label key={g.label} className={`mp-check ${disabled ? 'mp-check-disabled' : ''}`}>
            <input
              type="checkbox" id={`${idPrefix}-${g.perms[0]}`} checked={checked} disabled={disabled}
              onChange={e => onChange(e.target.checked ? [...new Set([...value, ...g.perms])] : value.filter(p => !g.perms.includes(p)))}
            />
            <span>{g.label}</span>
          </label>
        );
      })}
    </fieldset>
  );
}

export default function MyPrivacy() {
  const navigate = useNavigate();
  const { prefs, update: updatePrefs } = usePreferences();
  const [data, setData] = useState(null);
  const [activity, setActivity] = useState([]);
  const [drafts, setDrafts] = useState({});
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try {
      const [{ data: overview }, { data: act }] = await Promise.all([api.get('/privacy/overview'), api.get('/privacy/activity?limit=40')]);
      setData(overview);
      setActivity(act);
      setDrafts(Object.fromEntries(overview.grants.map(g => [g.id, g.permissions])));
    } catch (e) {
      setError(e.response?.data?.message || 'Could not load your privacy settings.');
    }
  }, []);

  // eslint-disable-next-line react-hooks/set-state-in-effect -- async fetch: state is set after await, not synchronously
  useEffect(() => { load(); }, [load]);

  const act = async (fn, okText) => {
    setError(''); setMessage('');
    try { await fn(); setMessage(okText); await load(); }
    catch (e) { setError(e.response?.data?.message || 'That did not work. Please try again.'); }
  };

  if (!data) {
    return <div className="mp-container"><p role="status">{error || 'Loading…'}</p></div>;
  }
  const canExpand = data.authority === 'full';
  const pending = data.grants.filter(g => g.status === 'pending');
  const active = data.grants.filter(g => g.status === 'active');

  return (
    <div className="mp-container">
      <button className="mp-back" onClick={() => navigate('/patient-dashboard')}><ArrowLeft size={22} /> Home</button>
      <header className="mp-header">
        <ShieldCheck size={40} aria-hidden="true" />
        <div>
          <h1>My Privacy</h1>
          <p>You decide who can see your memories and information. You can share less or stop sharing at any time.</p>
        </div>
      </header>

      {!canExpand && (
        <p className="mp-callout">
          {data.patient.representative ? `${data.patient.representative.name} helps make sharing decisions with you.` : 'A representative helps make sharing decisions with you.'}{' '}
          You can always share less or stop sharing. To share more, please ask them.
        </p>
      )}
      {message && <p className="mp-ok" role="status">{message}</p>}
      {error && <p className="mp-error" role="alert">{error}</p>}

      {pending.length > 0 && (
        <section aria-labelledby="mp-pending">
          <h2 id="mp-pending">Waiting for your answer</h2>
          {pending.map(g => (
            <article key={g.id} className="mp-card mp-card-pending">
              <h3>{g.grantee.name}{g.grantee.relationship ? ` (${g.grantee.relationship})` : ''} would like to help you</h3>
              <p>If you agree, they will be able to see or do the ticked things. Untick anything you do not want to share.</p>
              <PermissionChecklist value={drafts[g.id] || []} canExpand={canExpand} idPrefix={`p${g.id}`}
                onChange={v => setDrafts(d => ({ ...d, [g.id]: v }))} />
              <div className="mp-actions">
                {canExpand && (
                  <button className="mp-btn mp-btn-yes" onClick={() => act(() => api.post(`/privacy/grants/${g.id}/approve`, { permissions: drafts[g.id] }), `You are now sharing with ${g.grantee.name}.`)}>
                    <UserCheck size={20} /> Yes, share the ticked things
                  </button>
                )}
                <button className="mp-btn mp-btn-no" onClick={() => act(() => api.post(`/privacy/grants/${g.id}/decline`), 'You said no. Nothing was shared.')}>
                  <UserX size={20} /> No, thank you
                </button>
              </div>
            </article>
          ))}
        </section>
      )}

      <section aria-labelledby="mp-sharing">
        <h2 id="mp-sharing">People who can see your information</h2>
        {active.length === 0 && <p>You are not sharing with any helpers right now.</p>}
        {active.map(g => {
          const changed = JSON.stringify([...(drafts[g.id] || [])].sort()) !== JSON.stringify([...g.permissions].sort());
          return (
            <article key={g.id} className="mp-card">
              <h3>{g.grantee.name}{g.grantee.relationship ? ` (${g.grantee.relationship})` : ''} <span className="mp-role">{g.grantee.role}</span></h3>
              {BASIS_TEXT[g.basis] && <p className="mp-basis">{BASIS_TEXT[g.basis]}</p>}
              {g.needsReview && (
                <div className="mp-review">
                  <p><strong>Please check this.</strong> Is this what you want {g.grantee.name} to see?</p>
                  <button className="mp-btn" onClick={() => act(() => api.post(`/privacy/grants/${g.id}/reviewed`), 'Thank you for checking.')}>Yes, this is right</button>
                </div>
              )}
              <PermissionChecklist value={drafts[g.id] || []} canExpand={canExpand} idPrefix={`a${g.id}`}
                onChange={v => setDrafts(d => ({ ...d, [g.id]: v }))} />
              <div className="mp-actions">
                <button className="mp-btn" disabled={!changed}
                  onClick={() => act(() => api.put(`/privacy/grants/${g.id}/permissions`, { permissions: drafts[g.id] }), 'Your changes are saved.')}>
                  Save changes
                </button>
                <button className="mp-btn mp-btn-no"
                  onClick={() => window.confirm(`Stop sharing everything with ${g.grantee.name}? They will be told.`) &&
                    act(() => api.post(`/privacy/grants/${g.id}/revoke`), `You stopped sharing with ${g.grantee.name}.`)}>
                  Stop sharing with {g.grantee.name}
                </button>
              </div>
            </article>
          );
        })}
      </section>

      {data.clinicians.length > 0 && (
        <section aria-labelledby="mp-doctors">
          <h2 id="mp-doctors">Your doctors</h2>
          {data.clinicians.map(c => (
            <article key={c.userId} className="mp-card">
              <h3>{c.name}</h3>
              <p>Can see your appointments, medicines, memory-test scores, how you said you feel, and care notes.</p>
              <p><strong>Cannot</strong> see your photos, voice recordings or chats with Cara unless you choose to share them.</p>
            </article>
          ))}
        </section>
      )}

      <section aria-labelledby="mp-activity">
        <h2 id="mp-activity"><Eye size={22} aria-hidden="true" /> Who looked at or changed your information</h2>
        {activity.length === 0 ? <p>Nothing yet.</p> : (
          <ul className="mp-activity">
            {activity.map(e => (
              <li key={e.id} className={e.outcome === 'denied' ? 'mp-denied' : ''}>
                <time dateTime={e.when}>{new Date(e.when).toLocaleString(undefined, { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</time>
                <span>
                  <strong>{e.who}</strong> {e.description}
                  {e.outcome === 'denied' && <em className="mp-denied-label"> (blocked: they were not allowed)</em>}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="mp-settings">
        <h2 id="mp-settings"><Settings size={22} aria-hidden="true" /> Display and voice</h2>
        <div className="mp-card mp-settings">
          <label>Text size
            <select value={prefs.textSize || 'normal'} onChange={e => updatePrefs({ textSize: e.target.value })}>
              <option value="normal">Normal</option><option value="large">Large</option><option value="extra">Extra large</option>
            </select>
          </label>
          <label className="mp-check"><input type="checkbox" checked={!!prefs.readAloud} onChange={e => updatePrefs({ readAloud: e.target.checked })} /> Read Cara’s answers aloud</label>
          <label className="mp-check"><input type="checkbox" checked={!!prefs.moodCameraOptIn} onChange={e => updatePrefs({ moodCameraOptIn: e.target.checked })} /> Allow the mood camera (it only makes a guess, and you always choose your mood)</label>
        </div>
      </section>
    </div>
  );
}
