interface ChipProps {
  label: string;
}

export default function Chip({ label }: ChipProps) {
  return (
    <>
      <div className="flex items-center border border-inherit px-[8px] py-px rounded-2xl text-xs">
        <span>{label}</span>
      </div>
    </>
  );
}
