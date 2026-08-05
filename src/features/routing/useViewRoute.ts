import { useCallback, useEffect, useState } from 'react';

export type AppView = 'player' | 'library' | 'settings';

const viewFromPath = (path: string): AppView => {
  if (path.endsWith('/library')) return 'library';
  if (path.endsWith('/settings')) return 'settings';
  return 'player';
};

const basePath = () => window.location.pathname.startsWith('/nostalgia') ? '/nostalgia' : '';
const pathForView = (view: AppView) => {
  const base = basePath();
  if (view === 'library') return `${base}/library` || '/library';
  if (view === 'settings') return `${base}/settings` || '/settings';
  return base || '/';
};

export const useViewRoute = () => {
  const [view, setView] = useState<AppView>(() => viewFromPath(window.location.pathname));

  useEffect(() => {
    const handlePopState = () => setView(viewFromPath(window.location.pathname));
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  const navigate = useCallback((nextView: AppView) => {
    const nextPath = pathForView(nextView);
    if (window.location.pathname !== nextPath) window.history.pushState({}, '', nextPath);
    setView(nextView);
  }, []);

  return { view, navigate };
};
