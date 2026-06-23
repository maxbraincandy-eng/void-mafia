import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './styles/globals.css';

// ── Block browser back/forward navigation ─────────────────────────────

// 1. Sentinel entry — so user has to "go back" past us first
window.history.pushState({ _void: 1 }, '', location.href);

// 2. Every popstate (hardware back button, history.back()) re-pushes sentinel
window.addEventListener('popstate', () => {
  window.history.pushState({ _void: 1 }, '', location.href);
});

// 3. BFCache restore (Chrome Android swipe-back restores old JS context):
//    reload so React re-reads auth token from localStorage and shows the app.
window.addEventListener('pageshow', (e) => {
  if (e.persisted) {
    window.location.reload();
  }
});

// 4. Block left/right edge touch gestures (iOS Safari native back/forward swipe).
//    Must be non-passive so preventDefault() actually prevents the gesture.
document.addEventListener('touchstart', (e) => {
  const x = e.touches[0].clientX;
  if (x < 20 || x > window.innerWidth - 20) {
    e.preventDefault();
  }
}, { passive: false });

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
