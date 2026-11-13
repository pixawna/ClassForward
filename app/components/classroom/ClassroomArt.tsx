/*
 * Hand-drawn classroom, drawn twice: once the old way, once with ClassForward.
 * Both eras share one layout so the eraser can wipe from one into the other
 * and every desk, kid and the teacher line up exactly.
 *
 * viewBox is 2400 x 460. The story happens in the middle 1600 units
 * (wrapped in translate(400 0)); the outer walls only fill wide screens.
 */

export type Era = "old" | "new";

const INK = "#1F2A44";
const CHALK = "#EEEBE2";
const CHALK_YELLOW = "#F6D77A";
const CHALK_BLUE = "#9CCDEB";
const CHALK_GREEN = "#A9D8A0";
const RED = "#D93A2B";
const FLOOR_Y = 372;

const line = {
  stroke: INK,
  strokeWidth: 3,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

const hand = { fontFamily: "var(--font-hand)" };

/* ---------- small building blocks ---------- */

function Limb({ d, color, width = 12 }: { d: string; color: string; width?: number }) {
  return (
    <g fill="none" strokeLinecap="round" strokeLinejoin="round">
      <path d={d} stroke={INK} strokeWidth={width + 6} />
      <path d={d} stroke={color} strokeWidth={width} />
    </g>
  );
}

function Palm({ x, y, skin, r = 7 }: { x: number; y: number; skin: string; r?: number }) {
  return <circle cx={x} cy={y} r={r} fill={skin} {...line} strokeWidth={2.5} />;
}

function Bubble({
  x,
  y,
  w,
  text,
  tailX,
}: {
  x: number;
  y: number;
  w: number;
  text: string;
  tailX: number;
}) {
  return (
    <g>
      <rect x={x} y={y} width={w} height={46} rx={23} fill="#FFFDF8" {...line} />
      <path
        d={`M${tailX} ${y + 42} L${tailX - 12} ${y + 66} L${tailX + 20} ${y + 42}`}
        fill="#FFFDF8"
        {...line}
      />
      <rect x={tailX - 1} y={y + 40} width={22} height={5} fill="#FFFDF8" />
      <text x={x + w / 2} y={y + 31} textAnchor="middle" fontSize={23} fill={INK} style={hand}>
        {text}
      </text>
    </g>
  );
}

function Note({
  x,
  y,
  children,
  color = RED,
  size = 24,
  rotate = -6,
  className,
}: {
  x: number;
  y: number;
  children: string;
  color?: string;
  size?: number;
  rotate?: number;
  className?: string;
}) {
  return (
    <text
      x={x}
      y={y}
      fontSize={size}
      fill={color}
      style={hand}
      transform={`rotate(${rotate} ${x} ${y})`}
      className={className}
    >
      {children}
    </text>
  );
}

function Sparkle({ x, y, s = 1 }: { x: number; y: number; s?: number }) {
  return (
    <path
      transform={`translate(${x} ${y}) scale(${s})`}
      d="M0 -10 Q2 -2 10 0 Q2 2 0 10 Q-2 2 -10 0 Q-2 -2 0 -10 Z"
      fill="#F2B33D"
      stroke={INK}
      strokeWidth={2}
      strokeLinejoin="round"
    />
  );
}

/* ---------- the room ---------- */

function Floor() {
  const planks = Array.from({ length: 16 }, (_, i) => i * 160 + (i % 2 ? 40 : 0));
  return (
    <g>
      <rect x={0} y={FLOOR_Y - 12} width={2400} height={12} fill="#E6DCC8" />
      <line x1={0} x2={2400} y1={FLOOR_Y - 12} y2={FLOOR_Y - 12} {...line} strokeWidth={2} />
      <rect x={0} y={FLOOR_Y} width={2400} height={88} fill="#E2CBA3" />
      <line x1={0} x2={2400} y1={FLOOR_Y + 30} y2={FLOOR_Y + 30} stroke="#C9AE80" strokeWidth={2} />
      <line x1={0} x2={2400} y1={FLOOR_Y + 62} y2={FLOOR_Y + 62} stroke="#C9AE80" strokeWidth={2} />
      {planks.map((px, i) => (
        <g key={px} stroke="#C9AE80" strokeWidth={2}>
          <line x1={px} x2={px} y1={FLOOR_Y} y2={FLOOR_Y + 30} />
          <line x1={px + 80 + (i % 3) * 10} x2={px + 80 + (i % 3) * 10} y1={FLOOR_Y + 30} y2={FLOOR_Y + 62} />
          <line x1={px + 30} x2={px + 30} y1={FLOOR_Y + 62} y2={460} />
        </g>
      ))}
      <line x1={0} x2={2400} y1={FLOOR_Y} y2={FLOOR_Y} {...line} />
    </g>
  );
}

function OuterWalls({ era }: { era: Era }) {
  return (
    <g>
      {/* door, far left */}
      <rect x={110} y={110} width={150} height={FLOOR_Y - 110} rx={4} fill="#C99E70" {...line} />
      <rect x={140} y={140} width={90} height={70} rx={3} fill={era === "new" ? "#CFE8F7" : "#D6D6D2"} {...line} />
      <line x1={185} x2={185} y1={140} y2={210} {...line} strokeWidth={2} />
      <circle cx={236} cy={260} r={7} fill="#F2B33D" {...line} strokeWidth={2.5} />
      <rect x={146} y={226} width={78} height={26} rx={3} fill="#FFFDF8" {...line} strokeWidth={2} />
      <text x={185} y={245} textAnchor="middle" fontSize={17} fill={INK} style={hand}>
        Room 7
      </text>

      {/* coat hooks + backpacks, far right */}
      <line x1={2030} x2={2350} y1={190} y2={190} {...line} strokeWidth={6} stroke="#8C6A4B" />
      {[
        { x: 2070, c: "#4F8AC9" },
        { x: 2170, c: "#E25D4F" },
        { x: 2270, c: "#6DB28A" },
      ].map((b) => (
        <g key={b.x}>
          <path d={`M${b.x} 190 q0 -12 10 -12 q10 0 10 12`} fill="none" {...line} strokeWidth={2.5} />
          <rect x={b.x - 20} y={198} width={60} height={78} rx={18} fill={b.c} {...line} />
          <rect x={b.x - 8} y={236} width={36} height={26} rx={8} fill="none" {...line} strokeWidth={2.5} />
        </g>
      ))}
    </g>
  );
}

function Poster({ era }: { era: Era }) {
  const lines =
    era === "old"
      ? ["1. No talking", "2. Eyes on the board", "3. Copy every note"]
      : ["1. Ask anything", "2. Share your notes", "3. Wrong answers", "    are welcome!"];
  return (
    <g transform="rotate(-2 105 135)">
      <rect x={14} y={66} width={186} height={150} rx={4} fill="#FFFDF8" {...line} />
      <rect x={86} y={58} width={40} height={14} fill="#F6D77A" opacity={0.85} />
      <text x={30} y={98} fontSize={24} fill={era === "old" ? INK : RED} style={hand}>
        {era === "old" ? "Class rules" : "Our rules"}
      </text>
      {lines.map((t, i) => (
        <text key={t} x={30} y={128 + i * 22} fontSize={18} fill={INK} style={hand}>
          {t}
        </text>
      ))}
    </g>
  );
}

function Clock() {
  return (
    <g>
      <circle cx={290} cy={112} r={38} fill="#FFFDF8" {...line} />
      {Array.from({ length: 12 }, (_, i) => {
        const a = (i * Math.PI) / 6;
        return (
          <line
            key={i}
            x1={290 + Math.sin(a) * 30}
            y1={112 - Math.cos(a) * 30}
            x2={290 + Math.sin(a) * 34}
            y2={112 - Math.cos(a) * 34}
            stroke={INK}
            strokeWidth={2}
          />
        );
      })}
      <line x1={290} y1={112} x2={290} y2={88} {...line} />
      <line x1={290} y1={112} x2={306} y2={118} {...line} />
      <circle cx={290} cy={112} r={3} fill={INK} />
    </g>
  );
}

function SideTable({ era }: { era: Era }) {
  return (
    <g>
      <rect x={176} y={292} width={160} height={10} rx={2} fill="#C99E70" {...line} />
      <line x1={190} x2={190} y1={302} y2={FLOOR_Y} {...line} />
      <line x1={322} x2={322} y1={302} y2={FLOOR_Y} {...line} />
      {era === "old" ? (
        <g>
          {Array.from({ length: 9 }, (_, i) => (
            <rect
              key={i}
              x={208 + (i % 3) * 3 - 3}
              y={282 - i * 13}
              width={92}
              height={11}
              fill="#FFFDF8"
              {...line}
              strokeWidth={2}
              transform={`rotate(${(i % 2 ? 2 : -2) + i * 0.6} 254 ${288 - i * 13})`}
            />
          ))}
          <g transform="rotate(-8 300 165)">
            <rect x={262} y={150} width={78} height={28} rx={3} fill="#F6D77A" {...line} strokeWidth={2} />
            <text x={301} y={170} textAnchor="middle" fontSize={18} fill={INK} style={hand}>
              to grade
            </text>
          </g>
        </g>
      ) : (
        <g>
          <path d="M214 292 L208 252 L246 252 L240 292 Z" fill="#E07A4F" {...line} />
          <path d="M227 252 C214 226 200 222 196 206 C214 206 226 222 227 252 Z" fill="#7DBE7A" {...line} strokeWidth={2.5} />
          <path d="M227 252 C232 222 244 210 262 208 C258 228 242 238 227 252 Z" fill="#7DBE7A" {...line} strokeWidth={2.5} />
          <path d="M227 252 C226 226 228 206 232 192" fill="none" {...line} strokeWidth={2.5} />
          <rect x={274} y={262} width={34} height={30} rx={5} fill="#FFFDF8" {...line} />
          <path d="M308 270 q12 0 12 10 q0 8 -12 8" fill="none" {...line} strokeWidth={2.5} />
          <path d="M284 254 q-4 -8 2 -14 M296 254 q-4 -8 2 -14" fill="none" stroke={INK} strokeWidth={2} strokeLinecap="round" />
        </g>
      )}
    </g>
  );
}

function Window({ era }: { era: Era }) {
  return (
    <g>
      <rect x={1290} y={80} width={164} height={164} rx={4} fill={era === "new" ? "#CFE8F7" : "#CDD1D6"} />
      {era === "new" ? (
        <g>
          <circle cx={1410} cy={124} r={22} fill="#F6D77A" {...line} strokeWidth={2.5} />
          <path d="M1318 196 q20 -14 40 0 q16 -10 30 4" fill="#FFFDF8" {...line} strokeWidth={2.5} />
          <path d="M1330 128 q6 -6 12 0 q6 -6 12 0" fill="none" {...line} strokeWidth={2.5} />
        </g>
      ) : (
        <g stroke="#9AA1AA" strokeWidth={2.5} strokeLinecap="round">
          {Array.from({ length: 10 }, (_, i) => (
            <line key={i} x1={1300 + i * 16} y1={96 + (i % 3) * 22} x2={1294 + i * 16} y2={112 + (i % 3) * 22} />
          ))}
          {Array.from({ length: 10 }, (_, i) => (
            <line key={`b${i}`} x1={1306 + i * 16} y1={176 + (i % 2) * 24} x2={1300 + i * 16} y2={192 + (i % 2) * 24} />
          ))}
        </g>
      )}
      <rect x={1290} y={80} width={164} height={164} rx={4} fill="none" {...line} strokeWidth={8} stroke="#8C6A4B" />
      <rect x={1290} y={80} width={164} height={164} rx={4} fill="none" {...line} />
      <line x1={1372} x2={1372} y1={80} y2={244} {...line} strokeWidth={4} />
      <line x1={1290} x2={1454} y1={162} y2={162} {...line} strokeWidth={4} />
      <rect x={1280} y={244} width={184} height={10} rx={2} fill="#C99E70" {...line} />
    </g>
  );
}

function Bookshelf() {
  const books = [
    { w: 14, h: 58, c: "#4F8AC9" },
    { w: 18, h: 64, c: "#E25D4F" },
    { w: 12, h: 52, c: "#F2B33D" },
    { w: 16, h: 60, c: "#6DB28A" },
    { w: 20, h: 48, c: "#8E7CC3" },
  ];
  let bx = 1494;
  return (
    <g>
      <rect x={1484} y={262} width={124} height={FLOOR_Y - 262} fill="#C99E70" {...line} />
      <line x1={1484} x2={1608} y1={322} y2={322} {...line} />
      {books.map((b) => {
        const x = bx;
        bx += b.w + 3;
        return <rect key={x} x={x} y={322 - b.h + 2} width={b.w} height={b.h - 4} fill={b.c} {...line} strokeWidth={2} />;
      })}
      <circle cx={1584} cy={300} r={16} fill="#9CCDEB" {...line} strokeWidth={2.5} />
      <path d="M1574 292 q8 4 6 12 q8 0 12 -6" fill="none" stroke={INK} strokeWidth={2} />
      <line x1={1584} x2={1584} y1={316} y2={322} {...line} />
    </g>
  );
}

/* ---------- the chalkboard ---------- */

function Board({ era, motion }: { era: Era; motion: boolean }) {
  return (
    <g>
      <rect x={372} y={42} width={856} height={236} rx={6} fill="#B98B5A" {...line} />
      <rect x={386} y={56} width={828} height={208} rx={3} fill="#2F4F43" {...line} strokeWidth={2.5} />
      <rect x={400} y={270} width={800} height={10} rx={2} fill="#A87A4C" {...line} strokeWidth={2.5} />
      <rect x={1100} y={262} width={26} height={8} rx={2} fill={CHALK} />
      <rect x={1136} y={262} width={20} height={8} rx={2} fill={CHALK_YELLOW} />
      {era === "old" ? <OldBoard /> : <NewBoard motion={motion} />}
    </g>
  );
}

function OldBoard() {
  const c = { fill: CHALK, style: hand };
  return (
    <g opacity={0.92}>
      <ellipse cx={760} cy={232} rx={70} ry={14} fill={CHALK} opacity={0.08} />
      <ellipse cx={1140} cy={90} rx={50} ry={18} fill={CHALK} opacity={0.07} />
      <text x={560} y={100} fontSize={38} {...c}>
        Ch. 7: The Water Cycle
      </text>
      <path d="M560 112 q170 6 340 -2" fill="none" stroke={CHALK} strokeWidth={2.5} strokeLinecap="round" />
      <text x={560} y={150} fontSize={25} {...c}>
        evaporation, condensation,
      </text>
      <text x={560} y={182} fontSize={25} {...c}>
        precipitation, collection
      </text>
      <text x={560} y={214} fontSize={22} {...c} opacity={0.75}>
        (learn all 4 definitions)
      </text>
      <text x={950} y={150} fontSize={24} {...c} transform="rotate(-3 950 150)">
        Read p. 112 to 140
      </text>
      <text x={958} y={188} fontSize={27} {...c}>
        Copy ALL notes!!
      </text>
      <path d="M958 196 q90 4 180 -2 M962 203 q80 3 170 -1" fill="none" stroke={CHALK} strokeWidth={2} strokeLinecap="round" />
      <g transform="rotate(4 1080 100)">
        <rect x={1012} y={74} width={150} height={40} rx={4} fill="none" stroke={CHALK} strokeWidth={2.5} />
        <text x={1087} y={103} fontSize={26} textAnchor="middle" {...c}>
          Test Friday
        </text>
      </g>
    </g>
  );
}

const DRIP_PATH =
  "M690 236 C650 205 690 160 780 152 C830 148 832 180 834 196 C860 206 896 206 912 226 C880 254 770 258 690 236 Z";

function NewBoard({ motion }: { motion: boolean }) {
  const chalk = { fill: CHALK, style: hand };
  return (
    <g>
      <text x={560} y={98} fontSize={34} fill={CHALK_YELLOW} style={hand}>
        Ch. 7: Drip&apos;s big trip
      </text>

      {/* sun */}
      <g stroke={CHALK_YELLOW} strokeWidth={3} strokeLinecap="round" fill="none">
        <circle cx={598} cy={150} r={18} />
        {Array.from({ length: 8 }, (_, i) => {
          const a = (i * Math.PI) / 4;
          return (
            <line
              key={i}
              x1={598 + Math.cos(a) * 25}
              y1={150 + Math.sin(a) * 25}
              x2={598 + Math.cos(a) * 33}
              y2={150 + Math.sin(a) * 33}
            />
          );
        })}
      </g>

      {/* sea */}
      <path
        d="M566 244 q15 -10 30 0 t30 0 t30 0 t30 0 t30 0 t30 0"
        fill="none"
        stroke={CHALK_BLUE}
        strokeWidth={3}
        strokeLinecap="round"
      />
      <text x={572} y={226} fontSize={18} {...chalk} opacity={0.85}>
        the sea
      </text>

      {/* rising arrow */}
      <path d="M680 222 C664 196 690 174 742 164" fill="none" stroke={CHALK} strokeWidth={2.5} strokeDasharray="6 7" strokeLinecap="round" />
      <path d="M732 158 L744 164 L734 174" fill="none" stroke={CHALK} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />
      <text x={630} y={196} fontSize={18} {...chalk} opacity={0.85} transform="rotate(-18 630 196)">
        warms up
      </text>

      {/* cloud + rain */}
      <path
        d="M772 166 q-20 0 -18 -18 q2 -18 22 -14 q6 -20 28 -14 q18 -6 24 12 q20 0 18 18 q-2 16 -20 16 z"
        fill="none"
        stroke={CHALK}
        strokeWidth={3}
        strokeLinejoin="round"
      />
      <g stroke={CHALK_BLUE} strokeWidth={3} strokeLinecap="round">
        <line x1={790} y1={180} x2={786} y2={196} />
        <line x1={808} y1={184} x2={804} y2={200} />
        <line x1={826} y1={180} x2={822} y2={196} />
      </g>

      {/* mountain + river home */}
      <path d="M862 252 L918 172 L974 252" fill="none" stroke={CHALK_GREEN} strokeWidth={3} strokeLinejoin="round" strokeLinecap="round" />
      <path d="M902 194 L918 172 L934 194 q-8 6 -16 0 q-8 6 -16 0" fill="none" stroke={CHALK} strokeWidth={2.5} strokeLinejoin="round" />
      <path d="M926 246 C880 260 820 258 762 248" fill="none" stroke={CHALK_BLUE} strokeWidth={3} strokeDasharray="8 6" strokeLinecap="round" />
      <path d="M772 242 L760 248 L772 255" fill="none" stroke={CHALK_BLUE} strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" />

      {/* Drip, travelling the loop */}
      <g>
        {!motion && <g transform="translate(800 140)"><DripBody /></g>}
        {motion && (
          <g>
            <DripBody />
            <animateMotion path={DRIP_PATH} dur="9s" repeatCount="indefinite" />
          </g>
        )}
      </g>

      {/* quiz card */}
      <g transform="rotate(2.5 1110 140)">
        <rect x={1020} y={64} width={180} height={150} rx={4} fill="#FFFDF8" {...line} />
        <rect x={1088} y={56} width={44} height={14} fill={CHALK_YELLOW} opacity={0.9} />
        <text x={1036} y={94} fontSize={22} fill={RED} style={hand}>
          Quick quiz
        </text>
        <text x={1036} y={118} fontSize={17} fill={INK} style={hand}>
          What lifts Drip
        </text>
        <text x={1036} y={137} fontSize={17} fill={INK} style={hand}>
          into the sky?
        </text>
        {[
          { t: "the wind", y: 160 },
          { t: "the sun", y: 182, ok: true },
          { t: "a bird", y: 204 },
        ].map((o) => (
          <g key={o.t}>
            {o.ok && <rect x={1034} y={o.y - 13} width={98} height={20} rx={10} fill="#DFF3EA" />}
            <circle cx={1046} cy={o.y - 3} r={6} fill={o.ok ? "#4E9F6E" : "none"} stroke={INK} strokeWidth={2} />
            <text x={1060} y={o.y + 3} fontSize={17} fill={INK} style={hand}>
              {o.t}
            </text>
          </g>
        ))}
        <path d="M1140 176 l6 6 l12 -14" fill="none" stroke="#4E9F6E" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" />
      </g>
    </g>
  );
}

function DripBody() {
  return (
    <g>
      <path d="M0 -18 C7 -8 13 -1 13 6 A13 13 0 1 1 -13 6 C-13 -1 -7 -8 0 -18 Z" fill={CHALK_BLUE} stroke={CHALK} strokeWidth={2.5} strokeLinejoin="round" />
      <circle cx={-4} cy={5} r={2} fill={INK} />
      <circle cx={5} cy={5} r={2} fill={INK} />
      <path d="M-4 11 q4 4 8 0" fill="none" stroke={INK} strokeWidth={1.8} strokeLinecap="round" />
    </g>
  );
}

/* ---------- the teacher ---------- */

function Teacher({ era }: { era: Era }) {
  const skin = "#F0C49B";
  const hair = "#5B3A29";
  const cardigan = era === "new" ? "#E8A33D" : "#9B8E7E";
  const trousers = "#3D5A80";
  return (
    <g transform={`translate(470 ${FLOOR_Y})`}>
      {era === "old" && (
        <g>
          {/* pointer stick to the wall of notes */}
          <line x1={58} y1={-198} x2={124} y2={-250} stroke="#8B5A2B" strokeWidth={5} strokeLinecap="round" />
          <g fill={CHALK} opacity={0.75}>
            <circle cx={132} cy={-256} r={4} />
            <circle cx={140} cy={-246} r={3} />
            <circle cx={126} cy={-264} r={2.5} />
            <circle cx={144} cy={-262} r={2} />
          </g>
        </g>
      )}

      {/* legs + shoes */}
      <path d="M-24 -94 L-26 -8 L-4 -8 L0 -62 L4 -8 L26 -8 L24 -94 Z" fill={trousers} {...line} />
      <ellipse cx={-16} cy={-4} rx={17} ry={7} fill={INK} />
      <ellipse cx={17} cy={-4} rx={17} ry={7} fill={INK} />

      {/* body */}
      <path d="M-36 -96 Q-42 -150 -28 -168 Q0 -180 28 -168 Q42 -150 36 -96 Z" fill={cardigan} {...line} />
      <path d="M-11 -171 L0 -140 L11 -171 Z" fill="#FFFDF8" {...line} strokeWidth={2.5} />
      <line x1={0} y1={-140} x2={0} y2={-98} {...line} strokeWidth={2} />
      <circle cx={-6} cy={-124} r={2.2} fill={INK} />
      <circle cx={-6} cy={-110} r={2.2} fill={INK} />

      {/* head */}
      <rect x={-7} y={-186} width={14} height={16} fill={skin} {...line} strokeWidth={2.5} />
      <circle cx={-20} cy={-246} r={14} fill={hair} {...line} />
      <circle cx={0} cy={-210} r={30} fill={skin} {...line} />
      <path d="M-31 -212 Q-32 -246 0 -244 Q32 -246 31 -212 Q22 -234 2 -232 Q-20 -234 -31 -212 Z" fill={hair} {...line} />
      <circle cx={-10} cy={-208} r={8.5} fill="none" stroke={INK} strokeWidth={2.5} />
      <circle cx={13} cy={-208} r={8.5} fill="none" stroke={INK} strokeWidth={2.5} />
      <line x1={-1.5} y1={-209} x2={4.5} y2={-209} stroke={INK} strokeWidth={2.5} />
      {era === "old" ? (
        <g stroke={INK} strokeWidth={2.5} strokeLinecap="round">
          <line x1={-14} y1={-207} x2={-6} y2={-207} />
          <line x1={9} y1={-207} x2={17} y2={-207} />
          <line x1={-2} y1={-190} x2={10} y2={-191} />
        </g>
      ) : (
        <g>
          <circle cx={-9} cy={-208} r={3} fill={INK} />
          <circle cx={14} cy={-208} r={3} fill={INK} />
          <path d="M-6 -194 Q3 -184 13 -194" fill="#FFFDF8" stroke={INK} strokeWidth={2.5} strokeLinecap="round" />
          <ellipse cx={-20} cy={-196} rx={5} ry={3} fill="#F29A8E" opacity={0.7} />
          <ellipse cx={24} cy={-196} rx={5} ry={3} fill="#F29A8E" opacity={0.7} />
        </g>
      )}

      {/* arms */}
      {era === "old" ? (
        <g>
          <Limb d="M30 -160 L48 -176 L58 -198" color={cardigan} />
          <Palm x={58} y={-199} skin={skin} />
          <Limb d="M-30 -160 L-30 -130 L-4 -128" color={cardigan} />
          <g transform="rotate(-8 -6 -136)">
            <rect x={-26} y={-150} width={44} height={32} rx={2} fill="#7A5A44" {...line} />
            <line x1={-4} y1={-150} x2={-4} y2={-118} stroke={INK} strokeWidth={2} />
          </g>
          <Palm x={-2} y={-128} skin={skin} />
        </g>
      ) : (
        <g>
          <Limb d="M30 -160 L54 -184 L68 -214" color={cardigan} />
          <Palm x={68} y={-216} skin={skin} r={8} />
          <Limb d="M-30 -160 L-30 -132 L-8 -130" color={cardigan} />
          <g transform="rotate(-6 -8 -140)">
            <rect x={-30} y={-162} width={40} height={50} rx={5} fill={INK} />
            <rect x={-26} y={-157} width={32} height={40} rx={2} fill="#DFF3EA" />
            <path d="M-20 -140 l5 5 l10 -12" fill="none" stroke="#4E9F6E" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" />
          </g>
          <Palm x={-6} y={-130} skin={skin} />
        </g>
      )}
    </g>
  );
}

/* ---------- the kids ---------- */

type Pose = "sleep" | "note" | "yawn" | "daydream" | "raise" | "plane" | "tablet" | "know";

type Kid = {
  x: number;
  skin: string;
  hair: string;
  shirt: string;
  pants: string;
  hairStyle: "curly" | "short" | "long" | "pony";
};

function Hair({ kind, color }: { kind: Kid["hairStyle"]; color: string }) {
  const p = { fill: color, ...line, strokeWidth: 2.5 };
  switch (kind) {
    case "curly":
      return (
        <g>
          {[
            [-18, -12],
            [-6, -20],
            [8, -20],
            [18, -12],
            [22, 2],
            [16, 12],
          ].map(([cx, cy]) => (
            <circle key={`${cx}${cy}`} cx={cx} cy={cy} r={11} {...p} />
          ))}
        </g>
      );
    case "long":
      return <path d="M-24 -2 C-26 -30 4 -34 18 -24 C30 -14 30 22 26 36 C14 34 14 20 16 6 C12 -8 4 -12 -6 -12 C-14 -12 -20 -8 -24 -2 Z" {...p} />;
    case "pony":
      return (
        <g>
          <path d="M22 -10 C42 -10 44 14 34 26 C34 12 30 4 22 2 Z" {...p} />
          <path d="M-24 -4 C-26 -28 0 -34 16 -24 C28 -16 26 8 22 12 C18 -2 12 -10 -2 -12 C-12 -14 -20 -10 -24 -4 Z" {...p} />
        </g>
      );
    default:
      return <path d="M-24 -4 C-26 -28 0 -34 16 -24 C28 -16 26 8 22 12 C18 -2 12 -10 -2 -12 C-12 -14 -20 -10 -24 -4 Z" {...p} />;
  }
}

function Face({ mood, look }: { mood: "sleep" | "flat" | "yawn" | "smile" | "open"; look: "left" | "right" }) {
  const ex = look === "left" ? [-14, -3] : [2, 13];
  return (
    <g>
      {mood === "sleep" || mood === "yawn" ? (
        <g fill="none" stroke={INK} strokeWidth={2.2} strokeLinecap="round">
          <path d={`M${ex[0] - 3} -1 q3 3 6 0`} />
          <path d={`M${ex[1] - 3} -1 q3 3 6 0`} />
        </g>
      ) : (
        <g fill={INK}>
          <circle cx={ex[0]} cy={-2} r={2.7} />
          <circle cx={ex[1]} cy={-2} r={2.7} />
        </g>
      )}
      {mood === "smile" && <path d={`M${ex[0] - 2} 9 q6 6 12 0`} fill="#FFFDF8" stroke={INK} strokeWidth={2.2} strokeLinecap="round" />}
      {mood === "open" && <ellipse cx={ex[0] + 4} cy={11} rx={4} ry={5} fill={INK} />}
      {mood === "yawn" && <ellipse cx={ex[0] + 4} cy={11} rx={6} ry={8} fill={INK} />}
      {mood === "flat" && <line x1={ex[0]} y1={11} x2={ex[0] + 8} y2={11} stroke={INK} strokeWidth={2.2} strokeLinecap="round" />}
      {(mood === "smile" || mood === "open") && (
        <g fill="#F29A8E" opacity={0.6}>
          <ellipse cx={ex[0] - 6} cy={6} rx={4} ry={2.5} />
          <ellipse cx={ex[1] + 6} cy={6} rx={4} ry={2.5} />
        </g>
      )}
    </g>
  );
}

function Student({ kid, pose, motion }: { kid: Kid; pose: Pose; motion: boolean }) {
  const { skin, shirt, pants } = kid;
  const sleeping = pose === "sleep";
  const head = sleeping ? { x: -40, y: -100, r: -22 } : { x: 6, y: -136, r: pose === "daydream" ? 6 : 0 };
  const mood =
    pose === "sleep" ? "sleep" : pose === "yawn" ? "yawn" : pose === "note" || pose === "daydream" ? "flat" : pose === "raise" ? "open" : "smile";
  const look = pose === "note" || pose === "daydream" ? "right" : "left";
  const torso = sleeping
    ? "M-6 -46 C-16 -70 -24 -92 -18 -104 C-4 -112 18 -104 22 -94 C28 -76 28 -60 26 -46 Z"
    : "M-8 -46 C-14 -80 -10 -104 2 -112 C14 -118 26 -110 28 -100 C32 -80 28 -60 26 -46 Z";

  return (
    <g transform={`translate(${kid.x} ${FLOOR_Y})`}>
      {/* chair */}
      <rect x={30} y={-108} width={8} height={66} rx={2} fill="#8C6A4B" {...line} strokeWidth={2.5} />
      <line x1={-4} y1={-40} x2={-4} y2={0} {...line} />
      <line x1={34} y1={-40} x2={34} y2={0} {...line} />

      {/* legs */}
      <Limb d="M18 -48 L-30 -50 L-34 -10" color={pants} width={14} />
      <ellipse cx={-40} cy={-5} rx={13} ry={6} fill={INK} />
      <rect x={-10} y={-48} width={46} height={8} rx={2} fill="#A07A56" {...line} strokeWidth={2.5} />

      {/* torso */}
      <path d={torso} fill={shirt} {...line} />

      {/* desk */}
      <rect x={-112} y={-74} width={92} height={30} rx={2} fill="#B88F63" {...line} strokeWidth={2.5} />
      <line x1={-104} y1={-44} x2={-104} y2={0} {...line} />
      <line x1={-28} y1={-44} x2={-28} y2={0} {...line} />
      <rect x={-118} y={-84} width={104} height={10} rx={2} fill="#D4AE80" {...line} />

      {/* head */}
      <g transform={`translate(${head.x} ${head.y}) rotate(${head.r})`}>
        <circle cx={0} cy={0} r={24} fill={skin} {...line} />
        <Hair kind={kid.hairStyle} color={kid.hair} />
        <Face mood={mood} look={look} />
      </g>

      {/* arms + props */}
      {pose === "sleep" && (
        <g>
          <Limb d="M-6 -96 L-34 -84 L-72 -86" color={shirt} width={11} />
          <Note x={-62} y={-114} size={20} color={CHALK} rotate={-10} className="cf-zzz">
            z
          </Note>
          <Note x={-84} y={-122} size={26} color={CHALK} rotate={-10} className="cf-zzz cf-zzz-2">
            z
          </Note>
          <Note x={-110} y={-128} size={30} color={CHALK} rotate={-10} className="cf-zzz cf-zzz-3">
            z
          </Note>
        </g>
      )}
      {pose === "note" && (
        <g>
          <Limb d="M2 -100 L-24 -88 L-56 -88" color={shirt} width={11} />
          <Palm x={-58} y={-88} skin={skin} r={6} />
          <Limb d="M20 -100 L44 -90 L68 -96" color={shirt} width={11} />
          <rect x={66} y={-108} width={18} height={12} rx={1} fill="#FFFDF8" {...line} strokeWidth={2} transform="rotate(-12 75 -102)" />
          <Palm x={68} y={-96} skin={skin} r={6} />
          <Note x={44} y={-130} size={24} color={CHALK}>
            psst!
          </Note>
        </g>
      )}
      {pose === "yawn" && (
        <g>
          <Limb d="M0 -104 L-12 -140 L-8 -170" color={shirt} width={11} />
          <Palm x={-8} y={-172} skin={skin} r={6} />
          <Limb d="M20 -104 L30 -142 L24 -172" color={shirt} width={11} />
          <Palm x={24} y={-174} skin={skin} r={6} />
          <Note x={36} y={-146} size={24} color={CHALK}>
            yaaawn
          </Note>
        </g>
      )}
      {pose === "daydream" && (
        <g>
          <Limb d="M2 -100 L-24 -88 L-56 -88" color={shirt} width={11} />
          <Palm x={-58} y={-88} skin={skin} r={6} />
          <circle cx={36} cy={-166} r={3} fill="#FFFDF8" {...line} strokeWidth={2} />
          <circle cx={46} cy={-180} r={5} fill="#FFFDF8" {...line} strokeWidth={2} />
          <ellipse cx={74} cy={-204} rx={30} ry={18} fill="#FFFDF8" {...line} strokeWidth={2.5} />
          <text x={74} y={-198} textAnchor="middle" fontSize={22} fill={INK} style={hand}>
            ...
          </text>
        </g>
      )}
      {(pose === "raise" || pose === "know") && (
        <g>
          <Limb d="M2 -100 L-24 -88 L-56 -88" color={shirt} width={11} />
          <Palm x={-58} y={-88} skin={skin} r={6} />
          <Limb d="M8 -106 L2 -150 L-2 -192" color={shirt} width={11} />
          <Palm x={-2} y={-196} skin={skin} r={8} />
          {pose === "raise" ? (
            <Note x={-80} y={-214} size={26} color={CHALK_YELLOW}>
              ooh! me!
            </Note>
          ) : (
            <g>
              <Note x={14} y={-206} size={26}>
                I know!
              </Note>
              <Sparkle x={-24} y={-212} s={0.9} />
              <Sparkle x={-30} y={-180} s={0.6} />
            </g>
          )}
        </g>
      )}
      {pose === "plane" && (
        <g>
          <Limb d="M2 -100 L-24 -88 L-56 -88" color={shirt} width={11} />
          <Palm x={-58} y={-88} skin={skin} r={6} />
          <Limb d="M16 -104 L32 -128 L46 -150" color={shirt} width={11} />
          <Palm x={46} y={-152} skin={skin} r={6} />
          <PaperPlane motion={motion} />
        </g>
      )}
      {pose === "tablet" && (
        <g>
          <g transform="rotate(-14 -58 -104)">
            <rect x={-82} y={-124} width={46} height={34} rx={4} fill={INK} />
            <rect x={-78} y={-120} width={38} height={26} rx={2} fill="#DFF3EA" />
            <path d="M-68 -107 l5 5 l10 -12" fill="none" stroke="#4E9F6E" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" />
          </g>
          <Limb d="M4 -100 L-20 -96 L-38 -102" color={shirt} width={11} />
          <Palm x={-40} y={-103} skin={skin} r={6} />
        </g>
      )}
    </g>
  );
}

const PLANE_PATH = "M48 -156 Q110 -230 176 -170";

function PaperPlane({ motion }: { motion: boolean }) {
  const body = (
    <g transform="translate(-14 -8)">
      <path d="M0 0 L30 9 L0 18 L7 9 Z" fill="#FFFDF8" stroke={INK} strokeWidth={2.2} strokeLinejoin="round" />
      <line x1={7} y1={9} x2={30} y2={9} stroke={INK} strokeWidth={1.6} />
      <line x1={4} y1={4} x2={20} y2={7} stroke="#9CCDEB" strokeWidth={1.4} />
    </g>
  );
  if (!motion) {
    return <g transform="translate(112 -200) rotate(-10)">{body}</g>;
  }
  return (
    <g>
      <path d={PLANE_PATH} fill="none" stroke={INK} strokeWidth={1.6} strokeDasharray="3 7" opacity={0.35} />
      <g>
        {body}
        <animateMotion path={PLANE_PATH} dur="3.4s" repeatCount="indefinite" rotate="auto" keyTimes="0;1" keyPoints="0;1" calcMode="spline" keySplines="0.4 0 0.6 1" />
        <animate attributeName="opacity" values="0;1;1;0" keyTimes="0;0.1;0.85;1" dur="3.4s" repeatCount="indefinite" />
      </g>
    </g>
  );
}

const KIDS: Kid[] = [
  { x: 770, skin: "#8D5A3B", hair: "#221A16", shirt: "#4F8AC9", pants: "#2E3F5C", hairStyle: "curly" },
  { x: 940, skin: "#F2C9A0", hair: "#C9822F", shirt: "#E25D4F", pants: "#3D5A80", hairStyle: "short" },
  { x: 1110, skin: "#C68B5E", hair: "#2B2020", shirt: "#6DB28A", pants: "#2E3F5C", hairStyle: "long" },
  { x: 1280, skin: "#E8B48C", hair: "#4A3226", shirt: "#F2B33D", pants: "#3D5A80", hairStyle: "pony" },
];

const POSES: Record<Era, Pose[]> = {
  old: ["sleep", "note", "yawn", "daydream"],
  new: ["tablet", "raise", "plane", "know"],
};

/* ---------- the whole scene ---------- */

export function ClassroomArt({ era, motion, idPrefix }: { era: Era; motion: boolean; idPrefix: string }) {
  const wobble = `${idPrefix}-wobble`;
  return (
    <svg
      viewBox="0 0 2400 460"
      preserveAspectRatio="xMidYMax slice"
      className="absolute inset-0 h-full w-full"
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <filter id={wobble} x="-2%" y="-2%" width="104%" height="104%">
          <feTurbulence type="fractalNoise" baseFrequency="0.025" numOctaves={2} seed={era === "old" ? 4 : 9} />
          <feDisplacementMap in="SourceGraphic" scale={2.6} />
        </filter>
      </defs>
      <g filter={`url(#${wobble})`}>
        <Floor />
        <OuterWalls era={era} />
        <g transform="translate(400 0)">
          <Poster era={era} />
          <Clock />
          <SideTable era={era} />
          <Window era={era} />
          <Bookshelf />
          <Board era={era} motion={motion} />
          {era === "old" ? (
            <Bubble x={292} y={4} w={244} text="...and copy all of this." tailX={420} />
          ) : (
            <Bubble x={286} y={4} w={290} text="So, where does Drip go next?" tailX={420} />
          )}
          <Teacher era={era} />
          {KIDS.map((kid, i) => (
            <Student key={kid.x} kid={kid} pose={POSES[era][i]} motion={motion} />
          ))}
        </g>
      </g>
    </svg>
  );
}
