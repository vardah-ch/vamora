import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Mic, MicOff, Volume2, VolumeX, ArrowLeft, Trash2 } from 'lucide-react';
import api from '../services/api';
import { mediaUrl } from '../services/media';
import { useAuth } from '../contexts/AuthContext';
import { useSpeech } from '../hooks/useSpeech';
import { usePreferences } from '../hooks/usePreferences';
import './TalkToCompanion.css';

/**
 * Talk with Cara. Design choices (see docs/ARCHITECTURE.md §HCI):
 *  - Replies show the memories they are based on (photo + title): recognition
 *    rather than recall, and transparency about where an answer came from.
 *  - Each reply carries a plain-language note when Cara is unsure.
 *  - Voice in (microphone) and voice out (read aloud) for people who find
 *    typing or reading hard.
 *  - Cara is presented as a computer helper, never as a person.
 */
const STATUS_NOTE = {
  no_relevant_memory: 'Cara could not find this in your saved memories.',
  retrieval_only: 'Showing a saved memory that may help.',
  'safety:urgent': 'Your helpers have been told you asked for help.',
  'safety:medical': 'Medicine questions go to your doctor or caregiver.'
};

function statusNote(status) {
  if (!status) return null;
  if (status.startsWith('fallback')) return 'Cara kept to what is in your saved memories.';
  return STATUS_NOTE[status] || null;
}

export default function TalkToCompanion() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { prefs, update: updatePrefs } = usePreferences();
  const language = prefs.language || 'en';
  const speech = useSpeech(language);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [loadingHistory, setLoadingHistory] = useState(true);
  const messagesEndRef = useRef(null);
  const firstName = user?.profile?.name?.split(' ')[0] || 'there';

  useEffect(() => {
    let alive = true;
    api.get('/companion/history')
      .then(({ data }) => {
        if (!alive) return;
        setMessages(data.length ? data.map(m => ({ role: m.role, content: m.content, sources: m.sources || [], status: m.groundingStatus }))
          : [{ role: 'assistant', content: `Hello ${firstName}. I'm Cara, a computer helper. I can help you look at your saved memories. What would you like to remember?`, sources: [] }]);
      })
      .catch(() => alive && setMessages([{ role: 'assistant', content: `Hello ${firstName}. I'm Cara, a computer helper. How can I help?`, sources: [] }]))
      .finally(() => alive && setLoadingHistory(false));
    return () => { alive = false; };
  }, [firstName]);

  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  const send = async (text) => {
    const message = (text ?? input).trim();
    if (!message || loading) return;
    setInput('');
    setMessages(prev => [...prev, { role: 'user', content: message, sources: [] }]);
    setLoading(true);
    try {
      const { data } = await api.post('/companion/chat', { message }, { timeout: 30000 });
      setMessages(prev => [...prev, { role: 'assistant', content: data.reply, sources: data.sources || [], status: data.grounding?.status }]);
      if (prefs.readAloud) speech.speak(data.reply);
    } catch (err) {
      const msg = err.response?.status === 429
        ? 'We have talked a lot just now. Let us rest for a minute and try again.'
        : 'Sorry, I could not answer just now. Please try again in a moment.';
      setMessages(prev => [...prev, { role: 'assistant', content: msg, sources: [] }]);
    } finally {
      setLoading(false);
    }
  };

  const toggleMic = () => {
    if (speech.listening) { speech.stopListening(); return; }
    speech.listen((text, isFinal) => {
      setInput(text);
      if (isFinal) send(text);
    });
  };

  const clearHistory = async () => {
    if (!window.confirm('Clear our whole conversation? This cannot be undone.')) return;
    await api.delete('/companion/history');
    setMessages([{ role: 'assistant', content: `We can start fresh, ${firstName}. What would you like to talk about?`, sources: [] }]);
  };

  if (loadingHistory) {
    return (
      <div className="companion-container">
        <div className="companion-loading" role="status">
          <div className="loading-spinner"></div>
          <p>Getting Cara ready…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="companion-container">
      <div className="companion-header">
        <button className="companion-back" onClick={() => navigate('/patient-dashboard')} aria-label="Back to home">
          <ArrowLeft size={22} /> Home
        </button>
        <div className="companion-avatar" aria-hidden="true">💬</div>
        <div className="companion-info">
          <h1 className="companion-title">Talk with Cara</h1>
          <p className="companion-status">A computer helper for your memories</p>
        </div>
        <div className="companion-tools">
          <label className="companion-lang">
            <span className="visually-hidden">Language</span>
            <select value={language} onChange={e => updatePrefs({ language: e.target.value })} aria-label="Voice language">
              <option value="en">English</option>
              <option value="ur">اردو</option>
            </select>
          </label>
          {speech.canSpeak && (
            <button className="companion-tool-btn" aria-pressed={!!prefs.readAloud}
              onClick={() => { if (prefs.readAloud) speech.stopSpeaking(); updatePrefs({ readAloud: !prefs.readAloud }); }}>
              {prefs.readAloud ? <Volume2 size={20} /> : <VolumeX size={20} />} {prefs.readAloud ? 'Reading aloud' : 'Read aloud off'}
            </button>
          )}
          <button className="companion-tool-btn" onClick={clearHistory} aria-label="Clear conversation"><Trash2 size={18} /></button>
        </div>
      </div>

      <div className="messages-container" aria-live="polite">
        {messages.map((msg, index) => (
          <div key={index} className={`message-wrapper ${msg.role === 'user' ? 'user-wrapper' : 'ai-wrapper'}`}>
            {msg.role === 'assistant' && <div className="ai-avatar" aria-hidden="true">💬</div>}
            <div className={`message-bubble ${msg.role === 'user' ? 'user-bubble' : 'ai-bubble'}`}>
              <p>{msg.content}</p>
              {msg.role === 'assistant' && msg.sources?.length > 0 && (
                <div className="memory-sources" aria-label="Memories this answer is based on">
                  {msg.sources.map(s => (
                    <figure key={s.id} className="memory-source">
                      {s.url && <img src={mediaUrl(s.url)} alt={s.title} onError={e => { e.currentTarget.style.display = 'none'; }} />}
                      <figcaption>
                        {s.title}
                        {s.confirmed === false && <span className="memory-source-note">Added by a helper</span>}
                      </figcaption>
                    </figure>
                  ))}
                </div>
              )}
              {msg.role === 'assistant' && statusNote(msg.status) && <p className="grounding-note">{statusNote(msg.status)}</p>}
              {msg.role === 'assistant' && speech.canSpeak && (
                <button className="speak-btn" onClick={() => speech.speak(msg.content)} aria-label="Read this message aloud">
                  <Volume2 size={16} /> Listen
                </button>
              )}
            </div>
            {msg.role === 'user' && <div className="user-avatar" aria-hidden="true">{firstName.charAt(0).toUpperCase()}</div>}
          </div>
        ))}
        {loading && (
          <div className="message-wrapper ai-wrapper" role="status" aria-label="Cara is thinking">
            <div className="ai-avatar" aria-hidden="true">💬</div>
            <div className="message-bubble ai-bubble typing-bubble"><span></span><span></span><span></span></div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      <div className="input-area">
        {speech.canListen && (
          <button className={`mic-btn ${speech.listening ? 'listening' : ''}`} onClick={toggleMic}
            aria-pressed={speech.listening} aria-label={speech.listening ? 'Stop listening' : 'Speak instead of typing'}>
            {speech.listening ? <MicOff size={26} /> : <Mic size={26} />}
          </button>
        )}
        <label htmlFor="companion-input" className="visually-hidden">Your message</label>
        <textarea
          id="companion-input"
          className="message-input"
          placeholder={speech.listening ? 'Listening…' : 'Type or press the microphone'}
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }}
          rows={2}
          maxLength={1000}
          disabled={loading}
        />
        <button className="send-btn" onClick={() => send()} disabled={loading || !input.trim()} aria-label="Send message">Send</button>
      </div>
      <p className="input-hint">
        {speech.error || (speech.canListen
          ? 'The microphone uses your browser’s speech service, which may process your voice online. Reading aloud stays on this device.'
          : 'Press Enter to send.')}
      </p>
    </div>
  );
}
