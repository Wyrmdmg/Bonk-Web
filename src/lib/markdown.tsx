import type { ReactNode } from "react";

// A very small markdown renderer: headings, lists, checkboxes, quotes, rules,
// fenced code, and inline bold/italic/code/links.
//
// Written rather than installed because it is sixty lines against a dependency,
// and because it renders to React nodes instead of an HTML string, there is no
// dangerouslySetInnerHTML anywhere in here, so a note that contains markup is
// text, not markup, whoever typed it.

/** Inline spans. Ordered so code wins over emphasis inside it. */
function inline(text: string, keyBase: string): ReactNode[] {
  const out: ReactNode[] = [];
  const re = /(`[^`]+`)|(\*\*[^*]+\*\*)|(\*[^*]+\*)|(~~[^~]+~~)|(\[[^\]]+\]\([^)\s]+\))/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let n = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const tok = m[0];
    const k = `${keyBase}i${n++}`;
    if (tok.startsWith("`")) out.push(<code key={k}>{tok.slice(1, -1)}</code>);
    else if (tok.startsWith("**")) out.push(<strong key={k}>{tok.slice(2, -2)}</strong>);
    else if (tok.startsWith("~~")) out.push(<s key={k}>{tok.slice(2, -2)}</s>);
    else if (tok.startsWith("*")) out.push(<em key={k}>{tok.slice(1, -1)}</em>);
    else {
      const cut = tok.indexOf("](");
      const label = tok.slice(1, cut);
      const href = tok.slice(cut + 2, -1);
      // Only http(s) becomes a link; anything else stays as the text someone
      // typed, so a note can never smuggle in a javascript: URL.
      out.push(
        /^https?:\/\//i.test(href) ? (
          <a key={k} href={href} target="_blank" rel="noopener noreferrer">
            {label}
          </a>
        ) : (
          tok
        ),
      );
    }
    last = m.index + tok.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

export function Markdown({ text, onToggle }: { text: string; onToggle?: (line: number) => void }) {
  const lines = text.split("\n");
  const out: ReactNode[] = [];
  let list: ReactNode[] = [];
  let listKind: "ul" | "ol" | null = null;

  const flush = () => {
    if (!list.length) return;
    out.push(
      listKind === "ol" ? (
        <ol key={`l${out.length}`}>{list}</ol>
      ) : (
        <ul key={`l${out.length}`}>{list}</ul>
      ),
    );
    list = [];
    listKind = null;
  };

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    const k = `b${i}`;

    const fence = raw.trimEnd() === "```" || raw.startsWith("```");
    if (fence) {
      flush();
      const body: string[] = [];
      i++;
      while (i < lines.length && !lines[i].startsWith("```")) body.push(lines[i++]);
      out.push(
        <pre key={k}>
          <code>{body.join("\n")}</code>
        </pre>,
      );
      continue;
    }

    const task = /^\s*[-*]\s+\[( |x|X)\]\s+(.*)$/.exec(raw);
    if (task) {
      const done = task[1].toLowerCase() === "x";
      const line = i;
      list.push(
        <li key={k} className={`md-task ${done ? "is-done" : ""}`}>
          <button
            type="button"
            className="md-box"
            aria-pressed={done}
            onClick={() => onToggle?.(line)}
            disabled={!onToggle}
          >
            {done ? "✓" : ""}
          </button>
          <span>{inline(task[2], k)}</span>
        </li>,
      );
      listKind = listKind ?? "ul";
      continue;
    }

    const bullet = /^\s*[-*]\s+(.*)$/.exec(raw);
    if (bullet) {
      list.push(<li key={k}>{inline(bullet[1], k)}</li>);
      listKind = listKind ?? "ul";
      continue;
    }

    const num = /^\s*\d+[.)]\s+(.*)$/.exec(raw);
    if (num) {
      list.push(<li key={k}>{inline(num[1], k)}</li>);
      listKind = listKind ?? "ol";
      continue;
    }

    flush();

    const head = /^(#{1,4})\s+(.*)$/.exec(raw);
    if (head) {
      const level = head[1].length;
      const body = inline(head[2], k);
      out.push(
        level === 1 ? (
          <h1 key={k}>{body}</h1>
        ) : level === 2 ? (
          <h2 key={k}>{body}</h2>
        ) : level === 3 ? (
          <h3 key={k}>{body}</h3>
        ) : (
          <h4 key={k}>{body}</h4>
        ),
      );
      continue;
    }

    if (/^\s*(---|\*\*\*|___)\s*$/.test(raw)) {
      out.push(<hr key={k} />);
      continue;
    }

    const quote = /^\s*>\s?(.*)$/.exec(raw);
    if (quote) {
      out.push(<blockquote key={k}>{inline(quote[1], k)}</blockquote>);
      continue;
    }

    if (raw.trim() === "") continue;
    out.push(<p key={k}>{inline(raw, k)}</p>);
  }
  flush();

  return <div className="md">{out}</div>;
}

/** Flip the checkbox on one line of the source, for the rendered view. */
export function toggleTask(text: string, line: number): string {
  const lines = text.split("\n");
  const m = /^(\s*[-*]\s+\[)( |x|X)(\]\s+.*)$/.exec(lines[line] ?? "");
  if (!m) return text;
  lines[line] = m[1] + (m[2] === " " ? "x" : " ") + m[3];
  return lines.join("\n");
}

/** First non-empty line, stripped of markdown, for a list row. */
export function docTitle(text: string, fallback: string): string {
  const first = text.split("\n").find((l) => l.trim());
  if (!first) return fallback;
  return (
    first
      .replace(/^#{1,4}\s+/, "")
      .replace(/[*`~>[\]]/g, "")
      .trim() || fallback
  );
}
