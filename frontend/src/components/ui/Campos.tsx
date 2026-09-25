import { forwardRef, type InputHTMLAttributes, type ReactNode, type TextareaHTMLAttributes } from "react";

import { cn } from "@/lib/cn";

const BASE =
  "w-full rounded-xl border border-linea bg-white px-3.5 text-sm text-texto placeholder:text-tenue/60 " +
  "transition-[border-color,box-shadow] duration-200 outline-none " +
  "focus:border-morado/60 focus:shadow-[0_0_0_4px_rgba(50,64,123,0.1)] disabled:opacity-60";

export const Entrada = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  function Entrada({ className, ...props }, ref) {
    return <input ref={ref} className={cn(BASE, "h-10", className)} {...props} />;
  },
);

export const AreaTexto = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(
  function AreaTexto({ className, ...props }, ref) {
    return <textarea ref={ref} className={cn(BASE, "min-h-24 resize-y py-2.5 leading-relaxed", className)} {...props} />;
  },
);

export function Campo({
  etiqueta,
  ayuda,
  children,
}: {
  etiqueta: string;
  ayuda?: ReactNode;
  children: ReactNode;
}) {
  return (
    <label className="block space-y-1.5">
      <span className="text-[0.78rem] font-semibold tracking-wide text-tenue uppercase">{etiqueta}</span>
      {children}
      {ayuda && <span className="block text-xs text-tenue/80">{ayuda}</span>}
    </label>
  );
}
