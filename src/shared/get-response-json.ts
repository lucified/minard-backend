import { create } from 'boom';
import { Response } from 'node-fetch';

export default async function getResponseJson<T>(
  response: Response,
  requiredStatus = 200,
): Promise<T> {
  const responseBody = await response.text();
  let json: any;
  try {
    json = JSON.parse(responseBody);
  } catch (error) {
    // No need to handle here
  }
  if (response.status !== requiredStatus) {
    const msgParts = [
      `Got ${response.status} instead of ${requiredStatus}`,
      response.url,
      responseBody,
    ];
    throw create(response.status, msgParts.join(`\n\n`));
  }
  if (!json) {
    const msgParts = [
      `Unable to parse json`,
      `${response.url} => ${response.status}`,
      responseBody,
    ];
    throw create(response.status, msgParts.join(`\n\n`));
  }
  return json;
}
