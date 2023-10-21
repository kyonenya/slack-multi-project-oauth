import { Hono } from 'hono';

const app = new Hono();

app.get('/', async (c) => {
  return c.json({ message: 'Hello from Hono!' });
});

app.post('/slack/events', async (c) => {
  const body = await c.req.json();
  const { event, team_id } = body;

  // Verify URL
  if ('challenge' in body) {
    return c.json({ challenge: body.challenge });
  }

  if (event && event.type === 'app_mention') {
    // TODO: このワークスペース用のOAuthトークンを取得（仮のデータベースから）
    const oauthToken = c.env?.SLACK_BOT_TOKEN;

    const text = `Your team ID is ${team_id}`;

    // メッセージを送信
    const response = await fetch('https://slack.com/api/chat.postMessage', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${oauthToken}`,
      },
      body: JSON.stringify({
        channel: event.channel,
        text,
      }),
    });

    const data: any = await response.json();

    if (!data.ok) {
      console.error(`Failed to send message: ${data.error}`);
    }
  }

  return c.json({ ok: true });
});

export default app;
