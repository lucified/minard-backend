import * as http from 'http';
import * as Wreck from 'wreck';

import { promisify } from './promisify';

const wreck = Wreck.defaults({
  timeout: 100,
});
const get = promisify<http.IncomingMessage>(wreck.get, wreck);
const put = promisify<http.IncomingMessage>(wreck.put, wreck);

// The IP below is the IP for the AWS metadata URL
const ec2IpUrl = 'http://169.254.169.254/latest/meta-data/local-ipv4';

export async function registerService(name = 'charles') {

  const registerServiceBaseUrl = process.env.REGISTER_SERVICE;
  if (!registerServiceBaseUrl) {
    console.log('No REGISTER_SERVICE environment variable defined. Skipping registering of service');
    return false;
  }

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
    check = await put(registerServiceBaseUrl + '/' + name);
  } catch (err) {
    return false;
  }
  if (check.statusCode === 200) {
    return true;
  }
  return false;

}
