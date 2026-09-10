import express, { Router, type Request } from "express";
import { db, organizations } from "@workspace/db";
import { and, eq, isNull, or } from "drizzle-orm";
import { logger } from "./logger.ts";
import { WebhookHandlers } from "./webhookHandlers.ts";
import {
  normalizeStripeSubscriptionEvent,
  parseStripeSubscriptionEvent,
  resolveStripeSubscriptionOrganization,
  type StripeSubscriptionEvent,
} from "./stripe-subscription-events.ts";
import { getUncachableStripeClient } from "./stripeClient.ts";

type StripeSubscriptionPayload = {
  id?: unknown;
  customer?: unknown;
  status?: unknown;
  metadata?: { organizationId?: unknown } | null;
};

export type StripeWebhookDependencies = {
  processWebhook: (payload: Buffer, signature: string) => Promise<void>;
  retrieveSubscription: (subscriptionId: string) => Promise<StripeSubscriptionPayload>;
};

function productionStripeWebhookDependencies(): StripeWebhookDependencies {
  return {
    processWebhook: (payload, signature) =>
      WebhookHandlers.processWebhook(payload, signature),
    retrieveSubscription: async (subscriptionId) => {
      const stripe = await getUncachableStripeClient();
      return stripe.subscriptions.retrieve(subscriptionId);
    },
  };
}

function requestLogger(request: Request) {
  return request.log ?? logger;
}

export function createStripeWebhookRouter(
  stripeDependencies: StripeWebhookDependencies = productionStripeWebhookDependencies(),
) {
  const router = Router();

  router.post(
    "/api/stripe/webhook",
    express.raw({ type: "application/json" }),
    async (req, res) => {
      const signature = req.headers["stripe-signature"];
      if (!signature) return res.status(400).json({ error: "Missing stripe-signature" });
      try {
        const sig = Array.isArray(signature) ? signature[0] : signature;
        await stripeDependencies.processWebhook(req.body as Buffer, sig);
        const webhookSubscription = parseStripeSubscriptionEvent(req.body as Buffer);
        if (webhookSubscription) {
          const canonical = await stripeDependencies.retrieveSubscription(
            webhookSubscription.subscriptionId,
          );
          const canonicalEvent = normalizeStripeSubscriptionEvent(
            canonical.status === "canceled"
              ? "customer.subscription.deleted"
              : "customer.subscription.updated",
            canonical,
          );
          if (!canonicalEvent) throw new Error("Stripe returned an invalid subscription");
          await syncOrganizationSubscription(canonicalEvent);
        }
        return res.status(200).json({ received: true });
      } catch (error) {
        requestLogger(req).error({ err: error }, "Stripe webhook processing failed");
        return res.status(400).json({ error: "Webhook processing error" });
      }
    },
  );

  return router;
}

async function syncOrganizationSubscription(subscription: StripeSubscriptionEvent) {
  const candidates = await db
    .select()
    .from(organizations)
    .where(
      or(
        subscription.organizationId
          ? eq(organizations.id, subscription.organizationId)
          : undefined,
        eq(organizations.stripeSubscriptionId, subscription.subscriptionId),
        eq(organizations.stripeCustomerId, subscription.customerId),
      ),
    );
  const resolution = resolveStripeSubscriptionOrganization(subscription, candidates);
  if (resolution.action === "ignore" && resolution.reason === "unlinked") {
    logger.warn(
      {
        customerId: subscription.customerId,
        subscriptionId: subscription.subscriptionId,
      },
      "Ignoring Stripe subscription event that is not linked to an organization",
    );
    return;
  }
  if (resolution.action === "ignore") {
    logger.info(
      {
        organizationId: resolution.organization.id,
        subscriptionId: subscription.subscriptionId,
      },
      "Ignoring stale Stripe subscription deletion",
    );
    return;
  }
  const organization = resolution.organization;
  const updated = await db
    .update(organizations)
    .set({
      stripeCustomerId: subscription.customerId,
      stripeSubscriptionId:
        subscription.eventType === "customer.subscription.deleted"
          ? null
          : subscription.subscriptionId,
      subscriptionStatus: subscription.status,
    })
    .where(
      and(
        eq(organizations.id, organization.id),
        organization.stripeCustomerId
          ? eq(organizations.stripeCustomerId, organization.stripeCustomerId)
          : isNull(organizations.stripeCustomerId),
        organization.stripeSubscriptionId
          ? eq(organizations.stripeSubscriptionId, organization.stripeSubscriptionId)
          : isNull(organizations.stripeSubscriptionId),
      ),
    )
    .returning({ id: organizations.id });
  if (!updated.length) {
    if (subscription.eventType === "customer.subscription.deleted") {
      logger.info(
        {
          organizationId: organization.id,
          subscriptionId: subscription.subscriptionId,
        },
        "Ignoring Stripe deletion after the organization binding changed",
      );
      return;
    }
    throw new Error("Organization Stripe binding changed concurrently");
  }
}