import { Hono } from 'hono';
import { SlackApp, SlackEdgeAppEnv } from 'slack-cloudflare-workers';

export interface Env {
  // Example binding to KV. Learn more at https://developers.cloudflare.com/workers/runtime-apis/kv/
  // MY_KV_NAMESPACE: KVNamespace;
  //
  // Example binding to Durable Object. Learn more at https://developers.cloudflare.com/workers/runtime-apis/durable-objects/
  // MY_DURABLE_OBJECT: DurableObjectNamespace;
  //
  // Example binding to R2. Learn more at https://developers.cloudflare.com/workers/runtime-apis/r2/
  // MY_BUCKET: R2Bucket;
  //
  // Example binding to a Service. Learn more at https://developers.cloudflare.com/workers/runtime-apis/service-bindings/
  // MY_SERVICE: Fetcher;
  //
  // Example binding to a Queue. Learn more at https://developers.cloudflare.com/queues/javascript-apis/
  // MY_QUEUE: Queue;
}

// const app = new Hono()

// app.get('/', (c) => c.text('Hello Hono!'))

// export default app

export default {
  async fetch(
    request: Request,
    env: SlackEdgeAppEnv,
    ctx: ExecutionContext,
  ): Promise<Response> {
    const app = new SlackApp({ env });

    // Events API では 3 秒以内に同期的に応答しないと実現できない要件がないので
    // デフォルトで lazy 関数だけを渡せるようにしている
    app.event('app_mention', async ({ context }) => {
      await context.say({
        text: `<@${context.userId}> さん、何かご用ですか？`,
      });
    });

    return await app.run(request, ctx);
  },
};
