function escapeTelegramHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

export async function sendTelegramTenantNotification(params: {
  botToken: string;
  chatId: string;
  lines: string[];
}): Promise<void> {
  const text = params.lines.map((line) => escapeTelegramHtml(line)).join('\n');
  const url = `https://api.telegram.org/bot${params.botToken}/sendMessage`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: params.chatId,
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
