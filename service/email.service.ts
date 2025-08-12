import { resolvedConfig } from '../utils.server'
import * as nodemailer from 'nodemailer'
import sgMail from '@sendgrid/mail'
import { statService } from './stat.service'

export class EmailService {
  isSMTPEnable() {
    return (
      resolvedConfig.smtp.auth.user !== undefined &&
      resolvedConfig.smtp.auth.pass !== undefined &&
      resolvedConfig.smtp.host !== undefined &&
      resolvedConfig.smtp.senderAddress !== undefined
    )
  }

  isThirdpartyEnable() {
    return resolvedConfig.sendgrid.apiKey
  }

  get sender() {
    return resolvedConfig.smtp.senderAddress
  }

  async send(msg: { to: string; from: string; subject: string; html: string }) {
    console.log('[EmailService] Starting to send email', {
      to: msg.to,
      from: msg.from,
      subject: msg.subject,
    });
    if (this.isSMTPEnable()) {
      console.log('[EmailService] Using SMTP with sender', this.sender);
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
    } else if (this.isThirdpartyEnable()) {
      console.log('[EmailService] Using SendGrid with sender', this.sender);
      try {
        sgMail.setApiKey(resolvedConfig.sendgrid.apiKey);
        await sgMail.send(msg);
        console.log('[EmailService] SendGrid email sent successfully');
        statService.capture('notification_email');
      } catch (error) {
        console.error('[EmailService] SendGrid send error:', error);
        throw error;
      }
    } else {
      console.warn('[EmailService] No email transport configured (SMTP/SendGrid disabled)');
    }
  }
}
