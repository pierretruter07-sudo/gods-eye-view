/**
 * @file The CrossCheck page's calls to its API (same origin).
 * @module crosscheck/app/api
 */
const BASE = '/api/crosscheck';

async function call(path, options = {}) {
  let res;
  try {
    res = await fetch(BASE + path, options);
  } catch {
    throw new Error('Could not reach the CrossCheck server');
  }
  let body = null;
  try {
    body = await res.json();
  } catch {
    body = null;
  }
  if (!res.ok) throw new Error(body?.error || `The server answered ${res.status}`);
  return body;
}

export const api = {
  status: () => call('/status'),
  standards: () => call('/standards'),
  standard: (id) => call(`/standards/${encodeURIComponent(id)}`),
  facts: () => call('/facts'),
  signals: () => call('/signals'),
  example: () => call('/example'),
  intakeZip: (file) =>
    call('/intake', {
      method: 'POST',
      headers: { 'Content-Type': 'application/zip', 'X-Filename': file.name.replace(/[^\w.\- ]/g, '') },
      body: file,
    }),
  intakeGithub: (link) =>
    call('/intake', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ github: link }),
    }),
  assess: (body) =>
    call('/assess', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
};
