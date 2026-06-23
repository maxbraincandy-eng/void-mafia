import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './styles/globals.css';

// Prevent browser swipe-back / forward gesture from navigating away.
// Push a sentinel state; every popstate re-pushes it so the user
// can never go "back" to a previous page (Google login, etc.).
window.history.pushState({ _void: 1 }, '', window.location.href);
window.addEventListener('popstate', () => {
  window.history.pushState({ _void: 1 }, '', window.location.href);
});

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
