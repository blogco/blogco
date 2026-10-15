import test from 'node:test';
import assert from 'node:assert/strict';
import { statusMeta, isActiveRun, shortSha, relativeTime, runsApiUrl, runDurationMs, formatDuration, formatDurationMinutes, deploySummary } from './github-actions.js';

test('statusMeta maps a running job', () => {
  assert.deepEqual(statusMeta({ status: 'in_progress', conclusion: null }), { label: 'Đang chạy', tone: 'running' });
});

test('statusMeta maps a queued run', () => {
  assert.deepEqual(statusMeta({ status: 'queued', conclusion: null }), { label: 'Đang chờ', tone: 'pending' });
});

test('statusMeta maps conclusions', () => {
  assert.deepEqual(statusMeta({ status: 'completed', conclusion: 'success' }), { label: 'Thành công', tone: 'success' });
  assert.deepEqual(statusMeta({ status: 'completed', conclusion: 'failure' }), { label: 'Thất bại', tone: 'failure' });
  assert.deepEqual(statusMeta({ status: 'completed', conclusion: 'cancelled' }), { label: 'Đã huỷ', tone: 'neutral' });
});

test('isActiveRun flags queued and in-progress only', () => {
  assert.equal(isActiveRun({ status: 'queued' }), true);
  assert.equal(isActiveRun({ status: 'in_progress' }), true);
  assert.equal(isActiveRun({ status: 'completed' }), false);
});

test('shortSha trims to seven chars', () => {
  assert.equal(shortSha('e164a4f3514601c56a9027f7b7efdffe586b9e27'), 'e164a4f');
});

test('relativeTime formats Vietnamese relative labels', () => {
  const now = Date.parse('2026-10-15T00:40:00Z');
  assert.equal(relativeTime('2026-10-15T00:39:30Z', now), 'vừa xong');
  assert.equal(relativeTime('2026-10-15T00:30:00Z', now), '10 phút trước');
  assert.equal(relativeTime('2026-10-14T22:40:00Z', now), '2 giờ trước');
  assert.equal(relativeTime('2026-10-10T00:40:00Z', now), '5 ngày trước');
});

test('runsApiUrl targets the actions runs endpoint', () => {
  assert.equal(
    runsApiUrl('blogco/blogco', 5),
    'https://api.github.com/repos/blogco/blogco/actions/runs?per_page=5&exclude_pull_requests=true',
  );
});

test('runDurationMs prefers job start over created_at and completed_at over updated_at', () => {
  assert.equal(
    runDurationMs({
      created_at: '2026-10-15T00:00:00Z',
      run_started_at: '2026-10-15T00:00:30Z',
      completed_at: '2026-10-15T00:01:45Z',
      updated_at: '2026-10-15T00:02:00Z',
    }),
    75000,
  );
  assert.equal(
    runDurationMs({ created_at: '2026-10-15T00:00:00Z', updated_at: '2026-10-15T00:00:40Z' }),
    40000,
  );
  assert.equal(runDurationMs({ created_at: '2026-10-15T00:00:00Z' }), null);
  assert.equal(runDurationMs({}), null);
});

test('formatDuration renders Vietnamese phút/giây labels', () => {
  assert.equal(formatDuration(45000), '45 giây');
  assert.equal(formatDuration(75000), '1 phút 15 giây');
  assert.equal(formatDuration(120000), '2 phút');
  assert.equal(formatDuration(150000), '2 phút 30 giây');
  assert.equal(formatDuration(3660000), '1 giờ 1 phút');
  assert.equal(formatDuration(0), 'dưới 1 giây');
  assert.equal(formatDuration(null), '—');
});

test('formatDurationMinutes renders the compact decimal form', () => {
  assert.equal(formatDurationMinutes(75000), '1.3 phút');
  assert.equal(formatDurationMinutes(150000), '2.5 phút');
  assert.equal(formatDurationMinutes(660000), '11 phút');
});

test('deploySummary composes status + duration for the newest run', () => {
  const base = { created_at: '2026-10-15T00:00:00Z', updated_at: '2026-10-15T00:01:15Z' };
  assert.equal(
    deploySummary({ ...base, status: 'completed', conclusion: 'success' }),
    'Deploy thành công trong 1 phút 15 giây',
  );
  assert.equal(
    deploySummary({ ...base, status: 'completed', conclusion: 'failure' }),
    'Deploy thất bại sau 1 phút 15 giây',
  );
  assert.equal(
    deploySummary({ status: 'in_progress', run_started_at: '2026-10-15T00:00:00Z', updated_at: '2026-10-15T00:00:30Z' }),
    'Đang deploy · 30 giây',
  );
  assert.equal(deploySummary({ status: 'in_progress' }), 'Đang deploy…');
  assert.equal(deploySummary({ status: 'completed', conclusion: 'cancelled' }), 'Thời gian deploy: —');
});
