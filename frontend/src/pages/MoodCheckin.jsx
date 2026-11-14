import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../services/api';
import './MoodCheckin.css';
import { CheckCircle2 } from 'lucide-react';
import { MoodGlyph } from '../components/Glyphs';

const moods = [
  { emoji: <MoodGlyph mood="happy" size={26} />, label: 'Happy',     value: 'happy' },
  { emoji: <MoodGlyph mood="calm" size={26} />, label: 'Calm',      value: 'calm' },
  { emoji: <MoodGlyph mood="sad" size={26} />, label: 'Sad',       value: 'sad' },
  { emoji: <MoodGlyph mood="anxious" size={26} />, label: 'Anxious',   value: 'anxious' },
  { emoji: <MoodGlyph mood="frustrated" size={26} />, label: 'Frustrated',value: 'frustrated' },
  { emoji: <MoodGlyph mood="tired" size={26} />, label: 'Tired',     value: 'tired' },
  { emoji: <MoodGlyph mood="excited" size={26} />, label: 'Excited',   value: 'excited' },
  { emoji: <MoodGlyph mood="confused" size={26} />, label: 'Confused',  value: 'confused' },
];

export default function MoodCheckin() {
  const navigate = useNavigate();
  const [selectedMood, setSelectedMood] = useState(null);
  const [note, setNote] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => { fetchHistory(); }, []);

  const fetchHistory = async () => {
    try {
      const { data } = await api.get('/moods');
      setHistory(data);
    } catch (err) {
      console.error('Error fetching mood history:', err);
    }
  };

  const handleSubmit = async () => {
    if (!selectedMood) return;
    setLoading(true);
    try {
      await api.post('/moods', {
        mood: selectedMood.value,
        note: note.trim(),
      });
      setSubmitted(true);
      setNote('');
      fetchHistory();
    } catch (err) {
      console.error('Error saving mood:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleAgain = () => {
    setSelectedMood(null);
    setSubmitted(false);
  };

  return (
    <div className="mood-container">

      <div className="mood-header">
        <h1 className="mood-title">How are you feeling?</h1>
        <p className="mood-subtitle">It's okay to feel any way you do</p>
      </div>

      {!submitted ? (
        <div className="mood-card">
          <h2 className="mood-question">Choose your mood</h2>

          <div className="mood-grid">
            {moods.map(m => (
              <button
                key={m.value}
                className={`mood-btn ${selectedMood?.value === m.value ? 'selected' : ''}`}
                onClick={() => setSelectedMood(m)}
              >
                <span className="mood-emoji">{m.emoji}</span>
                <span className="mood-label">{m.label}</span>
              </button>
            ))}
          </div>

          {selectedMood && (
            <div className="note-section">
              <p className="note-label">Want to add a note? <span>(optional)</span></p>
              <textarea
                className="note-input"
                placeholder={`Tell us more about feeling ${selectedMood.label.toLowerCase()}...`}
                value={note}
                onChange={e => setNote(e.target.value)}
                rows={3}
              />
              <button
                className="submit-btn"
                onClick={handleSubmit}
                disabled={loading}
              >
                {loading ? 'Saving...' : '✓ Save My Mood'}
              </button>
            </div>
          )}
        </div>
      ) : (
        <div className="mood-card success-card">
          <div className="success-icon"><CheckCircle2 size={44} strokeWidth={1.6} /></div>
          <h2 className="success-title">Thank you for sharing!</h2>
          <p className="success-subtitle">
            You're feeling <strong>{selectedMood.emoji} {selectedMood.label}</strong> today
          </p>
          <div className="success-actions">
            <button className="again-btn" onClick={handleAgain}>Check in Again</button>
            <button className="dashboard-btn" onClick={() => navigate('/patient-dashboard')}>
              Back to Dashboard
            </button>
          </div>
        </div>
      )}

      {history.length > 0 && (
        <div className="history-section">
          <h2 className="history-title">Recent Check-ins</h2>
          <div className="history-list">
            {history.slice(0, 5).map(entry => {
              const moodData = moods.find(m => m.value === entry.mood);
              return (
                <div key={entry.id} className="history-item">
                  <span className="history-emoji">{moodData?.emoji || <MoodGlyph mood={entry.mood} size={18} />}</span>
                  <div className="history-details">
                    <p className="history-mood">{moodData?.label || entry.mood}</p>
                    {entry.note && <p className="history-note">{entry.note}</p>}
                    <p className="history-date">
                      {new Date(entry.recordedAt).toLocaleDateString('en-US', {
                        weekday: 'short', month: 'short', day: 'numeric',
                        hour: '2-digit', minute: '2-digit'
                      })}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}