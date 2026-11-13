export type Question = {
  id: string;
  type: "choice" | "short";
  prompt: string;
  objective: number;
  options: string[];
  answer: string;
  explanation: string;
  rubric: string;
  misconception: string;
  followUp: string;
};
export type Quiz = {
  title: string;
  questions: Question[];
  objectives?: string[];
};
export type Evaluation = {
  category: "correct" | "partial" | "misconception" | "unclear";
  confidence: number | null;
  review: boolean;
  points: number;
  reason: string;
  model?: string;
};
export type Room = {
  code: string;
  lesson_id: string;
  owner: string;
  quiz: string;
  phase: "lobby" | "question" | "revealed" | "finished";
  position: number;
  follow_up: string | null;
};
