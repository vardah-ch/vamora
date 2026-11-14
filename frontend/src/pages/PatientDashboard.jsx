import { useState, useEffect } from 'react';
import { Camera, MessageCircle, Smile, Scan, Calendar, Clock, BookHeart, ShieldCheck, CalendarDays, Pill } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import api from '../services/api';
import { usePreferences } from '../hooks/usePreferences';
import './PatientDashboard.css';

const PatientDashboard = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [currentTime, setCurrentTime] = useState(new Date());
  const [appointments, setAppointments] = useState([]);
  const [medications, setMedications] = useState([]);
  const [privacyTodo, setPrivacyTodo] = useState({ pending: 0, review: 0 });
  usePreferences(); // applies the person's text-size preference
  const patientName = user?.profile?.name?.split(' ')[0] || 'Patient';

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 30000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    fetchAppointments();
    fetchMedications();
    api.get('/privacy/overview')
      .then(({ data }) => setPrivacyTodo({
        pending: data.grants.filter(g => g.status === 'pending').length,
        review: data.grants.filter(g => g.status === 'active' && g.needsReview).length
      }))
      .catch(() => {});
  }, []);

  const fetchAppointments = async () => {
    try {
      const { data } = await api.get('/caregiver/my-appointments');
      setAppointments(data);
    } catch (err) {
      console.error('Error fetching appointments:', err);
    }
  };

  const fetchMedications = async () => {
    try {
      const { data } = await api.get('/doctor/my-medications');
      setMedications(data);
    } catch (err) {
      console.error('Error fetching medications:', err);
    }
  };

  const getGreeting = () => {
    const hour = currentTime.getHours();
    if (hour < 12) return 'Good Morning';
    if (hour < 18) return 'Good Afternoon';
    return 'Good Evening';
  };

  const formatDate = (date) => date.toLocaleDateString('en-US', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
  });

  const formatTime = (date) => date.toLocaleTimeString('en-US', {
    hour: 'numeric', minute: '2-digit'
  });

  const formatAppointmentDate = (date) => new Date(date).toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit'
  });

  const isToday = (date) => {
    const d = new Date(date);
    const today = new Date();
    return d.getDate() === today.getDate() &&
      d.getMonth() === today.getMonth() &&
      d.getFullYear() === today.getFullYear();
  };

  const isTomorrow = (date) => {
    const d = new Date(date);
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    return d.getDate() === tomorrow.getDate() &&
      d.getMonth() === tomorrow.getMonth() &&
      d.getFullYear() === tomorrow.getFullYear();
  };

  const getAppointmentLabel = (date) => {
    if (isToday(date)) return { label: 'Today', color: '#a33a2c' };
    if (isTomorrow(date)) return { label: 'Tomorrow', color: '#9a5f12' };
    return { label: null, color: '#2c5a7a' };
  };

  return (
    <div className="patient-dashboard-container">
      <header className="dashboard-header">
        <div className="greeting-section">
          <h1 className="greeting-title">{getGreeting()}, {patientName}!</h1>
          <div className="datetime-info">
            <div className="date-display">
              <Calendar size={28} />
              <span>{formatDate(currentTime)}</span>
            </div>
            <div className="time-display">
              <Clock size={28} />
              <span>{formatTime(currentTime)}</span>
            </div>
          </div>
        </div>
      </header>

      {(privacyTodo.pending > 0 || privacyTodo.review > 0) && (
        <div className="privacy-banner" role="status">
          <ShieldCheck size={28} aria-hidden="true" />
          <p>
            {privacyTodo.pending > 0
              ? `${privacyTodo.pending === 1 ? 'Someone is' : `${privacyTodo.pending} people are`} asking to help you. Please choose what to share.`
              : 'Please check who can see your information.'}
          </p>
          <button onClick={() => navigate('/my-privacy')}>Open My Privacy</button>
        </div>
      )}

      {/* Appointment Reminders */}
      {appointments.length > 0 && (
        <div className="appointments-section">
          <h2 className="appointments-title">Upcoming Appointments</h2>
          <div className="appointments-list">
            {appointments.map(a => {
              const { label, color } = getAppointmentLabel(a.appointmentDate);
              return (
                <div key={a.id} className="appointment-card" style={{ borderLeft: `4px solid ${color}` }}>
                  <div className="appointment-icon"><CalendarDays size={22} /></div>
                  <div className="appointment-info">
                    <p className="appointment-title">{a.title}</p>
                    {a.doctorName && <p className="appointment-sub">{a.doctorName}</p>}
                    {a.appointmentType && <p className="appointment-sub">{a.appointmentType}</p>}
                    <p className="appointment-date" style={{ color }}>
                      {formatAppointmentDate(a.appointmentDate)}
                    </p>
                  </div>
                  {label && (
                    <div className="appointment-badge" style={{ background: color }}>
                      {label}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Medication Reminders */}
      {medications.length > 0 && (
        <div className="appointments-section">
          <h2 className="appointments-title">My medicines</h2>
          <div className="appointments-list">
            {medications.map(m => (
              <div key={m.id} className="appointment-card" style={{ borderLeft: '4px solid #2e6b4e' }}>
                <div className="appointment-icon"><Pill size={22} /></div>
                <div className="appointment-info">
                  <p className="appointment-title">{m.medicationName}</p>
                  {m.dosage && <p className="appointment-sub">Dose: {m.dosage}</p>}
                  {m.frequency && <p className="appointment-sub">{m.frequency}</p>}
                  {m.timing && (
                    <p className="appointment-date" style={{ color: '#2e6b4e' }}>
                      {m.timing}
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <main className="dashboard-main">
        <h2 className="section-title">My Memory Lane</h2>

        <div className="action-buttons-grid">
          <button
            className="action-button spot tilt photos-button"
            onClick={() => navigate('/photo-gallery')}
            aria-label="View your photos and memories"
          >
            <div className="button-icon">
              <Camera size={64} strokeWidth={1.5} />
            </div>
            <h3 className="button-title">My Photos</h3>
            <p className="button-description">See your photos and listen to voice notes</p>
          </button>

          <button
            className="action-button spot tilt companion-button"
            onClick={() => navigate('/talk-to-companion')}
            aria-label="Talk to your memory companion"
          >
            <div className="button-icon">
              <MessageCircle size={64} strokeWidth={1.5} />
            </div>
            <h3 className="button-title">Talk with Cara</h3>
            <p className="button-description">Ask about your memories, by voice or typing</p>
          </button>

          <button
            className="action-button spot tilt memory-button"
            onClick={() => navigate('/mood-checkin')}
            aria-label="Check in your mood"
          >
            <div className="button-icon">
              <Smile size={64} strokeWidth={1.5} />
            </div>
            <h3 className="button-title">How Are You Feeling?</h3>
            <p className="button-description">Share how you feel today</p>
          </button>

          <button
            className="action-button spot tilt assess-button"
            onClick={() => navigate('/mood-assessment')}
            aria-label="Optional mood camera"
          >
            <div className="button-icon">
              <Scan size={64} strokeWidth={1.5} />
            </div>
            <h3 className="button-title">Mood Camera</h3>
            <p className="button-description">Optional: the camera makes a guess, you decide</p>
          </button>

          <button
            className="action-button spot tilt photos-button"
            onClick={() => navigate('/memory-book')}
            aria-label="Open your Memory Book"
          >
            <div className="button-icon">
              <BookHeart size={64} strokeWidth={1.5} />
            </div>
            <h3 className="button-title">My Memory Book</h3>
            <p className="button-description">People, places and your daily routine</p>
          </button>

          <button
            className="action-button spot tilt memory-button"
            onClick={() => navigate('/my-privacy')}
            aria-label="Choose who can see your information"
          >
            <div className="button-icon">
              <ShieldCheck size={64} strokeWidth={1.5} />
            </div>
            <h3 className="button-title">My Privacy</h3>
            <p className="button-description">Choose who can see your things</p>
          </button>
        </div>

        <div className="tips-section">
          <div className="tip-card">
            <p className="tip-text">Choose a card to begin. You can come back here any time with the Home button.</p>
          </div>
        </div>
      </main>
    </div>
  );
};

export default PatientDashboard;