import nodemailer from "nodemailer";
import { ConfigService } from "./config.service";

export class EmailService {
  private configService = new ConfigService();

  async send(msg: any) {
    const resolvedConfig = await this.configService.resolveConfig();

    if (resolvedConfig.smtp) {
      const transporter = nodemailer.createTransport({
        host: resolvedConfig.smtp.host,
        port: resolvedConfig.smtp.port,
        secure: resolvedConfig.smtp.secure,
        auth: resolvedConfig.smtp.auth,
        logger: true,
        debug: true,
        connectionTimeout: 15000,
        greetingTimeout: 10000,
        socketTimeout: 20000,
      });
      try {
        console.log('[EmailService] Verifying SMTP transport...');
        await transporter.verify();
        console.log('[EmailService] SMTP transport verified OK');
      } catch (verifyErr) {
        console.error('[EmailService] SMTP verify failed:', verifyErr);
        throw verifyErr;
      }
      const info = await transporter.sendMail(msg);
      console.log('[EmailService] SMTP email sent successfully', { messageId: (info as any)?.messageId, response: (info as any)?.response });
    } else if (resolvedConfig.sendgrid) {
      // sendgrid transport logic here
    } else {
      console.warn('[EmailService] No email transport configured (SMTP/SendGrid disabled)');
    }
  }
}
