import { BoomError } from 'boom';
import { Response } from 'hapi';

export function maskErrors(response: Response) {
  if (response.isBoom) {
    const boomError = (response as any) as BoomError;
    const { output } = boomError;
    if (output.statusCode >= 401 && output.statusCode < 500) {
      output.statusCode = 404;
      boomError.reformat();
    }
    const _output = output as any;
    _output.payload = {
      errors: [
        {
          title: output.payload.error,
          status: output.statusCode,
          detail: '',
        },
      ],
    };
  }
}
