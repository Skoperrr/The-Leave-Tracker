import { Router } from "express";
import { authenticatedAccount } from "../middleware/auth.js";
import { validate } from "../middleware/validate.js";
import { insightsQuery, type InsightsQuery } from "../validators/insights.js";
import type { InsightsService } from "../services/insights.js";
import { ApiError } from "../utils/api-error.js";
export type InsightsRouterServices = { insights?: InsightsService };
// Mount after the existing authenticate middleware; no alternate bearer parser.
export function createInsightsRouter(services?: InsightsRouterServices) {
  const router = Router();
  router.get(
    "/insights",
    validate(insightsQuery, "query"),
    async (_request, response) => {
      response.set("Cache-Control", "no-store");
      const actor = authenticatedAccount(response);
      if (!actor)
        throw new ApiError(401, "UNAUTHENTICATED", "Sign in to view insights");
      if (!services?.insights)
        throw new ApiError(
          503,
          "INSIGHTS_NOT_CONFIGURED",
          "Insights are not configured",
        );
      response.json({
        data: await services.insights.report(
          actor.id,
          response.locals.validated as InsightsQuery,
        ),
      });
    },
  );
  return router;
}
