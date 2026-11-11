const test = require('node:test');
const assert = require('node:assert/strict');
const databaseModulePath = require.resolve('../../backend/src/config/db');
require.cache[databaseModulePath] = {
  id: databaseModulePath,
  filename: databaseModulePath,
  loaded: true,
  exports: { query: async () => [[]] }
};
const geminiUsage = require('../../backend/src/services/geminiUsageService');
const {
  summarizeQuotaMetrics,
  getPacificDayStart,
  getNextPacificMidnight
} = geminiUsage;
const financialService = require('../../backend/src/services/financialAnalysisService');
const { handleQuery } = require('../../backend/src/controllers/chatbotController');

test('quota percentage stays unavailable without a verified limit and usage pair', () => {
  const result = summarizeQuotaMetrics([]);
  assert.equal(result.availability, 'unavailable');
  assert.equal(result.percentUsed, null);
  assert.equal(result.percentRemaining, null);
  assert.equal(result.blocked, false);
});

test('default Gemini model order restores the previous Gemini-only fallback chain', () => {
  const originalModel = process.env.GEMINI_MODEL;
  const originalFallbacks = process.env.GEMINI_FALLBACK_MODELS;
  delete process.env.GEMINI_MODEL;
  delete process.env.GEMINI_FALLBACK_MODELS;
  try {
    assert.deepEqual(geminiUsage.getModelCandidates(), [
      'gemini-3.1-flash-lite',
      'gemini-flash-lite-latest',
      'gemini-3.5-flash-lite',
      'gemini-3.5-flash',
      'gemini-3.8-flash'
    ]);
  } finally {
    if (originalModel === undefined) delete process.env.GEMINI_MODEL;
    else process.env.GEMINI_MODEL = originalModel;
    if (originalFallbacks === undefined) delete process.env.GEMINI_FALLBACK_MODELS;
    else process.env.GEMINI_FALLBACK_MODELS = originalFallbacks;
  }
});

test('only verified quota measurements contribute to the percentage or 5% gate', () => {
  const result = summarizeQuotaMetrics([
    { verified: false, used: 99, limit: 100 },
    { verified: true, used: 94.9, limit: 100, label: 'requests per day' }
  ]);
  assert.equal(result.availability, 'available');
  assert.ok(Math.abs(result.percentUsed - 94.9) < 0.0001);
  assert.ok(Math.abs(result.percentRemaining - 5.1) < 0.0001);
  assert.equal(result.blocked, false);
});

test('verified quota at exactly 5% remaining blocks external Gemini requests', () => {
  const result = summarizeQuotaMetrics([
    { verified: true, used: 95, limit: 100, label: 'requests per day' }
  ]);
  assert.equal(result.percentUsed, 95);
  assert.equal(result.percentRemaining, 5);
  assert.equal(result.blocked, true);
});

test('missing Cloud Monitoring project data reports quota as unavailable instead of estimating it', async () => {
  const originalGoogleProject = process.env.GOOGLE_CLOUD_PROJECT;
  const originalGcpProject = process.env.GCP_PROJECT_ID;
  delete process.env.GOOGLE_CLOUD_PROJECT;
  delete process.env.GCP_PROJECT_ID;
  geminiUsage.invalidateQuotaCache();
  try {
    const status = await geminiUsage.getUsageStatus('gemini-3.8-flash');
    assert.equal(status.quota.availability, 'unavailable');
    assert.equal(status.quota.percentUsed, null);
    assert.equal(status.quota.percentRemaining, null);
    assert.equal(status.blocked, false);
    assert.match(status.quota.reason, /project ID is not configured/i);
  } finally {
    if (originalGoogleProject === undefined) delete process.env.GOOGLE_CLOUD_PROJECT;
    else process.env.GOOGLE_CLOUD_PROJECT = originalGoogleProject;
    if (originalGcpProject === undefined) delete process.env.GCP_PROJECT_ID;
    else process.env.GCP_PROJECT_ID = originalGcpProject;
    geminiUsage.invalidateQuotaCache();
  }
});

test('daily Gemini quota window uses the official Pacific reset date', () => {
  const now = new Date('2026-11-06T20:30:00.000Z');
  const start = getPacificDayStart(now);
  const reset = new Date(getNextPacificMidnight(now));
  const pacificDate = date => new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Los_Angeles', year: 'numeric', month: '2-digit', day: '2-digit'
  }).format(date);
  const pacificTime = date => new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Los_Angeles', hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
  }).format(date);

  assert.equal(pacificTime(start), '00:00');
  assert.equal(pacificTime(reset), '00:00');
  assert.notEqual(pacificDate(start), pacificDate(reset));
});

test('backend blocks Gemini at 5% remaining and automatically allows it above the threshold', async () => {
  const originalGetUsageStatus = geminiUsage.getUsageStatus;
  const originalGetOverallSummary = financialService.getOverallSummary;
  const originalFetch = global.fetch;
  const originalApiKey = process.env.GEMINI_API_KEY;
  const originalModel = process.env.GEMINI_MODEL;
  const originalFallbacks = process.env.GEMINI_FALLBACK_MODELS;
  let requestStatus = {
    currentModel: 'gemini-3.8-flash',
    availability: 'quota_limited',
    availabilityMessage: 'Verified quota has 5% or less remaining.',
    blocked: true,
    warning: 'Gemini requests are paused by the verified quota gate.',
    quota: {
      availability: 'available', percentUsed: 95, percentRemaining: 5,
      selectedMetric: { used: 95, limit: 100, dimension: 'Requests', label: 'requests per day' },
      metrics: []
    },
    backendObserved: {}
  };
  let geminiCalls = 0;

  process.env.GEMINI_API_KEY = 'test-key';
  process.env.GEMINI_MODEL = 'gemini-3.8-flash';
  delete process.env.GEMINI_FALLBACK_MODELS;
  geminiUsage.getUsageStatus = async () => requestStatus;
  financialService.getOverallSummary = async () => ({
    totalIncome: 1000,
    totalExpenses: 200,
    remainingBalance: 800,
    totalIncomeFormatted: '₱1,000.00',
    totalExpensesFormatted: '₱200.00',
    remainingBalanceFormatted: '₱800.00'
  });
  global.fetch = async url => {
    geminiCalls += 1;
    if (String(url).includes('/models/gemini-test-missing:')) {
      return {
        ok: false,
        status: 404,
        json: async () => ({ error: { message: 'Model not found.' } })
      };
    }
    return {
      ok: true,
      status: 200,
      json: async () => ({
        candidates: [{ content: { parts: [{ text: 'Gemini generated this verified financial explanation.' }] } }],
        usageMetadata: { promptTokenCount: 12, candidatesTokenCount: 8, totalTokenCount: 20 }
      })
    };
  };

  const invoke = async () => {
    let responseBody;
    const response = { json(value) { responseBody = value; return response; } };
    await handleQuery({ body: { message: 'What is our total balance?' } }, response);
    return responseBody;
  };

  try {
    const blockedResponse = await invoke();
    assert.equal(geminiCalls, 0);
    assert.equal(blockedResponse.data.reason, 'quota_low');
    assert.equal(blockedResponse.data.usageStatus.blocked, true);

    requestStatus = {
      ...requestStatus,
      availability: 'available', blocked: false, warning: null,
      quota: { ...requestStatus.quota, percentUsed: 94, percentRemaining: 6 }
    };
    const restoredResponse = await invoke();
    assert.equal(geminiCalls, 1);
    assert.equal(restoredResponse.data.source, 'ai');

    process.env.GEMINI_MODEL = 'gemini-test-missing';
    process.env.GEMINI_FALLBACK_MODELS = 'gemini-3.8-flash';
    const fallbackResponse = await invoke();
    assert.equal(geminiCalls, 3);
    assert.equal(fallbackResponse.data.source, 'ai');
    assert.equal(fallbackResponse.data.model, 'gemini-3.8-flash');
  } finally {
    geminiUsage.getUsageStatus = originalGetUsageStatus;
    financialService.getOverallSummary = originalGetOverallSummary;
    global.fetch = originalFetch;
    if (originalApiKey === undefined) delete process.env.GEMINI_API_KEY;
    else process.env.GEMINI_API_KEY = originalApiKey;
    if (originalModel === undefined) delete process.env.GEMINI_MODEL;
    else process.env.GEMINI_MODEL = originalModel;
    if (originalFallbacks === undefined) delete process.env.GEMINI_FALLBACK_MODELS;
    else process.env.GEMINI_FALLBACK_MODELS = originalFallbacks;
  }
});
