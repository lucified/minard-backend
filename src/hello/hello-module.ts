
export async function fetchSomething() {
  const response = await fetch('http://localhost:8001/something.json');
  const json = response.json();
  return json;
}

export async function fetchSomethingHandler(_request: any, reply: any) {
  const something = await fetchSomething();
  return reply(something);
}
