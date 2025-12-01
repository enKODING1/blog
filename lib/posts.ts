import fs from "fs";
import path from "path";
import matter from "gray-matter";
import { remark } from "remark";
import remarkGfm from "remark-gfm";
import remarkBreaks from "remark-breaks";
import remarkRehype from "remark-rehype";
import rehypeRaw from "rehype-raw";
import rehypeHighlight from "rehype-highlight";
import rehypeStringify from "rehype-stringify";

const postsDirectory = path.join(process.cwd(), "posts");

export type PostData = {
  id: string;
  content: string;
  date?: string;
  title?: string;
  category?: string;
};

export function getSortedPostsData(): PostData[] {
  // Get file names under /posts
  const fileNames = fs.readdirSync(postsDirectory);
  const allPostsData = fileNames.map((fileName): PostData => {
    // Remove ".md" from file name to get id
    const id = fileName.replace(/\.md$/, "");

    // Read markdown file as string
    const fullPath = path.join(postsDirectory, fileName);
    const fileContents = fs.readFileSync(fullPath, "utf8");

    // Use gray-matter to parse the post metadata section
    const { content, data } = matter(fileContents);

    // Combine the data with the id
    return {
      id,
      content,
      ...data,
    };
  });
  // Sort posts by date
  return allPostsData.sort((a, b) => {
    if (a.date && b.date && a.date < b.date) {
      return 1;
    } else {
      return -1;
    }
  });
}

export async function getPostData(id: string): Promise<PostData> {
  const fullPath = path.join(postsDirectory, `${id}.md`);
  const contents = fs.readFileSync(fullPath, "utf-8");
  const matterResult = matter(contents);

  // Markdown text to html with syntax highlighting
  const processedContent = await remark()
    .use(remarkGfm) // GitHub Flavored Markdown (tables, task lists, strikethrough, etc.)
    .use(remarkBreaks) // Convert line breaks to <br>
    .use(remarkRehype, { allowDangerousHtml: true }) // Allow raw HTML
    .use(rehypeRaw) // Parse raw HTML in markdown
    .use(rehypeHighlight)
    .use(rehypeStringify)
    .process(matterResult.content);
  const content = processedContent.toString();

  return {
    id,
    content,
    ...matterResult.data,
  };
}

export function getAllPostIds() {
  const fileNames = fs.readdirSync(postsDirectory);
  const allPostsData = fileNames.map(fileName => {
    const id = fileName.replace(/\.md$/, "");
    return id;
  });
  console.log(allPostsData);
  return allPostsData;
}
