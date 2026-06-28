export const awsConfig = {
  region: import.meta.env.VITE_AWS_REGION ?? 'ap-northeast-1',
  userPoolId: import.meta.env.VITE_USER_POOL_ID ?? '',
  userPoolClientId: import.meta.env.VITE_USER_POOL_CLIENT_ID ?? '',
  // Cognito Hosted UI ドメイン (例: https://taskmanager-123456789.auth.ap-northeast-1.amazoncognito.com)
  cognitoDomain: import.meta.env.VITE_COGNITO_DOMAIN ?? '',
  apiUrl: import.meta.env.VITE_API_URL ?? '',
  // ローカル: http://localhost:5173  本番: https://<CloudFront>.cloudfront.net
  appUrl: import.meta.env.VITE_APP_URL ?? 'http://localhost:5173',
};
