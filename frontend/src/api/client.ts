import axios from 'axios';
import { fetchAuthSession } from 'aws-amplify/auth';
import { awsConfig } from '../aws-config';

const apiClient = axios.create({
  baseURL: awsConfig.apiUrl,
});

apiClient.interceptors.request.use(async (config) => {
  const session = await fetchAuthSession();
  const token = session.tokens?.idToken?.toString();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

export default apiClient;
