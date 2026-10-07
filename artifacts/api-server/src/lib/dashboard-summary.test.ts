import assert from 'node:assert/strict';
import test from 'node:test';
import { buildDashboardSummary } from './dashboard-summary.ts';

test('dashboard reflects persisted records without inflated counts', () => {
  const companies = [
    { discoveredAt: new Date('2026-10-07T01:00:00Z'), signalScore: 94, foundersList: [{ name: 'Maya' }], regionalMetadata: { geographyRegion: 'South Asia' } },
    { discoveredAt: new Date('2026-09-01T01:00:00Z'), signalScore: 70, foundersList: [{ name: 'Maya' }, { name: 'Ruwan' }], regionalMetadata: { geographyRegion: 'East Asia' } },
  ];
  const result = buildDashboardSummary(companies, new Date('2026-10-07T12:00:00Z'));
  assert.equal(result.companyCount, 2);
  assert.equal(result.newThisWeek, 1);
  assert.equal(result.highSignalCount, 1);
  assert.equal(result.trackedDevelopers, 2);
  assert.equal(result.weeklyDiscovery.reduce((sum, day) => sum + day.value, 0), 1);
  assert.deepEqual(result.regionBreakdown.map(region => region.percentage), [50, 50]);
  const empty = buildDashboardSummary([]);
  assert.equal(empty.companyCount, 0);
  assert.deepEqual(empty.regionBreakdown, []);
});
