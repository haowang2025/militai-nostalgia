import { useEffect, useState } from 'react';
import type { MomentMedia } from '../../types';
import { loadMediaBlob, saveMediaFile } from '../moments/mediaRepository';

export type MomentDraft = {
  momentId: string;
  note: string;
  tagsText: string;
  media: MomentMedia[];
  initialMediaKeys: string[];
};

export function MomentEditor({
  draft,
  onChange,
  onSave,
  onCancel,
  onDelete,
}: {
  draft: MomentDraft;
  onChange: (draft: MomentDraft) => void;
  onSave: () => void;
  onCancel: () => void;
  onDelete: () => void;
}) {
  const addFiles = async (files: FileList | null) => {
    if (!files?.length) return;
    const added = await Promise.all(Array.from(files).map(saveMediaFile));
    onChange({ ...draft, media: [...draft.media, ...added] });
  };

  return (
    <div className="sf-modal-backdrop" role="presentation" onClick={onCancel}>
      <section className="sf-moment-editor" role="dialog" aria-modal="true" aria-label="编辑 Moment" onClick={(event) => event.stopPropagation()}>
        <div className="sf-editor-title"><h2>编辑 Moment</h2><button onClick={onCancel}>关闭</button></div>
        <label>这一刻让你想起了什么？
          <textarea autoFocus value={draft.note} placeholder="可以是一句话、一个人或一个画面。" onChange={(event) => onChange({ ...draft, note: event.target.value })} />
        </label>
        <label>标签
          <input value={draft.tagsText} placeholder="怀念，某个人，夏天" onChange={(event) => onChange({ ...draft, tagsText: event.target.value })} />
        </label>
        <label className="sf-upload">添加本地媒体
          <input type="file" multiple accept="image/*,audio/*,video/*" onChange={(event) => { void addFiles(event.target.files); event.currentTarget.value = ''; }} />
        </label>
        {draft.media.length ? (
          <div className="sf-media-list">
            {draft.media.map((item, index) => (
              <div key={`${item.storage_key ?? item.url ?? item.caption ?? item.type}-${index}`}>
                <MediaAttachment item={item} />
                <button onClick={() => onChange({ ...draft, media: draft.media.filter((_, itemIndex) => itemIndex !== index) })}>移除</button>
              </div>
            ))}
          </div>
        ) : null}
        <div className="sf-editor-actions">
          <button className="danger" onClick={onDelete}>删除 Moment</button>
          <span />
          <button onClick={onCancel}>取消</button>
          <button className="primary" onClick={onSave}>保存</button>
        </div>
      </section>
    </div>
  );
}

function MediaAttachment({ item }: { item: MomentMedia }) {
  const [url, setUrl] = useState(item.url);
  useEffect(() => {
    if (item.url || !item.storage_key) return;
    let active = true;
    let objectUrl: string | null = null;
    void loadMediaBlob(item.storage_key).then((blob) => {
      if (!active || !blob) return;
      objectUrl = URL.createObjectURL(blob);
      setUrl(objectUrl);
    });
    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [item.storage_key, item.url]);

  if (item.type === 'image' && url) return <figure><img src={url} alt={item.caption ?? 'Moment image'} /><figcaption>{item.caption}</figcaption></figure>;
  if (item.type === 'audio' && url) return <div><span>{item.caption}</span><audio src={url} controls /></div>;
  if (item.type === 'video' && url) return <div><span>{item.caption}</span><video src={url} controls /></div>;
  return <span>{item.caption ?? item.type}</span>;
}
