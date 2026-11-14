import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Mic, Square, Play, Trash2, RotateCcw, CheckCircle, Upload, Images } from 'lucide-react';
import api from '../services/api';
import { mediaUrl } from '../services/media';
import './PhotoGallery.css';

/**
 * Patient photo library with voice memory cues.
 *  - Photos load through short-lived signed URLs (never a public folder).
 *  - Each photo can carry a voice recording (record in the browser or play).
 *  - Photos added by helpers show "Added by a helper" until the person confirms.
 *  - Removing is undoable for 30 days ("Recently removed").
 */
const CATEGORIES = ['All', 'Family', 'Pet', 'Home', 'Memory'];
const CATEGORY_COLORS = { family: '#1f4d45', pet: '#8f5b0f', home: '#2e6b4e', memory: '#b9572f' };

function VoiceRecorder({ photoId, onSaved }) {
  const [state, setState] = useState('idle'); // idle | recording | saving | error
  const recRef = useRef(null);
  const chunks = useRef([]);
  const supported = typeof window !== 'undefined' && !!window.MediaRecorder && !!navigator.mediaDevices?.getUserMedia;
  if (!supported) return null;

  const start = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const rec = new MediaRecorder(stream);
      chunks.current = [];
      rec.ondataavailable = e => e.data.size && chunks.current.push(e.data);
      rec.onstop = async () => {
        stream.getTracks().forEach(t => t.stop());
        setState('saving');
        const blob = new Blob(chunks.current, { type: rec.mimeType || 'audio/webm' });
        const fd = new FormData();
        fd.append('voice', blob, 'voice.webm');
        try { await api.post(`/photos/${photoId}/voice`, fd); setState('idle'); onSaved(); }
        catch { setState('error'); }
      };
      recRef.current = rec;
      rec.start();
      setState('recording');
    } catch { setState('error'); }
  };

  return (
    <div className="voice-recorder">
      {state === 'recording'
        ? <button className="voice-btn recording" onClick={() => recRef.current?.stop()}><Square size={18} /> Stop and save</button>
        : <button className="voice-btn" onClick={start} disabled={state === 'saving'}><Mic size={18} /> {state === 'saving' ? 'Saving…' : 'Record a voice note'}</button>}
      {state === 'error' && <p className="gallery-error" role="alert">Recording did not work. Please check the microphone.</p>}
    </div>
  );
}

export default function PhotoGallery() {
  const navigate = useNavigate();
  const [photos, setPhotos] = useState([]);
  const [removed, setRemoved] = useState([]);
  const [activeCategory, setActiveCategory] = useState('All');
  const [previewPhoto, setPreviewPhoto] = useState(null);
  const [showRemoved, setShowRemoved] = useState(false);
  const [upload, setUpload] = useState({ file: null, caption: '', category: 'memory' });
  const [message, setMessage] = useState('');

  const fetchPhotos = useCallback(async () => {
    try {
      const [{ data }, { data: gone }] = await Promise.all([api.get('/photos'), api.get('/photos/removed')]);
      setPhotos(data);
      setRemoved(gone);
      setPreviewPhoto(p => (p ? data.find(x => x.id === p.id) || null : null));
    } catch {
      setMessage('Could not load your memories. Please try again.');
    }
  }, []);

  // eslint-disable-next-line react-hooks/set-state-in-effect -- async fetch: state is set after await, not synchronously
  useEffect(() => { fetchPhotos(); }, [fetchPhotos]);

  const filtered = activeCategory === 'All' ? photos : photos.filter(p => p.category === activeCategory.toLowerCase());

  const removePhoto = async (photo) => {
    if (!window.confirm(`Remove "${photo.caption}"? You can bring it back from "Recently removed" for 30 days.`)) return;
    await api.delete(`/photos/${photo.id}`);
    setPreviewPhoto(null);
    setMessage('Memory removed. You can bring it back from "Recently removed".');
    fetchPhotos();
  };

  const restore = async (photo) => { await api.post(`/photos/${photo.id}/restore`); setMessage('Memory brought back.'); fetchPhotos(); };
  const confirmPhoto = async (photo) => { await api.post(`/photos/${photo.id}/confirm`); fetchPhotos(); };

  const submitUpload = async (e) => {
    e.preventDefault();
    if (!upload.file || !upload.caption.trim()) { setMessage('Please choose a photo and write a few words about it.'); return; }
    const fd = new FormData();
    fd.append('photo', upload.file);
    fd.append('caption', upload.caption.trim());
    fd.append('category', upload.category);
    try {
      await api.post('/photos', fd);
      setUpload({ file: null, caption: '', category: 'memory' });
      e.target.reset();
      setMessage('Your photo was added.');
      fetchPhotos();
    } catch (err) {
      setMessage(err.response?.data?.message || 'The photo could not be added.');
    }
  };

  return (
    <div className="gallery-container">
      <button className="gallery-back" onClick={() => navigate('/patient-dashboard')}><ArrowLeft size={22} /> Home</button>
      <div className="gallery-header">
        <h1 className="gallery-title">My Photos</h1>
        <p className="gallery-subtitle">Your cherished moments, always with you</p>
      </div>
      {message && <p className="gallery-message" role="status">{message}</p>}

      <div className="gallery-filters" role="group" aria-label="Show photos of">
        {CATEGORIES.map(cat => (
          <button key={cat} onClick={() => setActiveCategory(cat)} aria-pressed={activeCategory === cat}
            className={`gallery-filter ${activeCategory === cat ? 'active' : ''}`}>{cat}</button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <div className="empty-state">
          <div className="empty-icon" aria-hidden="true"><Images size={34} strokeWidth={1.5} /></div>
          <p className="empty-text">No photos here yet. You or your helpers can add some below.</p>
        </div>
      ) : (
        <div className="photo-grid">
          {filtered.map(photo => (
            <button key={photo.id} className="photo-card spot" onClick={() => setPreviewPhoto(photo)} aria-label={`Open photo: ${photo.caption}`}>
              <img src={mediaUrl(photo.url)} alt="" className="photo-image" onError={e => { e.currentTarget.style.visibility = 'hidden'; }} />
              <div className="photo-details">
                <p className="photo-caption">{photo.caption}</p>
                <div className="photo-badges">
                  {photo.category && <span className="photo-badge" style={{ background: CATEGORY_COLORS[photo.category] || '#1f4d45' }}>{photo.category}</span>}
                  {photo.hasVoiceNote && <span className="photo-badge photo-badge-voice">Voice note</span>}
                  {photo.patientConfirmed === false && <span className="photo-badge photo-badge-helper">Added by a helper</span>}
                </div>
              </div>
            </button>
          ))}
        </div>
      )}

      <form className="gallery-upload" onSubmit={submitUpload}>
        <h2><Upload size={22} aria-hidden="true" /> Add a photo</h2>
        <label>Photo <input type="file" accept="image/jpeg,image/png,image/gif,image/webp" onChange={e => setUpload(u => ({ ...u, file: e.target.files?.[0] || null }))} /></label>
        <label>What is this photo about? <input type="text" maxLength={300} value={upload.caption} onChange={e => setUpload(u => ({ ...u, caption: e.target.value }))} placeholder="e.g. Eid lunch with Hina and Zainab" /></label>
        <label>Kind of memory
          <select value={upload.category} onChange={e => setUpload(u => ({ ...u, category: e.target.value }))}>
            <option value="family">Family</option><option value="home">Home</option><option value="pet">Pet</option><option value="memory">Memory</option>
          </select>
        </label>
        <button type="submit" className="gallery-primary">Add photo</button>
      </form>

      {removed.length > 0 && (
        <section className="gallery-removed">
          <button className="gallery-filter" onClick={() => setShowRemoved(s => !s)} aria-expanded={showRemoved}>
            Recently removed ({removed.length})
          </button>
          {showRemoved && (
            <ul>
              {removed.map(p => (
                <li key={p.id}>
                  <span>{p.caption}</span>
                  <button className="gallery-secondary" onClick={() => restore(p)}><RotateCcw size={16} /> Bring back</button>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {previewPhoto && (
        <div className="gallery-modal" role="dialog" aria-modal="true" aria-label={previewPhoto.caption} onClick={() => setPreviewPhoto(null)}>
          <div className="gallery-modal-card" onClick={e => e.stopPropagation()}>
            <button className="gallery-close" onClick={() => setPreviewPhoto(null)} aria-label="Close">Close</button>
            <img src={mediaUrl(previewPhoto.url)} alt={previewPhoto.caption} className="gallery-modal-img" />
            <div className="gallery-modal-body">
              <p className="gallery-modal-caption">{previewPhoto.caption}</p>
              {previewPhoto.voiceUrl && (
                <div className="voice-player">
                  <Play size={18} aria-hidden="true" />
                  <audio controls src={mediaUrl(previewPhoto.voiceUrl)} aria-label="Voice note for this photo" />
                </div>
              )}
              <VoiceRecorder photoId={previewPhoto.id} onSaved={fetchPhotos} />
              <div className="gallery-modal-actions">
                {previewPhoto.patientConfirmed === false && (
                  <button className="gallery-secondary" onClick={() => confirmPhoto(previewPhoto)}><CheckCircle size={16} /> Yes, this is my memory</button>
                )}
                <button className="gallery-danger" onClick={() => removePhoto(previewPhoto)}><Trash2 size={16} /> Remove</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
