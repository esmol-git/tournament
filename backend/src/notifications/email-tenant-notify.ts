import nodemailer from 'nodemailer';

type EmailTransportConfig = {
  host: string;
  port: number;
  secure: boolean;
  user?: string;
  pass?: string;
};

export async function sendEmailTenantNotification(params: {
  transport: EmailTransportConfig;
  from: string;
  to: string[];
  subject: string;
  text: string;
}): Promise<void> {
  const transporter = nodemailer.createTransport({
    host: params.transport.host,
    port: params.transport.port,
    secure: params.transport.secure,
    auth:
      params.transport.user && params.transport.pass
        ? { user: params.transport.user, pass: params.transport.pass }
        : undefined,
  });

  await transporter.sendMail({
    from: params.from,
    to: params.to.join(', '),
    subject: params.subject,
    text: params.text,
  });
}
