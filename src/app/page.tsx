import Image from "next/image";
import { maps } from "@/data/content";
import { characters, items } from "@/data/content";
import { chanceCards, fateCards } from "@/data/content/cards";
import { validateContent } from "@/data/content";

export default function HomePage() {
  validateContent();
  const stats = [
    { label: "地图", value: maps.length },
    { label: "格子", value: maps[0]?.tiles.length ?? 0 },
    { label: "机遇卡", value: chanceCards.length },
    { label: "命运卡", value: fateCards.length },
    { label: "道具", value: items.length },
    { label: "角色", value: characters.length },
  ];

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-6xl flex-col gap-10 px-6 py-14">
      <header className="flex flex-col items-center gap-4 text-center">
        <p className="text-sm tracking-[0.5em] text-gold-400/80">
          RICHMAN · 神州风云
        </p>
        <h1 className="font-display gold-text text-6xl font-bold tracking-wide">
          大富翁
        </h1>
        <p className="max-w-2xl text-base text-paper-100/70">
          现代网页版大富翁：国风地图、道具卡与角色技能、PeerJS
          实时联机。引擎与内容完全数据驱动，可持续扩展新地图、新卡牌与新规则。
        </p>
      </header>

      <section className="grid grid-cols-3 gap-6">
        {maps.map((map) => (
          <article
            key={map.id}
            className="panel group relative overflow-hidden transition-transform duration-300 hover:-translate-y-1"
          >
            <div className="relative h-44 w-full">
              <Image
                src={map.theme.backgroundImage}
                alt={map.name}
                fill
                sizes="33vw"
                className="object-cover transition-transform duration-500 group-hover:scale-105"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-ink-950/90 to-transparent" />
              <div className="absolute bottom-3 left-4">
                <h2 className="font-display text-2xl text-paper-50">
                  {map.name}
                </h2>
                <p className="text-xs text-paper-100/70">{map.tags.join(" · ")}</p>
              </div>
            </div>
            <p className="px-4 py-4 text-sm text-paper-100/70">
              {map.description}
            </p>
          </article>
        ))}
      </section>

      <section className="panel grid grid-cols-6 divide-x divide-white/5">
        {stats.map((stat) => (
          <div key={stat.label} className="flex flex-col items-center gap-1 py-5">
            <span className="font-display text-3xl text-gold-400">
              {stat.value}
            </span>
            <span className="text-xs tracking-widest text-paper-100/60">
              {stat.label}
            </span>
          </div>
        ))}
      </section>

      <footer className="text-center text-xs text-paper-100/40">
        Next.js · TypeScript · Tailwind CSS · PeerJS — 开发进行中，完整玩法即将上线
      </footer>
    </main>
  );
}
