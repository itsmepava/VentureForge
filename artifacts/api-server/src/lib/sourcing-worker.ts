import { pool } from "@workspace/db";
import { DEMO_ORGANIZATION_ID, ensureDemoData } from "./demo-data";
import { decryptVaultValues } from "./vault";
import {
  askModel,
  criteriaLabels,
  discoveryQueries,
  domainOf,
  publicUrl,
  searchWeb,
  validateDossier,
  type Criteria,
  type Evidence,
} from "./sourcing";
import { logger } from "./logger";

let running = false;
export async function sourcingConfig() {
  const { rows } = await pool.query(
    "SELECT encrypted_values FROM provider_connections WHERE organization_id=$1 AND provider='sourcing' ORDER BY updated_at DESC LIMIT 1",
    [DEMO_ORGANIZATION_ID],
  );
  const values = rows[0] ? decryptVaultValues(rows[0].encrypted_values) : {};
  return {
    key: process.env.OPENROUTER_API_KEY || values.apiKey || "",
    model: process.env.OPENROUTER_MODEL || values.model || "openrouter/free",
  };
}
async function updateRun(
  id: string,
  progress: string,
  evidence: Evidence[],
  counters: {
    searchCalls: number;
    modelCalls: number;
    tokens: number;
    added: number;
    duplicates: number;
  },
  errors: string[],
) {
  await pool.query(
    "UPDATE sourcing_runs SET progress=$2,evidence=$3,search_calls=$4,model_calls=$5,tokens=$6,added=$7,duplicates=$8,errors=$9 WHERE id=$1",
    [
      id,
      progress,
      JSON.stringify(evidence),
      counters.searchCalls,
      counters.modelCalls,
      counters.tokens,
      counters.added,
      counters.duplicates,
      JSON.stringify(errors),
    ],
  );
}
export async function processNextRun() {
  if (running) return;
  running = true;
  let id: string | undefined;
  const counters = {
    searchCalls: 0,
    modelCalls: 0,
    tokens: 0,
    added: 0,
    duplicates: 0,
  };
  const evidence: Evidence[] = [];
  const errors: string[] = [];
  try {
    const { rows } = await pool.query(
      `UPDATE sourcing_runs SET status='running',progress='Searching the web' WHERE id=(SELECT id FROM sourcing_runs WHERE status='queued' ORDER BY started_at LIMIT 1 FOR UPDATE SKIP LOCKED) RETURNING *`,
    );
    const run = rows[0];
    if (!run) return;
    id = run.id;
    const criteria: Criteria = run.mandate_snapshot.criteria;
    const config = await sourcingConfig();
    for (const query of discoveryQueries(criteria)) {
      counters.searchCalls++;
      try {
        evidence.push(...(await searchWeb(query, evidence.length)));
      } catch (error) {
        errors.push(error instanceof Error ? error.message : "Search failed");
      }
      await updateRun(
        run.id,
        "Collecting discovery evidence",
        evidence,
        counters,
        errors,
      );
    }
    if (!evidence.length)
      throw new Error(
        "No discovery evidence was returned. Retry later or adjust the mandate.",
      );
    if (!config.key) {
      await pool.query(
        "UPDATE sourcing_runs SET status='needs_provider',progress='Search evidence saved. Configure a research model to extract and assess companies.',finished_at=now() WHERE id=$1",
        [run.id],
      );
      return;
    }
    counters.modelCalls++;
    const extracted = await askModel(
      config.key,
      config.model,
      'Identify up to five actual operating companies named in the evidence, excluding investors, publications, directories and list pages themselves. Companies mentioned by those pages may be candidates. Return {"companies":[{"name":"...","sourceId":"s1"}]}. Do not guess a website; a subsequent search will find it. A company may need further research; do not claim qualification yet.',
      { criteria, evidence },
    );
    counters.tokens += extracted.tokens;
    if (!Array.isArray(extracted.data?.companies))
      throw new Error("Model returned an invalid company extraction.");
    const seen = new Set<string>();
    for (const item of extracted.data.companies.slice(0, 5)) {
      const source = evidence.find((row) => row.id === item.sourceId);
      if (
        !source ||
        typeof item.name !== "string" ||
        !item.name.trim() ||
        item.name.length > 150
      )
        continue;
      if (
        !`${source.title} ${source.text}`
          .toLowerCase()
          .includes(item.name.toLowerCase())
      )
        continue;
      const candidateName = item.name.trim().toLowerCase();
      if (seen.has(candidateName)) continue;
      seen.add(candidateName);
      // Research duplicates too, so monitoring updates evidence without resetting call outcomes.
      const research: Evidence[] = [source];
      for (const query of [
        `${item.name} official website founders headquarters contact`,
        `${item.name} funding customers product ${criteria.signals.join(" ")}`,
      ]) {
        counters.searchCalls++;
        try {
          const found = await searchWeb(query, evidence.length);
          evidence.push(...found);
          research.push(...found);
        } catch (error) {
          errors.push(
            `${item.name}: ${error instanceof Error ? error.message : "Research search failed"}`,
          );
        }
        await updateRun(
          run.id,
          `Researching ${item.name}`,
          evidence,
          counters,
          errors,
        );
      }
      try {
        counters.modelCalls++;
        const assessment = await askModel(
          config.key,
          config.model,
          'Build an evidence-backed company dossier. Return {"facts":{"description":{"value":"...","sourceId":"s1","quote":"exact excerpt"},"website":{...},"country":{...},"sector":{...},"businessModel":{...},"stage":{...},"founders":{...},"contact":{...},"traction":{...},"funding":{...},"active":{...}},"checks":[{"criterion":"EXACT requested label","result":"match|fail|unknown","sourceId":"s1","quote":"exact excerpt"}]}. Omit unknown facts. Founders must be named people; contact must be an explicitly published business email or contact page URL, never guessed. Facts must quote a supporting excerpt. active.value is "true" only when evidence establishes current operation, not just historical funding. Match geographies to headquarters, not customer markets. Alternatives within geography/sectors/stages/businessModels are OR; all signals and all exclusions must be satisfied. Exclusions match means none applies. Treat ambiguous or stale evidence as unknown. Website must be the company website, not a news article. All requested checks must be returned; do not assume a match.',
          {
            company: { name: item.name },
            criteria,
            requestedChecks: criteriaLabels(criteria),
            evidence: research,
          },
        );
        counters.tokens += assessment.tokens;
        const website = publicUrl(assessment.data?.facts?.website?.value);
        const websiteSource = research.find(row => row.id === assessment.data?.facts?.website?.sourceId);
        if (!website || !websiteSource || !`${websiteSource.url} ${websiteSource.text}`.toLowerCase().includes(domainOf(website))) {
          throw new Error('No sourced company website found; discovery evidence retained.');
        }
        const domain = domainOf(website);
        const existing = await pool.query(
          "SELECT id FROM sourcing_prospects WHERE organization_id=$1 AND mandate_id=$2 AND domain=$3",
          [run.organization_id, run.mandate_id, domain],
        );
        const dossier = validateDossier(
          assessment.data,
          { name: item.name.trim(), website },
          criteria,
          research,
        );
        await pool.query(
          `INSERT INTO sourcing_prospects(organization_id,mandate_id,run_id,domain,name,dossier,status) VALUES($1,$2,$3,$4,$5,$6,$7)
          ON CONFLICT(organization_id,mandate_id,domain) DO UPDATE SET run_id=EXCLUDED.run_id,name=EXCLUDED.name,dossier=EXCLUDED.dossier,updated_at=now(),
          status=CASE WHEN sourcing_prospects.status IN ('contacted','dismissed') THEN sourcing_prospects.status ELSE EXCLUDED.status END`,
          [
            run.organization_id,
            run.mandate_id,
            run.id,
            domain,
            item.name.trim(),
            JSON.stringify(dossier),
            dossier.checks.some((check) => check.result === "fail")
              ? "not_a_fit"
              : dossier.ready
                ? "ready"
                : "needs_review",
          ],
        );
        if (existing.rowCount) counters.duplicates++;
        else counters.added++;
      } catch (error) {
        errors.push(
          `${item.name}: ${error instanceof Error ? error.message : "Assessment failed"}`,
        );
      }
      await updateRun(
        run.id,
        `Processed candidate ${item.name}`,
        evidence,
        counters,
        errors,
      );
    }
    await updateRun(
      run.id,
      `Scan finished: ${counters.added} new prospects, ${counters.duplicates} updated`,
      evidence,
      counters,
      errors,
    );
    await pool.query(
      "UPDATE sourcing_runs SET status=$2,finished_at=now() WHERE id=$1",
      [run.id, errors.length ? "partial" : "completed"],
    );
  } catch (error) {
    if (id) {
      errors.push(error instanceof Error ? error.message : "Sourcing failed");
      await updateRun(
        id,
        "Scan failed; collected evidence retained",
        evidence,
        counters,
        errors,
      );
      await pool.query(
        "UPDATE sourcing_runs SET status='failed',finished_at=now() WHERE id=$1",
        [id],
      );
    }
    logger.error(
      { message: error instanceof Error ? error.message : "Sourcing error" },
      "Sourcing worker failed",
    );
  } finally {
    running = false;
  }
}
export async function enqueueScan(mandateId: string) {
  // Lock the mandate so simultaneous button clicks cannot enqueue two scans.
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const { rows } = await client.query(
      "SELECT * FROM sourcing_mandates WHERE id=$1 AND organization_id=$2 FOR UPDATE",
      [mandateId, DEMO_ORGANIZATION_ID],
    );
    const mandate = rows[0];
    if (!mandate) throw new Error("Mandate not found");
    const existing = await client.query(
      "SELECT * FROM sourcing_runs WHERE mandate_id=$1 AND status IN ('queued','running') LIMIT 1",
      [mandateId],
    );
    const result =
      existing.rows[0] ??
      (
        await client.query(
          "INSERT INTO sourcing_runs(organization_id,mandate_id,mandate_snapshot) VALUES($1,$2,$3) RETURNING *",
          [DEMO_ORGANIZATION_ID, mandateId, JSON.stringify(mandate)],
        )
      ).rows[0];
    await client.query(
      "UPDATE sourcing_mandates SET next_scan_at=now()+interval '24 hours' WHERE id=$1",
      [mandateId],
    );
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
export async function startSourcingWorker() {
  await ensureDemoData();
  await pool.query(
    "UPDATE sourcing_runs SET status='interrupted',progress='App stopped during this scan. Start a new scan to retry.',finished_at=now() WHERE status='running'",
  );
  const tick = async () => {
    try {
      const { rows } = await pool.query(
        "SELECT id FROM sourcing_mandates WHERE organization_id=$1 AND daily=true AND next_scan_at<=now() LIMIT 10",
        [DEMO_ORGANIZATION_ID],
      );
      for (const row of rows) await enqueueScan(row.id);
      await processNextRun();
    } catch (error) {
      logger.error(
        {
          message: error instanceof Error ? error.message : "Scheduler failed",
        },
        "Sourcing scheduler error",
      );
    }
  };
  void tick();
  setInterval(() => void tick(), 5000).unref();
}
