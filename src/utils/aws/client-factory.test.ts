import { describe, it, expect } from '@rstest/core';
import { createAWSClient } from './client-factory';
import type { AWSCredentials } from '../types';

describe('createAWSClient', () => {
  it('should create AWS Secrets Manager client with credentials', () => {
    const credentials: AWSCredentials = {
      accountId: '123456789012',
      accessKeyId: 'AKIAIOSFODNN7EXAMPLE',
      secretAccessKey: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY',
      region: 'us-east-1',
    };

    const client = createAWSClient(credentials);

    expect(client).toBeDefined();
    expect(client.config).toBeDefined();
    expect(client.config.region).toBeDefined();
  });

  it('should create client with us-east-1 region', () => {
    const credentials: AWSCredentials = {
      accountId: '123456789012',
      accessKeyId: 'AKIATEST123456789012',
      secretAccessKey: 'testSecretKey123456789012345678901234',
      region: 'us-east-1',
    };

    const client = createAWSClient(credentials);

    expect(client).toBeDefined();
  });

  it('should create client with us-west-2 region', () => {
    const credentials: AWSCredentials = {
      accountId: '234567890123',
      accessKeyId: 'AKIAWEST123456789012',
      secretAccessKey: 'westSecretKey123456789012345678901234',
      region: 'us-west-2',
    };

    const client = createAWSClient(credentials);

    expect(client).toBeDefined();
  });

  it('should create client with eu-west-1 region', () => {
    const credentials: AWSCredentials = {
      accountId: '345678901234',
      accessKeyId: 'AKIAEU1234567890123',
      secretAccessKey: 'euSecretKey1234567890123456789012345',
      region: 'eu-west-1',
    };

    const client = createAWSClient(credentials);

    expect(client).toBeDefined();
  });

  it('should create client with different credential sets', () => {
    const creds1: AWSCredentials = {
      accountId: '123456789012',
      accessKeyId: 'AKIA1',
      secretAccessKey: 'secret1',
      region: 'us-east-1',
    };

    const creds2: AWSCredentials = {
      accountId: '234567890123',
      accessKeyId: 'AKIA2',
      secretAccessKey: 'secret2',
      region: 'us-west-2',
    };

    const client1 = createAWSClient(creds1);
    const client2 = createAWSClient(creds2);

    expect(client1).toBeDefined();
    expect(client2).toBeDefined();
    expect(client1).not.toBe(client2);
  });
});
