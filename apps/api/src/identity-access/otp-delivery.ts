import nodemailer, { type Transporter } from 'nodemailer';

export interface OtpDeliveryPort {
  deliver(
    email: string,
    otp: string,
    purpose: 'ACTIVATION' | 'PASSWORD_RESET',
  ): Promise<void>;
}
/** Injectable capture, never enabled through a production env flag. */
export class CaptureOtpDelivery implements OtpDeliveryPort {
  readonly messages: { email: string; otp: string; purpose: string }[] = [];
  constructor() {
    if (process.env.NODE_ENV === 'production')
      throw Error('TEST_OTP_ADAPTER_FORBIDDEN');
  }
  async deliver(email: string, otp: string, purpose: string) {
    this.messages.push({ email, otp, purpose });
  }
}
/** Only the configured OTP transport is called. Provider-specific SMTP wiring
 * must be supplied at the trusted composition root and verified separately. */
export class SmtpOtpDelivery implements OtpDeliveryPort {
  private readonly transport: Transporter;
  constructor(options: {
    host: string;
    port: number;
    user: string;
    password: string;
    from: string;
  }) {
    if (
      !options.host ||
      ![465, 587].includes(options.port) ||
      !options.user ||
      !options.password ||
      !/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(options.from)
    )
      throw Error('SMTP_CONFIG_REQUIRED');
    this.from = options.from;
    this.transport = nodemailer.createTransport({
      host: options.host,
      port: options.port,
      secure: options.port === 465,
      requireTLS: true,
      auth: { user: options.user, pass: options.password },
      tls: { minVersion: 'TLSv1.2', rejectUnauthorized: true },
      logger: false,
      debug: false,
      disableFileAccess: true,
      disableUrlAccess: true,
      connectionTimeout: 10_000,
      greetingTimeout: 10_000,
      socketTimeout: 15_000,
    });
  }
  private readonly from: string;
  async deliver(email: string, otp: string, purpose: string) {
    if (
      !/^\d{6}$/.test(otp) ||
      !['ACTIVATION', 'PASSWORD_RESET'].includes(purpose)
    )
      throw Error('INVALID_OTP_DELIVERY');
    await this.transport.sendMail({
      from: { address: this.from, name: 'EduCore' },
      to: { address: email, name: '' },
      subject: 'EduCore verification code',
      text: `Your ${purpose === 'ACTIVATION' ? 'activation' : 'password reset'} code is ${otp}. It expires in 15 minutes.`,
      disableFileAccess: true,
      disableUrlAccess: true,
    });
  }
}
export class UnavailableOtpDelivery implements OtpDeliveryPort {
  async deliver(): Promise<void> {
    throw Error('OTP_DELIVERY_NOT_CONFIGURED');
  }
}
