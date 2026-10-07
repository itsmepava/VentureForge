import Stripe from "stripe";

async function getStripeCredentials() {
  if (process.env.STRIPE_SECRET_KEY) {
    return { secretKey: process.env.STRIPE_SECRET_KEY, webhookSecret: process.env.STRIPE_WEBHOOK_SECRET };
  }
  const { readProviderValues } = await import("./providers");
  const configured = await readProviderValues("stripe");
  if (!configured?.values.secretKey) throw new Error("Configure Stripe in the encrypted vault or set STRIPE_SECRET_KEY.");
  return { secretKey: configured.values.secretKey, webhookSecret: configured.values.webhookSecret };
}

export async function getUncachableStripeClient() {
  const { secretKey } = await getStripeCredentials();
  return new Stripe(secretKey);
}

export async function verifyStripeWebhook(payload: Buffer, signature: string) {
  const { secretKey, webhookSecret } = await getStripeCredentials();
  if (!webhookSecret) throw new Error("STRIPE_WEBHOOK_SECRET is required to verify Stripe webhooks.");
  new Stripe(secretKey).webhooks.constructEvent(payload, signature, webhookSecret);
}

export async function isStripeConfigured() {
  try { await getStripeCredentials(); return true; }
  catch { return false; }
}
