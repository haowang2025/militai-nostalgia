import React from 'react';
import ReactDOM from 'react-dom/client';
import SearchFirstApp from './SearchFirstApp';
import './index.css';
import './moment-delete.css';
import './remember-range.css';
import './media-lightbox-dom.css';
import './moment-anchor-hover.css';
import './quality-improvements.css';
import './search-first-base.css';
import './search-first-player.css';
import './legacy-subpages.css';

const root = document.getElementById('root');
if (!root) throw new Error('Missing #root element.');

ReactDOM.createRoot(root).render(
  <React.StrictMode>
    <SearchFirstApp />
  </React.StrictMode>,
);
