import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';
import './moment-delete.css';
import './remember-range.css';
import './media-lightbox-dom.css';
import './moment-anchor-hover.css';
import './quality-improvements.css';

const root = document.getElementById('root');
if (!root) throw new Error('Missing #root element.');

ReactDOM.createRoot(root).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
