import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as apigateway from 'aws-cdk-lib/aws-apigatewayv2';
import * as integrations from 'aws-cdk-lib/aws-apigatewayv2-integrations';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as origins from 'aws-cdk-lib/aws-cloudfront-origins';
import * as ssm from 'aws-cdk-lib/aws-ssm';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as acm from 'aws-cdk-lib/aws-certificatemanager';
import * as route53 from 'aws-cdk-lib/aws-route53';
import * as targets from 'aws-cdk-lib/aws-route53-targets';
import * as path from 'path';

const DOMAIN = 'golf.caseyhunter.net';
const HOSTED_ZONE_NAME = 'caseyhunter.net';

export class GolfAppStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // ─── DynamoDB Tables ───────────────────────────────────────────────────
    const playersTable = new dynamodb.Table(this, 'PlayersTable', {
      tableName: 'golf-players',
      partitionKey: { name: 'id', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });

    const tournamentsTable = new dynamodb.Table(this, 'TournamentsTable', {
      tableName: 'golf-tournaments',
      partitionKey: { name: 'id', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });
    tournamentsTable.addGlobalSecondaryIndex({
      indexName: 'status-index',
      partitionKey: { name: 'status', type: dynamodb.AttributeType.STRING },
    });

    const roundsTable = new dynamodb.Table(this, 'RoundsTable', {
      tableName: 'golf-rounds',
      partitionKey: { name: 'id', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });
    roundsTable.addGlobalSecondaryIndex({
      indexName: 'tournament-index',
      partitionKey: { name: 'tournamentId', type: dynamodb.AttributeType.STRING },
    });

    const scoresTable = new dynamodb.Table(this, 'ScoresTable', {
      tableName: 'golf-scores',
      partitionKey: { name: 'id', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });
    scoresTable.addGlobalSecondaryIndex({
      indexName: 'round-index',
      partitionKey: { name: 'roundId', type: dynamodb.AttributeType.STRING },
    });
    scoresTable.addGlobalSecondaryIndex({
      indexName: 'player-index',
      partitionKey: { name: 'playerId', type: dynamodb.AttributeType.STRING },
    });

    const coursesTable = new dynamodb.Table(this, 'CoursesTable', {
      tableName: 'golf-courses',
      partitionKey: { name: 'id', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });

    const draftScorecardsTable = new dynamodb.Table(this, 'DraftScorecardsTable', {
      tableName: 'golf-draft-scorecards',
      partitionKey: { name: 'id', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });
    draftScorecardsTable.addGlobalSecondaryIndex({
      indexName: 'pin-index',
      partitionKey: { name: 'pin', type: dynamodb.AttributeType.STRING },
    });
    draftScorecardsTable.addGlobalSecondaryIndex({
      indexName: 'round-index',
      partitionKey: { name: 'roundId', type: dynamodb.AttributeType.STRING },
    });

    // ─── SSM Parameters ────────────────────────────────────────────────────
    const adminPasswordParam = new ssm.StringParameter(this, 'AdminPassword', {
      parameterName: '/golf-app/admin-password',
      stringValue: 'ChangeMe123!',  // Change via AWS console after deploy
      description: 'Admin password for Golf App',
    });

    const jwtSecretParam = new ssm.StringParameter(this, 'JwtSecret', {
      parameterName: '/golf-app/jwt-secret',
      stringValue: cdk.Fn.base64(cdk.Names.uniqueId(this)),
      description: 'JWT signing secret for Golf App',
    });

    // ─── Lambda Function ────────────────────────────────────────────────────
    const apiLambda = new lambda.Function(this, 'ApiLambda', {
      functionName: 'golf-app-api',
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: 'index.handler',
      code: lambda.Code.fromAsset(path.join(__dirname, '../../backend/dist')),
      timeout: cdk.Duration.seconds(30),
      memorySize: 256,
      environment: {
        PLAYERS_TABLE: playersTable.tableName,
        TOURNAMENTS_TABLE: tournamentsTable.tableName,
        ROUNDS_TABLE: roundsTable.tableName,
        SCORES_TABLE: scoresTable.tableName,
        COURSES_TABLE: coursesTable.tableName,
        DRAFT_SCORECARDS_TABLE: draftScorecardsTable.tableName,
        ADMIN_PASSWORD_PARAM: adminPasswordParam.parameterName,
        JWT_SECRET_PARAM: jwtSecretParam.parameterName,
        GHIN_USERNAME_PARAM: '/golf-app/ghin-username',
        GHIN_PASSWORD_PARAM: '/golf-app/ghin-password',
        NODE_ENV: 'production',
      },
    });

    // Grant Lambda permissions
    playersTable.grantReadWriteData(apiLambda);
    tournamentsTable.grantReadWriteData(apiLambda);
    roundsTable.grantReadWriteData(apiLambda);
    scoresTable.grantReadWriteData(apiLambda);
    coursesTable.grantReadWriteData(apiLambda);
    draftScorecardsTable.grantReadWriteData(apiLambda);
    adminPasswordParam.grantRead(apiLambda);
    jwtSecretParam.grantRead(apiLambda);
    // Grant access to GHIN SecureString params (created outside CDK)
    apiLambda.addToRolePolicy(new iam.PolicyStatement({
      actions: ['ssm:GetParameter'],
      resources: [
        `arn:aws:ssm:${this.region}:${this.account}:parameter/golf-app/ghin-username`,
        `arn:aws:ssm:${this.region}:${this.account}:parameter/golf-app/ghin-password`,
      ],
    }));
    apiLambda.addToRolePolicy(new iam.PolicyStatement({
      actions: ['kms:Decrypt'],
      resources: ['*'],
      conditions: { StringEquals: { 'kms:ViaService': `ssm.${this.region}.amazonaws.com` } },
    }));

    // ─── API Gateway ────────────────────────────────────────────────────────
    const httpApi = new apigateway.HttpApi(this, 'HttpApi', {
      apiName: 'golf-app-api',
      corsPreflight: {
        allowHeaders: ['Content-Type', 'Authorization'],
        allowMethods: [
          apigateway.CorsHttpMethod.GET,
          apigateway.CorsHttpMethod.POST,
          apigateway.CorsHttpMethod.PUT,
          apigateway.CorsHttpMethod.DELETE,
          apigateway.CorsHttpMethod.OPTIONS,
        ],
        allowOrigins: ['*'],
        maxAge: cdk.Duration.days(1),
      },
    });

    const lambdaIntegration = new integrations.HttpLambdaIntegration(
      'LambdaIntegration',
      apiLambda
    );

    httpApi.addRoutes({
      path: '/api/{proxy+}',
      methods: [apigateway.HttpMethod.ANY],
      integration: lambdaIntegration,
    });

    // ─── Route 53 Hosted Zone (lookup existing) ──────────────────────────────
    const hostedZone = route53.HostedZone.fromLookup(this, 'HostedZone', {
      domainName: HOSTED_ZONE_NAME,
    });

    // ─── ACM Certificate (must be in us-east-1 for CloudFront) ──────────────
    const certificate = new acm.Certificate(this, 'Certificate', {
      domainName: DOMAIN,
      validation: acm.CertificateValidation.fromDns(hostedZone),
    });

    // ─── S3 Frontend Bucket ─────────────────────────────────────────────────
    const frontendBucket = new s3.Bucket(this, 'FrontendBucket', {
      bucketName: `golf-app-frontend-${this.account}`,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
    });

    // ─── CloudFront ──────────────────────────────────────────────────────────
    const oac = new cloudfront.S3OriginAccessControl(this, 'OAC', {
      description: 'Golf App OAC',
    });

    const distribution = new cloudfront.Distribution(this, 'Distribution', {
      domainNames: [DOMAIN],
      certificate,
      defaultBehavior: {
        origin: origins.S3BucketOrigin.withOriginAccessControl(frontendBucket, {
          originAccessControl: oac,
        }),
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        cachePolicy: cloudfront.CachePolicy.CACHING_OPTIMIZED,
      },
      additionalBehaviors: {
        '/api/*': {
          origin: new origins.HttpOrigin(
            `${httpApi.apiId}.execute-api.${this.region}.amazonaws.com`
          ),
          viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
          cachePolicy: cloudfront.CachePolicy.CACHING_DISABLED,
          allowedMethods: cloudfront.AllowedMethods.ALLOW_ALL,
          originRequestPolicy: cloudfront.OriginRequestPolicy.ALL_VIEWER_EXCEPT_HOST_HEADER,
        },
      },
      defaultRootObject: 'index.html',
      errorResponses: [
        {
          // S3 with OAC returns 403 (AccessDenied) for missing objects.
          // Map to 200/index.html so SPA deep links work.
          httpStatus: 403,
          responseHttpStatus: 200,
          responsePagePath: '/index.html',
        },
        // DO NOT add a 404 rule — it would intercept legitimate API 404 responses
        // from the /api/* behavior and return HTML instead of JSON error bodies.
      ],
    });

    // ─── Route 53 Alias Record ───────────────────────────────────────────────
    new route53.ARecord(this, 'AliasRecord', {
      zone: hostedZone,
      recordName: 'golf',
      target: route53.RecordTarget.fromAlias(new targets.CloudFrontTarget(distribution)),
    });

    // ─── Outputs ─────────────────────────────────────────────────────────────
    new cdk.CfnOutput(this, 'ApiUrl', {
      value: httpApi.apiEndpoint,
      description: 'API Gateway URL',
      exportName: 'GolfAppApiUrl',
    });

    new cdk.CfnOutput(this, 'AppUrl', {
      value: `https://${DOMAIN}`,
      description: 'Your Golf App URL',
      exportName: 'GolfAppUrl',
    });

    new cdk.CfnOutput(this, 'CloudFrontUrl', {
      value: `https://${distribution.distributionDomainName}`,
      description: 'CloudFront Distribution URL (fallback)',
    });

    new cdk.CfnOutput(this, 'FrontendBucketName', {
      value: frontendBucket.bucketName,
      description: 'S3 bucket for frontend deployment',
      exportName: 'GolfAppFrontendBucket',
    });

    new cdk.CfnOutput(this, 'CloudFrontDistributionId', {
      value: distribution.distributionId,
      description: 'CloudFront Distribution ID',
      exportName: 'GolfAppDistributionId',
    });
  }
}
