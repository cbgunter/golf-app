#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib';
import { GolfAppStack } from '../lib/golf-app-stack';

const app = new cdk.App();
new GolfAppStack(app, 'GolfAppStack', {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION ?? 'us-east-1',
  },
  description: 'Personal Golf Tournament App',
});
