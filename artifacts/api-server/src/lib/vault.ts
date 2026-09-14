import { createRequire } from "node:module";
import { createHash } from "node:crypto";

type FernetToken = {
  encode: (message?: string) => string;
  decode: () => string;
};

type FernetApi = {
  Secret: new (key: string) => unknown;
  Token: new (options: {
    secret: unknown;
    ttl?: number;
    message?: string;
    token?: string;
  }) => FernetToken;
};

const require = createRequire(import.meta.url);
const fernet = require("fernet") as FernetApi;

function getSecret() {
  const key = process.env.FERNET_KEY;
  if (!key) {
    throw new Error("FERNET_KEY is required to use the provider vault");
  }
  // Fernet requires 32 url-safe base64 bytes. Deriving that shape keeps the
  // protected workspace secret usable even when it was provisioned as a
  // regular high-entropy string rather than a Fernet-formatted value.
  const fernetKey = createHash("sha256").update(key).digest().toString("base64url");
  return new fernet.Secret(fernetKey);
}

export function encryptVaultValues(values: Record<string, string>) {
  const token = new fernet.Token({
    secret: getSecret(),
    ttl: 0,
  });
  return token.encode(JSON.stringify(values));
}

export function decryptVaultValues(encryptedValues: string): Record<string, string> {
  const token = new fernet.Token({
    secret: getSecret(),
    token: encryptedValues,
    ttl: 0,
  });
  const values = JSON.parse(token.decode()) as unknown;
  if (!values || typeof values !== "object" || Array.isArray(values)) {
    throw new Error("Encrypted provider values are not an object");
  }
  return Object.fromEntries(
    Object.entries(values).filter(
      ([key, value]) => typeof key === "string" && typeof value === "string",
    ),
  );
}

export function redactVaultValues(values: Record<string, string>) {
  return Object.fromEntries(Object.keys(values).map((key) => [key, "••••••••"]));
}