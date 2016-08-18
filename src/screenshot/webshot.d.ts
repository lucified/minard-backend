
declare module 'webshot' {
  function webshot(url: string, path: string, options: any, callback: (err: any) => void): void;
  namespace webshot {} // tslint:disable-line
  export = webshot;
}
