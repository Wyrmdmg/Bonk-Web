import { Toaster as Sonner } from "sonner";
import { TASKBAR_H } from "@/lib/windows";

type ToasterProps = React.ComponentProps<typeof Sonner>;

// Toasts fire on every screen (sign-in, +XP, purchases), so they carry the
// design system too: hard 2px border, offset shadow, zero radius, zero blur.
//
// They rise from the notification area, above the taskbar, because that is
// where this machine has always put them, and because top-right landed them
// straight on top of a window's caption and its close button.
const Toaster = ({ ...props }: ToasterProps) => {
  return (
    <Sonner
      position="bottom-right"
      offset={TASKBAR_H + 12}
      className="toaster group"
      toastOptions={{
        unstyled: true,
        classNames: {
          toast:
            "wd-toast flex w-full items-start gap-3 border-2 border-[var(--ink)] bg-[var(--bone)] p-3 pt-2 font-mono text-[13px] text-[var(--ink)] shadow-[4px_4px_0_var(--ink)]",
          title: "font-mono text-[13px] font-bold leading-snug",
          description: "mt-0.5 font-mono text-[11px] text-[var(--ink-soft)]",
          icon: "shrink-0",
          actionButton:
            "ml-auto shrink-0 border-2 border-[var(--ink)] bg-[var(--ink)] px-2 py-1 font-mono text-[10px] uppercase tracking-[0.14em] text-[var(--bone)]",
          cancelButton:
            "ml-auto shrink-0 border-2 border-[var(--ink)] px-2 py-1 font-mono text-[10px] uppercase tracking-[0.14em]",
          closeButton: "border-2 border-[var(--ink)] bg-[var(--bone)] text-[var(--ink)]",
          success: "border-l-[6px] border-l-[var(--moss)]",
          error: "border-l-[6px] border-l-[var(--flame)]",
          warning: "border-l-[6px] border-l-[var(--flame)]",
          info: "border-l-[6px] border-l-[var(--olive)]",
        },
      }}
      {...props}
    />
  );
};

export { Toaster };
