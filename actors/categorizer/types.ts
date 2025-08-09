export type Category =
  | '커피'
  | '차'
  | '블렌디드'
  | '스무디'
  | '주스'
  | '에이드'
  | '그 외';

export interface CategorizerInput {
  externalCategory?: string;
  name: string;
}

export interface CategorizerResult {
  category: Category;
  confidence: 'high' | 'medium' | 'low';
  source: 'direct' | 'pattern' | 'fallback' | 'human';
  matchedRule?: string;
}

export interface CategorizationRule {
  id: string;
  type: 'direct' | 'pattern';
  condition: {
    externalCategory?: string;
    namePattern?: string;
    nameContains?: string[];
    nameEndsWith?: string[];
  };
  targetCategory: Category;
  confidence: 'high' | 'medium' | 'low';
  createdBy: 'system' | 'human';
  createdAt: number;
  usageCount: number;
  priority?: number;
}

export interface CategorizationRules {
  version: string;
  lastUpdated: number;
  rules: CategorizationRule[];
  stats: {
    totalCategorizations: number;
    humanLearnings: number;
    averageConfidence: number;
  };
}

export interface CategorizeOptions {
  dryRun?: boolean;
  interactive?: boolean;
  verbose?: boolean;
  confidence?: 'all' | 'low' | 'medium';
  limit?: number;
  force?: boolean;
}

export interface CategorizeStats {
  processed: number;
  updated: number;
  unchanged: number;
  errors: number;
  confidenceBreakdown: {
    high: number;
    medium: number;
    low: number;
  };
  sourceBreakdown: {
    direct: number;
    pattern: number;
    fallback: number;
    human: number;
  };
}

export interface Product {
  _id: string;
  name: string;
  category?: string; // Allow any string, not just Category enum
  externalCategory?: string;
}

export interface ProductForCategorize {
  name: string;
  externalCategory: string;
  category?: string;
}
