type Env = {
  NCM_ORIGIN: string;
  NCM_SECRET?: string;
  NCM_REAL_IP?: string;
};

type Context = {
  request: Request;
  env: Env;
};

const allowedAudioHost = (hostname: string) =>
  hostname === 'music.126.net'
  || hostname.endsWith('.music.126.net')
  || hostname === '163.com'
  || hostname.endsWith('.163.com');

async function proxyAudio(request: Request, requestUrl: URL) {
  const raw = requestUrl.searchParams.get('url');
  if (!raw) return new Response('Missing url', { status: 400 });
  let target: URL;
  try {
    target = new URL(raw);
  } catch {
    return new Response('Invalid url', { status: 400 });
  }
  if (!['http:', 'https:'].includes(target.protocol) || !allowedAudioHost(target.hostname)) {
    return new Response('Audio host is not allowed', { status: 403 });
  }
  const range = request.headers.get('Range');
  const upstream = await fetch(target.toString(), {
    headers: range ? { Range: range } : undefined,
    redirect: 'follow',
  });
  const headers = new Headers(upstream.headers);
  headers.set('Access-Control-Allow-Origin', '*');
  headers.set('Cache-Control', 'private, max-age=60');
  headers.delete('set-cookie');
  return new Response(upstream.body, { status: upstream.status, headers });
}

export const onRequest = async (context: Context) => {
  const requestUrl = new URL(context.request.url);
  if (requestUrl.pathname.endsWith('/api/audio-proxy')) return proxyAudio(context.request, requestUrl);
  if (!context.env.NCM_ORIGIN) return new Response('NCM_ORIGIN is not configured', { status: 503 });

  const origin = context.env.NCM_ORIGIN.replace(/\/+$/, '');
  const target = new URL(origin + requestUrl.pathname.replace(/^\/api/, '') + requestUrl.search);
  const realIp = context.env.NCM_REAL_IP || context.request.headers.get('CF-Connecting-IP');
  if (realIp && !target.searchParams.has('realIP')) target.searchParams.set('realIP', realIp);

  const headers = new Headers(context.request.headers);
  headers.delete('cookie');
  headers.delete('host');
  if (context.env.NCM_SECRET) headers.set('Authorization', `Bearer ${context.env.NCM_SECRET}`);

  const upstream = await fetch(new Request(target.toString(), {
    method: context.request.method,
    headers,
    body: context.request.method === 'GET' || context.request.method === 'HEAD' ? undefined : context.request.body,
    redirect: 'manual',
  }));
  const responseHeaders = new Headers(upstream.headers);
  responseHeaders.delete('set-cookie');
  responseHeaders.set('Cache-Control', 'no-store');
  return new Response(upstream.body, { status: upstream.status, headers: responseHeaders });
};
