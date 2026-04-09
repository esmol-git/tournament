/**
 * Опциональные уведомления в Telegram при новой заявке с лендинга.
 * Нужны TELEGRAM_BOT_TOKEN и TELEGRAM_DEMO_LEADS_CHAT_ID в .env
 */
function escapeTelegramHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

export async function sendDemoLeadTelegramNotification(params: {
  botToken: string;
  chatId: string;
  name: string;
  contact: string;
  league: string;
  message: string;
  source: string;
  id: string;
  ip: string | null;
}): Promise<void> {
  const { botToken, chatId, name, contact, league, message, source, id, ip } =
    params;

  const text = [
    '<b>Новая заявка с лендинга</b>',
    '',
    `<b>Имя:</b> ${escapeTelegramHtml(name)}`,
    `<b>Контакт:</b> ${escapeTelegramHtml(contact)}`,
    `<b>Лига:</b> ${escapeTelegramHtml(league)}`,
    `<b>Сообщение:</b> ${escapeTelegramHtml(message)}`,
    '',
    `<i>id: ${escapeTelegramHtml(id)} · source: ${escapeTelegramHtml(source)} · ip: ${escapeTelegramHtml(ip ?? '—')}</i>`,
  ].join('\n');

  const url = `https://api.telegram.org/bot${botToken}/sendMessage`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      parse_mode: 'HTML',
      disable_web_page_preview: true,
    }),
  });

  if (!res.ok) {
    const errBody = await res.text().catch(() => '');
    throw new Error(`Telegram API ${res.status}: ${errBody.slice(0, 500)}`);
  }
}
