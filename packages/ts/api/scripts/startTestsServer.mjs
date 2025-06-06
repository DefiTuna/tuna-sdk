import { startVitest } from "vitest/node";
import express from "express";

const app = express();
const port = process.env.PORT || 3000;

let isHealthy = true;
let lastTestCompletionDate = null;

const runTests = async () => {
  try {
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
    let isOk = testModules.every(testModule => testModule.ok());
    if (isOk) {
      console.log("All tests passed");
    } else {
      console.error("Some tests have failed");
    }

    isHealthy = isOk;
    lastTestCompletionDate = new Date();
  } catch (e) {
    console.error(e);
    isHealthy = false;
  }
};

app.get("/healthcheck", (_req, res) => {
  const now = new Date();
  const elapsedMinutesSinceLastTest = (now.getTime() - lastTestCompletionDate.getTime()) / (1000 * 60);

  if (isHealthy && elapsedMinutesSinceLastTest < 10) {
    return res.send("Ok");
  }

  res.status(500).send("Last test run has failed");
});

const start = async () => {
  await runTests();

  app.listen(port, () => {
    setInterval(
      () => {
        runTests();
      },
      // Run every 5 mintues
      5 * 60 * 1000,
    );

    console.log(`Tests server is listening on port ${port}`);
  });
};

start();
