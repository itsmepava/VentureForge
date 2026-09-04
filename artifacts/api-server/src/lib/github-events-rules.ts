export function calculateWeekendBaseline(samples: number[]) {
  if (!samples.length) return 0;
  return samples.reduce((total, sample) => total + sample, 0) / samples.length;
}

export function qualifiesForStealthAlert(currentCommits: number, baseline: number) {
  return baseline > 0 && currentCommits >= baseline * 4;
}

export function percentageChangeFromBaseline(currentCommits: number, baseline: number) {
  if (baseline <= 0) return 0;
  return Math.round(((currentCommits - baseline) / baseline) * 100);
}

export function shouldCreateStealthAlert(
  currentCommits: number,
  baseline: number,
  alertAlreadyExists: boolean,
) {
  return qualifiesForStealthAlert(currentCommits, baseline) && !alertAlreadyExists;
}