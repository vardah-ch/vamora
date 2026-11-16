import { useEffect, useState } from 'react';
import { Link2, Info } from 'lucide-react';
import api from '../../services/api';

/**
 * Assign a doctor to a patient's care team (POST /super-admin/assignments).
 * The assignment gives the DOCTOR clinical access to that patient. It gives
 * the administrator nothing; the action is written to the audit log.
 */
export default function AssignDoctorPanel() {
  const [people, setPeople] = useState({ doctors: [], patients: [] });
  const [form, setForm] = useState({ doctorEmail: '', patientEmail: '' });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);

  useEffect(() => {
    api.get('/super-admin/users').then(({ data }) => {
      const active = (data || []).filter(u => u.isActive);
      setPeople({ doctors: active.filter(u => u.role === 'doctor'), patients: active.filter(u => u.role === 'patient') });
    }).catch(() => setMsg({ type: 'error', text: 'Could not load the list of accounts.' }));
  }, []);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true); setMsg(null);
    try {
      const { data } = await api.post('/super-admin/assignments', form);
      setMsg({ type: 'success', text: data.message });
    } catch (err) {
      setMsg({ type: 'error', text: err.response?.data?.message || 'The assignment could not be saved.' });
    } finally { setBusy(false); }
  };

  const option = (u) => <option key={u.id} value={u.email}>{u.name ? `${u.name} · ${u.email}` : u.email}</option>;

  return (
    <div className="sa-section">
      <div className="sa-section-header">
        <h2 className="sa-section-title"><Link2 size={22} /> Assign a doctor to a patient</h2>
      </div>
      <p className="sa-hint">
        <Info size={15} /> The doctor gets clinical access (appointments, medicines, MMSE, shared observations) for this patient only.
        Photos, voice notes and conversations stay private unless the patient shares them. You do not gain access yourself.
      </p>

      {msg && <div className={`sa-alert sa-alert--${msg.type}`} role="status">{msg.text}</div>}

      <form className="sa-form" onSubmit={submit}>
        <div className="sa-form-grid">
          <div className="sa-form-group">
            <label className="sa-label" htmlFor="as-doc">Doctor</label>
            <select id="as-doc" className="sa-select" required value={form.doctorEmail}
              onChange={e => setForm({ ...form, doctorEmail: e.target.value })}>
              <option value="">Choose a doctor…</option>
              {people.doctors.map(option)}
            </select>
          </div>
          <div className="sa-form-group">
            <label className="sa-label" htmlFor="as-pat">Patient</label>
            <select id="as-pat" className="sa-select" required value={form.patientEmail}
              onChange={e => setForm({ ...form, patientEmail: e.target.value })}>
              <option value="">Choose a patient…</option>
              {people.patients.map(option)}
            </select>
          </div>
        </div>
        <button type="submit" className="sa-submit-btn fill-btn" disabled={busy || !form.doctorEmail || !form.patientEmail}>
          {busy ? 'Saving…' : 'Assign doctor'}
        </button>
      </form>
    </div>
  );
}
