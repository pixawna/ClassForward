import Image from "next/image";
import type { Session } from "@/lib/auth";

/** Round profile photo, or the first initial when Google has no photo. */
export function Avatar({ user, size = 32 }: { user: Session["user"]; size?: number }) {
  if (user.image) {
    return (
      <Image
        src={user.image}
        alt=""
        width={size}
        height={size}
        className="rounded-full border-2 border-ink"
        style={{ width: size, height: size }}
      />
    );
  }
  return (
    <span
      aria-hidden="true"
      className="grid place-items-center rounded-full border-2 border-ink bg-[#F6D77A] font-semibold text-ink"
      style={{ width: size, height: size }}
    >
      {(user.name || user.email).charAt(0).toUpperCase()}
    </span>
  );
}
