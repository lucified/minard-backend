
require('isomorphic-fetch');

async function fetchTest() {
  const response = await fetch('http://localhost:8001/something.json');
  const json = response.json();
  return json;
}

fetchTest().then((json : Object) => {
  console.log(json);
});

