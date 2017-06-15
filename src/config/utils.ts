import { Transform } from 'stream';

export class FilterStream extends Transform {
  private requestFilter: (data: any) => boolean;

  constructor(requestFilter: (data: any) => boolean) {
    const options = {
      objectMode: true,
    };
    super(options);
    this.requestFilter = requestFilter;
  }

  public _transform(data: any, _enc: any, next: any) {
    if (this.requestFilter(data)) {
      return next(null, data);
    }
    next(null);
  }
}
