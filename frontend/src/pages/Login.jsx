import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { AlertCircle, ArrowRight, Eye, EyeOff } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { Logo } from '../components/Glyphs';
import './Login.css';

const ROLE_HOME = { patient: '/patient-dashboard', caregiver: '/caregiver-dashboard', doctor: '/doctor-dashboard', super_admin: '/super-admin' };

// Demo accounts are shown only in development builds.
const DEMO = [
  { role: 'Patient', email: 'sarah.patient@vamora.com', password: 'password123' },
  { role: 'Caregiver', email: 'amna.caregiver@vamora.com', password: 'password123' },
  { role: 'Doctor', email: 'sarah.md@vamora.com', password: 'password123' }
];

const Login = () => {
  const navigate = useNavigate();
  const { login, isAuthenticated, user } = useAuth();
  const [formData, setFormData] = useState({ email: '', password: '' });
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (isAuthenticated && user) navigate(ROLE_HOME[user.role] || '/role-selection');
  }, [isAuthenticated, user, navigate]);

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
    if (error) setError('');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');
    try {
      const response = await login(formData.email, formData.password);
      navigate(ROLE_HOME[response.data.user.role] || '/role-selection');
    } catch (err) {
      setError(err.response?.data?.message || 'We could not sign you in. Please check your email and password.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="auth-shell">
      {/* ── Editorial side ── */}
      <aside className="auth-story" aria-hidden="true">
        <Logo size={30} light />
        <div className="auth-story-body">
          <p className="auth-kicker">Memory companion</p>
          <h2 className="auth-statement">The people, places and small routines that make a day feel like <em>yours</em>.</h2>
          <div className="polaroids tilt">
            <figure className="polaroid p1"><div className="ph ph-a" /><figcaption>Eid at home, 2023</figcaption></figure>
            <figure className="polaroid p2"><div className="ph ph-b" /><figcaption>Morning tea, 8:00</figcaption></figure>
            <figure className="polaroid p3"><div className="ph ph-c" /><figcaption>Amna — my daughter</figcaption></figure>
          </div>
        </div>
        <p className="auth-foot">Built for people living with dementia, their families and care teams.</p>
      </aside>

      {/* ── Form side ── */}
      <main className="auth-panel">
        <div className="auth-card">
          <div className="auth-mobile-logo"><Logo size={28} /></div>
          <h1 className="auth-title">Welcome back</h1>
          <p className="auth-sub">Sign in to continue to your memories and care team.</p>

          {error && (
            <div className="auth-alert" role="alert"><AlertCircle size={18} /><span>{error}</span></div>
          )}

          <form onSubmit={handleSubmit} className="auth-form" noValidate>
            <div className="field">
              <label htmlFor="email">Email address</label>
              <input type="email" id="email" name="email" value={formData.email} onChange={handleChange}
                placeholder="name@example.com" required autoComplete="email" />
            </div>
            <div className="field">
              <div className="field-row">
                <label htmlFor="password">Password</label>
                <Link to="/forgot-password" className="auth-link">Forgot password?</Link>
              </div>
              <div className="pw-wrap">
                <input type={showPassword ? 'text' : 'password'} id="password" name="password" value={formData.password}
                  onChange={handleChange} required autoComplete="current-password" />
                <button type="button" className="pw-toggle" onClick={() => setShowPassword(s => !s)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}>
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>
            <button type="submit" className="auth-submit fill-btn" disabled={isLoading}>
              <span>{isLoading ? 'Signing in…' : 'Sign in'}</span>
              {!isLoading && <ArrowRight size={18} />}
            </button>
          </form>

          {import.meta.env.DEV && (
            <div className="demo">
              <p className="demo-head">Demo accounts <span>development only</span></p>
              <div className="demo-list">
                {DEMO.map(d => (
                  <button key={d.email} type="button" className="demo-chip"
                    onClick={() => setFormData({ email: d.email, password: d.password })}>
                    <strong>{d.role}</strong><span>{d.email}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
};

export default Login;
