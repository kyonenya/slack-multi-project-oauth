import { Hono } from 'hono';
import { drizzle } from 'drizzle-orm/d1';
import { projects } from './schema';
import type { SlackOAuthAndOIDCEnv } from 'slack-cloudflare-workers';

const app = new Hono();

export type Env = SlackOAuthAndOIDCEnv & {
  DB: D1Database;
};

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
  const env = c.env as unknown as Env;
  const db = drizzle(env.DB);

  console.log(`State is: ${state}`);
  console.log(`Code is: ${code}`);

  if (!code) return c.json({ message: 'No code provided' });

  const params = new URLSearchParams();
  params.append('client_id', env.SLACK_CLIENT_ID ?? '');
  params.append('client_secret', env.SLACK_CLIENT_SECRET ?? '');
  params.append('code', code);
  params.append(
    'redirect_uri',
    'https://relax-obligations-province-charles.trycloudflare.com/slack/oauth_redirect',
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
      await db.insert(projects).values({
        slackBotToken: data.access_token,
        teamId: data.team.id,
        hfProjectId: state,
      });
    } else {
      console.error(`Error: ${data.error}`);
    }
  } catch (error) {
    console.error(`Fetch failed: ${error}`);
  }

  // await db.delete(projects);

  const result = await db.select().from(projects).all();

  return c.json({ result });
});

export default app;
