import { bindings, defineConfig, defineWorker } from "cf/config";

export default defineConfig({
  worker: defineWorker({
    name: "samjoe-food-web",
    entrypoint: "vinext/server/fetch-handler",
    compatibilityDate: "2026-10-11",
    compatibilityFlags: ["nodejs_compat"],
    workersDev: true,
    domains: [
      "app.confeitaria.samjoe.com.br",
      "lojas.samjoe.com.br",
    ],
    assets: { notFoundHandling: "none" },
    limits: {
      cpuMs: 1_000,
      subrequests: 100,
    },
    env: {
      ASSETS: bindings.assets(),
      HYPERDRIVE: bindings.hyperdrive({
        id: "803d550b5efa4df2b0c303d0b524cae9",
      }),
      SALES_ENGINE: bindings.worker({
        worker: "samjoe-sales-engine",
      }),
    },
  }),
});
