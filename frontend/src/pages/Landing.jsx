import { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowRight, ShieldCheck, MessageSquareQuote, BookHeart, Users, Stethoscope, HeartHandshake,
  Lock, Eye, History, Type, WifiOff, Mail, GraduationCap, FileCheck2, AlertTriangle, CheckCircle2
} from 'lucide-react';
import { Logo } from '../components/Glyphs';
import { CREATOR } from '../config/creator';
import './Landing.css';

/**
 * Public showcase page for clinicians, hospitals and reviewers.
 * Every claim here corresponds to something implemented and documented in
 * docs/ (no efficacy or clinical claims).
 */
const SHOTS = [
  { key: 'patient-home', label: 'Patient home', caption: 'Six large, clearly labelled choices. No clutter, no ticking clock.' },
  { key: 'companion', label: 'Talk with Cara', caption: 'Answers come only from the person’s own memories, with the source shown. Unknown? Cara says so.' },
  { key: 'privacy', label: 'My Privacy', caption: 'The person decides what each helper can see, and can see who looked.' },
  { key: 'memory-book', label: 'Memory Book', caption: 'People, places, events and daily routines, grouped for recognition rather than recall.' },
  { key: 'doctor', label: 'Clinician view', caption: 'Assigned patients only. Clinical data by default; photos and chats only if the patient shares them.' }
];

export default function Landing() {
  const [shot, setShot] = useState(SHOTS[0]);

  return (
    <div className="lp">
      {/* ── Top bar ── */}
      <header className="lp-top">
        <div className="lp-wrap lp-top-inner">
          <Logo size={28} />
          <nav className="lp-nav" aria-label="Page sections">
            <a href="#how">How it works</a>
            <a href="#privacy">Privacy</a>
            <a href="#evidence">Evidence</a>
            <a href="#creator">About the creator</a>
          </nav>
          <Link to="/login" className="lp-btn lp-btn-sm fill-btn">Sign in <ArrowRight size={16} /></Link>
        </div>
      </header>

      {/* ── Hero ── */}
      <section className="lp-hero">
        <div className="lp-wrap lp-hero-grid">
          <div className="lp-hero-copy">
            <p className="v-eyebrow">Memory companion for dementia care</p>
            <h1>Help people with memory loss recognise the people, places and routines that matter, <em>without ever making things up.</em></h1>
            <p className="lp-lead">
              VAMORA brings a person’s photos, voice notes and personal memories together with their family and care team.
              Its assistant answers only from what the person has saved, and the person stays in control of who sees what.
            </p>
            <div className="lp-cta">
              <Link to="/login" className="lp-btn fill-btn">Open the demo <ArrowRight size={18} /></Link>
              <a href="#creator" className="lp-btn lp-btn-ghost">Contact {CREATOR.name.split(' ')[0]}</a>
            </div>
            <p className="lp-byline">Designed and built by <strong>{CREATOR.name}</strong> · {CREATOR.institution.split(',').slice(-2).join(',').trim()}</p>
          </div>
          <figure className="lp-hero-shot tilt spot">
            <div className="lp-browser"><span /><span /><span /></div>
            <img src={`/showcase/${shot.key}.png`} alt={`Screenshot: ${shot.label}`} />
          </figure>
        </div>
        <div className="lp-wrap">
          <div className="lp-tabs" role="tablist" aria-label="Screens">
            {SHOTS.map(s => (
              <button key={s.key} role="tab" aria-selected={shot.key === s.key} className={shot.key === s.key ? 'active' : ''} onClick={() => setShot(s)}>
                {s.label}
              </button>
            ))}
          </div>
          <p className="lp-shot-caption" aria-live="polite">{shot.caption}</p>
        </div>
      </section>

      {/* ── Trust strip ── */}
      <section className="lp-strip" aria-label="Key properties">
        <div className="lp-wrap lp-strip-grid">
          <div><ShieldCheck size={22} /><span>Consent-based sharing</span></div>
          <div><MessageSquareQuote size={22} /><span>Answers show their source</span></div>
          <div><History size={22} /><span>Tamper-resistant access log</span></div>
          <div><WifiOff size={22} /><span>Works without an AI service</span></div>
          <div><Type size={22} /><span>Low-vision typeface, large targets</span></div>
        </div>
      </section>

      {/* ── Who it is for ── */}
      <section className="lp-section">
        <div className="lp-wrap">
          <p className="v-eyebrow">One record, three perspectives</p>
          <h2>Built around the person, with the care team alongside</h2>
          <div className="lp-cards">
            <article className="lp-card spot">
              <span className="lp-ico"><BookHeart size={24} /></span>
              <h3>The person living with dementia</h3>
              <ul>
                <li>Photos with voice notes in a familiar voice</li>
                <li>A Memory Book of people, places and daily routines</li>
                <li>Ask Cara by voice or typing, in English or Urdu</li>
                <li>Decide who sees what, and stop sharing any time</li>
              </ul>
            </article>
            <article className="lp-card spot">
              <span className="lp-ico lp-ico-accent"><HeartHandshake size={24} /></span>
              <h3>Family caregivers</h3>
              <ul>
                <li>Ask to join the care team; the person approves</li>
                <li>Add memories, clearly labelled as added by a helper</li>
                <li>Shared care diary that cannot be silently edited</li>
                <li>Alerts only when the person allows them</li>
              </ul>
            </article>
            <article className="lp-card spot">
              <span className="lp-ico lp-ico-info"><Stethoscope size={24} /></span>
              <h3>Clinicians</h3>
              <ul>
                <li>Assigned patients only, never the whole database</li>
                <li>Appointments, medicines and MMSE trend, shown as score bands</li>
                <li>Non-diagnostic summaries of caregiver observations</li>
                <li>Record supported or representative decision-making</li>
              </ul>
            </article>
          </div>
        </div>
      </section>

      {/* ── How Cara answers ── */}
      <section className="lp-section lp-alt" id="how">
        <div className="lp-wrap lp-two">
          <div>
            <p className="v-eyebrow">How it works</p>
            <h2>An assistant that would rather say “I’m not sure” than guess</h2>
            <p className="lp-body">For someone with memory loss, a confident wrong answer about their own life can be distressing, and they may not be able to tell. So Cara is built to stay inside the evidence.</p>
          </div>
          <ol className="lp-steps">
            <li><span>1</span><div><strong>Safety first.</strong> Urgent messages, such as a fall or feeling lost, get a fixed safe reply, and the people the person chose are alerted. Medicine questions go to the doctor.</div></li>
            <li><span>2</span><div><strong>Find the right memories.</strong> Search by words, by meaning and by context, such as who is named or what time of day it is. This runs on the server; no memory text is sent away for this step.</div></li>
            <li><span>3</span><div><strong>Answer only from them.</strong> If nothing relevant exists, Cara says she is not sure. Otherwise she writes a short reply using only those memories.</div></li>
            <li><span>4</span><div><strong>Check before showing.</strong> Any name, place or date not found in the memories is caught. The reply is corrected once, or replaced with the memory itself.</div></li>
            <li><span>5</span><div><strong>Show the source.</strong> The photo or memory behind the answer appears with it, so the person and family can recognise it and check it.</div></li>
          </ol>
        </div>
      </section>

      {/* ── Privacy ── */}
      <section className="lp-section" id="privacy">
        <div className="lp-wrap">
          <p className="v-eyebrow">Privacy by design</p>
          <h2>Being family, a doctor or an administrator grants nothing by itself</h2>
          <div className="lp-grid4">
            <div className="lp-feature"><Lock size={22} /><h3>Least privilege</h3><p>Thirteen specific permissions, such as “listen to voice recordings” or “read care notes”, each granted on purpose.</p></div>
            <div className="lp-feature"><Users size={22} /><h3>The person decides</h3><p>Caregiver access starts as a request. Restricting sharing is always possible. A representative must be recorded by a clinician, with written evidence.</p></div>
            <div className="lp-feature"><Eye size={22} /><h3>Transparent</h3><p>A plain-language log of who opened which photo or record, readable by the person themself.</p></div>
            <div className="lp-feature"><FileCheck2 size={22} /><h3>Accountable</h3><p>The audit log cannot be edited or deleted. Deleted memories can be restored for 30 days, and the person is told.</p></div>
          </div>
          <p className="lp-small">Administrators manage accounts but cannot view any patient’s photos, recordings, notes or conversations.</p>
        </div>
      </section>

      {/* ── Evidence ── */}
      <section className="lp-section lp-alt" id="evidence">
        <div className="lp-wrap">
          <p className="v-eyebrow">Evidence so far</p>
          <h2>What has been tested, and what has not</h2>
          <div className="lp-evidence">
            <div className="lp-stat"><strong>72</strong><span>automated tests on a real PostgreSQL database, covering access control, consent, media security and the assistant’s safeguards</span></div>
            <div className="lp-stat"><strong>0.02 → 0.83</strong><span>memory-retrieval quality (MRR@5) compared with the original design, on a held-out synthetic test set</span></div>
            <div className="lp-stat"><strong>22 / 22</strong><span>end-to-end browser checks across patient, caregiver, doctor and administrator roles</span></div>
          </div>
          <div className="lp-honest">
            <AlertTriangle size={20} />
            <p><strong>Not yet tested with patients.</strong> All evaluation data is synthetic. VAMORA has not been clinically evaluated and is not a medical device. The next steps are a clinician-reviewed evaluation of the assistant’s answers and, with ethics approval, a small usability study with people living with dementia and their families. I am looking for clinical collaborators for this.</p>
          </div>
        </div>
      </section>

      {/* ── Creator ── */}
      <section className="lp-section" id="creator">
        <div className="lp-wrap lp-creator">
          <div className="lp-creator-mark" aria-hidden="true">VA</div>
          <div className="lp-creator-body">
            <p className="v-eyebrow">About the creator</p>
            <h2>{CREATOR.name}</h2>
            <p className="lp-creator-role"><GraduationCap size={18} /> {CREATOR.role} · {CREATOR.institution}</p>
            <p className="lp-body">
              I designed and built VAMORA to explore how AI can support people with memory loss without taking away their voice: answers grounded in their own memories, and sharing decisions that stay with them.
              My interests are human-computer interaction, responsible AI and digital health.
            </p>
            <div className="lp-cta">
              <a className="lp-btn fill-btn" href={`mailto:${CREATOR.email}?subject=VAMORA`}><Mail size={18} /> {CREATOR.email}</a>
              <Link to="/login" className="lp-btn lp-btn-ghost">Try the demo</Link>
            </div>
            <p className="lp-small"><CheckCircle2 size={15} /> {CREATOR.project}. The original student version was co-developed with {CREATOR.coDeveloper}.</p>
          </div>
        </div>
      </section>

      <footer className="lp-foot">
        <div className="lp-wrap lp-foot-inner">
          <Logo size={22} />
          <p>© {CREATOR.year} {CREATOR.name} · <a href={`mailto:${CREATOR.email}`}>{CREATOR.email}</a></p>
          <p className="lp-foot-note"><ShieldCheck size={14} /> Research prototype. Not a medical device. Demo data is fictional.</p>
        </div>
      </footer>
    </div>
  );
}
