/* tslint:disable only-arrow-functions */

export function promisify<T>(original: any, settings?: any) {

  return function (...args: any[]) {

    let target: any;
    if (settings && settings.thisArg) {
      target = settings.thisArg;
    } else if (settings) {
      target = settings;
    }

    // Return the promisified function
    return new Promise<T>(function (resolve, reject) {

      // Append the callback bound to the context
      args.push(function callback(err: any, ...values: any[]) {
        if (err) {
          return reject(err);
        }
        return resolve(values[0] as T);
      });

      // Call the function
      original.apply(target, args);

    });
  };
};
