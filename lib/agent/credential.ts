import { createHmac, timingSafeEqual } from "node:crypto";

type AgentClaims = {
  analysisId: string;
  organizationId: string;
  expiresAt: number;
};

const encoder = new TextEncoder();

export function mintAgentCredential(analysisId: string, organizationId: string): string {
  const claims: AgentClaims = {
    analysisId,
    organizationId,
    expiresAt: Math.floor(Date.now() / 1000) + 10 * 60,
  };
  const payload = encode(JSON.stringify(claims));
  return `${payload}.${signature(payload)}`;
}

export function verifyAgentCredential(value: string): AgentClaims {
  const [payload, provided] = value.split(".");
  if (!payload || !provided) throw new Error("Invalid agent credential");
  const expected = signature(payload);
  const left = Buffer.from(provided);
  const right = Buffer.from(expected);
  if (left.length !== right.length || !timingSafeEqual(left, right)) throw new Error("Invalid agent credential signature");
  const claims: unknown = JSON.parse(new TextDecoder().decode(Buffer.from(payload, "base64url")));
  if (!isClaims(claims) || claims.expiresAt < Math.floor(Date.now() / 1000)) throw new Error("Expired agent credential");
  return claims;
}

function signature(payload: string): string {
  const secret = process.env.AGENT_SHARED_SECRET?.trim();
  if (!secret) throw new Error("AGENT_SHARED_SECRET isn't configured");
  return createHmac("sha256", secret).update(encoder.encode(payload)).digest("base64url");
}

function encode(value: string): string {
  return Buffer.from(value).toString("base64url");
}

function isClaims(value: unknown): value is AgentClaims {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof Reflect.get(value, "analysisId") === "string" &&
    typeof Reflect.get(value, "organizationId") === "string" &&
    typeof Reflect.get(value, "expiresAt") === "number"
  );
}
