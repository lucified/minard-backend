
declare module "webshot" {
  function webshot(url: string, path: string, callback: (err: any) => void) : void;
  namespace webshot {}
  export = webshot;
}
