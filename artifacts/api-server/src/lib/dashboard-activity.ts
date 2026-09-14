type ActivityCompany = {
  id: string;
  companyName: string;
  regionalMetadata: {
    specificCountry: string;
  };
  lastFundingRound: string;
  signalScore: number;
};

type ActivitySource = {
  companyCount: number;
} | undefined;

type ActivityAlert = {
  id: string;
  title: string;
  description: string;
  detectedAt: Date;
  companyId: string | null;
  severity: string | null;
};

export function buildActivityItems(
  companies: ActivityCompany[],
  source: ActivitySource,
  alerts: ActivityAlert[],
  now = new Date(),
) {
  return [
    ...alerts.map((alert) => ({
      id: `activity-alert-${alert.id}`,
      kind: "alert",
      title: alert.title,
      description: alert.description,
      timestamp: alert.detectedAt.toISOString(),
      companyId: alert.companyId,
      severity: alert.severity,
    })),
    ...companies.slice(0, 2).map((company, index) => ({
      id: `activity-company-${company.id}`,
      kind: "company",
      title: `${company.companyName} matched your thesis`,
      description: `${company.regionalMetadata.specificCountry} · ${company.lastFundingRound} · ${company.signalScore} signal score`,
      timestamp: new Date(now.getTime() - 1000 * 60 * (58 + index * 47)).toISOString(),
      companyId: company.id,
      severity: "medium",
    })),
    {
      id: "activity-scan-1",
      kind: "scan",
      title: "Portfolio scan completed",
      description: source ? `${source.companyCount} companies enriched from your portfolio.` : "Portfolio scan completed.",
      timestamp: new Date(now.getTime() - 1000 * 60 * 240).toISOString(),
      companyId: null,
      severity: "low",
    },
  ];
}