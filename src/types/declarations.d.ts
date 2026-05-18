declare module '*.sql' {
  const content: string;
  export default content;
}

declare module '*.ttf' {
  const resource: number;
  export default resource;
}
