import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Voice input/output using the browser's Web Speech API (no extra cost, no
 * VAMORA server involvement).
 *
 * Privacy note shown in the UI: speech RECOGNITION in Chrome/Edge is processed
 * by the browser vendor's cloud service; speech SYNTHESIS (read aloud) runs on
 * the device. Recognition is only active while the microphone button is on.
 */
const LANG = { en: 'en-US', ur: 'ur-PK' };

export function useSpeech(language = 'en') {
  const Recognition = typeof window !== 'undefined' && (window.SpeechRecognition || window.webkitSpeechRecognition);
  const canListen = !!Recognition;
  const canSpeak = typeof window !== 'undefined' && 'speechSynthesis' in window;
  const [listening, setListening] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [error, setError] = useState(null);
  const recRef = useRef(null);

  const stopListening = useCallback(() => {
    recRef.current?.stop();
    setListening(false);
  }, []);

  const listen = useCallback((onResult) => {
    if (!canListen) return;
    setError(null);
    const rec = new Recognition();
    rec.lang = LANG[language] || 'en-US';
    rec.interimResults = true;
    rec.maxAlternatives = 1;
    rec.onresult = (e) => {
      const text = Array.from(e.results).map(r => r[0].transcript).join(' ');
      onResult(text, e.results[e.results.length - 1].isFinal);
    };
    rec.onerror = (e) => {
      setError(e.error === 'not-allowed' ? 'Microphone permission was not given.' : 'I could not hear that. Please try again.');
      setListening(false);
    };
    rec.onend = () => setListening(false);
    recRef.current = rec;
    rec.start();
    setListening(true);
  }, [Recognition, canListen, language]);

  const speak = useCallback((text) => {
    if (!canSpeak || !text) return;
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = LANG[language] || 'en-US';
    u.rate = 0.9; // a little slower than default, for clarity
    u.onend = () => setSpeaking(false);
    u.onerror = () => setSpeaking(false);
    setSpeaking(true);
    window.speechSynthesis.speak(u);
  }, [canSpeak, language]);

  const stopSpeaking = useCallback(() => {
    if (canSpeak) window.speechSynthesis.cancel();
    setSpeaking(false);
  }, [canSpeak]);

  useEffect(() => () => { recRef.current?.abort?.(); if (canSpeak) window.speechSynthesis.cancel(); }, [canSpeak]);

  return { canListen, canSpeak, listening, speaking, error, listen, stopListening, speak, stopSpeaking };
}
