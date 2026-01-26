const axios = require('axios');

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function headRequest(url) {
  try {
    return await axios.head(url, {
      maxRedirects: 5,
      validateStatus: () => true,
    });
  } catch (error) {
    return error?.response || null;
  }
}

async function rangeRequest(url) {
  try {
    return await axios.get(url, {
      headers: { Range: 'bytes=0-0' },
      maxRedirects: 5,
      validateStatus: () => true,
    });
  } catch (error) {
    return error?.response || null;
  }
}

function isValidResponse(response) {
  if (!response) return false;
  const status = response.status;
  if (status !== 200 && status !== 206) return false;

  const contentType = String(response.headers?.['content-type'] || '').toLowerCase();
  if (contentType.startsWith('text/html')) return false;
  if (contentType.includes('application/json')) return false;

  const contentLength = response.headers?.['content-length'];
  if (contentLength && Number(contentLength) === 0) return false;

  return true;
}

async function isDownloadableUrl(url) {
  if (!url) return false;
  const headResponse = await headRequest(url);
  if (isValidResponse(headResponse)) return true;

  const status = headResponse?.status;
  if (status === 403 || status === 405 || !headResponse) {
    const rangeResponse = await rangeRequest(url);
    return isValidResponse(rangeResponse);
  }

  return false;
}

async function runWithConcurrency(items, handler, concurrency) {
  const results = [];
  let index = 0;

  async function worker() {
    while (index < items.length) {
      const current = items[index];
      index += 1;
      results.push(await handler(current));
    }
  }

  const workers = Array.from({ length: Math.min(concurrency, items.length) }, () => worker());
  await Promise.all(workers);
  return results;
}

async function waitForDesignAssetsReady(designUrls, opts = {}) {
  const attempts = opts.attempts ?? 5;
  const delayMs = opts.delayMs ?? 60000;
  const concurrency = opts.concurrency ?? 3;
  const urls = Array.from(new Set(designUrls.filter(Boolean)));

  let notReadyUrls = urls;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const checks = await runWithConcurrency(
      notReadyUrls,
      async (url) => ({ url, ready: await isDownloadableUrl(url) }),
      concurrency
    );
    notReadyUrls = checks.filter((item) => !item.ready).map((item) => item.url);

    if (notReadyUrls.length === 0) {
      return { ready: true, attempt };
    }

    if (attempt < attempts) {
      await sleep(delayMs);
    }
  }

  return { ready: false, attempt: attempts, notReadyUrls };
}

module.exports = {
  sleep,
  isDownloadableUrl,
  waitForDesignAssetsReady,
};
