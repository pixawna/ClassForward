import QRCode from "qrcode";
import { teacherEmail, failure } from "@/lib/classroom-http";
import { ownerRoom } from "@/lib/quiz/store";
export async function GET(
  r: Request,
  { params }: { params: Promise<{ code: string }> },
) {
  try {
    const code = (await params).code.toUpperCase();
    ownerRoom(await teacherEmail(r), code);
    const svg = await QRCode.toString(new URL(`/quiz/${code}`, r.url).href, {
      type: "svg",
    });
    return new Response(svg, {
      headers: { "Content-Type": "image/svg+xml", "Cache-Control": "no-store" },
    });
  } catch (e) {
    return failure(e);
  }
}
