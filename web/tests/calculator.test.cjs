const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

const moduleContext = { exports: {} };
vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(__dirname, '../src/utils/calculator.ts'), 'utf8'), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
}).outputText, { module: moduleContext, exports: moduleContext.exports });
const { calculatorReducer, initialCalculatorState } = moduleContext.exports;
const run = (...keys) => keys.reduce(calculatorReducer, initialCalculatorState);

test('basic arithmetic, sequential operations and operator correction', () => {
    assert.equal(run('1', '2', '×', '3', '=').display, '36');
    assert.equal(run('9', '÷', '4', '=').display, '2.25');
    assert.equal(run('2', '+', '3', '×', '4', '=').display, '20');
    assert.equal(run('9', '+', '-', '2', '=').display, '7');
    assert.equal(run('2', '-', '5', '=').display, '-3');
});

test('percentages support discounts, markups and standalone percentages', () => {
    assert.equal(run('2', '0', '0', '+', '1', '0', '%', '=').display, '220');
    assert.equal(run('2', '0', '0', '-', '1', '0', '%', '=').display, '180');
    assert.equal(run('2', '0', '0', '×', '1', '0', '%', '=').display, '20');
    assert.equal(run('2', '5', '%').display, '0.25');
});

test('decimal entry, edits and results avoid floating point artifacts', () => {
    assert.equal(run('.', '1', '+', '.', '2', '=').display, '0.3');
    assert.equal(run('1', '.', '.', '5').display, '1.5');
    assert.equal(run('1', '2', 'backspace', '3').display, '13');
    assert.equal(run('2', '±', 'backspace').display, '0');
    assert.equal(run('2', '+', '3', '=', '7').display, '7');
    assert.equal(run('2', '+', '3', '=', '×', '4', '=').display, '20');
});

test('division by zero can be recovered with clear or a new number', () => {
    assert.equal(run('1', '÷', '0', '=').display, 'Error');
    assert.equal(run('1', '÷', '0', '=', 'AC').display, '0');
    assert.equal(run('1', '÷', '0', '=', '5', '+', '2', '=').display, '7');
});
