import * as http from 'http';
import * as Wreck from 'wreck';

import { promisify } from './promisify';

const wreck = Wreck.defaults({
  timeout: 100,
});
const get = promisify<http.IncomingMessage>(wreck.get, wreck);
const put = promisify<http.IncomingMessage>(wreck.put, wreck);

const ec2IpUrl = 'http://169.254.169.254/latest/meta-data/local-ipv4';

const def = (key: string, otherwise: string) => process.env[key] ? process.env[key] : otherwise;

const REGISTER_SERVICE = def('REGISTER_SERVICE', 'http://register-service:1234');

export async function registerService(name = 'charles') {

  let check: http.IncomingMessage;
  try {
    check = await get(ec2IpUrl);
  } catch (err) {
    return false;
  }
  if (check.statusCode !== 200) {
    return false;
  }

  try {
    check = await put(REGISTER_SERVICE + '/' + name);
  } catch (err) {
    return false;
  }
  if (check.statusCode === 200) {
    return true;
  }
  return false;

}
