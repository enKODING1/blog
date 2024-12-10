interface SeparatorProps {
  style?: string;
}

export default function Separator({ style }: SeparatorProps) {
  return (
    <>
      <div
        className={`mt-2 mb-2 border border-solid border-inherit ${style}`}
      ></div>
    </>
  );
}
