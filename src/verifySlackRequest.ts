/**
 * リクエスト署名の検証
 *
 * > Slack アプリの Request URL は、インターネットに公開された URL であり、Slack のリクエスト元の IP アドレスは常に固定のものに保証されているわけでもありません。そのため、悪意のある第三者が Slack から送信されるペイロードを模してリクエストをしてくるリスクがあります。
 * >
 * > これに対する対策として Slack からの通知の HTTP リクエストには、必ず `x-slack-signature` と `x-slack-request-timestamp` というヘッダーが含まれます。Slack アプリ側では `x-slack-signature` を Slack とだけ共有している Signing Secret を使って検証し、かつ `x-slack-request-timestamp` が古い日時でないことも確認することが推奨されています。
 *
 * @url https://zenn.dev/seratch/articles/c370cf8de7f9f5#リクエスト署名の検証
 * @url https://github.com/seratch/slack-edge/blob/main/src/request/request-verification.ts
 */
export async function verifySlackRequest({
  signingSecret,
  requestBodyText,
  timestampHeader,
  signatureHeader,
}: {
  signingSecret: string;
  requestBodyText: string;
  timestampHeader: string; // 'x-slack-request-timestamp'
  signatureHeader: string; // 'x-slack-signature'
}) {
  if (!timestampHeader) {
    console.log('x-slack-request-timestamp header is missing!');
    return false;
  }
  const fiveMinutesAgoSeconds = Math.floor(Date.now() / 1000) - 60 * 5;
  if (Number.parseInt(timestampHeader) < fiveMinutesAgoSeconds) {
    return false;
  }

  if (!timestampHeader || !signatureHeader) {
    console.log('x-slack-signature header is missing!');
    return false;
  }

  const textEncoder = new TextEncoder();
  return await crypto.subtle.verify(
    'HMAC',
    await crypto.subtle.importKey(
      'raw',
      textEncoder.encode(signingSecret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['verify'],
    ),
    fromHexStringToBytes(signatureHeader.substring(3)),
    textEncoder.encode(`v0:${timestampHeader}:${requestBodyText}`),
  );
}

function fromHexStringToBytes(hexString: string) {
  const bytes = new Uint8Array(hexString.length / 2);
  for (let idx = 0; idx < hexString.length; idx += 2) {
    bytes[idx / 2] = parseInt(hexString.substring(idx, idx + 2), 16);
  }
  return bytes.buffer;
}
