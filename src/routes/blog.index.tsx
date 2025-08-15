import { createFileRoute, Link } from '@tanstack/react-router';
import { sampleBlogPosts } from '~/data/blogPosts';
import { seo } from '~/utils/seo';

export const Route = createFileRoute('/blog/')({
  head: () => ({
    meta: [
      ...seo({
        title: '블로그 | 잔점',
        description: '잔점 블로그',
      }),
    ],
  }),
  component: BlogIndex,
});

function BlogIndex() {
  return (
    <div className="min-h-screen bg-base-200" data-theme="wireframe">
      {/* Hero Section */}
      <div className="container mx-auto px-4 py-12 text-center">
        <h1 className="font-bold text-4xl">잔점 블로그</h1>
      </div>

      {/* Blog Posts List */}
      <div className="container mx-auto space-y-8 px-4">
        {sampleBlogPosts.map((post) => (
          <Link
            className="transition-colors hover:text-primary"
            key={post.id}
            params={{ postId: post.id }}
            to="/blog/$postId"
          >
            <div className="card bg-base-100 shadow-xl transition-shadow hover:shadow-2xl">
              <div className="card-body">
                <h3 className="card-title mb-3 text-xl">{post.title}</h3>

                <p className="mb-4 line-clamp-3 text-base-content/70">
                  {post.excerpt}
                </p>

                <div className="flex items-center justify-between text-base-content/60 text-sm">
                  <div className="flex items-center gap-4">
                    <span>
                      {new Date(post.publishedAt).toLocaleDateString('ko-KR')}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
