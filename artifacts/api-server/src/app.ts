import express, { type Express } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import router from "./routes";
import { createStripeWebhookRouter } from "./lib/stripe-webhook-route";
import { logger } from "./lib/logger";

const app: Express = express();

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (origin) {
    let allowed = origin === process.env.WEB_ORIGIN;
    try { const url = new URL(origin); allowed ||= !process.env.WEB_ORIGIN && ['127.0.0.1', 'localhost'].includes(url.hostname) && ['http:', 'https:'].includes(url.protocol); } catch {}
    if (!allowed) return res.status(403).json({ error: 'This browser origin is not allowed.' });
  }
  return next();
});
app.use(cors({ origin: true }));

app.use(createStripeWebhookRouter());

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use("/api", router);

export default app;
