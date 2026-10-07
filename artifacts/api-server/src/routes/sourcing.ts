import { Router, type IRouter } from "express";
import { pool } from "@workspace/db";
import { z } from "zod";
import { DEMO_ORGANIZATION_ID, ensureDemoData } from "../lib/demo-data";
import { enqueueScan, sourcingConfig } from "../lib/sourcing-worker";
import { encryptVaultValues } from "../lib/vault";

const router: IRouter = Router();
const list = z.array(z.string().trim().min(1).max(100)).max(10);
const mandateInput = z.object({
  name: z.string().trim().min(1).max(100),
  daily: z.boolean(),
  criteria: z.object({
    geographies: list,
    sectors: list.min(1),
    stages: list,
    businessModels: list,
    signals: list,
    exclusions: list,
  }),
});
const uuid = z.string().uuid();
router.get("/sourcing", async (_req, res, next) => {
  try {
    await ensureDemoData();
    const [mandates, runs, prospects, config] = await Promise.all([
      pool.query(
        "SELECT * FROM sourcing_mandates WHERE organization_id=$1 ORDER BY created_at DESC",
        [DEMO_ORGANIZATION_ID],
      ),
      pool.query(
        "SELECT * FROM sourcing_runs WHERE organization_id=$1 ORDER BY started_at DESC LIMIT 20",
        [DEMO_ORGANIZATION_ID],
      ),
      pool.query(
        "SELECT * FROM sourcing_prospects WHERE organization_id=$1 ORDER BY updated_at DESC LIMIT 200",
        [DEMO_ORGANIZATION_ID],
      ),
      sourcingConfig(),
    ]);
    return res.json({
      mandates: mandates.rows,
      runs: runs.rows,
      prospects: prospects.rows,
      provider: { configured: !!config.key, model: config.model },
      limits: { prospects: 200, runs: 20, companiesPerScan: 5 },
    });
  } catch (error) {
    return next(error);
  }
});
router.post("/sourcing/mandates", async (req, res, next) => {
  try {
    const parsed = mandateInput.safeParse(req.body);
    if (!parsed.success)
      return res
        .status(400)
        .json({
          error:
            "Enter a mandate name and at least one sector. Each criterion must be under 100 characters.",
        });
    await ensureDemoData();
    const { rows } = await pool.query(
      "INSERT INTO sourcing_mandates(organization_id,name,criteria,daily,next_scan_at) VALUES($1,$2,$3,$4,now()) RETURNING *",
      [
        DEMO_ORGANIZATION_ID,
        parsed.data.name,
        JSON.stringify(parsed.data.criteria),
        parsed.data.daily,
      ],
    );
    return res.status(201).json(rows[0]);
  } catch (error) {
    return next(error);
  }
});
router.patch("/sourcing/mandates/:id", async (req, res, next) => {
  try {
    const parsed = mandateInput.safeParse(req.body);
    if (!uuid.safeParse(req.params.id).success || !parsed.success)
      return res.status(400).json({ error: "Invalid mandate." });
    const { rows } = await pool.query(
      "UPDATE sourcing_mandates SET name=$3,criteria=$4,daily=$5,next_scan_at=CASE WHEN daily=false AND $5=true THEN now() ELSE next_scan_at END WHERE id=$1 AND organization_id=$2 RETURNING *",
      [
        req.params.id,
        DEMO_ORGANIZATION_ID,
        parsed.data.name,
        JSON.stringify(parsed.data.criteria),
        parsed.data.daily,
      ],
    );
    return rows[0]
      ? res.json(rows[0])
      : res.status(404).json({ error: "Mandate not found." });
  } catch (error) {
    return next(error);
  }
});
router.post("/sourcing/mandates/:id/scan", async (req, res, next) => {
  try {
    if (!uuid.safeParse(req.params.id).success)
      return res.status(400).json({ error: "Invalid mandate ID." });
    const exists = await pool.query(
      "SELECT id FROM sourcing_mandates WHERE id=$1 AND organization_id=$2",
      [req.params.id, DEMO_ORGANIZATION_ID],
    );
    if (!exists.rowCount)
      return res.status(404).json({ error: "Mandate not found." });
    return res.status(202).json(await enqueueScan(String(req.params.id)));
  } catch (error) {
    return next(error);
  }
});
router.put("/sourcing/provider", async (req, res, next) => {
  try {
    const parsed = z
      .object({
        apiKey: z.string().trim().min(10).max(500),
        model: z
          .string()
          .trim()
          .regex(/^[a-zA-Z0-9_.:/-]+$/)
          .max(150),
      })
      .safeParse(req.body);
    if (!parsed.success)
      return res
        .status(400)
        .json({
          error: "Enter an OpenRouter API key and valid model identifier.",
        });
    // Free local milestone: require a free model; never silently fall back to a paid one.
    if (
      parsed.data.model !== "openrouter/free" &&
      !parsed.data.model.endsWith(":free")
    )
      return res
        .status(400)
        .json({
          error:
            "Choose openrouter/free or a model ending in :free for this local milestone.",
        });
    await ensureDemoData();
    const encrypted = encryptVaultValues(parsed.data);
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(
        "SELECT id FROM organizations WHERE id=$1 FOR UPDATE",
        [DEMO_ORGANIZATION_ID],
      );
      await client.query(
        "DELETE FROM provider_connections WHERE organization_id=$1 AND provider='sourcing'",
        [DEMO_ORGANIZATION_ID],
      );
      await client.query(
        "INSERT INTO provider_connections(organization_id,provider,label,encrypted_values) VALUES($1,'sourcing','OpenRouter research',$2)",
        [DEMO_ORGANIZATION_ID, encrypted],
      );
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
    return res.json({ configured: true, model: parsed.data.model });
  } catch (error) {
    return next(error);
  }
});
router.delete("/sourcing/provider", async (_req, res, next) => {
  try {
    await pool.query(
      "DELETE FROM provider_connections WHERE organization_id=$1 AND provider='sourcing'",
      [DEMO_ORGANIZATION_ID],
    );
    return res.status(204).end();
  } catch (error) {
    return next(error);
  }
});
router.patch("/sourcing/prospects/:id", async (req, res, next) => {
  try {
    const parsed = z
      .object({
        status: z.enum(["contacted", "dismissed", "needs_review"]),
        notes: z.string().max(5000),
      })
      .safeParse(req.body);
    if (!uuid.safeParse(req.params.id).success || !parsed.success)
      return res.status(400).json({ error: "Invalid prospect update." });
    const { rows } = await pool.query(
      "UPDATE sourcing_prospects SET status=$3,notes=$4 WHERE id=$1 AND organization_id=$2 RETURNING *",
      [
        req.params.id,
        DEMO_ORGANIZATION_ID,
        parsed.data.status,
        parsed.data.notes,
      ],
    );
    return rows[0]
      ? res.json(rows[0])
      : res.status(404).json({ error: "Prospect not found." });
  } catch (error) {
    return next(error);
  }
});
router.get("/sourcing/export.csv", async (_req, res, next) => {
  try {
    const { rows } = await pool.query(
      "SELECT p.*,m.name AS mandate_name FROM sourcing_prospects p JOIN sourcing_mandates m ON p.mandate_id=m.id WHERE p.organization_id=$1 ORDER BY p.updated_at DESC",
      [DEMO_ORGANIZATION_ID],
    );
    const cell = (value: unknown) => {
      let text = String(value ?? "");
      if (/^[\s]*[=+@-]/.test(text)) text = `'${text}`;
      return `"${text.replaceAll('"', '""')}"`;
    };
    const fields = [
      "description",
      "country",
      "sector",
      "businessModel",
      "stage",
      "founders",
      "contact",
      "traction",
      "funding",
    ];
    const csv = [
      [
        "Company",
        "Website",
        "Mandate",
        "Status",
        ...fields,
        "Gaps",
        "Sources",
        "Researched at",
        "Notes",
      ],
      ...rows.map((row) => [
        row.name,
        row.dossier.website,
        row.mandate_name,
        row.status,
        ...fields.map((key) => row.dossier.facts[key]?.value ?? ""),
        row.dossier.gaps.join("; "),
        row.dossier.evidence.map((item: any) => item.url).join("; "),
        row.dossier.researchedAt,
        row.notes,
      ]),
    ]
      .map((row) => row.map(cell).join(","))
      .join("\r\n");
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader(
      "Content-Disposition",
      'attachment; filename="ventureforge-prospects.csv"',
    );
    return res.send(csv);
  } catch (error) {
    return next(error);
  }
});
export default router;
