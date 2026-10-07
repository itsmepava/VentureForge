export type SubscriptionStatus = "active" | "past_due" | "canceled";

export type StripeSubscriptionEvent = {
  eventType: "customer.subscription.created" | "customer.subscription.updated" | "customer.subscription.deleted";
  organizationId?: string;
  customerId: string;
  subscriptionId: string;
  status: SubscriptionStatus;
};

export type StripeLinkedOrganization = {
  id: string;
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
};

const subscriptionEventTypes = new Set([
  "customer.subscription.created",
  "customer.subscription.updated",
  "customer.subscription.deleted",
]);

function stripeId(value: unknown) {
  if (typeof value === "string") return value;
  if (value && typeof value === "object" && "id" in value && typeof value.id === "string") {
    return value.id;
  }
  return undefined;
}

function subscriptionStatus(eventType: string, stripeStatus: unknown): SubscriptionStatus {
  if (eventType === "customer.subscription.deleted") return "canceled";
  if (stripeStatus === "active" || stripeStatus === "trialing") return "active";
  if (stripeStatus === "canceled" || stripeStatus === "incomplete_expired") return "canceled";
  return "past_due";
}

export function normalizeStripeSubscriptionEvent(
  eventType: unknown,
  subscription: {
    id?: unknown;
    customer?: unknown;
    status?: unknown;
    metadata?: { organizationId?: unknown } | null;
  } | undefined,
): StripeSubscriptionEvent | null {
  if (typeof eventType !== "string" || !subscriptionEventTypes.has(eventType)) return null;
  const customerId = stripeId(subscription?.customer);
  const subscriptionId = stripeId(subscription?.id);
  if (!customerId || !subscriptionId) {
    throw new Error("Stripe subscription event is missing customer or subscription identity");
  }
  const organizationId =
    typeof subscription?.metadata?.organizationId === "string"
      ? subscription.metadata.organizationId.trim()
      : undefined;
  if (organizationId && !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(organizationId)) {
    throw new Error("Stripe subscription event has an invalid organizationId");
  }
  return {
    eventType: eventType as StripeSubscriptionEvent["eventType"],
    organizationId: organizationId || undefined,
    customerId,
    subscriptionId,
    status: subscriptionStatus(eventType, subscription?.status),
  };
}

export function parseStripeSubscriptionEvent(payload: Buffer): StripeSubscriptionEvent | null {
  const event = JSON.parse(payload.toString("utf8")) as {
    type?: unknown;
    data?: {
      object?: {
        id?: unknown;
        customer?: unknown;
        status?: unknown;
        metadata?: { organizationId?: unknown };
      };
    };
  };
  return normalizeStripeSubscriptionEvent(event.type, event.data?.object);
}

export function resolveStripeSubscriptionOrganization(
  subscription: StripeSubscriptionEvent,
  candidates: StripeLinkedOrganization[],
) {
  const organization = subscription.organizationId
    ? candidates.find((candidate) => candidate.id === subscription.organizationId)
    : candidates.find((candidate) => candidate.stripeSubscriptionId === subscription.subscriptionId)
      ?? candidates.find((candidate) => candidate.stripeCustomerId === subscription.customerId);
  if (!organization) return { action: "ignore" as const, reason: "unlinked" as const };
  const conflictingOrganization = candidates.find(
    (candidate) =>
      candidate.id !== organization.id
      && (
        candidate.stripeCustomerId === subscription.customerId
        || candidate.stripeSubscriptionId === subscription.subscriptionId
      ),
  );
  if (conflictingOrganization) {
    throw new Error("Stripe identity is already linked to a different organization");
  }
  if (
    organization.stripeCustomerId
    && organization.stripeCustomerId !== subscription.customerId
  ) {
    throw new Error("Stripe customer does not match the linked organization");
  }
  if (
    organization.stripeSubscriptionId
    && organization.stripeSubscriptionId !== subscription.subscriptionId
  ) {
    if (subscription.eventType === "customer.subscription.deleted") {
      return { action: "ignore" as const, reason: "stale-deletion" as const, organization };
    }
    throw new Error("Stripe subscription does not match the linked organization");
  }
  return { action: "apply" as const, organization };
}

export function stripeWebhookBaseUrl(env: NodeJS.ProcessEnv) {
  const configured = env.STRIPE_WEBHOOK_BASE_URL?.trim();
  const rawUrl = configured;
  if (!rawUrl) {
    throw new Error(
      "STRIPE_WEBHOOK_BASE_URL is required to configure a webhook origin",
    );
  }
  const url = new URL(rawUrl);
  if (url.protocol !== "https:") {
    throw new Error("Stripe webhook base URL must use HTTPS");
  }
  if (
    url.username
    || url.password
    || url.pathname !== "/"
    || url.search
    || url.hash
  ) {
    throw new Error("Stripe webhook base URL must be an origin without credentials, path, query, or fragment");
  }
  return url.origin;
}
