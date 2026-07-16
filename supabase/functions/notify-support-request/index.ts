type SupportRequestRecord = {
  id: string;
  user_id: string | null;
  email: string;
  request_type: 'contact' | 'account_deletion';
  subject: string;
  message: string;
  status: string;
  metadata: Record<string, unknown> | null;
  created_at: string;
};

type DatabaseWebhookPayload = {
  type: 'INSERT' | 'UPDATE' | 'DELETE';
  table: string;
  schema: string;
  record: SupportRequestRecord | null;
  old_record: SupportRequestRecord | null;
};

const categoryLabels: Record<string, string> = {
  bug: '不具合',
  howto: '使い方',
  request: 'リクエスト',
  account: 'アカウント・データ',
  other: 'その他',
};

const categoryReplyText: Record<string, string> = {
  bug: '状況を確認し、再現に必要な情報があれば登録メールアドレスへ連絡します。',
  howto: '内容を確認し、使い方の案内が必要な場合は登録メールアドレスへ返信します。',
  request: '今後の改善候補として確認します。詳しく聞きたい場合は登録メールアドレスへ連絡します。',
  account: '本人確認や追加確認が必要な場合は、登録メールアドレスへ連絡します。',
  other: '内容を確認し、必要に応じて登録メールアドレスへ返信します。',
};

Deno.serve(async (request) => {
  if (request.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405);
  }

  const webhookSecret = getRequiredEnv('SUPPORT_WEBHOOK_SECRET');
  if (request.headers.get('x-guttore-webhook-secret') !== webhookSecret) {
    return jsonResponse({ error: 'Unauthorized' }, 401);
  }

  const payload = (await request.json()) as DatabaseWebhookPayload;
  if (
    payload.type !== 'INSERT' ||
    payload.schema !== 'public' ||
    payload.table !== 'support_requests' ||
    !payload.record
  ) {
    return jsonResponse({ skipped: true });
  }

  const record = payload.record;
  const category = getCategory(record);

  await Promise.all([
    sendOperatorNotification(record, category),
    sendUserReceipt(record, category),
  ]);

  return jsonResponse({
    ok: true,
    request_no: getRequestNo(record.id),
    category,
  });
});

async function sendOperatorNotification(record: SupportRequestRecord, category: string) {
  const appName = Deno.env.get('SUPPORT_APP_NAME') || 'グッとれ';
  const dashboardUrl = Deno.env.get('SUPPORT_DASHBOARD_URL') || '';
  const requestNo = getRequestNo(record.id);
  const messagePreview = truncate(record.message, 500);
  const categoryLabel = categoryLabels[category] ?? categoryLabels.other;
  const requestTypeLabel =
    record.request_type === 'account_deletion' ? 'アカウント削除依頼' : 'お問い合わせ';

  const text = [
    `新しい${requestTypeLabel}が届きました。`,
    '',
    `受付番号: ${requestNo}`,
    `種類: ${categoryLabel}`,
    `件名: ${record.subject}`,
    `登録メール: ${record.email}`,
    `作成日時: ${record.created_at}`,
    '',
    '本文冒頭:',
    messagePreview,
    '',
    dashboardUrl ? `Supabaseで詳細を確認: ${dashboardUrl}` : 'Supabaseの support_requests で詳細を確認してください。',
  ].join('\n');

  const html = `
    <h2>新しい${escapeHtml(requestTypeLabel)}が届きました</h2>
    <table>
      <tr><th align="left">受付番号</th><td>${escapeHtml(requestNo)}</td></tr>
      <tr><th align="left">種類</th><td>${escapeHtml(categoryLabel)}</td></tr>
      <tr><th align="left">件名</th><td>${escapeHtml(record.subject)}</td></tr>
      <tr><th align="left">登録メール</th><td>${escapeHtml(record.email)}</td></tr>
      <tr><th align="left">作成日時</th><td>${escapeHtml(record.created_at)}</td></tr>
    </table>
    <h3>本文冒頭</h3>
    <p style="white-space: pre-wrap;">${escapeHtml(messagePreview)}</p>
    <p>${
      dashboardUrl
        ? `<a href="${escapeHtml(dashboardUrl)}">Supabaseで詳細を確認</a>`
        : 'Supabaseの support_requests で詳細を確認してください。'
    }</p>
  `;

  await sendEmail({
    to: getOperatorRecipients(),
    subject: `【${appName}】新しい${requestTypeLabel}: ${categoryLabel} / ${requestNo}`,
    text,
    html,
  });
}

async function sendUserReceipt(record: SupportRequestRecord, category: string) {
  const appName = Deno.env.get('SUPPORT_APP_NAME') || 'グッとれ';
  const requestNo = getRequestNo(record.id);
  const categoryLabel = categoryLabels[category] ?? categoryLabels.other;
  const replyText = categoryReplyText[category] ?? categoryReplyText.other;
  const requestTypeLabel =
    record.request_type === 'account_deletion' ? 'アカウント削除依頼' : 'お問い合わせ';

  const text = [
    `${appName}サポートです。`,
    '',
    `${requestTypeLabel}を受け付けました。`,
    '',
    `受付番号: ${requestNo}`,
    `種類: ${categoryLabel}`,
    `件名: ${record.subject}`,
    '',
    replyText,
    '',
    'このメールに覚えがない場合は、このメールに返信せず、アプリ内のお問い合わせからご連絡ください。',
  ].join('\n');

  const html = `
    <p>${escapeHtml(appName)}サポートです。</p>
    <p>${escapeHtml(requestTypeLabel)}を受け付けました。</p>
    <table>
      <tr><th align="left">受付番号</th><td>${escapeHtml(requestNo)}</td></tr>
      <tr><th align="left">種類</th><td>${escapeHtml(categoryLabel)}</td></tr>
      <tr><th align="left">件名</th><td>${escapeHtml(record.subject)}</td></tr>
    </table>
    <p>${escapeHtml(replyText)}</p>
    <p>このメールに覚えがない場合は、このメールに返信せず、アプリ内のお問い合わせからご連絡ください。</p>
  `;

  await sendEmail({
    to: [record.email],
    subject: `【${appName}】${requestTypeLabel}を受け付けました（${requestNo}）`,
    text,
    html,
  });
}

async function sendEmail({
  to,
  subject,
  text,
  html,
}: {
  to: string[];
  subject: string;
  text: string;
  html: string;
}) {
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${getRequiredEnv('RESEND_API_KEY')}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: getRequiredEnv('SUPPORT_NOTIFY_FROM'),
      to,
      subject,
      text,
      html,
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Resend email failed: ${response.status} ${body}`);
  }
}

function getCategory(record: SupportRequestRecord) {
  if (record.request_type === 'account_deletion') return 'account';
  const category = String(record.metadata?.category ?? 'other');
  return category in categoryLabels ? category : 'other';
}

function getRequestNo(id: string) {
  return id.slice(0, 8);
}

function truncate(value: string, maxLength: number) {
  if (value.length <= maxLength) return value;
  return `${value.slice(0, maxLength)}...`;
}

function getRequiredEnv(name: string) {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`${name} is not configured`);
  return value;
}

function getOperatorRecipients() {
  const recipients = getRequiredEnv('SUPPORT_NOTIFY_TO')
    .split(',')
    .map((address) => address.trim())
    .filter(Boolean);

  if (!recipients.length) {
    throw new Error('SUPPORT_NOTIFY_TO has no recipients');
  }

  return recipients;
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
    },
  });
}

function escapeHtml(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}
