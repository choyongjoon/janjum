import { createFileRoute, Link } from '@tanstack/react-router';
import { sampleBlogPosts } from '~/data/blogPosts';

export const Route = createFileRoute('/blog/$postId')({
  component: BlogPost,
});

function BlogPost() {
  const { postId } = Route.useParams();
  const post = sampleBlogPosts.find((p) => p.id === postId);

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
              <div className="flex items-center gap-2">
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary font-bold text-primary-content text-sm">
                  잔
                </span>
                <span>잔점 에디터</span>
              </div>
              <span>
                📅 {new Date(post.publishedAt).toLocaleDateString('ko-KR')}
              </span>
            </div>

            <div className="h-px w-full bg-base-300" />
          </header>

          {/* Article Body */}
          <div className="prose prose-lg max-w-none">
            <div className="rounded-lg bg-base-100 p-8 shadow-sm">
              <div className="whitespace-pre-line leading-relaxed">
                {post.content.split('\n').map((line, index) => {
                  // Handle markdown-style headers
                  if (line.startsWith('# ')) {
                    return (
                      <h1 key={`h1-${index}`} className="mt-8 mb-4 font-bold text-3xl first:mt-0">
                        {line.substring(2)}
                      </h1>
                    );
                  }
                  if (line.startsWith('## ')) {
                    return (
                      <h2 key={`h2-${index}`} className="mt-6 mb-3 font-bold text-2xl">
                        {line.substring(3)}
                      </h2>
                    );
                  }
                  if (line.startsWith('### ')) {
                    return (
                      <h3 key={`h3-${index}`} className="mt-4 mb-2 font-bold text-xl">
                        {line.substring(4)}
                      </h3>
                    );
                  }

                  // Handle bold text
                  if (line.includes('**')) {
                    const parts = line.split('**');
                    return (
                      <p key={`p-bold-${index}`} className="mb-4">
                        {parts.map((part, i) =>
                          i % 2 === 1 ? <strong key={`bold-${i}`}>{part}</strong> : part
                        )}
                      </p>
                    );
                  }

                  // Handle lists
                  if (line.startsWith('- ')) {
                    return (
                      <li key={`li-${index}`} className="mb-2 ml-4">
                        {line.substring(2)}
                      </li>
                    );
                  }

                  // Handle empty lines
                  if (line.trim() === '') {
                    return <br key={`br-${index}`} />;
                  }

                  // Regular paragraphs
                  return (
                    <p key={`p-${index}`} className="mb-4">
                      {line}
                    </p>
                  );
                })}
              </div>
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
