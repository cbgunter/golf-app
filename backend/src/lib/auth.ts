import { SSMClient, GetParameterCommand } from '@aws-sdk/client-ssm';
import jwt from 'jsonwebtoken';

const ssm = new SSMClient({ region: process.env.AWS_REGION ?? 'us-east-1' });

let cachedSecret: string | null = null;
let cachedPassword: string | null = null;

async function getParam(name: string): Promise<string> {
  const result = await ssm.send(new GetParameterCommand({ Name: name, WithDecryption: true }));
  return result.Parameter?.Value ?? '';
}

export async function getJwtSecret(): Promise<string> {
  if (!cachedSecret) {
    cachedSecret = await getParam(process.env.JWT_SECRET_PARAM!);
  }
  return cachedSecret;
}

export async function getAdminPassword(): Promise<string> {
  if (!cachedPassword) {
    cachedPassword = await getParam(process.env.ADMIN_PASSWORD_PARAM!);
  }
  return cachedPassword;
}

export async function verifyAdminLogin(password: string): Promise<string | null> {
  const correctPassword = await getAdminPassword();
  if (password !== correctPassword) return null;

  const secret = await getJwtSecret();
  return jwt.sign({ role: 'admin' }, secret, { expiresIn: '12h' });
}

export async function verifyToken(authHeader: string | undefined): Promise<boolean> {
  if (!authHeader?.startsWith('Bearer ')) return false;
  const token = authHeader.slice(7);
  try {
    const secret = await getJwtSecret();
    jwt.verify(token, secret);
    return true;
  } catch {
    return false;
  }
}
