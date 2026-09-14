import { Router, type IRouter } from "express";
import {
  DisconnectIntegrationParams,
  TestIntegrationDeliveryBody,
  TestIntegrationDeliveryResponse,
  ListIntegrationsResponse,
  SaveIntegrationVaultBody,
  SaveIntegrationVaultParams,
  SaveIntegrationVaultResponse,
  VerifyIntegrationParams,
  VerifyIntegrationResponse,
} from "@workspace/api-zod";
import { isProviderName, listProviderConnections, readProviderValues, saveProviderConnection, deleteProviderConnection, markProviderVerified, testProviderDelivery, PROVIDERS } from "../lib/providers";

const router: IRouter = Router();

router.get("/integrations", async (_req, res, next) => {
  try {
    return res.json(ListIntegrationsResponse.parse(await listProviderConnections()));
  } catch (error) {
    return next(error);
  }
});

router.post("/integrations/:provider/vault", async (req, res, next) => {
  try {
    const params = SaveIntegrationVaultParams.parse(req.params);
    const body = SaveIntegrationVaultBody.parse(req.body);
    if (!isProviderName(params.provider)) {
      return res.status(400).json({ error: "Unsupported provider" });
    }
    if (!Object.keys(body.values).length) {
      return res.status(400).json({ error: "At least one provider value is required" });
    }
    if (!process.env.FERNET_KEY) {
      return res.status(503).json({ error: "Provider vault encryption is not configured" });
    }
    const connection = await saveProviderConnection(params.provider, body.label, body.values);
    const metadata = PROVIDERS[params.provider];
    return res.status(201).json(
      SaveIntegrationVaultResponse.parse({
        provider: params.provider,
        ...metadata,
        status: "vault_configured",
        detail: `${metadata.detail} · ${connection.label}`,
        lastVerifiedAt: connection.lastVerifiedAt?.toISOString() ?? null,
      }),
    );
  } catch (error) {
    return next(error);
  }
});

router.delete("/integrations/:provider", async (req, res, next) => {
  try {
    const params = DisconnectIntegrationParams.parse(req.params);
    if (!isProviderName(params.provider)) return res.status(400).json({ error: "Unsupported provider" });
    await deleteProviderConnection(params.provider);
    return res.status(204).send();
  } catch (error) {
    return next(error);
  }
});

router.post("/integrations/:provider/verify", async (req, res, next) => {
  try {
    const params = VerifyIntegrationParams.parse(req.params);
    if (!isProviderName(params.provider)) return res.status(400).json({ error: "Unsupported provider" });
    const configured = await readProviderValues(params.provider);
    if (!configured) return res.status(404).json({ error: "Provider is not configured" });
    const { values } = configured;
    let verified = false;
    let message = "Provider values were not recognized";

    if (params.provider === "github" && values.token) {
      const response = await fetch("https://api.github.com/user", {
        headers: { Accept: "application/vnd.github+json", Authorization: `Bearer ${values.token}`, "X-GitHub-Api-Version": "2022-11-28" },
        signal: AbortSignal.timeout(10_000),
      });
      verified = response.ok;
      message = response.ok ? "GitHub token verified" : "GitHub rejected the token";
    } else if (params.provider === "notion" && values.token) {
      const response = await fetch("https://api.notion.com/v1/users/me", {
        headers: { Authorization: `Bearer ${values.token}`, "Notion-Version": "2022-06-28" },
        signal: AbortSignal.timeout(10_000),
      });
      verified = response.ok;
      message = response.ok ? "Notion token verified" : "Notion rejected the token";
    } else if (params.provider === "slack" && values.token) {
      const response = await fetch("https://slack.com/api/auth.test", {
        headers: { Authorization: `Bearer ${values.token}` },
        signal: AbortSignal.timeout(10_000),
      });
      const result = (await response.json()) as { ok?: boolean };
      verified = response.ok && result.ok === true;
      message = verified ? "Slack token verified" : "Slack rejected the token";
    } else if (params.provider === "google_sheets" && values.accessToken) {
      const response = await fetch("https://www.googleapis.com/oauth2/v3/tokeninfo", {
        headers: { Authorization: `Bearer ${values.accessToken}` },
        signal: AbortSignal.timeout(10_000),
      });
      verified = response.ok;
      message = response.ok ? "Google access token verified" : "Google rejected the token";
    } else if (params.provider === "stripe" && values.secretKey) {
      const response = await fetch("https://api.stripe.com/v1/account", {
        headers: { Authorization: `Bearer ${values.secretKey}` },
        signal: AbortSignal.timeout(10_000),
      });
      verified = response.ok;
      message = response.ok ? "Stripe key verified" : "Stripe rejected the key";
    } else {
      message = "Add the provider token or secret key before verifying";
    }

    const updated = await markProviderVerified(params.provider, verified);
    return res.json(
      VerifyIntegrationResponse.parse({
        provider: params.provider,
        verified,
        message,
        lastVerifiedAt: updated?.lastVerifiedAt?.toISOString() ?? null,
      }),
    );
  } catch (error) {
    return next(error);
  }
});

router.post("/integrations/:provider/test-delivery", async (req, res, next) => {
  try {
    const provider = req.params.provider;
    if (!isProviderName(provider)) return res.status(400).json({ error: "Unsupported provider" });
    const body = TestIntegrationDeliveryBody.parse(req.body);
    const result = await testProviderDelivery(provider, body.message);
    return res.json(TestIntegrationDeliveryResponse.parse({ provider, ...result }));
  } catch (error) {
    return next(error);
  }
});

export default router;