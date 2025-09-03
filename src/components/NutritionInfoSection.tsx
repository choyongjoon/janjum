import type { Nutritions } from '~/../../shared/nutritions';
import { NutritionDialogButton } from './NutritionDialogButton';
import { NutritionLevels } from './NutritionLevels';

export interface NutritionInfoSectionProps {
  nutritions?: Nutritions | null;
}

export function NutritionInfoSection({
  nutritions,
}: NutritionInfoSectionProps) {
  if (!nutritions) {
    return null;
  }

  return (
    <div className="max-w-3xs space-y-2">
      <div className="flex justify-between">
        <h4 className="font-medium text-base-content/80">영양 정보</h4>
        <NutritionDialogButton nutritions={nutritions} />
      </div>
      {/* Progress visualization */}
      <NutritionLevels nutritions={nutritions} />
    </div>
  );
}
