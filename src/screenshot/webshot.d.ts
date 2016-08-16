
declare module "webshot" {
  function webshot(url: string, path: string): Promise<void>;
  namespace webshot {}
  export = webshot;
}
