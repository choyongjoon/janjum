export type Category =
  | "커피"
  | "차"
  | "블렌디드"
  | "스무디"
  | "주스"
  | "에이드"
  | "아이스크림"
  | "그 외";

export interface CategorizerInput {
  externalCategory?: string;
  name: string;
}

export interface CategorizerResult {
  category: Category;
  confidence: "high" | "medium" | "low";
  matchedRule?: string;
  source: "direct" | "pattern" | "fallback" | "human";
}

export interface CategorizationRule {
  condition: {
    externalCategory?: string;
    namePattern?: string;
    nameContains?: string[];
    nameEndsWith?: string[];
  };
  confidence: "high" | "medium" | "low";
  createdAt: number;
  createdBy: "system" | "human";
  id: string;
  priority?: number;
  targetCategory: Category;
  type: "direct" | "pattern";
  usageCount: number;
}

export interface CategorizationRules {
  lastUpdated: number;
  rules: CategorizationRule[];
  stats: {
    totalCategorizations: number;
    humanLearnings: number;
    averageConfidence: number;
  };
  version: string;
}

export interface CategorizeOptions {
  confidence?: "all" | "low" | "medium";
  dryRun?: boolean;
  force?: boolean;
  interactive?: boolean;
  limit?: number;
  verbose?: boolean;
}

export interface CategorizeStats {
  confidenceBreakdown: {
    high: number;
    medium: number;
    low: number;
  };
  errors: number;
  processed: number;
  sourceBreakdown: {
    direct: number;
    pattern: number;
    fallback: number;
    human: number;
  };
  unchanged: number;
  updated: number;
}

export interface Product {
  _id: string;
  category?: string; // Allow any string, not just Category enum
  externalCategory?: string;
  name: string;
}

export interface ProductForCategorize {
  category?: string;
  externalCategory: string;
  name: string;
}
