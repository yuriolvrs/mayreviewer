import { QUESTION_TYPES } from "@/app/lib/questions";
import type { QuestionType } from "@/app/types";

// Turns one generation request into the exact prompts it will be sent as.
// Splitting lives here rather than in the route because the per-type mix only
// survives if the split is decided against the whole request at once.

// Timeline and Code arrive as whole problem sets, so their counts can't be
// divided arbitrarily the way a standalone question's can.
export const SET_TYPES: QuestionType[] = ["timeline", "code"];
const STANDALONE_TYPES = QUESTION_TYPES.filter((t) => !SET_TYPES.includes(t));

export const MIN_SET_SIZE = 5;
export const MAX_SET_SIZE = 10;

// One generateContent call reliably produces up to roughly 60 questions. Past
// that the model stops trying rather than erroring: asking a single call for
// 100 returned 10, for 200 returned 13. So a source's budget is split into
// several sequential calls and concatenated, which is what makes the
// Reviewer's count a real target instead of a number Gemini quietly ignores.
const MAX_QUESTIONS_PER_CALL = 40;

// One topic and how many of a chunk's questions should be about it.
export type TopicTarget = { topic: string; count: number };

// One Gemini call: how many questions it asks for, and — when the Reviewer
// stated a mix — exactly how many of each type. Those per-chunk counts are
// targets the prompt states verbatim, not shares to be rescaled again.
export type ChunkPlan = {
  count: number;
  typeCounts?: Record<QuestionType, number>;
  // Per-topic targets for this chunk. Empty when the Reviewer named no topics.
  topics?: TopicTarget[];
};

export function distributeCount(total: number, sourceCount: number): number[] {
  const base = Math.floor(total / sourceCount);
  const remainder = total % sourceCount;
  // If there are more sources than requested questions, every source still
  // gets at least 1 — the total may slightly exceed `total` in that case,
  // which is preferable to spending an API call to generate 0 questions.
  return Array.from({ length: sourceCount }, (_, i) => Math.max(base + (i < remainder ? 1 : 0), 1));
}

export function chunkCounts(count: number): number[] {
  const chunks = Math.ceil(count / MAX_QUESTIONS_PER_CALL);
  const base = Math.floor(count / chunks);
  const remainder = count % chunks;
  return Array.from({ length: chunks }, (_, i) => base + (i < remainder ? 1 : 0));
}

function zeroCounts(): Record<QuestionType, number> {
  return Object.fromEntries(QUESTION_TYPES.map((t) => [t, 0])) as Record<QuestionType, number>;
}

// Deals one chunk's budget across the Reviewer's topics, so the prompt can
// state a target per topic instead of listing all of them and leaving the
// model to pick. Handed the whole list at once, the model draws whatever the
// source material makes most salient — and salience doesn't change between
// regenerations, which is why the same topics kept coming back and others
// (Process Synchronization, allocation strategies) were never asked about.
//
// `rotation` shifts where the list starts. It decides which topics collect the
// remainder, and — when there is less budget than there are topics — which
// topics get a question at all, so successive regenerations lead with
// different ones instead of repeating the same emphasis.
export function dealTopics(topics: string[], budget: number, rotation: number): TopicTarget[] {
  if (topics.length === 0 || budget <= 0) return [];
  const start = ((rotation % topics.length) + topics.length) % topics.length;
  const rotated = [...topics.slice(start), ...topics.slice(0, start)];
  const base = Math.floor(budget / topics.length);
  const remainder = budget % topics.length;
  return rotated
    .map((topic, i) => ({ topic, count: base + (i < remainder ? 1 : 0) }))
    .filter((target) => target.count > 0);
}

// Plans every call one generation will make: the outer array is one entry per
// source, the inner one entry per chunk of that source.
//
// Without a stated mix each chunk just carries a total, as before. With one,
// the mix is dealt out across all the chunks at once instead of being rescaled
// into each of them separately. Rescaling is what broke Timeline and Code: a
// 10-question timeline target spread over two sources and two chunks each
// becomes "generate 2-3 timeline questions" per prompt, which cannot be met by
// a problem set (they run MIN_SET_SIZE-MAX_SET_SIZE questions), so the model
// returned no sets at all and the batch came back Identification/Scenario only.
//
// Each chunk also carries its own slice of the topic list, advanced by the
// chunk's position so two chunks of one generation don't lead with the same
// topic either.
export function planGeneration(
  total: number,
  sourceCount: number,
  byType?: Record<QuestionType, number>,
  topics: string[] = [],
  rotation = 0,
): ChunkPlan[][] {
  const shape = distributeCount(total, sourceCount).map(chunkCounts);
  let chunkIndex = 0;

  if (!byType) {
    return shape.map((counts) =>
      counts.map((count) => ({ count, topics: dealTopics(topics, count, rotation + chunkIndex++) })),
    );
  }

  const slots = shape.flat().map((room) => ({ room, counts: zeroCounts() }));
  const need = { ...byType };

  // Set types are placed first and in the largest lump that will fit, so a
  // type's whole target lands in as few prompts as possible — a prompt asking
  // for 10 timeline questions gets one or two real sets, where four prompts
  // asking for 2-3 each get none.
  for (const type of SET_TYPES) {
    while (need[type] > 0) {
      const slot = slots.reduce((best, s) => (s.room > best.room ? s : best));
      if (slot.room === 0) break;
      const lump = Math.min(need[type], slot.room);
      slot.counts[type] += lump;
      slot.room -= lump;
      need[type] -= lump;
    }
  }

  // Standalone types then fill whatever room is left, one at a time from
  // whichever type is furthest from its target, which keeps every chunk mixed
  // rather than making one chunk all Identification.
  for (const slot of slots) {
    while (slot.room > 0) {
      const type = STANDALONE_TYPES.filter((t) => need[t] > 0).sort((a, b) => need[b] - need[a])[0];
      if (!type) break;
      slot.counts[type]++;
      need[type]--;
      slot.room--;
    }
  }

  // A chunk's total is its allocation, not the room it was offered: sources are
  // floored at 1 question each, so the offered room can exceed what was asked
  // for, and a chunk that ends up with nothing is dropped rather than sent.
  let next = 0;
  return shape.map((counts) =>
    counts.map(() => {
      const { counts: typeCounts } = slots[next++];
      // Only the standalone questions are dealt across topics. A Timeline or
      // Code set's topic is fixed by what it is — a scheduling trace can't be
      // asked about Process Synchronization — so spreading a set's questions
      // over the topic list would just be an instruction it can't follow.
      const standalone = STANDALONE_TYPES.reduce((sum, t) => sum + typeCounts[t], 0);
      return {
        count: QUESTION_TYPES.reduce((sum, t) => sum + typeCounts[t], 0),
        typeCounts,
        topics: dealTopics(topics, standalone, rotation + chunkIndex++),
      };
    }),
  );
}
