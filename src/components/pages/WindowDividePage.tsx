import { defineStore } from "pinia";
import { QBtn, QPage } from "quasar";
import { defineComponent, reactive, ref } from "vue";
import { nanoid } from "nanoid";
import poet_songs from "../../assets/poet.song.186000.json";
import { get_ramdom_item } from "../../common/utils";

type WD = {
  id: string;
  title: string;
  content: string;
};

function create_WD(title: string, content: string): WD {
  return { id: nanoid(), title, content };
}

type WindowRef = {
  type: "window";
  id: string;
};

function create_WDRef(wd: WD): WindowRef {
  return {
    type: "window",
    id: wd.id,
  };
}

type LayoutRef = {
  type: "layout";
  id: string;
};

function create_LayoutRef(layout: Layout): LayoutRef {
  return {
    type: "layout",
    id: layout.id,
  };
}

type Layout = {
  id: string;
  type: "row" | "col";
  children: (LayoutRef | WDContainerRef)[];
  weights: number[];
};

type WDContainer = {
  id: string;
  /** WD.id[] */
  children: string[];
  focused: number;
};

type WDContainerRef = {
  type: "WDContainer";
  id: string;
};

function create_WDContainer(): WDContainer {
  return {
    id: nanoid(),
    children: [],
    focused: -1,
  };
}

function create_WDContainerRef(wdc: WDContainer): WDContainerRef {
  return {
    type: "WDContainer",
    id: wdc.id,
  };
}

function create_Layout(): Layout {
  return { id: nanoid(), type: "row", children: [], weights: [] };
}

function push_to_Layout(
  ref: LayoutRef | WDContainerRef,
  weight: number,
  layout: Layout
) {
  layout.children.push(ref);
  layout.weights.push(weight);
}

type WindowContainer = {
  wds: Record<string, WD>;
  wdcs: Record<string, WDContainer>;
  layouts: Record<string, Layout>;
  root_layout: Layout;
};

type Tab = {
  window_id: string;
};

function create_Tab(window_id: string) {
  return {
    window_id,
  };
}

const use_temp_store = defineStore("WindowDividePage", () => {
  const root_layout = create_Layout();

  const wc: WindowContainer = reactive({
    wds: {},
    wdcs: {},
    layouts: {
      [root_layout.id]: root_layout,
    },
    root_layout,
  });

  const api = {
    wc,
    get_wd(id: string) {
      return wc.wds[id];
    },
    get_wdc(id: string) {
      return wc.wdcs[id];
    },
    get_layout(id: string) {
      return wc.layouts[id];
    },
    push_wd(wd: WD) {
      wc.wds[wd.id] = wd;
    },
    create_Layout(parent_layout_id?: string) {
      const layout = create_Layout();
      wc.layouts[layout.id] = layout;
      if (parent_layout_id) {
        const parent_layout = api.get_layout(parent_layout_id);
        push_to_Layout(create_LayoutRef(layout), 1, parent_layout);
      }
      return layout;
    },
    create_WDContainer(layout_id: string) {
      const wdc = create_WDContainer();
      wc.wdcs[wdc.id] = wdc;
      const layout = api.get_layout(layout_id);
      push_to_Layout(create_WDContainerRef(wdc), 1, layout);
      return wdc;
    },
    create_WD(title: string, content: string, wdcs_id: string) {
      const wd = create_WD(title, content);
      api.push_wd(wd);
      const wdcs = api.get_wdc(wdcs_id);
      wdcs.children.push(wd.id);
      return wd;
    },
  };

  return api;
});

export const LayoutRender = defineComponent<{
  layout: Layout;
}>({
  props: ["layout"] as any,
  setup(props, ctx) {
    const ts = use_temp_store();

    return () => {
      const layout = props.layout;
      const weight_sum = layout.weights.reduce((it, prev) => it + prev);
      return (
        <div class={["layout_render", layout.type === "row" ? "frow" : "fcol"]}>
          {layout.children.map((it, index) => {
            if (it.type === "layout") {
              return (
                <LayoutRender layout={ts.get_layout(it.id)}></LayoutRender>
              );
            } else if (it.type === "WDContainer") {
              return (
                <WDContainerRender
                  style={{
                    width: `${(layout.weights[index] / weight_sum) * 100}%`,
                  }}
                  wdc={ts.get_wdc(it.id)}
                ></WDContainerRender>
              );
            }
          })}
        </div>
      );
    };
  },
});

export const WDContainerRender = defineComponent<{
  wdc: WDContainer;
}>({
  props: ["wdc"] as any,
  setup(props, ctx) {
    const ts = use_temp_store();
    const wdc = props.wdc;

    return () => {
      return (
        <div class="WD_container_render wdc fcol">
          <TabBar
            tabs={wdc.children.map((it) => create_Tab(it))}
            focused={wdc.focused}
            onFocus={(index) => {
              wdc.focused = index;
            }}
          ></TabBar>
          <div>
            {wdc.focused >= 0 ? (
              ts.get_wd(wdc.children[wdc.focused]).content
            ) : (
              <div></div>
            )}
          </div>
        </div>
      );
    };
  },
});

export const WDRender = defineComponent<{
  wd: WD;
}>({
  props: ["wd"] as any,
  setup(props, ctx) {
    return () => {
      const wd = props.wd;
      return <div class="wd_render">{wd.content}</div>;
    };
  },
});

export const TabBar = defineComponent<
  {
    tabs: Tab[];
    focused: number;
  },
  {},
  {},
  {},
  {},
  {},
  {},
  {
    focus: (index: number) => void;
  }
>({
  props: ["tabs", "focused"] as any,
  emits: ["focus"],
  setup(props, ctx) {
    function handle_drop(e: DragEvent) {
      e.stopPropagation();
    }

    return () => {
      return (
        <div
          class="tab_bar frow w-full h-fit bg-neutral-300 gap-[1px]"
          onDrop={handle_drop}
        >
          {props.tabs.map((it, index) => (
            <Tab
              tab={it}
              focused={props.focused === index}
              onFocus={() => {
                ctx.emit("focus", index);
              }}
            ></Tab>
          ))}
        </div>
      );
    };
  },
});

export const Tab = defineComponent<
  {
    tab: Tab;
    focused: boolean;
  },
  {},
  {},
  {},
  {},
  {},
  {},
  {
    focus: () => void;
  }
>({
  props: ["tab", "focused"] as any,
  emits: ["focus"],
  setup(props, ctx) {
    const ts = use_temp_store();

    const tab_el = ref<HTMLDivElement>();

    function handle_dragstart(ev: DragEvent) {
      const el = tab_el.value!;
      el.style.opacity = "0.5";
    }

    function handle_dragend(ev: DragEvent) {
      const el = tab_el.value!;
      el.style.opacity = "1";
    }

    return () => {
      const wd = ts.get_wd(props.tab.window_id);

      return (
        <div
          class={[
            "tab frow gap-2 items-center min-w-[4rem] h-full p-2 cursor-pointer select-none",
            props.focused ? "bg-neutral-200" : "bg-neutral-400",
          ]}
          key={wd.id}
          onClick={() => {
            ctx.emit("focus");
          }}
          draggable
          onDragstart={handle_dragstart}
          onDragend={handle_dragend}
          ref={tab_el}
        >
          <div>{wd.title}</div>
          <QBtn flat icon="mdi-close" round size="0.5rem"></QBtn>
        </div>
      );
    };
  },
});

export const WindowDividePage = defineComponent({
  setup() {
    const ts = use_temp_store();
    const root_layout = ts.wc.root_layout;

    const main_wdc = ts.create_WDContainer(root_layout.id);

    return () => {
      return (
        <QPage {...({ class: "page fcol w-full h-full" } as any)}>
          <div class="p-4">
            <QBtn
              onClick={() => {
                const poet = get_ramdom_item(poet_songs);

                const wd = ts.create_WD(
                  poet.title,
                  poet.paragraphs.join("\n"),
                  main_wdc.id
                );

                main_wdc.focused = main_wdc.children.length - 1;
              }}
            >
              添加页面
            </QBtn>
          </div>
          <LayoutRender
            layout={ts.wc.root_layout}
            class="w-full grow"
          ></LayoutRender>
        </QPage>
      );
    };
  },
});
