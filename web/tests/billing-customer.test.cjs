const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

function customerService(api) {
  const module = { exports: {} };
  const source = fs.readFileSync(path.join(__dirname, '../src/services/customerService.ts'), 'utf8');
  vm.runInNewContext(ts.transpileModule(source, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, esModuleInterop: true },
  }).outputText, {
    module, exports: module.exports,
    require: (name) => { assert.equal(name, '../lib/api'); return api; },
  });
  return module.exports.CustomerService;
}

const input = { name: 'Anita', phone: '9876543210' };

test('billing saves a new name and phone in the customer directory', async () => {
  const service = customerService({
    get: async (url, options) => {
      assert.equal(url, '/customers');
      assert.equal(options.params.q, input.phone);
      return { data: { data: [{ id: 'other', name: 'Other', phone: '9876543211' }] } };
    },
    post: async (url, payload) => {
      assert.equal(url, '/customers');
      assert.equal(payload.name, input.name);
      assert.equal(payload.phone, input.phone);
      return { data: { data: { ...input, id: 'cloud-id', _local_id: 'local-id' } } };
    },
  });
  const customer = await service.findOrCreateCustomer(input);
  assert.equal(customer.id, 'local-id');
  assert.equal(customer.name, input.name);
  assert.equal(customer.phone, input.phone);
});

test('billing reuses an exact phone match without creating or renaming the customer', async () => {
  const service = customerService({
    get: async () => ({ data: { data: [{ ...input, name: 'Saved name', id: 'existing' }] } }),
    post: async () => assert.fail('must not create a duplicate'),
  });
  const customer = await service.findOrCreateCustomer(input);
  assert.equal(customer.id, 'existing');
  assert.equal(customer.name, 'Saved name');
});

test('a failed customer lookup stops creation so the cashier can retry', async () => {
  const service = customerService({
    get: async () => { throw new Error('Connection lost'); },
    post: async () => assert.fail('must not save after an unsuccessful lookup'),
  });
  await assert.rejects(service.findOrCreateCustomer(input), /Connection lost/);
});

for (const phone of ['+91 98765 43210', '98765-43210', '0091 9876543210', '09876543210']) {
  test(`billing accepts pasted phone format: ${phone}`, async () => {
    const service = customerService({
      get: async (_url, options) => {
        assert.equal(options.params.q, input.phone);
        return { data: { data: [] } };
      },
      post: async (_url, payload) => {
        assert.equal(payload.phone, input.phone);
        assert.equal(payload.name, input.name);
        return { data: { data: { ...payload, id: 'new-customer' } } };
      },
    });
    assert.equal((await service.findOrCreateCustomer({ name: '  Anita  ', phone })).phone, input.phone);
  });
}

test('invalid or incomplete phone numbers never create a customer', async () => {
  const service = customerService({ get: async () => assert.fail('validation must happen before lookup') });
  for (const phone of ['98765', '1234567890', 'Anita 9876543210']) {
    await assert.rejects(service.findOrCreateCustomer({ name: 'Anita', phone }), /valid 10-digit/);
  }
  await assert.rejects(service.findOrCreateCustomer({ name: ' ', phone: input.phone }), /name is required/);
});
