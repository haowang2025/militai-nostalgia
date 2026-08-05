import { useEffect, useRef, useState } from 'react';
import type { MomentMedia } from '../../types';
import { deleteMediaFile, loadMediaBlob, saveMediaFile } from '../moments/mediaRepository';

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
  const activeRef = useRef(true);
  const draftRef = useRef(draft);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  draftRef.current = draft;

  useEffect(() => {
    activeRef.current = true;
    return () => {
      activeRef.current = false;
    };
  }, []);

  const addFiles = async (files: FileList | null) => {
    if (!files?.length || isUploading) return;
    setIsUploading(true);
    setUploadError(null);

    const results = await Promise.allSettled(Array.from(files).map(saveMediaFile));
    const added = results.flatMap((result) => result.status === 'fulfilled' ? [result.value] : []);
    const failures = results.filter((result) => result.status === 'rejected');

    if (!activeRef.current) {
      await Promise.allSettled(
        added.flatMap((item) => item.storage_key ? [deleteMediaFile(item.storage_key)] : []),
      );
      return;
    }

    if (added.length) {
      const current = draftRef.current;
      onChange({ ...current, media: [...current.media, ...added] });
    }
    if (failures.length) {
      const firstFailure = failures[0];
      const detail = firstFailure?.status === 'rejected' && firstFailure.reason instanceof Error
        ? firstFailure.reason.message
        : '部分媒体文件无法保存。';
      setUploadError(failures.length === results.length ? detail : `${failures.length} 个文件未能保存：${detail}`);
    }
    setIsUploading(false);
  };

  const close = () => {
    if (!isUploading) onCancel();
  };

  return (
    <div className="sf-modal-backdrop" role="presentation" onClick={close}>
      <section className="sf-moment-editor" role="dialog" aria-modal="true" aria-label="编辑 Moment" aria-busy={isUploading} onClick={(event) => event.stopPropagation()}>
        <div className="sf-editor-title"><h2>编辑 Moment</h2><button disabled={isUploading} onClick={close}>关闭</button></div>
        <label>这一刻让你想起了什么？
          <textarea autoFocus value={draft.note} placeholder="可以是一句话、一个人或一个画面。" onChange={(event) => onChange({ ...draft, note: event.target.value })} />
        </label>
        <label>标签
          <input value={draft.tagsText} placeholder="怀念，某个人，夏天" onChange={(event) => onChange({ ...draft, tagsText: event.target.value })} />
        </label>
        <label className="sf-upload">{isUploading ? '正在保存本地媒体…' : '添加本地媒体'}
          <input disabled={isUploading} type="file" multiple accept="image/*,audio/*,video/*" onChange={(event) => { void addFiles(event.target.files); event.currentTarget.value = ''; }} />
        </label>
        {uploadError ? <p className="sf-inline-status is-error" role="alert">{uploadError}</p> : null}
        {draft.media.length ? (
          <div className="sf-media-list">
            {draft.media.map((item, index) => (
              <div key={`${item.storage_key ?? item.url ?? item.caption ?? item.type}-${index}`}>
                <MediaAttachment item={item} />
                <button disabled={isUploading} onClick={() => onChange({ ...draft, media: draft.media.filter((_, itemIndex) => itemIndex !== index) })}>移除</button>
              </div>
            ))}
          </div>
        ) : null}
        <div className="sf-editor-actions">
          <button className="danger" disabled={isUploading} onClick={onDelete}>删除 Moment</button>
          <span />
          <button disabled={isUploading} onClick={close}>取消</button>
          <button className="primary" disabled={isUploading} onClick={onSave}>保存</button>
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
