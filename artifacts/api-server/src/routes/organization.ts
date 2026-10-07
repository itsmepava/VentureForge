import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { GetOrganizationResponse, UpdateOrganizationBody } from "@workspace/api-zod";
import { db, organizations } from "@workspace/db";
import { DEMO_ORGANIZATION_ID, ensureDemoData } from "../lib/demo-data";

const router: IRouter = Router();
router.get("/organization", async (_req, res, next) => {
  try {
    await ensureDemoData();
    const [organization] = await db.select().from(organizations).where(eq(organizations.id, DEMO_ORGANIZATION_ID));
    return res.json(GetOrganizationResponse.parse(organization));
  } catch (error) { return next(error); }
});
router.patch("/organization", async (req, res, next) => {
  try {
    const parsed = UpdateOrganizationBody.safeParse(req.body);
    if (!parsed.success || !parsed.data.companyName.trim()) return res.status(400).json({ error: "Enter a workspace name and supported geography." });
    await ensureDemoData();
    const [organization] = await db.update(organizations).set({ ...parsed.data, companyName: parsed.data.companyName.trim() }).where(eq(organizations.id, DEMO_ORGANIZATION_ID)).returning();
    return res.json(GetOrganizationResponse.parse(organization));
  } catch (error) { return next(error); }
});
export default router;
