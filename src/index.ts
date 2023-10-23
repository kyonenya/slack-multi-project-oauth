import { Hono } from 'hono';
import { drizzle } from 'drizzle-orm/d1';
import { eq } from 'drizzle-orm';
import { projects } from './schema';
// 型定義のみ使用
import type {
  SlackAPIResponse,
  OAuthV2AccessResponse,
} from 'slack-cloudflare-workers';

const baseUrl = 'https://participating-trial-handled-parker.trycloudflare.com';

export type Env = {
  DB: D1Database;
  SLACK_CLIENT_ID: string;
  SLACK_CLIENT_SECRET: string;
};

const app = new Hono<{ Bindings: Env }>();

app.get('/', async (c) => {
  return c.html(
    `<html><body><h1>Hello from Hono!</h1><form></form></html></body>`,
  );
});

app.post('/slack/events', async (c) => {
  const db = drizzle(c.env.DB);
  const body = await c.req.json();
  const { event, team_id } = body;

  // Verify URL
  if ('challenge' in body) {
    return c.json({ challenge: body.challenge });
  }

  console.log(event.channel);
  console.log(team_id);

  if (event && event.type === 'app_mention') {
    // DBからリクエスト元ワークスペース用のOAuthトークンとプロジェクトIDを取り出す
    const { slackBotToken, hfProjectId } = (
      await db.select().from(projects).where(eq(projects.teamId, team_id))
    )[0];

    const text = `あなたのプロジェクトIDは ${hfProjectId} です。また、あなたのSlackチームIDは ${team_id} です。`;

    // メッセージを送信
    const response = await fetch('https://slack.com/api/chat.postMessage', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${slackBotToken}`,
      },
      body: JSON.stringify({
        channel: event.channel,
        text,
      }),
    });

    const data: SlackAPIResponse = await response.json();

    if (!data.ok) {
      console.error(`Failed to send message: ${data.error}`);
    }
  }

  return c.json({ ok: true });
});

app.get('/slack/oauth_redirect', async (c) => {
  const db = drizzle(c.env.DB);
  const { code, state } = c.req.query();

  console.log(`State is: ${state}`);
  console.log(`Code is: ${code}`);

  if (!code) return c.json({ message: 'No code provided' });

  const params = new URLSearchParams();
  params.append('client_id', c.env.SLACK_CLIENT_ID ?? '');
  params.append('client_secret', c.env.SLACK_CLIENT_SECRET ?? '');
  params.append('code', code);
  params.append('redirect_uri', `${baseUrl}/slack/oauth_redirect`);

  try {
    const response = await fetch('https://slack.com/api/oauth.v2.access', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params,
    });

    const data: OAuthV2AccessResponse = await response.json();
    console.log(data);

    if (data.ok) {
      console.log(`Access token: ${data.access_token}`);
      // DBにOAuthトークンとプロジェクトIDをチームIDと紐づけて保存
      await db.insert(projects).values({
        teamId: data.team?.id,
        slackBotToken: data.access_token,
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
