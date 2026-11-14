import { useLocation } from 'react-router-dom';
import { Mail } from 'lucide-react';
import { CREATOR } from '../config/creator';
import { Logo } from './Glyphs';
import './Footer.css';

/** App-wide footer: authorship, contact and the research-prototype notice. */
export default function Footer() {
  const { pathname } = useLocation();
  if (pathname === '/' || pathname === '/login') return null; // these pages carry their own credit
  return (
    <footer className="app-footer-bar">
      <div className="afb-inner">
        <Logo size={20} />
        <p className="afb-credit">
          Created by <strong>{CREATOR.name}</strong>
          <span className="afb-sep" aria-hidden="true">·</span>
          <a href={`mailto:${CREATOR.email}`}><Mail size={14} aria-hidden="true" /> {CREATOR.email}</a>
        </p>
        <p className="afb-note">Research prototype · not a medical device · © {CREATOR.year} {CREATOR.name}</p>
      </div>
    </footer>
  );
}
