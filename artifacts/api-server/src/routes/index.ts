import { Router, type IRouter } from "express";
import healthRouter from "./health";
import companiesRouter from "./companies";
import dashboardRouter from "./dashboard";
import portfolioRouter from "./portfolio";
import savedSearchesRouter from "./saved-searches";
import integrationsRouter from "./integrations";
import billingRouter from "./billing";

const router: IRouter = Router();

router.use(healthRouter);
router.use(dashboardRouter);
router.use(companiesRouter);
router.use(savedSearchesRouter);
router.use(portfolioRouter);
router.use(integrationsRouter);
router.use(billingRouter);

export default router;
