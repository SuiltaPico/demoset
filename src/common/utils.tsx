import { VNode, createCommentVNode } from "vue";

export function vnode_if(
  cond: boolean,
  if_true: () => VNode,
  if_false: () => VNode = createCommentVNode
) {
  if (cond) {
    return if_true();
  }
  return if_false();
}

export function get_ramdom_item<T>(arr: T[]) {
  return arr[Math.floor(Math.random() * arr.length)];
}

export type ItemsOf<T extends readonly any[]> = T extends readonly (infer U)[]
  ? U
  : never;

export type UnionToIntersection<T> = (
  T extends any ? (x: T) => any : never
) extends (x: infer R) => any
  ? R
  : never;
