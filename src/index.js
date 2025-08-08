import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import App from './App.js';



// ✅ Console log so you know this file is compiling
console.log("index.js LIVE fingerprint: ROBO-REX-FP-78931");

const root = ReactDOM.createRoot(document.getElementById('root'));

root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

// ✅ Explicitly unregister service workers to avoid stale builds
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.getRegistrations().then(registrations => {
    for (let registration of registrations) {
      registration.unregister();
      console.log("🗑 Service Worker unregistered:", registration);
    }
  });
}
