type ActivityCompany = {
  id: string;
  companyName: string;
  regionalMetadata: {
    specificCountry: string;
  };
  lastFundingRound: string;
  signalScore: number;
  discoveredAt: Date;
};

type ActivitySource = {
  companyCount: number;
  status: string;
  createdAt: Date;
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
    ...companies.slice(0, 2).map((company) => ({
      id: `activity-company-${company.id}`,
      kind: "company",
      title: `${company.companyName} added to discovery`,
      description: `${company.regionalMetadata.specificCountry} · ${company.lastFundingRound} · ${company.signalScore} signal score`,
      timestamp: company.discoveredAt.toISOString(),
      companyId: company.id,
      severity: "medium",
    })),
    ...(source ? [{
      id: "activity-scan-1",
      kind: "scan",
      title: source.status === "Scanned" ? "Portfolio scan completed" : source.status === "Error" ? "Portfolio scan failed" : "Portfolio source queued",
      description: source.status === "Scanned" ? `${source.companyCount} companies found in your portfolio.` : "Source saved. Portfolio ingestion is not yet implemented.",
      timestamp: source.createdAt.toISOString(),
      companyId: null,
      severity: "low",
    }] : []),
  ];
}
