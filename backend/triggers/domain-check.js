'use strict';

// 許可するメールドメイン。Lambda 環境変数 ALLOWED_DOMAINS で上書き可能。
// 会社ドメインへの変更は Lambda コンソールまたは CDK で環境変数を更新するだけ。
const ALLOWED_DOMAINS = (process.env.ALLOWED_DOMAINS ?? 'gmail.com')
  .split(',')
  .map(d => d.trim().toLowerCase())
  .filter(Boolean);

exports.handler = async (event) => {
  const email = (
    event.request?.userAttributes?.email ??
    event.userName ?? // Google IdP 経由は userName にメールが入る場合がある
    ''
  ).toLowerCase();

  const domain = email.split('@')[1] ?? '';

  if (!ALLOWED_DOMAINS.includes(domain)) {
    // Cognito はここで例外を投げると登録・認証を拒否する
    throw new Error(
      `アクセスが拒否されました。許可されているドメイン: ${ALLOWED_DOMAINS.join(', ')}`
    );
  }

  // 問題なければイベントをそのまま返す (Cognito の仕様)
  return event;
};
