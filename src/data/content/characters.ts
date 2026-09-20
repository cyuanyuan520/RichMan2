import type { CharacterDef } from "@/game/core/types";
import { asCharacterId } from "@/game/core/ids";

export const characterDefs: CharacterDef[] = [
  {
    id: asCharacterId("cai-shen"),
    name: "财神爷",
    title: "招财进宝",
    text: "被动：每次途经起点，额外获得 1000 元。",
    avatar: "🧧",
    color: "#c9a227",
    skills: [
      {
        id: "cai-shen-passive",
        name: "招财进宝",
        text: "途经起点额外 +1000 元。",
        icon: "🧧",
        trigger: "pass-start",
        value: 1000,
      },
    ],
  },
  {
    id: asCharacterId("xue-ba"),
    name: "学霸",
    title: "精打细算",
    text: "被动：买地与升级费用减少 15%。",
    avatar: "🎓",
    color: "#4f6fd8",
    skills: [
      {
        id: "xue-ba-buy",
        name: "精打细算",
        text: "买地费用 -15%。",
        icon: "📐",
        trigger: "buy-discount",
        value: 0.15,
      },
      {
        id: "xue-ba-upgrade",
        name: "工程预算",
        text: "升级费用 -15%。",
        icon: "📏",
        trigger: "upgrade-discount",
        value: 0.15,
      },
    ],
  },
  {
    id: asCharacterId("ming-yi"),
    name: "名医",
    title: "妙手回春",
    text: "被动：住院回合减少 1；主动：立即出狱一次。",
    avatar: "🩺",
    color: "#4caf7d",
    skills: [
      {
        id: "ming-yi-passive",
        name: "妙手回春",
        text: "住院回合 -1。",
        icon: "💊",
        trigger: "hospital-reduce",
        value: 1,
      },
      {
        id: "ming-yi-active",
        name: "特需通道",
        text: "立即脱离监狱，每局一次。",
        icon: "🏥",
        trigger: "active",
        charges: 1,
        effects: [{ kind: "get-out-of-jail" }],
      },
    ],
  },
  {
    id: asCharacterId("jin-li"),
    name: "锦鲤",
    title: "好运连连",
    text: "被动：命运卡与税费的负面金额减半。",
    avatar: "🐟",
    color: "#e07a9a",
    skills: [
      {
        id: "jin-li-passive",
        name: "好运连连",
        text: "负面金额减半。",
        icon: "🍀",
        trigger: "negative-card-mitigation",
        value: 0.5,
      },
    ],
  },
  {
    id: asCharacterId("xiong-hai-zi"),
    name: "熊孩子",
    title: "恶作剧",
    text: "主动：向每位对手收取 300 元，冷却 3 回合。",
    avatar: "🧸",
    color: "#ef9a3d",
    skills: [
      {
        id: "xiong-hai-zi-active",
        name: "恶作剧",
        text: "每位对手支付 300 元，冷却 3 回合。",
        icon: "😜",
        trigger: "active",
        cooldownRounds: 3,
        effects: [{ kind: "collect-from-each", amount: 300 }],
      },
    ],
  },
  {
    id: asCharacterId("pi-xiu"),
    name: "貔貅",
    title: "只进不出",
    text: "被动：收到的过路费增加 15%。",
    avatar: "🦁",
    color: "#d64545",
    skills: [
      {
        id: "pi-xiu-passive",
        name: "只进不出",
        text: "收租 +15%。",
        icon: "💰",
        trigger: "rent-bonus",
        value: 0.15,
      },
    ],
  },
];

export const tokenDefs = [
  { id: "top-hat", name: "礼帽", icon: "🎩" },
  { id: "thimble", name: "顶针", icon: "🪡" },
  { id: "dragon", name: "祥龙", icon: "🐉" },
  { id: "lantern", name: "灯笼", icon: "🏮" },
  { id: "rocket", name: "火箭", icon: "🚀" },
  { id: "panda", name: "熊猫", icon: "🐼" },
  { id: "fox", name: "灵狐", icon: "🦊" },
  { id: "tiger", name: "萌虎", icon: "🐯" },
] as const;
