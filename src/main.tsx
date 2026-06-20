import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './media-lightbox-dom';
import './space-remember-dom';
import './blank-moment-dom';
import './progress-drag-dom';
import './moment-anchor-hover-dom';
import './index.css';
import './moment-delete.css';
import './remember-range.css';
import './media-lightbox-dom.css';
import './moment-anchor-hover.css';

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
