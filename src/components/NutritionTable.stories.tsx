import type { Meta, StoryObj } from '@storybook/react-vite';

import { NutritionTable } from './NutritionTable';

const meta = {
  component: NutritionTable,
} satisfies Meta<typeof NutritionTable>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Primary: Story = {
  args: {
    nutritions: {
      servingSize: 473,
      servingSizeUnit: 'ml',
      calories: 355,
      caloriesUnit: 'kcal',
      sugar: 35,
      sugarUnit: 'g',
      protein: 8,
      proteinUnit: 'g',
      saturatedFat: 5,
      saturatedFatUnit: 'g',
      natrium: 112,
      natriumUnit: 'mg',
      caffeine: 25,
      caffeineUnit: 'mg',
    },
  },
};

export const Secondary: Story = {
  args: {
    nutritions: {
      servingSize: 473,
      servingSizeUnit: 'ml',
      calories: 100,
      caloriesUnit: 'kcal',
      sugar: 23,
      sugarUnit: 'g',
      protein: 0,
      proteinUnit: 'g',
      saturatedFat: 0,
      saturatedFatUnit: 'g',
      natrium: 0,
      natriumUnit: 'mg',
      caffeine: 415,
      caffeineUnit: 'mg',
    },
  },
};
