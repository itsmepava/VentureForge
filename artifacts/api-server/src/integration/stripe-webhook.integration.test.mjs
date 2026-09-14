import assert from "node:assert/strict";
import { createHmac, timingSafeEqual } from "node:crypto";
import { createRequire } from "node:module";
import { randomUUID } from "node:crypto";
import test from "node:test";
import express from "express";
import pinoHttp from "pino-http";
import { logger } from "../lib/logger.ts";

const databaseRequire = createRequire(
  new URL("../../../../lib/db/package.json", import.meta.url),
);
const pg = databaseRequire("pg");
const { Pool } = pg;

function signedHeader(payload, secret, timestamp = Math.floor(Date.now() / 1000)) {
  const digest = createHmac("sha256", secret)
    .update(`${timestamp}.${payload}`)
    .digest("hex");
  return `t=${timestamp},v1=${digest}`;
}

function subscriptionPayload({
  eventType = "customer.subscription.updated",
  subscriptionId,
  customerId,
  organizationId,
  status = "active",
}) {
  return JSON.stringify({
    type: eventType,
    data: {
      object: {
        id: subscriptionId,
        customer: customerId,
        status,
        metadata: organizationId ? { organizationId } : {},
      },
    },
  });
}

async function listen(app) {
  const server = app.listen(0, "127.0.0.1");
  await new Promise((resolve, reject) => {
    server.once("listening", resolve);
    server.once("error", reject);
  });
  const address = server.address();
  assert.ok(address && typeof address === "object");
  return {
    server,
    baseUrl: `http://127.0.0.1:${address.port}`,
  };
}

test("Stripe webhook route verifies signatures and preserves newest tenant billing state", async (context) => {
  assert.ok(process.env.DATABASE_URL, "DATABASE_URL is required for the Stripe integration test");
  const adminPool = new Pool({ connectionString: process.env.DATABASE_URL });
  const schema = `stripe_webhook_test_${randomUUID().replaceAll("-", "")}`;
  await adminPool.query(`create schema "${schema}"`);
  const scopedDatabaseUrl = new URL(process.env.DATABASE_URL);
  scopedDatabaseUrl.searchParams.set("options", `-c search_path=${schema}`);
  process.env.DATABASE_URL = scopedDatabaseUrl.toString();

  const { createStripeWebhookRouter } = await import("../lib/stripe-webhook-route.ts");
  const { pool, runApplicationMigrations } = await import("@workspace/db");
  await runApplicationMigrations();

  const webhookSecret = "whsec_integration_test";
  const canonicalSubscriptions = new Map();
  const retrievalFailures = new Set();
  const dependencies = {
    processWebhook: async (payload, signature) => {
      const [timestampPart, signaturePart] = signature.split(",");
      const timestamp = timestampPart?.replace(/^t=/, "");
      const received = signaturePart?.replace(/^v1=/, "");
      const expected = createHmac("sha256", webhookSecret)
        .update(`${timestamp}.${payload.toString("utf8")}`)
        .digest("hex");
      if (
        !timestamp
        || !received
        || received.length !== expected.length
        || !timingSafeEqual(Buffer.from(received), Buffer.from(expected))
      ) {
        throw new Error("Invalid Stripe signature");
      }
    },
    retrieveSubscription: async (subscriptionId) => {
      await new Promise((resolve) => setImmediate(resolve));
      if (retrievalFailures.has(subscriptionId)) {
        throw new Error("Stripe canonical retrieval failed");
      }
      const subscription = canonicalSubscriptions.get(subscriptionId);
      if (!subscription) throw new Error("Stripe subscription was not found");
      return subscription;
    },
  };
  const testApp = express();
  testApp.use(pinoHttp({ logger }));
  testApp.use(createStripeWebhookRouter(dependencies));
  const { server, baseUrl } = await listen(testApp);

  context.after(async () => {
    await new Promise((resolve) => server.close(resolve));
    await pool.end();
    await adminPool.query(`drop schema if exists "${schema}" cascade`);
    await adminPool.end();
  });

  const postEvent = async (body, signature = signedHeader(body, webhookSecret)) =>
    fetch(`${baseUrl}/api/stripe/webhook`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "stripe-signature": signature,
      },
      body,
    });

  const organizationId = randomUUID();
  const conflictOrganizationId = randomUUID();
  const customerId = `cus_${randomUUID()}`;
  const replacementSubscriptionId = `sub_${randomUUID()}`;
  const oldSubscriptionId = `sub_${randomUUID()}`;
  const conflictCustomerId = `cus_${randomUUID()}`;
  const conflictSubscriptionId = `sub_${randomUUID()}`;
  await pool.query(
    `insert into organizations
      (id, company_name, stripe_customer_id, stripe_subscription_id, subscription_status)
     values
      ($1, 'Primary organization', $2, $3, 'active'),
      ($4, 'Conflicting organization', $5, $6, 'active')`,
    [
      organizationId,
      customerId,
      replacementSubscriptionId,
      conflictOrganizationId,
      conflictCustomerId,
      conflictSubscriptionId,
    ],
  );

  const unknownSubscriptionId = `sub_${randomUUID()}`;
  const unknownBody = subscriptionPayload({
    subscriptionId: unknownSubscriptionId,
    customerId: `cus_${randomUUID()}`,
  });
  canonicalSubscriptions.set(unknownSubscriptionId, {
    id: unknownSubscriptionId,
    customer: JSON.parse(unknownBody).data.object.customer,
    status: "active",
    metadata: {},
  });
  const unknownResponse = await postEvent(unknownBody);
  assert.equal(unknownResponse.status, 200);
  const unknownOrganizations = await pool.query(
    "select count(*)::int as count from organizations where stripe_subscription_id = $1",
    [unknownSubscriptionId],
  );
  assert.equal(unknownOrganizations.rows[0].count, 0);

  const invalidSignatureBody = subscriptionPayload({
    subscriptionId: replacementSubscriptionId,
    customerId,
    organizationId,
  });
  const invalidSignatureResponse = await postEvent(
    invalidSignatureBody,
    "t=1,v1=invalid",
  );
  assert.equal(invalidSignatureResponse.status, 400);

  const retrievalFailureSubscriptionId = `sub_${randomUUID()}`;
  const retrievalFailureBody = subscriptionPayload({
    subscriptionId: retrievalFailureSubscriptionId,
    customerId,
    organizationId,
  });
  canonicalSubscriptions.set(retrievalFailureSubscriptionId, {
    id: retrievalFailureSubscriptionId,
    customer: customerId,
    status: "active",
    metadata: { organizationId },
  });
  retrievalFailures.add(retrievalFailureSubscriptionId);
  const retrievalFailureResponse = await postEvent(retrievalFailureBody);
  assert.equal(retrievalFailureResponse.status, 400);
  retrievalFailures.delete(retrievalFailureSubscriptionId);

  const conflictBody = subscriptionPayload({
    subscriptionId: `sub_${randomUUID()}`,
    customerId: conflictCustomerId,
    organizationId,
  });
  canonicalSubscriptions.set(JSON.parse(conflictBody).data.object.id, {
    id: JSON.parse(conflictBody).data.object.id,
    customer: conflictCustomerId,
    status: "active",
    metadata: { organizationId },
  });
  const conflictResponse = await postEvent(conflictBody);
  assert.equal(conflictResponse.status, 400);
  const conflictOrganizations = await pool.query(
    `select id, stripe_customer_id, stripe_subscription_id, subscription_status
     from organizations where id in ($1, $2) order by id`,
    [organizationId, conflictOrganizationId],
  );
  assert.deepEqual(
    conflictOrganizations.rows.sort((left, right) => left.id.localeCompare(right.id)),
    [
      {
        id: conflictOrganizationId,
        stripe_customer_id: conflictCustomerId,
        stripe_subscription_id: conflictSubscriptionId,
        subscription_status: "active",
      },
      {
        id: organizationId,
        stripe_customer_id: customerId,
        stripe_subscription_id: replacementSubscriptionId,
        subscription_status: "active",
      },
    ].sort((left, right) => left.id.localeCompare(right.id)),
  );

  canonicalSubscriptions.set(replacementSubscriptionId, {
    id: replacementSubscriptionId,
    customer: customerId,
    status: "active",
    metadata: { organizationId },
  });
  canonicalSubscriptions.set(oldSubscriptionId, {
    id: oldSubscriptionId,
    customer: customerId,
    status: "canceled",
    metadata: { organizationId },
  });
  const replacementBody = subscriptionPayload({
    subscriptionId: replacementSubscriptionId,
    customerId,
    organizationId,
  });
  const staleDeletionBody = subscriptionPayload({
    eventType: "customer.subscription.deleted",
    subscriptionId: oldSubscriptionId,
    customerId,
    organizationId,
    status: "canceled",
  });
  const [replacementResponse, staleDeletionResponse] = await Promise.all([
    postEvent(replacementBody),
    postEvent(staleDeletionBody),
  ]);
  assert.equal(replacementResponse.status, 200);
  assert.equal(staleDeletionResponse.status, 200);
  const finalOrganization = await pool.query(
    `select stripe_customer_id, stripe_subscription_id, subscription_status
     from organizations where id = $1`,
    [organizationId],
  );
  assert.deepEqual(finalOrganization.rows[0], {
    stripe_customer_id: customerId,
    stripe_subscription_id: replacementSubscriptionId,
    subscription_status: "active",
  });
});