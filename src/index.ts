import { Hono } from 'hono';
import type { SlackOAuthAndOIDCEnv } from 'slack-cloudflare-workers';

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

  console.log(event.channel);
  console.log(team_id);

  if (event && event.type === 'app_mention') {
    // このワークスペース用のOAuthトークンを取得
    // TODO: データベースに保存して出し分ける
    const oauthToken = c.env?.SLACK_BOT_TOKEN;
    // const oauthToken = c.env?.SLACK_BOT_TOKEN_TWO;

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

app.get('/slack/oauth_redirect', async (c) => {
  const { code, state } = c.req.query();
  const env = c.env as unknown as SlackOAuthAndOIDCEnv;

  console.log(`State is: ${state}`);
  console.log(`Code is: ${code}`);

  if (!code) return c.json({ message: 'No code provided' });

  const params = new URLSearchParams();
  params.append('client_id', env.SLACK_CLIENT_ID ?? '');
  params.append('client_secret', env.SLACK_CLIENT_SECRET ?? '');
  params.append('code', code);
  params.append(
    'redirect_uri',
    'https://comments-brown-beyond-trademarks.trycloudflare.com/slack/oauth_redirect',
  );

  try {
    const response = await fetch('https://slack.com/api/oauth.v2.access', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params,
    });

    const data: any = await response.json();
    console.log(data);

    if (data.ok) {
      console.log(`Access token: ${data.access_token}`);
    } else {
      console.error(`Error: ${data.error}`);
    }
  } catch (error) {
    console.error(`Fetch failed: ${error}`);
  }

  return c.json({ ok: true });
});

export default app;
