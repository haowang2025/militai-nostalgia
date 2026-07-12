import { useEffect, useRef, useState } from 'react';
import { ncm } from '../../lib/ncm';
import { profileFromStatus, sanitizeNcmCookie, useAuthStore } from '../../store/auth';

type QrKeyResponse = { code?: number; data?: { code?: number; unikey?: string } };
type QrCreateResponse = { code?: number; data?: { qrimg?: string; qrurl?: string } };
type QrCheckResponse = { code?: number; message?: string; cookie?: string };

export default function QrLogin() {
  const authStatus = useAuthStore((state) => state.status);
  const setStatus = useAuthStore((state) => state.setStatus);
  const setSession = useAuthStore((state) => state.setSession);
  const [qrImage, setQrImage] = useState<string | null>(null);
  const [message, setMessage] = useState('连接网易云后，可播放需要登录的歌曲。');
  const [busy, setBusy] = useState(false);
  const pollTimer = useRef<number | null>(null);
  const keyRef = useRef<string | null>(null);

  const stopPolling = () => {
    if (pollTimer.current != null) window.clearInterval(pollTimer.current);
    pollTimer.current = null;
  };

  useEffect(() => stopPolling, []);

  const finishLogin = async (rawCookie: string) => {
    const cookie = sanitizeNcmCookie(rawCookie);
    if (!cookie) throw new Error('登录成功响应中没有 MUSIC_U');
    setSession(cookie, null);
    const payload = await ncm('/login/status');
    const profile = profileFromStatus(payload);
    if (profile) useAuthStore.getState().setProfile(profile);
    setMessage('网易云已连接');
    stopPolling();
  };

  const poll = async () => {
    const key = keyRef.current;
    if (!key) return;
    try {
      const result = await ncm<QrCheckResponse>('/login/qr/check', { key });
      if (result.code === 800) {
        stopPolling();
        setStatus('guest');
        setQrImage(null);
        setMessage('二维码已过期，请重新生成。');
      } else if (result.code === 801) {
        setStatus('pending');
        setMessage('等待扫码');
      } else if (result.code === 802) {
        setStatus('scanned');
        setMessage('已扫码，请在网易云 App 中确认');
      } else if (result.code === 803 && result.cookie) {
        await finishLogin(result.cookie);
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '登录状态轮询失败');
    }
  };

  const startLogin = async () => {
    stopPolling();
    setBusy(true);
    setMessage('正在生成二维码…');
    try {
      const keyResult = await ncm<QrKeyResponse>('/login/qr/key');
      const key = keyResult.data?.unikey;
      if (!key) throw new Error('未获取到登录 key');
      keyRef.current = key;
      const qrResult = await ncm<QrCreateResponse>('/login/qr/create', { key, qrimg: 1 });
      const image = qrResult.data?.qrimg;
      if (!image) throw new Error('未获取到二维码图片');
      setQrImage(image);
      setStatus('pending');
      setMessage('请使用网易云音乐 App 扫码');
      await poll();
      pollTimer.current = window.setInterval(() => void poll(), 2500);
    } catch (error) {
      setStatus('guest');
      setMessage(error instanceof Error ? error.message : '二维码生成失败');
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="cloud-login-card">
      <div>
        <span className="cloud-kicker">ACCOUNT</span>
        <h3>连接网易云</h3>
        <p>{message}</p>
      </div>
      {qrImage ? <img className="cloud-qr" src={qrImage} alt="网易云登录二维码" /> : null}
      <button type="button" onClick={() => void startLogin()} disabled={busy || authStatus === 'authed'}>
        {busy ? '生成中…' : qrImage ? '刷新二维码' : '扫码登录'}
      </button>
    </section>
  );
}
