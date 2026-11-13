import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Users, MapPin, CalendarHeart, Clock, NotebookPen, CheckCircle, Trash2 } from 'lucide-react';
import api from '../services/api';
import './MemoryBook.css';

/**
 * Memory Book: the typed personal memories Cara uses to answer questions.
 * Plain-language types, one short form, items grouped by type (recognition
 * over recall), and clear marking of anything a helper added.
 */
const TYPES = {
  person: { label: 'People I know', add: 'Someone important', icon: Users, titleLabel: 'Their name', contentLabel: 'Who they are to me' },
  place: { label: 'Places', add: 'A place', icon: MapPin, titleLabel: 'Name of the place', contentLabel: 'What I remember about it' },
  event: { label: 'Things that happened', add: 'Something that happened', icon: CalendarHeart, titleLabel: 'What happened', contentLabel: 'Details' },
  routine: { label: 'My day', add: 'Something I do every day', icon: Clock, titleLabel: 'What I do', contentLabel: 'Details' },
  written: { label: 'Things to remember', add: 'Something I want to remember', icon: NotebookPen, titleLabel: 'Title', contentLabel: 'Write it down' }
};
const EMPTY = { type: 'person', title: '', content: '', people: '', place: '', eventDate: '', routineTime: '' };

export default function MemoryBook() {
  const navigate = useNavigate();
  const [items, setItems] = useState([]);
  const [form, setForm] = useState(EMPTY);
  const [message, setMessage] = useState('');

  const load = useCallback(async () => {
    try { setItems((await api.get('/memories')).data); }
    catch { setMessage('Could not load your Memory Book.'); }
  }, []);
  // eslint-disable-next-line react-hooks/set-state-in-effect -- async fetch: state is set after await, not synchronously
  useEffect(() => { load(); }, [load]);

  const set = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }));

  const save = async (e) => {
    e.preventDefault();
    try {
      const body = { type: form.type, title: form.title, content: form.content };
      if (form.type === 'person') body.people = [form.title];
      else if (form.people.trim()) body.people = form.people;
      if (form.place.trim()) body.place = form.place;
      if (form.type === 'event' && form.eventDate) body.eventDate = form.eventDate;
      if (form.type === 'routine' && form.routineTime) body.routineTime = form.routineTime;
      await api.post('/memories', body);
      setForm({ ...EMPTY, type: form.type });
      setMessage('Saved to your Memory Book.');
      load();
    } catch (err) {
      setMessage(err.response?.data?.message || 'That could not be saved.');
    }
  };

  const remove = async (item) => {
    if (!window.confirm(`Remove "${item.title}"?`)) return;
    await api.delete(`/memories/${item.id}`);
    setMessage(`Removed "${item.title}".`);
    load();
  };
  const confirm = async (item) => { await api.post(`/memories/${item.id}/confirm`); load(); };

  const meta = TYPES[form.type];
  return (
    <div className="mb-container">
      <button className="mb-back" onClick={() => navigate('/patient-dashboard')}><ArrowLeft size={22} /> Home</button>
      <h1>My Memory Book</h1>
      <p className="mb-intro">Cara uses these to help you remember. Only you and the people you choose can see them.</p>
      {message && <p className="mb-message" role="status">{message}</p>}

      {Object.entries(TYPES).map(([type, t]) => {
        const list = items.filter(i => i.type === type);
        if (!list.length) return null;
        const Icon = t.icon;
        return (
          <section key={type} aria-labelledby={`mb-${type}`}>
            <h2 id={`mb-${type}`}><Icon size={24} aria-hidden="true" /> {t.label}</h2>
            <ul className="mb-list">
              {(type === 'routine' ? [...list].sort((a, b) => String(a.routineTime).localeCompare(String(b.routineTime))) : list).map(item => (
                <li key={item.id} className="mb-item">
                  <div>
                    <p className="mb-title">{item.routineTime ? `${item.routineTime} · ` : ''}{item.title}</p>
                    {item.content && <p className="mb-content">{item.content}</p>}
                    <p className="mb-meta">
                      {item.eventDate && new Date(item.eventDate).toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' })}
                      {item.place && ` · ${item.place}`}
                    </p>
                    {!item.patientConfirmed && <p className="mb-helper">A helper added this. Is it right?</p>}
                  </div>
                  <div className="mb-actions">
                    {!item.patientConfirmed && <button className="mb-btn" onClick={() => confirm(item)}><CheckCircle size={18} /> Yes, it is right</button>}
                    <button className="mb-btn mb-btn-danger" onClick={() => remove(item)} aria-label={`Remove ${item.title}`}><Trash2 size={18} /></button>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        );
      })}

      <form className="mb-form" onSubmit={save}>
        <h2>Add to my Memory Book</h2>
        <fieldset className="mb-types">
          <legend>What would you like to add?</legend>
          {Object.entries(TYPES).map(([type, t]) => (
            <label key={type} className={`mb-type ${form.type === type ? 'active' : ''}`}>
              <input type="radio" name="type" value={type} checked={form.type === type} onChange={set('type')} />
              {t.add}
            </label>
          ))}
        </fieldset>
        <label>{meta.titleLabel}<input required maxLength={200} value={form.title} onChange={set('title')} /></label>
        <label>{meta.contentLabel} <span className="mb-optional">(optional)</span><textarea rows={3} maxLength={5000} value={form.content} onChange={set('content')} /></label>
        {form.type === 'event' && <label>When <span className="mb-optional">(optional)</span><input type="date" value={form.eventDate} onChange={set('eventDate')} /></label>}
        {form.type === 'routine' && <label>Usual time<input type="time" value={form.routineTime} onChange={set('routineTime')} /></label>}
        {form.type !== 'person' && <label>People involved <span className="mb-optional">(optional, separate with commas)</span><input maxLength={300} value={form.people} onChange={set('people')} /></label>}
        {form.type !== 'place' && <label>Place <span className="mb-optional">(optional)</span><input maxLength={200} value={form.place} onChange={set('place')} /></label>}
        <button type="submit" className="mb-save">Save</button>
      </form>
    </div>
  );
}
