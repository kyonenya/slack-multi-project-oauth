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
  try {
    const db = drizzle(c.env.DB);
    const body = await c.req.json();
    const { event, team_id } = body;

    // Verify URL
    if ('challenge' in body) {
      return c.json({ challenge: body.challenge });
    }

    if (event && event.type === 'app_mention') {
      // DBからリクエスト元ワークスペース用のOAuthトークンとプロジェクトIDを取り出す
      const { slackBotToken, projectId } = (
        await db.select().from(projects).where(eq(projects.teamId, team_id))
      )[0];

      const text = `あなたのSlackチームIDは \`${team_id}\` ですね。\nあなたのプロジェクトIDは \`${projectId}\` です。`;

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
  } catch (e) {
    console.error(`Post failed: ${e}`);
  }

  return c.json({ ok: true });
});

app.get('/slack/oauth_redirect', async (c) => {
  const db = drizzle(c.env.DB);
  const { code, state } = c.req.query();

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

    if (!data.ok) {
      console.error(`Error: ${data.error}`);
    }

    // DBにチームIDと紐づけてOAuthトークンとプロジェクトIDを保存
    await db.insert(projects).values({
      teamId: data.team?.id,
      slackBotToken: data.access_token,
      projectId: state,
    });
  } catch (e) {
    console.error(`Fetch failed: ${e}`);
  }

  // await db.delete(projects);

  const result = await db.select().from(projects).all();

  return c.json({ result });
});

export default app;
