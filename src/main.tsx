import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import CloudApp from './CloudApp';
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
import './cloud.css';

const normalizedPath = window.location.pathname.replace(/\/+$/, '');
const cloudMode = normalizedPath.endsWith('/cloud');

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    {cloudMode ? <CloudApp /> : <><App /><a className="cloud-entry-link" href="/nostalgia/cloud">网易云音乐</a></>}
  </React.StrictMode>,
);
