// デプロイ後に実際の値に置き換えてください
// CDK デプロイ後の Output から取得できます
export const awsConfig = {
  region: import.meta.env.VITE_AWS_REGION ?? 'ap-northeast-1',
  userPoolId: import.meta.env.VITE_USER_POOL_ID ?? '',
  userPoolClientId: import.meta.env.VITE_USER_POOL_CLIENT_ID ?? '',
  apiUrl: import.meta.env.VITE_API_URL ?? '',
};
