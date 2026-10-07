import { verifyStripeWebhook } from "./stripeClient.ts";

export class WebhookHandlers {
  static async processWebhook(payload: Buffer, signature: string) {
    if (!Buffer.isBuffer(payload)) {
      throw new Error("Stripe webhook payload must be a raw Buffer");
    }
    await verifyStripeWebhook(payload, signature);
  }
}
