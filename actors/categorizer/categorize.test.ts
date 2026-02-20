#!/usr/bin/env tsx

import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { logger } from 'shared/logger';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { ProductForCategorize } from './types';

describe('Categorizer', () => {
  const testDir = path.join(process.cwd(), 'test-temp');
  const testJsonPath = path.join(testDir, 'products-커피.json');

  beforeAll(() => {
    fs.mkdirSync(testDir, { recursive: true });
    // copy all files from test to test-temp
    fs.cpSync(
      path.join(process.cwd(), 'actors', 'categorizer', 'test'),
      testDir,
      { recursive: true }
    );
  });

  afterAll(() => {
    // Clean up test files
    if (fs.existsSync(testJsonPath)) {
      fs.unlinkSync(testJsonPath);
    }
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true, force: true });
    }
  });

  describe('', () => {
    const categories = [
      '커피',
      '차',
      '블렌디드',
      '스무디',
      '주스',
      '에이드',
      '아이스크림',
      '그 외',
    ];

    for (const category of categories) {
      it(`should categorize all products in products-${category}.json as ${category}`, () => {
        const filePath = path.join(testDir, `products-${category}.json`);

        // Check if file exists
        if (!fs.existsSync(filePath)) {
          logger.warn(`File not found: ${filePath}`);
          return;
        }

        // Run categorizer on the file

        execSync(
          `pnpm exec tsx actors/categorizer/categorize.ts --file "${filePath}" --verbose`,
          {
            cwd: process.cwd(),
            stdio: 'pipe',
          }
        );

        // Read the updated file
        const updatedProducts: ProductForCategorize[] = JSON.parse(
          fs.readFileSync(filePath, 'utf-8')
        );

        // For other categories, expect exact match
        for (const product of updatedProducts) {
          if (product.category !== category) {
            logger.error(
              `Product ${product.name} has incorrect category: ${product.category}`
            );
          }
          expect(product.category).toBe(category);
        }
      });
    }
  });
});
