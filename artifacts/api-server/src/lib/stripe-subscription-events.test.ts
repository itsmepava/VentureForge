import assert from "node:assert/strict";
import test from "node:test";
import {
  parseStripeSubscriptionEvent,
  resolveStripeSubscriptionOrganization,
  stripeWebhookBaseUrl,
} from "./stripe-subscription-events.ts";

function payload(object: object, type = "customer.subscription.updated") {
  return Buffer.from(JSON.stringify({ type, data: { object } }));
}

test("parses signed subscription payload data without a demo-tenant fallback", () => {
  assert.deepEqual(
    parseStripeSubscriptionEvent(
      payload({
        id: "sub_123",
        customer: { id: "cus_123" },
        status: "trialing",
        metadata: { organizationId: "00000000-0000-4000-8000-000000000111" },
      }),
    ),
    {
      eventType: "customer.subscription.updated",
      organizationId: "00000000-0000-4000-8000-000000000111",
      customerId: "cus_123",
      subscriptionId: "sub_123",
      status: "active",
    },
  );
  assert.equal(parseStripeSubscriptionEvent(payload({}, "invoice.paid")), null);
});

test("rejects malformed tenant and Stripe identities", () => {
  assert.throws(
    () =>
      parseStripeSubscriptionEvent(
        payload({
          id: "sub_123",
          customer: "cus_123",
          metadata: { organizationId: "not-a-uuid" },
        }),
      ),
    /invalid organizationId/,
  );
  assert.throws(
    () => parseStripeSubscriptionEvent(payload({ id: "sub_123" })),
    /missing customer or subscription identity/,
  );
});

test("requires an explicit valid HTTPS webhook origin outside Replit", () => {
  assert.equal(
    stripeWebhookBaseUrl({ STRIPE_WEBHOOK_BASE_URL: "https://billing.example.com/" }),
    "https://billing.example.com",
  );
  assert.equal(
    stripeWebhookBaseUrl({ REPLIT_DOMAINS: "ventureforge.example,other.example" }),
    "https://ventureforge.example",
  );
  assert.throws(() => stripeWebhookBaseUrl({}), /is required/);
  assert.throws(
    () => stripeWebhookBaseUrl({ STRIPE_WEBHOOK_BASE_URL: "http://billing.example.com" }),
    /must use HTTPS/,
  );
  assert.throws(
    () => stripeWebhookBaseUrl({ STRIPE_WEBHOOK_BASE_URL: "https://billing.example.com/hooks" }),
    /must be an origin/,
  );
  assert.throws(
    () => stripeWebhookBaseUrl({ STRIPE_WEBHOOK_BASE_URL: "https://user:pass@billing.example.com" }),
    /must be an origin/,
  );
});

test("binds events without allowing cross-tenant identity reassignment", () => {
  const subscription = parseStripeSubscriptionEvent(
    payload({
      id: "sub_123",
      customer: "cus_123",
      status: "active",
      metadata: { organizationId: "00000000-0000-4000-8000-000000000111" },
    }),
  );
  assert.ok(subscription);
  assert.equal(
    resolveStripeSubscriptionOrganization(subscription, [
      {
        id: "00000000-0000-4000-8000-000000000111",
        stripeCustomerId: null,
        stripeSubscriptionId: null,
      },
    ]).action,
    "apply",
  );
  assert.throws(
    () =>
      resolveStripeSubscriptionOrganization(subscription, [
        {
          id: "00000000-0000-4000-8000-000000000111",
          stripeCustomerId: null,
          stripeSubscriptionId: null,
        },
        {
          id: "00000000-0000-4000-8000-000000000222",
          stripeCustomerId: "cus_123",
          stripeSubscriptionId: "sub_other",
        },
      ]),
    /different organization/,
  );
});

test("ignores an old deletion after an organization moves to a replacement subscription", () => {
  const subscription = parseStripeSubscriptionEvent(
    payload(
      {
        id: "sub_old",
        customer: "cus_123",
        status: "canceled",
        metadata: { organizationId: "00000000-0000-4000-8000-000000000111" },
      },
      "customer.subscription.deleted",
    ),
  );
  assert.ok(subscription);
  assert.deepEqual(
    resolveStripeSubscriptionOrganization(subscription, [
      {
        id: "00000000-0000-4000-8000-000000000111",
        stripeCustomerId: "cus_123",
        stripeSubscriptionId: "sub_replacement",
      },
    ]),
    {
      action: "ignore",
      reason: "stale-deletion",
      organization: {
        id: "00000000-0000-4000-8000-000000000111",
        stripeCustomerId: "cus_123",
        stripeSubscriptionId: "sub_replacement",
      },
    },
  );
});