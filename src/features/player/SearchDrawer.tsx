import { useEffect, useRef } from 'react';
import type { SearchSong } from '../search/searchApi';
import { SearchPanel } from '../search/SearchPanel';
import type { LocalTrack } from '../tracks/trackStore';

export function SearchDrawer({
  tracks,
  onClose,
  onOpenTrack,
  onSelectSong,
}: {
  tracks: LocalTrack[];
  onClose: () => void;
  onOpenTrack: (track: LocalTrack) => void;
  onSelectSong: (song: SearchSong) => Promise<void>;
}) {
  const closeRef = useRef<HTMLButtonElement | null>(null);
  useEffect(() => {
    closeRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [onClose]);
  return (
    <div className="sf-drawer-backdrop" role="presentation" onClick={onClose}>
      <aside className="sf-search-drawer" role="dialog" aria-modal="true" aria-label="搜索歌曲" onClick={(event) => event.stopPropagation()}>
        <div className="sf-editor-title"><h2>搜索或切换歌曲</h2><button ref={closeRef} onClick={onClose}>关闭</button></div>
        <SearchPanel recentTracks={tracks.slice(0, 8)} onSelectSong={onSelectSong} onOpenTrack={onOpenTrack} autoFocus />
      </aside>
    </div>
  );
}
