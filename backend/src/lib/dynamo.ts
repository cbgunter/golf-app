import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  UpdateCommand,
  DeleteCommand,
  ScanCommand,
  QueryCommand,
  ScanCommandInput,
  QueryCommandInput,
} from '@aws-sdk/lib-dynamodb';

const client = new DynamoDBClient({ region: process.env.AWS_REGION ?? 'us-east-1' });
export const ddb = DynamoDBDocumentClient.from(client, {
  marshallOptions: { removeUndefinedValues: true },
});

export async function getItem<T>(table: string, id: string): Promise<T | null> {
  const result = await ddb.send(new GetCommand({ TableName: table, Key: { id } }));
  return (result.Item as T) ?? null;
}

export async function putItem<T extends { id: string }>(table: string, item: T): Promise<T> {
  await ddb.send(new PutCommand({ TableName: table, Item: item }));
  return item;
}

export async function deleteItem(table: string, id: string): Promise<void> {
  await ddb.send(new DeleteCommand({ TableName: table, Key: { id } }));
}

export async function scanTable<T>(table: string, filter?: Partial<ScanCommandInput>): Promise<T[]> {
  const result = await ddb.send(new ScanCommand({ TableName: table, ...filter }));
  return (result.Items ?? []) as T[];
}

export async function queryIndex<T>(
  table: string,
  indexName: string,
  keyName: string,
  keyValue: string
): Promise<T[]> {
  const result = await ddb.send(
    new QueryCommand({
      TableName: table,
      IndexName: indexName,
      KeyConditionExpression: '#k = :v',
      ExpressionAttributeNames: { '#k': keyName },
      ExpressionAttributeValues: { ':v': keyValue },
    })
  );
  return (result.Items ?? []) as T[];
}
