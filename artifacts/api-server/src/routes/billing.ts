import { eq } from "drizzle-orm";
import { Router, type IRouter } from "express";
import {
  CreateBillingPortalResponse,
  GetBillingStatusResponse,
} from "@workspace/api-zod";
import { db, organizations } from "@workspace/db";
import { DEMO_ORGANIZATION_ID, ensureDemoData } from "../lib/demo-data";
import { getUncachableStripeClient, isStripeConfigured } from "../lib/stripeClient";

const router: IRouter = Router();

router.get("/billing/status", async (_req, res, next) => {
  try {
    await ensureDemoData();
    const [organization] = await db
      .select()
      .from(organizations)
      .where(eq(organizations.id, DEMO_ORGANIZATION_ID))
      .limit(1);
    return res.json(
      GetBillingStatusResponse.parse({
        tier: organization.subscriptionTier,
        subscriptionStatus: organization.subscriptionStatus,
        stripeConnected: await isStripeConfigured(),
        hasCustomer: Boolean(organization.stripeCustomerId),
        hasSubscription: Boolean(organization.stripeSubscriptionId),
      }),
    );
  } catch (error) {
    return next(error);
  }
});

router.post("/billing/portal", async (req, res, next) => {
  try {
    await ensureDemoData();
    const [organization] = await db
      .select()
      .from(organizations)
      .where(eq(organizations.id, DEMO_ORGANIZATION_ID))
      .limit(1);
    if (!organization.stripeCustomerId) {
      return res.status(409).json({ error: "Organization has no Stripe customer" });
    }
    const stripe = await getUncachableStripeClient();
    const session = await stripe.billingPortal.sessions.create({
      customer: organization.stripeCustomerId,
      return_url: `${req.protocol}://${req.get("host")}/settings`,
    });
    if (!session.url) return res.status(503).json({ error: "Stripe did not return a portal URL" });
    return res.json(CreateBillingPortalResponse.parse({ url: session.url }));
  } catch (error) {
    return next(error);
  }
});

export default router;