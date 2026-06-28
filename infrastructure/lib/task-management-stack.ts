import * as cdk from 'aws-cdk-lib';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as origins from 'aws-cdk-lib/aws-cloudfront-origins';
import * as s3deploy from 'aws-cdk-lib/aws-s3-deployment';
import * as iam from 'aws-cdk-lib/aws-iam';
import { Construct } from 'constructs';
import * as path from 'path';

export class TaskManagementStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // Google OAuth の Client ID / Secret は SSM Parameter Store や
    // Secrets Manager から取得する想定。デプロイ前に設定必須。
    const googleClientId = new cdk.CfnParameter(this, 'GoogleClientId', {
      type: 'String',
      description: 'Google OAuth 2.0 Client ID',
      noEcho: false,
    });
    const googleClientSecret = new cdk.CfnParameter(this, 'GoogleClientSecret', {
      type: 'String',
      description: 'Google OAuth 2.0 Client Secret',
      noEcho: true,
    });

    // 許可するメールドメイン (カンマ区切り)
    // 現在は gmail.com のみ、会社ドメインへの変更は ALLOWED_DOMAINS を更新するだけ
    const allowedDomains = new cdk.CfnParameter(this, 'AllowedDomains', {
      type: 'String',
      default: 'gmail.com',
      description: '許可するメールドメイン (カンマ区切り例: gmail.com または example.com)',
    });

    // ── Pre-authentication Lambda (ドメイン制限) ──────────────────────
    const domainCheckFn = new lambda.Function(this, 'DomainCheckFn', {
      functionName: 'task-management-domain-check',
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: 'domain-check.handler',
      code: lambda.Code.fromAsset(path.join(__dirname, '../../backend/triggers')),
      environment: {
        // デプロイ後に変更する場合は Lambda 環境変数を更新するだけでよい
        ALLOWED_DOMAINS: allowedDomains.valueAsString,
      },
      timeout: cdk.Duration.seconds(5),
    });

    // ── Cognito User Pool ──────────────────────────────────────────────
    const userPool = new cognito.UserPool(this, 'UserPool', {
      userPoolName: 'task-management-users',
      selfSignUpEnabled: true,        // Googleログイン経由の自動サインアップを許可
      signInAliases: { email: true },
      autoVerify: { email: true },
      standardAttributes: {
        email: { required: true, mutable: true },
        fullname: { required: false, mutable: true },
        profilePicture: { required: false, mutable: true },
      },
      accountRecovery: cognito.AccountRecovery.EMAIL_ONLY,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
      // Googleログイン後のドメインチェック
      lambdaTriggers: {
        preAuthentication: domainCheckFn,
        // 新規ユーザー作成時にもドメインチェック
        preSignUp: domainCheckFn,
      },
    });

    // ── Cognito Hosted UI ドメイン ─────────────────────────────────────
    // Cognito のマネージドログインページを使う (Google OAuth コールバック先)
    const userPoolDomain = userPool.addDomain('UserPoolDomain', {
      cognitoDomain: {
        // アカウント ID を含めてユニークにする
        domainPrefix: `taskmanager-${this.account}`,
      },
    });

    // ── Google Identity Provider ───────────────────────────────────────
    const googleIdp = new cognito.UserPoolIdentityProviderGoogle(this, 'GoogleIdp', {
      userPool,
      clientId: googleClientId.valueAsString,
      clientSecretValue: cdk.SecretValue.unsafePlainText(googleClientSecret.valueAsString),
      // Cognito が Google から取得するスコープ
      scopes: ['openid', 'email', 'profile'],
      // Google の属性を Cognito の標準属性にマッピング
      attributeMapping: {
        email: cognito.ProviderAttribute.GOOGLE_EMAIL,
        fullname: cognito.ProviderAttribute.GOOGLE_NAME,
        profilePicture: cognito.ProviderAttribute.GOOGLE_PICTURE,
      },
    });

    // ── User Pool Client (Hosted UI 用) ───────────────────────────────
    // CloudFront URL は CDK 合成時に未確定なので、デプロイ後に手動でコールバック URL を追加するか
    // 固定のカスタムドメインを使う。ここでは localhost と CloudFront のプレースホルダーを設定。
    const userPoolClient = new cognito.UserPoolClient(this, 'UserPoolClient', {
      userPool,
      userPoolClientName: 'task-management-web',
      generateSecret: false,
      // Hosted UI (OAuth) を有効化
      oAuth: {
        flows: {
          authorizationCodeGrant: true,
        },
        scopes: [
          cognito.OAuthScope.OPENID,
          cognito.OAuthScope.EMAIL,
          cognito.OAuthScope.PROFILE,
        ],
        // デプロイ後に CloudFront URL に合わせて更新
        callbackUrls: [
          'http://localhost:5173/callback',
          // CDK デプロイ後に 'https://<CloudFront>.cloudfront.net/callback' を追加してください
        ],
        logoutUrls: [
          'http://localhost:5173',
        ],
      },
      supportedIdentityProviders: [
        cognito.UserPoolClientIdentityProvider.GOOGLE,
      ],
    });

    // Google IdP が先に作られないとクライアントが失敗するため依存関係を明示
    userPoolClient.node.addDependency(googleIdp);

    // チーム用グループ (frontend, backend, infrastructure, qa)
    const teams = ['frontend', 'backend', 'infrastructure', 'qa'];
    teams.forEach(team => {
      new cognito.CfnUserPoolGroup(this, `Group-${team}`, {
        userPoolId: userPool.userPoolId,
        groupName: team,
        description: `${team} チーム`,
      });
    });
    new cognito.CfnUserPoolGroup(this, 'Group-admin', {
      userPoolId: userPool.userPoolId,
      groupName: 'admin',
      description: '管理者',
    });

    // ── DynamoDB Tables ────────────────────────────────────────────────
    const tasksTable = new dynamodb.Table(this, 'TasksTable', {
      tableName: 'tasks',
      partitionKey: { name: 'teamId', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'taskId', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
      pointInTimeRecovery: true,
    });
    tasksTable.addGlobalSecondaryIndex({
      indexName: 'assignee-index',
      partitionKey: { name: 'assigneeId', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'createdAt', type: dynamodb.AttributeType.STRING },
      projectionType: dynamodb.ProjectionType.ALL,
    });

    const commentsTable = new dynamodb.Table(this, 'CommentsTable', {
      tableName: 'task-comments',
      partitionKey: { name: 'taskId', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'commentId', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });

    // ── Lambda Layer ──────────────────────────────────────────────────
    const lambdaLayer = new lambda.LayerVersion(this, 'CommonLayer', {
      code: lambda.Code.fromAsset(path.join(__dirname, '../../backend/layer')),
      compatibleRuntimes: [lambda.Runtime.NODEJS_20_X],
      description: '共通ライブラリ',
    });

    // ── Lambda Functions ───────────────────────────────────────────────
    const commonEnv = {
      TASKS_TABLE: tasksTable.tableName,
      COMMENTS_TABLE: commentsTable.tableName,
      USER_POOL_ID: userPool.userPoolId,
      USER_POOL_CLIENT_ID: userPoolClient.userPoolClientId,
    };

    const makeFn = (id: string, handler: string, name: string) =>
      new lambda.Function(this, id, {
        functionName: name,
        runtime: lambda.Runtime.NODEJS_20_X,
        handler,
        code: lambda.Code.fromAsset(path.join(__dirname, '../../backend/handlers')),
        layers: [lambdaLayer],
        environment: commonEnv,
        timeout: cdk.Duration.seconds(30),
      });

    const tasksHandler = makeFn('TasksHandler', 'tasks.handler', 'task-management-tasks');
    const commentsHandler = makeFn('CommentsHandler', 'comments.handler', 'task-management-comments');
    const usersHandler = makeFn('UsersHandler', 'users.handler', 'task-management-users');

    tasksTable.grantReadWriteData(tasksHandler);
    tasksTable.grantReadData(commentsHandler);
    commentsTable.grantReadWriteData(commentsHandler);
    tasksTable.grantReadData(usersHandler);

    const cognitoPolicy = new iam.PolicyStatement({
      actions: [
        'cognito-idp:ListUsers',
        'cognito-idp:ListUsersInGroup',
        'cognito-idp:ListGroups',
        'cognito-idp:AdminGetUser',
        'cognito-idp:AdminAddUserToGroup',
        'cognito-idp:AdminRemoveUserFromGroup',
        'cognito-idp:AdminListGroupsForUser',
      ],
      resources: [userPool.userPoolArn],
    });
    usersHandler.addToRolePolicy(cognitoPolicy);
    tasksHandler.addToRolePolicy(cognitoPolicy);

    // ── API Gateway ────────────────────────────────────────────────────
    const authorizer = new apigateway.CognitoUserPoolsAuthorizer(this, 'Authorizer', {
      cognitoUserPools: [userPool],
    });

    const api = new apigateway.RestApi(this, 'TaskManagementApi', {
      restApiName: 'task-management-api',
      defaultCorsPreflightOptions: {
        allowOrigins: apigateway.Cors.ALL_ORIGINS,
        allowMethods: apigateway.Cors.ALL_METHODS,
        allowHeaders: ['Content-Type', 'Authorization'],
      },
      deployOptions: { stageName: 'prod', loggingLevel: apigateway.MethodLoggingLevel.INFO },
    });

    const auth: apigateway.MethodOptions = {
      authorizer,
      authorizationType: apigateway.AuthorizationType.COGNITO,
    };

    const tasksResource = api.root.addResource('tasks');
    tasksResource.addMethod('GET', new apigateway.LambdaIntegration(tasksHandler), auth);
    tasksResource.addMethod('POST', new apigateway.LambdaIntegration(tasksHandler), auth);

    const taskResource = tasksResource.addResource('{taskId}');
    taskResource.addMethod('GET', new apigateway.LambdaIntegration(tasksHandler), auth);
    taskResource.addMethod('PUT', new apigateway.LambdaIntegration(tasksHandler), auth);
    taskResource.addMethod('DELETE', new apigateway.LambdaIntegration(tasksHandler), auth);

    const taskCommentsResource = taskResource.addResource('comments');
    taskCommentsResource.addMethod('GET', new apigateway.LambdaIntegration(commentsHandler), auth);
    taskCommentsResource.addMethod('POST', new apigateway.LambdaIntegration(commentsHandler), auth);
    taskCommentsResource.addResource('{commentId}').addMethod('DELETE', new apigateway.LambdaIntegration(commentsHandler), auth);

    const usersResource = api.root.addResource('users');
    usersResource.addMethod('GET', new apigateway.LambdaIntegration(usersHandler), auth);
    const userResource = usersResource.addResource('{userId}');
    userResource.addResource('groups').addMethod('PUT', new apigateway.LambdaIntegration(usersHandler), auth);
    userResource.addResource('admin').addMethod('PUT', new apigateway.LambdaIntegration(usersHandler), auth);

    const teamsResource = api.root.addResource('teams');
    teamsResource.addMethod('GET', new apigateway.LambdaIntegration(usersHandler), auth);
    teamsResource.addResource('{teamId}').addResource('members').addMethod('GET', new apigateway.LambdaIntegration(usersHandler), auth);

    // ── S3 + CloudFront ────────────────────────────────────────────────
    const frontendBucket = new s3.Bucket(this, 'FrontendBucket', {
      bucketName: `task-management-frontend-${this.account}-${this.region}`,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
    });

    const distribution = new cloudfront.Distribution(this, 'FrontendDistribution', {
      defaultBehavior: {
        origin: origins.S3BucketOrigin.withOriginAccessControl(frontendBucket),
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        cachePolicy: cloudfront.CachePolicy.CACHING_OPTIMIZED,
      },
      additionalBehaviors: {
        '/api/*': {
          origin: new origins.HttpOrigin(
            `${api.restApiId}.execute-api.${this.region}.amazonaws.com`,
            { originPath: '/prod' },
          ),
          viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.HTTPS_ONLY,
          cachePolicy: cloudfront.CachePolicy.CACHING_DISABLED,
          allowedMethods: cloudfront.AllowedMethods.ALLOW_ALL,
          cachedMethods: cloudfront.CachedMethods.CACHE_GET_HEAD_OPTIONS,
        },
      },
      defaultRootObject: 'index.html',
      errorResponses: [
        { httpStatus: 403, responseHttpStatus: 200, responsePagePath: '/index.html' },
        { httpStatus: 404, responseHttpStatus: 200, responsePagePath: '/index.html' },
      ],
    });

    new s3deploy.BucketDeployment(this, 'FrontendDeployment', {
      sources: [s3deploy.Source.asset(path.join(__dirname, '../../frontend/dist'))],
      destinationBucket: frontendBucket,
      distribution,
      distributionPaths: ['/*'],
    });

    // ── Outputs ────────────────────────────────────────────────────────
    new cdk.CfnOutput(this, 'UserPoolId', { value: userPool.userPoolId });
    new cdk.CfnOutput(this, 'UserPoolClientId', { value: userPoolClient.userPoolClientId });
    new cdk.CfnOutput(this, 'CognitoDomain', {
      value: `https://${userPoolDomain.domainName}.auth.${this.region}.amazoncognito.com`,
      description: 'Cognito Hosted UI ベース URL',
    });
    new cdk.CfnOutput(this, 'ApiUrl', { value: api.url });
    new cdk.CfnOutput(this, 'FrontendUrl', {
      value: `https://${distribution.distributionDomainName}`,
      description: 'CloudFront URL — これを Google OAuth コールバック URL に追加してください',
    });
    new cdk.CfnOutput(this, 'CloudFrontDistributionId', { value: distribution.distributionId });
    new cdk.CfnOutput(this, 'PostDeployStep', {
      value: [
        '1) Cognito User Pool Client のコールバック URL に CloudFront URL を追加',
        '2) Google Cloud Console の OAuth 承認済みリダイレクト URI に Cognito Hosted UI URL を追加',
        `   例: https://taskmanager-${this.account}.auth.${this.region}.amazoncognito.com/oauth2/idpresponse`,
      ].join(' | '),
    });
  }
}
