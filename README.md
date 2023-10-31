# slack-multi-project-oauth

以下のような想定上のストーリーを満たすようなSlackアプリのサンプル。

> 一般的な社内用SaaSのWebサービスとSlackアプリがあって、それぞれのクライアント企業ごとに複数のプロジェクトを出し分けしているとしよう。このうち一つの会社のプロジェクトの管理画面から「Slack連携」ボタンを押すと、OAuthフローを経て、その会社のSlackワークスペースにアプリがインストールされる。このとき、「どの会社のプロジェクトからアプリがインストールされたか（社内用SaaSのプロジェクトID）」と、「インストール先のSlackワークスペースID」の対応情報をDBに保存しておきたい。このような用途のためにSlackアプリインストール時のOAuth認証フローをいわば転用したい。

## 要件

- まず前提知識として、Slackアプリというものの実体はAPIエンドポイントである。そこに対して各ワークスペースからリクエストが飛んでくるので、それをさらに加工してSlack APIのエンドポイントを叩くことでワークスペースにレスポンスが返る
  - このSlack APIを叩くときにOAuthトークンが必要になる
- さて、上のストーリーを実現するためにはまず、作ったSlackアプリを複数のワークスペースにインストールできるようにする必要がある
  - 普通に作るとそのアプリを作ったワークスペースでしか動かない。なぜなら、Slackアプリを動かすための権限の入ったOAuthトークンはそれぞれのワークスペースごとに別のものが発行されるため（共通ではない）
- 複数ワークスペースでアプリを動作させるためには、ワークスペースとそのOAuthトークンとを紐付けてDBに保存しておいた上で、リクエストが来るたびごとにリクエスト元のワークスペースに紐づいたOAuthトークンを引っ張り出してきてからSlack APIを叩く必要がある
  - 今回はそのついでに社内用SaaSのプロジェクトIDもワークスペースに紐づけてDBに保存しておくことにする
  - そのため、DBのカラムは `teamId`, `slackBotToken`, `projectId` の3つを用意しておく
  - [src/schema.ts](https://github.com/kyonenya/slack-multi-project-oauth/blob/main/src/schema.ts)

## Slackアプリのインストールの仕組み

Slackアプリインストール時のOAuth認証画面（「〇〇アプリが□□ワークスペースにアクセスする権限をリクエストしています」には以下のようなURLからアクセスできる。

`https://slack.com/oauth/v2/authorize?client_id=SLACK_CLIENT_ID&scope=SLACK_BOT_SCOPES&redirect_uri=http://example.com/slack/oauth_redirect&state=someProjectId`

この画面で「許可」を押すと認証用のコード（`code`）が発行されて、以下のようなパラメータ付きでURLにリダイレクトする。このとき `state` もパラメータとして引き継がれるという性質を利用して、社内用SaaSのプロジェクトIDを渡しておく。

`http://example.com/slack/oauth_redirect/?code=5906276229900...&state=someProjectId`

ここに自前でAPIエンドポイントを用意しておいて、渡されてきた `code` をSlack APIにPOSTすることで、当該のワークスペースに対するOAuthアクセストークン（Slack Bot Token）を取得できる。このアクセストークン取得のステップが成功したとき、その時点ですでにアプリはワークスペースにインストールされている。

## 技術

- このSlackアプリはCloudflare Workers上にデプロイしてある。安価さ、APIレスポンスの速さ、CLI等の開発体験の良さなど様々なメリットがあるのだが、（Node.jsが使えない都合で）Bolt SDKが使えないので、素のfetchを使って自前でイベントを捌く必要がある
  - [Cloudflare Workers で Slack アプリを動かす方法 - Zenn](https://zenn.dev/seratch/articles/c370cf8de7f9f5#%E3%83%A9%E3%82%A4%E3%83%96%E3%83%A9%E3%83%AA%E3%81%A8%E3%81%8B%E4%BD%BF%E3%82%8F%E3%81%9A%E3%81%AB%E3%82%B7%E3%83%B3%E3%83%97%E3%83%AB%E3%81%AB%E5%AE%9F%E8%A3%85%E3%81%97%E3%81%A1%E3%82%83%E3%83%80%E3%83%A1%E3%81%AA%E3%81%AE%EF%BC%9F)
- DBには同じくCloudflareのD1（CDN上で動くSQLite）、ORMにはdrizzle-ormを使用した
  - [Cloudflare D1 で ORM を使う (drizzle-orm)](https://zenn.dev/mizchi/articles/d1-drizzle-orm)
- APIのルーティングにはHonoを使った（エッジサーバーで動くexpress的なライブラリ）
  - UIも同じくHonoで用意した。APIサーバーから簡易的なUIを作れる
  - [[Cloudflare Workers] HonoにJSXミドルウェアが追加されました](https://zenn.dev/yusukebe/articles/c9bc1aa389cbd7#jsx%E3%81%AE%E4%B8%AD%E3%81%AB%E3%82%B9%E3%83%8B%E3%83%9A%E3%83%83%E3%83%88%E3%82%92%E6%8C%BF%E5%85%A5%E3%81%99%E3%82%8B)

## 動作

[![Image from Gyazo](https://t.gyazo.com/teams/nota/ac88fa46460aa6e58c271338dd628ce4.gif)](https://nota.gyazo.com/ac88fa46460aa6e58c271338dd628ce4)

[![Image from Gyazo](https://t.gyazo.com/teams/nota/5146ad99ccf2e9c246a5ba91029be805.gif)](https://nota.gyazo.com/5146ad99ccf2e9c246a5ba91029be805)
