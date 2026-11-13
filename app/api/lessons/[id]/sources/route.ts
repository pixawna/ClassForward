import { getLesson } from "@/lib/lessons";
import { defaultQuery, findSources, ScrapyError } from "@/lib/scrapy";
import { currentTeacher } from "@/lib/session";

/** Run a Scrapy source search for one lesson. Takes about 10 to 30 seconds. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const teacher = await currentTeacher(request.headers);
  if (!teacher) return Response.json({ error: "Sign in to search for sources." }, { status: 401 });

  const { id } = await params;
  const lesson = getLesson(teacher.email, id);
  if (!lesson) return Response.json({ error: "Lesson not found." }, { status: 404 });

  const body = (await request.json().catch(() => ({}))) as { query?: string };
  const query = body.query?.trim().slice(0, 300) || defaultQuery(lesson);

  try {
    return Response.json(await findSources(lesson, query));
  } catch (err) {
    if (err instanceof ScrapyError) return Response.json({ error: err.message }, { status: err.status });
    console.error("[sources] search failed", err);
    return Response.json({ error: "The source search failed. Try again in a moment." }, { status: 502 });
  }
}
