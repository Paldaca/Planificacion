import type { LucideIcon } from "lucide-react";
import { DropdownMenu } from "radix-ui";
import type { ReactNode } from "react";

import { cn } from "@/lib/cn";

export function Menu({
  disparador,
  children,
  alinear = "end",
}: {
  disparador: ReactNode;
  children: ReactNode;
  alinear?: "start" | "end";
}) {
  return (
    <DropdownMenu.Root modal={false}>
      <DropdownMenu.Trigger asChild>{disparador}</DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align={alinear}
          sideOffset={6}
          className="flotante z-50 min-w-48 rounded-xl border border-linea bg-white p-1.5 shadow-[0_18px_38px_-18px_rgba(20,22,68,0.4)]"
        >
          {children}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

export function ItemMenu({
  icono: Icono,
  children,
  onSelect,
  peligro,
  deshabilitado,
}: {
  icono?: LucideIcon;
  children: ReactNode;
  onSelect: () => void;
  peligro?: boolean;
  deshabilitado?: boolean;
}) {
  return (
    <DropdownMenu.Item
      disabled={deshabilitado}
      onSelect={onSelect}
      className={cn(
        "flex cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm outline-none select-none",
        "transition-colors data-[disabled]:pointer-events-none data-[disabled]:opacity-40",
        peligro
          ? "text-[#dc2626] data-[highlighted]:bg-[#fef2f2]"
          : "text-texto data-[highlighted]:bg-morado/8 data-[highlighted]:text-morado",
      )}
    >
      {Icono && <Icono className="size-4 shrink-0" />}
      {children}
    </DropdownMenu.Item>
  );
}

export function SeparadorMenu() {
  return <DropdownMenu.Separator className="my-1 h-px bg-linea/70" />;
}
