const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ts = require("typescript");

const source = fs.readFileSync(
  path.join(__dirname, "../src/utils/coinPolicyDraft.ts"),
  "utf8",
);
const moduleUnderTest = { exports: {} };
vm.runInNewContext(
  ts.transpileModule(source, {
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.CommonJS,
    },
  }).outputText,
  { module: moduleUnderTest, exports: moduleUnderTest.exports },
);
const { coinPolicyDraft, parseCoinPolicyDraft } = moduleUnderTest.exports;
const policy = {
  version: 7,
  enabled: true,
  rate_bps: 755,
  minimum_sale_paise: 50050,
  earning_cap_paise: 2525,
  redemption_limit_percent: 20,
  expiry_days: 90,
};
const draft = () => ({
  ...coinPolicyDraft(policy),
  reason: "  Set purchase threshold  ",
});

test("settings preserve saved money, fractional rates and optimistic policy version", () => {
  assert.equal(coinPolicyDraft(policy).minimumSale, "500.5");
  assert.equal(coinPolicyDraft(policy).earningCap, "25.25");
  assert.equal(coinPolicyDraft(policy).rate, "7.55");
  assert.deepEqual(
    JSON.parse(JSON.stringify(parseCoinPolicyDraft(draft(), 7))),
    { ...policy, reason: "Set purchase threshold" },
  );
});

test("decimal currency becomes integer paise without floating point residue", () => {
  const parsed = parseCoinPolicyDraft(
    { ...draft(), minimumSale: "19.99", earningCap: "0.29", rate: "5.01" },
    8,
  );
  assert.equal(parsed.minimum_sale_paise, 1999);
  assert.equal(parsed.earning_cap_paise, 29);
  assert.equal(parsed.rate_bps, 501);
  assert.equal(parsed.version, 8);
});

test("zero thresholds, no cap, blocked redemption and paused earning remain explicit", () => {
  const parsed = parseCoinPolicyDraft(
    {
      ...draft(),
      enabled: false,
      minimumSale: "0",
      earningCap: "0",
      redemptionLimit: "0",
    },
    0,
  );
  assert.equal(parsed.enabled, false);
  assert.equal(parsed.minimum_sale_paise, 0);
  assert.equal(parsed.earning_cap_paise, 0);
  assert.equal(parsed.redemption_limit_percent, 0);
});

test("blank, non-finite, negative and over-precise financial thresholds cannot be saved", () => {
  for (const key of ["minimumSale", "earningCap"]) {
    for (const value of [
      "",
      " ",
      "NaN",
      "Infinity",
      "-0.01",
      "1.001",
      "10000000.01",
    ]) {
      assert.throws(
        () => parseCoinPolicyDraft({ ...draft(), [key]: value }, 7),
        undefined,
        `${key}: ${value}`,
      );
    }
  }
});

test("earning rates, redemption percentages and validity follow server ranges", () => {
  for (const [key, values] of Object.entries({
    rate: ["4.99", "10.01", "5.001", ""],
    redemptionLimit: ["-1", "101", "20.5", ""],
    expiryDays: ["0", "366", "30.5", ""],
  })) {
    for (const value of values)
      assert.throws(() =>
        parseCoinPolicyDraft({ ...draft(), [key]: value }, 7),
      );
  }
  const parsed = parseCoinPolicyDraft(
    {
      ...draft(),
      rate: "10",
      redemptionLimit: "100",
      expiryDays: "365",
      minimumSale: "10000000",
    },
    7,
  );
  assert.equal(parsed.minimum_sale_paise, 1000000000);
  assert.equal(parsed.expiry_days, 365);
});

test("policy edits require a trimmed audit reason of 3–500 characters", () => {
  for (const reason of ["", "  ", " ab ", "x".repeat(501)])
    assert.throws(() => parseCoinPolicyDraft({ ...draft(), reason }, 7));
  assert.equal(
    parseCoinPolicyDraft({ ...draft(), reason: " abc " }, 7).reason,
    "abc",
  );
});
