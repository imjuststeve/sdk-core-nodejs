declare module 'merge' {
  export function clone(input: any): any;
  export function recursive(clone: any, ...args: any[]): any;
  export default function merge(clone: any, ...args: any[]): any
}