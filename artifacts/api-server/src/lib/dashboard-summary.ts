type SummaryCompany = {
  discoveredAt: Date;
  signalScore: number;
  foundersList: Array<{ name: string }>;
  regionalMetadata: { geographyRegion: string };
};

export function buildDashboardSummary(companies: SummaryCompany[], now = new Date()) {
  const regions = new Map<string, number>();
  const founders = new Set<string>();
  const start = new Date(now);
  start.setUTCHours(0, 0, 0, 0);
  start.setUTCDate(start.getUTCDate() - 6);
  const weeklyDiscovery = Array.from({ length: 7 }, (_, offset) => {
    const day = new Date(start);
    day.setUTCDate(day.getUTCDate() + offset);
    const next = new Date(day);
    next.setUTCDate(next.getUTCDate() + 1);
    return { label: day.toLocaleDateString('en-US', { weekday: 'short', timeZone: 'UTC' }), value: companies.filter(company => company.discoveredAt >= day && company.discoveredAt < next && company.discoveredAt <= now).length };
  });
  for (const company of companies) {
    const region = company.regionalMetadata.geographyRegion;
    regions.set(region, (regions.get(region) ?? 0) + 1);
    for (const founder of company.foundersList) founders.add(founder.name.trim().toLowerCase());
  }
  return {
    companyCount: companies.length,
    newThisWeek: companies.filter(company => company.discoveredAt >= start && company.discoveredAt <= now).length,
    highSignalCount: companies.filter(company => company.signalScore >= 85).length,
    trackedDevelopers: founders.size,
    activeRegions: regions.size,
    weeklyDiscovery,
    regionBreakdown: Array.from(regions, ([region, count]) => ({ region, count, percentage: Math.round(count / companies.length * 100) })),
  };
}
