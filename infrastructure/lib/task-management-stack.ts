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

    // ── Cognito User Pool ──────────────────────────────────────────────
    const userPool = new cognito.UserPool(this, 'UserPool', {
      userPoolName: 'task-management-users',
      selfSignUpEnabled: false,
      signInAliases: { email: true },
      autoVerify: { email: true },
      passwordPolicy: {
        minLength: 8,
        requireLowercase: true,
        requireUppercase: true,
        requireDigits: true,
        requireSymbols: false,
      },
      accountRecovery: cognito.AccountRecovery.EMAIL_ONLY,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });

    const userPoolClient = new cognito.UserPoolClient(this, 'UserPoolClient', {
      userPool,
      authFlows: {
        userPassword: true,
        userSrp: true,
      },
      generateSecret: false,
    });

    // チーム用グループ (例: frontend, backend, infrastructure, qa)
    const teams = ['frontend', 'backend', 'infrastructure', 'qa'];
    teams.forEach(team => {
      new cognito.CfnUserPoolGroup(this, `Group-${team}`, {
        userPoolId: userPool.userPoolId,
        groupName: team,
        description: `${team} チーム`,
      });
    });

    // 管理者グループ
    new cognito.CfnUserPoolGroup(this, 'Group-admin', {
      userPoolId: userPool.userPoolId,
      groupName: 'admin',
      description: '管理者',
    });

    // ── DynamoDB Tables ────────────────────────────────────────────────
    // Tasks テーブル: PK=teamId, SK=taskId
    const tasksTable = new dynamodb.Table(this, 'TasksTable', {
      tableName: 'tasks',
      partitionKey: { name: 'teamId', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'taskId', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
      pointInTimeRecovery: true,
    });

    // assignee でも検索できるように GSI を追加
    tasksTable.addGlobalSecondaryIndex({
      indexName: 'assignee-index',
      partitionKey: { name: 'assigneeId', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'createdAt', type: dynamodb.AttributeType.STRING },
      projectionType: dynamodb.ProjectionType.ALL,
    });

    // status でフィルタするための GSI
    tasksTable.addGlobalSecondaryIndex({
      indexName: 'status-index',
      partitionKey: { name: 'teamId', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'status', type: dynamodb.AttributeType.STRING },
      projectionType: dynamodb.ProjectionType.ALL,
    });

    // Comments テーブル: PK=taskId, SK=commentId
    const commentsTable = new dynamodb.Table(this, 'CommentsTable', {
      tableName: 'task-comments',
      partitionKey: { name: 'taskId', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'commentId', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });

    // ── Lambda Layer (共通コード) ─────────────────────────────────────
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

    const lambdaProps: Partial<lambda.FunctionProps> = {
      runtime: lambda.Runtime.NODEJS_20_X,
      layers: [lambdaLayer],
      environment: commonEnv,
      timeout: cdk.Duration.seconds(30),
    };

    const tasksHandler = new lambda.Function(this, 'TasksHandler', {
      ...lambdaProps,
      functionName: 'task-management-tasks',
      handler: 'tasks.handler',
      code: lambda.Code.fromAsset(path.join(__dirname, '../../backend/handlers')),
    } as lambda.FunctionProps);

    const commentsHandler = new lambda.Function(this, 'CommentsHandler', {
      ...lambdaProps,
      functionName: 'task-management-comments',
      handler: 'comments.handler',
      code: lambda.Code.fromAsset(path.join(__dirname, '../../backend/handlers')),
    } as lambda.FunctionProps);

    const usersHandler = new lambda.Function(this, 'UsersHandler', {
      ...lambdaProps,
      functionName: 'task-management-users',
      handler: 'users.handler',
      code: lambda.Code.fromAsset(path.join(__dirname, '../../backend/handlers')),
    } as lambda.FunctionProps);

    // DynamoDB 権限付与
    tasksTable.grantReadWriteData(tasksHandler);
    tasksTable.grantReadData(commentsHandler);
    commentsTable.grantReadWriteData(commentsHandler);
    tasksTable.grantReadData(usersHandler);

    // Cognito 操作権限 (ユーザー一覧取得など)
    const cognitoPolicy = new iam.PolicyStatement({
      actions: [
        'cognito-idp:ListUsers',
        'cognito-idp:ListUsersInGroup',
        'cognito-idp:ListGroups',
        'cognito-idp:AdminGetUser',
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
      description: '技術部タスク管理 API',
      defaultCorsPreflightOptions: {
        allowOrigins: apigateway.Cors.ALL_ORIGINS,
        allowMethods: apigateway.Cors.ALL_METHODS,
        allowHeaders: ['Content-Type', 'Authorization'],
      },
      deployOptions: {
        stageName: 'prod',
        loggingLevel: apigateway.MethodLoggingLevel.INFO,
      },
    });

    const authOptions: apigateway.MethodOptions = {
      authorizer,
      authorizationType: apigateway.AuthorizationType.COGNITO,
    };

    // /tasks
    const tasksResource = api.root.addResource('tasks');
    tasksResource.addMethod('GET', new apigateway.LambdaIntegration(tasksHandler), authOptions);
    tasksResource.addMethod('POST', new apigateway.LambdaIntegration(tasksHandler), authOptions);

    const taskResource = tasksResource.addResource('{taskId}');
    taskResource.addMethod('GET', new apigateway.LambdaIntegration(tasksHandler), authOptions);
    taskResource.addMethod('PUT', new apigateway.LambdaIntegration(tasksHandler), authOptions);
    taskResource.addMethod('DELETE', new apigateway.LambdaIntegration(tasksHandler), authOptions);

    // /tasks/{taskId}/comments
    const taskCommentsResource = taskResource.addResource('comments');
    taskCommentsResource.addMethod('GET', new apigateway.LambdaIntegration(commentsHandler), authOptions);
    taskCommentsResource.addMethod('POST', new apigateway.LambdaIntegration(commentsHandler), authOptions);

    const commentResource = taskCommentsResource.addResource('{commentId}');
    commentResource.addMethod('DELETE', new apigateway.LambdaIntegration(commentsHandler), authOptions);

    // /users
    const usersResource = api.root.addResource('users');
    usersResource.addMethod('GET', new apigateway.LambdaIntegration(usersHandler), authOptions);

    const teamsResource = api.root.addResource('teams');
    teamsResource.addMethod('GET', new apigateway.LambdaIntegration(usersHandler), authOptions);

    const teamMembersResource = teamsResource.addResource('{teamId}').addResource('members');
    teamMembersResource.addMethod('GET', new apigateway.LambdaIntegration(usersHandler), authOptions);

    // ── S3 + CloudFront (Frontend) ─────────────────────────────────────
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
          origin: new origins.HttpOrigin(`${api.restApiId}.execute-api.${this.region}.amazonaws.com`, {
            originPath: '/prod',
          }),
          viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.HTTPS_ONLY,
          cachePolicy: cloudfront.CachePolicy.CACHING_DISABLED,
          allowedMethods: cloudfront.AllowedMethods.ALLOW_ALL,
          cachedMethods: cloudfront.CachedMethods.CACHE_GET_HEAD_OPTIONS,
        },
      },
      defaultRootObject: 'index.html',
      errorResponses: [
        {
          httpStatus: 403,
          responseHttpStatus: 200,
          responsePagePath: '/index.html',
        },
        {
          httpStatus: 404,
          responseHttpStatus: 200,
          responsePagePath: '/index.html',
        },
      ],
    });

    // フロントエンドビルド成果物をデプロイ
    new s3deploy.BucketDeployment(this, 'FrontendDeployment', {
      sources: [s3deploy.Source.asset(path.join(__dirname, '../../frontend/dist'))],
      destinationBucket: frontendBucket,
      distribution,
      distributionPaths: ['/*'],
    });

    // ── Outputs ────────────────────────────────────────────────────────
    new cdk.CfnOutput(this, 'UserPoolId', { value: userPool.userPoolId });
    new cdk.CfnOutput(this, 'UserPoolClientId', { value: userPoolClient.userPoolClientId });
    new cdk.CfnOutput(this, 'ApiUrl', { value: api.url });
    new cdk.CfnOutput(this, 'FrontendUrl', { value: `https://${distribution.distributionDomainName}` });
    new cdk.CfnOutput(this, 'CloudFrontDistributionId', { value: distribution.distributionId });
  }
}
