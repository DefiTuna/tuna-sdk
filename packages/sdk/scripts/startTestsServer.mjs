import { startVitest } from "vitest/node";
import express from 'express';

const app = express();
const port = process.env.PORT || 3000;

let isHealthy = true;

const runTests = async () => {
  console.log("Running tests");
  const vitest = await startVitest(
    "test",
    [],
    {
      run: false,
    },
    {
      test: {
        watch: false,
        testTimeout: 10000,
        silent: true,
        ui: false,
        cache: false,
      },
    },
    {},
  );
  const testModules = vitest.state.getTestModules();
  let isOk = testModules.every(testModule => testModule.ok())
  if (isOk) {
    console.log("All tests passed");
  } else {
    console.error("Some tests have failed");
  }
  return isOk;
};



app.get('/healthcheck', (_req, res) => {
  if (isHealthy) {
    return res.send("Ok");
  }

  res.status(500).send("Last test run has failed");
})

app.listen(port, () => {
  setInterval(
    async () => {
      const result = await runTests();
      isHealthy = result
    },
    // Run every 5 mintues
    5 * 60 * 1000
  )
  
  console.log(`Tests server is listening on port ${port}`)
})

