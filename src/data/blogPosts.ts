export interface BlogPost {
  id: string;
  title: string;
  excerpt: string;
  content: string;
  publishedAt: string;
}

export const sampleBlogPosts: BlogPost[] = [
  {
    id: 'start',
    title: '잔점을 왜 만들기 시작했을까?',
    excerpt: '잔점을 왜 만들기 시작했을까?',
    content: `
# 잔점을 왜 만들기 시작했을까?

Claude Code를 이용한 사이드 프로젝트를 시작해보고 싶어서 생각나는대로 아이디어를 적어두었었다. 그 중에는 카페 음료 
    `,
    publishedAt: '2024-12-15',
  },
];
