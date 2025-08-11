/**
 * Unit tests for PricerUtils utility functions
 * Tests price parsing and product name normalization
 */

import { describe, expect, it } from 'vitest';
import { PricerUtils } from './pricerUtils';

describe('PricerUtils', () => {
  describe('parsePrice', () => {
    it('should parse Korean won prices with commas', () => {
      expect(PricerUtils.parsePrice('4,500원')).toBe(4500);
      expect(PricerUtils.parsePrice('2,800 원')).toBe(2800);
      expect(PricerUtils.parsePrice('5,200원')).toBe(5200);
    });

    it('should parse plain numbers', () => {
      expect(PricerUtils.parsePrice('3000')).toBe(3000);
    });

    it('should return null for invalid inputs', () => {
      expect(PricerUtils.parsePrice('invalid')).toBeNull();
      expect(PricerUtils.parsePrice('')).toBeNull();
    });

    it('should handle edge cases', () => {
      expect(PricerUtils.parsePrice('0원')).toBe(0);
      expect(PricerUtils.parsePrice('1,234,567원')).toBe(1_234_567);
    });
  });

  describe('normalizeProductName', () => {
    it('should trim whitespace', () => {
      expect(PricerUtils.normalizeProductName('  아메리카노  ')).toBe(
        '아메리카노'
      );
    });

    it('should normalize multiple spaces', () => {
      expect(PricerUtils.normalizeProductName('Iced   Coffee')).toBe(
        'Iced Coffee'
      );
    });

    it('should remove special characters but keep Korean and alphanumeric', () => {
      expect(PricerUtils.normalizeProductName('카페라떼!@#')).toBe('카페라떼');
      expect(PricerUtils.normalizeProductName('Vanilla Latte★')).toBe(
        'Vanilla Latte'
      );
    });

    it('should handle mixed Korean and English', () => {
      expect(PricerUtils.normalizeProductName('스타벅스 Americano')).toBe(
        '스타벅스 Americano'
      );
    });

    it('should handle empty strings', () => {
      expect(PricerUtils.normalizeProductName('')).toBe('');
      expect(PricerUtils.normalizeProductName('   ')).toBe('');
    });

    it('should preserve numbers', () => {
      expect(PricerUtils.normalizeProductName('카페라떼 500ml')).toBe(
        '카페라떼 500ml'
      );
    });
  });
});
