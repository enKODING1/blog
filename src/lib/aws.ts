import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";
import { S3Client } from "@aws-sdk/client-s3";
import { getDataConfig } from "@/lib/config";

let ddb: DynamoDBDocumentClient | undefined;
let s3: S3Client | undefined;

export function getDdb(): DynamoDBDocumentClient {
  ddb ??= DynamoDBDocumentClient.from(
    new DynamoDBClient({ region: getDataConfig().region }),
    { marshallOptions: { removeUndefinedValues: true } }
  );
  return ddb;
}

export function getS3(): S3Client {
  s3 ??= new S3Client({ region: getDataConfig().region });
  return s3;
}
