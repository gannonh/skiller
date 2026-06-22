import { Sorting01Icon, SortingDownIcon, SortingUpIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Button } from "@workspace/ui/components/button";
import { TableHead } from "@workspace/ui/components/table";

export function SortableTableHead<T extends string>({
  column,
  activeColumn,
  direction,
  onSort,
  children
}: {
  column: T;
  activeColumn: T;
  direction: "asc" | "desc";
  onSort: (column: T) => void;
  children: string;
}) {
  const active = column === activeColumn;
  const icon = !active ? Sorting01Icon : direction === "asc" ? SortingUpIcon : SortingDownIcon;

  return (
    <TableHead aria-sort={active ? (direction === "asc" ? "ascending" : "descending") : "none"}>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="-ml-2 h-8 px-2"
        aria-label={`Sort by ${children}`}
        onClick={() => onSort(column)}
      >
        {children}
        <HugeiconsIcon icon={icon} strokeWidth={2} data-icon="inline-end" />
      </Button>
    </TableHead>
  );
}
