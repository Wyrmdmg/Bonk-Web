import { getUserTag } from "@/lib/user-tags";

export function UserTag({
  username,
  className = "",
}: {
  username?: string | null;
  className?: string;
}) {
  const tag = getUserTag(username);
  if (!tag) return null;
  return (
    <span
      title={tag.title}
      className={`inline-flex items-center border-2 border-[var(--ink)] px-1.5 py-0.5 font-pixel text-[8px] uppercase tracking-[0.14em] ${tag.className} ${className}`}
    >
      {tag.label}
    </span>
  );
}
