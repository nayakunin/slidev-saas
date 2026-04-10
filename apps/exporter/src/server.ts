import { serve } from "@hono/node-server";

import { createExporterApp } from "./app";
import { getEnv } from "./env";

const env = getEnv();
const app = createExporterApp({ env });

serve(
  {
    fetch: app.fetch,
    hostname: env.HOST,
    port: env.PORT,
  },
  () => {
    console.log(
      `[exporter] listening on http://${env.HOST}:${env.PORT} with concurrency ${env.EXPORTER_MAX_CONCURRENT_JOBS}`,
    );
  },
);
