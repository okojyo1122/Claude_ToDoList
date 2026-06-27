import * as cdk from 'aws-cdk-lib';
import { TaskManagementStack } from './task-management-stack';

const app = new cdk.App();

new TaskManagementStack(app, 'TaskManagementStack', {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION ?? 'ap-northeast-1',
  },
  description: '技術部タスク管理システム',
});

app.synth();
