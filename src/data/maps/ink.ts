import type { GroupDef, MapTheme } from "@/game/core/types";
import { assembleMap } from "./blueprint";

const groups: GroupDef[] = [
  { id: "ink-a", name: "雪域高原", color: "#a1887f", tier: 1 },
  { id: "ink-b", name: "塞外长风", color: "#7ec8e3", tier: 2 },
  { id: "ink-c", name: "关东雪原", color: "#e07a9a", tier: 3 },
  { id: "ink-d", name: "渤海之滨", color: "#ef9a3d", tier: 4 },
  { id: "ink-e", name: "天府之国", color: "#d64545", tier: 5 },
  { id: "ink-f", name: "荆楚中原", color: "#e8c547", tier: 6 },
  { id: "ink-g", name: "岭南烟雨", color: "#4caf7d", tier: 7 },
  { id: "ink-h", name: "京沪风华", color: "#4f6fd8", tier: 8 },
];

const theme: MapTheme = {
  backgroundImage: "/assets/maps/ink-frame.webp",
  backgroundSize: "cover",
  boardArea: { top: 13, left: 15, width: 70, height: 74 },
  accent: "#c9a227",
  accentSoft: "#e6cf8a",
  boardBg: "rgba(246,236,214,0.92)",
  boardBorder: "#8c6b3f",
  panelBg: "rgba(27,38,48,0.86)",
  panelText: "#f5ead3",
};

export const inkMap = assembleMap({
  id: "ink",
  name: "水墨江南",
  description: "宣纸画卷上的神州名城，落子如泼墨，置业如题跋。",
  layout: "ring",
  tags: ["经典", "国风"],
  theme,
  groups,
  names: {
    properties: [
      "拉萨",
      "银川",
      "呼和浩特",
      "兰州",
      "西宁",
      "长春",
      "哈尔滨",
      "沈阳",
      "天津",
      "大连",
      "青岛",
      "西安",
      "成都",
      "重庆",
      "长沙",
      "武汉",
      "郑州",
      "广州",
      "深圳",
      "杭州",
      "上海",
      "北京",
    ],
    transport: ["高铁站", "国际机场", "远洋港口", "江畔码头"],
    utility: ["国家电网", "自来水厂"],
    corners: {
      start: "起点",
      jail: "监狱",
      hospital: "医院",
      gotoJail: "入狱",
    },
    chance: "机遇",
    fate: "命运",
    shop: "道具店",
    lottery: "彩票行",
    tax: ["所得税", "奢侈税"],
  },
});
