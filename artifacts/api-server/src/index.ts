import app from "./app";
import { logger } from "./lib/logger";
import { runMigrations } from "stripe-replit-sync";
import { getStripeSync } from "./lib/stripeClient";
import { scheduleNightlyGitHubEventsWorker } from "./lib/github-events-worker";
import { runApplicationMigrations } from "@workspace/db";
import { stripeWebhookBaseUrl } from "./lib/stripe-subscription-events";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

await runApplicationMigrations();
logger.info("Application database migrations completed");

if (process.env.STRIPE_SYNC_ENABLED === "true") {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is required when STRIPE_SYNC_ENABLED=true");
  }
  await runMigrations({ databaseUrl: process.env.DATABASE_URL });
  const stripeSync = await getStripeSync();
  const webhookBaseUrl = stripeWebhookBaseUrl(process.env);
  await stripeSync.findOrCreateManagedWebhook(`${webhookBaseUrl}/api/stripe/webhook`);
  stripeSync.syncBackfill().catch((error) => logger.error({ err: error }, "Stripe backfill failed"));
}

app.listen(port, (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }

  logger.info({ port }, "Server listening");
  scheduleNightlyGitHubEventsWorker();
});
