export async function api(path, options = {}) {
  const res = await fetch(path, options);
  const contentType = res.headers.get('content-type') || '';
  const isJson = contentType.includes('application/json');
  const body = isJson ? await res.json() : await res.text();

  if (!res.ok) {
    const message = (isJson && body && body.message) ? body.message
                  : (typeof body === 'string' && body) || `HTTP ${res.status}`;
    throw new Error(message);
  }
  return body;
}
