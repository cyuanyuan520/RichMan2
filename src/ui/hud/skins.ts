import type { GameContent, GameState, PlayerId } from "@/game/core/types";
import type { TokenSkin } from "@/ui/board/TokenLayer";

const TOKEN_ICONS: Record<string, string> = {
  "top-hat": "🎩",
  thimble: "🪡",
  dragon: "🐉",
  lantern: "🏮",
  rocket: "🚀",
  panda: "🐼",
  fox: "🦊",
  tiger: "🐯",
};

export function tokenIcon(tokenId: string): string {
  return TOKEN_ICONS[tokenId] ?? "🎲";
}

export function skinsFor(
  state: GameState,
  content: GameContent,
): Record<PlayerId, TokenSkin> {
  const skins: Record<PlayerId, TokenSkin> = {};
  for (const player of state.players) {
    const character = content.characters[player.characterId];
    skins[player.id] = {
      color: character?.color ?? "#e0b64f",
      avatar: character?.avatar ?? "🎲",
      icon: tokenIcon(player.tokenId),
    };
  }
  return skins;
}
