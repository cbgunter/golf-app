import { GetParameterCommand, SSMClient } from '@aws-sdk/client-ssm';
import { GhinClient } from '@spicygolf/ghin';

const ssmClient = new SSMClient({ region: process.env.AWS_REGION ?? 'us-east-1' });

let client: GhinClient | null = null;

async function getSSMParam(name: string): Promise<string> {
  const res = await ssmClient.send(new GetParameterCommand({ Name: name, WithDecryption: true }));
  return res.Parameter?.Value ?? '';
}

// Module-level singleton so a warm Lambda reuses one GHIN session. Reset to null on
// failure so the next call re-authenticates (same pattern as the-turn).
export async function getGhinClient(): Promise<GhinClient> {
  if (client) return client;
  const [username, password] = await Promise.all([
    getSSMParam(process.env.GHIN_USERNAME_PARAM!),
    getSSMParam(process.env.GHIN_PASSWORD_PARAM!),
  ]);
  client = new GhinClient({ username, password });
  return client;
}

/**
 * @spicygolf/ghin >= 0.12 returns neverthrow `Result`s instead of throwing.
 * Unwrap to the value, or throw the GhinError so callers can keep using try/catch.
 */
export async function unwrap<T>(p: Promise<{ isErr(): boolean; value?: T; error?: Error } | any>): Promise<T> {
  const r = await p;
  if (r.isErr()) throw r.error;
  return r.value as T;
}

export function resetGhinClient(): void {
  client = null;
}
