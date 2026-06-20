declare global {
  interface Window {
    __momentMediaZoomBound?: boolean;
  }
}

type ZoomSource = {
  kind: 'image' | 'video';
  src: string;
  label: string;
};

const closeZoom = () => {
  document.querySelector('.media-zoom-overlay')?.remove();
  document.body.classList.remove('media-zoom-open');
};

const openZoom = ({ kind, src, label }: ZoomSource) => {
  closeZoom();

  const overlay = document.createElement('div');
  overlay.className = 'media-zoom-overlay';
  overlay.setAttribute('role', 'presentation');

  const panel = document.createElement('section');
  panel.className = 'media-zoom-panel';
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-modal', 'true');
  panel.setAttribute('aria-label', label || 'Moment media preview');

  const closeButton = document.createElement('button');
  closeButton.className = 'media-zoom-close';
  closeButton.type = 'button';
  closeButton.textContent = '关闭';

  const mediaWrap = document.createElement('div');
  mediaWrap.className = 'media-zoom-content';

  if (kind === 'image') {
    const image = document.createElement('img');
    image.src = src;
    image.alt = label || 'Moment image';
    mediaWrap.appendChild(image);
  } else {
    const video = document.createElement('video');
    video.src = src;
    video.controls = true;
    video.autoplay = true;
    video.playsInline = true;
    mediaWrap.appendChild(video);
  }

  const caption = document.createElement('p');
  caption.className = 'media-zoom-caption';
  caption.textContent = label;

  panel.append(closeButton, mediaWrap);
  if (label) panel.appendChild(caption);
  overlay.appendChild(panel);
  document.body.appendChild(overlay);
  document.body.classList.add('media-zoom-open');

  closeButton.focus();
  closeButton.addEventListener('click', closeZoom);
  overlay.addEventListener('click', closeZoom);
  panel.addEventListener('click', (event) => event.stopPropagation());
};

const readLabel = (preview: Element) =>
  preview.querySelector('span, figcaption')?.textContent?.trim() || preview.getAttribute('aria-label') || 'Moment media';

if (!window.__momentMediaZoomBound) {
  window.__momentMediaZoomBound = true;

  document.addEventListener(
    'click',
    (event) => {
      const target = event.target;
      if (!(target instanceof Element)) return;

      const preview = target.closest('.media-preview.image-preview, .media-preview.video-preview');
      if (!preview) return;

      const image = preview.querySelector('img');
      const video = preview.querySelector('video');
      const src = image?.src || video?.currentSrc || video?.src;
      if (!src) return;

      event.preventDefault();
      event.stopPropagation();
      if ('stopImmediatePropagation' in event) event.stopImmediatePropagation();

      openZoom({ kind: image ? 'image' : 'video', src, label: readLabel(preview) });
    },
    true,
  );

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') closeZoom();
  });
}

export {};
