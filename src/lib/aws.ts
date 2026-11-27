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
  // The default "WHEN_SUPPORTED" puts an empty-body CRC32 checksum into
  // presigned PutObject URLs, so S3 rejects the browser's real upload.
  s3 ??= new S3Client({
    region: getDataConfig().region,
    requestChecksumCalculation: "WHEN_REQUIRED",
    responseChecksumValidation: "WHEN_REQUIRED",
  });
  return s3;
}

/** Test-only: clears memoized clients. */
export function resetAwsClientsForTests(): void {
  ddb = undefined;
  s3 = undefined;
}
