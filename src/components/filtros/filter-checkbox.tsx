import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";

/**
 * Item padrão de filtro do MARIELA BACKOFFICE: checkbox + label + contagem.
 * A contagem fica à direita, discreta, na cor da identidade (roxo/lilás).
 */
export function FilterCheckbox({
  id,
  label,
  count,
  checked,
  disabled = false,
  onCheckedChange,
}: {
  id: string;
  label: string;
  count: number;
  checked: boolean;
  disabled?: boolean;
  onCheckedChange: () => void;
}) {
  return (
    <label
      htmlFor={id}
      aria-disabled={disabled}
      className={cn(
        "group flex cursor-pointer items-center gap-2.5 rounded-lg px-2 py-1.5 transition-colors",
        "hover:bg-primary-soft/50",
        checked && "bg-primary-soft/60",
        disabled && "cursor-not-allowed opacity-45 hover:bg-transparent",
      )}
    >
      <Checkbox
        id={id}
        checked={checked}
        disabled={disabled}
        onCheckedChange={() => onCheckedChange()}
      />
      <span
        className={cn(
          "min-w-0 flex-1 truncate text-sm text-foreground/85",
          checked && "font-medium text-foreground",
        )}
      >
        {label}
      </span>
      <span
        aria-hidden
        className={cn("shrink-0 text-xs tabular-nums text-primary/70", checked && "text-primary")}
      >
        ({count})
      </span>
      <span className="sr-only">{count} registro(s)</span>
    </label>
  );
}
