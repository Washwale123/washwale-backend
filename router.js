class Router {
  constructor() { this.routes = []; }

  add(method, pattern, handler) {
    const paramNames = [];
    const regexStr = pattern
      .split('/')
      .map((seg) => {
        if (seg.startsWith(':')) { paramNames.push(seg.slice(1)); return '([^/]+)'; }
        return seg.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      })
      .join('/');
    const regex = new RegExp(`^${regexStr}/?$`);
    this.routes.push({ method, regex, paramNames, handler });
  }

  get(p, h) { this.add('GET', p, h); }
  post(p, h) { this.add('POST', p, h); }
  patch(p, h) { this.add('PATCH', p, h); }
  delete(p, h) { this.add('DELETE', p, h); }

  match(method, pathname) {
    for (const route of this.routes) {
      if (route.method !== method) continue;
      const m = route.regex.exec(pathname);
      if (m) {
        const params = {};
        route.paramNames.forEach((name, i) => { params[name] = decodeURIComponent(m[i + 1]); });
        return { handler: route.handler, params };
      }
    }
    return null;
  }
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (chunk) => { data += chunk; });
    req.on('end', () => {
      if (!data) return resolve({});
      try { resolve(JSON.parse(data)); } catch (e) { reject(new Error('Invalid JSON body')); }
    });
    req.on('error', reject);
  });
}

function sendJson(res, status, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'GET,POST,PATCH,DELETE,OPTIONS',
  });
  res.end(body);
}

module.exports = { Router, readBody, sendJson };
