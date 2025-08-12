import { resolvedConfig } from '../utils.server'
import * as nodemailer from 'nodemailer'
import sgMail from '@sendgrid/mail'
import { Resend } from 'resend'
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

  isResendEnabled() {
    return Boolean(resolvedConfig.resend?.apiKey || process.env.RESEND_API_KEY)
  }

  get sender() {
    // Prefer explicitly configured Resend "from", otherwise fall back to SMTP sender
    return (
      (resolvedConfig as any).resend?.from ||
      resolvedConfig.smtp.senderAddress
    )
  }

  async send(msg: { to: string | string[]; from?: string; subject: string; html: string }) {
    // Normalize defaults
    if (!msg.from) {
      msg.from = this.sender
    }
    const toList = Array.isArray(msg.to) ? msg.to : [msg.to]

    console.log('[EmailService] Starting to send email', {
      to: toList,
      from: msg.from,
      subject: msg.subject,
    });

    // Prefer Resend API if configured
    if (this.isResendEnabled()) {
      try {
        const apiKey = (resolvedConfig as any).resend?.apiKey || process.env.RESEND_API_KEY
        const resend = new Resend(apiKey as string)
        console.log('[EmailService] Using Resend API with sender', msg.from)
        const { data, error } = await resend.emails.send({
          from: msg.from as string,
          to: toList as string[],
          subject: msg.subject,
          html: msg.html,
        })
        if (error) {
          console.error('[EmailService] Resend send error:', error)
          throw error
        }
        console.log('[EmailService] Resend email sent successfully', { id: (data as any)?.id })
        statService.capture('notification_email')
        return data
      } catch (error) {
        console.error('[EmailService] Resend send exception:', error)
        throw error
      }
    } else if (this.isSMTPEnable()) {
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
      const info = await transporter.sendMail({
        ...msg,
        to: toList,
        from: msg.from,
      });
      console.log('[EmailService] SMTP email sent successfully', { messageId: (info as any)?.messageId, response: (info as any)?.response });
    } else if (this.isThirdpartyEnable()) {
      console.log('[EmailService] Using SendGrid with sender', this.sender);
      try {
        sgMail.setApiKey(resolvedConfig.sendgrid.apiKey);
        await sgMail.send({
          ...msg,
          to: toList,
          from: msg.from,
        } as any);
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
