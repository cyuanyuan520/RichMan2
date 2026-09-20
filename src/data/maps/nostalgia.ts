import type { GroupDef, MapTheme } from "@/game/core/types";
import { assembleMap } from "./blueprint";

const groups: GroupDef[] = [
  { id: "nostalgia-a", name: "城南旧事", color: "#a1887f", tier: 1 },
  { id: "nostalgia-b", name: "工业记忆", color: "#7ec8e3", tier: 2 },
  { id: "nostalgia-c", name: "老街时光", color: "#e07a9a", tier: 3 },
  { id: "nostalgia-d", name: "大院岁月", color: "#ef9a3d", tier: 4 },
  { id: "nostalgia-e", name: "文体青春", color: "#d64545", tier: 5 },
  { id: "nostalgia-f", name: "枢纽变迁", color: "#e8c547", tier: 6 },
  { id: "nostalgia-g", name: "市井烟火", color: "#4caf7d", tier: 7 },
  { id: "nostalgia-h", name: "繁华中心", color: "#4f6fd8", tier: 8 },
];

const theme: MapTheme = {
  backgroundImage: "/assets/maps/nostalgia-table.webp",
  backgroundSize: "cover",
  boardArea: { top: 13, left: 15, width: 70, height: 74 },
  accent: "#d98f3d",
  accentSoft: "#f0c98d",
  boardBg: "rgba(250,241,222,0.93)",
  boardBorder: "#7a5230",
  panelBg: "rgba(43,29,19,0.86)",
  panelText: "#f7e8cf",
};

export const nostalgiaMap = assembleMap({
  id: "nostalgia",
  name: "老街旧梦",
  description: "木桌上的旧时光，从老码头到市中心，买下整条记忆里的街。",
  layout: "ring",
  tags: ["经典", "怀旧"],
  theme,
  groups,
  names: {
    properties: [
      "老码头",
      "石板巷",
      "纺织厂",
      "供销社",
      "工人文化宫",
      "老电影院",
      "国营饭店",
      "百货大楼",
      "邮电局",
      "新华书店",
      "人民公园",
      "少年宫",
      "体育馆",
      "老街茶馆",
      "火车站前",
      "钟鼓楼",
      "大转盘",
      "江畔夜市",
      "商业步行街",
      "老字号酒楼",
      "市中心广场",
      "迎宾大道",
    ],
    transport: ["公交总站", "老火车站", "长途汽车站", "渡口"],
    utility: ["供电所", "自来水公司"],
    corners: {
      start: "起点站",
      jail: "派出所",
      hospital: "职工医院",
      gotoJail: "进局子",
    },
    chance: "机遇",
    fate: "命运",
    shop: "小卖部",
    lottery: "彩票摊",
    tax: ["市场管理费", "高档消费"],
  },
});
