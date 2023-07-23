import { RouteRecordRaw } from "vue-router";
import { EchartsDemoPage } from "../components/pages/EchartsDemoPage";
import { WindowDividePage } from "../components/pages/WindowDividePage";
import { CSSPage } from "../components/pages/CSSPage";

const routes: RouteRecordRaw[] = [
  {
    name: "index",
    path: "/",
    component: () => import("../components/pages/index.vue"),
  },
  {
    name: "echarts-demo",
    path: "/echarts-demo",
    component: () => Promise.resolve(EchartsDemoPage),
  },
  {
    name: "window-divide",
    path: "/window-divide",
    component: () => Promise.resolve(WindowDividePage),
  },
  {
    name: "css",
    path: "/css",
    component: () => Promise.resolve(CSSPage),
  },
  {
    name: "idea arrangement",
    path: "/idea_arrangement",
    component: async () =>
      (await import("../components/pages/IdeaArrangementPage"))
        .IdeaArrangementPage,
  },
];

export default routes;
