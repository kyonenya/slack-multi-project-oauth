import { Hono } from 'hono';
import { html } from 'hono/html';
import { drizzle } from 'drizzle-orm/d1';
import { eq } from 'drizzle-orm';
import { projects } from './schema';
// 型定義のみ使用
import type {
  SlackAPIResponse,
  OAuthV2AccessResponse,
} from 'slack-cloudflare-workers';

export type Env = {
  DB: D1Database;
  SLACK_CLIENT_ID: string;
  SLACK_CLIENT_SECRET: string;
  SLACK_BOT_SCOPES: string;
};

const app = new Hono<{ Bindings: Env }>();

app.get('/', async (c) => {
  const redirectUri = c.req.url.replace('http://', 'https://');
  return c.html(
    html`<html>
      <head>
      <h1>Install the Slack App to Workspace <br/>with Your Own Project ID</h1>
        <p>Please enter your Project ID below:</p>
        <input type="text" id="projectIdInput" placeholder="Enter your project ID" />
        <br/>
        <button id="installButton">Install to Workspace</button>
      <script>
        document
          .getElementById('installButton')
          .addEventListener('click', function () {
            const inputValue = document.getElementById('projectIdInput').value;
            const targetURL =
              'https://slack.com/oauth/v2/authorize?'
              + 'client_id=${c.env.SLACK_CLIENT_ID}'
              + '&scope=${encodeURIComponent(c.env.SLACK_BOT_SCOPES)}'
              + '&redirect_uri=${redirectUri}slack/oauth_redirect'
              + '&state=' + encodeURIComponent(inputValue);
            window.location.href = targetURL;
          });
      </script>
      <style>
            body {
                font-family: 'Arial', sans-serif;
                display: flex;
                flex-direction: column;
                align-items: center;
                background-color: #f6f8fa;
                padding-top: 50px;
            }
            
            h1 {
                font-size: 24px;
                text-align: center;
                margin-bottom: 15px;
                color: #333;
                line-height: 1.4;
            }

            input#projectIdInput {
                padding: 10px;
                border-radius: 5px;
                border: 1px solid #ccc;
                margin-bottom: 15px;
                width: 80%;
                max-width: 400px;
            }

            button#installButton {
                padding: 10px 15px;
                background-color: #0077b5;
                color: white;
                border: none;
                border-radius: 5px;
                cursor: pointer;
                transition: background-color 0.3s;
            }

            button#installButton:hover {
                background-color: #005582;
            }
        </style>
      </body>
    </html>`,
  );
});

app.post('/slack/events', async (c) => {
  try {
    const db = drizzle(c.env.DB);
    const body = await c.req.json();
    const { event, team_id } = body;

    // Verify URL
    if ('challenge' in body) return c.json({ challenge: body.challenge });

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
        return c.json({ ok: false });
      }
    }
  } catch (error) {
    console.error(error);
    if (error instanceof Error) {
      return c.json({ error: error.message });
    }
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
  params.append(
    'redirect_uri',
    c.req.url.replace('http://', 'https://').split('?')[0],
  );

  try {
    const response = await fetch('https://slack.com/api/oauth.v2.access', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params,
    });

    const data: OAuthV2AccessResponse = await response.json();

    if (!data.ok || !data.access_token || !data.team?.id) {
      console.error(`OAuth Error: ${data.error}`);
      return c.json({ error: data.error });
    }

    // DBにチームIDと紐づけつつOAuthトークンとプロジェクトIDを保存
    await db.insert(projects).values({
      teamId: data.team.id,
      slackBotToken: data.access_token,
      projectId: state,
    });
  } catch (error) {
    console.error(error);
    if (error instanceof Error) {
      return c.json({ error: error.message });
    }
  }

  const result = await db.select().from(projects).all();

  return c.json({ result });
});

app.get('/slack/oauth_redirect/delete', async (c) => {
  const db = drizzle(c.env.DB);
  await db.delete(projects);

  return c.json({ message: 'Deleted all projects.' });
});

export default app;
