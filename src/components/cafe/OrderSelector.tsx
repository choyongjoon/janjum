const orderOptions = [
  { value: 'latest', label: '최신순' },
  { value: 'most-reviews', label: '후기 많은순' },
  { value: 'highest-rating', label: '높은 평점순' },
] as const;

export type OrderOption = (typeof orderOptions)[number]['value'];

interface OrderSelectorProps {
  value: OrderOption;
  onChange: (value: OrderOption) => void;
}

export function OrderSelector({ value, onChange }: OrderSelectorProps) {
  return (
    <select
      className="select select-bordered w-auto shrink-0"
      onChange={(e) => onChange(e.target.value as OrderOption)}
      value={value}
    >
      {orderOptions.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  );
}
