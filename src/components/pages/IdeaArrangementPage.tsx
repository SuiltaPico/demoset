import { useMouse } from "@vueuse/core";
import { nanoid } from "nanoid";
import { defineStore } from "pinia";
import { QBtn, QSkeleton } from "quasar";
import {
  Ref,
  RendererNode,
  Transition,
  TransitionGroup,
  computed,
  defineComponent,
  onMounted,
  reactive,
  ref,
  watch,
} from "vue";
import { ItemsOf, UnionToIntersection, vnode_if } from "../../common/utils";
import { cloneDeep, defer, isEqual } from "lodash";

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

interface RenderTaskLeaf extends TaskLeaf {}

const create_TaskLeaf = combine(
  object_factory<TaskLeaf>()(["name"], [["status", () => "unstarted"]]),
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

interface RenderTaskTree extends Identifiable {
  type: "tree";
  name: string;
  children: (RenderTaskTree | RenderTaskLeaf | RenderPlaceholder)[];
}

interface RenderPlaceholder extends Identifiable {
  type: "placeholder";
  name?: string;
  status?: TaskStatus;
}

const create_RenderPlaceholder: () => RenderPlaceholder = combine(
  () =>
    ({
      type: "placeholder",
    } as const),
  create_Identifiable
);

type RenderTaskNode = RenderTaskLeaf | RenderTaskTree | RenderPlaceholder;

const create_TaskTree = combine(
  object_factory<TaskTree>()(["name"], [["children", () => []]]),
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
  const id_to_container_rect_map = ref<Record<string, DOMRect>>({});
  const id_to_api_map = ref<
    Record<
      string,
      {
        get_rect(): DOMRect;
        get_container_rect(): DOMRect | undefined;
      }
    >
  >({});
  const id_to_node_map = ref<Record<string, TaskNode>>({});
  const selected_queue: (() => void)[] = reactive([]);
  const moving = ref(false);
  const moving_id = ref("");
  const moving_index = ref<number[]>([]);
  const moving_offset = reactive({
    x: 0,
    y: 0,
  });
  const container = ref<HTMLDivElement>();
  const root_task_tree = reactive(create_TaskTree("[root]"));
  const mouse = useMouse();
  const mouse_place = computed(() => {
    const moving_rect = id_to_rect_map.value[moving_id.value];
    return {
      // x: mouse.x.value - (container.value?.offsetLeft ?? 0),
      // y: mouse.y.value - (container.value?.offsetTop ?? 0),
      x: mouse.x.value - moving_offset.x,
      y: mouse.y.value - moving_offset.y + (moving_rect?.height ?? 0) / 2,
    };
  });

  /** 节点是否在矩形底部上方。 */
  function in_rect_up_side(xy: { x: number; y: number }, rect: DOMRect) {
    if (xy.y < rect.bottom) {
      return true;
    } else {
      return false;
    }
  }

  /** 判断点相对于矩形的方位：左边、矩形内、右边 */
  function get_relative_position(xy: { x: number; y: number }, rect: DOMRect) {
    if (xy.x < rect.left) {
      return "left";
    } else if (xy.x > rect.right) {
      return "right";
    } else {
      return "inside";
    }
  }

  function get_mouse_on_node(
    node: TaskNode,
    pre: number[] = [],
    prev_node_indexes: Ref<number[]> = ref([])
  ):
    | { index: number[]; y: ReturnType<typeof get_relative_position> }
    | undefined {
    const mp = mouse_place.value;

    if (moving_id.value === node.id) return;

    const rect = id_to_rect_map.value[node.id];

    if (rect === undefined) {
      prev_node_indexes.value = [...pre];
      return;
    }

    if (in_rect_up_side(mp, rect)) {
      prev_node_indexes.value = [...pre];
      return { index: pre, y: get_relative_position(mp, rect) };
    }

    if (node.type === "leaf") {
      prev_node_indexes.value = [...pre];
      return;
    }

    prev_node_indexes.value = [...pre];

    const children = node.children;
    for (let index = 0; index < children.length; index++) {
      const new_pre = [...pre];
      new_pre.push(index);
      const child = children[index];
      const result = get_mouse_on_node(child, new_pre, prev_node_indexes);
      if (result !== undefined) {
        return result;
      }
      new_pre.pop();
    }
  }

  const mouse_on_node_index = computed(() => {
    const children = root_task_tree.children;
    let last_y_right_index: undefined | number[];

    for (let i = 0; i < children.length; i++) {
      const child = children[i];

      const result = get_mouse_on_node(child, [i]);
      if (result === undefined) continue;

      if (result.y === "inside") {
        return result.index;
      } else if (result.y === "left") {
        return last_y_right_index;
      } else {
        last_y_right_index = result.index;
      }
    }
    if (last_y_right_index) {
      return last_y_right_index;
    }
    return undefined;
  });

  function delete_indexes(node: RenderTaskNode, indexes?: number[]) {
    if (node.type !== "tree" || indexes === undefined || indexes.length === 0)
      return;
    if (indexes.length === 1) {
      node.children.splice(indexes[0], 1);
    } else {
      const child = node.children[indexes[0]];
      delete_indexes(child, indexes.slice(1));
    }
  }

  function add_to_indexes(
    new_node: RenderTaskNode,
    node: RenderTaskNode,
    indexes?: number[]
  ) {
    if (node.type !== "tree" || indexes === undefined || indexes.length === 0)
      return;
    if (indexes.length === 1) {
      node.children.splice(indexes[0], 0, new_node);
    } else {
      const child = node.children[indexes[0]];
      add_to_indexes(new_node, child, indexes.slice(1));
    }
  }

  let indexes: number[] | undefined;

  const placeholder = reactive(create_RenderPlaceholder());

  const root_render_tree = computed(() => {
    const render_trees: RenderTaskTree = cloneDeep(root_task_tree);

    function process_moving() {
      if (moving.value) {
        const new_indexes = mouse_on_node_index.value;

        // if (isEqual(indexes, new_indexes)) return;
        // else {
        // delete_indexes(render_trees, indexes);
        add_to_indexes(placeholder, render_trees, new_indexes);
        indexes = new_indexes;
        // }
      } else {
        // delete_indexes(render_trees, indexes);
        indexes = undefined;
      }
    }

    process_moving();

    return render_trees;
  });

  return {
    container,
    id_to_rect_map,
    id_to_api_map,
    id_to_node_map,
    mouse_on_node_index,
    selected_queue,
    root_task_tree,
    root_render_tree,
    set_moving(
      value: boolean,
      opt?: {
        moving_id: string;
        offset: { x: number; y: number };
        source_indexes: number[];
      }
    ) {
      if (value === true) {
        if (opt) {
          moving_id.value = opt.moving_id;
          moving_offset.x = opt.offset.x;
          moving_offset.y = opt.offset.y;

          const node = id_to_node_map.value[opt.moving_id];
          placeholder.name = node.name;
          placeholder.status = get_TaskNode_status(node);

          moving_index.value = opt.source_indexes;
        }
        defer(() => {
          Object.entries(id_to_api_map.value).map(([id, api]) => {
            id_to_rect_map.value[id] = api.get_rect();
          });
        });
      } else {
        const source_node = id_to_node_map.value[moving_id.value];
        delete_indexes(root_task_tree, moving_index.value);
        add_to_indexes(source_node, root_task_tree, mouse_on_node_index.value);
      }

      moving.value = value;
    },
  };
});

type RenderTaskNodeCompoProps = {
  modelValue: RenderTaskNode;
  indexes: number[];
};

export const RenderTaskNodeCompo = defineComponent<RenderTaskNodeCompoProps>({
  props: ["modelValue", "indexes"] as any,
  setup(props, ctx) {
    return () => {
      const task_node = props.modelValue;
      if (task_node.type === "tree") {
        return (
          <TaskTreeRender
            modelValue={task_node}
            key={task_node.id}
            indexes={props.indexes}
          ></TaskTreeRender>
        );
      } else if (task_node.type === "leaf") {
        return (
          <TaskLeafRender
            modelValue={task_node}
            key={task_node.id}
            indexes={props.indexes}
          ></TaskLeafRender>
        );
      } else if (task_node.type === "placeholder") {
        return (
          <RenderPlaceholderCompo
            modelValue={task_node}
            key={task_node.id}
          ></RenderPlaceholderCompo>
        );
      }
    };
  },
});

type RenderPlaceholderCompoProps = {
  modelValue: RenderPlaceholder;
};

export const RenderPlaceholderCompo =
  defineComponent<RenderPlaceholderCompoProps>({
    props: ["modelValue"] as any,
    setup(props, ctx) {
      return () => {
        const ph = props.modelValue;
        return (
          <div class="min-h-10 bg-sky-100 shadow border border-sky-600 rounded frow gap-2 items-center px-4 py-2">
            <div
              class={[
                get_color_from_status(ph.status ?? "ongoing"),
                "rounded-full w-2 h-2",
              ]}
            ></div>
            {vnode_if(
              ph.name !== undefined,
              () => (
                <div>{ph.name}</div>
              ),
              () => (
                <QSkeleton animation="none"></QSkeleton>
              )
            )}
          </div>
        );
      };
    },
  });

type TaskTreeRenderProps = {
  modelValue: RenderTaskTree;
  indexes: number[];
};
export const TaskTreeRender = defineComponent<TaskTreeRenderProps>({
  props: ["modelValue", "indexes"] as any,
  setup(props, ctx) {
    const ias = use_ia_store();
    const render_task_tree = props.modelValue;
    const task_tree = ias.id_to_node_map[render_task_tree.id];

    const box_el = ref<HTMLDivElement>();
    const container_el = ref<HTMLDivElement>();

    onMounted(() => {
      ias.id_to_api_map[render_task_tree.id] = {
        get_rect() {
          return box_el.value!.getBoundingClientRect();
        },
        get_container_rect() {
          return container_el.value!.getBoundingClientRect();
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

      ias.set_moving(true, {
        moving_id: props.modelValue.id,
        offset: {
          x: offset_x.value,
          y: offset_y.value,
        },
        source_indexes: props.indexes,
      });

      move.value = true;
      e.stopImmediatePropagation();
    }

    return () => {
      const render_task_tree = props.modelValue;
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
          ref={container_el}
        >
          <div
            class={[
              "frow gap-2 items-center bg-zinc-50 px-4 py-2 rounded shadow cursor-pointer",
              move.value ? `border border-sky-200` : "",
            ]}
            onMousedown={handle_mouse_down}
            ref={box_el}
          >
            <div
              class={[
                get_color_from_status(get_TaskNode_status(task_tree)),
                "rounded-full w-2 h-2",
              ]}
            ></div>
            <div>{render_task_tree.name}</div>
          </div>
          <div class="fcol gap-4 pl-6">
            {render_task_tree.children.map((it, index) => (
              <RenderTaskNodeCompo
                modelValue={it}
                key={it.id}
                indexes={(() => {
                  const new_indexes = props.indexes.slice();
                  new_indexes.push(index);
                  return new_indexes;
                })()}
              ></RenderTaskNodeCompo>
            ))}
          </div>
        </div>
      );
    };
  },
});

type TaskLeafRenderProps = {
  modelValue: RenderTaskLeaf;
  indexes: number[];
};
export const TaskLeafRender = defineComponent<TaskLeafRenderProps>({
  props: ["modelValue", "indexes"] as any,
  setup(props, ctx) {
    const ias = use_ia_store();
    const render_task_leaf = props.modelValue;

    const box_el = ref<HTMLDivElement>();

    onMounted(() => {
      ias.id_to_api_map[render_task_leaf.id] = {
        get_rect() {
          return box_el.value!.getBoundingClientRect();
        },
        get_container_rect() {
          return undefined;
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
      ias.set_moving(true, {
        moving_id: props.modelValue.id,
        offset: {
          x: offset_x.value,
          y: offset_y.value,
        },
        source_indexes: props.indexes,
      });
      move.value = true;
      e.stopImmediatePropagation();
    }
    return () => {
      const render_task_leaf = props.modelValue;
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
            class={[
              "frow gap-2 items-center bg-zinc-50 px-4 py-2 rounded shadow",
              move.value ? "" : "",
            ]}
            ref={box_el}
          >
            <div
              class={[
                get_color_from_status(render_task_leaf.status),
                "rounded-full w-2 h-2",
              ]}
            ></div>
            <div>{render_task_leaf.name}</div>
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

    function _create_TaskTree(...args: Parameters<typeof create_TaskTree>) {
      const result = create_TaskTree.apply(undefined, args);
      ias.id_to_node_map[result.id] = result;
      return result;
    }

    function _create_TaskLeaf(...args: Parameters<typeof create_TaskLeaf>) {
      const result = create_TaskLeaf.apply(undefined, args);
      ias.id_to_node_map[result.id] = result;
      return result;
    }

    function cancel_move_status() {
      ias.selected_queue.forEach((it) => it());
      ias.set_moving(false);
    }

    onMounted(() => {
      window.addEventListener("mouseleave", cancel_move_status);
      window.addEventListener("mouseup", cancel_move_status);
      ias.container = node_container_el.value;
    });

    root_task_tree.children.push(
      _create_TaskTree("做饭", [
        _create_TaskTree(
          "去市场买菜",
          ["西红柿", "洋葱", "牛肉"].map((it) => _create_TaskLeaf(it))
        ),
        _create_TaskTree(
          "处理菜",
          ["处理西红柿", "处理洋葱", "处理牛肉"].map((it) =>
            _create_TaskLeaf(it)
          )
        ),
        _create_TaskTree(
          "烹饪、煮饭",
          ["拿小盘子装西红柿汤", "拿碟子洋葱炒牛肉"].map((it) =>
            _create_TaskLeaf(it)
          )
        ),
        _create_TaskTree(
          "装盘",
          ["拿小盘子装西红柿汤", "拿碟子洋葱炒牛肉"].map((it) =>
            _create_TaskLeaf(it)
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
            {ias.root_render_tree.children.map((it, index) => (
              <RenderTaskNodeCompo
                modelValue={it}
                indexes={[index]}
                key={it.id}
              ></RenderTaskNodeCompo>
            ))}
          </div>
        </div>
      );
    };
  },
});
