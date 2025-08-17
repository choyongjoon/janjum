// Import markdown blog posts
import startPostMd from '~/data/blog-posts/start.md?raw';

type BlogPost = {
  id: string;
  title: string;
  excerpt: string;
  content: string;
  publishedAt: string;
};

// Regex for parsing frontmatter (moved to top level for performance)
const FRONTMATTER_REGEX = /^---\n([\s\S]*?)\n---\n([\s\S]*)$/;

// Simple frontmatter parser that works in the browser
const parseBlogPost = (markdown: string): BlogPost => {
  const match = markdown.match(FRONTMATTER_REGEX);

  if (!match) {
    throw new Error('Invalid markdown format - missing frontmatter');
  }

  const [, frontmatter, content] = match;
  const data: Record<string, string> = {};

  // Parse YAML-like frontmatter using for...of instead of forEach
  for (const line of frontmatter.split('\n')) {
    const colonIndex = line.indexOf(':');
    if (colonIndex > 0) {
      const key = line.substring(0, colonIndex).trim();
      const value = line.substring(colonIndex + 1).trim();
      data[key] = value;
    }
  }

  return {
    id: data.id,
    title: data.title,
    excerpt: data.excerpt,
    content: content.trim(),
    publishedAt: data.publishedAt,
  };
};

export const blogPosts: BlogPost[] = [parseBlogPost(startPostMd)];

export function getBlogPosts(): BlogPost[] {
  return blogPosts;
}

export function getBlogPost(id: string): BlogPost | undefined {
  return blogPosts.find((post) => post.id === id);
}
