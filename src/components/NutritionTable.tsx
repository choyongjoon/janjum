import { dailyStandardNutritions, type Nutritions } from 'shared/nutritions';

const NutrationRow = ({
  label,
  value,
  percent,
  isLeftPadded,
}: {
  label: string;
  value: string;
  percent?: number | undefined;
  isLeftPadded?: boolean;
}) => {
  const trAdditionalClass = isLeftPadded ? 'ml-3' : '';

  return (
    <tr
      className={`flex border-collapse items-center justify-between border-black border-t-2 border-b-0 px-1.5 py-0.5 ${trAdditionalClass}`}
      style={{ height: '34px' }}
    >
      <span className="font-medium text-xl leading-none">
        {label}
        <span className="mx-1 font-light">{value}</span>
      </span>

      {percent !== undefined && (
        <span className="font-medium text-2xl leading-none">
          {percent}
          <span className="font-light text-base">%</span>
        </span>
      )}
    </tr>
  );
};

const calculatePercent = (
  value: number | undefined,
  total: number | undefined
) => {
  if (value === undefined || total === undefined) {
    return;
  }

  return Math.round((value / total) * 100);
};

export type NutritionItem = {
  key:
    | 'natrium'
    | 'carbohydrates'
    | 'sugar'
    | 'protein'
    | 'fat'
    | 'transFat'
    | 'saturatedFat'
    | 'cholesterol'
    | 'caffeine';
  name: string;
  dependency?: 'carbohydrates' | 'fat';
};

export const nutritionItems: NutritionItem[] = [
  { key: 'natrium', name: '나트륨' },
  { key: 'carbohydrates', name: '탄수화물' },
  { key: 'sugar', name: '당류', dependency: 'carbohydrates' },
  { key: 'protein', name: '단백질' },
  { key: 'fat', name: '지방' },
  { key: 'transFat', name: '트랜스지방', dependency: 'fat' },
  { key: 'saturatedFat', name: '포화지방', dependency: 'fat' },
  { key: 'cholesterol', name: '콜레스테롤' },
  { key: 'protein', name: '단백질' },
  { key: 'caffeine', name: '카페인' },
];

export const NutritionTable = ({ nutritions }: { nutritions: Nutritions }) => {
  return (
    <div className="max-w-3xs border-4 border-black bg-white">
      <table className="table">
        <thead>
          <tr>
            <th className="flex items-center justify-between bg-black p-2 text-3xl text-white">
              영양정보
              <span className="text-right text-sm">
                <div>
                  총 내용량 {nutritions.servingSize}
                  {nutritions.servingSizeUnit}
                </div>
                <div className="text-xl leading-none">
                  {nutritions.calories}
                  {nutritions.caloriesUnit}
                </div>
              </span>
            </th>
          </tr>
        </thead>
        <tbody>
          <tr className="flex items-center justify-between p-1 font-medium">
            총 내용량당
            <span className="text-right leading-none">
              <div>1일 영양성분</div>
              <div>기준치에 대한 비율</div>
            </span>
          </tr>
          {nutritionItems.map((item) => {
            if (nutritions[item.key] === undefined) {
              return null;
            }

            return (
              <NutrationRow
                isLeftPadded={
                  item.dependency && nutritions[item.dependency] !== undefined
                }
                key={item.key}
                label={item.name}
                percent={calculatePercent(
                  nutritions[item.key],
                  // @ts-expect-error
                  dailyStandardNutritions[item.key]
                )}
                value={`${nutritions[item.key]}${nutritions[`${item.key}Unit`]}`}
              />
            );
          })}
          <tr className="flex break-keep border-t-4 p-1 leading-none">
            <p className="font-light">
              <span className="font-medium text-sm">
                1일 영양성분 기준치에 대한 비율(%)
              </span>
              은 2,000kcal 기준이므로 개인의 필요 영양에 따라 다를 수 있습니다.
            </p>
          </tr>
        </tbody>
      </table>
    </div>
  );
};
