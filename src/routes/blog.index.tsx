import { createFileRoute, Link } from '@tanstack/react-router';
import { getBlogPosts } from '~/utils/blogData';
import { formatDateKorean } from '~/utils/dateFormat';
import { seo } from '~/utils/seo';

export const Route = createFileRoute('/blog/')({
  head: () => ({
    meta: [
      ...seo({
        title: '블로그 | 잔점',
        description: '카페 음료와 잔점에 관한 이야기를 담은 블로그입니다.',
        image: '/android-chrome-512x512.png',
        keywords: '잔점 블로그, 카페, 음료, 후기, 커피',
      }),
    ],
  }),
  component: BlogIndex,
});

function BlogIndex() {
  const blogPosts = getBlogPosts();

  return (
    <div className="min-h-screen bg-base-200" data-theme="wireframe">
      {/* Hero Section */}
      <div className="container mx-auto px-4 py-12 text-center">
        <h1 className="font-bold text-4xl">잔점 블로그</h1>
      </div>

      {/* Blog Posts List */}
      <div className="container mx-auto space-y-8 px-4">
        {blogPosts.map((post) => (
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
                    <span>{formatDateKorean(post.publishedAt)}</span>
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
