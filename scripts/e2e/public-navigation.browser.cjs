/* Run against a local build or Staging with Playwright supplied by the QA runtime.
 * PUBLIC_QA_BASE_URL, PUBLIC_QA_OUTPUT, PUBLIC_QA_PLAYBACK=1 (three full loops).
 * Chromium at 390x844 is a mobile viewport test, not a physical iPhone.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { chromium } = require('playwright');

const base = process.env.PUBLIC_QA_BASE_URL || 'http://127.0.0.1:3123';
const output = path.resolve(process.env.PUBLIC_QA_OUTPUT || 'test-results/public-navigation');
const playback = process.env.PUBLIC_QA_PLAYBACK === '1';
const routes = [
  ['/', '首页', 'section[aria-label="开始创建"]'],
  ['/guest/companion', '相伴', 'section[aria-label="AI 合成相伴示例"]'],
  ['/guest/memories', '拾忆', 'img[src*="memories-hero-approved"]'],
  ['/guest/account', '我的', 'img[src*="account-album-approved"]'],
];

async function checkPage(page, route) {
  await page.waitForURL(url => url.pathname === route[0]);
  await page.locator(route[2]).waitFor({ state: 'visible' });
  await page.waitForFunction(({ destination, label }) => {
    const selected = [...document.querySelectorAll('nav[aria-label="主导航"] [aria-current="page"]')];
    return location.pathname === destination && selected.length === 1 && selected[0].textContent === label;
  }, { destination: route[0], label: route[1] });
  const state = await page.evaluate(() => ({
    url: location.pathname,
    active: [...document.querySelectorAll('nav[aria-label="主导航"] [aria-current="page"]')].map(e => e.textContent),
    launch: !!document.querySelector('section[aria-label="忆见，见一人 忆一生"]'),
    videos: [...document.querySelectorAll('video')].map(v => ({ src: v.currentSrc, paused: v.paused })),
  }));
  assert.equal(state.url, route[0]);
  assert.deepEqual(state.active, [route[1]]);
  assert.equal(state.launch, false);
  if (route[0] === '/') {
    assert.equal(state.videos.length, 1);
    assert.match(state.videos[0].src, /home-master-v1\.(desktop|mobile)\.mp4/);
  }
  return state;
}

async function watchThreeLoops(page) {
  await page.waitForFunction(() => {
    const v = document.querySelector('video');
    return v && !v.paused && v.currentTime > 0 && v.readyState >= 2;
  });
  const samples = [];
  const events = [];
  const reporter = `reportVideoEvent${Date.now()}`;
  await page.exposeFunction(reporter, data => events.push(data));
  await page.evaluate(reporter => {
    const v = document.querySelector('video');
    for (const type of ['waiting', 'stalled', 'error', 'playing']) v.addEventListener(type, () => window[reporter]({ type, time: v.currentTime, now: performance.now() }));
  }, reporter);
  let wraps = 0;
  let previous = null;
  let lastAdvance = Date.now();
  const started = Date.now();
  while (wraps < 3 && Date.now() - started < 155000) {
    const state = await page.evaluate(() => ({
      now: performance.now(), pathname: location.pathname,
      name: document.querySelector('[aria-live="polite"]')?.textContent,
      videos: [...document.querySelectorAll('video')].map(v => ({ src: v.currentSrc, currentTime: v.currentTime, duration: v.duration, paused: v.paused, readyState: v.readyState, opacity: getComputedStyle(v).opacity, width: v.getBoundingClientRect().width, height: v.getBoundingClientRect().height })),
    }));
    samples.push(state);
    assert.equal(state.videos.length, 1);
    const video = state.videos[0];
    assert.equal(video.paused, false);
    if (previous && video.currentTime < previous.currentTime - 0.2) {
      assert.ok(previous.currentTime > previous.duration - 1 && video.currentTime < 1, 'time reversed outside the master loop');
      wraps++;
    }
    if (!previous || Math.abs(video.currentTime - previous.currentTime) > 0.01) lastAdvance = Date.now();
    assert.ok(Date.now() - lastAdvance < 1000, 'visible playback stopped for one second');
    previous = video;
    await page.waitForTimeout(100);
  }
  assert.equal(wraps, 3);
  // Chromium emits a zero-time waiting/playing pair when native loop seeks.
  // Preserve it in evidence and reject any mid-film wait or visible loop pause.
  const loopWaits = [];
  for (let i = 0; i < events.length; i++) {
    const event = events[i];
    if (event.type === 'playing') continue;
    assert.equal(event.type, 'waiting', JSON.stringify(event));
    const before = samples.findLast(s => s.now < event.now)?.videos[0];
    const resumed = events.slice(i + 1).find(e => e.type === 'playing');
    assert.ok(event.time < 0.1 && before && before.currentTime > before.duration - 0.5, 'mid-film waiting event');
    assert.ok(resumed && resumed.now - event.now < 250, 'visible pause at native loop');
    loopWaits.push({ time: event.time, milliseconds: resumed.now - event.now });
  }
  await fs.writeFile(path.join(output, `playback-${page.viewportSize().width}-${Date.now()}.json`), JSON.stringify({ samples, events, loopWaits }, null, 2));
  return { samples, events, loopWaits, wraps, elapsedMs: Date.now() - started };
}

async function runViewport(browser, viewport) {
  const label = `${viewport.width}x${viewport.height}`;
  const context = await browser.newContext({ viewport, recordVideo: { dir: output, size: viewport }, serviceWorkers: 'block' });
  const page = await context.newPage();
  const requests = [];
  page.on('request', req => { if (new URL(req.url()).origin === new URL(base).origin) requests.push({ path: new URL(req.url()).pathname, method: req.method() }); });
  const cdp = await context.newCDPSession(page);
  await cdp.send('Network.enable');
  await cdp.send('Network.setCacheDisabled', { cacheDisabled: true });
  const result = { label, routes: [], playback: {}, violations: [] };
  try {
    await page.goto(base);
    await checkPage(page, routes[0]);
    await page.evaluate(() => {
      window.__navigationViolations = [];
      const inspect = () => {
        const selected = [...document.querySelectorAll('nav[aria-label="主导航"] [aria-current="page"]')];
        if (selected.length > 1 || selected.some(e => e.getAttribute('href') !== location.pathname)) window.__navigationViolations.push({ type: 'active-route-mismatch', path: location.pathname });
        if (document.querySelector('section[aria-label="忆见，见一人 忆一生"]')) window.__navigationViolations.push({ type: 'repeated-launch', path: location.pathname });
      };
      new MutationObserver(inspect).observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['aria-current'] });
    });
    for (let cycle = 0; cycle < 3; cycle++) {
      for (const from of routes) {
        await page.getByRole('navigation', { name: '主导航' }).getByRole('link', { name: from[1], exact: true }).click();
        await checkPage(page, from);
        for (const destination of routes) {
          await page.getByRole('navigation', { name: '主导航' }).getByRole('link', { name: destination[1], exact: true }).click();
          result.routes.push(await checkPage(page, destination));
          await page.getByRole('navigation', { name: '主导航' }).getByRole('link', { name: from[1], exact: true }).click();
          await checkPage(page, from);
        }
      }
    }
    await page.getByRole('navigation', { name: '主导航' }).getByRole('link', { name: '首页', exact: true }).click();
    await checkPage(page, routes[0]);
    await page.getByRole('button', { name: '创建 TA', exact: true }).click();
    await page.waitForURL('**/guest/create');
    await page.locator('img[src*="create-empty-frame-approved"]').waitFor({ state: 'visible' });
    assert.equal(await page.locator('nav [aria-current="page"]').count(), 0);
    await page.screenshot({ path: path.join(output, `${label}-create.png`) });
    await page.goBack();
    await checkPage(page, routes[0]);
    await page.goForward();
    await page.waitForURL('**/guest/create');
    assert.equal(await page.locator('nav [aria-current="page"]').count(), 0);
    await page.getByRole('navigation', { name: '主导航' }).getByRole('link', { name: '首页', exact: true }).click();
    await checkPage(page, routes[0]);
    result.violations = await page.evaluate(() => window.__navigationViolations);
    assert.deepEqual(result.violations, []);
    assert.deepEqual(requests.filter(r => r.path.startsWith('/api/memories') || !['GET', 'HEAD'].includes(r.method)), []);
    await page.screenshot({ path: path.join(output, `${label}-home.png`) });
    if (playback) {
      for (const cache of ['cold', 'warm']) {
        if (cache === 'cold') await cdp.send('Network.clearBrowserCache');
        await cdp.send('Network.setCacheDisabled', { cacheDisabled: false });
        await page.reload();
        await checkPage(page, routes[0]);
        result.playback[cache] = await watchThreeLoops(page);
      }
    }
    result.status = 'passed';
  } catch (error) {
    result.status = 'failed'; result.error = String(error.stack || error);
    await page.screenshot({ path: path.join(output, `${label}-failure.png`) }).catch(() => {});
    throw error;
  } finally {
    result.requests = requests;
    await fs.writeFile(path.join(output, `${label}.json`), JSON.stringify(result, null, 2));
    const video = page.video();
    await context.close();
    if (video) await video.saveAs(path.join(output, `${label}-continuous.webm`));
    console.log(JSON.stringify({ label, status: result.status, routes: result.routes.length, playback: Object.keys(result.playback), error: result.error }));
  }
}

(async () => {
  await fs.mkdir(output, { recursive: true });
  const browser = await chromium.launch({ executablePath: process.env.PUBLIC_QA_BROWSER || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: true });
  try {
    for (const viewport of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) await runViewport(browser, viewport);
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
