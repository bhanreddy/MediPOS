const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const axios = require('axios');

const source = fs.readFileSync(path.join(__dirname, '../src/lib/apiBaseUrl.ts'), 'utf8')
  .replace('import.meta.env.VITE_API_URL', 'undefined');
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS },
}).outputText;
const moduleExports = {};
vm.runInNewContext(compiled, { exports: moduleExports });
const { resolveApiBaseUrl } = moduleExports;

test('bare deployed origins route dashboard and auth requests under /api', () => {
  for (const configured of ['https://nexmedapi.nexsyrus.com', 'https://nexmedapi.nexsyrus.com/']) {
    const api = axios.create({ baseURL: resolveApiBaseUrl(configured) });
    assert.equal(api.getUri({ url: '/reports/dashboard' }), 'https://nexmedapi.nexsyrus.com/api/reports/dashboard');
    assert.equal(api.getUri({ url: '/auth/me' }), 'https://nexmedapi.nexsyrus.com/api/auth/me');
  }
});

test('existing API paths and explicit proxy prefixes are preserved without trailing slashes', () => {
  for (const base of ['http://127.0.0.1:5001/api', 'https://example.com/api', '/api', '/proxy/api']) {
    assert.equal(resolveApiBaseUrl(` ${base}/// `), base);
  }
});

test('same-origin deployments use /api when no backend URL is configured', () => {
  for (const configured of [undefined, '', ' ', '/']) {
    assert.equal(resolveApiBaseUrl(configured), '/api');
  }
});
