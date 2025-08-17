import { createFileRoute, Link } from '@tanstack/react-router';
import { marked } from 'marked';
import { getBlogPost } from '~/utils/blogData';

// Configure marked options with post-processing
const processMarkdown = (content: string) => {
  // First, parse with marked (synchronous)
  let html = marked.parse(content, {
    breaks: true,
    gfm: true,
  }) as string;

  // Add <br/> after paragraphs
  html = html.replace(/<\/p>/g, '</p><br/>');

  html = html.replace(/<p /g, '<p class="text-lg" ');

  // Add link className to anchor tags
  html = html.replace(/<a /g, '<a class="link" ');

  return html;
};

export const Route = createFileRoute('/blog/$postId')({
  component: BlogPost,
});

function BlogPost() {
  const { postId } = Route.useParams();
  const post = getBlogPost(postId);

  if (!post) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-base-200">
        <div className="text-center">
          <h1 className="mb-4 font-bold text-4xl">포스트를 찾을 수 없습니다</h1>
          <Link className="btn btn-primary" to="/blog">
            블로그로 돌아가기
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-base-200">
      {/* Breadcrumb */}
      <div className="border-b bg-base-100">
        <div className="container mx-auto px-4 py-4">
          <div className="breadcrumbs text-sm">
            <ul>
              <li>
                <Link to="/">홈</Link>
              </li>
              <li>
                <Link to="/blog">블로그</Link>
              </li>
              <li>{post.title}</li>
            </ul>
          </div>
        </div>
      </div>

      {/* Article Content */}
      <article className="container mx-auto px-4 py-12">
        <div className="mx-auto max-w-3xl">
          {/* Article Header */}
          <header className="mb-8">
            <h1 className="mb-6 font-bold text-4xl leading-tight">
              {post.title}
            </h1>

            <div className="mb-6 flex items-center gap-6 text-base-content/70">
              <div className="flex items-center gap-2">조용준</div>
              <span>
                {new Date(post.publishedAt).toLocaleDateString('ko-KR')}
              </span>
            </div>

            <div className="h-px w-full bg-base-300" />
          </header>

          {/* Article Body */}
          <div className="prose prose-lg max-w-none">
            <div className="rounded-lg bg-base-100 p-8 shadow-sm">
              <div
                className="markdown-content prose prose-lg max-w-none"
                // biome-ignore lint/security/noDangerouslySetInnerHtml: Markdown content is sanitized by marked library
                dangerouslySetInnerHTML={{
                  __html: processMarkdown(post.content),
                }}
              />
            </div>
          </div>

          {/* Article Footer */}
          <footer className="mt-12 border-base-300 border-t pt-8">
            <div className="flex items-center justify-between">
              <Link className="btn btn-outline" to="/blog">
                ← 블로그 목록으로
              </Link>
            </div>
          </footer>
        </div>
      </article>
    </div>
  );
}
