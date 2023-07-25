import { nanoid } from "nanoid";
import {
  computed,
  defineComponent,
  onMounted,
  reactive,
  readonly,
  ref,
  watch,
} from "vue";
import { ItemsOf, UnionToIntersection } from "../../common/utils";
import { QBtn } from "quasar";
import { useMouse } from "@vueuse/core";
import { defineStore } from "pinia";

function combine<
  const T extends (...arg: any) => any,
  const TOthers extends readonly (() => any)[]
>(first: T, ...others: TOthers) {
  return function (...args: Parameters<T>) {
    let result: any = first.apply(undefined, args);
    for (let index = 0; index < others.length; index++) {
      result = { ...result, ...others[index]() };
    }
    return result as ReturnType<T> &
      UnionToIntersection<ReturnType<ItemsOf<TOthers>>>;
  };
}

/** 对象工厂函数，通过绑定参数即可创建一个对象 */
function object_factory<TReferenceType>() {
  return function <
    const TRequired extends readonly (keyof TReferenceType)[],
    const TOptional extends readonly (
      | readonly [keyof TReferenceType, () => any]
      | readonly [keyof TReferenceType]
    )[] = []
  >(required: TRequired, optional?: TOptional) {
    return function name(
      ...args: [
        ...{ [K in keyof TRequired]: TReferenceType[TRequired[K]] },
        ...Partial<{
          [K in keyof TOptional]: TReferenceType[TOptional[K][0]];
        }>
      ]
    ) {
      let result: Partial<TReferenceType> = {};
      const required_len = required.length;
      for (let index = 0; index < required_len; index++) {
        result[required[index]] = args[index] as any;
      }
      if (optional) {
        let index = required_len;
        for (
          ;
          index < required_len + optional.length && index < args.length;
          index++
        ) {
          result[optional[index - required_len][0]] = args[index] as any;
        }
        for (; index < required_len + optional.length; index++) {
          const o = optional[index - required_len];
          result[o[0]] = o[1] === undefined ? undefined : o[1]();
        }
      }
      return result as {
        [K in TRequired[number]]: TReferenceType[K];
      } & {
        [K in TOptional[number][0]]: TReferenceType[K];
      };
    };
  };
}

function preorder_traversal<TChild>(
  processor: (child: TChild) => void,
  get_children: () => TChild[] | undefined
) {
  return function traversal(tree: TChild) {
    processor(tree);
    const children = get_children();
    if (children === undefined) return;

    for (let index = 0; index < children.length; index++) {
      traversal(children[index]);
    }
  };
}

interface Identifiable {
  id: string;
}

const create_Identifiable = object_factory<Identifiable>()(
  [],
  [["id", () => nanoid()]]
);
create_Identifiable();

type TaskStatus = "finished" | "ongoing" | "unstarted" | "internal error";
type TaskNode = TaskLeaf | TaskTree;

interface TaskLeaf extends Identifiable {
  type: "leaf";
  name: string;
  status: TaskStatus;
}

interface RenderTaskLeaf extends TaskLeaf {
  drag_rect?: DOMRect;
}

const create_TaskLeaf = combine(
  object_factory<RenderTaskLeaf>()(["name"], [["status", () => "unstarted"]]),
  create_Identifiable,
  () =>
    ({
      type: "leaf",
    } as const)
);

interface TaskTree extends Identifiable {
  type: "tree";
  name: string;
  children: (TaskTree | TaskLeaf)[];
}

interface RenderTaskTree extends TaskTree {
  drag_rect?: DOMRect;
}

const create_TaskTree = combine(
  object_factory<RenderTaskTree>()(["name"], [["children", () => []]]),
  create_Identifiable,
  () =>
    ({
      type: "tree",
    } as const)
);

function get_TaskNode_status(task_node: TaskNode) {
  if (task_node.type === "leaf") {
    return task_node.status;
  }
  const children = task_node.children;
  if (children.length === 0) {
    return "internal error";
  }
  let all_finished = true,
    all_unstarted = true;
  for (let index = 0; index < children.length; index++) {
    const child = children[index];
    const status = get_TaskNode_status(child);
    if (status !== "finished") {
      all_finished = false;
    }
    if (status !== "unstarted") {
      all_unstarted = false;
    }
  }
  if (all_finished) {
    return "finished";
  } else if (all_unstarted) {
    return "unstarted";
  } else {
    return "ongoing";
  }
}

function get_color_from_status(status: TaskStatus) {
  if (status === "unstarted") {
    return "bg-red-500";
  } else if (status === "ongoing") {
    return "bg-blue-500";
  } else if (status === "finished") {
    return "bg-green-500";
  }
  return "";
}

const use_ia_store = defineStore("idea_arrangement_store", () => {
  const id_to_rect_map = ref<Record<string, DOMRect>>({});
  const id_to_api_map = ref<
    Record<
      string,
      {
        get_rect(): DOMRect;
      }
    >
  >({});
  const selected_queue: (() => void)[] = reactive([]);
  const moving = ref(false);
  const moving_id = ref("");
  const container = ref<HTMLDivElement>();
  const root_task_tree = create_TaskTree("[root]");
  const mouse = useMouse();
  const mouse_place = computed(() => {
    return {
      x: mouse.x.value - (container.value?.offsetLeft ?? 0),
      y: mouse.y.value - (container.value?.offsetTop ?? 0),
    };
  });
  /** 节点是否在矩形底部上方。 */
  function in_rect_up_side(xy: { x: number; y: number }, rect: DOMRect) {
    if (xy.x >= rect.left && xy.x <= rect.right && xy.y < rect.top) {
      return true;
    } else {
      return false;
    }
  }
  function get_mouse_on_node(
    node: TaskNode,
    pre: number[] = []
  ): number[] | undefined {
    const mp = mouse_place.value;
    if (in_rect_up_side(mp, id_to_rect_map.value[node.id])) {
      return pre;
    }

    if (node.type === "leaf") return;

    const children = node.children;
    for (let index = 0; index < children.length; index++) {
      const new_pre = [...pre];
      new_pre.push(index);
      const child = children[index];
      const result = get_mouse_on_node(child, new_pre);
      if (result !== undefined) {
        return result;
      }
      new_pre.pop();
    }
  }

  const mouse_on_node_index = computed(() => {
    for (let index = 0; index < array.length; index++) {
      const element = array[index];
      
    }
  });

  const root_render_tree = computed(() => {
    return root_task_tree;
  });

  watch(moving, (new_value: boolean) => {
    if (new_value === true) {
      Object.entries(id_to_api_map.value).map(([id, api]) => {
        id_to_rect_map.value[id] = api.get_rect();
      });
      console.log(id_to_rect_map.value);
    }
  });

  return {
    container,
    id_to_rect_map,
    id_to_api_map,
    selected_queue,
    moving,
    moving_id,
    root_task_tree,
  };
});

export const TaskNodeRender = (task_node: TaskNode) => {
  if (task_node.type === "tree") {
    return <TaskTreeRender modelValue={task_node}></TaskTreeRender>;
  } else {
    return <TaskLeafRender modelValue={task_node}></TaskLeafRender>;
  }
};

type TaskTreeRenderProps = {
  modelValue: TaskTree;
};
export const TaskTreeRender = defineComponent<TaskTreeRenderProps>({
  props: ["modelValue"] as any,
  setup(props, ctx) {
    const ias = use_ia_store();
    const task_tree = props.modelValue;

    const box_el = ref<HTMLDivElement>();

    onMounted(() => {
      ias.id_to_api_map[task_tree.id] = {
        get_rect() {
          return box_el.value!.getBoundingClientRect();
        },
      };
    });

    const move = ref(false);
    const mouse = useMouse();
    const x = mouse.x;
    const y = mouse.y;
    const offset_x = ref(0);
    const offset_y = ref(0);

    function handle_mouse_down(e: MouseEvent) {
      const rect = (e.target as HTMLElement).getBoundingClientRect();
      offset_x.value = e.clientX - rect.left;
      offset_y.value = e.clientY - rect.top;

      ias.selected_queue.push(() => {
        move.value = false;
      });

      ias.moving = true;
      ias.moving_id = task_tree.id;

      move.value = true;
      e.stopImmediatePropagation();
    }

    return () => {
      return (
        <div
          class={[
            "fcol select-none gap-4 min-w-[200px]",
            move.value ? `absolute catched` : "",
          ]}
          style={{
            left: `${
              x.value - offset_x.value - (ias.container?.offsetLeft ?? 0)
            }px`,
            top: `${
              y.value - offset_y.value - (ias.container?.offsetTop ?? 0)
            }px`,
          }}
        >
          <div
            class="frow gap-2 items-center bg-zinc-50 px-4 py-2 rounded shadow cursor-pointer"
            onMousedown={handle_mouse_down}
            ref={box_el}
          >
            <div
              class={[
                get_color_from_status(get_TaskNode_status(task_tree)),
                "rounded-full w-2 h-2",
              ]}
            ></div>
            <div>{task_tree.name}</div>
          </div>
          <div class="fcol gap-4 pl-6">
            {task_tree.children.map((it) => TaskNodeRender(it))}
          </div>
        </div>
      );
    };
  },
});

type TaskLeafRenderProps = {
  modelValue: TaskLeaf;
};
export const TaskLeafRender = defineComponent<TaskLeafRenderProps>({
  props: ["modelValue"] as any,
  setup(props, ctx) {
    const ias = use_ia_store();
    const task_leaf = props.modelValue;

    const box_el = ref<HTMLDivElement>();

    onMounted(() => {
      ias.id_to_api_map[task_leaf.id] = {
        get_rect() {
          return box_el.value!.getBoundingClientRect();
        },
      };
    });

    const move = ref(false);
    const mouse = useMouse();
    const x = mouse.x;
    const y = mouse.y;
    const offset_x = ref(0);
    const offset_y = ref(0);

    function handle_mouse_down(e: MouseEvent) {
      const rect = (e.target as HTMLElement).getBoundingClientRect();
      offset_x.value = e.clientX - rect.left;
      offset_y.value = e.clientY - rect.top;

      ias.selected_queue.push(() => {
        move.value = false;
      });

      move.value = true;
      ias.moving = true;
      e.stopImmediatePropagation();
    }
    return () => {
      return (
        <div
          class={[
            "fcol select-none gap-4 min-w-[200px] cursor-pointer",
            move.value ? `absolute` : "",
          ]}
          style={{
            left: `${
              x.value - offset_x.value - (ias.container?.offsetLeft ?? 0)
            }px`,
            top: `${
              y.value - offset_y.value - (ias.container?.offsetTop ?? 0)
            }px`,
          }}
          onMousedown={handle_mouse_down}
        >
          <div
            class="frow gap-2 items-center bg-zinc-50 px-4 py-2 rounded shadow"
            ref={box_el}
          >
            <div
              class={[
                get_color_from_status(task_leaf.status),
                "rounded-full w-2 h-2",
              ]}
            ></div>
            <div>{task_leaf.name}</div>
          </div>
        </div>
      );
    };
  },
});

export const IdeaArrangementPage = defineComponent({
  setup() {
    const ias = use_ia_store();

    const root_task_tree = ias.root_task_tree;

    const node_container_el = ref<HTMLDivElement>();

    function cancel_move_status() {
      ias.selected_queue.forEach((it) => it());
      ias.moving = false;
    }

    onMounted(() => {
      window.addEventListener("mouseleave", cancel_move_status);
      window.addEventListener("mouseup", cancel_move_status);
      ias.container = node_container_el.value;
    });

    root_task_tree.children.push(
      create_TaskTree("做饭", [
        create_TaskTree(
          "去市场买菜",
          ["西红柿", "洋葱", "牛肉"].map((it) => create_TaskLeaf(it))
        ),
        create_TaskTree(
          "处理菜",
          ["处理西红柿", "处理洋葱", "处理牛肉"].map((it) =>
            create_TaskLeaf(it)
          )
        ),
        create_TaskTree(
          "烹饪、煮饭",
          ["拿小盘子装西红柿汤", "拿碟子洋葱炒牛肉"].map((it) =>
            create_TaskLeaf(it)
          )
        ),
        create_TaskTree(
          "装盘",
          ["拿小盘子装西红柿汤", "拿碟子洋葱炒牛肉"].map((it) =>
            create_TaskLeaf(it)
          )
        ),
      ])
    );

    return () => {
      return (
        <div class="page w-full h-full fcol bg-neutral-200 p-4 gap-4">
          <div>
            <QBtn>添加游离节点</QBtn>
          </div>
          <div class="frow gap-4 relative flex-wrap" ref={node_container_el}>
            {root_task_tree.children.map((it) => TaskNodeRender(it))}
          </div>
        </div>
      );
    };
  },
});
