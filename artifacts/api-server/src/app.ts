import express, { type Express } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import router from "./routes";
import { logger } from "./lib/logger";
import { WebhookHandlers } from "./lib/webhookHandlers";
import { db, organizations } from "@workspace/db";
import { eq } from "drizzle-orm";
import { DEMO_ORGANIZATION_ID, ensureDemoData } from "./lib/demo-data";

const app: Express = express();

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
app.use(cors());

app.post(
  "/api/stripe/webhook",
  express.raw({ type: "application/json" }),
  async (req, res) => {
    const signature = req.headers["stripe-signature"];
    if (!signature) return res.status(400).json({ error: "Missing stripe-signature" });
    try {
      const sig = Array.isArray(signature) ? signature[0] : signature;
      await WebhookHandlers.processWebhook(req.body as Buffer, sig);
      await syncOrganizationSubscription(req.body as Buffer);
      return res.status(200).json({ received: true });
    } catch (error) {
      req.log.error({ err: error }, "Stripe webhook processing failed");
      return res.status(400).json({ error: "Webhook processing error" });
    }
  },
);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use("/api", router);

async function syncOrganizationSubscription(payload: Buffer) {
  const event = JSON.parse(payload.toString("utf8")) as {
    type?: string;
    data?: { object?: { id?: string; customer?: string; status?: string; metadata?: { organizationId?: string } } };
  };
  if (
    event.type !== "customer.subscription.created" &&
    event.type !== "customer.subscription.updated" &&
    event.type !== "customer.subscription.deleted"
  ) {
    return;
  }
  await ensureDemoData();
  const subscription = event.data?.object;
  const organizationId = subscription?.metadata?.organizationId ?? DEMO_ORGANIZATION_ID;
  const status =
    event.type === "customer.subscription.deleted"
      ? "canceled"
      : subscription?.status === "past_due"
        ? "past_due"
        : "active";
  await db
    .update(organizations)
    .set({
      stripeCustomerId: subscription?.customer ?? undefined,
      stripeSubscriptionId: event.type === "customer.subscription.deleted" ? null : (subscription?.id ?? null),
      subscriptionStatus: status,
    })
    .where(eq(organizations.id, organizationId));
}

export default app;
