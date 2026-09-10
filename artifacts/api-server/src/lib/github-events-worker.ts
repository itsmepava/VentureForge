import { and, eq, gte, lt } from "drizzle-orm";
import {
  db,
  pool,
  companyGithubRepositories,
  discoveredCompanies,
  githubEventSnapshots,
  signalAlerts,
} from "@workspace/db";
import { DEMO_ORGANIZATION_ID, ensureDemoData } from "./demo-data";
import { logger } from "./logger";
import { readProviderValues } from "./providers";
import { repositoryMatchesCompany } from "./github-repository-matching";
import { verifyGitHubRepositoryAccess } from "./github-repository-verification";
import { fetchRepositoryCommitCount } from "./github-commit-collection";
import {
  calculateWeekendBaseline,
  percentageChangeFromBaseline,
  qualifiesForStealthAlert,
} from "./github-events-rules";

type GitHubEvent = {
  type?: string;
  created_at?: string;
  repo?: { name?: string };
  payload?: { commits?: Array<unknown> };
};

function weekendWindow(now: Date) {
  const start = new Date(now);
  start.setUTCHours(0, 0, 0, 0);
  start.setUTCDate(start.getUTCDate() - ((start.getUTCDay() + 2) % 7));
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 3);
  return { start, end };
}

async function fetchGitHubEvents(token: string) {
  const response = await fetch("https://api.github.com/user/events?per_page=100", {
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "VentureForge/2.0",
    },
    signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok) {
    throw new Error(`GitHub Events returned HTTP ${response.status}`);
  }
  return (await response.json()) as GitHubEvent[];
}

async function runGitHubEventsScanUnlocked(now = new Date()) {
  await ensureDemoData();
  const configured = await readProviderValues("github");
  if (!configured) {
    logger.info("GitHub Events worker skipped: GitHub is not connected");
    return { skipped: true, reason: "not_connected", alertsCreated: 0, companiesObserved: 0 };
  }
  const token = configured.values.token ?? configured.values.accessToken;
  if (!token) {
    logger.warn("GitHub Events worker skipped: GitHub token is missing");
    return { skipped: true, reason: "token_missing", alertsCreated: 0, companiesObserved: 0 };
  }

  const { start, end } = weekendWindow(now);
  const [companies, repositoryMappings] = await Promise.all([
    db
      .select()
      .from(discoveredCompanies)
      .where(eq(discoveredCompanies.organizationId, DEMO_ORGANIZATION_ID)),
    db
      .select()
      .from(companyGithubRepositories)
      .where(eq(companyGithubRepositories.organizationId, DEMO_ORGANIZATION_ID)),
  ]);
  const activeRepositoryMappings: typeof repositoryMappings = [];
  let inaccessibleMappings = 0;
  let repositoryVerificationFailures = 0;
  for (const mapping of repositoryMappings) {
    try {
      const verification = await verifyGitHubRepositoryAccess(token, mapping.repository);
      await db
        .update(companyGithubRepositories)
        .set({
          repository: verification.repository,
          verified: verification.verified,
          verifiedAt: verification.verified ? now : mapping.verifiedAt,
          lastCheckedAt: now,
          verificationError: verification.error,
        })
        .where(eq(companyGithubRepositories.id, mapping.id));
      if (!verification.verified) {
        inaccessibleMappings += 1;
        logger.warn(
          { mappingId: mapping.id, companyId: mapping.companyId, repository: mapping.repository },
          `Nightly GitHub scan skipped inaccessible repository mapping: ${verification.error}`,
        );
        continue;
      }
      activeRepositoryMappings.push({
        ...mapping,
        repository: verification.repository,
        verified: true,
        verifiedAt: now,
        lastCheckedAt: now,
        verificationError: null,
      });
    } catch (error) {
      repositoryVerificationFailures += 1;
      logger.warn(
        { err: error, mappingId: mapping.id, companyId: mapping.companyId, repository: mapping.repository },
        "Nightly GitHub repository access check failed; preserving the previous mapping state",
      );
      if (mapping.verified) activeRepositoryMappings.push(mapping);
    }
  }
  const repositoriesByCompany = new Map<string, string[]>();
  for (const mapping of activeRepositoryMappings) {
    repositoriesByCompany.set(mapping.companyId, [
      ...(repositoriesByCompany.get(mapping.companyId) ?? []),
      mapping.repository,
    ]);
  }
  const commitsByCompany = new Map<string, { commits: number; events: number }>();
  for (const [companyId, repositories] of repositoriesByCompany) {
    for (const repository of repositories) {
      try {
        const commitCount = await fetchRepositoryCommitCount(token, repository, start, end);
        const current = commitsByCompany.get(companyId) ?? { commits: 0, events: 0 };
        current.commits += commitCount;
        current.events += commitCount;
        commitsByCompany.set(companyId, current);
      } catch (error) {
        logger.warn({ err: error, companyId, repository }, "GitHub repository commit collection failed");
      }
    }
  }

  const explicitlyMappedCompanyIds = new Set(repositoryMappings.map((mapping) => mapping.companyId));
  const fallbackCompanies = companies.filter((company) => !explicitlyMappedCompanyIds.has(company.id));
  const events = fallbackCompanies.length ? await fetchGitHubEvents(token) : [];
  for (const event of events) {
    if (event.type !== "PushEvent" || !event.created_at) continue;
    const createdAt = new Date(event.created_at);
    if (createdAt < start || createdAt >= end) continue;
    const commitCount = Math.max(1, event.payload?.commits?.length ?? 0);
    for (const company of fallbackCompanies) {
      if (!repositoryMatchesCompany(event.repo?.name ?? "", company, [])) continue;
      const current = commitsByCompany.get(company.id) ?? { commits: 0, events: 0 };
      current.commits += commitCount;
      current.events += 1;
      commitsByCompany.set(company.id, current);
    }
  }

  let alertsCreated = 0;
  for (const company of companies) {
    const observed = commitsByCompany.get(company.id) ?? { commits: 0, events: 0 };
    const cutoff = new Date(start);
    cutoff.setUTCDate(cutoff.getUTCDate() - 90);
    const history = await db
      .select({ weekendCommitCount: githubEventSnapshots.weekendCommitCount })
      .from(githubEventSnapshots)
      .where(
        and(
          eq(githubEventSnapshots.organizationId, DEMO_ORGANIZATION_ID),
          eq(githubEventSnapshots.companyId, company.id),
          gte(githubEventSnapshots.windowStart, cutoff),
          lt(githubEventSnapshots.windowStart, start),
        ),
      );
    const baseline = calculateWeekendBaseline(history.map((sample) => sample.weekendCommitCount));
    await db
      .insert(githubEventSnapshots)
      .values({
        organizationId: DEMO_ORGANIZATION_ID,
        companyId: company.id,
        windowStart: start,
        windowEnd: end,
        weekendCommitCount: observed.commits,
        eventCount: observed.events,
        observedAt: now,
        source: "GitHub",
      })
      .onConflictDoUpdate({
        target: [
          githubEventSnapshots.organizationId,
          githubEventSnapshots.companyId,
          githubEventSnapshots.windowStart,
        ],
        set: {
          windowEnd: end,
          weekendCommitCount: observed.commits,
          eventCount: observed.events,
          observedAt: now,
          source: "GitHub",
        },
      });

    if (!qualifiesForStealthAlert(observed.commits, baseline)) continue;
    const percentageChange = percentageChangeFromBaseline(observed.commits, baseline);
    const [createdAlert] = await db
      .insert(signalAlerts)
      .values({
        organizationId: DEMO_ORGANIZATION_ID,
        companyId: company.id,
        rule: "weekend_velocity_300",
        title: "Pre-Intent Stealth Alert",
        description: `Weekend commit velocity spiked ${percentageChange}% for ${company.companyName}.`,
        severity: "high",
        percentageChange,
        windowStart: start,
        windowEnd: end,
        detectedAt: now,
      })
      .onConflictDoNothing()
      .returning({ id: signalAlerts.id });
    if (!createdAlert) continue;
    await db
      .update(discoveredCompanies)
      .set({
        signalScore: Math.min(99, Math.max(company.signalScore, 85)),
        signalLabel: "High signal",
        source: "GitHub Events",
        behavioralMetrics: {
          ...company.behavioralMetrics,
          commitVelocitySpike: percentageChange,
        },
      })
      .where(eq(discoveredCompanies.id, company.id));
    alertsCreated += 1;
  }

  logger.info(
    {
      alertsCreated,
      companiesObserved: commitsByCompany.size,
      eventCount: events.length,
      inaccessibleMappings,
      repositoryVerificationFailures,
    },
    "GitHub Events worker completed",
  );
  return {
    skipped: false,
    alertsCreated,
    companiesObserved: commitsByCompany.size,
    inaccessibleMappings,
    repositoryVerificationFailures,
  };
}

export async function runGitHubEventsScan(now = new Date()) {
  const client = await pool.connect();
  try {
    const lock = await client.query<{ acquired: boolean }>(
      "select pg_try_advisory_lock(hashtext($1)) as acquired",
      ["ventureforge_github_events_scan"],
    );
    if (!lock.rows[0]?.acquired) {
      logger.info("GitHub Events worker skipped: another scan is already running");
      return { skipped: true, reason: "scan_in_progress", alertsCreated: 0, companiesObserved: 0 };
    }
    try {
      return await runGitHubEventsScanUnlocked(now);
    } finally {
      await client.query("select pg_advisory_unlock(hashtext($1))", ["ventureforge_github_events_scan"]);
    }
  } finally {
    client.release();
  }
}

function nextRunAt(hour: number, now = new Date()) {
  const next = new Date(now);
  next.setUTCHours(hour, 0, 0, 0);
  if (next <= now) next.setUTCDate(next.getUTCDate() + 1);
  return next;
}

export function scheduleNightlyGitHubEventsWorker() {
  if (process.env.GITHUB_WORKER_ENABLED === "false") {
    logger.info("GitHub Events worker disabled");
    return () => undefined;
  }
  const configuredHour = Number(process.env.GITHUB_SCAN_HOUR_UTC ?? "2");
  const hour = Number.isInteger(configuredHour) && configuredHour >= 0 && configuredHour <= 23 ? configuredHour : 2;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const scheduleNext = () => {
    const runAt = nextRunAt(hour);
    timer = setTimeout(async () => {
      try {
        await runGitHubEventsScan();
      } catch (error) {
        logger.error({ err: error }, "GitHub Events worker failed");
      } finally {
        scheduleNext();
      }
    }, Math.max(1_000, runAt.getTime() - Date.now()));
    logger.info({ runAt: runAt.toISOString() }, "GitHub Events worker scheduled");
  };
  if (process.env.GITHUB_WORKER_RUN_ON_STARTUP === "true") {
    void runGitHubEventsScan().finally(scheduleNext);
  } else {
    scheduleNext();
  }
  return () => {
    if (timer) clearTimeout(timer);
  };
}