// Audience questions, persisted to `questions.json` next to the deck.

import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { isRecord, type Question } from "../shared/protocol.ts";

export const QUESTION_TEXT_LIMIT = 500;

interface StoredQuestion extends Question {
  voters: string[];
}

interface QuestionsFile {
  version: 1;
  questions: StoredQuestion[];
}

function normalize(value: unknown): StoredQuestion | null {
  if (!isRecord(value) || typeof value.id !== "string" || typeof value.text !== "string") {
    return null;
  }
  const text = value.text.trim();
  if (!text) {
    return null;
  }
  const now = new Date().toISOString();
  const createdAt = typeof value.createdAt === "string" ? value.createdAt : now;
  const voters = Array.isArray(value.voters)
    ? value.voters.filter((voter): voter is string => typeof voter === "string")
    : [];
  return {
    id: value.id,
    text,
    votes: Math.max(0, Math.floor(Number(value.votes) || 0), voters.length),
    voters,
    answered: value.answered === true,
    createdAt,
    updatedAt: typeof value.updatedAt === "string" ? value.updatedAt : createdAt,
  };
}

function toPublic(question: StoredQuestion, voter?: string | null): Question {
  const { voters, ...rest } = question;
  return voter ? { ...rest, voted: voters.includes(voter) } : rest;
}

export class QuestionStore {
  private readonly filePath: string;
  private queue: Promise<unknown> = Promise.resolve();

  constructor(rootDir: string) {
    this.filePath = path.join(rootDir, "questions.json");
  }

  private async read(): Promise<QuestionsFile> {
    try {
      const parsed: unknown = JSON.parse(await fs.readFile(this.filePath, "utf8"));
      const list = isRecord(parsed) && Array.isArray(parsed.questions) ? parsed.questions : [];
      return { version: 1, questions: list.map(normalize).filter((entry) => entry !== null) };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        return { version: 1, questions: [] };
      }
      throw error;
    }
  }

  private async write(data: QuestionsFile): Promise<void> {
    const tempPath = `${this.filePath}.${randomUUID()}.tmp`;
    await fs.writeFile(tempPath, `${JSON.stringify(data, null, 2)}\n`, "utf8");
    await fs.rename(tempPath, this.filePath);
  }

  /** Runs read-modify-write cycles one at a time. */
  private update<T>(action: (data: QuestionsFile) => T): Promise<{ result: T; questions: Question[] }> {
    const run = this.queue.then(async () => {
      const data = await this.read();
      const result = action(data);
      await this.write(data);
      return { result, questions: data.questions.map((question) => toPublic(question)) };
    });
    this.queue = run.catch(() => undefined);
    return run;
  }

  async list(voter?: string | null): Promise<Question[]> {
    await this.queue;
    return (await this.read()).questions.map((question) => toPublic(question, voter));
  }

  add(text: string) {
    return this.update((data) => {
      const now = new Date().toISOString();
      const question: StoredQuestion = {
        id: randomUUID(),
        text,
        votes: 0,
        voters: [],
        answered: false,
        createdAt: now,
        updatedAt: now,
      };
      data.questions.push(question);
      return toPublic(question);
    });
  }

  vote(id: string, voter: string) {
    return this.update((data) => {
      const question = data.questions.find((entry) => entry.id === id);
      if (!question) {
        return null;
      }
      const voted = !question.answered && !question.voters.includes(voter);
      if (voted) {
        question.voters.push(voter);
        question.votes += 1;
        question.updatedAt = new Date().toISOString();
      }
      return { voted, question: toPublic(question, voter) };
    });
  }

  setAnswered(id: string, answered: boolean) {
    return this.update((data) => {
      const question = data.questions.find((entry) => entry.id === id);
      if (!question) {
        return null;
      }
      question.answered = answered;
      question.updatedAt = new Date().toISOString();
      return toPublic(question);
    });
  }

  remove(id: string) {
    return this.update((data) => {
      const index = data.questions.findIndex((entry) => entry.id === id);
      return index === -1 ? false : (data.questions.splice(index, 1), true);
    });
  }
}
