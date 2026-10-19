import type { AuthConfig } from './auth.service.js';
import {
  CaptureOtpDelivery,
  SmtpOtpDelivery,
  UnavailableOtpDelivery,
  type OtpDeliveryPort,
} from './otp-delivery.js';
export function required(env: NodeJS.ProcessEnv, key: string) {
  const value = env[key];
  if (!value) throw Error(`${key}_REQUIRED`);
  return value;
}
export function runtimeConfig(env: NodeJS.ProcessEnv): {
  auth: AuthConfig;
  delivery: OtpDeliveryPort;
  workerEnabled: boolean;
} {
  const production = env.NODE_ENV === 'production';
  const auth: AuthConfig = {
    jwtSecret: required(env, 'R4_JWT_SECRET'),
    otpPepper: required(env, 'R4_OTP_PEPPER'),
    issuer: required(env, 'R4_JWT_ISSUER'),
    audience: required(env, 'R4_JWT_AUDIENCE'),
    production,
    origins: required(env, 'R4_WEB_ORIGINS')
      .split(',')
      .map((s) => s.trim()),
  };
  const mode = required(env, 'R4_OTP_MODE');
  let delivery: OtpDeliveryPort;
  if (mode === 'smtp')
    delivery = new SmtpOtpDelivery({
      host: required(env, 'R4_SMTP_HOST'),
      port: Number(required(env, 'R4_SMTP_PORT')),
      user: required(env, 'R4_SMTP_USER'),
      password: required(env, 'R4_SMTP_PASSWORD'),
      from: required(env, 'R4_SMTP_FROM'),
    });
  else if (mode === 'capture' && !production)
    delivery = new CaptureOtpDelivery();
  else if (mode === 'unavailable') delivery = new UnavailableOtpDelivery();
  else throw Error('INVALID_OTP_MODE');
  const workerEnabled = env.R4_WORKER_ENABLED === '1';
  if (workerEnabled) required(env, 'R4_WORKER_URL');
  return { auth, delivery, workerEnabled };
}
