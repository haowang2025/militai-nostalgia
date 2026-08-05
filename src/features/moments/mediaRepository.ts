import type { MomentMedia } from '../../types';

const DB_NAME = 'militai-nostalgia-media';
const DB_VERSION = 1;
const STORE_NAME = 'media';
export const MAX_MEDIA_FILE_BYTES = 25 * 1024 * 1024;

type MediaRecord = {
  id: string;
  blob: Blob;
  name: string;
  mimeType: string;
  size: number;
  createdAt: string;
};

const requestResult = <T>(request: IDBRequest<T>) =>
  new Promise<T>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('IndexedDB request failed.'));
  });

const transactionDone = (transaction: IDBTransaction) =>
  new Promise<void>((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error('IndexedDB transaction failed.'));
    transaction.onabort = () => reject(transaction.error ?? new Error('IndexedDB transaction was aborted.'));
  });

let databasePromise: Promise<IDBDatabase> | null = null;

const openDatabase = () => {
  if (!('indexedDB' in window)) return Promise.reject(new Error('This browser does not support IndexedDB.'));
  if (databasePromise) return databasePromise;

  databasePromise = new Promise<IDBDatabase>((resolve, reject) => {
    const request = window.indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(STORE_NAME)) database.createObjectStore(STORE_NAME, { keyPath: 'id' });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('Unable to open IndexedDB.'));
  });
  return databasePromise;
};

const mediaTypeFromMime = (mime: string): MomentMedia['type'] => {
  if (mime.startsWith('image/')) return 'image';
  if (mime.startsWith('audio/')) return 'audio';
  if (mime.startsWith('video/')) return 'video';
  return 'media';
};

export const saveMediaFile = async (file: File): Promise<MomentMedia> => {
  if (file.size > MAX_MEDIA_FILE_BYTES) throw new Error(`单个媒体文件不能超过 ${MAX_MEDIA_FILE_BYTES / 1024 / 1024} MB。`);
  const database = await openDatabase();
  const id = typeof crypto.randomUUID === 'function'
    ? `media_${crypto.randomUUID()}`
    : `media_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
  const mimeType = file.type || 'application/octet-stream';
  const record: MediaRecord = {
    id,
    blob: file,
    name: file.name,
    mimeType,
    size: file.size,
    createdAt: new Date().toISOString(),
  };
  const transaction = database.transaction(STORE_NAME, 'readwrite');
  transaction.objectStore(STORE_NAME).put(record);
  await transactionDone(transaction);
  return {
    type: mediaTypeFromMime(mimeType),
    storage_key: id,
    caption: file.name,
    role: 'memory_hook',
    source: 'user_upload',
    mime_type: mimeType,
    size_bytes: file.size,
  };
};

export const loadMediaBlob = async (storageKey: string) => {
  const database = await openDatabase();
  const transaction = database.transaction(STORE_NAME, 'readonly');
  const done = transactionDone(transaction);
  const record = await requestResult(transaction.objectStore(STORE_NAME).get(storageKey) as IDBRequest<MediaRecord | undefined>);
  await done;
  return record?.blob ?? null;
};

export const deleteMediaFile = async (storageKey: string) => {
  const database = await openDatabase();
  const transaction = database.transaction(STORE_NAME, 'readwrite');
  transaction.objectStore(STORE_NAME).delete(storageKey);
  await transactionDone(transaction);
};
