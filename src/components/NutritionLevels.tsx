import type { Nutritions } from '~/../../shared/nutritions';
import { getNutritionLevelMap } from '~/utils/nutritionLevel';

export interface NutritionLevelsProps {
  nutritions?: Nutritions | null;
}

// Convert nutrition level to progress percentage
function levelTextToProgressValue(levelText: string): number {
  switch (levelText) {
    case '거의 없음':
      return 10;
    case '적음':
      return 35;
    case '보통':
      return 65;
    case '많음':
      return 90;
    default:
      return 0;
  }
}

export function NutritionLevels({ nutritions }: NutritionLevelsProps) {
  if (!nutritions) {
    return null;
  }

  const nutritionLevelMap = getNutritionLevelMap(nutritions);

  const nutritionItems = [
    {
      key: 'calories',
      label: '칼로리',
      level: nutritionLevelMap.calories,
    },
    {
      key: 'carbohydrates',
      label: '탄수화물',
      level: nutritionLevelMap.carbohydrates,
    },
    { key: 'sugar', label: '당류', level: nutritionLevelMap.sugar },
    {
      key: 'saturatedFat',
      label: '포화지방',
      level: nutritionLevelMap.saturatedFat,
    },
    {
      key: 'caffeine',
      label: '카페인',
      level: nutritionLevelMap.caffeine,
    },
  ];

  return (
    <div className="space-y-2">
      {nutritionItems.map(({ key, label, level }) => {
        const progressValue = levelTextToProgressValue(level.text);
        const progressColorClass = `progress-${level.color}`;

        return (
          <div className="flex items-center gap-2 text-sm" key={key}>
            <div className="w-16 shrink-0 text-right text-base-content/70">
              {label}
            </div>
            <progress
              className={` progress progress-sm flex-1 ${progressColorClass}`}
              max="100"
              value={progressValue}
            />
            <div className="w-16 shrink-0 text-base-content/60">
              {level.text}
            </div>
          </div>
        );
      })}
    </div>
  );
}
