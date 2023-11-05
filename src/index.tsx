import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { html } from 'hono/html';
import { drizzle } from 'drizzle-orm/d1';
import { eq } from 'drizzle-orm';
import { projects } from './schema';
import { verifySlackRequest } from './verifySlackRequest';
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
  SLACK_SIGNING_SECRET: string;
};

const app = new Hono<{ Bindings: Env }>();

app.get('/', async (c) => {
  const redirectUri = c.req.url.replace('http://', 'https://');
  return c.html(
    html`<html>
      <head>
        <title>Install Slack App to Your Workspace</title>
      </head>
      <h1>Install Slack App to Workspace <br/>with Your Own Project ID</h1>
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
    const requestBodyText = await c.req.text();
    const { event, team_id, challenge } = JSON.parse(requestBodyText);

    // Verify URL
    if (challenge) return c.json({ challenge });

    // Slackアプリからのリクエストではない場合は Unauthorized エラーを返す
    if (
      !(await verifySlackRequest({
        signingSecret: c.env.SLACK_SIGNING_SECRET,
        requestBodyText,
        timestampHeader: c.req.header('x-slack-request-timestamp') ?? '',
        signatureHeader: c.req.header('x-slack-signature') ?? '',
      }))
    ) {
      throw new HTTPException(401, { message: 'Invalid signature.' });
    }

    if (event && event.type === 'app_mention') {
      // DBからリクエスト元ワークスペース用のOAuthトークンとプロジェクトIDを取り出す
      const { slackBotToken, projectId } = (
        await db.select().from(projects).where(eq(projects.teamId, team_id))
      )[0];

      const text = `あなたのSlackチームIDは \`${team_id}\` ですね。\nあなたのプロジェクトIDは \`${projectId}\` です。`;

      // メッセージを送信する
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
    if (error instanceof Error) {
      return c.json({ error: error.message });
    }
    return console.error(error);
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

    // DBにチームIDと紐づけつつOAuthトークンとプロジェクトIDを保存する
    await db.insert(projects).values({
      teamId: data.team.id,
      slackBotToken: data.access_token,
      projectId: state,
    });
  } catch (error) {
    if (error instanceof Error) {
      return c.json({ error: error.message });
    }
    return console.error(error);
  }

  // return c.json({ result: await db.select().from(projects).all() });
  return c.redirect(`/slack/oauth_redirect/completed?projectId=${state}`);
});

app.get('/slack/oauth_redirect/completed', async (c) => {
  return c.html(
    html`<html>
      <head>
        <title>Successfully Installed</title>
      </head>
      <body>
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

          code {
            background-color: #f0f0f0;
            border: 1px solid #cccccc;
            color: #ff5555;
            padding: 2px 4px;
            font-family: Consolas, 'Courier New', Courier, monospace;
            font-size: 0.9em;
            border-radius: 4px;
          }
        </style>
        <h1>Slack App Successfully Installed in Your Workspace!</h1>
        <p>Your project ID is: <code>${c.req.query('projectId')}</code></p>
      </body>
    </html>`,
  );
});

app.get('/slack/oauth_redirect/delete', async (c) => {
  const db = drizzle(c.env.DB);

  try {
    await db.delete(projects);
  } catch (error) {
    if (error instanceof Error) {
      return c.json({ error: error.message });
    }
    return console.error(error);
  }

  return c.json({ message: 'Deleted all projects.' });
});

export default app;
