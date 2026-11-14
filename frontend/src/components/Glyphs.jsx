import { Smile, Laugh, Meh, Frown, Annoyed, Angry, Moon, CircleHelp } from 'lucide-react';

/* Professional replacements for the emoji previously used across VAMORA. */

const MOODS = {
  happy:      { Icon: Smile,      fg: '#2e6b4e', bg: '#e3efe7', label: 'Happy' },
  excited:    { Icon: Laugh,      fg: '#8f5b0f', bg: '#f6ead4', label: 'Excited' },
  calm:       { Icon: Meh,        fg: '#2c5a7a', bg: '#e3edf4', label: 'Calm' },
  tired:      { Icon: Moon,       fg: '#5d5a7a', bg: '#ebe9f2', label: 'Tired' },
  confused:   { Icon: CircleHelp, fg: '#6b5a3a', bg: '#efe8da', label: 'Confused' },
  sad:        { Icon: Frown,      fg: '#3f5a86', bg: '#e4e9f3', label: 'Sad' },
  anxious:    { Icon: Annoyed,    fg: '#9a5317', bg: '#f6e6d6', label: 'Worried' },
  frustrated: { Icon: Angry,      fg: '#a33a2c', bg: '#f6e2de', label: 'Frustrated' }
};

// Facial-expression labels from the mood camera → mood glyphs.
const EXPRESSION_TO_MOOD = { happy: 'happy', neutral: 'calm', sad: 'sad', fearful: 'anxious', surprised: 'excited', angry: 'frustrated', disgusted: 'frustrated' };

export function MoodGlyph({ mood, size = 22, expression }) {
  const m = MOODS[mood] || MOODS[EXPRESSION_TO_MOOD[expression]] || MOODS.calm;
  const box = Math.round(size * 1.75);
  return (
    <span className="v-glyph" style={{ width: box, height: box, background: m.bg, color: m.fg }} aria-hidden="true">
      <m.Icon size={size} strokeWidth={1.75} />
    </span>
  );
}

export function moodLabel(mood) { return MOODS[mood]?.label || mood; }

export function Initials({ name, size = 48 }) {
  const initials = String(name || '?').trim().split(/\s+/).slice(0, 2).map(p => p[0]).join('').toUpperCase();
  return <span className="v-avatar" style={{ width: size, height: size, fontSize: size * 0.38 }} aria-hidden="true">{initials || '?'}</span>;
}

/* VAMORA mark: two overlapping rings (a memory held between two people). */
export function Logo({ size = 28, withWord = true, light = false }) {
  const ink = light ? '#fffdf9' : '#1d2320';
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 10 }}>
      <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
        <circle cx="12" cy="16" r="9" fill="none" stroke={light ? '#cfe0d9' : '#1f4d45'} strokeWidth="2.6" />
        <circle cx="20" cy="16" r="9" fill="none" stroke="#b9572f" strokeWidth="2.6" />
        <path d="M16 8.6a9 9 0 0 1 0 14.8a9 9 0 0 1 0-14.8z" fill={light ? 'rgba(207,224,217,.35)' : 'rgba(31,77,69,.14)'} />
      </svg>
      {withWord && <span style={{ fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: size * 0.82, letterSpacing: '-0.02em', color: ink }}>vamora</span>}
    </span>
  );
}
