import { nanoid } from "nanoid";
import { defineComponent } from "vue";
import { ItemsOf, UnionToIntersection } from "../../common/utils";
import { QBtn } from "quasar";

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

export const TaskNodeRender = (task_node: TaskNode) => {
  if (task_node.type === "tree") {
    return TaskTreeRender(task_node);
  } else {
    return TaskLeafRender(task_node);
  }
};

export const TaskTreeRender = (task_tree: TaskTree) => {
  return (
    <div draggable style={{}}>
      <div
        class={[
          get_color_from_status(get_TaskNode_status(task_tree)),
          "rounded-full w-4 h-4",
        ]}
      ></div>
      <div>{task_tree.name}</div>
      <div>{task_tree.children.map((it) => TaskNodeRender(it))}</div>
    </div>
  );
};

export const TaskLeafRender = (task_leaf: TaskLeaf) => {
  return (
    <div draggable style={{}}>
      <div
        class={[
          get_color_from_status(task_leaf.status),
          "rounded-full w-4 h-4",
        ]}
      ></div>
      <div>{task_leaf.name}</div>
    </div>
  );
};

export const IdeaArrangementPage = defineComponent({
  setup() {
    const root_task_tree = create_TaskTree("[root]");

    root_task_tree.children.push(create_TaskTree("大扫除"));

    return () => {
      return (
        <div class="page">
          <div>
            <QBtn>添加游离节点</QBtn>
          </div>
          <div>{root_task_tree.children.map((it) => TaskNodeRender(it))}</div>
        </div>
      );
    };
  },
});
