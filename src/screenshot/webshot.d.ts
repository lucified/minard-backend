
declare module "webshot" {
  function webshot(url: string, path: string, optiona: any, callback: (err: any) => void) : void;
  namespace webshot {}
  export = webshot;
}
