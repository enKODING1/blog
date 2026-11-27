/* 기존 posts/*.md 와 이미지를 DynamoDB/S3 로 옮기는 일회성 스크립트.
 * 실행: AWS_PROFILE=seongjin BLOG_AWS_REGION=… BLOG_POSTS_TABLE=… BLOG_MEDIA_BUCKET=… \
 *       npx tsx scripts/migrate-posts.ts [--dry-run]
 * 다시 실행해도 같은 결과(덮어쓰기). */
import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { parseLegacyPost } from "@/lib/posts/import";
import type { Post } from "@/lib/posts/types";

const ROOT = process.cwd();
const POSTS_DIR = path.join(ROOT, "posts");
const IMAGES_DIR = path.join(ROOT, "public");

const CONTENT_TYPES: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
};

type ImagePlan = { local: string; key: string; contentType: string };
type PostPlan = { post: Post; images: ImagePlan[] };

function planImage(webPath: string): ImagePlan {
  const ext = path.extname(webPath).toLowerCase();
  const contentType = CONTENT_TYPES[ext];
  if (!contentType) throw new Error(`지원하지 않는 이미지 확장자: ${webPath}`);
  return {
    local: path.join(IMAGES_DIR, webPath),
    key: webPath.replace(/^\/images\//, ""),
    contentType,
  };
}

function buildPlans(): PostPlan[] {
  const files = readdirSync(POSTS_DIR)
    .filter(f => f.endsWith(".md"))
    .sort();
  return files.map(f => {
    const { post, images } = parseLegacyPost(
      f,
      readFileSync(path.join(POSTS_DIR, f), "utf8")
    );
    return { post, images: images.map(planImage) };
  });
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const plans = buildPlans();

  const missing = plans
    .flatMap(p => p.images)
    .filter(i => !existsSync(i.local))
    .map(i => i.local);
  if (missing.length > 0) {
    console.error("없는 이미지 파일:");
    for (const m of missing) console.error(`  ${m}`);
    process.exit(1);
  }

  const imageCount = plans.reduce((n, p) => n + p.images.length, 0);

  if (dryRun) {
    for (const { post, images } of plans) {
      console.log(
        `[글] ${post.slug} | ${post.title} | 이미지 ${images.length}개`
      );
      for (const i of images) {
        console.log(
          `  [이미지] ${path.relative(ROOT, i.local)} -> ${i.key} (${i.contentType})`
        );
      }
    }
    console.log(
      `글 ${plans.length}개, 이미지 ${imageCount}개 (dry-run, 쓰기 없음)`
    );
    return;
  }

  // AWS 모듈은 실제 실행에서만 불러온다 (dry-run 은 자격 증명 불필요).
  const { PutObjectCommand } = await import("@aws-sdk/client-s3");
  const { getS3 } = await import("@/lib/aws");
  const { getDataConfig } = await import("@/lib/config");
  const { putPost } = await import("@/lib/posts/repo");
  const bucket = getDataConfig().mediaBucket;

  for (const { post, images } of plans) {
    for (const i of images) {
      await getS3().send(
        new PutObjectCommand({
          Bucket: bucket,
          Key: i.key,
          Body: readFileSync(i.local),
          ContentType: i.contentType,
        })
      );
      console.log(`업로드: ${i.key}`);
    }
    await putPost(post);
    console.log(`저장: ${post.slug}`);
  }
  console.log(`완료: 글 ${plans.length}개, 이미지 ${imageCount}개`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
