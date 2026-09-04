import { makeStore, uid } from "@/lib/store";

/**
 * The syllabus: what there is to learn, and how far through it you are.
 *
 * Stored flat, with a parent on each row, rather than as nested children. A
 * tree of objects has to be rebuilt from the root down for every rename and
 * every status change, and moving a branch means splicing two arrays that are
 * several levels apart. A flat list makes all of that a single row edit, and
 * the tree is derived when it is drawn, which is the only place it is needed.
 *
 * Depth is not fixed. Subject, unit, chapter and topic is the shape most
 * courses have, but a language syllabus is two deep and a medical one is five,
 * so nothing here counts levels.
 */
export type Status = "todo" | "learning" | "revising" | "mastered";

export type Topic = {
  id: string;
  parentId: string | null;
  name: string;
  status: Status;
  /** Newest first within a parent, by insertion; this keeps a stable order. */
  at: number;
};

/** In the order they are worked through, which is the order the button cycles. */
export const STATUSES: Status[] = ["todo", "learning", "revising", "mastered"];

/** How much of a topic each status counts as done. Revision is most of the way
 *  there and worth saying so: a progress bar that only moves at the very end
 *  tells you nothing for most of the term. */
export const WEIGHT: Record<Status, number> = {
  todo: 0,
  learning: 0.35,
  revising: 0.75,
  mastered: 1,
};

export const topics = makeStore<Topic[]>("bonk.syllabus", [], (raw) =>
  (Array.isArray(raw) ? raw : []).map((r) => {
    const t = r as Partial<Topic>;
    return {
      id: String(t.id ?? uid()),
      parentId: t.parentId ?? null,
      name: String(t.name ?? ""),
      status: STATUSES.includes(t.status as Status) ? (t.status as Status) : "todo",
      at: Number(t.at) || 0,
    };
  }),
);

export const childrenOf = (list: Topic[], parentId: string | null) =>
  list.filter((t) => t.parentId === parentId).sort((a, b) => a.at - b.at);

/**
 * Every id at or under one, itself included.
 *
 * Walks by generation rather than by recursion so that a row whose parent has
 * been deleted, or a pair of rows that somehow point at each other, cannot
 * spin forever. Seen ids are never queued twice.
 */
export function subtree(list: Topic[], rootId: string): string[] {
  const kids = new Map<string | null, string[]>();
  for (const t of list) kids.set(t.parentId, [...(kids.get(t.parentId) ?? []), t.id]);

  const out: string[] = [];
  const seen = new Set<string>([rootId]);
  let edge = [rootId];
  while (edge.length) {
    out.push(...edge);
    const next: string[] = [];
    for (const id of edge)
      for (const kid of kids.get(id) ?? [])
        if (!seen.has(kid)) {
          seen.add(kid);
          next.push(kid);
        }
    edge = next;
  }
  return out;
}

/**
 * How far through a topic and everything under it, from 0 to 1.
 *
 * Only the leaves count. A chapter is not a fifth thing to learn beside its
 * four topics, it is those four topics, so scoring it as well would let a
 * parent marked mastered outvote the children that say otherwise. A leaf
 * scores its own status.
 */
export function progress(list: Topic[], rootId: string): number {
  const by = new Map(list.map((t) => [t.id, t]));
  const hasKids = new Set(list.map((t) => t.parentId).filter(Boolean) as string[]);
  const leaves = subtree(list, rootId).filter((id) => !hasKids.has(id));
  if (!leaves.length) return 0;
  let sum = 0;
  for (const id of leaves) sum += WEIGHT[by.get(id)?.status ?? "todo"];
  return sum / leaves.length;
}

/**
 * What a branch's own label should say.
 *
 * A parent keeps a stored status, because setting one is how you set the whole
 * branch, but that stored value is not what the branch is: a chapter whose
 * topics are half revised still said "not started" beside a bar reading sixty
 * per cent. What a branch is, is what is under it, so the label is read back
 * out of the progress rather than out of the row.
 */
export function derive(done: number): Status {
  if (done >= 1) return "mastered";
  if (done >= WEIGHT.revising) return "revising";
  if (done > 0) return "learning";
  return "todo";
}

/** The counts behind the bar, for the line that reads "3 of 12 mastered". */
export function tally(list: Topic[], rootId: string) {
  const by = new Map(list.map((t) => [t.id, t]));
  const hasKids = new Set(list.map((t) => t.parentId).filter(Boolean) as string[]);
  const leaves = subtree(list, rootId).filter((id) => !hasKids.has(id));
  const out: Record<Status, number> = { todo: 0, learning: 0, revising: 0, mastered: 0 };
  for (const id of leaves) out[by.get(id)?.status ?? "todo"]++;
  return { ...out, total: leaves.length };
}

export function add(parentId: string | null, name: string): Topic {
  const row: Topic = { id: uid(), parentId, name: name.trim(), status: "todo", at: Date.now() };
  topics.set([...topics.get(), row]);
  return row;
}

export const rename = (id: string, name: string) =>
  topics.set(topics.get().map((t) => (t.id === id ? { ...t, name: name.trim() } : t)));

/**
 * Setting a parent sets everything under it.
 *
 * Ticking a chapter off and leaving its topics saying "not started" is a lie
 * the next screen then has to reconcile, so the branch moves together.
 */
export function setStatus(id: string, status: Status) {
  const list = topics.get();
  const ids = new Set(subtree(list, id));
  topics.set(list.map((t) => (ids.has(t.id) ? { ...t, status } : t)));
}

/** Cycles to do, learning, revising, mastered, and back to the start. */
export const nextStatus = (s: Status): Status =>
  STATUSES[(STATUSES.indexOf(s) + 1) % STATUSES.length];

/** A branch goes with its root. An orphaned row is invisible but still counted,
 *  which is how a syllabus ends up stuck at 80 per cent with nothing left in it. */
export function remove(id: string) {
  const list = topics.get();
  const ids = new Set(subtree(list, id));
  topics.set(list.filter((t) => !ids.has(t.id)));
}

/** The subjects, which are the rows with no parent. */
export const subjects = (list: Topic[]) => childrenOf(list, null);

/**
 * The whole tree flattened into reading order, each row carrying how deep it
 * sits.
 *
 * For the places that need a list rather than a tree: the topic picker on the
 * timer and the time-per-topic table. Depth comes back with the row because a
 * flat list of bare names is ambiguous the moment two units share a chapter
 * name, which they routinely do.
 *
 * Like `subtree`, it walks with an explicit stack and a seen set, so an
 * orphaned or self-referencing row cannot hang the app.
 */
export function outline(list: Topic[]): { id: string; name: string; depth: number }[] {
  const out: { id: string; name: string; depth: number }[] = [];
  const seen = new Set<string>();
  const stack = subjects(list)
    .map((t) => ({ t, depth: 0 }))
    .reverse();

  while (stack.length) {
    const { t, depth } = stack.pop()!;
    if (seen.has(t.id)) continue;
    seen.add(t.id);
    out.push({ id: t.id, name: t.name, depth });
    for (const k of childrenOf(list, t.id).reverse()) stack.push({ t: k, depth: depth + 1 });
  }
  return out;
}
