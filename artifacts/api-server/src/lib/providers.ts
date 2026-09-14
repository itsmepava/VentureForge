import { and, desc, eq } from "drizzle-orm";
import { db, providerConnections } from "@workspace/db";
import { DEMO_ORGANIZATION_ID, ensureDemoData } from "./demo-data";
import { decryptVaultValues, encryptVaultValues } from "./vault";

export const PROVIDERS = {
  github: {
    displayName: "GitHub",
    category: "activity" as const,
    detail: "Commit velocity and public builder signals",
  },
  stripe: {
    displayName: "Stripe",
    category: "billing" as const,
    detail: "Subscriptions, invoices, and customer portal",
  },
  notion: {
    displayName: "Notion",
    category: "delivery" as const,
    detail: "Push company briefs into your team workspace",
  },
  google_sheets: {
    displayName: "Google Sheets",
    category: "delivery" as const,
    detail: "Append enriched companies to your sourcing model",
  },
  slack: {
    displayName: "Slack",
    category: "delivery" as const,
    detail: "Route high-signal alerts to a private channel",
  },
} as const;

export type ProviderName = keyof typeof PROVIDERS;

export function isProviderName(value: string): value is ProviderName {
  return value in PROVIDERS;
}

export async function listProviderConnections() {
  await ensureDemoData();
  const rows = await db
    .select()
    .from(providerConnections)
    .where(eq(providerConnections.organizationId, DEMO_ORGANIZATION_ID))
    .orderBy(desc(providerConnections.updatedAt));

  const latest = new Map(rows.map((row) => [row.provider, row]));
  return Object.entries(PROVIDERS).map(([provider, metadata]) => {
    const connection = latest.get(provider);
    return {
      provider,
      ...metadata,
      status: connection
        ? connection.status === "needs_reauthorization"
          ? "needs_reauthorization"
          : "vault_configured"
        : "not_connected",
      detail: connection
        ? `${metadata.detail} · ${connection.label}`
        : metadata.detail,
      lastVerifiedAt: connection?.lastVerifiedAt?.toISOString() ?? null,
    };
  });
}

export async function getProviderConnection(provider: ProviderName) {
  await ensureDemoData();
  const [connection] = await db
    .select()
    .from(providerConnections)
    .where(
      and(
        eq(providerConnections.organizationId, DEMO_ORGANIZATION_ID),
        eq(providerConnections.provider, provider),
      ),
    )
    .orderBy(desc(providerConnections.updatedAt))
    .limit(1);
  return connection;
}

export async function saveProviderConnection(
  provider: ProviderName,
  label: string,
  values: Record<string, string>,
) {
  await ensureDemoData();
  const encryptedValues = encryptVaultValues(values);
  const existing = await getProviderConnection(provider);
  if (existing) {
    const [updated] = await db
      .update(providerConnections)
      .set({
        label,
        encryptedValues,
        status: "active",
        updatedAt: new Date(),
      })
      .where(eq(providerConnections.id, existing.id))
      .returning();
    return updated;
  }
  const [created] = await db
    .insert(providerConnections)
    .values({
      organizationId: DEMO_ORGANIZATION_ID,
      provider,
      label,
      encryptedValues,
    })
    .returning();
  return created;
}

export async function deleteProviderConnection(provider: ProviderName) {
  await ensureDemoData();
  return db
    .delete(providerConnections)
    .where(
      and(
        eq(providerConnections.organizationId, DEMO_ORGANIZATION_ID),
        eq(providerConnections.provider, provider),
      ),
    )
    .returning({ id: providerConnections.id });
}

export async function readProviderValues(provider: ProviderName) {
  const connection = await getProviderConnection(provider);
  if (!connection) return null;
  return {
    connection,
    values: decryptVaultValues(connection.encryptedValues),
  };
}

export async function markProviderVerified(
  provider: ProviderName,
  verified: boolean,
) {
  const connection = await getProviderConnection(provider);
  if (!connection) return null;
  const [updated] = await db
    .update(providerConnections)
    .set({
      status: verified ? "active" : "needs_reauthorization",
      lastVerifiedAt: verified ? new Date() : connection.lastVerifiedAt,
      updatedAt: new Date(),
    })
    .where(eq(providerConnections.id, connection.id))
    .returning();
  return updated;
}

export async function testProviderDelivery(provider: ProviderName, message: string) {
  const configured = await readProviderValues(provider);
  if (!configured) return { delivered: false, message: "Provider is not configured" };
  const { values } = configured;

  try {
    if (provider === "slack" && values.token && values.channelId) {
      const response = await fetch("https://slack.com/api/chat.postMessage", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${values.token}`,
          "Content-Type": "application/json; charset=utf-8",
        },
        body: JSON.stringify({ channel: values.channelId, text: message }),
        signal: AbortSignal.timeout(10_000),
      });
      const result = (await response.json()) as { ok?: boolean };
      return {
        delivered: response.ok && result.ok === true,
        message: response.ok && result.ok === true ? "Test alert sent to Slack" : "Slack rejected the test alert",
      };
    }

    if (provider === "google_sheets" && values.accessToken && values.spreadsheetId) {
      const range = values.range ?? "Sheet1!A:Z";
      const response = await fetch(
        `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(values.spreadsheetId)}/values/${encodeURIComponent(range)}:append?valueInputOption=USER_ENTERED`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${values.accessToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ values: [[new Date().toISOString(), message]] }),
          signal: AbortSignal.timeout(10_000),
        },
      );
      return {
        delivered: response.ok,
        message: response.ok ? "Test row appended to Google Sheets" : "Google Sheets rejected the test row",
      };
    }

    if (provider === "notion" && values.token && values.databaseId) {
      const response = await fetch("https://api.notion.com/v1/pages", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${values.token}`,
          "Notion-Version": "2022-06-28",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          parent: { database_id: values.databaseId },
          properties: {
            Name: { title: [{ text: { content: "VentureForge test delivery" } }] },
          },
          children: [
            {
              object: "block",
              type: "paragraph",
              paragraph: { rich_text: [{ type: "text", text: { content: message } }] },
            },
          ],
        }),
        signal: AbortSignal.timeout(10_000),
      });
      return {
        delivered: response.ok,
        message: response.ok ? "Test brief sent to Notion" : "Notion rejected the test brief",
      };
    }

    return {
      delivered: false,
      message: "Add the destination token and ID before testing delivery",
    };
  } catch {
    return { delivered: false, message: "The destination could not be reached" };
  }
}