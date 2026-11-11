// Gemini quota visibility and backend-observed usage.
// Official quota percentages are calculated only from matched Google Cloud
// Monitoring limit/usage series for the configured Gemini model.
const { GoogleAuth } = require('google-auth-library');

const MONITORING_SCOPE = 'https://www.googleapis.com/auth/monitoring.read';
const MONITORING_BASE = 'https://monitoring.googleapis.com/v3';
const CACHE_TTL_MS = 60_000;
const MAX_QUOTA_SAMPLE_AGE_MS = 5 * 60_000;
const PACIFIC_ZONE = 'America/Los_Angeles';
const PREVIOUS_GEMINI_MODEL_ORDER = [
  'gemini-3.1-flash-lite',
  'gemini-flash-lite-latest',
  'gemini-3.5-flash-lite',
  'gemini-3.5-flash',
  'gemini-3.8-flash'
];

let monitoringClientPromise = null;
let monitoringAuth = null;
let cachedQuota = null;
let cachedAt = 0;
let cachedModel = null;
let quotaRefreshPromise = null;

const processStartedAt = new Date().toISOString();
const observed = {
  attempts: 0,
  successfulRequests: 0,
  promptTokens: 0,
  outputTokens: 0,
  totalTokens: 0,
  tokenReports: 0,
  lastAttemptAt: null,
  lastSuccessAt: null,
  lastModel: null
};

let lastRequestState = { state: 'not_checked', statusCode: null, at: null };

function getConfiguredModel() {
  return process.env.GEMINI_MODEL?.trim() || PREVIOUS_GEMINI_MODEL_ORDER[0];
}

function getModelCandidates() {
  const configured = getConfiguredModel();
  const configuredFallbacks = String(process.env.GEMINI_FALLBACK_MODELS || '')
    .split(',')
    .map(model => model.trim())
    .filter(Boolean);
  const fallbacks = configuredFallbacks.length ? configuredFallbacks : PREVIOUS_GEMINI_MODEL_ORDER;
  return [...new Set([configured, ...fallbacks])];
}

function getProjectId() {
  return process.env.GOOGLE_CLOUD_PROJECT
    || process.env.GOOGLE_CLOUD_PROJECT_ID
    || process.env.GCP_PROJECT_ID
    || process.env.GCLOUD_PROJECT
    || '';
}

function getServiceAccountCredentials() {
  const rawCredentials = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!rawCredentials) return null;
  try {
    const credentials = JSON.parse(rawCredentials);
    if (credentials?.type !== 'service_account'
      || !credentials.project_id
      || !credentials.client_email
      || !credentials.private_key) {
      throw new Error('Invalid service account fields.');
    }
    return credentials;
  } catch {
    throw new Error('GOOGLE_SERVICE_ACCOUNT_JSON must contain valid Google service-account JSON.');
  }
}

function numberFromValue(value) {
  if (!value) return null;
  const candidate = value.int64Value ?? value.doubleValue ?? value.boolValue;
  if (candidate === undefined || candidate === null) return null;
  const parsed = Number(candidate);
  return Number.isFinite(parsed) ? parsed : null;
}

function metricValue(series) {
  const points = Array.isArray(series?.points) ? series.points : [];
  const latest = points.reduce((best, point) => {
    const time = Date.parse(point?.interval?.endTime || '');
    return Number.isFinite(time) && (!best || time > best.time)
      ? { point, time }
      : best;
  }, null);
  return latest ? { value: numberFromValue(latest.point.value), time: latest.time } : null;
}

function labelSignature(labels = {}) {
  return JSON.stringify(Object.keys(labels)
    .filter(key => key !== 'method')
    .sort()
    .reduce((result, key) => {
      result[key] = labels[key];
      return result;
    }, {}));
}

function classifyWindow(labels = {}) {
  const labelText = Object.entries(labels)
    .filter(([key]) => key !== 'method')
    .map(([key, value]) => `${key} ${value}`)
    .join(' ')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .toLowerCase();

  if (/per\s*day|daily|requests?\s*(?:\/|per)\s*day|tokens?\s*(?:\/|per)\s*day/.test(labelText)) {
    return 'day';
  }
  if (/per\s*minute|\bminute\b|\b60\s*seconds?\b/.test(labelText)) {
    return 'minute';
  }
  return 'unknown';
}

function pacificParts(date) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: PACIFIC_ZONE,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23'
  }).formatToParts(date);
  return Object.fromEntries(parts.filter(part => part.type !== 'literal').map(part => [part.type, Number(part.value)]));
}

function getPacificDayStart(now = new Date()) {
  const parts = pacificParts(now);
  const targetAsUtc = Date.UTC(parts.year, parts.month - 1, parts.day);
  let guess = targetAsUtc;
  for (let i = 0; i < 3; i += 1) {
    const local = pacificParts(new Date(guess));
    const localAsUtc = Date.UTC(local.year, local.month - 1, local.day, local.hour, local.minute, local.second);
    guess += targetAsUtc - localAsUtc;
  }
  return new Date(guess);
}

function getNextPacificMidnight(now = new Date()) {
  const parts = pacificParts(now);
  const targetAsUtc = Date.UTC(parts.year, parts.month - 1, parts.day + 1);
  let guess = targetAsUtc;
  for (let i = 0; i < 3; i += 1) {
    const local = pacificParts(new Date(guess));
    const localAsUtc = Date.UTC(local.year, local.month - 1, local.day, local.hour, local.minute, local.second);
    guess += targetAsUtc - localAsUtc;
  }
  return new Date(guess).toISOString();
}

function summarizeQuotaMetrics(metrics) {
  const verified = (Array.isArray(metrics) ? metrics : [])
    .filter(metric => metric && metric.verified === true && Number.isFinite(metric.limit) && metric.limit > 0 && Number.isFinite(metric.used));
  const normalized = verified.map(metric => {
    const percentUsed = Math.min(100, Math.max(0, (metric.used / metric.limit) * 100));
    return {
      ...metric,
      percentUsed,
      percentRemaining: Math.max(0, 100 - percentUsed)
    };
  });
  const mostConstrained = normalized.reduce((best, metric) =>
    !best || metric.percentRemaining < best.percentRemaining ? metric : best, null);

  return {
    availability: normalized.length ? 'available' : 'unavailable',
    metrics: normalized,
    percentUsed: mostConstrained ? mostConstrained.percentUsed : null,
    percentRemaining: mostConstrained ? mostConstrained.percentRemaining : null,
    selectedMetric: mostConstrained,
    blocked: normalized.some(metric => metric.percentRemaining <= 5)
  };
}

function getMetricBase(type) {
  return type.replace(/\/(?:limit|usage)$/, '');
}

function isGeminiGenerationQuota(type) {
  const base = getMetricBase(type).replace('generativelanguage.googleapis.com/', '');
  return base.startsWith('quota/generate_content_') || base === 'quota/generate_requests_per_model';
}

function getMonitoringErrorMessage(error) {
  return String(
    error?.response?.data?.error?.message
      || error?.response?.data?.message
      || error?.message
      || ''
  ).replace(/\s+/g, ' ').trim();
}

function isBillingRequiredError(error) {
  return /(?:billing|billing account).*(?:enabled|required)|requires billing/i.test(getMonitoringErrorMessage(error));
}

async function getMonitoringClient() {
  if (!monitoringClientPromise) {
    monitoringClientPromise = (async () => {
      return getMonitoringAuth().getClient();
    })();
  }
  return monitoringClientPromise;
}

function getMonitoringAuth() {
  if (!monitoringAuth) {
    const credentials = getServiceAccountCredentials();
    monitoringAuth = new GoogleAuth({
      ...(credentials ? { credentials, projectId: credentials.project_id } : {}),
      scopes: [MONITORING_SCOPE]
    });
  }
  return monitoringAuth;
}

async function monitoringGet(client, url, params) {
  const response = await client.request({ method: 'GET', url, params, timeout: 12_000 });
  return response.data || {};
}

async function listMetricDescriptors(client, projectId) {
  const url = `${MONITORING_BASE}/projects/${encodeURIComponent(projectId)}/metricDescriptors`;
  const params = {
    filter: 'metric.type = starts_with("generativelanguage.googleapis.com/quota/")',
    pageSize: 1000
  };
  const result = [];
  let pageToken;
  do {
    if (pageToken) params.pageToken = pageToken;
    const page = await monitoringGet(client, url, params);
    result.push(...(page.metricDescriptors || []));
    pageToken = page.nextPageToken;
  } while (pageToken);
  return result;
}

async function listTimeSeries(client, projectId, type, model, startTime, endTime) {
  const url = `${MONITORING_BASE}/projects/${encodeURIComponent(projectId)}/timeSeries`;
  const escapedModel = String(model).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  const filter = `metric.type = "${type}" AND metric.labels.model = "${escapedModel}"`;
  const result = [];
  let pageToken;
  do {
    const params = {
      filter,
      'interval.startTime': startTime,
      'interval.endTime': endTime,
      view: 'FULL',
      pageSize: 1000
    };
    if (pageToken) params.pageToken = pageToken;
    const page = await monitoringGet(client, url, params);
    result.push(...(page.timeSeries || []));
    pageToken = page.nextPageToken;
  } while (pageToken);
  return result;
}

function aggregateUsageSeries(seriesList, window, now, dayStart) {
  const groups = new Map();
  const cutoff = window === 'day'
    ? dayStart.getTime()
    : now.getTime() - 5 * 60_000;

  for (const series of seriesList) {
    const signature = labelSignature(series.metric?.labels || {});
    const points = (series.points || []).map(point => ({
      time: Date.parse(point?.interval?.endTime || ''),
      value: numberFromValue(point?.value)
    })).filter(point => Number.isFinite(point.time) && Number.isFinite(point.value) && point.time >= cutoff && point.time <= now.getTime());

    if (!points.length) continue;
    if (!groups.has(signature)) groups.set(signature, { labels: series.metric?.labels || {}, series: new Map() });
    const group = groups.get(signature);
    const method = series.metric?.labels?.method || 'default';
    const latest = points.reduce((best, point) => !best || point.time > best.time ? point : best, null);
    if (!group.series.has(method)) group.series.set(method, []);
    group.series.get(method).push({ points, latest });
  }

  for (const group of groups.values()) {
    let used = 0;
    let newest = 0;
    for (const methodPoints of group.series.values()) {
      if (window === 'day') {
        for (const entry of methodPoints) {
          for (const point of entry.points) {
            used += point.value;
            newest = Math.max(newest, point.time);
          }
        }
      } else {
        for (const entry of methodPoints) {
          used += entry.latest.value;
          newest = Math.max(newest, entry.latest.time);
        }
      }
    }
    group.used = used;
    group.sampleTime = newest;
  }
  return groups;
}

async function readOfficialQuotas(model) {
  const projectId = getProjectId();
  if (!projectId) {
    return {
      metrics: [],
      reason: 'Google Cloud project ID is not configured. Set GOOGLE_CLOUD_PROJECT to the Google Cloud project used by GEMINI_API_KEY and give the backend Google identity Monitoring Viewer access.'
    };
  }

  try {
    const client = await getMonitoringClient();
    const descriptors = await listMetricDescriptors(client, projectId);
    const byType = new Map(descriptors.map(descriptor => [descriptor.type, descriptor]));
    const limitTypes = descriptors
      .filter(descriptor => descriptor.type?.endsWith('/limit') && isGeminiGenerationQuota(descriptor.type))
      .filter(descriptor => (descriptor.labels || []).some(label => label.key === 'model'));

    const now = new Date();
    const dayStart = getPacificDayStart(now);
    const limitStart = new Date(now.getTime() - 10 * 60_000);
    const metrics = [];
    let billingError = false;

    for (const limitDescriptor of limitTypes) {
      const limitType = limitDescriptor.type;
      const usageType = `${getMetricBase(limitType)}/usage`;
      const usageDescriptor = byType.get(usageType);
      if (!usageDescriptor || !(usageDescriptor.labels || []).some(label => label.key === 'model')) continue;

      try {
        const [limitSeries, usageSeries] = await Promise.all([
          listTimeSeries(client, projectId, limitType, model, limitStart.toISOString(), now.toISOString()),
          listTimeSeries(client, projectId, usageType, model, dayStart.toISOString(), now.toISOString())
        ]);
        if (!limitSeries.length || !usageSeries.length) continue;

        const usageBySignature = new Map();
        for (const limit of limitSeries) {
          const labels = limit.metric?.labels || {};
          const window = classifyWindow(labels);
          if (window === 'unknown') continue;
          const limitValue = metricValue(limit);
          if (!limitValue || !Number.isFinite(limitValue.value) || limitValue.value <= 0) continue;
          if (now.getTime() - limitValue.time > MAX_QUOTA_SAMPLE_AGE_MS) continue;
          const signature = labelSignature(labels);
          if (!usageBySignature.has(signature)) usageBySignature.set(signature, []);
          usageBySignature.get(signature).push({ labels, window, limit: limitValue.value });
        }
        if (!usageBySignature.size) continue;

        // Usage is a DELTA metric. Aggregate the active daily window, or the
        // latest sampled point for short windows; Cloud Monitoring can lag.
        const byWindow = new Map();
        for (const window of ['day', 'minute']) {
          byWindow.set(window, aggregateUsageSeries(usageSeries, window, now, dayStart));
        }

        for (const [signature, limitEntries] of usageBySignature.entries()) {
          for (const entry of limitEntries) {
            const usageGroup = byWindow.get(entry.window)?.get(signature);
            if (!usageGroup || !Number.isFinite(usageGroup.used) || !usageGroup.sampleTime) continue;
            if (now.getTime() - usageGroup.sampleTime > MAX_QUOTA_SAMPLE_AGE_MS) continue;
            const labelText = Object.values(entry.labels).join(' ').toLowerCase();
            const dimension = /token/.test(`${limitType} ${labelText}`) ? 'Input tokens' : 'Requests';
            const limitName = entry.labels.limit_name || entry.labels.quota_metric || dimension;
            const pointAgeMs = now.getTime() - usageGroup.sampleTime;
            const usage = {
              label: `${limitName} (${entry.window === 'day' ? 'daily' : `per ${entry.window}`})`,
              metricType: limitType,
              dimension,
              window: entry.window,
              used: usageGroup.used,
              limit: entry.limit,
              sampleAt: new Date(usageGroup.sampleTime).toISOString(),
              sampleAgeMs: pointAgeMs,
              verified: true
            };
            if (entry.window === 'day') usage.resetAt = getNextPacificMidnight(now);
            metrics.push(usage);
          }
        }
      } catch (metricError) {
        if (isBillingRequiredError(metricError)) {
          billingError = true;
          break;
        }
        // Some quota descriptors are tier-specific or not enabled for a
        // project. Continue so other published Gemini quota metrics can work.
        if (process.env.NODE_ENV !== 'test') {
          console.warn(`[Gemini Usage] Monitoring metric unavailable (${limitType}): ${metricError.message}`);
        }
      }
    }

    return {
      metrics,
      reason: billingError
        ? 'Google requires billing to be enabled on this project before its Gemini quota metrics can be read. Enable billing for GOOGLE_CLOUD_PROJECT, wait a few minutes, then refresh.'
        : metrics.length
        ? null
        : 'Google Cloud Monitoring returned no current Gemini quota series for this model. Confirm GEMINI_API_KEY belongs to GOOGLE_CLOUD_PROJECT, the Gemini API is enabled, and quota metrics have had time to appear.'
    };
  } catch (error) {
    const statusCode = Number(error.response?.status || error.code);
    const apiStatus = String(error.response?.data?.error?.status || '').toUpperCase();
    if (statusCode === 403 && ['SERVICE_DISABLED', 'ACCESS_NOT_CONFIGURED'].includes(apiStatus)) {
      return {
        metrics: [],
        reason: 'Enable the Cloud Monitoring API for GOOGLE_CLOUD_PROJECT, then retry the quota refresh.'
      };
    }
    if (statusCode === 403) {
      return {
        metrics: [],
        reason: 'Google Cloud Monitoring denied access. Grant the backend identity the Monitoring Viewer role for GOOGLE_CLOUD_PROJECT.'
      };
    }
    if (statusCode === 404) {
      return {
        metrics: [],
        reason: 'Google Cloud Monitoring could not find this project or API. Confirm GOOGLE_CLOUD_PROJECT and enable the Cloud Monitoring API.'
      };
    }
    return {
      metrics: [],
      reason: `Google Cloud Monitoring data is unavailable: ${error.message}`
    };
  }
}

function recordGeminiAttempt(model) {
  observed.attempts += 1;
  observed.lastAttemptAt = new Date().toISOString();
  observed.lastModel = model;
  lastRequestState = { state: 'pending', statusCode: null, at: observed.lastAttemptAt };
}

function recordGeminiSuccess(model, usageMetadata = {}) {
  observed.successfulRequests += 1;
  observed.lastSuccessAt = new Date().toISOString();
  observed.lastModel = model;
  const promptTokens = Number(usageMetadata.promptTokenCount) || 0;
  const outputTokens = Number(usageMetadata.candidatesTokenCount) || 0;
  const reportedTotal = Number(usageMetadata.totalTokenCount);
  const totalTokens = Number.isFinite(reportedTotal) ? reportedTotal : promptTokens + outputTokens;
  if (usageMetadata.promptTokenCount !== undefined || usageMetadata.candidatesTokenCount !== undefined || usageMetadata.totalTokenCount !== undefined) {
    observed.promptTokens += promptTokens;
    observed.outputTokens += outputTokens;
    observed.totalTokens += totalTokens;
    observed.tokenReports += 1;
  }
  lastRequestState = { state: 'available', statusCode: 200, at: observed.lastSuccessAt };
}

function recordGeminiFailure(statusCode, state = 'error', detail = '') {
  const safeDetail = String(detail || '')
    .replace(/AIza[0-9A-Za-z_-]{20,}/g, '[redacted]')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 240);
  lastRequestState = {
    state,
    statusCode: Number(statusCode) || null,
    detail: safeDetail || null,
    at: new Date().toISOString()
  };
}

function getObservedUsage() {
  return {
    source: 'PondoSync backend-observed Gemini responses',
    period: 'Since this backend process started',
    processStartedAt,
    attempts: observed.attempts,
    successfulRequests: observed.successfulRequests,
    promptTokens: observed.promptTokens,
    outputTokens: observed.outputTokens,
    totalTokens: observed.totalTokens,
    responsesWithTokenMetadata: observed.tokenReports,
    lastAttemptAt: observed.lastAttemptAt,
    lastSuccessAt: observed.lastSuccessAt
  };
}

function invalidateQuotaCache() {
  cachedAt = 0;
}

function publicStatus(model, officialData) {
  const quotaSummary = summarizeQuotaMetrics(officialData.metrics);
  const keyConfigured = Boolean(process.env.GEMINI_API_KEY);
  const availability = !keyConfigured
    ? 'unavailable'
    : quotaSummary.blocked
      ? 'quota_limited'
      : lastRequestState.state === 'rate_limited'
        ? 'rate_limited'
        : lastRequestState.state === 'error'
          ? 'degraded'
          : lastRequestState.state === 'available'
            ? 'available'
            : 'configured';

  return {
    currentModel: model,
    configuredModel: getConfiguredModel(),
    availability,
    availabilityMessage: !keyConfigured
      ? 'Gemini API key is not configured.'
      : quotaSummary.blocked
        ? 'Verified quota has 5% or less remaining; Gemini requests are paused.'
      : lastRequestState.state === 'rate_limited'
        ? `Gemini returned HTTP 429${lastRequestState.detail ? `: ${lastRequestState.detail}` : '.'}`
        : lastRequestState.state === 'error'
          ? `Gemini request failed${lastRequestState.statusCode ? ` (HTTP ${lastRequestState.statusCode})` : ''}${lastRequestState.detail ? `: ${lastRequestState.detail}` : '.'}`
            : lastRequestState.state === 'available'
              ? 'Gemini is configured and the most recent request succeeded.'
              : 'Gemini is configured; a live request has not yet confirmed availability.' ,
    lastRequest: { ...lastRequestState },
    blocked: keyConfigured && quotaSummary.blocked,
    warning: keyConfigured && quotaSummary.blocked
      ? 'The verified Gemini quota is at or below 5% remaining. External Gemini requests are temporarily paused.'
      : null,
    quota: {
      availability: quotaSummary.availability,
      source: quotaSummary.availability === 'available' ? 'Google Cloud Monitoring project quota' : null,
      reason: quotaSummary.availability === 'available' ? null : officialData.reason,
      percentUsed: quotaSummary.percentUsed,
      percentRemaining: quotaSummary.percentRemaining,
      selectedMetric: quotaSummary.selectedMetric,
      metrics: quotaSummary.metrics,
      sampleNote: 'Official project quota metrics can lag by up to 150 seconds.'
    },
    backendObserved: getObservedUsage(),
    refreshedAt: new Date().toISOString()
  };
}

async function getUsageStatus(model = observed.lastModel || getConfiguredModel()) {
  const now = Date.now();
  if (cachedQuota && cachedModel === model && now - cachedAt < CACHE_TTL_MS) {
    return publicStatus(model, cachedQuota);
  }
  if (quotaRefreshPromise) {
    const result = await quotaRefreshPromise;
    return publicStatus(model, result);
  }

  quotaRefreshPromise = readOfficialQuotas(model).catch(error => ({
    metrics: [],
    reason: `Google Cloud Monitoring data is unavailable: ${error.message}`
  }));
  try {
    cachedQuota = await quotaRefreshPromise;
    cachedModel = model;
    cachedAt = Date.now();
    return publicStatus(model, cachedQuota);
  } finally {
    quotaRefreshPromise = null;
  }
}

module.exports = {
  getConfiguredModel,
  getModelCandidates,
  getUsageStatus,
  getObservedUsage,
  recordGeminiAttempt,
  recordGeminiSuccess,
  recordGeminiFailure,
  invalidateQuotaCache,
  summarizeQuotaMetrics,
  getPacificDayStart,
  getNextPacificMidnight
};
