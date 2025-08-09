import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { logger } from '../../shared/logger';
import type {
  CategorizationRule,
  CategorizationRules,
  CategorizerInput,
  CategorizerResult,
  Category,
} from './types';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export class ProductCategorizer {
  private rules: CategorizationRules = {
    version: '1.0.0',
    lastUpdated: Date.now(),
    rules: [],
    stats: {
      totalCategorizations: 0,
      humanLearnings: 0,
      averageConfidence: 0,
    },
  };
  private rulesPath: string;

  constructor(rulesPath?: string) {
    this.rulesPath =
      rulesPath || path.join(__dirname, 'categorizer-rules.json');
    this.loadRules();
  }

  /**
   * Load categorization rules from JSON file
   */
  private loadRules(): void {
    try {
      if (fs.existsSync(this.rulesPath)) {
        const rulesData = fs.readFileSync(this.rulesPath, 'utf-8');
        this.rules = JSON.parse(rulesData);
        logger.debug(`Loaded ${this.rules.rules.length} categorization rules`);
      } else {
        logger.warn(
          `Rules file not found at ${this.rulesPath}, using empty rules`
        );
        this.rules = {
          version: '1.0.0',
          lastUpdated: Date.now(),
          rules: [],
          stats: {
            totalCategorizations: 0,
            humanLearnings: 0,
            averageConfidence: 0,
          },
        };
      }
    } catch (error) {
      logger.error(`Failed to load rules from ${this.rulesPath}:`, error);
      throw new Error(`Failed to load categorization rules: ${error}`);
    }
  }

  /**
   * Save rules to JSON file
   */
  private saveRules(): void {
    try {
      this.rules.lastUpdated = Date.now();
      fs.writeFileSync(this.rulesPath, JSON.stringify(this.rules, null, 2));
      logger.debug(`Saved categorization rules to ${this.rulesPath}`);
    } catch (error) {
      logger.error(`Failed to save rules to ${this.rulesPath}:`, error);
      throw new Error(`Failed to save categorization rules: ${error}`);
    }
  }

  /**
   * Categorize a product based on externalCategory and name
   */
  categorize(input: CategorizerInput): CategorizerResult {
    // Step 1: Try direct externalCategory mapping
    if (input.externalCategory) {
      const directRule = this.findDirectRule(input.externalCategory);
      if (directRule) {
        this.incrementRuleUsage(directRule.id);
        this.updateStats('high');
        return {
          category: directRule.targetCategory,
          confidence: directRule.confidence,
          source: 'direct',
          matchedRule: directRule.id,
        };
      }
    }

    // Step 2: Try name pattern matching
    const patternResult = this.findPatternMatch(input.name);
    if (patternResult) {
      this.incrementRuleUsage(patternResult.rule.id);
      this.updateStats(patternResult.rule.confidence);
      return {
        category: patternResult.rule.targetCategory,
        confidence: patternResult.rule.confidence,
        source: 'pattern',
        matchedRule: patternResult.rule.id,
      };
    }

    // Step 3: Fallback to default category
    this.updateStats('low');
    return {
      category: '그 외',
      confidence: 'low',
      source: 'fallback',
    };
  }

  /**
   * Find direct externalCategory mapping rule
   */
  private findDirectRule(externalCategory: string): CategorizationRule | null {
    return (
      this.rules.rules.find(
        (rule) =>
          rule.type === 'direct' &&
          rule.condition.externalCategory === externalCategory
      ) || null
    );
  }

  /**
   * Find pattern matching rule with priority support
   */
  private findPatternMatch(name: string): { rule: CategorizationRule } | null {
    const normalizedName = name.toLowerCase();
    const patternRules = this.getSortedPatternRules();

    for (const rule of patternRules) {
      const matchResult = this.checkRuleMatch(rule, name, normalizedName);
      if (matchResult) {
        return { rule };
      }
    }

    return null;
  }

  /**
   * Get pattern rules sorted by priority
   */
  private getSortedPatternRules(): CategorizationRule[] {
    return this.rules.rules
      .filter((rule) => rule.type === 'pattern')
      .sort((a, b) => {
        const priorityA = a.priority || 999;
        const priorityB = b.priority || 999;
        return priorityA - priorityB;
      });
  }

  /**
   * Check if a rule matches the given name
   */
  private checkRuleMatch(
    rule: CategorizationRule,
    name: string,
    normalizedName: string
  ): boolean {
    return (
      this.checkNameContains(rule, normalizedName) ||
      this.checkNameEndsWith(rule, normalizedName) ||
      this.checkNamePattern(rule, name)
    );
  }

  /**
   * Check nameContains patterns
   */
  private checkNameContains(
    rule: CategorizationRule,
    normalizedName: string
  ): boolean {
    if (!rule.condition.nameContains) {
      return false;
    }

    return rule.condition.nameContains.some((keyword) =>
      normalizedName.includes(keyword.toLowerCase())
    );
  }

  /**
   * Check nameEndsWith patterns
   */
  private checkNameEndsWith(
    rule: CategorizationRule,
    normalizedName: string
  ): boolean {
    if (!rule.condition.nameEndsWith) {
      return false;
    }

    return rule.condition.nameEndsWith.some((suffix) =>
      normalizedName.endsWith(suffix.toLowerCase())
    );
  }

  /**
   * Check namePattern (regex pattern)
   */
  private checkNamePattern(rule: CategorizationRule, name: string): boolean {
    if (!rule.condition.namePattern) {
      return false;
    }

    try {
      const regex = new RegExp(rule.condition.namePattern, 'i');
      return regex.test(name);
    } catch (error) {
      logger.warn(`Invalid regex pattern in rule ${rule.id}:`, error);
      return false;
    }
  }

  /**
   * Learn from human input and create/update rules
   */
  learnFromHumanInput(
    input: CategorizerInput,
    humanCategory: Category,
    ruleType: 'direct' | 'pattern' = 'direct'
  ): void {
    const now = Date.now();
    const ruleId = `human-${ruleType}-${now}`;

    // Create new rule based on human input
    const newRule: CategorizationRule = {
      id: ruleId,
      type: ruleType,
      condition: {},
      targetCategory: humanCategory,
      confidence: 'high',
      createdBy: 'human',
      createdAt: now,
      usageCount: 1,
    };

    if (ruleType === 'direct' && input.externalCategory) {
      newRule.condition.externalCategory = input.externalCategory;
    } else if (ruleType === 'pattern') {
      // Extract key words from product name for pattern creation
      const keywords = this.extractKeywords(input.name);
      if (keywords.length > 0) {
        newRule.condition.nameContains = keywords;
      }
    }

    // Add rule to collection
    this.rules.rules.push(newRule);
    this.rules.stats.humanLearnings++;

    logger.info(`Learned new rule from human input: ${ruleId}`, {
      input,
      category: humanCategory,
      rule: newRule,
    });

    this.saveRules();
  }

  /**
   * Extract keywords from product name for pattern creation
   */
  private extractKeywords(name: string): string[] {
    // Simple keyword extraction - can be enhanced with NLP
    const commonKeywords = [
      // Coffee
      '아메리카노',
      '라떼',
      '카푸치노',
      '에스프레소',
      '모카',
      '마키아또',
      '콜드브루',
      // Tea
      '차이',
      '얼그레이',
      '녹차',
      '홍차',
      '허브티',
      // Blended
      '프라푸치노',
      '블렌디드',
      '쉐이크',
      '프라페',
      // Smoothie
      '스무디',
      '요거트',
      // Juice
      '주스',
      '오렌지',
      '자몽',
      // Ade
      '에이드',
      '레모네이드',
    ];

    const foundKeywords = commonKeywords.filter((keyword) =>
      name.toLowerCase().includes(keyword.toLowerCase())
    );

    return foundKeywords.slice(0, 3); // Limit to 3 keywords
  }

  /**
   * Increment usage count for a rule
   */
  private incrementRuleUsage(ruleId: string): void {
    const rule = this.rules.rules.find((r) => r.id === ruleId);
    if (rule) {
      rule.usageCount++;
    }
  }

  /**
   * Update categorization statistics
   */
  private updateStats(confidence: 'high' | 'medium' | 'low'): void {
    this.rules.stats.totalCategorizations++;

    // Update average confidence (simplified calculation)
    const confidenceValues = { high: 3, medium: 2, low: 1 };
    const currentValue = confidenceValues[confidence];
    const total = this.rules.stats.totalCategorizations;
    const previousAvg = this.rules.stats.averageConfidence;

    this.rules.stats.averageConfidence =
      (previousAvg * (total - 1) + currentValue) / total;
  }

  /**
   * Get categorization statistics
   */
  getStats(): CategorizationRules['stats'] {
    return { ...this.rules.stats };
  }

  /**
   * Get all rules (for debugging/inspection)
   */
  getRules(): CategorizationRule[] {
    return [...this.rules.rules];
  }

  /**
   * Add a custom rule
   */
  addRule(
    rule: Omit<CategorizationRule, 'id' | 'createdAt' | 'usageCount'>
  ): string {
    const ruleId = `custom-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
    const newRule: CategorizationRule = {
      ...rule,
      id: ruleId,
      createdAt: Date.now(),
      usageCount: 0,
    };

    this.rules.rules.push(newRule);
    this.saveRules();

    logger.info(`Added custom rule: ${ruleId}`, newRule);
    return ruleId;
  }

  /**
   * Remove a rule by ID
   */
  removeRule(ruleId: string): boolean {
    const initialLength = this.rules.rules.length;
    this.rules.rules = this.rules.rules.filter((rule) => rule.id !== ruleId);

    if (this.rules.rules.length < initialLength) {
      this.saveRules();
      logger.info(`Removed rule: ${ruleId}`);
      return true;
    }

    return false;
  }

  /**
   * Test categorization without updating statistics
   */
  testCategorize(input: CategorizerInput): CategorizerResult {
    // Temporarily disable stats updates for testing
    const originalUpdateStats = this.updateStats;
    const originalIncrementUsage = this.incrementRuleUsage;

    this.updateStats = () => {
      // No-op for testing
    };
    this.incrementRuleUsage = () => {
      // No-op for testing
    };

    const result = this.categorize(input);

    // Restore original methods
    this.updateStats = originalUpdateStats;
    this.incrementRuleUsage = originalIncrementUsage;

    return result;
  }
}
